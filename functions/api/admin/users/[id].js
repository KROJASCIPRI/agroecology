import { getAdminSession } from "../../../lib/admin.js";
import { hashPassword } from "../../../lib/password.js";

function parseUserId(value) {
    if (!/^\d+$/.test(value || "")) {
        return null;
    }

    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isDuplicateEmailError(error) {
    return String(error?.message || "").includes(
        "UNIQUE constraint failed: users.email"
    );
}

function isAdminRole(role) {
    return Number(role?.id) === 1 ||
        String(role?.nombre || "").toLocaleLowerCase("es").includes("administrador");
}

async function readJsonBody(request) {
    try {
        const body = await request.json();

        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return {
                error: Response.json(
                    { success: false, message: "El cuerpo debe ser un objeto JSON." },
                    { status: 400 }
                )
            };
        }

        return { body };
    } catch {
        return {
            error: Response.json(
                { success: false, message: "El cuerpo debe ser JSON válido." },
                { status: 400 }
            )
        };
    }
}

async function closeUserSessions(db, userId) {
    await db
        .prepare(
            `
            UPDATE sessions
            SET
                fin = datetime('now'),
                duracion = CAST(
                    (julianday('now') - julianday(inicio)) * 86400
                    AS INTEGER
                ),
                motivo_fin = 'usuario_desactivado'
            WHERE user_id = ?
              AND fin IS NULL
            `
        )
        .bind(userId)
        .run();
}

async function activeAdministratorCount(db) {
    const result = await db
        .prepare(
            `
            SELECT COUNT(*) AS total
            FROM users u
            INNER JOIN roles r ON r.id = u.rol_id
            WHERE u.estado = 1
              AND r.estado = 1
              AND (r.id = 1 OR LOWER(r.nombre) LIKE '%administrador%')
            `
        )
        .first();

    return Number(result?.total || 0);
}

