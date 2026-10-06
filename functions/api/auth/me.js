import {
    getCookie,
    getSessionUser
} from "../../lib/session.js";

export async function onRequestGet(context) {
    const { request, env } = context;

    try {
        const token = getCookie(
            request,
            "agro_session"
        );

        const sessionUser = await getSessionUser(
            env.agroecology_db,
            token
        );

        if (!sessionUser) {
            return Response.json(
                {
                    success: false,
                    authenticated: false,
                    user: null
                },
                { status: 401 }
            );
        }

        return Response.json({
            success: true,
            authenticated: true,
            user: {
                id: sessionUser.user_id,
                nombre: sessionUser.nombre,
                email: sessionUser.email,
                rol_id: sessionUser.rol_id,
                rol_nombre: sessionUser.rol_nombre
            }
        });
    } catch (error) {
        console.error("Session validation error:", error);

        return Response.json(
            {
                success: false,
                authenticated: false,
                user: null
            },
            { status: 500 }
        );
    }
}