import { getAdminSession } from "../../lib/admin.js";

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
                    s.id,
                    s.user_id,
                    s.inicio,
                    s.fin,
                    s.duracion,
                    s.motivo_fin,
                    s.created_at,
                    u.nombre,
                    u.email
                FROM sessions s
                INNER JOIN users u ON u.id = s.user_id
                ORDER BY s.inicio DESC, s.id DESC
                LIMIT 500
                `
            )
            .all();

        return Response.json({
            success: true,
            sessions: result.results
        });
    } catch (error) {
        console.error("Admin sessions list error:", error);

        return Response.json(
            { success: false, message: "No fue posible consultar el historial de sesiones." },
            { status: 500 }
        );
    }
}
