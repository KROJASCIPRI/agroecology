export async function onRequestGet(context) {
    const { env } = context;

    const result = await env.agroecology_db
        .prepare("SELECT id, nombre, estado FROM roles ORDER BY id")
        .all();

    return new Response(
        JSON.stringify({
            success: true,
            roles: result.results
        }),
        {
            headers: {
                "Content-Type": "application/json"
            }
        }
    );
}