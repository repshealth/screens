// POST /api/briefs  -> public: a client submits a brief
// GET  /api/briefs  -> admin: list submitted briefs (newest first)
import { json, isAdmin, validBrief, metaFor, MAX_BYTES } from "../../../lib/http.js";

export async function onRequestPost({ request, env }) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BYTES) return json({ error: "too_large" }, 413);

  const text = await request.text();
  if (text.length > MAX_BYTES) return json({ error: "too_large" }, 413);

  let body;
  try { body = JSON.parse(text); } catch { return json({ error: "bad_json" }, 400); }

  // Honeypot field: bots fill it, people never see it. Pretend success.
  if (body && body.website) return json({ ok: true });
  delete body.website;

  if (!validBrief(body)) return json({ error: "invalid" }, 400);
  if (!String(body.brand.appName || "").trim()) return json({ error: "missing_app_name" }, 400);

  const id = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) + "-" + crypto.randomUUID().slice(0, 8);
  const meta = metaFor(body, { submittedAt: new Date().toISOString(), status: "new" });
  await env.BRIEFS.put("brief:" + id, JSON.stringify(body), { metadata: meta });
  return json({ ok: true, id });
}

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json({ error: "unauthorized" }, 401);
  const items = [];
  let cursor;
  do {
    const page = await env.BRIEFS.list({ prefix: "brief:", cursor });
    for (const k of page.keys) items.push(Object.assign({ id: k.name.slice(6) }, k.metadata || {}));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  items.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
  return json({ items });
}