export async function onRequestPatch({ request, env, params }) {
    const authorization = await getAdminSession(request, env);

    if (authorization.response) {
        return authorization.response;
    }

    const id = parseUserId(params.id);

    if (!id) {
        return Response.json(
            { success: false, message: "El identificador del usuario no es válido." },
            { status: 400 }
        );
    }

    const parsed = await readJsonBody(request);

    if (parsed.error) {
        return parsed.error;
    }

    const body = parsed.body;
    const allowedFields = new Set(["nombre", "email", "rol_id", "estado", "password"]);
    const unknownFields = Object.keys(body).filter((field) => !allowedFields.has(field));

    if (unknownFields.length) {
        return Response.json(
            { success: false, message: "La solicitud contiene campos no permitidos." },
            { status: 422 }
        );
    }

    const db = env.agroecology_db;
    const currentUser = await db
        .prepare(
            `
            SELECT u.id, u.nombre, u.email, u.rol_id, u.estado, r.nombre AS rol_nombre
            FROM users u
            INNER JOIN roles r ON r.id = u.rol_id
            WHERE u.id = ?
            `
        )
        .bind(id)
        .first();

    if (!currentUser) {
        return Response.json(
            { success: false, message: "No se encontró el usuario." },
            { status: 404 }
        );
    }

    const updates = [];
    const values = [];

    if (Object.hasOwn(body, "nombre")) {
        const nombre = String(body.nombre || "").trim();

        if (!nombre || nombre.length > 120) {
            return Response.json(
                { success: false, message: "El nombre es obligatorio y debe tener máximo 120 caracteres." },
                { status: 422 }
            );
        }

        updates.push("nombre = ?");
        values.push(nombre);
    }

    if (Object.hasOwn(body, "email")) {
        const email = String(body.email || "").trim().toLowerCase();

        if (email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return Response.json(
                { success: false, message: "Ingresa un correo electrónico válido de máximo 190 caracteres." },
                { status: 422 }
            );
        }

        updates.push("email = ?");
        values.push(email);
    }

    let nextRole = { id: currentUser.rol_id, nombre: currentUser.rol_nombre };

    if (Object.hasOwn(body, "rol_id")) {
        const roleId = Number(body.rol_id);

        if (!Number.isSafeInteger(roleId) || roleId < 1) {
            return Response.json(
                { success: false, message: "Selecciona un rol válido." },
                { status: 422 }
            );
        }

        nextRole = await db
            .prepare("SELECT id, nombre FROM roles WHERE id = ? AND estado = 1")
            .bind(roleId)
            .first();

        if (!nextRole) {
            return Response.json(
                { success: false, message: "El rol seleccionado no existe o está inactivo." },
                { status: 422 }
            );
        }

        updates.push("rol_id = ?");
        values.push(roleId);
    }

    let nextStatus = Number(currentUser.estado);

    if (Object.hasOwn(body, "estado")) {
        nextStatus = Number(body.estado);

        if (![0, 1].includes(nextStatus)) {
            return Response.json(
                { success: false, message: "El estado debe ser 1 (activo) o 0 (inactivo)." },
                { status: 422 }
            );
        }

        updates.push("estado = ?");
        values.push(nextStatus);
    }

    if (Object.hasOwn(body, "password")) {
        const password = String(body.password || "");

        if (password.length < 8 || password.length > 128) {
            return Response.json(
                { success: false, message: "La contraseña debe tener entre 8 y 128 caracteres." },
                { status: 422 }
            );
        }

        updates.push("password = ?");
        values.push(await hashPassword(password));
    }

    if (!updates.length) {
        return Response.json(
            { success: false, message: "No se recibieron cambios para guardar." },
            { status: 422 }
        );
    }

    const isCurrentAdmin = isAdminRole({ id: currentUser.rol_id, nombre: currentUser.rol_nombre });
    const remainsAdmin = isAdminRole(nextRole) && nextStatus === 1;
    const editingSelf = Number(authorization.user.user_id) === id;

    if (editingSelf && isCurrentAdmin && !remainsAdmin) {
        return Response.json(
            { success: false, message: "No puedes desactivar ni retirar el rol administrador de tu propia cuenta." },
            { status: 409 }
        );
    }

    if (isCurrentAdmin && Number(currentUser.estado) === 1 && !remainsAdmin) {
        if (await activeAdministratorCount(db) <= 1) {
            return Response.json(
                { success: false, message: "No se puede retirar el último administrador activo." },
                { status: 409 }
            );
        }
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    try {
        const result = await db
            .prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
            .bind(...values)
            .run();

        if (!result.meta.changes) {
            return Response.json(
                { success: false, message: "No se encontró el usuario." },
                { status: 404 }
            );
        }

        if (nextStatus === 0) {
            await closeUserSessions(db, id);
        }

        const user = await db
            .prepare(
                `
                SELECT
                    u.id,
                    u.nombre,
                    u.email,
                    u.rol_id,
                    u.estado,
                    u.created_at,
                    u.updated_at,
                    r.nombre AS rol_nombre
                FROM users u
                INNER JOIN roles r ON r.id = u.rol_id
                WHERE u.id = ?
                `
            )
            .bind(id)
            .first();

        return Response.json({ success: true, user });
    } catch (error) {
        if (isDuplicateEmailError(error)) {
            return Response.json(
                { success: false, message: "Ya existe un usuario con ese correo." },
                { status: 409 }
            );
        }

        console.error("Admin user update error:", error);

        return Response.json(
            { success: false, message: "No fue posible actualizar el usuario." },
            { status: 500 }
        );
    }
}

export async function onRequestDelete({ request, env, params }) {
    const authorization = await getAdminSession(request, env);

    if (authorization.response) {
        return authorization.response;
    }

    const id = parseUserId(params.id);

    if (!id) {
        return Response.json(
            { success: false, message: "El identificador del usuario no es válido." },
            { status: 400 }
        );
    }

    const db = env.agroecology_db;
    const user = await db
        .prepare(
            `
            SELECT u.id, u.rol_id, u.estado, r.nombre AS rol_nombre
            FROM users u
            INNER JOIN roles r ON r.id = u.rol_id
            WHERE u.id = ?
            `
        )
        .bind(id)
        .first();

    if (!user) {
        return Response.json(
            { success: false, message: "No se encontró el usuario." },
            { status: 404 }
        );
    }

    if (Number(authorization.user.user_id) === id) {
        return Response.json(
            { success: false, message: "No puedes desactivar tu propia cuenta." },
            { status: 409 }
        );
    }

    if (Number(user.estado) === 1 && isAdminRole({ id: user.rol_id, nombre: user.rol_nombre })) {
        if (await activeAdministratorCount(db) <= 1) {
            return Response.json(
                { success: false, message: "No se puede desactivar el último administrador activo." },
                { status: 409 }
            );
        }
    }

    try {
        await db
            .prepare(
                `
                UPDATE users
                SET estado = 0, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `
            )
            .bind(id)
            .run();

        await closeUserSessions(db, id);

        return Response.json({
            success: true,
            id,
            message: "El usuario fue desactivado. Su historial se conservó."
        });
    } catch (error) {
        console.error("Admin user deactivation error:", error);

        return Response.json(
            { success: false, message: "No fue posible desactivar el usuario." },
            { status: 500 }
        );
    }
}
