import { verifyPassword } from "../../lib/password.js";
import {
    createSession,
    getSessionCookie
} from "../../lib/session.js";

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const body = await request.json();

        const email = String(body.email || "")
            .trim()
            .toLowerCase();

        const password = String(body.password || "");

        if (!email || !password) {
            return Response.json(
                {
                    success: false,
                    message: "El correo y la contraseña son obligatorios."
                },
                { status: 422 }
            );
        }

        const user = await env.agroecology_db
            .prepare(
                `
                SELECT
                    u.id,
                    u.nombre,
                    u.email,
                    u.password,
                    u.rol_id,
                    r.nombre AS rol_nombre
                FROM users u
                INNER JOIN roles r
                    ON r.id = u.rol_id
                WHERE LOWER(u.email) = ?
                  AND u.estado = 1
                  AND r.estado = 1
                LIMIT 1
                `
            )
            .bind(email)
            .first();

        if (!user) {
            return Response.json(
                {
                    success: false,
                    message: "Credenciales incorrectas."
                },
                { status: 401 }
            );
        }

        const passwordValid = await verifyPassword(
            password,
            user.password
        );

        if (!passwordValid) {
            return Response.json(
                {
                    success: false,
                    message: "Credenciales incorrectas."
                },
                { status: 401 }
            );
        }

        const token = await createSession(
            env.agroecology_db,
            user.id
        );

        return new Response(
            JSON.stringify({
                success: true,
                user: {
                    id: user.id,
                    nombre: user.nombre,
                    email: user.email,
                    rol_id: user.rol_id,
                    rol_nombre: user.rol_nombre
                }
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Set-Cookie": getSessionCookie(
                        token,
                        request
                    )
                }
            }
        );
    } catch (error) {
        console.error("Login error:", error);

        return Response.json(
            {
                success: false,
                message: "No fue posible iniciar sesión."
            },
            { status: 500 }
        );
    }
}