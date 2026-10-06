import { getAdminSession } from "../../lib/admin.js";

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

    const nombre = String(body.nombre || "").trim();
    const estado = body.estado === undefined ? 1 : Number(body.estado);

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

    if (![0, 1].includes(estado)) {
        return {
            error: Response.json(
                { success: false, message: "El estado debe ser 1 (activo) o 0 (inactivo)." },
                { status: 422 }
            )
        };
    }

    return { nombre, estado };
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
                SELECT id, nombre, estado, created_at, updated_at
                FROM roles
                ORDER BY id
                `
            )
            .all();

        return Response.json({
            success: true,
            roles: result.results
        });
    } catch (error) {
        console.error("Admin roles list error:", error);

        return Response.json(
            { success: false, message: "No fue posible consultar los roles." },
            { status: 500 }
        );
    }
}

export async function onRequestPost({ request, env }) {
    const authorization = await getAdminSession(request, env);

    if (authorization.response) {
        return authorization.response;
    }

    const input = await readRoleBody(request);

    if (input.error) {
        return input.error;
    }

    try {
        const result = await env.agroecology_db
            .prepare(
                `
                INSERT INTO roles (nombre, estado)
                VALUES (?, ?)
                `
            )
            .bind(input.nombre, input.estado)
            .run();

        return Response.json(
            {
                success: true,
                role: {
                    id: result.meta.last_row_id,
                    nombre: input.nombre,
                    estado: input.estado
                }
            },
            { status: 201 }
        );
    } catch (error) {
        if (isDuplicateNameError(error)) {
            return Response.json(
                { success: false, message: "Ya existe un rol con ese nombre." },
                { status: 409 }
            );
        }

        console.error("Admin role creation error:", error);

        return Response.json(
            { success: false, message: "No fue posible crear el rol." },
            { status: 500 }
        );
    }
}
