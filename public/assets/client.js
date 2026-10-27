(function () {
  "use strict";
  const S = window.SSS, $ = s => document.querySelector(s);
  const KEY = "sss-client-draft";
  const DESIGN = { style: "glow", pattern: "none", layout: "classic" };

  let brief = load() || S.emptyBrief();
  function load() { try { const r = localStorage.getItem(KEY); return r ? S.cleanBrief(JSON.parse(r)) : null; } catch (e) { return null; } }
  let saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(brief)); }
      catch (e) { try { const lite = JSON.parse(JSON.stringify(brief)); lite.brand.logo = null; lite.screens.forEach(s => { s.img = s.tabletImg = null; }); localStorage.setItem(KEY, JSON.stringify(lite)); } catch (e2) {} }
    }, 400);
  }

  const form = SSSForm.buildForm($("#form"), { get: () => brief, onChange: changed, minis: true, numbered: true, startAt: 2 });
  form.open(0);

  $("#c-name").value = brief.contact.name; $("#c-email").value = brief.contact.email; $("#c-notes").value = brief.contact.notes;
  [["c-name", "name"], ["c-email", "email"], ["c-notes", "notes"]].forEach(([id, k]) => $("#" + id).addEventListener("input", e => { brief.contact[k] = e.target.value; changed(); }));

  let rT = null;
  function render() {
    clearTimeout(rT);
    rT = setTimeout(() => S.ensureFonts(brief.brand.font).then(() => {
      const ip = S.SIZES[0], dpr = Math.min(2, window.devicePixelRatio || 1);
      form.minis.forEach((cv, i) => { cv.width = Math.round(130 * dpr); cv.height = Math.round(130 * dpr * ip.h / ip.w); cv.style.height = (130 * ip.h / ip.w) + "px"; S.drawScreen(cv.getContext("2d"), cv.width, cv.height, ip, i, brief, DESIGN, { sampleFill: true }); });
    }), 90);
  }
  S.setOnImage(render);

  function missing() {
    const s = brief.screens, out = [];
    if (!brief.contact.name.trim()) out.push("your name");
    if (!/^\S+@\S+\.\S+$/.test(brief.contact.email.trim())) out.push("a valid email");
    if (!brief.brand.appName.trim()) out.push("your app name");
    return out;
  }
  function checklist() {
    const s = brief.screens, items = [
      [!!brief.contact.name && /^\S+@\S+\.\S+$/.test(brief.contact.email), "Your name and email"],
      [!!brief.brand.appName, "App name"],
      [!!brief.brand.logo, "Logo (optional, but it helps)"],
      [s.every(x => x.title), `Headlines: ${s.filter(x => x.title).length} of 7`],
      [s.every(x => x.img), `Phone screenshots: ${s.filter(x => x.img).length} of 7`]
    ];
    $("#checklist").innerHTML = items.map(([ok, t]) => `<li class="${ok ? "ok" : ""}">${t}</li>`).join("");
  }
  function changed() { save(); checklist(); render(); armed = false; $("#submit").textContent = "Submit brief"; }

  let armed = false, sending = false;
  $("#submit").addEventListener("click", async () => {
    const st = $("#status"); st.classList.remove("bad");
    const miss = missing();
    if (miss.length) { st.textContent = "Please add " + miss.join(", ") + "."; st.classList.add("bad"); return; }
    const gaps = brief.screens.filter(x => !x.img || !x.title).length;
    if (gaps && !armed) { armed = true; $("#submit").textContent = "Submit anyway"; st.textContent = `${gaps} screen${gaps > 1 ? "s are" : " is"} missing a headline or screenshot. You can submit now and send the rest later.`; return; }
    if (sending) return; sending = true; $("#submit").disabled = true; st.textContent = "Sending your brief…";
    try {
      if ($("#c-website").value) { done(); return; } /* honeypot: quietly ignore bots */
      const cfg = window.SSS_CONFIG || {};
      if (!(cfg.repo && cfg.dropKey && cfg.publicKey)) { downloadInstead(); return; }
      const pub = await SSSCrypto.importPublic(cfg.publicKey);
      const now = new Date(), id = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) + "-" + SSSCrypto.b64(crypto.getRandomValues(new Uint8Array(6))).replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toLowerCase();
      const meta = { id, appName: brief.brand.appName, name: brief.contact.name, email: brief.contact.email, submittedAt: now.toISOString(), screenshots: brief.screens.filter(x => x.img).length };
      const files = {};
      files["briefs/" + id + ".brief"] = await SSSCrypto.seal(pub, brief);
      files["briefs/" + id + ".meta"] = await SSSCrypto.seal(pub, meta);
      await new SSSRepo(cfg.repo, cfg.dropKey).commit(files, "New brief " + id);
      done();
    } catch (e) {
      st.textContent = e.status === 413 || e.status === 422 ? "Your screenshots are too large to send together. Try fewer or smaller images." : "We couldn't send your brief. Check your connection and try again. Your answers are still saved on this device.";
      st.classList.add("bad");
    }
    sending = false; $("#submit").disabled = false;
  });
  function done() {
    try { localStorage.removeItem(KEY); } catch (e) {}
    $("#t-name").textContent = brief.contact.name.split(" ")[0];
    $("#app").hidden = true; $("#thanks").hidden = false; window.scrollTo(0, 0);
  }
  /* Preview mode (no briefs inbox configured): hand the brief over as a file instead. */
  function downloadInstead() {
    const name = (brief.brand.appName || "app").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-app-store-brief.json";
    const url = URL.createObjectURL(new Blob([JSON.stringify(brief)], { type: "application/json" })), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    $("#t-msg").textContent = "Preview mode: the briefs inbox isn't connected yet, so your brief was downloaded as " + name + ". Open it in the studio with Open brief file.";
    $("#app").hidden = true; $("#thanks").hidden = false; window.scrollTo(0, 0);
  }
  $("#again").addEventListener("click", () => { brief = S.emptyBrief(); location.reload(); });

  checklist(); render();
  if (document.fonts) document.fonts.ready.then(render);
})();
