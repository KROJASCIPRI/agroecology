import { getAdminSession } from "../../lib/admin.js";
import { hashPassword } from "../../lib/password.js";

function isDuplicateEmailError(error) {
    return String(error?.message || "").includes(
        "UNIQUE constraint failed: users.email"
    );
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

function validateUser(body) {
    const nombre = String(body.nombre || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const rolId = Number(body.rol_id);
    const estado = body.estado === undefined ? 1 : Number(body.estado);

    if (!nombre || nombre.length > 120) {
        return { error: "El nombre es obligatorio y debe tener máximo 120 caracteres." };
    }

    if (email.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: "Ingresa un correo electrónico válido de máximo 190 caracteres." };
    }

    if (password.length < 8 || password.length > 128) {
        return { error: "La contraseña debe tener entre 8 y 128 caracteres." };
    }

    if (!Number.isSafeInteger(rolId) || rolId < 1) {
        return { error: "Selecciona un rol válido." };
    }

    if (![0, 1].includes(estado)) {
        return { error: "El estado debe ser 1 (activo) o 0 (inactivo)." };
    }

    return { nombre, email, password, rolId, estado };
}

async function isActiveRole(db, roleId) {
    return db
        .prepare("SELECT id FROM roles WHERE id = ? AND estado = 1")
        .bind(roleId)
        .first();
}

export async function onRequestGet({ request, env }) {
    const authorization = await getAdminSession(request, env);

    if (authorization.response) {
        return authorization.response;
    }

    try {
        const result = await env.agroecology_db
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
                INNER JOIN roles r
                    ON r.id = u.rol_id
                ORDER BY u.created_at DESC, u.id DESC
                `
            )
            .all();

        return Response.json({
            success: true,
            users: result.results
        });
    } catch (error) {
        console.error("Admin users list error:", error);

        return Response.json(
            { success: false, message: "No fue posible consultar los usuarios." },
            { status: 500 }
        );
    }
}

export async function onRequestPost({ request, env }) {
    const authorization = await getAdminSession(request, env);

    if (authorization.response) {
        return authorization.response;
    }

    const parsed = await readJsonBody(request);

    if (parsed.error) {
        return parsed.error;
    }

    const input = validateUser(parsed.body);

    if (input.error) {
        return Response.json(
            { success: false, message: input.error },
            { status: 422 }
        );
    }

    try {
        const role = await isActiveRole(env.agroecology_db, input.rolId);

        if (!role) {
            return Response.json(
                { success: false, message: "El rol seleccionado no existe o está inactivo." },
                { status: 422 }
            );
        }

        const passwordHash = await hashPassword(input.password);
        const result = await env.agroecology_db
            .prepare(
                `
                INSERT INTO users (nombre, email, password, rol_id, estado)
                VALUES (?, ?, ?, ?, ?)
                `
            )
            .bind(input.nombre, input.email, passwordHash, input.rolId, input.estado)
            .run();

        const user = await env.agroecology_db
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
            .bind(result.meta.last_row_id)
            .first();

        return Response.json(
            { success: true, user },
            { status: 201 }
        );
    } catch (error) {
        if (isDuplicateEmailError(error)) {
            return Response.json(
                { success: false, message: "Ya existe un usuario con ese correo." },
                { status: 409 }
            );
        }

        console.error("Admin user creation error:", error);

        return Response.json(
            { success: false, message: "No fue posible crear el usuario." },
            { status: 500 }
        );
    }
}
