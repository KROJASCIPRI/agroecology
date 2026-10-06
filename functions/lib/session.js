const SESSION_DURATION_SECONDS = 8 * 60 * 60;

function bytesToBase64Url(bytes) {
    let binary = "";

    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

async function sha256(value) {
    const data = new TextEncoder().encode(value);

    const hash = await crypto.subtle.digest(
        "SHA-256",
        data
    );

    const bytes = new Uint8Array(hash);

    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

function createExpirationDate() {
    return new Date(
        Date.now() + SESSION_DURATION_SECONDS * 1000
    ).toISOString().slice(0, 19).replace("T", " ");
}

export async function createSession(db, userId) {
    const tokenBytes = crypto.getRandomValues(
        new Uint8Array(32)
    );

    const token = bytesToBase64Url(tokenBytes);
    const tokenHash = await sha256(token);
    const expiraEn = createExpirationDate();

    await db
        .prepare(
            `
            INSERT INTO sessions (
                user_id,
                token_hash,
                expira_en
            )
            VALUES (?, ?, ?)
            `
        )
        .bind(userId, tokenHash, expiraEn)
        .run();

    return token;
}

export async function getSessionUser(db, token) {
    if (!token) {
        return null;
    }

    const tokenHash = await sha256(token);

    const result = await db
        .prepare(
            `
            SELECT
                s.id AS session_id,
                s.user_id,
                s.inicio,
                s.expira_en,
                u.nombre,
                u.email,
                u.rol_id,
                r.nombre AS rol_nombre
            FROM sessions s
            INNER JOIN users u
                ON u.id = s.user_id
            INNER JOIN roles r
                ON r.id = u.rol_id
            WHERE s.token_hash = ?
              AND s.fin IS NULL
              AND s.expira_en > datetime('now')
              AND u.estado = 1
              AND r.estado = 1
            LIMIT 1
            `
        )
        .bind(tokenHash)
        .first();

    if (!result) {
        return null;
    }

    return result;
}

export async function closeSession(
    db,
    token,
    motivoFin = "logout"
) {
    if (!token) {
        return false;
    }

    const tokenHash = await sha256(token);

    const result = await db
        .prepare(
            `
            UPDATE sessions
            SET
                fin = datetime('now'),
                duracion = CAST(
                    (julianday('now') - julianday(inicio)) * 86400
                    AS INTEGER
                ),
                motivo_fin = ?
            WHERE token_hash = ?
              AND fin IS NULL
            `
        )
        .bind(motivoFin, tokenHash)
        .run();

    return result.meta.changes > 0;
}

export async function expireSession(db, sessionId) {
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
                motivo_fin = 'expiracion'
            WHERE id = ?
              AND fin IS NULL
            `
        )
        .bind(sessionId)
        .run();
}

export function getSessionCookie(token, request) {
    const url = new URL(request.url);

    const secure = url.protocol === "https:";

    return [
        `agro_session=${token}`,
        "HttpOnly",
        "Path=/",
        "SameSite=Lax",
        `Max-Age=${SESSION_DURATION_SECONDS}`,
        secure ? "Secure" : ""
    ]
        .filter(Boolean)
        .join("; ");
}

export function clearSessionCookie(request) {
    const url = new URL(request.url);

    const secure = url.protocol === "https:";

    return [
        "agro_session=",
        "HttpOnly",
        "Path=/",
        "SameSite=Lax",
        "Max-Age=0",
        secure ? "Secure" : ""
    ]
        .filter(Boolean)
        .join("; ");
}

export function getCookie(request, name) {
    const cookieHeader = request.headers.get("Cookie");

    if (!cookieHeader) {
        return null;
    }

    const cookies = cookieHeader.split(";");

    for (const cookie of cookies) {
        const [key, ...valueParts] = cookie.trim().split("=");

        if (key === name) {
            return decodeURIComponent(valueParts.join("="));
        }
    }

    return null;
}