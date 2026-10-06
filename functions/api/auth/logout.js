import {
    getCookie,
    closeSession,
    clearSessionCookie
} from "../../lib/session.js";

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const token = getCookie(
            request,
            "agro_session"
        );

        if (token) {
            await closeSession(
                env.agroecology_db,
                token,
                "logout"
            );
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: "Sesión cerrada correctamente."
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Set-Cookie": clearSessionCookie(
                        request
                    )
                }
            }
        );
    } catch (error) {
        console.error("Logout error:", error);

        return new Response(
            JSON.stringify({
                success: false,
                message: "No fue posible cerrar la sesión."
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    "Set-Cookie": clearSessionCookie(
                        request
                    )
                }
            }
        );
    }
}