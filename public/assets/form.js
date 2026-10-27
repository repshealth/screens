/* Shared brief form: brand + 7 screens. Used by the client page and the admin edit panel. */
(function (global) {
  "use strict";
  const S = global.SSS;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function buildForm(root, opt) {
    const get = opt.get, onChange = opt.onChange || (() => {});
    const q = sel => root.querySelector(sel);
    const n = (k, label) => opt.numbered ? `<span class="n">${k}</span>` : "";

    root.innerHTML = `
    <section class="step">
      <h2>${n(opt.startAt || 1)}Your app</h2>
      <div class="field"><label for="f-app">App name <span class="req">*</span></label>
        <input type="text" id="f-app" maxlength="40" autocomplete="off" placeholder="e.g. Forge Coaching"></div>
      <div class="field"><span class="lbl">Logo <small>(PNG with a transparent background is best)</small></span>
        <div class="logo-row"><div class="logo-box" id="f-logo-box">No logo</div>
          <label class="btn small" for="f-logo">Upload logo</label>
          <input class="vh" type="file" id="f-logo" accept="image/png,image/jpeg,image/webp,image/svg+xml">
          <button class="link" id="f-logo-rm" type="button" hidden>Remove</button></div></div>
      <div class="field"><span class="lbl">Brand colours</span>
        <div class="colors">${sw("primary", "Brand colour")}${sw("accent", "Highlight colour")}</div>
        <p class="sub">The highlight colour picks out key words in your headlines.</p></div>
      ${opt.adminColours ? `<div class="field"><span class="lbl">Background shades <small>(worked out from the brand colour unless set)</small></span>
        <div class="colors">${sw("dark", "Dark shade", true)}${sw("light", "Light shade", true)}</div></div>` : ""}
      <div class="field"><span class="lbl">Cover badges <small>(optional: a rating, member count or award, shown on your first screen)</small></span>
        <div class="grid2"><input type="text" id="f-b-0" maxlength="22" autocomplete="off" aria-label="Cover badge 1" placeholder="e.g. 4.9 rating"><input type="text" id="f-b-1" maxlength="22" autocomplete="off" aria-label="Cover badge 2" placeholder="e.g. 10K+ members"></div></div>
      <div class="field"><span class="lbl" id="f-font-lbl">Headline font</span>
        <div class="chipset" role="radiogroup" aria-labelledby="f-font-lbl">${S.FONTS.map(x => `<label><input class="vh" type="radio" name="f-font" value="${x.f}"><span style="font-family:'${x.f}',sans-serif;font-weight:${x.w}">${x.f}</span></label>`).join("")}</div></div>
    </section>
    <section class="step">
      <h2>${n((opt.startAt || 1) + 1)}Your 7 screens</h2>
      <p class="hint">Screen 1 is your cover: your app name and a one-line tagline. Screens 2 to 7 each sell one feature in a short headline. Add a phone screenshot to each.</p>
      <div class="screens" id="f-screens"></div>
    </section>`;

    function sw(k, l, reset) {
      return `<div class="swatch"><input type="color" id="f-c-${k}" aria-label="${l}"><div class="meta"><span>${l}</span><input type="text" id="f-h-${k}" maxlength="7" aria-label="${l} hex value" spellcheck="false"></div>${reset ? `<button class="link" type="button" id="f-r-${k}">Auto</button>` : ""}</div>`;
    }

    /* brand wiring */
    q("#f-app").addEventListener("input", e => { get().brand.appName = e.target.value; onChange(); });
    q("#f-logo").addEventListener("change", e => {
      const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
      S.processImage(f, 1000, "image/png").then(url => { get().brand.logo = url; sync(); onChange(); }).catch(() => {});
    });
    q("#f-logo-rm").addEventListener("click", () => { get().brand.logo = null; sync(); onChange(); });
    const colourKeys = ["primary", "accent"].concat(opt.adminColours ? ["dark", "light"] : []);
    colourKeys.forEach(k => {
      q("#f-c-" + k).addEventListener("input", e => { get().brand[k] = e.target.value.toUpperCase(); syncColours(); onChange(); });
      q("#f-h-" + k).addEventListener("input", e => { let v = e.target.value.trim(); if (v && v[0] !== "#") v = "#" + v; if (/^#[0-9a-fA-F]{6}$/.test(v)) { get().brand[k] = v.toUpperCase(); q("#f-c-" + k).value = v; onChange(); } });
      const r = q("#f-r-" + k); if (r) r.addEventListener("click", () => { get().brand[k] = null; syncColours(); onChange(); });
    });
    [0, 1].forEach(k => q("#f-b-" + k).addEventListener("input", e => { const b = get().brand; b.badges = (b.badges || ["", ""]).slice(); b.badges[k] = e.target.value; onChange(); }));
    root.querySelectorAll('input[name="f-font"]').forEach(r => r.addEventListener("change", e => { get().brand.font = e.target.value; onChange(); }));

    /* screens */
    const box = q("#f-screens"), minis = [];
    for (let i = 0; i < 7; i++) {
      const ph = S.SAMPLE[i], d = document.createElement("details"); d.className = "scr"; d.id = "f-scr-" + i;
      const up = (id, label, optional) => `<div class="up"><span class="lbl">${label}${optional ? " <small>(optional)</small>" : ""}</span><div class="up-row"><img alt="" id="f-${id}i-${i}" hidden><label class="btn small" for="f-${id}f-${i}">Upload</label><input class="vh" type="file" id="f-${id}f-${i}" accept="image/png,image/jpeg,image/webp"><button class="link" type="button" id="f-${id}r-${i}" hidden>Remove</button></div></div>`;
      d.innerHTML = `<summary><span class="num">${S.pad2(i + 1)}</span><span class="st"></span><span class="chip"></span></summary>
        <div class="scr-body${opt.minis ? " with-mini" : ""}"><div class="scr-fields">
          <div class="field"><label for="f-t-${i}">${i === 0 ? "Cover headline <small>(usually your app name)</small>" : "Headline"}</label><input type="text" id="f-t-${i}" maxlength="70" autocomplete="off" placeholder="e.g. ${esc(ph[0])}"></div>
          <div class="field"><label for="f-g-${i}">Highlight words <small>(optional, copied from the headline)</small></label><input type="text" id="f-g-${i}" maxlength="50" autocomplete="off" placeholder="e.g. ${esc(ph[1] || "simple.")}"></div>
          <div class="field"><label for="f-d-${i}">${i === 0 ? "Tagline" : "Subtitle"}</label><textarea id="f-d-${i}" rows="2" maxlength="140" placeholder="e.g. ${esc(ph[2])}"></textarea></div>
          <div class="ups">${up("p", "Phone screenshot", false)}${up("s", "Second screenshot", true)}${up("t", "Tablet screenshot", true)}</div>
          ${opt.minis && i < 6 ? `<div class="scr-nav"><button class="btn small" type="button" data-next="${i + 1}">Next screen</button></div>` : ""}
        </div>${opt.minis ? `<div class="mini-wrap"><canvas class="mini" aria-label="Preview of screen ${i + 1}"></canvas><span class="mini-cap">Rough preview</span></div>` : ""}</div>`;
      box.appendChild(d);
      if (opt.minis) minis.push(d.querySelector(".mini"));
      d.addEventListener("toggle", () => { if (d.open) { box.querySelectorAll("details.scr").forEach(o => { if (o !== d) o.open = false; }); if (opt.onOpen) opt.onOpen(i); } });
      const sc = () => get().screens[i];
      q("#f-t-" + i).addEventListener("input", e => { sc().title = e.target.value; syncScreen(i); onChange(); });
      q("#f-g-" + i).addEventListener("input", e => { sc().hl = e.target.value; onChange(); });
      q("#f-d-" + i).addEventListener("input", e => { sc().copy = e.target.value; onChange(); });
      [["p", "img", 1290], ["s", "img2", 1290], ["t", "tabletImg", 2064]].forEach(([id, key, max]) => {
        q(`#f-${id}f-${i}`).addEventListener("change", e => {
          const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
          S.processImage(f, max, "image/jpeg").then(url => { sc()[key] = url; syncScreen(i); onChange(); }).catch(() => {});
        });
        q(`#f-${id}r-${i}`).addEventListener("click", () => { sc()[key] = null; syncScreen(i); onChange(); });
      });
      const nx = d.querySelector("[data-next]");
      if (nx) nx.addEventListener("click", () => { const nd = q("#f-scr-" + (i + 1)); nd.open = true; nd.scrollIntoView({ behavior: "smooth", block: "start" }); });
    }

    function syncColours() {
      const b = get().brand, p = S.pal(b), vals = { primary: p.P, accent: p.A, dark: p.dark, light: p.light };
      colourKeys.forEach(k => { q("#f-c-" + k).value = vals[k]; if (document.activeElement !== q("#f-h-" + k)) q("#f-h-" + k).value = vals[k].toUpperCase(); const r = q("#f-r-" + k); if (r) r.hidden = !b[k]; });
    }
    function syncScreen(i) {
      const s = get().screens[i];
      [["t", "title"], ["g", "hl"], ["d", "copy"]].forEach(([id, k]) => { const el = q(`#f-${id}-${i}`); if (el.value !== s[k]) el.value = s[k]; });
      const st = q(`#f-scr-${i} .st`); st.textContent = s.title || "Not filled in yet"; st.classList.toggle("empty", !s.title);
      const chip = q(`#f-scr-${i} .chip`); chip.textContent = s.img ? "Screenshot added" : "Needs screenshot"; chip.classList.toggle("ok", !!s.img);
      [["p", "img"], ["s", "img2"], ["t", "tabletImg"]].forEach(([id, key]) => { const el = q(`#f-${id}i-${i}`); el.hidden = !s[key]; if (s[key]) el.src = s[key]; q(`#f-${id}r-${i}`).hidden = !s[key]; });
    }
    function sync() {
      const b = get().brand;
      q("#f-app").value = b.appName; syncColours();
      [0, 1].forEach(k => { const el = q("#f-b-" + k); const v = (b.badges || [])[k] || ""; if (el.value !== v) el.value = v; });
      root.querySelectorAll('input[name="f-font"]').forEach(r => { r.checked = r.value === b.font; });
      q("#f-logo-box").innerHTML = b.logo ? `<img alt="Logo preview" src="${b.logo}">` : "No logo"; q("#f-logo-rm").hidden = !b.logo;
      for (let i = 0; i < 7; i++) syncScreen(i);
    }
    function open(i) { const d = q("#f-scr-" + i); if (d) { d.open = true; return d; } }
    sync();
    return { sync, minis, open };
  }

  global.SSSForm = { buildForm };
})(window);
