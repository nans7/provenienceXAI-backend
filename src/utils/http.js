let allowedOrigins = new Set();
export const configureAllowedOrigins = (origins) => { allowedOrigins = new Set(origins); };
import { isRecord } from "./validation.js";
export function json(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            ...headers,
        },
    });
}
export function sameOrigin(request) {
    const origin = request.headers.get("origin");
    return !origin || origin === new URL(request.url).origin || allowedOrigins.has(origin);
}
export async function readObject(request) {
    const reader = request.body?.getReader();
    if (!reader)
        return null;
    const chunks = [];
    let length = 0;
    try {
        while (true) {
            const part = await reader.read();
            if (part.done)
                break;
            length += part.value.byteLength;
            if (length > 64 * 1024) {
                await reader.cancel();
                return null;
            }
            chunks.push(part.value);
        }
        const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        return isRecord(input) ? input : null;
    }
    catch {
        return null;
    }
}
