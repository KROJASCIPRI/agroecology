import { getAdminSession } from "../../../lib/admin.js";

function parseRoleId(value) {
    if (!/^\d+$/.test(value || "")) {
        return null;
    }

    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isDuplicateNameError(error) {
    return String(error?.message || "").includes(
        "UNIQUE constraint failed: roles.nombre"
    );
}

async function readRoleBody(request) {
    let body;

    try {
        body = await request.json();
    } catch {
        return {
            error: Response.json(
                { success: false, message: "El cuerpo debe ser JSON válido." },
                { status: 400 }
            )
        };
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return {
            error: Response.json(
                { success: false, message: "El cuerpo debe ser un objeto JSON." },
                { status: 400 }
            )
        };
    }

    const updates = [];
    const values = [];

    if (Object.hasOwn(body, "nombre")) {
        const nombre = String(body.nombre || "").trim();

        if (!nombre || nombre.length > 80) {
            return {
                error: Response.json(
                    {
                        success: false,
                        message: "El nombre del rol es obligatorio y debe tener máximo 80 caracteres."
                    },
                    { status: 422 }
                )
            };
        }

        updates.push("nombre = ?");
        values.push(nombre);
    }

    if (Object.hasOwn(body, "estado")) {
        const estado = Number(body.estado);

        if (![0, 1].includes(estado)) {
            return {
                error: Response.json(
                    { success: false, message: "El estado debe ser 1 (activo) o 0 (inactivo)." },
                    { status: 422 }
                )
            };
        }

        updates.push("estado = ?");
        values.push(estado);
    }

    if (!updates.length) {
        return {
            error: Response.json(
                { success: false, message: "No se recibieron cambios para guardar." },
                { status: 422 }
            )
        };
    }

    return { updates, values };
}

export async function onRequestPatch({ request, env, params }) {
    const authorization = await getAdminSession(request, env);

    if (authorization.response) {
        return authorization.response;
    }

    const id = parseRoleId(params.id);

    if (!id) {
        return Response.json(
            { success: false, message: "El identificador del rol no es válido." },
            { status: 400 }
        );
    }

    const input = await readRoleBody(request);

    if (input.error) {
        return input.error;
    }

    if (id === 1 && input.values.includes(0)) {
        const stateIndex = input.updates.indexOf("estado = ?");

        if (stateIndex !== -1 && input.values[stateIndex] === 0) {
            return Response.json(
                {
                    success: false,
                    message: "El rol administrador principal no se puede desactivar."
                },
                { status: 409 }
            );
        }
    }

    try {
        const result = await env.agroecology_db
            .prepare(
                `
                UPDATE roles
                SET ${input.updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `
            )
            .bind(...input.values, id)
            .run();

        if (!result.meta.changes) {
            return Response.json(
                { success: false, message: "No se encontró el rol." },
                { status: 404 }
            );
        }

        const role = await env.agroecology_db
            .prepare(
                `
                SELECT id, nombre, estado, created_at, updated_at
                FROM roles
                WHERE id = ?
                `
            )
            .bind(id)
            .first();

        return Response.json({ success: true, role });
    } catch (error) {
        if (isDuplicateNameError(error)) {
            return Response.json(
                { success: false, message: "Ya existe un rol con ese nombre." },
                { status: 409 }
            );
        }

        console.error("Admin role update error:", error);

        return Response.json(
            { success: false, message: "No fue posible actualizar el rol." },
            { status: 500 }
        );
    }
}

export async function onRequestDelete({ request, env, params }) {
    const authorization = await getAdminSession(request, env);

    if (authorization.response) {
        return authorization.response;
    }

    const id = parseRoleId(params.id);

    if (!id) {
        return Response.json(
            { success: false, message: "El identificador del rol no es válido." },
            { status: 400 }
        );
    }

    if (id === 1) {
        return Response.json(
            {
                success: false,
                message: "El rol administrador principal no se puede eliminar."
            },
            { status: 409 }
        );
    }

    try {
        const role = await env.agroecology_db
            .prepare("SELECT id FROM roles WHERE id = ?")
            .bind(id)
            .first();

        if (!role) {
            return Response.json(
                { success: false, message: "No se encontró el rol." },
                { status: 404 }
            );
        }

        const assignment = await env.agroecology_db
            .prepare("SELECT COUNT(*) AS total FROM users WHERE rol_id = ?")
            .bind(id)
            .first();

        if (assignment.total > 0) {
            return Response.json(
                {
                    success: false,
                    message: "No se puede eliminar un rol que tiene usuarios asignados."
                },
                { status: 409 }
            );
        }

        await env.agroecology_db
            .prepare("DELETE FROM roles WHERE id = ?")
            .bind(id)
            .run();

        return Response.json({ success: true, id });
    } catch (error) {
        console.error("Admin role deletion error:", error);

        return Response.json(
            { success: false, message: "No fue posible eliminar el rol." },
            { status: 500 }
        );
    }
}
