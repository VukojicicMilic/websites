/* Redact extension: Dual Coding Organisers
   Build "words + visuals" teaching diagrams from simple text and export them as a vector PDF.
   Inspired by the dual-coding approach to teaching (pair concise words with a clear visual structure).
   These are generic organiser types drawn by this extension; no artwork or text from any book is reproduced.

   Front matter (optional, between --- lines):  title  author  page: landscape|portrait|letter|letter-portrait
                                                 palette: multi|red|blue|teal|green|orange|purple|grey|#rrggbb
                                                 footer  cover: yes|no
   Every diagram starts with a line  @type Title  and fills one page. Extra lines in any diagram:
        note: a short caption          color: teal            (overrides the palette for that page)
   Any item can start with an icon:   [star] Text      Icons: star tick cross question bang bulb heart clock
                                                       book person arrow target flag speech eye

   @flow Title        one step per line (snakes across rows, numbered, with arrows)
   @cycle Title       one stage per line; optional   center: text
   @timeline Title    date | event      (the date part is optional)
   @venn Title        A = Name   B = Name   C = Name (optional)     then   A: item   B: item   AB: item   ABC: item ...
   @tree Title        indented list (2 spaces per level); the first line is the top box
   @mindmap Title     indented list; the first line is the centre
   @matrix Title      pipe table; first row = column headings, first column = row labels
   @quadrant Title    x: low | high    y: low | high    TL: text   TR: text   BL: text   BR: text   (repeat a key for more lines)
   @cause Title       effect: text    then one cause per line (indented lines = sub-causes)   [fishbone]
   @pyramid Title     top level first;  Label | optional description shown at the right
   @frayer Title      first line = the term, then  definition: / characteristics: / examples: / non-examples:
   @icons Title       a picture list of every built-in icon
   % comment lines are ignored.
   Limits: standard PDF fonts (Helvetica); letters outside Latin-1 are simplified (ć->c, đ->d); text is shrunk to fit
   but very long lists may still become small; diagrams are one per page.

   RED TEMPLATE: put  template: red  in the front matter for 16:9 slides in the Redact red look (red square + rule
   header, red title slide, red-and-grey palette), matching the PDF slide exporter.
   PRESENTATION MODE (command "Export presentation as PDF"): mix text slides and diagrams in one document.
     # Deck title (plain lines after it = subtitle)      ## Heading = new slide        --- = new slide without heading
     - bullets (indent = sub-bullets)   > quote   ``` code ```   plain paragraphs   [icon] at the start of a bullet = icon bullet
     key: one sentence                  highlighted "key idea" box with a bulb
     visual: flow | cycle | timeline | pyramid | tree | mindmap | matrix | venn ...   draw this slide's bullets as that diagram
     visual: flow+text                  bullets on the left, the diagram on the right
     @flow Title ... (any diagram above) a full diagram slide
     Front matter: agenda: yes (roadmap slide after the title)   recap: yes (mind map of all slide headings at the end) */
