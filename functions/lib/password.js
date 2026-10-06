const ITERATIONS = 100000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);

    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }

    return bytes;
}

function constantTimeEqual(a, b) {
    if (a.length !== b.length) {
        return false;
    }

    let result = 0;

    for (let i = 0; i < a.length; i++) {
        result |= a[i] ^ b[i];
    }

    return result === 0;
}

export async function hashPassword(password) {
    const encoder = new TextEncoder();

    const salt = crypto.getRandomValues(
        new Uint8Array(SALT_LENGTH)
    );

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt,
            iterations: ITERATIONS,
            hash: "SHA-256"
        },
        keyMaterial,
        KEY_LENGTH * 8
    );

    const hash = new Uint8Array(derivedBits);

    return `pbkdf2_sha256$${ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(hash)}`;
}

export async function verifyPassword(password, storedHash) {
    const parts = storedHash.split("$");

    if (
        parts.length !== 4 ||
        parts[0] !== "pbkdf2_sha256"
    ) {
        return false;
    }

    const iterations = Number(parts[1]);
    const salt = hexToBytes(parts[2]);
    const expectedHash = hexToBytes(parts[3]);

    if (
        !Number.isInteger(iterations) ||
        iterations <= 0 ||
        salt.length === 0 ||
        expectedHash.length === 0
    ) {
        return false;
    }

    const encoder = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt,
            iterations,
            hash: "SHA-256"
        },
        keyMaterial,
        expectedHash.length * 8
    );

    const derivedHash = new Uint8Array(derivedBits);

    return constantTimeEqual(
        derivedHash,
        expectedHash
    );
}