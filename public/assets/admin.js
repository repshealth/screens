(function () {
  "use strict";
  const S = window.SSS, $ = s => document.querySelector(s);
  const KEY_STORE = "sss-admin-key", PREF_STORE = "sss-admin-prefs";
  const DPR = () => Math.min(2, window.devicePixelRatio || 1);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let key = ""; try { key = localStorage.getItem(KEY_STORE) || ""; } catch (e) {}
  let prefs = { sizes: { ios69: true, ios65: false, ipad13: true, ipad129: false, gphone: true, g7: false, g10: true, gfeat: true }, device: "iphone" };
  try { const p = JSON.parse(localStorage.getItem(PREF_STORE) || "null"); if (p) prefs = Object.assign(prefs, p); } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(PREF_STORE, JSON.stringify(prefs)); } catch (e) {} };

  let brief = S.sampleBrief(), design = S.normDesign({}), current = null, items = [];

  /* ---------- API ---------- */
  async function api(path, opts) {
    opts = opts || {};
    const res = await fetch("../api" + path, Object.assign({}, opts, { headers: Object.assign({ authorization: "Bearer " + key }, opts.body ? { "content-type": "application/json" } : {}) }));
    if (res.status === 401) { showLogin("That key was not accepted."); throw new Error("unauthorized"); }
    if (!res.ok) throw new Error("Request failed (" + res.status + ")");
    return res.json();
  }
  function showLogin(msg) { $("#studio").hidden = true; $("#login").hidden = false; $("#login-status").textContent = msg || ""; $("#key").focus(); }
  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault(); key = $("#key").value.trim(); $("#login-status").textContent = "Checking…";
    try { await api("/briefs"); try { localStorage.setItem(KEY_STORE, key); } catch (e2) {} start(); }
    catch (err) { if (err.message !== "unauthorized") $("#login-status").textContent = "Could not reach the server. " + err.message; }
  });
  $("#sign-out").addEventListener("click", () => { try { localStorage.removeItem(KEY_STORE); } catch (e) {} key = ""; showLogin(""); });
  $("#copy-link").addEventListener("click", async e => {
    const url = new URL("../", location.href).href, btn = e.currentTarget;
    try { await navigator.clipboard.writeText(url); btn.textContent = "Link copied"; } catch (err) { btn.textContent = url; }
    setTimeout(() => { btn.textContent = "Copy client form link"; }, 2500);
  });

  /* ---------- inbox ---------- */
  const fmtDate = iso => { try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); } catch (e) { return ""; } };
  async function loadList(selectId) {
    $("#inbox-status").textContent = "";
    try {
      const j = await api("/briefs"); items = j.items || [];
      const sel = $("#brief-select");
      sel.innerHTML = `<option value="">Sample content (no brief)</option>` + items.map(it =>
        `<option value="${esc(it.id)}">${it.status === "done" ? "✓ " : ""}${esc(it.appName || "Untitled app")} · ${esc(it.name || "Unknown")} · ${fmtDate(it.submittedAt)}</option>`).join("");
      const nNew = items.filter(i => i.status !== "done").length;
      $("#inbox-status").textContent = items.length ? `${items.length} brief${items.length > 1 ? "s" : ""}, ${nNew} new` : "No briefs submitted yet. Share the client form link to collect one.";
      if (selectId && items.some(i => i.id === selectId)) sel.value = selectId;
      else if (current && items.some(i => i.id === current.id)) sel.value = current.id;
    } catch (e) { if (e.message !== "unauthorized") $("#inbox-status").textContent = "Could not load briefs. " + e.message; }
  }
  $("#refresh").addEventListener("click", () => loadList());
  $("#brief-select").addEventListener("change", e => { if (e.target.value === "file") return; openBrief(e.target.value); });

  async function openBrief(id) {
    disarmDelete();
    if (!id) { current = null; brief = S.sampleBrief(); design = S.normDesign({}); afterLoad(); return; }
    $("#inbox-status").textContent = "Opening brief…";
    try {
      const j = await api("/briefs/" + encodeURIComponent(id));
      current = { id, meta: j.meta || {} }; brief = S.cleanBrief(j.brief); design = S.normDesign(current.meta.design);
      $("#inbox-status").textContent = ""; afterLoad();
    } catch (e) { if (e.message !== "unauthorized") $("#inbox-status").textContent = "Could not open that brief. " + e.message; }
  }
  function afterLoad() {
    form.sync(); syncPicks(); renderMeta(); render();
  }
  function renderMeta() {
    const m = $("#brief-meta"), a = $("#brief-actions");
    if (!current) { m.hidden = true; a.hidden = true; return; }
    const c = brief.contact, meta = current.meta;
    m.innerHTML = `<dt>Client</dt><dd>${esc(c.name || "-")}</dd><dt>Email</dt><dd>${esc(c.email || "-")}</dd>
      <dt>Submitted</dt><dd>${esc(new Date(meta.submittedAt || Date.now()).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))}</dd>
      <dt>Status</dt><dd><span class="pill ${meta.status === "done" ? "done" : ""}">${meta.status === "done" ? "Done" : "New"}</span></dd>
      <dt>Screenshots</dt><dd>${brief.screens.filter(s => s.img).length} of 7</dd>
      ${c.notes ? `<dt>Notes</dt><dd>${esc(c.notes)}</dd>` : ""}`;
    m.hidden = false; a.hidden = false;
    $("#mark").textContent = meta.status === "done" ? "Mark as new" : "Mark as done";
  }
  $("#mark").addEventListener("click", async () => {
    if (!current) return; const status = current.meta.status === "done" ? "new" : "done";
    try { await api("/briefs/" + encodeURIComponent(current.id), { method: "PATCH", body: JSON.stringify({ status }) }); current.meta.status = status; renderMeta(); loadList(current.id); }
    catch (e) { if (e.message !== "unauthorized") $("#inbox-status").textContent = "Could not update. " + e.message; }
  });
  let delArmed = null;
  function disarmDelete() { clearTimeout(delArmed); delArmed = null; $("#del").textContent = "Delete"; }
  $("#del").addEventListener("click", async () => {
    if (!current) return;
    if (!delArmed) { $("#del").textContent = "Click again to delete for good"; delArmed = setTimeout(disarmDelete, 4000); return; }
    disarmDelete();
    try { await api("/briefs/" + encodeURIComponent(current.id), { method: "DELETE" }); current = null; brief = S.sampleBrief(); design = S.normDesign({}); afterLoad(); loadList(); }
    catch (e) { if (e.message !== "unauthorized") $("#inbox-status").textContent = "Could not delete. " + e.message; }
  });

  /* ---------- design pickers ---------- */
  const styleCv = {}, layoutCv = {}, patternCv = {};
  function buildPicks() {
    $("#pick-style").innerHTML = Object.entries(S.STYLES).map(([id, s]) => `<label class="pick"><input class="vh" type="radio" name="style" value="${id}"><span class="card"><canvas aria-hidden="true"></canvas><span><b>${s.name}</b><small>${s.desc}</small></span></span></label>`).join("");
    $("#pick-pattern").innerHTML = Object.entries(S.PATTERNS).map(([id, s]) => `<label><input class="vh" type="radio" name="pattern" value="${id}"><span><canvas aria-hidden="true"></canvas>${s.name}</span></label>`).join("");
    $("#pick-layout").innerHTML = Object.entries(S.LAYOUTS).map(([id, s]) => `<label class="pick"><input class="vh" type="radio" name="layout" value="${id}"><span class="card"><canvas aria-hidden="true"></canvas><span><b>${s.name}</b><small>${s.desc}</small></span></span></label>`).join("");
    document.querySelectorAll('#pick-style input').forEach(r => { styleCv[r.value] = r.parentNode.querySelector("canvas"); });
    document.querySelectorAll('#pick-pattern input').forEach(r => { patternCv[r.value] = r.parentNode.querySelector("canvas"); });
    document.querySelectorAll('#pick-layout input').forEach(r => { layoutCv[r.value] = r.parentNode.querySelector("canvas"); });
    ["style", "pattern", "layout"].forEach(k => document.querySelectorAll(`input[name="${k}"]`).forEach(r => r.addEventListener("change", e => { design[k] = e.target.value; designChanged(); })));
  }
  function syncPicks() { ["style", "pattern", "layout"].forEach(k => document.querySelectorAll(`input[name="${k}"]`).forEach(r => { r.checked = r.value === design[k]; })); }
  $("#shuffle").addEventListener("click", () => {
    const r = o => { const k = Object.keys(o); return k[Math.floor(Math.random() * k.length)]; };
    design = { style: r(S.STYLES), pattern: r(S.PATTERNS), layout: r(S.LAYOUTS) }; syncPicks(); designChanged();
  });
  let designT = null;
  function designChanged() {
    render();
    if (!current) return;
    clearTimeout(designT); $("#design-status").textContent = "";
    designT = setTimeout(async () => {
      try { await api("/briefs/" + encodeURIComponent(current.id), { method: "PATCH", body: JSON.stringify({ design }) }); current.meta.design = Object.assign({}, design); $("#design-status").textContent = "Design saved to this brief."; }
      catch (e) { if (e.message !== "unauthorized") $("#design-status").textContent = "Design not saved. " + e.message; }
    }, 800);
  }

  /* ---------- edit form ---------- */
  const form = SSSForm.buildForm($("#form"), { get: () => brief, onChange: () => { $("#save-status").textContent = current ? "Unsaved changes." : ""; render(); }, adminColours: true, numbered: false });
  $("#save-brief").addEventListener("click", async () => {
    if (!current) { $("#save-status").textContent = "Open a submitted brief first. Sample content is not saved."; return; }
    $("#save-status").textContent = "Saving…";
    try { await api("/briefs/" + encodeURIComponent(current.id), { method: "PATCH", body: JSON.stringify({ brief }) }); $("#save-status").textContent = "Saved."; loadList(current.id); }
    catch (e) { if (e.message !== "unauthorized") $("#save-status").textContent = "Not saved. " + e.message; }
  });

  /* ---------- sizes + stage ---------- */
  function buildSizes() {
    const groups = {}; S.SIZES.forEach(s => { (groups[s.store] = groups[s.store] || []).push(s); });
    $("#sizes").innerHTML = Object.entries(groups).map(([store, list]) => `<div><h3>${store}</h3>${list.map(s => `<label class="size" for="sz-${s.id}"><input type="checkbox" id="sz-${s.id}"><span>${s.label}${s.req ? `<span class="badge">${s.req}</span>` : ""}</span><span class="dim">${s.w} × ${s.h}</span></label>`).join("")}</div>`).join("");
    S.SIZES.forEach(s => { const c = $("#sz-" + s.id); c.checked = !!prefs.sizes[s.id]; c.addEventListener("change", e => { prefs.sizes[s.id] = e.target.checked; savePrefs(); foot(); }); });
  }
  const strip = $("#strip"), shots = [];
  for (let i = 0; i < 7; i++) {
    const b = document.createElement("button"); b.type = "button"; b.className = "shot"; b.setAttribute("aria-label", "Edit screen " + (i + 1));
    const cv = document.createElement("canvas"); b.appendChild(cv); const cap = document.createElement("span"); cap.textContent = S.pad2(i + 1); b.appendChild(cap);
    b.addEventListener("click", () => { $("#edit").open = true; const d = form.open(i); if (d) d.scrollIntoView({ behavior: "smooth", block: "nearest" }); });
    strip.appendChild(b); shots.push(cv);
  }
  document.querySelectorAll("#devseg button").forEach(bt => bt.addEventListener("click", () => { prefs.device = bt.dataset.dev; savePrefs(); syncDev(); render(); }));
  function syncDev() { document.querySelectorAll("#devseg button").forEach(bt => bt.setAttribute("aria-pressed", String(bt.dataset.dev === prefs.device))); foot(); }
  function foot() {
    const size = S.SIZES.find(s => s.id === S.PREVIEW_SIZE[prefs.device]);
    const n = S.SIZES.filter(s => prefs.sizes[s.id]).reduce((a, s) => a + (s.feature ? 1 : 7), 0);
    $("#stage-foot").innerHTML = `<span>Previewing <b>${size.store} ${size.label}</b> at ${size.w} × ${size.h}</span><span><b>${brief.screens.filter(s => s.img).length}/7</b> screenshots</span><span><b>${n}</b> images in the export</span>`;
  }

  /* ---------- rendering ---------- */
  function fit(cv, cssW, ratio) { cv.style.width = cssW ? cssW + "px" : ""; const w = cssW || cv.clientWidth; if (!w) return false; cv.width = Math.round(w * DPR()); cv.height = Math.round(cv.width * ratio); if (!cssW) cv.style.height = (w * ratio) + "px"; return true; }
  function multi(cv, count, idx, d) {
    const ip = S.SIZES[0], gap = 0.04, sw = 1 / (count + (count - 1) * gap), ratio = sw * ip.h / ip.w;
    if (!fit(cv, 0, ratio)) return;
    const ctx = cv.getContext("2d"), W = cv.width * sw, H = W * ip.h / ip.w;
    idx.forEach((i, k) => { ctx.save(); ctx.translate(k * W * (1 + gap), 0); S.rr(ctx, 0, 0, W, H, W * 0.06); ctx.clip(); S.drawScreen(ctx, W, H, ip, i, brief, d); ctx.restore(); });
  }
  let rT = null;
  function render() { clearTimeout(rT); rT = setTimeout(() => S.ensureFonts(brief.brand.font).then(draw), 80); }
  function draw() {
    const size = S.SIZES.find(s => s.id === S.PREVIEW_SIZE[prefs.device]), cssW = size.form === "tablet" ? 260 : 180;
    shots.forEach((cv, i) => { cv.style.width = cssW + "px"; cv.width = Math.round(cssW * DPR()); cv.height = Math.round(cv.width * size.h / size.w); S.drawScreen(cv.getContext("2d"), cv.width, cv.height, size, i, brief, design); });
    Object.entries(styleCv).forEach(([id, cv]) => multi(cv, 3, [0, 1, 2], Object.assign({}, design, { style: id })));
    Object.entries(layoutCv).forEach(([id, cv]) => multi(cv, 2, [0, 3], Object.assign({}, design, { layout: id })));
    Object.entries(patternCv).forEach(([id, cv]) => {
      cv.width = cv.height = Math.round(26 * DPR()); const ctx = cv.getContext("2d"), V = 220, p = S.pal(brief.brand);
      const st = S.STYLES[design.style].style({ i: 2, p });
      ctx.save(); ctx.scale(cv.width / V, cv.height / V); st.paint(ctx, V, V); S.PATTERNS[id].draw(ctx, V, V, { i: 0, n: 7, p, fg: st.title, brand: brief.brand, font: brief.brand.font }); ctx.restore();
    });
    const fp = $("#feature-prev"); if (fit(fp, 0, 500 / 1024)) S.drawFeature(fp.getContext("2d"), fp.width, fp.height, brief, design);
    foot();
  }
  S.setOnImage(render);
  window.addEventListener("resize", render);
  if (document.fonts) document.fonts.ready.then(render);

  /* ---------- export ---------- */
  const slug = () => (brief.brand.appName || "app").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
  const toBlob = cv => new Promise(r => cv.toBlob(r, "image/jpeg", 0.93));
  $("#export").addEventListener("click", async () => {
    const st = $("#export-status"), btn = $("#export"), sel = S.SIZES.filter(s => prefs.sizes[s.id]);
    if (!sel.length) { st.textContent = "Select at least one size above."; return; }
    if (typeof JSZip === "undefined") { st.textContent = "The ZIP tool did not load. Reload the page and try again."; return; }
    btn.disabled = true;
    try {
      await S.ensureFonts(brief.brand.font);
      const zip = new JSZip(), cv = document.createElement("canvas"), ctx = cv.getContext("2d");
      const total = sel.reduce((a, s) => a + (s.feature ? 1 : 7), 0); let done = 0;
      for (const s of sel) {
        cv.width = s.w; cv.height = s.h;
        if (s.feature) { S.drawFeature(ctx, s.w, s.h, brief, design); zip.file(`Google Play/Feature graphic ${s.w}x${s.h}.jpg`, await toBlob(cv)); done++; }
        else for (let i = 0; i < 7; i++) {
          S.drawScreen(ctx, s.w, s.h, s, i, brief, design);
          zip.file(`${s.store}/${s.folder} ${s.w}x${s.h}/${S.pad2(i + 1)}.jpg`, await toBlob(cv));
          done++; st.textContent = `Rendering ${done} of ${total}…`; await new Promise(r => setTimeout(r, 0));
        }
      }
      st.textContent = "Packing ZIP…";
      const blob = await zip.generateAsync({ type: "blob" }), url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = `${slug()}-store-screenshots.zip`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      st.textContent = "Downloaded " + a.download;
    } catch (e) { st.textContent = "Export failed. Try fewer sizes, or reload and try again."; }
    btn.disabled = false;
  });

  /* ---------- start ---------- */
  buildPicks(); buildSizes(); syncDev(); syncPicks();
  let preview = false;
  function start() { $("#login").hidden = true; $("#studio").hidden = false; if (!preview) loadList(); render(); }
  function startPreview() {
    preview = true;
    $("#brief-select").innerHTML = `<option value="">Sample content (no brief)</option>`;
    ["#refresh", "#sign-out", "#save-brief"].forEach(s => { $(s).hidden = true; });
    $("#file-open").hidden = false;
    $("#inbox-status").textContent = "Preview mode: no server is connected, so submitted briefs can't be listed. Open a brief file a client downloaded, or design with the sample content.";
    start();
  }
  $("#open-file").addEventListener("change", e => {
    const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { const d = JSON.parse(r.result); if (!d || !Array.isArray(d.screens)) throw 0;
        current = null; brief = S.cleanBrief(d); afterLoad();
        const sel = $("#brief-select"); sel.innerHTML = `<option value="">Sample content (no brief)</option><option value="file" selected>${esc(brief.brand.appName || "Brief")} (from file)</option>`;
        $("#inbox-status").textContent = "Opened " + (brief.brand.appName || "brief") + " from file. " + (brief.contact.name ? "Client: " + brief.contact.name + "." : "");
      } catch (err) { $("#inbox-status").textContent = "That file is not a screenshots brief."; }
    };
    r.readAsText(f);
  });
  /* Probe without a key: 401 means the API exists; anything else means static preview hosting. */
  fetch("../api/briefs").then(res => {
    if (res.status !== 401) { startPreview(); return; }
    if (key) api("/briefs").then(start).catch(err => { if (err.message !== "unauthorized") { start(); $("#inbox-status").textContent = "Could not reach the server."; } });
    else showLogin("");
  }).catch(startPreview);
})();