editor.registerExtension({
  id: "dual-coding",
  name: "Dual Coding Organisers",
  version: "1.0.0",
  author: "Redact user",
  description: "Turn text into graphic organisers (flow, cycle, timeline, Venn, tree, mind map, matrix, fishbone, pyramid...) and export as PDF.",
  activate(api) {
    /* ---------- Helvetica metrics (ASCII 32-126) ---------- */
    const D = "556 556 556 556 556 556 556 556 556 556";
    const WT = {
      R: ("278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 " + D + " 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 " +
        "278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584").split(" ").map(Number),
      B: ("278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 " + D + " 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 " +
        "333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584").split(" ").map(Number)
    };
    WT.I = WT.R;
    const cw = (ch, fnt) => { if (fnt === "M") return 600; const c = ch.charCodeAt(0); return c >= 32 && c <= 126 ? WT[fnt === "B" ? "B" : "R"][c - 32] : 556; };
    const sw = (s, size, fnt) => { let w = 0; for (const ch of s) w += cw(ch, fnt); return w * size / 1000; };
    const WIN = { "€": 128, "…": 133, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151, "š": 154, "Š": 138, "ž": 158, "Ž": 142 };
    const SIMPLE = { "đ": "d", "Đ": "D", "ł": "l", "Ł": "L" };
    const esc = s => {
      let o = "";
      for (const ch of s) {
        let c = ch.charCodeAt(0);
        if (!(c >= 32 && c <= 126)) {
          if (WIN[ch]) c = WIN[ch]; else if (c >= 160 && c <= 255) c = c; else { const b = SIMPLE[ch] || ch.normalize("NFD")[0]; c = b && b.charCodeAt(0) < 127 && b.charCodeAt(0) >= 32 ? b.charCodeAt(0) : 63; }
        }
        o += c < 32 || c > 126 || c === 40 || c === 41 || c === 92 ? "\\" + c.toString(8).padStart(3, "0") : String.fromCharCode(c);
      }
      return o;
    };
    const f = n => (+n).toFixed(2);

    /* ---------- colour ---------- */
    const MULTI = ["1f6fb2", "c41230", "138a7e", "d97706", "6b3fa0", "2e7d32"];
    const NAMED = { red: "c41230", blue: "1f6fb2", teal: "138a7e", green: "2e7d32", orange: "d97706", purple: "6b3fa0", grey: "555555", gray: "555555", black: "222222" };
    const colorOf = s => { if (!s) return null; s = s.trim().toLowerCase().replace(/^#/, ""); return NAMED[s] || (/^[0-9a-f]{6}$/.test(s) ? s : null); };
    const hex = h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    const C = h => hex(h).map(v => v.toFixed(3)).join(" ");
    const mix = (h, t) => hex(h).map(v => (v + (1 - v) * t).toFixed(3)).join(" ");
    const INK = "0.13 g", GREY = "0.45 g", WHITE = "1 g", LIGHT = "0.8 0.8 0.8";

    /* ---------- drawing primitives (all colours are "r g b" strings) ---------- */
    let P, PW = 842, PH = 595, pal = i => MULTI[i % 6];
    const cmd = s => P.push(s);
    const seg = (x1, y1, x2, y2) => f(x1) + " " + f(y1) + " m " + f(x2) + " " + f(y2) + " l";
    const poly = pts => pts.map((p, i) => f(p[0]) + " " + f(p[1]) + (i ? " l" : " m")).join(" ") + " h";
    const rr = (x, y, w, h, r) => {
      r = Math.max(0, Math.min(r, w / 2, h / 2)); const k = r * .4477;
      return [f(x + r) + " " + f(y) + " m", f(x + w - r) + " " + f(y) + " l",
        f(x + w - k) + " " + f(y) + " " + f(x + w) + " " + f(y + k) + " " + f(x + w) + " " + f(y + r) + " c", f(x + w) + " " + f(y + h - r) + " l",
        f(x + w) + " " + f(y + h - k) + " " + f(x + w - k) + " " + f(y + h) + " " + f(x + w - r) + " " + f(y + h) + " c", f(x + r) + " " + f(y + h) + " l",
        f(x + k) + " " + f(y + h) + " " + f(x) + " " + f(y + h - k) + " " + f(x) + " " + f(y + h - r) + " c", f(x) + " " + f(y + r) + " l",
        f(x) + " " + f(y + k) + " " + f(x + k) + " " + f(y) + " " + f(x + r) + " " + f(y) + " c h"].join(" ");
    };
    const ell = (cx, cy, rx, ry) => {
      const k = .5523;
      return f(cx + rx) + " " + f(cy) + " m " + f(cx + rx) + " " + f(cy + k * ry) + " " + f(cx + k * rx) + " " + f(cy + ry) + " " + f(cx) + " " + f(cy + ry) + " c " +
        f(cx - k * rx) + " " + f(cy + ry) + " " + f(cx - rx) + " " + f(cy + k * ry) + " " + f(cx - rx) + " " + f(cy) + " c " +
        f(cx - rx) + " " + f(cy - k * ry) + " " + f(cx - k * rx) + " " + f(cy - ry) + " " + f(cx) + " " + f(cy - ry) + " c " +
        f(cx + k * rx) + " " + f(cy - ry) + " " + f(cx + rx) + " " + f(cy - k * ry) + " " + f(cx + rx) + " " + f(cy) + " c h";
    };
    const paint = (path, o) => {
      o = o || {}; let s = "q ";
      if (o.alpha) s += "/GA gs ";
      if (o.fill) s += o.fill + " rg ";
      if (o.stroke) s += o.stroke + " RG " + f(o.lw || 1) + " w 1 J 1 j ";
      if (o.dash) s += o.dash + " d ";
      cmd(s + path + " " + (o.fill && o.stroke ? "B" : o.fill ? "f" : "S") + " Q");
    };
    const head = (x, y, a, hs, c) => {
      const ca = Math.cos(a), sa = Math.sin(a);
      paint(poly([[x, y], [x - ca * hs + sa * hs * .45, y - sa * hs - ca * hs * .45], [x - ca * hs - sa * hs * .45, y - sa * hs + ca * hs * .45]]), { fill: c });
    };
    const arrow = (x1, y1, x2, y2, c, lw) => {
      const a = Math.atan2(y2 - y1, x2 - x1), hs = lw * 2.6 + 5;
      paint(seg(x1, y1, x2 - Math.cos(a) * hs * .8, y2 - Math.sin(a) * hs * .8), { stroke: c, lw }); head(x2, y2, a, hs, c);
    };
    const FN = { R: "F1", B: "F2", I: "F3", M: "F4" };
    const T = (s, fnt, size, x, y, col) => cmd("BT " + (col || INK) + " /" + FN[fnt] + " " + f(size) + " Tf " + f(x) + " " + f(y) + " Td (" + esc(s) + ") Tj ET");
    const TC = (s, fnt, size, cx, y, col) => T(s, fnt, size, cx - sw(s, size, fnt) / 2, y, col);
    const TV = (s, fnt, size, x, cy, col) => cmd("BT " + (col || INK) + " /" + FN[fnt] + " " + f(size) + " Tf 0 1 -1 0 " + f(x) + " " + f(cy - sw(s, size, fnt) / 2) + " Tm (" + esc(s) + ") Tj ET");

    /* ---------- text fitting ---------- */
    function wrap(text, size, maxW, fnt) {
      const out = [];
      for (const para of String(text).split("\n")) {
        let line = "";
        for (let word of para.split(/\s+/).filter(Boolean)) {
          while (sw(word, size, fnt) > maxW && word.length > 1) {
            let n = word.length; while (n > 1 && sw(word.slice(0, n), size, fnt) > maxW) n--;
            if (line) { out.push(line); line = ""; } out.push(word.slice(0, n)); word = word.slice(n);
          }
          const tr = line ? line + " " + word : word;
          if (sw(tr, size, fnt) <= maxW) line = tr; else { out.push(line); line = word; }
        }
        out.push(line);
      }
      return out;
    }
    function fit(text, w, h, size0, fnt) {
      let s = size0, L;
      for (; s >= 6; s -= .5) { L = wrap(text, s, w, fnt); if (L.length * s * 1.2 <= h) return { L, s }; }
      return { L: wrap(text, 6, w, fnt), s: 6 };
    }
    function drawFit(text, cx, cy, w, h, size0, fnt, col, align) {
      const { L, s } = fit(text, w, h, size0, fnt), lh = s * 1.2, top = cy + L.length * lh / 2;
      L.forEach((l, i) => { const y = top - (i + .5) * lh - .35 * s; align === "left" ? T(l, fnt, s, cx - w / 2, y, col) : TC(l, fnt, s, cx, y, col); });
    }

    /* ---------- icons ---------- */
    const ICONS = "star tick cross question bang bulb heart clock book person arrow target flag speech eye".split(" ");
    function icon(n, cx, cy, s, c) {
      const W = "1 1 1";
      switch (n) {
        case "star": { const p = []; for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? .2 * s : .5 * s; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r - .03 * s]); } paint(poly(p), { fill: c }); break; }
        case "tick": paint(f(cx - .36 * s) + " " + f(cy) + " m " + f(cx - .1 * s) + " " + f(cy - .28 * s) + " l " + f(cx + .4 * s) + " " + f(cy + .3 * s) + " l", { stroke: c, lw: .16 * s }); break;
        case "cross": paint(seg(cx - .3 * s, cy - .3 * s, cx + .3 * s, cy + .3 * s) + " " + seg(cx - .3 * s, cy + .3 * s, cx + .3 * s, cy - .3 * s), { stroke: c, lw: .15 * s }); break;
        case "question": paint(ell(cx, cy, .46 * s, .46 * s), { fill: c }); TC("?", "B", s * .7, cx, cy - .25 * s, WHITE); break;
        case "bang": paint(poly([[cx, cy + .46 * s], [cx - .5 * s, cy - .4 * s], [cx + .5 * s, cy - .4 * s]]), { fill: c }); TC("!", "B", s * .6, cx, cy - .33 * s, WHITE); break;
        case "bulb": paint(ell(cx, cy + .12 * s, .3 * s, .3 * s), { fill: c }); paint(rr(cx - .12 * s, cy - .3 * s, .24 * s, .18 * s, .04 * s), { fill: c }); paint(seg(cx - .08 * s, cy - .38 * s, cx + .08 * s, cy - .38 * s), { stroke: c, lw: .06 * s }); break;
        case "heart": paint(ell(cx - .2 * s, cy + .12 * s, .24 * s, .24 * s), { fill: c }); paint(ell(cx + .2 * s, cy + .12 * s, .24 * s, .24 * s), { fill: c }); paint(poly([[cx - .42 * s, cy + .04 * s], [cx + .42 * s, cy + .04 * s], [cx, cy - .4 * s]]), { fill: c }); break;
        case "clock": paint(ell(cx, cy, .42 * s, .42 * s), { stroke: c, lw: .07 * s }); paint(seg(cx, cy, cx, cy + .28 * s) + " " + seg(cx, cy, cx + .2 * s, cy - .08 * s), { stroke: c, lw: .07 * s }); break;
        case "book": paint(rr(cx - .46 * s, cy - .3 * s, .44 * s, .6 * s, .04 * s), { fill: c }); paint(rr(cx + .02 * s, cy - .3 * s, .44 * s, .6 * s, .04 * s), { fill: c }); break;
        case "person": paint(ell(cx, cy + .26 * s, .17 * s, .17 * s), { fill: c }); paint(rr(cx - .27 * s, cy - .4 * s, .54 * s, .5 * s, .24 * s), { fill: c }); break;
        case "arrow": arrow(cx - .45 * s, cy, cx + .45 * s, cy, c, .13 * s); break;
        case "target": paint(ell(cx, cy, .46 * s, .46 * s), { fill: c }); paint(ell(cx, cy, .32 * s, .32 * s), { fill: W }); paint(ell(cx, cy, .2 * s, .2 * s), { fill: c }); paint(ell(cx, cy, .08 * s, .08 * s), { fill: W }); break;
        case "flag": paint(seg(cx - .3 * s, cy - .45 * s, cx - .3 * s, cy + .45 * s), { stroke: c, lw: .07 * s }); paint(poly([[cx - .3 * s, cy + .45 * s], [cx + .4 * s, cy + .2 * s], [cx - .3 * s, cy - .05 * s]]), { fill: c }); break;
        case "speech": paint(rr(cx - .46 * s, cy - .18 * s, .92 * s, .6 * s, .15 * s), { fill: c }); paint(poly([[cx - .3 * s, cy - .17 * s], [cx - .08 * s, cy - .17 * s], [cx - .36 * s, cy - .42 * s]]), { fill: c }); break;
        case "eye": paint(ell(cx, cy, .46 * s, .26 * s), { stroke: c, lw: .06 * s }); paint(ell(cx, cy, .14 * s, .14 * s), { fill: c }); break;
      }
    }
    const parseItem = s => { let ic = null; const m = s.match(/^\[(\w+)\]\s*/); if (m && ICONS.includes(m[1].toLowerCase())) { ic = m[1].toLowerCase(); s = s.slice(m[0].length); } return { icon: ic, text: s }; };
    const bullet = s => s.replace(/^\s*[-*]\s+/, "").trim();

    function node(x, y, w, h, it, i, o) {
      o = o || {}; const b = o.base || pal(i), bs = C(b);
      paint(rr(x, y, w, h, Math.min(10, h / 4)), { fill: o.solid ? bs : mix(b, .86), stroke: bs, lw: 1.4 });
      let tx = x, tw = w;
      if (it.icon) { const s = Math.min(h * .5, 28); icon(it.icon, x + 9 + s / 2, y + h / 2, s, o.solid ? "1 1 1" : bs); tx = x + s + 12; tw = w - s - 12; }
      drawFit(it.text, tx + tw / 2, y + h / 2, tw - 12, h - 10, o.size || 14, o.bold || o.solid ? "B" : "R", o.solid ? WHITE : INK);
    }
    const badge = (x, y, n, b) => { paint(ell(x, y, 10, 10), { fill: C(b), stroke: "1 1 1", lw: 1.5 }); TC(String(n), "B", 10, x, y - 3.5, WHITE); };
    const empty = (A, msg) => drawFit(msg || "Add one item per line under the @ line.", (A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2, 400, 40, 14, "I", GREY);

    /* ---------- diagram renderers: (A = area, b = block) ---------- */
    function flow(A, b) {
      const it = b.items, n = it.length; if (!n) return empty(A);
      const W = A.x1 - A.x0, H = A.y1 - A.y0, cols = Math.min(n, PW > PH ? 5 : 3), rows = Math.ceil(n / cols), gx = 42, gy = 50;
      const w = (W - (cols - 1) * gx) / cols, h = Math.min(120, (H - (rows - 1) * gy) / rows), used = rows * h + (rows - 1) * gy, top = A.y1 - Math.max(0, (H - used) / 4);
      const pos = i => { const r = Math.floor(i / cols), c = i % cols, col = r % 2 ? cols - 1 - c : c; return { x: A.x0 + col * (w + gx), y: top - r * (h + gy) - h, r }; };
      for (let i = 0; i < n - 1; i++) {
        const p = pos(i), q = pos(i + 1), c = C(pal(i)) ;
        if (p.r === q.r) { const my = p.y + h / 2; q.x > p.x ? arrow(p.x + w + 3, my, q.x - 3, my, c, 2.5) : arrow(p.x - 3, my, q.x + w + 3, my, c, 2.5); }
        else arrow(p.x + w / 2, p.y - 3, q.x + w / 2, q.y + h + 3, c, 2.5);
      }
      it.forEach((x, i) => { const p = pos(i); node(p.x, p.y, w, h, x, i); badge(p.x + 2, p.y + h - 2, i + 1, pal(i)); });
    }
    function cycle(A, b) {
      const it = b.items, n = it.length; if (!n) return empty(A);
      const cx = (A.x0 + A.x1) / 2, cy = (A.y0 + A.y1) / 2, bw = Math.min(160, (A.x1 - A.x0) / 3.2), bh = Math.min(66, (A.y1 - A.y0) / (n > 6 ? 6 : 5));
      const Rx = (A.x1 - A.x0) / 2 - bw / 2 - 4, Ry = (A.y1 - A.y0) / 2 - bh / 2 - 4;
      paint(ell(cx, cy, Rx, Ry), { stroke: LIGHT, lw: 4 });
      for (let i = 0; i < n; i++) {
        const am = Math.PI / 2 - (i + .5) * 2 * Math.PI / n, px = cx + Rx * Math.cos(am), py = cy + Ry * Math.sin(am), tx = Rx * Math.sin(am), ty = -Ry * Math.cos(am);
        head(px + Math.cos(Math.atan2(ty, tx)) * 7, py + Math.sin(Math.atan2(ty, tx)) * 7, Math.atan2(ty, tx), 16, C(pal(i)));
      }
      const mid = (b.center || "").trim();
      if (mid) { paint(ell(cx, cy, Math.min(Rx, 120) * .7, Math.min(Ry, 120) * .6), { fill: mix(b.color || "555555", .88), stroke: C(b.color || "555555"), lw: 1.2 }); drawFit(mid, cx, cy, Math.min(Rx, 120) * 1.1, Math.min(Ry, 120), 16, "B", INK); }
      it.forEach((x, i) => { const a = Math.PI / 2 - i * 2 * Math.PI / n; node(cx + Rx * Math.cos(a) - bw / 2, cy + Ry * Math.sin(a) - bh / 2, bw, bh, x, i); });
    }
    function timeline(A, b) {
      const it = b.items, n = it.length; if (!n) return empty(A);
      const W = A.x1 - A.x0, H = A.y1 - A.y0, cy = (A.y0 + A.y1) / 2, step = n > 1 ? (W - 90) / (n - 1) : 0, bw = Math.min(180, Math.max(100, step * 1.85)), bh = Math.min(110, H / 2 - 40);
      arrow(A.x0, cy, A.x1, cy, LIGHT, 5);
      it.forEach((x, i) => {
        const cx = n > 1 ? A.x0 + 45 + i * step : (A.x0 + A.x1) / 2, up = i % 2 === 0, by = up ? cy + 36 : cy - 36 - bh, bx = Math.max(A.x0, Math.min(cx - bw / 2, A.x1 - bw)), c = pal(i), cs = C(c);
        paint(seg(cx, cy, cx, up ? cy + 36 : cy - 36), { stroke: cs, lw: 2 });
        paint(rr(bx, by, bw, bh, 8), { fill: mix(c, .87), stroke: cs, lw: 1.4 });
        const parts = x.text.split("|").map(s => s.trim());
        if (parts.length > 1) { drawFit(parts[0], bx + bw / 2, by + bh - 14, bw - 12, 18, 12, "B", cs + " rg"); drawFit(parts.slice(1).join(" "), bx + bw / 2, by + (bh - 24) / 2, bw - 14, bh - 30, 12, "R", INK); }
        else drawFit(x.text, bx + bw / 2, by + bh / 2, bw - 14, bh - 12, 12, "R", INK);
        if (x.icon) icon(x.icon, bx + bw - 14, by + bh - 14, 20, cs);
        paint(ell(cx, cy, 9, 9), { fill: "1 1 1", stroke: cs, lw: 3 });
      });
    }
    function venn(A, b) {
      const names = {}, reg = {};
      b.rest.forEach(l => { l = l.trim(); let m;
        if ((m = l.match(/^([ABC])\s*=\s*(.*)$/i))) names[m[1].toUpperCase()] = m[2];
        else if ((m = l.match(/^(ABC|AB|AC|BC|A|B|C)\s*:\s*(.*)$/i))) (reg[m[1].toUpperCase()] = reg[m[1].toUpperCase()] || []).push(m[2]); });
      const three = names.C || reg.C || reg.AC || reg.BC || reg.ABC, cx = (A.x0 + A.x1) / 2, W = A.x1 - A.x0, H = A.y1 - A.y0;
      const txt = (k, x, y, w, h) => { if (reg[k]) drawFit(reg[k].map(s => "• " + s).join("\n"), x, y, w, h, 12, "R", INK, "left"); };
      const circ = (x, y, r, i) => { paint(ell(x, y, r, r), { fill: C(pal(i)), alpha: true }); };
      const ring = (x, y, r, i) => paint(ell(x, y, r, r), { stroke: C(pal(i)), lw: 2.5 });
      const lab = (k, x, y, i) => { if (names[k]) TC(names[k], "B", 15, x, y, C(pal(i)) + " rg"); };
      if (!three) {
        const r = Math.min((H - 40) / 2, W / 3.2), cy = (A.y0 + A.y1) / 2 - 10, a = cx - .55 * r, bb = cx + .55 * r;
        circ(a, cy, r, 0); circ(bb, cy, r, 1); ring(a, cy, r, 0); ring(bb, cy, r, 1); lab("A", a, cy + r + 10, 0); lab("B", bb, cy + r + 10, 1);
        txt("A", cx - r * 1.0, cy, r * .85, r * 1.4); txt("AB", cx, cy, r * .8, r * 1.4); txt("B", cx + r * 1.0, cy, r * .85, r * 1.4);
      } else {
        const r = Math.min((H - 60) / 2.9, W / 3.2), cy = (A.y0 + A.y1) / 2 - 8, oy = cy + .1 * r;
        const a = [cx - .55 * r, oy + .35 * r], bb = [cx + .55 * r, oy + .35 * r], c = [cx, oy - .55 * r];
        circ(a[0], a[1], r, 0); circ(bb[0], bb[1], r, 1); circ(c[0], c[1], r, 2); ring(a[0], a[1], r, 0); ring(bb[0], bb[1], r, 1); ring(c[0], c[1], r, 2);
        lab("A", a[0], a[1] + r + 8, 0); lab("B", bb[0], bb[1] + r + 8, 1); lab("C", c[0], c[1] - r - 16, 2);
        const w = r * .72, h = r * .55;
        txt("A", cx - r * 1.0, oy + .62 * r, w, h); txt("B", cx + r * 1.0, oy + .62 * r, w, h); txt("C", cx, oy - 1.05 * r, w * 1.1, h);
        txt("AB", cx, oy + .8 * r, w * .8, h * .7); txt("AC", cx - .62 * r, oy - .22 * r, w * .62, h * .8); txt("BC", cx + .62 * r, oy - .22 * r, w * .62, h * .8); txt("ABC", cx, oy + .03 * r, w * .6, h * .6);
      }
    }
    function parseTree(lines) {
      let root = null; const stack = [];
      lines.forEach(l => {
        const sp = l.match(/^[ \t]*/)[0].replace(/\t/g, "  ").length; let lvl = Math.floor(sp / 2);
        const n = { ...parseItem(bullet(l)), kids: [] };
        if (!root) { root = n; stack.length = 0; stack.push(n); return; }
        lvl = Math.max(1, Math.min(lvl, stack.length)); stack[lvl - 1].kids.push(n); stack.length = lvl; stack.push(n);
      });
      return root;
    }
    const leaves = n => n.kids.length ? n.kids.reduce((s, k) => s + leaves(k), 0) : 1;
    const depthOf = n => n.kids.length ? 1 + Math.max(...n.kids.map(depthOf)) : 0;
    function tree(A, b) {
      const root = parseTree(b.rest); if (!root) return empty(A);
      const W = A.x1 - A.x0, H = A.y1 - A.y0, L = leaves(root), Dp = depthOf(root), slot = W / L, bw = Math.min(160, slot - 10), bh = Math.min(60, Dp ? H / (Dp + 1) * .62 : 60), dy = Dp ? (H - bh) / Dp : 0; let li = 0; const all = [];
      (function lay(n, d) { n.d = d; all.push(n); if (!n.kids.length) { n.x = A.x0 + (li + .5) * slot; li++; } else { n.kids.forEach(k => lay(k, d + 1)); n.x = (n.kids[0].x + n.kids[n.kids.length - 1].x) / 2; } n.y = A.y1 - n.d * dy - bh; })(root, 0);
      all.forEach(n => { if (n.kids.length) { const my = n.y - (dy - bh) / 2; paint(seg(n.x, n.y, n.x, my), { stroke: C("777777"), lw: 1.6 }); paint(seg(n.kids[0].x, my, n.kids[n.kids.length - 1].x, my), { stroke: C("777777"), lw: 1.6 }); n.kids.forEach(k => paint(seg(k.x, my, k.x, k.y + bh), { stroke: C("777777"), lw: 1.6 })); } });
      all.forEach(n => node(n.x - bw / 2, n.y, bw, bh, n, n.d, { solid: n.d === 0, size: 13 }));
    }
    function mindmap(A, b) {
      const root = parseTree(b.rest); if (!root) return empty(A);
      const cx = (A.x0 + A.x1) / 2, cy = (A.y0 + A.y1) / 2, Dp = Math.max(1, depthOf(root)), bw = 122, bh = 38, RX = (A.x1 - A.x0) / 2 - bw / 2, RY = (A.y1 - A.y0) / 2 - bh / 2, all = [];
      (function place(n, a0, a1, d, ci) {
        n.d = d; n.ci = d === 1 ? ci : n.ci; all.push(n); const am = (a0 + a1) / 2;
        n.px = d === 0 ? cx : Math.max(A.x0 + bw / 2, Math.min(A.x1 - bw / 2, cx + Math.cos(am) * RX * d / Dp));
        n.py = d === 0 ? cy : Math.max(A.y0 + bh / 2, Math.min(A.y1 - bh / 2, cy + Math.sin(am) * RY * d / Dp));
        const tot = n.kids.reduce((s, k) => s + leaves(k), 0); let a = a0;
        n.kids.forEach((k, i) => { const span = (a1 - a0) * leaves(k) / tot; k.ci = d === 0 ? i : n.ci; place(k, a, a + span, d + 1, i); a += span; });
      })(root, Math.PI / 2, Math.PI / 2 - 2 * Math.PI, 0, 0);
      all.forEach(n => n.kids.forEach(k => paint(seg(n.px, n.py, k.px, k.py), { stroke: C(pal(k.ci)), lw: Math.max(1.5, 5 - k.d) })));
      all.forEach(n => n.d === 0 ? node(n.px - 85, n.py - 30, 170, 60, n, 0, { solid: true, base: b.color || "c41230", size: 16 }) : node(n.px - bw / 2, n.py - bh / 2, bw, bh, n, n.ci, { size: 12 }));
    }
    function matrix(A, b) {
      const rows = b.rest.map(l => l.split("|").map(s => s.trim())); if (!rows.length) return empty(A);
      const nc = Math.max(...rows.map(r => r.length)), W = A.x1 - A.x0, H = A.y1 - A.y0, c0 = nc > 1 ? W * .2 : W, cwid = i => nc === 1 ? W : i === 0 ? c0 : (W - c0) / (nc - 1), rh = Math.min(90, H / rows.length);
      rows.forEach((r, ri) => { let x = A.x0; for (let ci = 0; ci < nc; ci++) {
        const w = cwid(ci), y = A.y1 - (ri + 1) * rh, it = parseItem(r[ci] || ""), hd = ri === 0, fc = ci === 0, base = pal(hd ? ci : ci);
        paint(rr(x + 2, y + 2, w - 4, rh - 4, 6), { fill: hd ? C(ci === 0 ? "555555" : base) : fc ? mix(pal(ri), .8) : ci % 2 ? "0.985 0.985 0.985" : "1 1 1", stroke: hd ? C(ci === 0 ? "555555" : base) : "0.75 0.75 0.75", lw: 1 });
        let tx = x, tw = w; if (it.icon) { const s = Math.min(rh * .45, 26); icon(it.icon, x + 8 + s / 2, y + rh / 2, s, C(pal(ci))); tx = x + s + 10; tw = w - s - 10; }
        drawFit(it.text, tx + tw / 2, y + rh / 2, tw - 14, rh - 12, 14, hd || fc ? "B" : "R", hd ? WHITE : INK);
        x += w; } });
    }
    function quadrant(A, b) {
      const q = { TL: [], TR: [], BL: [], BR: [] }, ax = { x: ["", ""], y: ["", ""] };
      b.rest.forEach(l => { l = l.trim(); let m;
        if ((m = l.match(/^([xy])\s*:\s*(.*)$/i))) ax[m[1].toLowerCase()] = m[2].split("|").map(s => s.trim());
        else if ((m = l.match(/^(TL|TR|BL|BR)\s*[:|]\s*(.*)$/i))) q[m[1].toUpperCase()].push(m[2]); });
      const x0 = A.x0 + 26, y0 = A.y0 + 22, W = A.x1 - x0, H = A.y1 - y0, w = (W - 8) / 2, h = (H - 8) / 2;
      [["TL", 0, 1, 0], ["TR", 1, 1, 1], ["BL", 0, 0, 2], ["BR", 1, 0, 3]].forEach(([k, cx, cy, i]) => {
        const x = x0 + cx * (w + 8), y = y0 + cy * (h + 8), c = pal(i); paint(rr(x, y, w, h, 10), { fill: mix(c, .88), stroke: C(c), lw: 1.4 });
        drawFit(q[k].map(s => "• " + s).join("\n"), x + w / 2, y + h / 2, w - 24, h - 20, 14, "R", INK, "left");
      });
      const mx = A.x0 + 10, g = "0.4 0.4 0.4";
      arrow(x0, A.y0 + 10, x0 + W, A.y0 + 10, g, 1.5); arrow(A.x0 + 10, y0, A.x0 + 10, y0 + H, g, 1.5);
      if (ax.x[0]) T(ax.x[0], "B", 11, x0, A.y0 - 4 + 0, GREY); if (ax.x[1]) T(ax.x[1], "B", 11, x0 + W - sw(ax.x[1], 11, "B"), A.y0 - 4, GREY);
      if (ax.y[0]) TV(ax.y[0], "B", 11, mx - 2 + 8, y0 + 40, GREY); if (ax.y[1]) TV(ax.y[1], "B", 11, mx - 2 + 8, y0 + H - 40, GREY);
    }
    function cause(A, b) {
      let effect = "Effect"; const causes = [];
      b.rest.forEach(l => { const sp = l.match(/^[ \t]*/)[0].replace(/\t/g, "  ").length, m = l.trim().match(/^effect\s*:\s*(.*)$/i);
        if (m) effect = m[1]; else if (sp >= 2 && causes.length) causes[causes.length - 1].subs.push(bullet(l)); else causes.push({ ...parseItem(bullet(l)), subs: [] }); });
      const cy = (A.y0 + A.y1) / 2, ew = 150, eh = 96, ex = A.x1 - ew;
      paint(rr(ex, cy - eh / 2, ew, eh, 12), { fill: C("c41230"), stroke: C("c41230"), lw: 1 }); drawFit(effect, ex + ew / 2, cy, ew - 16, eh - 14, 16, "B", WHITE);
      arrow(A.x0, cy, ex - 2, cy, C("555555"), 4);
      const n = causes.length, slots = Math.ceil(n / 2), len = ex - A.x0 - 20, bw = Math.min(170, len / slots - 10);
      causes.forEach((c, i) => {
        const up = i % 2 === 0, s = Math.floor(i / 2), bx = A.x0 + 10 + (s + .5) * len / slots, col = pal(i), cs = C(col), subH = c.subs.length * 12;
        const h = Math.min((A.y1 - cy) - 66, 30 + subH), by = up ? cy + 62 : cy - 62 - h;
        paint(seg(bx, up ? by : by + h, bx + (up ? 46 : 46), cy), { stroke: cs, lw: 2.2 });
        paint(rr(bx - bw / 2, by, bw, h, 7), { fill: mix(col, .87), stroke: cs, lw: 1.3 });
        drawFit(c.text, bx, by + (up ? h - 15 : h - 15), bw - 12, 20, 12, "B", INK);
        c.subs.forEach((t, k) => T("• " + t.slice(0, Math.floor(bw / 5)), "R", 9, bx - bw / 2 + 8, by + h - 30 - k * 12, INK));
        if (c.icon) icon(c.icon, bx + bw / 2 - 12, by + h - 12, 16, cs);
      });
    }
    function pyramid(A, b) {
      const it = b.items; if (!it.length) return empty(A);
      const n = it.length, hasD = it.some(x => x.text.includes("|")), W = A.x1 - A.x0, H = A.y1 - A.y0, base = hasD ? W * .5 : W * .8, cx = A.x0 + base / 2 + (hasD ? 0 : (W - base) / 2), ph = Math.min(86, H / n), top = A.y1 - (H - n * ph) / 3;
      it.forEach((x, i) => {
        const w0 = base * i / n, w1 = base * (i + 1) / n, yt = top - i * ph, yb = yt - ph, c = pal(i), parts = x.text.split("|").map(s => s.trim());
        paint(poly([[cx - w0 / 2, yt], [cx + w0 / 2, yt], [cx + w1 / 2, yb], [cx - w1 / 2, yb]]), { fill: C(c), stroke: "1 1 1", lw: 2 });
        drawFit(parts[0], cx, yb + ph / 2 - 1, Math.max(40, (w0 + w1) / 2 * .72), ph - 10, 14, "B", WHITE);
        if (parts.length > 1) { const lx = cx + w1 / 2 + 14; paint(seg(cx + (w0 + w1) / 4, yb + ph / 2, lx - 4, yb + ph / 2), { stroke: C(c), lw: 1.2, dash: "[3 3] 0" }); drawFit(parts.slice(1).join(" "), lx + (A.x1 - lx) / 2, yb + ph / 2, A.x1 - lx, ph - 6, 13, "R", INK, "left"); }
      });
    }
    function frayer(A, b) {
      const sec = { definition: [], characteristics: [], examples: [], "non-examples": [] }; let term = "";
      b.rest.forEach(l => { l = l.trim(); const m = l.match(/^(definition|characteristics|examples|non-examples|nonexamples)\s*:\s*(.*)$/i); if (m) sec[m[1].toLowerCase().replace("nonex", "non-ex")].push(...m[2].split(";").map(s => s.trim()).filter(Boolean)); else if (!term) term = l; });
      const W = A.x1 - A.x0, H = A.y1 - A.y0, w = (W - 8) / 2, h = (H - 8) / 2;
      [["definition", 0, 1, 0, "Definition"], ["characteristics", 1, 1, 1, "Characteristics"], ["examples", 0, 0, 2, "Examples"], ["non-examples", 1, 0, 3, "Non-examples"]].forEach(([k, cx, cy, i, lbl]) => {
        const x = A.x0 + cx * (w + 8), y = A.y0 + cy * (h + 8), c = pal(i); paint(rr(x, y, w, h, 10), { fill: mix(c, .9), stroke: C(c), lw: 1.4 });
        T(lbl, "B", 14, x + 14, y + h - 24, C(c) + " rg");
        const arr = sec[k]; drawFit(arr.length > 1 ? arr.map(s => "• " + s).join("\n") : (arr[0] || ""), x + w / 2, y + (h - 34) / 2, w - 30, h - 52, 14, "R", INK, "left");
      });
      const cx = A.x0 + W / 2, cy = A.y0 + H / 2; paint(ell(cx, cy, 90, 40), { fill: C("222222"), stroke: "1 1 1", lw: 3 }); drawFit(term, cx, cy, 150, 60, 16, "B", WHITE);
    }
    function iconsPage(A) {
      const cols = 5, rows = Math.ceil(ICONS.length / cols), w = (A.x1 - A.x0) / cols, h = Math.min(120, (A.y1 - A.y0) / rows);
      ICONS.forEach((n, i) => { const cx = A.x0 + (i % cols + .5) * w, cy = A.y1 - (Math.floor(i / cols) + .5) * h; icon(n, cx, cy + 8, 42, C(pal(i))); TC("[" + n + "]", "R", 11, cx, cy - 30, GREY); });
    }
    const TYPES = { flow, cycle, timeline, venn, tree, mindmap, matrix, quadrant, cause, pyramid, frayer, icons: iconsPage };

    /* ---------- parsing ---------- */
    function blockLine(cur, ln) {
      let m; const t = ln.trim();
      if ((m = t.match(/^note\s*:\s*(.*)$/i))) { cur.note = m[1]; return true; }
      if ((m = t.match(/^color\s*:\s*(\S+)\s*$/i)) && colorOf(m[1])) { cur.color = colorOf(m[1]); return true; }
      if (cur.type === "cycle" && (m = t.match(/^center\s*:\s*(.*)$/i))) { cur.center = m[1]; return true; }
      return false;
    }
    function parse(src) {
      const lines = src.replace(/\r\n?/g, "\n").split("\n"), meta = {}; let i = 0;
      if (/^---\s*$/.test(lines[0] || "")) { for (i = 1; i < lines.length && !/^---\s*$/.test(lines[i]); i++) { const m = lines[i].match(/^([a-z]+)\s*:\s*(.*)$/i); if (m) meta[m[1].toLowerCase()] = m[2].trim(); } i++; }
      const blocks = []; let cur = null;
      for (; i < lines.length; i++) {
        const ln = lines[i]; let m;
        if (/^\s*%/.test(ln)) continue;
        if ((m = ln.match(/^@(\w+)\s*(.*)$/))) { cur = { type: m[1].toLowerCase(), title: m[2].trim(), rest: [], note: "", color: null, center: "" }; blocks.push(cur); continue; }
        if (!cur || !ln.trim()) continue;
        if (blockLine(cur, ln)) continue;
        cur.rest.push(ln.replace(/\s+$/, ""));
      }
      blocks.forEach(b => { b.items = b.rest.map(l => parseItem(bullet(l))).filter(x => x.text); });
      return { meta, blocks };
    }

    /* ---------- red template + presentation mode ---------- */
    const REDSET = ["c41230", "444444", "e05468", "8a1a2b", "888888", "b8344a"], RED = "c41230", SX = 64;
    function titlePage(title, subs) {
      paint(rr(0, 0, 28, PH, 0), { fill: C(RED) });
      let y = 330;
      for (const l of wrap(title, 46, PW - 2 * SX - 40, "B")) { T(l, "B", 46, SX + 20, y, INK); y -= 56; }
      paint(rr(SX + 20, y + 20, 120, 4, 0), { fill: C(RED) }); y -= 24;
      (subs || []).filter(Boolean).forEach(s => { for (const l of wrap(s, 22, PW - 2 * SX - 40, "R")) { T(l, "R", 22, SX + 20, y, GREY); y -= 30; } });
    }
    function slideHeader(title, note) {
      paint(rr(SX, PH - 52, 12, 12, 0), { fill: C(RED) });
      let y = PH - 52;
      if (title) {
        for (const l of wrap(title, 28, PW - 2 * SX - 30, "B")) { y -= 34; T(l, "B", 28, SX + 24, y, INK); }
        y -= 14; paint(rr(SX, y, PW - 2 * SX, 1.5, 0), { fill: C(RED) }); y -= 26;
      } else y -= 16;
      if (note) { drawFit(note, PW / 2, y - 2, PW - 2 * SX, 16, 12, "I", GREY); y -= 24; }
      return { x0: SX, x1: PW - SX, y0: 56, y1: y };
    }
    function classicHeader(title, note, MG) {
      paint(rr(MG, PH - 50, 11, 11, 2), { fill: C(pal(0)) });
      let ts = 24; while (ts > 12 && sw(title, ts, "B") > PW - 2 * MG - 22) ts -= 1; T(title, "B", ts, MG + 20, PH - 50, INK);
      paint(seg(MG, PH - 62, PW - MG, PH - 62), { stroke: C(pal(0)), lw: 1.6 });
      let top = PH - 76; if (note) { drawFit(note, PW / 2, PH - 78, PW - 2 * MG, 16, 12, "I", GREY); top = PH - 94; }
      return { x0: MG, x1: PW - MG, y0: 56, y1: top - 8 };
    }
    function parseDeck(src) {
      const lines = src.replace(/\r\n?/g, "\n").split("\n"), meta = {}; let i = 0;
      if (/^---\s*$/.test(lines[0] || "")) { for (i = 1; i < lines.length && !/^---\s*$/.test(lines[i]); i++) { const m = lines[i].match(/^([a-z]+)\s*:\s*(.*)$/i); if (m) meta[m[1].toLowerCase()] = m[2].trim(); } i++; }
      const els = []; let cur = null, inCode = false;
      const slide = t => { cur = { k: "slide", title: t, items: [], raw: [], visual: "", both: false, note: "", color: null }; els.push(cur); return cur; };
      for (; i < lines.length; i++) {
        const ln = lines[i]; let m;
        if (inCode) { if (/^\s*```/.test(ln)) inCode = false; else cur.items.push({ t: "code", text: ln }); continue; }
        if (/^\s*%/.test(ln)) continue;
        if (/^\s*```/.test(ln)) { if (!cur || cur.k !== "slide") slide(""); inCode = true; continue; }
        if ((m = ln.match(/^#\s+(.*)$/))) { cur = { k: "title", title: m[1].trim(), subs: [] }; els.push(cur); continue; }
        if ((m = ln.match(/^#{2,6}\s+(.*)$/))) { slide(m[1].trim()); continue; }
        if (/^---+\s*$/.test(ln)) { slide(""); continue; }
        if ((m = ln.match(/^@(\w+)\s*(.*)$/))) { cur = { k: "diagram", type: m[1].toLowerCase(), title: m[2].trim(), rest: [], note: "", color: null, center: "" }; els.push(cur); continue; }
        if (!ln.trim()) continue;
        if (!cur) slide("");
        if (cur.k === "title") { cur.subs.push(ln.trim()); continue; }
        if (cur.k === "diagram") { if (!blockLine(cur, ln)) cur.rest.push(ln.replace(/\s+$/, "")); continue; }
        if (blockLine(cur, ln)) continue;
        if ((m = ln.match(/^\s*visual\s*:\s*([a-z]+)\s*(\+\s*text)?\s*$/i))) { cur.visual = m[1].toLowerCase(); cur.both = !!m[2]; continue; }
        if ((m = ln.match(/^\s*key\s*:\s*(.*)$/i))) { cur.items.push({ t: "key", text: m[1].trim() }); continue; }
        if ((m = ln.match(/^(\s*)[-*+]\s+(.*)$/))) { cur.items.push({ t: "li", ...parseItem(m[2].trim()), lvl: Math.floor(m[1].replace(/\t/g, "  ").length / 2) }); cur.raw.push(ln.replace(/\s+$/, "")); continue; }
        if ((m = ln.match(/^>\s?(.*)$/))) { cur.items.push({ t: "q", text: m[1] }); continue; }
        cur.items.push({ t: "p", text: ln.trim() });
      }
      return { meta, els };
    }
    function buildDeck(src, docName) {
      const D = parseDeck(src), M = D.meta; PW = 960; PH = 540;
      const name = M.title || docName || "Presentation", pages = [], yes = v => /^(yes|true|on)$/i.test(v || "");
      const setP = c => { pal = c ? () => c : i => REDSET[i % 6]; };
      const newPage = () => { P = []; pages.push(P); return P; };
      const els = D.els.slice();
      if (M.title && !(els[0] && els[0].k === "title")) els.unshift({ k: "title", title: M.title, subs: [M.author] });
      else if (els[0] && els[0].k === "title" && M.author && !els[0].subs.length) els[0].subs.push(M.author);
      const heads = els.filter(e => e.k !== "title" && e.title).map(e => e.title);
      if (yes(M.agenda) && heads.length) els.splice(els[0] && els[0].k === "title" ? 1 : 0, 0, { k: "diagram", type: "flow", title: "Overview", rest: [], note: "Where we are going", color: null, center: "", items: heads.slice(0, 10).map(t => ({ icon: null, text: t })) });
      if (yes(M.recap) && heads.length) {
        const rest = [name];
        D.els.filter(e => e.k === "slide" && e.title).slice(0, 6).forEach(e => { rest.push("  " + e.title); e.items.filter(x => x.t === "li" && x.lvl === 0).slice(0, 2).forEach(x => rest.push("    " + x.text.slice(0, 30))); });
        els.push({ k: "diagram", type: "mindmap", title: "Recap", rest, note: "", color: null, center: "" });
      }
      if (!els.length) throw new Error("Nothing to export. Start with “# Title” and add “## Slide” headings.");
      const fail = x => drawFit("Could not draw this diagram: " + x.message, PW / 2, PH / 2, PW - 160, 60, 14, "B", C(RED) + " rg");
      function slideText(s) {
        const A = slideHeader(s.title, s.note); let y = A.y1, ct = s.title;
        const cont = () => { if (ct && !/\(cont\.\)$/.test(ct)) ct += " (cont.)"; newPage(); y = slideHeader(ct, "").y1; };
        const need = h => { if (y - h < 56) cont(); };
        const vis = s.visual && s.visual !== "icons" && TYPES[s.visual] ? s.visual : "";
        for (const it of s.items) {
          if (vis && it.t === "li") continue;
          if (it.t === "p" || it.t === "q") { const xo = it.t === "q" ? 24 : 0; for (const l of wrap(it.text, 18, PW - 2 * SX - xo, "R")) { need(24); y -= 24; T(l, "R", 18, SX + xo, y, it.t === "q" ? GREY : INK); } y -= 6; }
          else if (it.t === "li") {
            const ind = SX + 20 + it.lvl * 24;
            wrap(it.text, 18, PW - SX - ind, "R").forEach((l, k) => { need(24); y -= 24; if (k === 0) { if (it.icon) icon(it.icon, ind - 12, y + 6, 18, C(RED)); else paint(rr(ind - 16, y + 5, 6, 6, 0), { fill: C(RED) }); } T(l, "R", 18, ind, y, INK); });
            y -= 4;
          } else if (it.t === "code") { for (const l of wrap(it.text, 13, PW - 2 * SX - 12, "M")) { need(17); y -= 17; T(l, "M", 13, SX + 12, y, INK); } }
          else if (it.t === "key") {
            const L = wrap(it.text, 18, PW - 2 * SX - 76, "B"), hh = L.length * 24 + 20; need(hh + 12); y -= 10;
            paint(rr(SX, y - hh, PW - 2 * SX, hh, 8), { fill: mix(RED, .9), stroke: C(RED), lw: 1.2 }); icon("bulb", SX + 30, y - hh / 2, 30, C(RED));
            L.forEach((l, k) => T(l, "B", 18, SX + 60, y - 10 - (k + 1) * 24 + 6, INK)); y -= hh + 8;
          }
        }
        if (vis) {
          const lis = s.items.filter(t => t.t === "li"), AA = { x0: SX, x1: PW - SX, y0: 56, y1: y };
          if (AA.y1 - AA.y0 < 140) { cont(); AA.y1 = y; }
          const tree = vis === "tree" || vis === "mindmap", raw = tree ? [s.title || "Topic", ...s.raw.map(r => "  " + r)] : s.raw.map(bullet);
          if (s.both) {
            const tw = (PW - 2 * SX) * .36;
            drawFit(lis.map(x => "  ".repeat(x.lvl) + "• " + x.text).join("\n"), SX + tw / 2, (AA.y0 + AA.y1) / 2, tw, AA.y1 - AA.y0, 18, "R", INK, "left");
            paint(rr(SX + tw + 12, AA.y0, 1.5, AA.y1 - AA.y0, 0), { fill: C(RED) }); AA.x0 = SX + tw + 28;
          }
          try { TYPES[vis](AA, { type: vis, title: s.title, rest: raw, items: lis.filter(x => x.lvl === 0).map(x => ({ icon: x.icon, text: x.text })), color: s.color, center: s.title || "" }); } catch (x) { fail(x); }
        }
      }
      els.forEach(e => {
        if (e.k === "title") { newPage(); P.cover = true; setP(null); titlePage(e.title, e.subs); return; }
        newPage(); setP(e.color);
        if (e.k === "diagram") {
          if (!e.items) e.items = e.rest.map(l => parseItem(bullet(l))).filter(x => x.text);
          const A = slideHeader(e.title || e.type.toUpperCase(), e.note), fn = TYPES[e.type];
          try { if (!fn) throw new Error("Unknown diagram type @" + e.type); fn(A, e); } catch (x) { fail(x); }
          return;
        }
        slideText(e);
      });
      pages.forEach((p, k) => { P = p; if (p.cover) return; T(name, "R", 9, SX, 24, GREY); T(String(k + 1), "R", 10, PW - SX - 10, 24, GREY); });
      return { parts: assemble(pages), pages: pages.length };
    }
    function savePdf(parts, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(parts, { type: "application/pdf" })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }

    /* ---------- build + PDF ---------- */
    const SIZES = { landscape: [842, 595], portrait: [595, 842], letter: [792, 612], "letter-portrait": [612, 792] };
    function build(src) {
      const doc = parse(src), M = doc.meta, red = (M.template || "").toLowerCase() === "red";
      if (red) { PW = 960; PH = 540; } else [PW, PH] = SIZES[(M.page || "landscape").toLowerCase()] || SIZES.landscape;
      const mp = (M.palette || "multi").toLowerCase(), base = mp === "multi" ? null : colorOf(mp), pages = [], MG = 40;
      const setPal = c => { const one = c || base; pal = one ? () => one : red ? i => REDSET[i % 6] : i => MULTI[i % 6]; };
      const cover = !!M.title && (M.cover || "yes").toLowerCase() !== "no";
      if (cover && red) { setPal(null); P = []; pages.push(P); P.cover = true; titlePage(M.title, [M.author]); }
      else if (cover) {
        setPal(null); P = []; pages.push(P); P.cover = true; paint(rr(0, 0, 18, PH, 0), { fill: C(pal(0)) });
        drawFit(M.title, PW / 2, PH / 2 + 60, PW - 160, 120, 40, "B", INK);
        if (M.author) TC(M.author, "R", 16, PW / 2, PH / 2 - 10, GREY);
        paint(seg(PW / 2 - 60, PH / 2 + 8, PW / 2 + 60, PH / 2 + 8), { stroke: C(pal(0)), lw: 3 });
        const list = doc.blocks.map((b, k) => (k + 1 + 1) + ".  " + (b.title || b.type)).slice(0, 14); list.forEach((t, k) => TC(t.slice(0, 70), "R", 11, PW / 2, PH / 2 - 50 - k * 15, GREY));
      }
      if (!doc.blocks.length) throw new Error("No diagrams found. Start a diagram with a line such as “@flow My title”.");
      doc.blocks.forEach(b => {
        setPal(b.color); P = []; pages.push(P);
        const title = b.title || b.type.toUpperCase();
        const A = red ? slideHeader(title, b.note) : classicHeader(title, b.note, MG);
        const fn = TYPES[b.type];
        try { if (!fn) throw new Error("Unknown diagram type @" + b.type); fn(A, b); }
        catch (e) { drawFit("Could not draw this diagram: " + e.message, PW / 2, PH / 2, PW - 160, 60, 14, "B", C("c41230") + " rg"); }
      });
      pages.forEach((p, k) => { P = p; if (p.cover) return; if (red) { T(M.footer || M.title || "Dual coding organisers", "R", 9, SX, 24, GREY); T(String(k + 1), "R", 10, PW - SX - 10, 24, GREY); return; } T(M.footer || M.title || "Dual coding organisers", "R", 8, MG, 28, GREY); const s = (k + 1) + " / " + pages.length; T(s, "R", 8, PW - MG - sw(s, 8, "R"), 28, GREY); });
      return { parts: assemble(pages), pages: pages.length };
    }
    function assemble(pages) {
      const parts = []; let len = 0; const offs = [];
      const put = s => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; parts.push(b); len += b.length; };
      const obj = (id, body) => { offs[id] = len; put(id + " 0 obj\n" + body + "\nendobj\n"); };
      let nid = 7; pages.forEach(p => { p.cid = nid++; p.pid = nid++; });
      put("%PDF-1.4\n");
      const font = n => "<</Type/Font/Subtype/Type1/BaseFont/" + n + "/Encoding/WinAnsiEncoding>>";
      obj(3, font("Helvetica")); obj(4, font("Helvetica-Bold")); obj(5, font("Helvetica-Oblique")); obj(6, font("Courier"));
      pages.forEach(p => {
        const s = p.join("\n"); obj(p.cid, "<</Length " + s.length + ">>\nstream\n" + s + "\nendstream");
        obj(p.pid, "<</Type/Page/Parent 2 0 R/MediaBox [0 0 " + PW + " " + PH + "]/Resources<</Font<</F1 3 0 R/F2 4 0 R/F3 5 0 R/F4 6 0 R>>/ExtGState<</GA<</ca 0.3/CA 0.3>>>>>>/Contents " + p.cid + " 0 R>>");
      });
      obj(1, "<</Type/Catalog/Pages 2 0 R>>"); obj(2, "<</Type/Pages/Kids [" + pages.map(p => p.pid + " 0 R").join(" ") + "]/Count " + pages.length + ">>");
      const xref = len; let x = "xref\n0 " + nid + "\n0000000000 65535 f \n"; for (let i = 1; i < nid; i++) x += String(offs[i]).padStart(10, "0") + " 00000 n \n";
      put(x + "trailer\n<</Size " + nid + "/Root 1 0 R>>\nstartxref\n" + xref + "\n%%EOF"); return parts;
    }
    editor.dualCoding = { build, parse };

    /* ---------- templates ---------- */
    const SAMPLE = `---
title: Dual Coding Organisers: Sampler
author: Your name
page: landscape
palette: multi
---
@flow Making a cup of tea
note: One short phrase per step, one icon where it helps.
[book] Read the instructions
[clock] Boil the water
[person] Add the tea bag
[clock] Wait three minutes
[tick] Remove the bag and enjoy

@cycle The water cycle
center: Water
[eye] Evaporation
Condensation
[speech] Precipitation
Collection

@timeline Key events
1914 | War begins
1918 | Armistice signed
1919 | Treaty agreed
1920 | League of Nations founded

@venn Mammals and birds
A = Mammals
B = Birds
A: fur or hair
A: feed young milk
B: feathers
B: lay hard-shelled eggs
AB: warm-blooded
AB: have a backbone

@tree Types of triangle
Triangles
  By sides
    Equilateral
    Isosceles
    Scalene
  By angles
    Acute
    Right
    Obtuse

@mindmap Healthy habits
Healthy life
  Sleep
    8 hours
    Regular routine
  Food
    Vegetables
    Water
  Exercise
    Walk daily
    Play sport

@matrix Solids, liquids and gases
| | Solid | Liquid | Gas
Shape | [tick] Fixed | Takes the container | Takes the container
Volume | Fixed | Fixed | Fills the space
Particles | Close, vibrate | Close, move past | Far apart, fast

@quadrant Priorities
x: Less urgent | More urgent
y: Less important | More important
TL: Plan it
TR: Do it now
BL: Drop it
BR: Delegate it

@cause Why did the plant die?
effect: Plant died
Light
  Dark corner
  Curtains closed
Water
  Overwatered
Soil
  Poor drainage
Temperature
  Cold draught

@pyramid Levels of understanding
Create | Make something new
Evaluate | Judge and justify
Analyse | Break into parts
Apply | Use in a new case
Remember | Recall facts

@frayer Photosynthesis
definition: Plants make food from light, water and carbon dioxide
characteristics: Needs chlorophyll; Releases oxygen; Happens in leaves
examples: Grass; Trees; Algae
non-examples: Respiration; Digestion

@icons Built-in icons
`;
    const SAMPLE_DECK = `---
title: How Plants Make Food
author: Year 9 Science
agenda: yes
recap: yes
---
# How Plants Make Food
A dual-coding presentation: words plus pictures

## The big idea
key: Plants use light, water and carbon dioxide to make glucose and oxygen.
- [bulb] Happens inside the chloroplasts
- [eye] Chlorophyll is the green pigment that absorbs light
- [clock] It goes on all day, whenever there is light

## Step by step
visual: flow+text
- [bulb] Leaves absorb light
- [arrow] Roots draw up water
- Carbon dioxide enters through the leaf
- [star] Glucose and oxygen are made

@matrix Inputs and outputs
note: Compare what goes in and what comes out
| | Goes in | Comes out
Light | [tick] Yes | No
Water | [tick] Yes | No
Glucose | No | [tick] Yes
Oxygen | No | [tick] Yes

## Plant groups
visual: tree
- Flowering plants
  - Grasses
  - Trees
- Non-flowering plants
  - Ferns
  - Mosses

@venn Photosynthesis and respiration
A = Photosynthesis
B = Respiration
A: stores energy
A: needs light
B: releases energy
B: happens day and night
AB: involves gases and glucose

## Check yourself
> If a plant is kept in the dark for a week, what happens, and why?
- [question] Discuss with a partner for one minute
`;
    const SNIP = {
      flow: "\n@flow Title\n[star] Step one\nStep two\nStep three\n[tick] Step four\n",
      cycle: "\n@cycle Title\ncenter: Centre\nStage one\nStage two\nStage three\nStage four\n",
      timeline: "\n@timeline Title\nDate | Event\nDate | Event\nDate | Event\n",
      venn: "\n@venn Title\nA = First\nB = Second\nA: only first\nB: only second\nAB: both\n",
      tree: "\n@tree Title\nTop idea\n  Branch one\n    Detail\n    Detail\n  Branch two\n    Detail\n",
      mindmap: "\n@mindmap Title\nCentre\n  Branch one\n    Detail\n  Branch two\n    Detail\n  Branch three\n",
      matrix: "\n@matrix Title\n| | Column A | Column B\nRow 1 | text | text\nRow 2 | text | text\n",
      quadrant: "\n@quadrant Title\nx: Low | High\ny: Low | High\nTL: text\nTR: text\nBL: text\nBR: text\n",
      cause: "\n@cause Title\neffect: The problem\nCause one\n  detail\nCause two\nCause three\nCause four\n",
      pyramid: "\n@pyramid Title\nTop | description\nMiddle | description\nBase | description\n",
      frayer: "\n@frayer Title\ndefinition: \ncharacteristics: a; b; c\nexamples: a; b\nnon-examples: a; b\n"
    };
    Object.entries(SNIP).forEach(([k, v]) => api.registerCommand("ins_" + k, { label: "Insert diagram: " + k, category: "Dual coding", run() { const [s, e] = api.editor.sel(); api.editor.replace(s, e, v); } }));

    /* ---------- commands ---------- */
    api.registerCommand("export", {
      label: "Export diagrams as PDF", category: "Dual coding", key: "alt+shift+d",
      run() {
        const d = api.doc(); if (!d.text.trim()) { api.notify("Nothing to export: the document is empty.", true); return; }
        let r; try { r = build(d.text); } catch (e) { api.notify("Could not build diagrams: " + e.message, true); return; }
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(r.parts, { type: "application/pdf" })); a.download = d.name.replace(/\.[^.]+$/, "") + "-diagrams.pdf";
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); api.notify("Downloaded " + a.download + " (" + r.pages + " page(s)).");
      }
    });
    api.registerCommand("new", { label: "New diagram sheet (sampler of every organiser)", category: "Dual coding", run() { api.openDoc("diagrams.md", SAMPLE); } });
    api.registerCommand("exportDeck", {
      label: "Export presentation as PDF (slides + dual coding)", category: "Dual coding", key: "alt+shift+s",
      run() {
        const d = api.doc(); if (!d.text.trim()) { api.notify("Nothing to export: the document is empty.", true); return; }
        let r; try { r = buildDeck(d.text, d.name.replace(/\.[^.]+$/, "")); } catch (e) { api.notify("Could not build the presentation: " + e.message, true); return; }
        const n = d.name.replace(/\.[^.]+$/, "") + "-slides.pdf"; savePdf(r.parts, n); api.notify("Downloaded " + n + " (" + r.pages + " slides).");
      }
    });
    api.registerCommand("newDeck", { label: "New presentation (red template, dual coding)", category: "Dual coding", run() { api.openDoc("presentation-dual-coding.md", SAMPLE_DECK); } });
    api.registerCommand("newRed", { label: "New diagram sheet (red template)", category: "Dual coding", run() { api.openDoc("diagrams-red.md", SAMPLE.replace("page: landscape", "template: red")); } });
    api.registerCommand("insSlide", { label: "Insert slide with key idea and icon bullets", category: "Dual coding", run() { const [s, e] = api.editor.sel(); api.editor.replace(s, e, "\n## Slide title\nkey: The main idea in one sentence\n- [star] Point one\n- [bulb] Point two\n"); } });
    api.registerCommand("insVisual", { label: "Insert slide shown as a diagram (visual:)", category: "Dual coding", run() { const [s, e] = api.editor.sel(); api.editor.replace(s, e, "\n## Slide title\nvisual: flow+text\n- [clock] Step one\n- Step two\n- Step three\n"); } });
    api.registerCommand("icons", { label: "List available icons", category: "Dual coding", run() { api.notify("Icons: " + ICONS.map(n => "[" + n + "]").join(" ") + "  (put one at the start of an item)"); } });
    api.registerCommand("guide", {
      label: "Which organiser should I use?", category: "Dual coding",
      run() {
        const rows = [["@flow", "A sequence or procedure"], ["@cycle", "Something that repeats"], ["@timeline", "Events in date order"], ["@venn", "Similarities and differences"], ["@tree", "Classifying a whole into parts"], ["@mindmap", "Everything linked to one topic"], ["@matrix", "Comparing several things on the same features"], ["@quadrant", "Sorting by two scales"], ["@cause", "Causes behind one outcome"], ["@pyramid", "Levels or a hierarchy"], ["@frayer", "Deep understanding of one term"]];
        Modal.open("Which organiser?", h("div", {}, rows.map(([a, b]) => h("div", { class: "row" }, h("b", { style: "min-width:90px" }, a), h("span", {}, b))),
          h("p", { style: "color:var(--mu);font-size:12px" }, "Tips: keep each diagram to one idea, use short phrases rather than sentences, add an icon only where it clarifies meaning, and say the explanation aloud while pointing at the picture.")));
      }
    });
  },
  deactivate() {}
});
