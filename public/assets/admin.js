(function () {
  "use strict";
  const S = window.SSS, C = window.SSSCrypto, $ = s => document.querySelector(s);
  const KEY_STORE = "sss-studio-key", PREF_STORE = "sss-admin-prefs";
  const KEYFILE = "keys/studio-key.json", STATE = "state.json";
  const DPR = () => Math.min(2, window.devicePixelRatio || 1);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let prefs = { sizes: { ios69: true, ios65: false, ipad13: true, ipad129: false, gphone: true, g7: false, g10: true, gfeat: true }, device: "iphone" };
  try { const p = JSON.parse(localStorage.getItem(PREF_STORE) || "null"); if (p) prefs = Object.assign(prefs, p); } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(PREF_STORE, JSON.stringify(prefs)); } catch (e) {} };

  const cfg = window.SSS_CONFIG || {};
  const live = !!(cfg.repo && cfg.dropKey);
  const repo = live ? new SSSRepo(cfg.repo, cfg.dropKey) : null;
  let priv = null, keyFile = null, files = [], state = { briefs: {} };
  const metaCache = new Map();
  let brief = S.sampleBrief(), design = S.normDesign({}), current = null, items = [];

  function errText(e) {
    if (!e) return "";
    if (e.message === "empty_repo") return "The briefs repo is empty. Add a README to it on GitHub first.";
    if (e.status === 0) return "Check your connection.";
    if (e.status === 401) return "GitHub rejected the repo key. It may have expired: make a new one and update the BRIEFS_DROP_KEY secret.";
    if (e.status === 403) return "GitHub refused the request. The key may be missing Contents read and write access, or the hourly limit was hit.";
    if (e.status === 404) return "The briefs repo wasn't found. Check BRIEFS_REPO and that the key can access that repo.";
    return "GitHub error " + (e.status || e.message) + ".";
  }
  async function pool(list, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await fn(list[i++]); })); }

  /* ---------- passphrase gate ---------- */
  function showGate(mode, msg) {
    $("#studio").hidden = true; $("#login").hidden = false;
    const setup = mode === "setup", retry = mode === "retry";
    $("#gate-title").textContent = setup ? "Create a studio passphrase" : retry ? "Can't reach the briefs repo" : "Unlock the studio";
    $("#gate-hint").textContent = setup ? "This passphrase protects every brief clients send. Use at least 10 characters and keep it somewhere safe: without it, submitted briefs can't be opened."
      : retry ? "" : "Enter the studio passphrase to read submitted briefs.";
    $("#pass").closest("form").querySelectorAll("label[for=pass], #pass").forEach(el => { el.hidden = retry; });
    $("#pass").required = !retry; $("#pass2-wrap").hidden = !setup;
    $("#pass").autocomplete = setup ? "new-password" : "current-password";
    $("#gate-btn").textContent = setup ? "Create passphrase" : retry ? "Try again" : "Unlock";
    $("#gate-form").dataset.mode = mode; $("#gate-status").textContent = msg || "";
    $("#pass").value = ""; $("#pass2").value = ""; if (!retry) $("#pass").focus();
  }
  function remember(pkcs8) { try { localStorage.setItem(KEY_STORE, JSON.stringify({ pub: keyFile.publicKey, pkcs8 })); } catch (e) {} }
  $("#gate-form").addEventListener("submit", async e => {
    e.preventDefault();
    const st = $("#gate-status"), pass = $("#pass").value, btn = $("#gate-btn"), mode = $("#gate-form").dataset.mode;
    if (mode === "retry") { boot(); return; }
    btn.disabled = true;
    try {
      if (mode === "setup") {
        if (pass.length < 10) { st.textContent = "Use at least 10 characters."; return; }
        if (pass !== $("#pass2").value) { st.textContent = "The two passphrases don't match."; return; }
        st.textContent = "Creating keys…";
        const k = await C.createKeys(pass);
        await repo.commit({ [KEYFILE]: JSON.stringify(k.file, null, 2) + "\n" }, "Set up studio key");
        keyFile = k.file; priv = k.priv; remember(k.pkcs8);
      } else {
        st.textContent = "Unlocking…";
        const k = await C.unlock(keyFile, pass); priv = k.priv; remember(k.pkcs8);
      }
      enter();
    } catch (err) { st.textContent = err.message === "wrong_passphrase" ? "That passphrase isn't right." : "Couldn't save the key. " + errText(err); }
    finally { btn.disabled = false; }
  });
  $("#sign-out").addEventListener("click", () => { try { localStorage.removeItem(KEY_STORE); } catch (e) {} priv = null; current = null; brief = S.sampleBrief(); showGate("unlock"); });
  $("#copy-link").addEventListener("click", async e => {
    const url = new URL("../", location.href).href, btn = e.currentTarget;
    try { await navigator.clipboard.writeText(url); btn.textContent = "Link copied"; } catch (err) { btn.textContent = url; }
    setTimeout(() => { btn.textContent = "Copy client form link"; }, 2500);
  });
  $("#copy-pubkey").addEventListener("click", async e => {
    const btn = e.currentTarget;
    try { await navigator.clipboard.writeText($("#pubkey").value); btn.textContent = "Copied"; } catch (err) { $("#pubkey").select(); btn.textContent = "Press Ctrl+C to copy"; }
    setTimeout(() => { btn.textContent = "Copy key"; }, 2500);
  });

  function enter() {
    $("#login").hidden = true; $("#studio").hidden = false;
    const sn = $("#setup-note"), pinned = cfg.publicKey || "";
    sn.hidden = pinned === keyFile.publicKey;
    if (!sn.hidden) {
      $("#pubkey").value = keyFile.publicKey;
      if (pinned) sn.querySelector(".hint").textContent = "The client form is using a different key from this studio, so new briefs couldn't be opened here. Replace the BRIEFS_PUBLIC_KEY repository variable with this key, then re-run the deploy.";
    }
    loadList(); render();
  }

  /* ---------- inbox ---------- */
  const fmtDate = iso => { try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); } catch (e) { return ""; } };
  async function readState(list) { const sf = list.find(f => f.path === STATE); const s = sf ? await repo.readJSON(sf.sha) : {}; s.briefs = s.briefs || {}; return s; }
  async function loadList(selectId) {
    const st = $("#inbox-status"); st.textContent = "Loading briefs…";
    try {
      files = await repo.list(); state = await readState(files);
      const metas = files.filter(f => /^briefs\/[A-Za-z0-9-]+\.meta$/.test(f.path)), out = [];
      await pool(metas, 6, async f => {
        let m = metaCache.get(f.sha);
        if (!m) { try { m = await C.open(priv, await repo.readBlob(f.sha)); metaCache.set(f.sha, m); } catch (e) { m = { unreadable: true }; } }
        const id = f.path.slice(7, -5);
        out.push(Object.assign({}, m, { id }, state.briefs[id] || {}));
      });
      items = out.sort((a, b) => String(b.submittedAt || b.id).localeCompare(String(a.submittedAt || a.id)));
      const sel = $("#brief-select");
      sel.innerHTML = `<option value="">Sample content (no brief)</option>` + items.map(it => it.unreadable
        ? `<option value="${esc(it.id)}" disabled>Locked brief ${esc(it.id)} (sent with a different key)</option>`
        : `<option value="${esc(it.id)}">${it.status === "done" ? "✓ " : ""}${esc(it.appName || "Untitled app")} · ${esc(it.name || "Unknown")} · ${fmtDate(it.submittedAt)}</option>`).join("");
      const nNew = items.filter(i => i.status !== "done" && !i.unreadable).length;
      st.textContent = items.length ? `${items.length} brief${items.length > 1 ? "s" : ""}, ${nNew} new` : "No briefs submitted yet. Share the client form link to collect one.";
      const want = selectId || (current && current.id);
      if (want && items.some(i => i.id === want)) sel.value = want;
    } catch (e) { st.textContent = "Couldn't load briefs. " + errText(e); }
  }
  $("#refresh").addEventListener("click", () => loadList());
  $("#brief-select").addEventListener("change", e => { if (e.target.value === "file") return; openBrief(e.target.value); });

  async function openBrief(id) {
    disarmDelete();
    if (!id) { current = null; brief = S.sampleBrief(); design = S.normDesign({}); afterLoad(); return; }
    const st = $("#inbox-status"); st.textContent = "Opening brief…";
    try {
      const f = files.find(x => x.path === "briefs/" + id + ".brief");
      if (!f) throw Object.assign(new Error("missing"), { status: 404 });
      const data = await C.open(priv, await repo.readBlob(f.sha));
      const meta = items.find(i => i.id === id) || { id };
      current = { id, meta }; brief = S.cleanBrief(data); design = S.normDesign(meta.design);
      st.textContent = ""; afterLoad();
    } catch (e) { st.textContent = e.status === 404 ? "That brief's files are missing from the repo." : "Couldn't open that brief. " + errText(e); }
  }
  function afterLoad() { form.sync(); syncPicks(); renderMeta(); render(); $("#save-status").textContent = ""; }
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
  /* Merge a change into state.json on top of whatever is in the repo now. */
  async function updateState(fn, message, extraFiles) {
    const latest = await repo.list(), s = await readState(latest);
    fn(s.briefs);
    await repo.commit(Object.assign({ [STATE]: JSON.stringify(s, null, 2) + "\n" }, extraFiles || {}), message);
    state = s; files = latest;
  }
  $("#mark").addEventListener("click", async () => {
    if (!current) return; const id = current.id, status = current.meta.status === "done" ? "new" : "done";
    $("#mark").disabled = true;
    try { await updateState(b => { b[id] = Object.assign({}, b[id], { status }); }, "Mark brief " + id + " " + status); current.meta.status = status; renderMeta(); loadList(id); }
    catch (e) { $("#inbox-status").textContent = "Couldn't update. " + errText(e); }
    $("#mark").disabled = false;
  });
  let delArmed = null;
  function disarmDelete() { clearTimeout(delArmed); delArmed = null; $("#del").textContent = "Delete"; }
  $("#del").addEventListener("click", async () => {
    if (!current) return;
    if (!delArmed) { $("#del").textContent = "Click again to delete for good"; delArmed = setTimeout(disarmDelete, 4000); return; }
    disarmDelete();
    const id = current.id, gone = {};
    ["brief", "meta"].forEach(ext => { const p = "briefs/" + id + "." + ext; if (files.some(f => f.path === p)) gone[p] = null; });
    try { await updateState(b => { delete b[id]; }, "Delete brief " + id, gone); current = null; brief = S.sampleBrief(); design = S.normDesign({}); afterLoad(); loadList(); }
    catch (e) { $("#inbox-status").textContent = "Couldn't delete. " + errText(e); }
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
    $("#pick-tone").innerHTML = Object.entries(S.TONES).map(([id, c]) => `<label><input class="vh" type="radio" name="tone" value="${id}"><span><i style="width:18px;height:18px;border-radius:50%;display:inline-block;background:linear-gradient(135deg,${c[0]},${c[1]})"></i>${id[0].toUpperCase() + id.slice(1)}</span></label>`).join("");
    ["style", "pattern", "layout", "tone"].forEach(k => document.querySelectorAll(`input[name="${k}"]`).forEach(r => r.addEventListener("change", e => { design[k] = e.target.value; syncPicks(); designChanged(); })));
  }
  function syncPicks() { ["style", "pattern", "layout", "tone"].forEach(k => document.querySelectorAll(`input[name="${k}"]`).forEach(r => { r.checked = r.value === design[k]; })); $("#tone-field").hidden = design.layout !== "hand"; }
  $("#shuffle").addEventListener("click", () => {
    const r = o => { const k = Object.keys(o); return k[Math.floor(Math.random() * k.length)]; };
    design = { style: r(S.STYLES), pattern: r(S.PATTERNS), layout: r(S.LAYOUTS), tone: design.tone || "medium" }; syncPicks(); designChanged();
  });
  let designT = null;
  function designChanged() {
    render();
    if (!current) return;
    clearTimeout(designT); $("#design-status").textContent = "";
    designT = setTimeout(async () => {
      const id = current && current.id, d = Object.assign({}, design); if (!id) return;
      try { await updateState(b => { b[id] = Object.assign({}, b[id], { design: d }); }, "Save design for brief " + id); current.meta.design = d; $("#design-status").textContent = "Design saved to this brief."; }
      catch (e) { $("#design-status").textContent = "Design not saved. " + errText(e); }
    }, 1500);
  }

  /* ---------- edit form ---------- */
  const form = SSSForm.buildForm($("#form"), { get: () => brief, onChange: () => { $("#save-status").textContent = current ? "Unsaved changes." : ""; render(); }, adminColours: true, numbered: false });
  $("#save-brief").addEventListener("click", async () => {
    if (!current) { $("#save-status").textContent = "Open a submitted brief first. Sample content is not saved."; return; }
    $("#save-status").textContent = "Saving…";
    try {
      const pub = await C.importPublic(keyFile.publicKey), id = current.id;
      const meta = { id, appName: brief.brand.appName, name: brief.contact.name, email: brief.contact.email, submittedAt: current.meta.submittedAt, screenshots: brief.screens.filter(x => x.img).length };
      await repo.commit({ ["briefs/" + id + ".brief"]: await C.seal(pub, brief), ["briefs/" + id + ".meta"]: await C.seal(pub, meta) }, "Edit brief " + id);
      Object.assign(current.meta, meta); $("#save-status").textContent = "Saved."; loadList(id);
    } catch (e) { $("#save-status").textContent = "Not saved. " + errText(e); }
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
    Object.entries(layoutCv).forEach(([id, cv]) => multi(cv, 2, [0, 1], Object.assign({}, design, { layout: id })));
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
  function startPreview() {
    $("#login").hidden = true; $("#studio").hidden = false;
    $("#brief-select").innerHTML = `<option value="">Sample content (no brief)</option>`;
    ["#refresh", "#sign-out", "#save-brief"].forEach(s => { $(s).hidden = true; });
    $("#file-open").hidden = false;
    $("#inbox-status").textContent = "Preview mode: the briefs inbox isn't connected, so submitted briefs can't be listed. Open a brief file a client downloaded, or design with the sample content.";
    render();
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

  async function boot() {
    if (!live) { startPreview(); return; }
    $("#gate-btn").disabled = true;
    try {
      files = await repo.list();
      const kf = files.find(f => f.path === KEYFILE);
      if (!kf) { showGate("setup"); return; }
      keyFile = await repo.readJSON(kf.sha);
      let saved = null; try { saved = JSON.parse(localStorage.getItem(KEY_STORE) || "null"); } catch (e) {}
      if (saved && saved.pub === keyFile.publicKey) { try { priv = await C.importPrivate(saved.pkcs8); enter(); return; } catch (e) {} }
      showGate("unlock");
    } catch (e) { showGate("retry", errText(e)); }
    finally { $("#gate-btn").disabled = false; }
  }
  buildPicks(); buildSizes(); syncDev(); syncPicks();
  boot();
})();
