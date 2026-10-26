// GET    /api/briefs/:id -> admin: full brief + metadata
// PATCH  /api/briefs/:id -> admin: { status?, design?, brief? }
// DELETE /api/briefs/:id -> admin: remove a brief
import { json, isAdmin, validBrief, metaFor, cleanDesign, MAX_BYTES } from "../../../lib/http.js";

const keyFor = id => (/^[A-Za-z0-9-]{1,64}$/.test(id) ? "brief:" + id : null);

export async function onRequest({ request, env, params }) {
  if (!(await isAdmin(request, env))) return json({ error: "unauthorized" }, 401);
  const key = keyFor(String(params.id || ""));
  if (!key) return json({ error: "not_found" }, 404);

  if (request.method === "GET") {
    const { value, metadata } = await env.BRIEFS.getWithMetadata(key);
    if (value === null) return json({ error: "not_found" }, 404);
    return json({ brief: JSON.parse(value), meta: metadata || {} });
  }

  if (request.method === "PATCH") {
    let patch;
    try { patch = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
    const { value, metadata } = await env.BRIEFS.getWithMetadata(key);
    if (value === null) return json({ error: "not_found" }, 404);
    let brief = JSON.parse(value);
    const meta = Object.assign({}, metadata || {});
    if (patch.status === "new" || patch.status === "done") meta.status = patch.status;
    const design = cleanDesign(patch.design);
    if (design) meta.design = design;
    if (patch.brief) {
      if (!validBrief(patch.brief)) return json({ error: "invalid" }, 400);
      brief = patch.brief;
      Object.assign(meta, metaFor(brief));
    }
    const text = JSON.stringify(brief);
    if (text.length > MAX_BYTES) return json({ error: "too_large" }, 413);
    await env.BRIEFS.put(key, text, { metadata: meta });
    return json({ ok: true, meta });
  }

  if (request.method === "DELETE") {
    await env.BRIEFS.delete(key);
    return json({ ok: true });
  }

  return json({ error: "method_not_allowed" }, 405);
}
