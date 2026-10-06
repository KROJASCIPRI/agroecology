import {
    getCookie,
    getSessionUser
} from "./session.js";

export async function getAdminSession(request, env) {
    const token = getCookie(request, "agro_session");
    const user = await getSessionUser(env.agroecology_db, token);

    if (!user) {
        return {
            response: Response.json(
                {
                    success: false,
                    message: "Debes iniciar sesión para continuar."
                },
                { status: 401 }
            )
        };
    }

    const isAdmin = Number(user.rol_id) === 1 ||
        String(user.rol_nombre || "")
            .toLocaleLowerCase("es")
            .includes("administrador");

    if (!isAdmin) {
        return {
            response: Response.json(
                {
                    success: false,
                    message: "No tienes permisos para administrar roles."
                },
                { status: 403 }
            )
        };
    }

    return { user };
}
