/* Reps Screens rendering engine.
   Draws App Store / Google Play screenshots on a canvas from a brief
   (brand + 7 screens) and a design (style + pattern + layout). */
(function (global) {
  "use strict";

  /* ---------- constants ---------- */
  const FONTS = [
    { f: "Montserrat", w: 800 }, { f: "Poppins", w: 700 }, { f: "DM Sans", w: 700 },
    { f: "Archivo Black", w: 400 }, { f: "Bebas Neue", w: 400 }, { f: "Oswald", w: 700 },
    { f: "Playfair Display", w: 800 }
  ];
  const FW = Object.fromEntries(FONTS.map(x => [x.f, x.w]));
  const bodyFontOf = f => (["Montserrat", "Poppins", "DM Sans"].includes(f) ? f : "DM Sans");

  const SIZES = [
    { id: "ios69", store: "App Store", label: 'iPhone 6.9"', folder: "iPhone 6.9in", w: 1320, h: 2868, platform: "apple", form: "phone", req: "Required" },
    { id: "ios65", store: "App Store", label: 'iPhone 6.5"', folder: "iPhone 6.5in", w: 1284, h: 2778, platform: "apple", form: "phone" },
    { id: "ipad13", store: "App Store", label: 'iPad 13"', folder: "iPad 13in", w: 2064, h: 2752, platform: "apple", form: "tablet", req: "If on iPad" },
    { id: "ipad129", store: "App Store", label: 'iPad 12.9"', folder: "iPad 12.9in", w: 2048, h: 2732, platform: "apple", form: "tablet" },
    { id: "gphone", store: "Google Play", label: "Phone", folder: "Phone", w: 1080, h: 1920, platform: "google", form: "phone", req: "Required" },
    { id: "g7", store: "Google Play", label: '7" tablet', folder: "Tablet 7in", w: 1200, h: 1920, platform: "google", form: "tablet" },
    { id: "g10", store: "Google Play", label: '10" tablet', folder: "Tablet 10in", w: 1600, h: 2560, platform: "google", form: "tablet" },
    { id: "gfeat", store: "Google Play", label: "Feature graphic", folder: "", w: 1024, h: 500, platform: "google", feature: true, req: "Required" }
  ];
  const PREVIEW_SIZE = { iphone: "ios69", ipad: "ipad13", android: "gphone", atablet: "g10" };
  const DEVICE = {
    iphone: { aspect: 9 / 19.5, radius: 0.155, bezel: 0.034, notch: "island", phone: true },
    android: { aspect: 9 / 20, radius: 0.11, bezel: 0.03, notch: "hole", phone: true },
    ipad: { aspect: 3 / 4, radius: 0.055, bezel: 0.036, notch: "cam" },
    atablet: { aspect: 10 / 16, radius: 0.045, bezel: 0.034, notch: "cam" }
  };

  const SAMPLE = [
    ["Forge Coaching", "", "Online body transformation coaching"],
    ["Log the work. Own the progress.", "Own the progress.", "Every session recorded. Every PB proof the process is working."],
    ["Discipline builds freedom.", "freedom.", "Track the daily habits that keep you consistent when motivation is not."],
    ["Nutrition sorted.", "sorted.", "Recipes and meal plans built around your targets."],
    ["Tracking made simple.", "simple.", "Log meals in seconds with the barcode scanner."],
    ["Transformations.", "", "Workouts built for your goal, all tailored by your coach."],
    ["Stay accountable", "accountable", "Weekly check-ins, tasks and everything else in one place."]
  ];
  const PH_HEAD = ["Home", "Workouts", "Habits", "Recipes", "Food log", "Programme", "Check-in"];
  const PH_VAL = ["Week 6 of 12", "Push Day A", "10,000 steps", "5% Mince Rice Bowl", "1,405 kcal", "Muscle Gain", "How are you feeling?"];

  /* ---------- colour + drawing helpers ---------- */
  function hexRgb(h) { h = (h || "#000").replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function alpha(h, a) { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; }
  function mix(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); }
  function lum(h) { return hexRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function textOn(h) { return contrast(h, "#FFFFFF") >= contrast(h, "#15161A") ? "#FFFFFF" : "#15161A"; }
  function pick(list, bg, min) { for (const c of list) if (contrast(c, bg) >= (min || 2.4)) return c; return textOn(bg); }
  function pal(brand) { const P = brand.primary || "#2F4A3A"; return { P, A: brand.accent || "#E2B23C", dark: brand.dark || mix(P, "#06080B", 0.8), light: brand.light || mix(P, "#FFFFFF", 0.88) }; }
  function ff(fam, wt, size) { return `${wt} ${size}px "${fam}", system-ui, sans-serif`; }
  function rr(ctx, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function cover(ctx, img, x, y, w, h) { const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; if (!iw || !ih) return; const s = Math.max(w / iw, h / ih); const dw = iw * s, dh = ih * s; ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); }
  const rnd = n => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const pad2 = n => String(n).padStart(2, "0");

  /* ---------- images + fonts ---------- */
  let onImage = () => {};
  const imgCache = new Map();
  function imgEl(src) {
    if (!src) return null;
    let e = imgCache.get(src);
    if (!e) { e = { img: new Image(), ok: false }; imgCache.set(src, e); e.img.onload = () => { e.ok = true; onImage(); }; e.img.src = src; }
    return e.ok ? e.img : null;
  }
  const fontReq = new Map();
  function ensureFonts(font) {
    const bf = bodyFontOf(font);
    const reqs = [ff(font, FW[font] || 700, 40), ff(bf, 400, 40), ff(bf, 700, 40), ff("DM Sans", 700, 40)];
    return Promise.all(reqs.map(r => { if (!fontReq.has(r)) fontReq.set(r, document.fonts.load(r).catch(() => {})); return fontReq.get(r); }));
  }

  /* ---------- text ---------- */
  const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  function tokens(title, hl) {
    const segs = []; const re = /\*([^*]+)\*/g; let last = 0, m;
    while ((m = re.exec(title))) { if (m.index > last) segs.push([title.slice(last, m.index), false]); segs.push([m[1], true]); last = re.lastIndex; }
    if (last < title.length) segs.push([title.slice(last), false]);
    const out = []; segs.forEach(([s, h]) => s.split(/\s+/).filter(Boolean).forEach(w => out.push({ t: w, hl: h })));
    const hw = String(hl || "").split(/\s+/).map(norm).filter(Boolean);
    if (hw.length) {
      const nw = out.map(o => norm(o.t));
      for (let s = 0; s + hw.length <= nw.length; s++) if (hw.every((w, k) => nw[s + k] === w)) for (let k = 0; k < hw.length; k++) out[s + k].hl = true;
    }
    return out;
  }
  function layTitle(ctx, toks, fam, wt, maxW, maxLines, size, pill) {
    const min = size * 0.5;
    for (let s = size; ; s *= 0.94) {
      ctx.font = ff(fam, wt, s); const sp = ctx.measureText(" ").width; const lines = []; let cur = [], cw = 0;
      for (const tk of toks) {
        const w = ctx.measureText(tk.t).width;
        if (cur.length && cw + sp + w > maxW) { lines.push({ tk: cur, w: cw }); cur = []; cw = 0; }
        cur.push({ t: tk.t, hl: tk.hl, w }); cw += cur.length > 1 ? sp + w : w;
      }
      if (cur.length) lines.push({ tk: cur, w: cw });
      const ok = lines.length <= maxLines && lines.every(l => l.w <= maxW);
      if (ok || s < min) return { lines: lines.slice(0, maxLines), size: s, sp, lh: s * (pill ? 1.24 : 1.1) };
    }
  }
  function wrapPlain(ctx, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean); const lines = []; let line = "";
    for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line); return lines;
  }
  function layCopy(ctx, text, fam, maxW, maxLines, size) {
    const min = size * 0.72;
    for (let s = size; ; s *= 0.94) { ctx.font = ff(fam, 400, s); const l = wrapPlain(ctx, text, maxW); if (l.length <= maxLines || s < min) return { lines: l.slice(0, maxLines), size: s, lh: s * 1.38 }; }
  }
  /* Headline + subtitle. With o.measure returns the height, otherwise draws and returns the bottom y. */
  function block(ctx, T, o) {
    const st = T.st, fam = T.font, bfam = bodyFontOf(fam), pill = st.hlMode === "pill";
    const L = T.title ? layTitle(ctx, tokens(T.title, T.hl), fam, FW[fam], o.maxW, o.titleLines || 3, T.ts * (o.scale || 1) * (st.titleScale || 1), pill) : null;
    const C = T.copy ? layCopy(ctx, T.copy, bfam, o.maxW, o.copyLines || 3, T.ts * 0.4 * (st.copyScale || 1)) : null;
    const gap = L && C ? L.size * 0.42 : 0;
    const height = (L ? L.lines.length * L.lh : 0) + gap + (C ? C.lines.length * C.lh : 0);
    if (o.measure) return height;
    let y = o.y;
    if (L) {
      ctx.font = ff(fam, FW[fam], L.size); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
      for (const ln of L.lines) {
        const lx = o.align === "right" ? o.x - ln.w : o.align === "center" ? o.x - ln.w / 2 : o.x;
        const base = y + L.size * (pill ? 0.98 : 0.9);
        if (pill) {
          let x = lx, start = null, end = 0;
          const flush = () => { if (start === null) return; const px = Math.min(L.sp * 0.8, L.size * 0.16); rr(ctx, start - px, y + L.size * 0.06, end - start + 2 * px, L.size * 1.12, L.size * 0.24); ctx.fillStyle = st.pillBg; ctx.fill(); start = null; };
          ln.tk.forEach(tk => { if (tk.hl) { if (start === null) start = x; end = x + tk.w; } else flush(); x += tk.w + L.sp; }); flush();
        }
        let x = lx;
        ln.tk.forEach(tk => { ctx.fillStyle = tk.hl ? (pill ? st.pillText : st.hl) : st.title; ctx.fillText(tk.t, x, base); x += tk.w + L.sp; });
        y += L.lh;
      }
    }
    if (C) {
      y += gap; ctx.font = ff(bfam, 400, C.size); ctx.fillStyle = st.copy; ctx.textAlign = o.align; ctx.textBaseline = "alphabetic";
      C.lines.forEach(l => { ctx.fillText(l, o.x, y + C.size * 0.95); y += C.lh; });
    }
    return y;
  }

  /* ---------- phones ---------- */
  function drawPlaceholder(ctx, x, y, w, h, i, E) {
    const p = E.p, bg = "#F7F7F9", ink = "#16171B", u = w / 100, pd = w * 0.07;
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = ink; ctx.font = ff("DM Sans", 700, u * 3.6); ctx.fillText("9:41", x + pd, y + Math.min(h * 0.03, u * 7));
    const cy = y + Math.min(h * 0.08, u * 17), hh = Math.min(h * 0.22, w * 0.55);
    rr(ctx, x + pd, cy, w - 2 * pd, hh, u * 5); ctx.fillStyle = p.dark; ctx.fill();
    ctx.textBaseline = "top"; ctx.fillStyle = alpha("#FFFFFF", 0.7); ctx.font = ff("DM Sans", 700, u * 3.3); ctx.fillText(PH_HEAD[i % 7].toUpperCase(), x + pd + u * 6, cy + u * 6);
    ctx.fillStyle = "#FFFFFF"; ctx.font = ff(E.font, FW[E.font], u * 7.5);
    wrapPlain(ctx, PH_VAL[i % 7], w - 2 * pd - u * 12).slice(0, 2).forEach((l, k) => ctx.fillText(l, x + pd + u * 6, cy + u * 12 + k * u * 8.5));
    rr(ctx, x + pd + u * 6, cy + hh - u * 9, w - 2 * pd - u * 12, u * 2.6, u * 1.3); ctx.fillStyle = alpha("#FFFFFF", 0.2); ctx.fill();
    rr(ctx, x + pd + u * 6, cy + hh - u * 9, (w - 2 * pd - u * 12) * (0.3 + 0.09 * (i % 7)), u * 2.6, u * 1.3); ctx.fillStyle = p.A; ctx.fill();
    let ry = cy + hh + u * 6; const rh = Math.min(u * 16, h * 0.075);
    for (let k = 0; k < 7 && ry + rh < y + h - pd; k++) {
      rr(ctx, x + pd, ry, w - 2 * pd, rh, u * 4); ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.strokeStyle = "#EAEBEE"; ctx.lineWidth = u * 0.4; ctx.stroke();
      rr(ctx, x + pd + u * 4, ry + rh * 0.18, rh * 0.64, rh * 0.64, u * 2.5); ctx.fillStyle = alpha(p.P, 0.18); ctx.fill();
      rr(ctx, x + pd + u * 4 + rh * 0.8, ry + rh * 0.3, (w - 2 * pd) * (0.42 - 0.05 * (k % 3)), rh * 0.14, rh * 0.07); ctx.fillStyle = alpha(ink, 0.6); ctx.fill();
      rr(ctx, x + pd + u * 4 + rh * 0.8, ry + rh * 0.56, (w - 2 * pd) * 0.26, rh * 0.12, rh * 0.06); ctx.fillStyle = alpha(ink, 0.2); ctx.fill();
      ry += rh + u * 3;
    }
  }
  function drawDevice(ctx, kind, o, E) {
    const d = DEVICE[kind]; let h = o.h, w = h * d.aspect;
    if (o.maxW && w > o.maxW) { w = o.maxW; h = w / d.aspect; }
    const r = w * d.radius, bz = w * d.bezel;
    ctx.save(); ctx.translate(o.cx, o.top + h / 2); if (o.angle) ctx.rotate(o.angle);
    const x = -w / 2, y = -h / 2;
    if (d.phone) {
      ctx.fillStyle = "#0B0C0E"; const bw = w * 0.014;
      rr(ctx, x - bw * 0.7, y + h * 0.2, bw, h * 0.045, bw / 2); ctx.fill();
      rr(ctx, x - bw * 0.7, y + h * 0.27, bw, h * 0.075, bw / 2); ctx.fill();
      rr(ctx, x - bw * 0.7, y + h * 0.36, bw, h * 0.075, bw / 2); ctx.fill();
      rr(ctx, x + w - bw * 0.3, y + h * 0.29, bw, h * 0.11, bw / 2); ctx.fill();
    }
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.32)"; ctx.shadowBlur = w * 0.14; ctx.shadowOffsetY = w * 0.05;
    rr(ctx, x, y, w, h, r); ctx.fillStyle = "#121316"; ctx.fill(); ctx.restore();
    rr(ctx, x + w * 0.005, y + w * 0.005, w - w * 0.01, h - w * 0.01, r - w * 0.005); ctx.lineWidth = w * 0.007; ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.stroke();
    const sx = x + bz, sy = y + bz, sw = w - 2 * bz, sh = h - 2 * bz;
    ctx.save(); rr(ctx, sx, sy, sw, sh, Math.max(r - bz, 0)); ctx.clip();
    if (o.img) cover(ctx, o.img, sx, sy, sw, sh); else drawPlaceholder(ctx, sx, sy, sw, sh, o.i || 0, E);
    ctx.restore();
    ctx.fillStyle = "#050506";
    if (d.notch === "island") { const iw = w * 0.28, ih = w * 0.082; rr(ctx, -iw / 2, sy + w * 0.028, iw, ih, ih / 2); ctx.fill(); }
    else if (d.notch === "hole") { ctx.beginPath(); ctx.arc(0, sy + w * 0.045, w * 0.024, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(0, y + bz / 2, bz * 0.17, 0, Math.PI * 2); ctx.fillStyle = "#2B2D33"; ctx.fill(); }
    ctx.restore();
  }

  /* ---------- shapes ---------- */
  function blob(ctx, cx, cy, r, seed) {
    const n = 7, pts = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, r2 = r * (0.78 + 0.4 * rnd(seed + k)); pts.push([cx + Math.cos(a) * r2, cy + Math.sin(a) * r2]); }
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    ctx.beginPath(); const m0 = mid(pts[n - 1], pts[0]); ctx.moveTo(m0[0], m0[1]);
    for (let k = 0; k < n; k++) { const m = mid(pts[k], pts[(k + 1) % n]); ctx.quadraticCurveTo(pts[k][0], pts[k][1], m[0], m[1]); }
    ctx.closePath();
  }
  function sparkle(ctx, x, y, r, color) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fillStyle = color; ctx.fill(); }
  function burst(ctx, x, y, r, color, lw) { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = "round"; for (let k = 0; k < 5; k++) { const a = -Math.PI * 0.95 + k * 0.32; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke(); } }

  /* ---------- styles (colour treatment) ---------- */
  const STYLES = {
    glow: { name: "Glow", desc: "Dark gradient, accent words", style(c) {
      const p = c.p;
      if (c.i === 0) {
        const top = mix(p.P, "#FFFFFF", 0.84), ink = textOn(top);
        return { paint(ctx, W, H) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(0.5, mix(p.P, "#FFFFFF", 0.35)); g.addColorStop(1, p.dark); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); },
          title: ink, hl: pick([p.P, p.A], top), copy: alpha(ink, 0.75), bg: top };
      }
      return { paint(ctx, W, H) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, p.dark); g.addColorStop(0.55, mix(p.dark, p.P, 0.25)); g.addColorStop(1, mix(p.P, p.A, 0.35)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          const rg = ctx.createRadialGradient(W, H, 0, W, H, H * 0.7); rg.addColorStop(0, alpha(p.A, 0.45)); rg.addColorStop(1, alpha(p.A, 0)); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); },
        title: "#FFFFFF", hl: pick([p.A, mix(p.P, "#FFFFFF", 0.5)], p.dark), copy: "rgba(255,255,255,0.78)", bg: p.dark };
    } },
    studio: { name: "Studio", desc: "Soft grey, calm", style(c) {
      const p = c.p, bg = mix(p.P, "#E7E8EB", 0.94);
      return { paint(ctx, W, H) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }, title: "#15161A", hl: pick([p.P, p.A], bg, 3), copy: "#5B6068", bg };
    } },
    midnight: { name: "Midnight", desc: "Alternating panels, pill words", style(c) {
      const p = c.p;
      if (c.i % 2 === 0) {
        const bg = mix(p.P, "#FFFFFF", 0.86), ink = contrast(p.dark, bg) > 4 ? p.dark : "#15161A";
        return { paint(ctx, W, H) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.fillStyle = alpha(mix(p.P, "#FFFFFF", 0.55), 0.45);
            blob(ctx, W * 1.02, H * (0.1 + 0.04 * (c.i % 3)), W * 0.42, c.i * 7 + 1); ctx.fill(); blob(ctx, -W * 0.05, H * 0.66, W * 0.38, c.i * 7 + 4); ctx.fill();
            if (c.i === 0) { sparkle(ctx, W * 0.86, H * 0.05, W * 0.055, p.dark); sparkle(ctx, W * 0.93, H * 0.085, W * 0.028, p.dark); }
            if (c.i === 4 || c.i === 6) burst(ctx, W * 0.2, H * 0.36, W * 0.16, p.P, W * 0.016); },
          title: ink, hlMode: "pill", pillBg: p.dark, pillText: "#FFFFFF", copy: alpha(ink, 0.75), hl: ink, bg };
      }
      return { paint(ctx, W, H) { ctx.fillStyle = p.dark; ctx.fillRect(0, 0, W, H); ctx.fillStyle = mix(p.dark, "#FFFFFF", 0.09);
          blob(ctx, W * 0.95, H * 0.3, W * 0.36, c.i * 5 + 2); ctx.fill(); blob(ctx, W * 0.05, H * 0.95, W * 0.4, c.i * 5 + 6); ctx.fill(); },
        title: "#FFFFFF", hlMode: "pill", pillBg: "#FFFFFF", pillText: p.dark, copy: "rgba(255,255,255,0.8)", hl: "#FFFFFF", bg: p.dark };
    } },
    clean: { name: "Clean", desc: "Bright white, colour pop", style(c) {
      const p = c.p, bg = mix(p.P, "#FFFFFF", 0.965);
      return { paint(ctx, W, H) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }, title: "#17171B", hl: pick([p.P, p.A], bg, 3), copy: "#56575F", bg };
    } },
    night: { name: "Night", desc: "Deep dark, brand glow", style(c) {
      const p = c.p;
      return { paint(ctx, W, H) { ctx.fillStyle = p.dark; ctx.fillRect(0, 0, W, H);
          const a = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 1.2); a.addColorStop(0, alpha(mix(p.P, "#FFFFFF", 0.15), 0.6)); a.addColorStop(1, alpha(p.P, 0)); ctx.fillStyle = a; ctx.fillRect(0, 0, W, H);
          const b = ctx.createRadialGradient(W, H * 0.85, 0, W, H * 0.85, W); b.addColorStop(0, alpha(p.A, 0.3)); b.addColorStop(1, alpha(p.A, 0)); ctx.fillStyle = b; ctx.fillRect(0, 0, W, H); },
        title: "#FFFFFF", hl: pick([p.A, mix(p.P, "#FFFFFF", 0.5)], p.dark), copy: "rgba(255,255,255,0.75)", bg: p.dark };
    } },
    solid: { name: "Bold Colour", desc: "Brand colour, centred", style(c) {
      const p = c.p, ink = textOn(p.P), pb = contrast(p.A, p.P) >= 1.6 ? p.A : ink;
      return { paint(ctx, W, H) { ctx.fillStyle = p.P; ctx.fillRect(0, 0, W, H); const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, "rgba(255,255,255,0.14)"); g.addColorStop(0.6, "rgba(255,255,255,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); },
        title: ink, hlMode: "pill", pillBg: pb, pillText: textOn(pb), copy: alpha(ink, 0.82), hl: ink, align: "center", bg: p.P };
    } },
    duotone: { name: "Duotone", desc: "Light top, colour slash below", style(c) {
      const p = c.p, bg = mix(p.P, "#FFFFFF", 0.93), ink = "#15161A";
      const tilt = c.i % 2 ? 1 : -1;
      return { paint(ctx, W, H) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
          ctx.beginPath(); ctx.moveTo(0, H * (0.52 - 0.08 * tilt)); ctx.lineTo(W, H * (0.52 + 0.08 * tilt)); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
          const g = ctx.createLinearGradient(0, H * 0.4, W, H); g.addColorStop(0, p.P); g.addColorStop(1, mix(p.P, p.A, 0.45)); ctx.fillStyle = g; ctx.fill(); },
        title: ink, hl: pick([p.P, p.A], bg, 3), copy: "#55575F", bg };
    } },
    spotlight: { name: "Spotlight", desc: "Lit from the centre", style(c) {
      const p = c.p, base = mix(p.P, p.dark, 0.45), ink = textOn(base);
      return { paint(ctx, W, H) { ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
          const g = ctx.createRadialGradient(W / 2, H * 0.66, 0, W / 2, H * 0.66, W * 0.95); g.addColorStop(0, alpha(mix(p.P, "#FFFFFF", 0.4), 0.95)); g.addColorStop(1, alpha(p.P, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); },
        title: ink, hl: pick([p.A, mix(p.P, "#FFFFFF", 0.6)], base), copy: alpha(ink, 0.8), bg: base };
    } },
    caps: { name: "Poster Caps", desc: "Uppercase on deep brand colour", style(c) {
      const p = c.p, base = mix(p.dark, p.P, 0.18);
      return { paint(ctx, W, H) { ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = alpha(p.P, 0.6); blob(ctx, W * (c.i % 2 ? 0.02 : 0.98), H * (0.4 + 0.07 * (c.i % 3)), W * 0.2, c.i * 11 + 5); ctx.fill(); },
        title: "#FFFFFF", hl: pick([p.A, mix(p.P, "#FFFFFF", 0.55)], base), copy: "rgba(255,255,255,0.82)", upper: true, align: "center", bg: base };
    } },
    paper: { name: "Warm Paper", desc: "Cream paper, coloured words", style(c) {
      const p = c.p, bg = mix("#FBF1E3", p.P, 0.03), ink = "#1A1714";
      return { paint(ctx, W, H) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
          const s = W * 0.05; ctx.fillStyle = "rgba(26,23,20,0.07)";
          for (let y = s / 2; y < H; y += s) for (let x = s / 2; x < W; x += s) { ctx.beginPath(); ctx.arc(x, y, W * 0.004, 0, Math.PI * 2); ctx.fill(); } },
        title: ink, hl: pick([p.P, p.A], bg, 3), copy: "#5E5750", align: "center", bg };
    } },
    impact: { name: "Big Headline", desc: "Oversized words, vivid gradient", style(c) {
      const p = c.p, deep = mix(p.P, "#000000", 0.2), top = c.i % 2 ? p.dark : deep, bot = c.i % 2 ? deep : p.dark;
      return { paint(ctx, W, H) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bot); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          const r = ctx.createRadialGradient(W * 0.5, H * 0.6, 0, W * 0.5, H * 0.6, W * 0.85); r.addColorStop(0, alpha(mix(p.P, "#FFFFFF", 0.35), 0.5)); r.addColorStop(1, alpha(p.P, 0)); ctx.fillStyle = r; ctx.fillRect(0, 0, W, H); },
        title: "#FFFFFF", hl: pick([p.A, mix(p.P, "#FFFFFF", 0.6)], p.dark), copy: "rgba(255,255,255,0.86)", titleScale: 1.3, copyScale: 1.3, bg: top };
    } },
    cover: { name: "Colour Cover", desc: "Solid colour cover, light screens", style(c) {
      const p = c.p;
      if (c.i === 0) { const ink = textOn(p.P); return { paint(ctx, W, H) { ctx.fillStyle = p.P; ctx.fillRect(0, 0, W, H); }, title: ink, hl: contrast(p.A, p.P) >= 2 ? p.A : ink, copy: alpha(ink, 0.82), align: "center", bg: p.P }; }
      const bg = mix(p.P, "#FFFFFF", 0.9), ink = "#16151A";
      return { paint(ctx, W, H) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }, title: ink, hl: pick([p.P, p.A], bg, 3), copy: "#55545C", align: "center", bg };
    } }
  };

  /* ---------- background patterns (drawn in strip coordinates so they flow across screens) ---------- */
  function strokeLines(ctx, c, a, lw) { ctx.strokeStyle = alpha(c.fg, a); ctx.lineWidth = lw; ctx.lineCap = "round"; }
  const PATTERNS = {
    none: { name: "None", draw() {} },
    dots: { name: "Dots", draw(ctx, W, H, c) {
      const s = W * 0.055, r = W * 0.0055, off = (c.i * W) % s; ctx.fillStyle = alpha(c.fg, 0.14);
      for (let y = s / 2; y < H; y += s) for (let x = s / 2 - off; x < W + s; x += s) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    } },
    grid: { name: "Grid", draw(ctx, W, H, c) {
      const s = W * 0.075, off = (c.i * W) % s; strokeLines(ctx, c, 0.09, W * 0.002); ctx.beginPath();
      for (let x = -off; x < W + s; x += s) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = 0; y < H; y += s) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke();
    } },
    diagonal: { name: "Stripes", draw(ctx, W, H, c) {
      const s = W * 0.06; strokeLines(ctx, c, 0.08, W * 0.006); ctx.beginPath();
      const start = Math.floor((c.i * W - H) / s) * s;
      for (let t = start; t < c.i * W + W + s; t += s) { const x0 = t - c.i * W; ctx.moveTo(x0, 0); ctx.lineTo(x0 + H, H); } ctx.stroke();
    } },
    waves: { name: "Waves", draw(ctx, W, H, c) {
      strokeLines(ctx, c, 0.12, W * 0.005);
      for (let k = 0; k < 9; k++) { ctx.beginPath(); for (let x = -10; x <= W + 10; x += W / 50) { const gx = x + c.i * W; const y = H * (0.08 + 0.11 * k) + H * 0.022 * Math.sin((gx / W) * 2.4 + k * 0.7); x === -10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
    } },
    topo: { name: "Contours", draw(ctx, W, H, c) {
      strokeLines(ctx, c, 0.11, W * 0.0035);
      for (let j = -1; j < 6; j++) {
        const gx = (j + 0.6) * W * 1.45, cx = gx - c.i * W; if (cx < -W * 1.3 || cx > W * 2.3) continue;
        const cy = H * (j % 2 ? 0.28 : 0.72);
        for (let k = 1; k <= 11; k++) { const base = W * 0.07 * k; ctx.beginPath();
          for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 40) { const r = base * (1 + 0.12 * Math.sin(a * 3 + j + k * 0.3) + 0.06 * Math.sin(a * 5 + k)); const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 1.2; a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
          ctx.stroke(); }
      }
    } },
    rings: { name: "Rings", draw(ctx, W, H, c) {
      strokeLines(ctx, c, 0.1, W * 0.004);
      [[W * 0.9, H * 0.16], [W * 0.08, H * 0.88]].forEach(([x, y]) => { for (let k = 1; k <= 10; k++) { ctx.beginPath(); ctx.arc(x, y, W * 0.065 * k, 0, Math.PI * 2); ctx.stroke(); } });
    } },
    halftone: { name: "Halftone", draw(ctx, W, H, c) {
      const s = W * 0.045; ctx.fillStyle = alpha(c.fg, 0.16);
      for (let y = s / 2; y < H; y += s) for (let x = s / 2; x < W; x += s) {
        const t = Math.max(0, Math.min(1, ((x / W) * 0.5 + (y / H) - 0.55) / 0.9)); if (t <= 0) continue;
        ctx.beginPath(); ctx.arc(x, y, s * 0.42 * t, 0, Math.PI * 2); ctx.fill(); }
    } },
    confetti: { name: "Confetti", draw(ctx, W, H, c) {
      const cols = [c.p.A, c.p.P, c.fg];
      for (let k = 0; k < 22; k++) {
        const r1 = rnd(c.i * 131 + k), r2 = rnd(c.i * 71 + k * 3), r3 = rnd(k * 17 + c.i);
        const x = W * r1, y = H * (0.03 + 0.94 * r2), s = W * (0.015 + 0.025 * r3), col = cols[k % 3];
        ctx.save(); ctx.translate(x, y); ctx.rotate(r3 * 6.28); ctx.globalAlpha = 0.55;
        ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = s * 0.35; ctx.lineCap = "round";
        const t = k % 4;
        if (t === 0) { ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2); ctx.fill(); }
        else if (t === 1) { ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.9, s * 0.6); ctx.lineTo(-s * 0.9, s * 0.6); ctx.closePath(); ctx.fill(); }
        else if (t === 2) { ctx.beginPath(); ctx.moveTo(-s, 0); ctx.bezierCurveTo(-s * 0.5, -s, s * 0.5, s, s, 0); ctx.stroke(); }
        else { ctx.beginPath(); ctx.moveTo(-s * 0.7, 0); ctx.lineTo(s * 0.7, 0); ctx.moveTo(0, -s * 0.7); ctx.lineTo(0, s * 0.7); ctx.stroke(); }
        ctx.restore();
      }
    } },
    ribbon: { name: "Ribbon", draw(ctx, W, H, c) {
      ctx.save(); ctx.translate(-c.i * W, 0);
      const g = ctx.createLinearGradient(0, 0, W * c.n, 0); g.addColorStop(0, alpha(c.p.A, 0.85)); g.addColorStop(1, alpha(mix(c.p.P, "#FFFFFF", 0.3), 0.85));
      const x0 = c.i * W - W * 0.05, x1 = (c.i + 1) * W + W * 0.05, step = W / 40;
      const yc = gx => H * (0.6 + 0.13 * Math.sin((gx / W) * 1.9 + 0.4)), th = gx => H * 0.07 * (1 + 0.3 * Math.sin((gx / W) * 0.9));
      ctx.beginPath(); for (let gx = x0; gx <= x1; gx += step) { const y = yc(gx) - th(gx); gx === x0 ? ctx.moveTo(gx, y) : ctx.lineTo(gx, y); }
      for (let gx = x1; gx >= x0; gx -= step) ctx.lineTo(gx, yc(gx) + th(gx)); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
      ctx.restore();
    } },
    watermark: { name: "Big type", draw(ctx, W, H, c) {
      const txt = (c.brand.appName || "YOUR APP").toUpperCase(); ctx.font = ff(c.font, FW[c.font], H * 0.2);
      ctx.fillStyle = alpha(c.fg, 0.07); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
      const tw = ctx.measureText(txt + "  ").width; let x = W * 0.05 - ((c.i * W) % tw);
      for (; x < W; x += tw) { ctx.fillText(txt, x, H * 0.56); ctx.fillText(txt, x - tw / 2, H * 0.98); }
    } },
    blobs: { name: "Blobs", draw(ctx, W, H, c) {
      ctx.fillStyle = alpha(c.p.A, 0.22); blob(ctx, W * (0.85 - 0.1 * (c.i % 2)), H * 0.22, W * 0.4, c.i * 9 + 3); ctx.fill();
      ctx.fillStyle = alpha(c.fg, 0.07); blob(ctx, W * 0.1, H * (0.72 + 0.05 * (c.i % 3)), W * 0.5, c.i * 9 + 7); ctx.fill();
    } }
  };

  /* ---------- cover badges (laurel wreaths) ---------- */
  function laurel(ctx, cx, cy, r, color) {
    ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = r * 0.04; ctx.lineCap = "round";
    [-1, 1].forEach(side => {
      const at = t => [cx + side * Math.cos(t) * r, cy - Math.sin(t) * r];
      ctx.beginPath(); for (let k = 0; k <= 24; k++) { const t = -1.05 + 2.25 * k / 24, q = at(t); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); } ctx.stroke();
      for (let k = 0; k < 7; k++) {
        const t = -0.95 + 2.05 * k / 6, q = at(t), tan = Math.atan2(-Math.cos(t), -side * Math.sin(t)), sz = 1 - k * 0.06;
        [[-side * 0.62, 0.09], [side * 0.62, -0.05]].forEach(([tilt, out], n) => {
          ctx.save(); ctx.translate(q[0] + side * Math.cos(t) * r * out, q[1] - Math.sin(t) * r * out); ctx.rotate(tan + tilt);
          ctx.beginPath(); ctx.ellipse(0, 0, r * (n ? 0.12 : 0.16) * sz, r * (n ? 0.05 : 0.065) * sz, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        });
      }
    });
    ctx.restore();
  }
  function drawBadges(ctx, L, y, align) {
    const list = ((L.brand.badges || [])).map(b => String(b || "").trim()).filter(Boolean).slice(0, 2);
    if (!list.length) return y;
    const st = L.T.st, r = Math.min(L.W * 0.13, L.H * 0.06), gap = r * 0.5, total = list.length * 2.3 * r + (list.length - 1) * gap;
    let x = align === "center" ? (L.W - total) / 2 : align === "right" ? L.W - L.pad - total : L.pad - r * 0.1;
    const cy = y + L.H * 0.02 + r, ink = st.hlMode === "pill" ? st.title : st.title;
    list.forEach(txt => {
      const cx = x + 1.15 * r; laurel(ctx, cx, cy, r, alpha(ink, 0.9));
      const sp = txt.indexOf(" "), big = sp > 0 ? txt.slice(0, sp) : txt, small = sp > 0 ? txt.slice(sp + 1) : "";
      ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      let bs = r * 0.5; ctx.font = ff(L.T.font, FW[L.T.font], bs); while (ctx.measureText(big).width > r * 1.35 && bs > r * 0.2) { bs *= 0.92; ctx.font = ff(L.T.font, FW[L.T.font], bs); }
      ctx.fillText(big, cx, small ? cy - r * 0.14 : cy);
      if (small) { const bf = bodyFontOf(L.T.font); let ss = r * 0.24; ctx.font = ff(bf, 700, ss); while (ctx.measureText(small).width > r * 1.4 && ss > r * 0.12) { ss *= 0.92; ctx.font = ff(bf, 700, ss); } ctx.fillText(small, cx, cy + r * 0.3); }
      x += 2.3 * r + gap;
    });
    return cy + r + L.H * 0.012;
  }

  /* ---------- layouts (where text and phones go) ---------- */
  function logoHeader(ctx, L, align, y) {
    const logo = imgEl(L.brand.logo); if (!logo || L.i !== 0) return y;
    const lh = L.H * 0.042, nw = logo.naturalWidth || 300, nh = logo.naturalHeight || 100;
    let lw = lh * nw / nh, lhh = lh; if (lw > L.W * 0.5) { lw = L.W * 0.5; lhh = lw * nh / nw; }
    const x = align === "center" ? L.W / 2 - lw / 2 : align === "right" ? L.W - L.pad - lw : L.pad;
    ctx.drawImage(logo, x, y + (lh - lhh) / 2, lw, lhh); return y + lh + L.H * 0.022;
  }
  function topText(ctx, L, align) {
    align = align || L.align; const x = align === "center" ? L.W / 2 : L.pad;
    let y = logoHeader(ctx, L, align, L.H * (L.i === 0 ? 0.065 : 0.07));
    y = block(ctx, L.T, { x, y, maxW: L.W * 0.83, align, titleLines: 3, copyLines: 3 });
    return L.i === 0 ? drawBadges(ctx, L, y, align) : y;
  }
  function bottomText(ctx, L, align) {
    align = align || L.align; const x = align === "center" ? L.W / 2 : align === "right" ? L.W - L.pad : L.pad;
    const hgt = block(ctx, L.T, { measure: true, maxW: L.W * 0.8 });
    const logo = L.i === 0 && imgEl(L.brand.logo) ? L.H * 0.064 : 0;
    const y0 = L.H * 0.95 - hgt - logo;
    const y = logoHeader(ctx, L, align, y0);
    block(ctx, L.T, { x, y, maxW: L.W * 0.8, align });
  }
  const dev = (ctx, L, o) => drawDevice(ctx, L.k.kind, Object.assign({ img: L.k.img, i: L.i }, o), L.E);
  /* Each screen shows only its own screenshot; phones may cross into the neighbouring screens.
     place(j) gives phone j's position in its own screen, so the parts that cross a join line up. */
  function spread(textAt, place) {
    return function (ctx, L) {
      const { W, H, i } = L;
      if (textAt(i) === "bottom") bottomText(ctx, L, L.align === "center" ? "center" : "right"); else topText(ctx, L);
      for (const j of [i - 1, i + 1, i]) {
        if (j < 0 || j > 6) continue;
        const kj = L.kOf(j), p = place(j, W, H);
        drawDevice(ctx, kj.kind, Object.assign({}, p, { cx: p.cx + (j - i) * W, img: kj.img, i: j }), L.E);
      }
    };
  }
  const LAYOUTS = {
    classic: { name: "Classic", desc: "Tilted cover, then upright", draw(ctx, L) {
      const { W, H, i, k } = L, tilt = k.tablet ? -0.14 : -0.3;
      if (i === 0) { const y = topText(ctx, L); dev(ctx, L, { cx: W * 0.42, top: Math.max(y + H * 0.09, H * 0.36), h: H * 0.82, maxW: W * 0.92, angle: tilt }); }
      else if (i === 1) { dev(ctx, L, { cx: W * 0.5, top: -H * 0.17, h: H * 0.8, maxW: W * 0.92, angle: tilt }); bottomText(ctx, L, L.align === "center" ? "center" : "right"); }
      else {
        const y = topText(ctx, L), top = Math.max(y + H * 0.045, H * 0.28);
        dev(ctx, L, { cx: W / 2, top, h: H * 0.82, maxW: W * 0.82 });
      }
    } },
    centred: { name: "Centred", desc: "Whole phone, centred", draw(ctx, L) {
      const { W, H } = L, y = topText(ctx, L, "center"), top = Math.max(y + H * 0.04, H * 0.27);
      dev(ctx, L, { cx: W / 2, top, h: H * 0.965 - top, maxW: W * 0.74 });
    } },
    tilted: { name: "Tilted", desc: "Phones lean left and right", draw(ctx, L) {
      const { W, H, i, k } = L, y = topText(ctx, L), dir = i % 2 ? 1 : -1;
      dev(ctx, L, { cx: W * (0.5 + 0.06 * dir), top: Math.max(y + H * 0.06, H * 0.32), h: H * 0.82, maxW: W * 0.8, angle: 0.15 * dir * (k.tablet ? 0.5 : 1) });
    } },
    below: { name: "Text below", desc: "Phone from the top", draw(ctx, L) {
      const { W, H } = L; dev(ctx, L, { cx: W / 2, top: -H * 0.1, h: H * 0.74, maxW: W * 0.78 }); bottomText(ctx, L);
    } },
    side: { name: "Side peek", desc: "Phone hugs alternate edges", draw(ctx, L) {
      const { W, H, i } = L, y = topText(ctx, L), right = i % 2 === 0;
      dev(ctx, L, { cx: W * (right ? 0.7 : 0.3), top: Math.max(y + H * 0.05, H * 0.3), h: H * 0.82, maxW: W * 0.86 });
    } },
    zoom: { name: "Big zoom", desc: "Oversized, top of screen", draw(ctx, L) {
      const { W, H } = L, y = topText(ctx, L);
      dev(ctx, L, { cx: W / 2, top: Math.max(y + H * 0.04, H * 0.26), h: H * 1.15, maxW: W * 0.94 });
    } },
    span: { name: "Span", desc: "Cover phone crosses into screen 2", draw(ctx, L) {
      const { W, H, i } = L;
      const k0 = L.kOf(0), k1 = L.kOf(1), tilt = k0.tablet ? -0.16 : -0.32;
      const p1 = { cx: W * 0.8, top: H * 0.3, h: H * 0.82, maxW: W * 0.8, angle: tilt, img: k1.img, i: 1 };
      if (i > 1) { LAYOUTS.classic.draw(ctx, L); if (i === 2) drawDevice(ctx, k1.kind, Object.assign({}, p1, { cx: p1.cx - W }), L.E); return; }
      topText(ctx, L, i === 1 && L.align !== "center" ? "left" : undefined);
      if (i === 1) drawDevice(ctx, k1.kind, p1, L.E);
      drawDevice(ctx, k0.kind, { cx: W - i * W, top: H * 0.36, h: H * 0.92, maxW: W, angle: tilt, img: k0.img, i: 0 }, L.E);
    } },
    flow: { name: "Flow", desc: "Tilted phones lean into the next screen", draw: spread(() => "top", (j, W, H) => ({ cx: W * 0.9, top: H * (j % 2 ? 0.35 : 0.42), h: H * 0.76, maxW: W * 0.7, angle: j % 2 ? 0.09 : -0.09 })) },
    bridge: { name: "Bridge", desc: "Pairs of phones meet at the join", draw: spread(() => "top", (j, W, H) => j === 0
      ? { cx: W * 0.5, top: H * 0.4, h: H * 0.8, maxW: W * 0.78 }
      : { cx: W * (j % 2 ? 0.74 : 0.26), top: H * 0.4, h: H * 0.82, maxW: W * 0.76, angle: j % 2 ? -0.17 : 0.17 }) },
    stagger: { name: "Stagger", desc: "Upright phones, high then low", draw: spread(() => "top", (j, W, H) => ({ cx: W * 0.74, top: H * (j % 2 ? 0.31 : 0.43), h: H * 0.8, maxW: W * 0.76 })) },
    diagonal: { name: "Diagonal", desc: "Phones slide down into the next screen", draw: spread(() => "top", (j, W, H) => ({ cx: W * 0.6, top: H * 0.4, h: H * 0.9, maxW: W * 0.86, angle: -0.27 })) },
    wave: { name: "Wave", desc: "Text swaps top and bottom", draw: spread(j => (j % 2 ? "bottom" : "top"), (j, W, H) => j % 2
      ? { cx: W * 0.34, top: -H * 0.12, h: H * 0.8, maxW: W * 0.76, angle: 0.1 }
      : { cx: W * 0.68, top: H * 0.4, h: H * 0.82, maxW: W * 0.76, angle: -0.1 }) },
    rise: { name: "Rise", desc: "Each phone sits higher than the last", draw: spread(() => "top", (j, W, H) => ({ cx: W * 0.76, top: H * (0.58 - j * 0.04), h: H * 0.8, maxW: W * 0.76, angle: -0.05 })) },
    angled: { name: "Angled", desc: "Big phone off the corner", draw(ctx, L) {
      const { W, H, i, k } = L, y = topText(ctx, L), dir = i % 2 ? -1 : 1;
      dev(ctx, L, { cx: W * (0.5 + 0.12 * dir), top: Math.max(y + H * 0.08, H * 0.34), h: H * 0.95, maxW: W, angle: 0.24 * dir * (k.tablet ? 0.5 : 1) });
    } }
  };

  /* ---------- compose ---------- */
  function kindsFor(size, sc) {
    if (size.form === "tablet" && sc.tabletImg) return { kind: size.platform === "apple" ? "ipad" : "atablet", img: imgEl(sc.tabletImg), tablet: true };
    return { kind: size.platform === "apple" ? "iphone" : "android", img: imgEl(sc.img) };
  }
  function screenText(i, data, opts) {
    const sc = data.screens[i] || {};
    if (opts && opts.sampleFill && !sc.title && !sc.copy) { const s = SAMPLE[i]; return { title: i === 0 ? (data.brand.appName || s[0]) : s[0], hl: s[1], copy: s[2] }; }
    return { title: sc.title || "", hl: sc.hl || "", copy: sc.copy || "" };
  }
  function normDesign(d) { d = d || {}; return { style: STYLES[d.style] ? d.style : "glow", pattern: PATTERNS[d.pattern] ? d.pattern : "none", layout: LAYOUTS[d.layout] ? d.layout : "classic" }; }
  function drawScreen(ctx, W, H, size, i, data, design, opts) {
    design = normDesign(design);
    const brand = data.brand, p = pal(brand), font = FW[brand.font] !== undefined ? brand.font : "Montserrat";
    const st = STYLES[design.style].style({ i, p });
    const sc = data.screens[i] || {}, tx = screenText(i, data, opts), E = { p, font };
    const T = { st, font, ts: Math.min(W * 0.095, H * 0.048), title: st.upper ? tx.title.toUpperCase() : tx.title, hl: tx.hl, copy: tx.copy };
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    st.paint(ctx, W, H);
    ctx.save(); PATTERNS[design.pattern].draw(ctx, W, H, { i, n: 7, p, fg: st.title, brand, font }); ctx.restore();
    LAYOUTS[design.layout].draw(ctx, { W, H, i, T, E, k: kindsFor(size, sc), kOf: j => kindsFor(size, data.screens[j] || {}), brand, screens: data.screens, pad: W * 0.085, align: st.align || "left" });
    ctx.restore();
  }
  function drawFeature(ctx, W, H, data, design, opts) {
    design = normDesign(design);
    const brand = data.brand, p = pal(brand), font = FW[brand.font] !== undefined ? brand.font : "Montserrat";
    const st = STYLES[design.style].style({ i: 0, p }), E = { p, font };
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip(); st.paint(ctx, W, H);
    ctx.save(); PATTERNS[design.pattern].draw(ctx, W, H, { i: 0, n: 7, p, fg: st.title, brand, font }); ctx.restore();
    const pad = W * 0.06; let y = H * 0.15; const logo = imgEl(brand.logo);
    if (logo) { const lh = H * 0.15, nw = logo.naturalWidth || 300, nh = logo.naturalHeight || 100; let lw = lh * nw / nh, lhh = lh; if (lw > W * 0.36) { lw = W * 0.36; lhh = lw * nh / nw; } ctx.drawImage(logo, pad, y + (lh - lhh) / 2, lw, lhh); y += lh + H * 0.06; }
    const tx = screenText(0, data, opts);
    block(ctx, { st, font, ts: H * 0.13, title: st.upper ? tx.title.toUpperCase() : tx.title, hl: tx.hl, copy: tx.copy }, { x: pad, y, maxW: W * 0.48, align: "left", titleLines: 2, copyLines: 2 });
    const s = data.screens;
    drawDevice(ctx, "android", { cx: W * 0.69, top: H * 0.2, h: H * 1.05, angle: 0.12, img: imgEl((s[1] || s[0] || {}).img), i: 1 }, E);
    drawDevice(ctx, "android", { cx: W * 0.85, top: H * 0.06, h: H * 1.12, angle: -0.08, img: imgEl((s[0] || {}).img), i: 0 }, E);
    ctx.restore();
  }

  /* ---------- brief data ---------- */
  function emptyScreens() { return Array.from({ length: 7 }, () => ({ title: "", hl: "", copy: "", img: null, tabletImg: null })); }
  function emptyBrief() { return { kind: "store-screen-brief", version: 3, contact: { name: "", email: "", notes: "" }, brand: { appName: "", logo: null, primary: "#6C55A3", accent: "#F5B83D", dark: null, light: null, font: "Montserrat", badges: ["", ""] }, screens: emptyScreens() }; }
  function sampleBrief() { const b = emptyBrief(); b.brand.appName = "Forge Coaching"; b.brand.badges = ["4.9 rating", "10K+ members"]; b.screens = SAMPLE.map(x => ({ title: x[0], hl: x[1], copy: x[2], img: null, tabletImg: null })); return b; }
  function cleanBrief(d) {
    const b = emptyBrief(); d = d || {};
    const hex = v => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null);
    const img = v => (typeof v === "string" && v.startsWith("data:image") ? v : null);
    const s = (v, n) => String(v == null ? "" : v).slice(0, n);
    const br = d.brand || {}, ct = d.contact || {};
    b.contact = { name: s(ct.name, 80), email: s(ct.email, 120), notes: s(ct.notes, 2000) };
    b.brand = { appName: s(br.appName, 40), logo: img(br.logo), primary: hex(br.primary) || b.brand.primary, accent: hex(br.accent) || b.brand.accent, dark: hex(br.dark), light: hex(br.light), font: FW[br.font] !== undefined ? br.font : "Montserrat", badges: [0, 1].map(k => s((br.badges || [])[k], 22)) };
    b.screens = b.screens.map((e, i) => { const x = (d.screens || [])[i] || {}; return { title: s(x.title, 80), hl: s(x.hl, 60), copy: s(x.copy, 160), img: img(x.img), tabletImg: img(x.tabletImg) }; });
    return b;
  }
  function processImage(file, maxW, type) {
    return new Promise((res, rej) => {
      const r = new FileReader(); r.onerror = rej;
      r.onload = () => {
        if (file.type === "image/svg+xml") { res(r.result); return; }
        const im = new Image(); im.onerror = rej;
        im.onload = () => {
          const s = Math.min(1, maxW / (im.naturalWidth || maxW));
          const cv = document.createElement("canvas"); cv.width = Math.round(im.naturalWidth * s); cv.height = Math.round(im.naturalHeight * s);
          const x = cv.getContext("2d"); if (type === "image/jpeg") { x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, cv.width, cv.height); }
          x.drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL(type, 0.9));
        };
        im.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  global.SSS = {
    FONTS, FW, SIZES, PREVIEW_SIZE, DEVICE, SAMPLE, STYLES, PATTERNS, LAYOUTS,
    pal, mix, alpha, rr, pad2, ensureFonts, imgEl, setOnImage: fn => { onImage = fn; },
    drawScreen, drawFeature, normDesign, emptyBrief, sampleBrief, cleanBrief, processImage
  };
})(window);
