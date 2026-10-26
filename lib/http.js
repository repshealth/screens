// Shared helpers for the Pages Functions.

export const MAX_BYTES = 24 * 1024 * 1024; // KV values can be up to 25 MiB

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(buf);
}

// Constant-time check of "Authorization: Bearer <ADMIN_KEY>".
export async function isAdmin(request, env) {
  if (!env.ADMIN_KEY) return false;
  const header = request.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [a, b] = await Promise.all([sha256(given), sha256(env.ADMIN_KEY)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0 && given.length > 0;
}

export const str = (v, n) => String(v == null ? "" : v).slice(0, n);

const DESIGN_KEYS = ["style", "pattern", "layout"];
export function cleanDesign(d) {
  if (!d || typeof d !== "object") return undefined;
  const out = {};
  for (const k of DESIGN_KEYS) if (typeof d[k] === "string" && /^[a-z]{1,20}$/.test(d[k])) out[k] = d[k];
  return out;
}

// Light structural check; the pages clean every field again when they load a brief.
export function validBrief(b) {
  return b && typeof b === "object" && b.kind === "store-screen-brief" &&
    b.brand && typeof b.brand === "object" && Array.isArray(b.screens) && b.screens.length <= 7;
}

export function metaFor(brief, extra = {}) {
  const c = brief.contact || {};
  return Object.assign({
    appName: str(brief.brand.appName, 40),
    name: str(c.name, 80),
    email: str(c.email, 120),
    screenshots: (brief.screens || []).filter(s => s && s.img).length
  }, extra);
}
