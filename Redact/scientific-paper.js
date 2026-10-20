/* Redact extension: Scientific Paper PDF
   Turns the current Markdown document into a journal-style PDF, in one or two columns
   (modelled on the layout of the two uploaded papers: centred title block, abstract and keywords,
   numbered sections, captioned tables and figures, numbered equations, references, running heads).

   Front matter (between two --- lines), then Markdown body:
     template: one | two        columns: 1 | 2      fontsize: 10      page: a4 | letter
     header: line 1 | line 2 | line 3      title: ...      authors: Ana Petrović^{1}, Marko Jovanović^{1}
     affiliation: ...   email: ...   abstract: ...   keywords: ...   runhead: A. Petrović   runtitle: Short title
     footer: left text | right text      (printed at the foot of every page in the two-column template)
   Body:  # Section   ## Subsection   ### Run-in heading   (add {-} to a heading to leave it unnumbered)
          - bullet    1. numbered   ``` code ```   $$ equation $$   <pagebreak>   % comment line
          Table: Caption {wide}    followed by a | pipe | table |
          ![Caption {wide}](https://… or data:image/…)
          A section called "References" is typeset as a hanging reference list, one entry per line.
   Inline: **bold** *italic* `code` x^{2} x_{i} and Greek/maths symbols (α β δ ≤ ≥ ± ∞ …).
   Honest limits: standard PDF fonts (Times, Courier, Symbol), so only Latin-1/Central European letters and the
   listed symbols print (others become "?"); no hyphenation; wide figures/tables start a new page in two columns;
   remote pictures need a server that allows cross-origin use, otherwise a labelled placeholder is drawn. */
editor.registerExtension({
  id: "scientific-paper",
  name: "Scientific Paper PDF",
  version: "1.0.0",
  author: "Redact user",
  description: "Export journal-style papers (one or two columns) with title block, abstract, tables, figures, equations and references.",
  activate(api) {
    /* ---------- font metrics (Adobe AFM, units per 1000 em) for ASCII 32-126 ---------- */
    const D10 = "500 500 500 500 500 500 500 500 500 500";
    const WT = {
      R: ("250 333 408 500 500 833 778 333 333 333 500 564 250 333 250 278 " + D10 + " 278 278 564 564 564 444 921 " +
        "722 667 667 722 611 556 722 722 333 389 722 611 889 722 722 556 722 667 556 611 722 722 944 722 722 611 " +
        "333 278 333 469 500 333 444 500 444 500 444 333 500 500 278 278 500 278 778 500 500 500 500 333 389 278 500 500 722 500 500 444 480 200 480 541").split(" ").map(Number),
      B: ("250 333 555 500 500 1000 833 333 333 333 500 570 250 333 250 278 " + D10 + " 333 333 570 570 570 500 930 " +
        "722 667 722 722 667 611 778 778 389 500 778 667 944 722 778 611 778 722 556 667 722 722 1000 722 722 667 " +
        "333 278 333 581 500 333 500 556 444 556 444 333 500 556 278 333 556 278 833 556 500 556 556 444 389 333 556 500 722 500 500 444 394 220 394 520").split(" ").map(Number),
      I: ("250 333 420 500 500 833 778 333 333 333 500 675 250 333 250 278 " + D10 + " 333 333 675 675 675 500 920 " +
        "611 611 667 722 611 611 722 722 333 444 667 556 833 667 722 611 722 611 500 556 722 611 833 611 556 556 " +
        "389 278 389 422 500 333 500 500 444 500 444 278 500 500 278 278 444 278 722 500 500 500 500 389 389 278 500 444 667 444 444 389 400 275 400 541").split(" ").map(Number)
    };
    WT.BI = WT.B;
    const SPECIAL = { "–": 500, "—": 1000, "‘": 333, "’": 333, "“": 444, "”": 444, "•": 350, "…": 1000, "\u00a0": 250 };
    const cw = (ch, f) => {
      if (f === "M") return 600; if (f === "S") return 550;
      const t = WT[f], c = ch.charCodeAt(0);
      if (c >= 32 && c <= 126) return t[c - 32];
      if (SPECIAL[ch]) return SPECIAL[ch];
      const b = ch.normalize("NFD")[0]; if (b !== ch && b.charCodeAt(0) < 127) return t[b.charCodeAt(0) - 32];
      return 500;
    };
    /* ---------- character encoding ---------- */
    const WIN = { "€": 128, "‚": 130, "„": 132, "…": 133, "†": 134, "‡": 135, "‰": 137, "Š": 138, "Œ": 140, "Ž": 142, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151, "™": 153, "š": 154, "œ": 156, "ž": 158, "Ÿ": 159 };
    const EXTRA = { "ć": 1, "č": 2, "Ć": 3, "Č": 4, "đ": 5, "Đ": 6, "ł": 7, "Ł": 8, "ě": 9, "ř": 10 };
    const SYM = { "α": 97, "β": 98, "γ": 103, "δ": 100, "ε": 101, "θ": 113, "λ": 108, "μ": 109, "π": 112, "ρ": 114, "σ": 115, "τ": 116, "φ": 102, "ω": 119, "Δ": 68, "Σ": 83, "Ω": 87, "Π": 80, "Φ": 70, "≤": 163, "≥": 179, "≠": 185, "±": 177, "∞": 165, "∈": 206, "←": 172, "→": 174, "∑": 229, "√": 214, "∂": 182, "≈": 187 };
    const code = ch => { const c = ch.charCodeAt(0); return c >= 32 && c <= 126 ? c : EXTRA[ch] || WIN[ch] || (c >= 160 && c <= 255 ? c : 63); };
    const esc = (s, f) => { let o = ""; for (const ch of s) { const c = f === "S" ? (SYM[ch] || 63) : code(ch); o += c < 32 || c > 126 || c === 40 || c === 41 || c === 92 ? "\\" + c.toString(8).padStart(3, "0") : String.fromCharCode(c); } return o; };
    const FN = { R: "F1", B: "F2", I: "F3", BI: "F4", M: "F5", S: "F6" };

    /* ---------- inline markup -> segments -> words ---------- */
    function inline(s, plain) {
      const segs = []; let b = false, i = false, m = false, buf = "", k = 0;
      const fnt = () => m ? "M" : b && i ? "BI" : b ? "B" : i ? "I" : "R";
      const flush = () => { if (buf) { segs.push({ t: buf, f: fnt(), sc: 1, r: 0 }); buf = ""; } };
      while (k < s.length) {
        const c = s[k];
        if (c === "\\" && k + 1 < s.length) { buf += s[k + 1]; k += 2; continue; }
        if (!plain && c === "*") {
          if (s[k + 1] === "*") { flush(); b = !b; k += 2; continue; }
          const prev = s[k - 1] || " ", next = s[k + 1] || " ";
          if ((!i && next !== " ") || (i && prev !== " ")) { flush(); i = !i; k++; continue; }
        }
        if (!plain && c === "`") { flush(); m = !m; k++; continue; }
        if ((c === "^" || c === "_") && s[k + 1] === "{") {
          const e = s.indexOf("}", k + 2);
          if (e > 0) { flush(); segs.push({ t: s.slice(k + 2, e), f: fnt(), sc: .65, r: c === "^" ? .38 : -.2 }); k = e + 1; continue; }
        }
        buf += c; k++;
      }
      flush();
      const out = [];
      for (const sg of segs) { // move maths symbols into the Symbol font
        let cur = "";
        for (const ch of sg.t) { if (SYM[ch] && sg.f !== "M") { if (cur) out.push({ ...sg, t: cur }); cur = ""; out.push({ ...sg, t: ch, f: "S" }); } else cur += ch; }
        if (cur) out.push({ ...sg, t: cur });
      }
      return out;
    }
    const restyle = (segs, map) => segs.map(s => ({ ...s, f: map[s.f] || s.f }));
    function toWords(segs) {
      const words = []; let cur = [];
      for (const sg of segs) {
        if (sg.f === "S") { cur.push(sg); continue; }
        for (const p of sg.t.split(/(\s+)/)) { if (!p) continue; if (/^\s+$/.test(p)) { if (cur.length) { words.push(cur); cur = []; } } else cur.push({ ...sg, t: p }); }
      }
      if (cur.length) words.push(cur);
      return words;
    }
    const segW = (sg, size) => { let w = 0; for (const ch of sg.t) w += cw(ch, sg.f); return w * size * sg.sc / 1000; };
    const ww = (word, size) => word.reduce((a, sg) => a + segW(sg, size), 0);
    const sw = (t, f, size) => segW({ t, f, sc: 1 }, size);
    function splitWord(word, size, limit) { // break an over-long word (URLs) into pieces that fit
      const out = []; let cur = [], w = 0;
      for (const sg of word) for (const ch of sg.t) { const cwid = segW({ t: ch, f: sg.f, sc: sg.sc }, size); if (w + cwid > limit && cur.length) { out.push(cur); cur = []; w = 0; } cur.push({ ...sg, t: ch }); w += cwid; }
      if (cur.length) out.push(cur); return out;
    }
    function wrapText(words, size, w0, w1) {
      const sp = cw(" ", "R") * size / 1000, lines = []; let cur = [], cwid = 0, limit = w0;
      const queue = words.slice();
      while (queue.length) {
        let wd = queue.shift(), x = ww(wd, size);
        if (x > limit + .01 && !cur.length) { const parts = splitWord(wd, size, limit); if (parts.length > 1) { wd = parts[0]; x = ww(wd, size); queue.unshift(...parts.slice(1).map(p => p)); } }
        if (cur.length && cwid + sp + x > limit + .01) { lines.push({ w: cur, nat: cwid }); cur = []; cwid = 0; limit = w1; queue.unshift(wd); continue; }
        cur.push(wd); cwid += (cur.length > 1 ? sp : 0) + x;
      }
      if (cur.length) lines.push({ w: cur, nat: cwid });
      return lines;
    }

    /* ---------- templates ---------- */
    const TPL = {
      one: { cols: 1, gap: 0, ml: 76, mr: 76, mt: 78, mb: 70, fs: 11, lead: 1.27, h1: 13, h2: 11, title: 17, tfs: 10, numbering: "space", indent: 16, paraGap: 0, bullet: "–", hdr: "center", cap: "stack", figLabel: "Fig.", figSep: " – ", tabLabel: "Table", tabSep: "", refFs: 9.5, absFs: 10, footnote: true, footerRule: false, refHead: "numbered" },
      two: { cols: 2, gap: 18, ml: 54, mr: 54, mt: 66, mb: 62, fs: 9.5, lead: 1.22, h1: 12, h2: 10, title: 18, tfs: 8.5, numbering: "dot", indent: 0, paraGap: 4, bullet: "•", hdr: "split", cap: "inline", figLabel: "Figure", figSep: ". ", tabLabel: "Table", tabSep: ". ", refFs: 8.5, absFs: 8.5, footnote: false, footerRule: true, refHead: "caps" }
    };

    /* ---------- document parsing ---------- */
    function parseDoc(src) {
      const lines = src.replace(/\r\n?/g, "\n").split("\n"); const meta = {}; let i = 0;
      if (/^---\s*$/.test(lines[0] || "")) {
        i = 1; let key = null;
        for (; i < lines.length && !/^---\s*$/.test(lines[i]); i++) {
          const m = lines[i].match(/^([a-z]+)\s*:\s*(.*)$/i);
          if (m && /^(template|page|columns|fontsize|header|title|authors|affiliation|email|abstract|keywords|runhead|runtitle|footer)$/i.test(m[1])) { key = m[1].toLowerCase(); meta[key] = m[2].trim(); }
          else if (key && lines[i].trim()) meta[key] += " " + lines[i].trim();
        }
        i++;
      }
      const blocks = []; let para = [], refs = false, tableCap = null;
      const flush = () => { if (para.length) { blocks.push({ k: "p", text: para.join(" ") }); para = []; } };
      for (; i < lines.length; i++) {
        const ln = lines[i]; let m;
        if (/^\s*%/.test(ln)) continue;
        if (/^\s*<pagebreak>\s*$/i.test(ln)) { flush(); blocks.push({ k: "pb" }); continue; }
        if (/^\s*```/.test(ln)) { flush(); const code = []; i++; while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]); blocks.push({ k: "code", lines: code }); continue; }
        if (!ln.trim()) { flush(); continue; }
        if ((m = ln.match(/^(#{1,3})\s+(.*)$/))) { flush(); let t = m[2].trim(), num = true; if (/\{-\}\s*$/.test(t)) { num = false; t = t.replace(/\s*\{-\}\s*$/, ""); } refs = m[1].length === 1 && /^(references?|bibliography|literatura)\b/i.test(t); blocks.push({ k: "h", lvl: m[1].length, text: t, num, refs }); continue; }
        if ((m = ln.match(/^\s*\$\$(.*)\$\$\s*$/))) { flush(); blocks.push({ k: "eq", text: m[1].trim() }); continue; }
        if ((m = ln.match(/^Table\s*:\s*(.*)$/i))) { flush(); tableCap = m[1]; continue; }
        if (/^\s*\|/.test(ln)) {
          flush(); const rows = [];
          while (i < lines.length && /^\s*\|/.test(lines[i])) { if (!/^\s*\|[\s:|-]+\|?\s*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim())); i++; }
          i--; let cap = tableCap || "", wide = /\{wide\}/.test(cap); cap = cap.replace(/\s*\{wide\}/, ""); blocks.push({ k: "table", rows, cap, wide }); tableCap = null; continue;
        }
        if ((m = ln.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/))) { flush(); const wide = /\{wide\}/.test(m[1]); blocks.push({ k: "fig", cap: m[1].replace(/\s*\{wide\}/, ""), src: m[2], wide }); continue; }
        if (refs) { flush(); blocks.push({ k: "ref", text: ln.trim() }); continue; }
        if ((m = ln.match(/^\s*(?:[-•–]|(\d+)\.)\s+(.*)$/))) { flush(); blocks.push({ k: "li", text: m[2], n: m[1] }); continue; }
        para.push(ln.trim());
      }
      flush(); return { meta, blocks };
    }

    /* ---------- media (same approach as the slide exporter) ---------- */
    const loadImg = src => new Promise(res => {
      if (typeof Image === "undefined") return res(null);
      const im = new Image(); if (/^https?:/i.test(src)) im.crossOrigin = "anonymous";
      im.onload = () => res(im); im.onerror = () => res(null); setTimeout(() => res(null), 12000); im.src = src;
    });
    function toJpeg(el) {
      const w = el.naturalWidth, h = el.naturalHeight; if (!w || !h) return null;
      const k = Math.min(1, 1800 / w), cv = document.createElement("canvas"); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(el, 0, 0, cv.width, cv.height);
      try { const b = atob(cv.toDataURL("image/jpeg", .88).split(",")[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return { bytes: u, w: cv.width, h: cv.height }; } catch (e) { return null; }
    }
    async function loadMedia(src) {
      if (!/^https?:\/\//i.test(src) && !/^data:image\//i.test(src)) return { reason: "Local or unsupported address" };
      const im = await loadImg(src), j = im && toJpeg(im);
      return j ? { jpg: j } : { reason: "Image could not be loaded (not found, or the server blocks cross-origin use)" };
    }

    /* ---------- layout ---------- */
    function layout(doc, media) {
      const M = doc.meta, T = { ...TPL[M.template === "two" ? "two" : "one"] };
      if (M.columns) { T.cols = M.columns === "2" ? 2 : 1; T.gap = T.cols > 1 ? (T.gap || 18) : 0; }
      const [PW, PH] = (M.page || "").toLowerCase() === "letter" ? [612, 792] : [595, 842];
      const fs = +M.fontsize || T.fs, lead = fs * T.lead, cols = T.cols, gap = cols > 1 ? (T.gap || 18) : 0;
      const fullW = PW - T.ml - T.mr, colW = (fullW - gap * (cols - 1)) / cols;
      const pages = [], imgs = [], imgIdx = new Map(); let P, col = 0, y = 0, sec = 0, sub = 0, tab = 0, fig = 0, eq = 0, refN = 0, noIndent = true;
      const GREY = "0.55 G", INK = "0.1 g";
      const cmd = (s) => P.cmds.push(s);
      const text = (s, f, size, x, yy, color) => cmd("BT " + (color || INK) + " /" + FN[f] + " " + size.toFixed(2) + " Tf " + x.toFixed(2) + " " + yy.toFixed(2) + " Td (" + esc(s, f) + ") Tj ET");
      const rule = (x1, x2, yy, w, col_) => cmd((col_ || GREY) + " " + w + " w " + x1.toFixed(1) + " " + yy.toFixed(1) + " m " + x2.toFixed(1) + " " + yy.toFixed(1) + " l S");
      const vrule = (xx, y1, y2, w) => cmd(GREY + " " + w + " w " + xx.toFixed(1) + " " + y1.toFixed(1) + " m " + xx.toFixed(1) + " " + y2.toFixed(1) + " l S");

      // footnote block (first page, one-column template)
      const foot = [M.affiliation, M.email].filter(Boolean).join("  ");
      const footLines = T.footnote && foot ? wrapText(toWords(inline(foot, true)), 9, fullW, fullW) : [];
      const footH = footLines.length ? footLines.length * 11 + 10 : 0;
      const bottom = () => T.mb + (P.n === 1 ? footH : 0);
      const newPage = () => { P = { cmds: [], ims: new Set(), n: pages.length + 1 }; pages.push(P); col = 0; P.top = PH - T.mt - (P.n > 1 ? 14 : 0); y = P.top; noIndent = true; };
      const colX = () => T.ml + col * (colW + gap);
      const advance = () => { if (col + 1 < cols) { col++; y = P.top; } else newPage(); };
      const ensure = h => { let g = 0; while (y - h < bottom() && y < P.top - .5 && g++ < 4) advance(); };

      function drawLine(ln, x, yy, size, justify, width, align) {
        const n = ln.w.length, sp = cw(" ", "R") * size / 1000; let gapw = sp, cx = x;
        if (justify && n > 1) gapw = Math.max(sp * .7, (width - (ln.nat - (n - 1) * sp)) / (n - 1));
        else if (align === "center") cx = x + (width - ln.nat) / 2; else if (align === "right") cx = x + width - ln.nat;
        for (const wd of ln.w) { for (const sg of wd) { text(sg.t, sg.f, size * sg.sc, cx, yy + sg.r * size); cx += segW(sg, size); } cx += gapw; }
      }
      function para(segs, o = {}) {
        const size = o.size || fs, ld = o.lead || size * T.lead, ind = o.indent || 0, left = o.left || 0, w = o.width || colW, x0 = o.x != null ? o.x : colX();
        const lines = wrapText(toWords(segs), size, w - left - ind, w - left);
        lines.forEach((ln, i) => {
          ensure(ld); y -= ld; const first = i === 0;
          drawLine(ln, (o.x != null ? o.x : colX()) + left + (first ? ind : 0), y, size, o.justify !== false && !o.align && i < lines.length - 1, w - left - (first ? ind : 0), o.align);
          if (first && o.bullet) text(o.bullet, "R", size, (o.x != null ? o.x : colX()) + left - 11, y);
          if (first && o.label) text(o.label, o.labelFont || "R", size, (o.x != null ? o.x : colX()) + (o.labelX || 0), y);
        });
        y -= o.gap != null ? o.gap : T.paraGap; return lines.length;
      }
      const emphasise = (segs, map) => restyle(segs, map);
      const bold = { R: "B", I: "BI" }, ital = { R: "I", B: "BI" };

      /* ----- first page: header lines, title block ----- */
      newPage();
      (function titleBlock() {
        const hd = (M.header || "").split("|").map(s => s.trim()).filter(Boolean);
        if (hd.length) {
          if (T.hdr === "center") hd.forEach((s, i) => { const f = i === 0 ? "B" : "R", sz = i === 0 ? 10 : 8.5, w = sw(s, f, sz); text(s, f, sz, (PW - w) / 2, PH - 34 - i * 12); });
          else { const l = hd[0], r = hd[1] || "", sz = 8; text(l, "R", sz, T.ml, PH - 34); if (r) text(r, "R", sz, PW - T.mr - sw(r, "R", sz), PH - 34); rule(T.ml, PW - T.mr, PH - 40, .8, "0.2 G"); }
        }
        y = PH - T.mt - 4;
        if (M.title) {
          const ln = wrapText(toWords(restyle(inline(M.title), bold)), T.title, fullW * .92, fullW * .92);
          ln.forEach(l => { y -= T.title * 1.22; drawLine(l, T.ml, y, T.title, false, fullW, "center"); }); y -= 10;
        }
        if (M.authors) { const ln = wrapText(toWords(inline(M.authors, true)), fs + 1.5, fullW, fullW); ln.forEach(l => { y -= (fs + 1.5) * 1.3; drawLine(l, T.ml, y, fs + 1.5, false, fullW, "center"); }); y -= 6; }
        if (!T.footnote) [M.affiliation, M.email].filter(Boolean).forEach(s => { wrapText(toWords(restyle(inline(s, true), ital)), 8.5, fullW, fullW).forEach(l => { y -= 11; drawLine(l, T.ml, y, 8.5, false, fullW, "center"); }); });
        y -= 8;
        for (const [label, key] of [["Abstract:", "abstract"], ["Keywords:", "keywords"]]) {
          if (!M[key]) continue;
          const segs = [{ t: label + " ", f: "B", sc: 1, r: 0 }, ...(key === "keywords" && T.cols === 1 ? restyle(inline(M[key]), ital) : inline(M[key]))];
          const sz = T.absFs, lines = wrapText(toWords(segs), sz, fullW, fullW);
          lines.forEach((l, i) => { y -= sz * 1.28; drawLine(l, T.ml, y, sz, i < lines.length - 1, fullW); }); y -= 6;
        }
        if (T.cols > 1) { rule(T.ml, PW - T.mr, y - 2, .6); y -= 12; } else y -= 8;
        P.top = y;
      })();

      /* ----- blocks ----- */
      function heading(b) {
        let label = "", t = b.text;
        const isRefs = b.refs;
        if (isRefs && T.refHead === "caps") { t = t.toUpperCase(); }
        else if (b.num) { if (b.lvl === 1) { sec++; sub = 0; label = T.numbering === "dot" ? sec + ". " : sec + " "; } else if (b.lvl === 2) { sub++; label = sec + "." + sub + " "; } }
        const size = b.lvl === 1 ? T.h1 : b.lvl === 2 ? T.h2 : fs;
        const segs = restyle([{ t: label, f: "R", sc: 1, r: 0 }, ...inline(t)], b.lvl === 3 ? { R: "BI", I: "BI", B: "BI" } : bold);
        const lines = wrapText(toWords(segs), size, colW, colW), lh = size * 1.25, before = y >= P.top - .5 ? 0 : (b.lvl === 1 ? fs * 1.1 : fs * .7);
        ensure(before + lines.length * lh + fs * .5 + lead * 2); if (y < P.top - .5) y -= before;
        lines.forEach(l => { y -= lh; drawLine(l, colX(), y, size, false, colW); }); y -= b.lvl === 1 ? fs * .45 : fs * .3; noIndent = true;
      }
      function wideStart(wide) { if (wide && cols > 1) { if (y < P.top - .5 || col > 0) newPage(); return true; } return false; }
      function caption(kind, n, txt, x, w) {
        const lab = kind === "fig" ? T.figLabel + " " + n : T.tabLabel + " " + n, sz = T.tfs, ld = sz * 1.25;
        if (T.cap === "stack" && kind === "tab") { para([{ t: lab, f: "B", sc: 1, r: 0 }], { size: sz, lead: ld, x, width: w, align: "center", gap: 0 }); if (txt) para(restyle(inline(txt), ital), { size: sz, lead: ld, x, width: w, align: "center", gap: 3 }); }
        else para([{ t: lab + (kind === "fig" ? T.figSep : T.tabSep), f: "B", sc: 1, r: 0 }, ...(T.cap === "stack" ? restyle(inline(txt), ital) : inline(txt))], { size: sz, lead: ld, x, width: w, align: "center", gap: 4 });
      }
      function capHeight(kind, txt, w) { const sz = T.tfs; const lab = (kind === "fig" ? T.figLabel : T.tabLabel) + " 00" + (kind === "fig" ? T.figSep : T.tabSep); const n = wrapText(toWords([{ t: lab + txt, f: "R", sc: 1, r: 0 }]), sz, w, w).length; return (T.cap === "stack" && kind === "tab" ? n + 1 : n) * sz * 1.25 + 8; }
      function figure(b) {
        const wide = wideStart(b.wide), w = wide ? fullW : colW; fig++;
        const m = media.get(b.src), ok = m && m.jpg, w0 = ok ? m.jpg.w : 4, h0 = ok ? m.jpg.h : 3;
        const maxH = (P.top - bottom()) * .62, sc = Math.min(w / w0, maxH / h0, ok ? 2.5 : 1e9), ph = ok ? 0 : Math.min(150, maxH);
        const dw = ok ? w0 * sc : w, dh = ok ? h0 * sc : ph, capH = capHeight("fig", b.cap, w);
        ensure(dh + 10 + capH + 6); y -= 6; const x = (wide ? T.ml : colX()) + (w - dw) / 2, yb = y - dh;
        if (ok) { if (!imgIdx.has(b.src)) { imgIdx.set(b.src, imgs.length); imgs.push(m.jpg); } const k = imgIdx.get(b.src); P.ims.add(k); cmd("q " + dw.toFixed(1) + " 0 0 " + dh.toFixed(1) + " " + x.toFixed(1) + " " + yb.toFixed(1) + " cm /Im" + k + " Do Q"); }
        else {
          cmd("0.94 g " + x.toFixed(1) + " " + yb.toFixed(1) + " " + dw.toFixed(1) + " " + dh.toFixed(1) + " re f");
          wrapText(toWords([{ t: "Figure not available: " + ((m && m.reason) || "") + " " + b.src, f: "R", sc: 1, r: 0 }]), 8, dw - 16, dw - 16).slice(0, 5).forEach((l, i) => drawLine(l, x + 8, yb + dh - 16 - i * 10, 8, false, dw - 16));
        }
        y = yb - 6; caption("fig", fig, b.cap, wide ? T.ml : colX(), w); if (wide) { P.top = y - 4; y = P.top; }
      }
      function table(b) {
        const wide = wideStart(b.wide), w = wide ? fullW : colW, x0 = wide ? T.ml : colX(), sz = T.tfs - (cols > 1 && !wide ? 0 : 0), ld = sz * 1.25, pad = 4; tab++;
        const nc = Math.max(...b.rows.map(r => r.length)), cells = b.rows.map((r, ri) => Array.from({ length: nc }, (_, c) => { const sg = inline(r[c] || ""); return toWords(ri === 0 ? restyle(sg, bold) : sg); }));
        const nat = Array.from({ length: nc }, (_, c) => Math.max(...cells.map(r => Math.max(0, ...r[c].map(wd => ww(wd, sz))) + 0)) ), full = Array.from({ length: nc }, (_, c) => Math.max(...cells.map(r => r[c].reduce((a, wd) => a + ww(wd, sz) + sz * .25, 0))));
        let cwid = full.map(f => f + 2 * pad); const sum = cwid.reduce((a, b) => a + b, 0);
        if (sum > w) { const minW = nat.map(n => n + 2 * pad); let extra = w - minW.reduce((a, b) => a + b, 0); if (extra < 0) cwid = minW.map(m => m * w / minW.reduce((a, b) => a + b, 0)); else { const need = cwid.map((c, i) => Math.max(0, c - minW[i])), tn = need.reduce((a, b) => a + b, 0) || 1; cwid = minW.map((m, i) => m + extra * need[i] / tn); } } else cwid = cwid.map(c => c * w / sum);
        const tw = cwid.reduce((a, b) => a + b, 0), tx = x0 + (w - tw) / 2;
        const rowLines = cells.map(r => r.map((wd, c) => wrapText(wd, sz, cwid[c] - 2 * pad, cwid[c] - 2 * pad)));
        const rowH = rowLines.map(r => Math.max(...r.map(l => l.length)) * ld + 4);
        ensure(capHeight("tab", b.cap, w) + rowH[0] + (rowH[1] || 0) + 8); y -= 4; caption("tab", tab, b.cap, x0, w);
        cmd(INK.replace("g", "G") + " 0.9 w " + tx.toFixed(1) + " " + y.toFixed(1) + " m " + (tx + tw).toFixed(1) + " " + y.toFixed(1) + " l S");
        const vlines = (y1, y2) => { let xx = tx; for (let c = 0; c <= nc; c++) { vrule(xx, y1, y2, .5); xx += cwid[c] || 0; } };
        let segStart = y;
        rowLines.forEach((r, ri) => {
          if (y - rowH[ri] < bottom() && y < P.top - .5) { vlines(segStart, y); rule(tx, tx + tw, y, .9, "0.1 G"); advance(); segStart = y; rule(tx, tx + tw, y, .9, "0.1 G"); }
          let xx = tx; const h = rowH[ri];
          r.forEach((lines, c) => { lines.forEach((l, li) => drawLine(l, xx + pad, y - 2 - (li + 1) * ld + (ld - sz) * .5 + 1, sz, false, cwid[c] - 2 * pad, "center")); xx += cwid[c]; });
          y -= h; rule(tx, tx + tw, y, ri === 0 || ri === rowLines.length - 1 ? .9 : .5, ri === 0 || ri === rowLines.length - 1 ? "0.1 G" : GREY);
        });
        vlines(segStart, y); y -= 8; if (wide) { P.top = y; }
      }
      function equation(b) {
        eq++; const size = fs, segs = inline(b.text), words = toWords(segs), w = words.reduce((a, wd) => a + ww(wd, size), 0) + (words.length - 1) * cw(" ", "R") * size / 1000;
        ensure(lead * 2); y -= lead * 1.5; drawLine({ w: words, nat: w }, colX(), y, size, false, colW, "center");
        text("(" + eq + ")", "R", size, colX() + colW - sw("(" + eq + ")", "R", size), y); y -= lead * .5; noIndent = true;
      }
      doc.blocks.forEach(b => {
        switch (b.k) {
          case "h": heading(b); break;
          case "p": para(inline(b.text), { indent: noIndent ? 0 : T.indent }); noIndent = false; break;
          case "li": para(inline(b.text), { left: 14, bullet: b.n ? null : T.bullet, label: b.n ? b.n + "." : null, labelX: 2, gap: 2, justify: true }); break;
          case "ref": {
            refN++; const m = b.text.match(/^(\[\d+\]|\d+\.)\s*(.*)$/), lab = m ? m[1] : "[" + refN + "]", t = m ? m[2] : b.text;
            para(inline(t, true), { size: T.refFs, left: cols > 1 ? 20 : 24, label: lab, justify: false, gap: 2 }); break;
          }
          case "code": { const sz = fs * .85; b.lines.forEach(l => wrapText([[{ t: l || " ", f: "M", sc: 1, r: 0 }]], sz, colW - 8, colW - 8).forEach(ln => { ensure(sz * 1.3); y -= sz * 1.3; cmd("0.95 g " + colX().toFixed(1) + " " + (y - 2.5).toFixed(1) + " " + colW.toFixed(1) + " " + (sz * 1.3).toFixed(1) + " re f"); drawLine(ln, colX() + 4, y, sz, false, colW - 8); })); y -= 4; break; }
          case "eq": equation(b); break;
          case "table": table(b); break;
          case "fig": figure(b); break;
          case "pb": newPage(); break;
        }
      });

      /* ----- running heads, footers, footnote ----- */
      const runhead = M.runhead || (M.authors || "").replace(/\^\{[^}]*\}|\*/g, ""), runtitle = M.runtitle || (M.title || "").replace(/\*/g, "");
      const ft = (M.footer || "").split("|").map(s => s.trim());
      pages.forEach((pg, idx) => {
        P = pg; const n = pg.n;
        if (n > 1) {
          const sz = 8.5, yy = PH - T.mt + 12;
          if (n % 2 === 0) { text(String(n), "B", sz, T.ml, yy); text(runhead, "I", sz, T.ml + 26, yy); }
          else { text(runtitle, "I", sz, T.ml, yy); text(String(n), "B", sz, PW - T.mr - sw(String(n), "B", sz), yy); }
        }
        if (T.footerRule && ft[0]) { rule(T.ml, PW - T.mr, T.mb - 14, .6); text(ft[0], "R", 7.5, T.ml, T.mb - 26); if (ft[1]) text(ft[1], "R", 7.5, PW - T.mr - sw(ft[1], "R", 7.5), T.mb - 26); }
        else if (!T.footerRule && ft[0]) text(ft[0], "R", 8, (PW - sw(ft[0], "R", 8)) / 2, T.mb - 30);
        if (n === 1 && footLines.length) { const y0 = T.mb + footH - 4; rule(T.ml, T.ml + 60, y0 + 6, .6); footLines.forEach((l, i) => drawLine(l, T.ml, y0 - 4 - i * 11, 9, false, fullW)); }
      });
      return { pages, imgs, PW, PH };
    }

    /* ---------- PDF assembly ---------- */
    function assemble({ pages, imgs, PW, PH }) {
      const parts = []; let len = 0; const offs = [];
      const put = d => { if (typeof d === "string") { const b = new Uint8Array(d.length); for (let i = 0; i < d.length; i++) b[i] = d.charCodeAt(i) & 255; d = b; } parts.push(d); len += d.length; };
      const obj = (id, body) => { offs[id] = len; put(id + " 0 obj\n" + body + "\nendobj\n"); };
      let nid = 10; imgs.forEach(im => im.id = nid++); pages.forEach(p => { p.cid = nid++; p.pid = nid++; });
      put("%PDF-1.4\n");
      const enc = "9 0 R", fnt = (n, e) => "<</Type/Font/Subtype/Type1/BaseFont/" + n + (e ? "/Encoding " + enc : "") + ">>";
      obj(3, fnt("Times-Roman", 1)); obj(4, fnt("Times-Bold", 1)); obj(5, fnt("Times-Italic", 1)); obj(6, fnt("Times-BoldItalic", 1)); obj(7, fnt("Courier", 1)); obj(8, fnt("Symbol", 0));
      obj(9, "<</Type/Encoding/BaseEncoding/WinAnsiEncoding/Differences[1/cacute/ccaron/Cacute/Ccaron/dcroat/Dcroat/lslash/Lslash/ecaron/rcaron]>>");
      imgs.forEach(im => { offs[im.id] = len; put(im.id + " 0 obj\n<</Type/XObject/Subtype/Image/Width " + im.w + "/Height " + im.h + "/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length " + im.bytes.length + ">>\nstream\n"); put(im.bytes); put("\nendstream\nendobj\n"); });
      pages.forEach(p => {
        const s = p.cmds.join("\n");
        obj(p.cid, "<</Length " + s.length + ">>\nstream\n" + s + "\nendstream");
        const xo = [...p.ims].map(k => "/Im" + k + " " + imgs[k].id + " 0 R").join(" ");
        obj(p.pid, "<</Type/Page/Parent 2 0 R/MediaBox [0 0 " + PW + " " + PH + "]/Resources<</Font<</F1 3 0 R/F2 4 0 R/F3 5 0 R/F4 6 0 R/F5 7 0 R/F6 8 0 R>>" + (xo ? "/XObject<<" + xo + ">>" : "") + ">>/Contents " + p.cid + " 0 R>>");
      });
      obj(1, "<</Type/Catalog/Pages 2 0 R>>"); obj(2, "<</Type/Pages/Kids [" + pages.map(p => p.pid + " 0 R").join(" ") + "]/Count " + pages.length + ">>");
      const xref = len; let x = "xref\n0 " + nid + "\n0000000000 65535 f \n"; for (let i = 1; i < nid; i++) x += String(offs[i]).padStart(10, "0") + " 00000 n \n";
      put(x + "trailer\n<</Size " + nid + "/Root 1 0 R>>\nstartxref\n" + xref + "\n%%EOF");
      return parts;
    }
    async function build(src) {
      const doc = parseDoc(src), media = new Map();
      for (const b of doc.blocks) if (b.k === "fig" && !media.has(b.src)) media.set(b.src, await loadMedia(b.src));
      const out = layout(doc, media); return { parts: assemble(out), pages: out.pages.length, failed: [...media.values()].filter(m => !m.jpg).length };
    }
    editor.paper = { build, parseDoc };

    /* ---------- templates for new papers ---------- */
    const ONE = `---
template: one
header: JOURNAL OF EXAMPLE STUDIES | Vol. 1, No. 1, January 2027, 1-6 | DOI: 10.0000/example.2027.001
title: A Short Study of Something Interesting: Methods and Results
authors: Ana Petrović^{1}, Marko Jovanović^{1}
runhead: A. Petrović, M. Jovanović
runtitle: A Short Study of Something Interesting
affiliation: ^{1}Department of Computer Science, Example University, Belgrade, Serbia;
email: E-mails: ana@example.org; marko@example.org
abstract: This paper demonstrates the one-column journal layout. It shows a title block, an abstract, numbered sections, a table, an equation and a reference list. Replace this text with your own.
keywords: Layout, Example, Scientific writing
---
# Introduction
The first paragraph of a section is not indented; later paragraphs are. Inline markup works: **bold**, *italic*, \`code\`, x^{2}, x_{i} and symbols such as α, β, δ ≤ ε [1].

Later paragraphs get a first-line indent, as in the journal sample. Cite sources with numbers in square brackets [2].

## Background
Lists use dashes:
- the first item;
- the second item.

# Method
The loss used in the experiment is defined by the equation below.

$$ L(a) = ½ a^{2}, for |a| ≤ δ $$

Table: Results of the three runs.
| Run | Accuracy | Error |
|---|---|---|
| A | 91% | 0.09 |
| B | 87% | 0.13 |
| C | 85% | 0.15 |

% To add a figure, use the command "Insert image into paper" (or write ![Caption](https://…)).

# Conclusion
This template is a starting point. Edit the front matter at the top, then run "Export paper as PDF".

# References
[1] A. Author, B. Author: Title of the First Article, Journal of Examples, Vol. 1, No. 1, 2020, pp. 1–10.
[2] C. Writer: Title of a Book, Publisher, City, 2019.
`;
    const TWO = `---
template: two
header: Journal of Example Studies, 1(1) 1-6, January 2027 | ISSN: 0000-0000 eISSN: 0000-0001
title: A Short Study of Something Interesting
authors: Ana PETROVIĆ*, Marko JOVANOVIĆ
affiliation: Example University, 1 Main Street, Belgrade, 11000, Serbia
email: ana@example.org (*Corresponding author), marko@example.org
abstract: This paper demonstrates the two-column journal layout. The title block and abstract span the page; the body flows into two justified columns. Replace this text with your own.
keywords: Layout, Example, Scientific writing
runhead: Ana Petrović, Marko Jovanović
runtitle: A Short Study of Something Interesting
footer: https://doi.org/10.0000/example.2027.001 | Example Publisher © Copyright 2027. All rights reserved
---
# Introduction
Body text is set in two justified columns. Inline markup works: **bold**, *italic*, \`code\`, x^{2}, x_{i}, and symbols such as α, β, δ, ≤ [1].

## Related work
Subsections are numbered automatically. Tables and figures are numbered and captioned.

Table: Results of the three runs.
| Run | Accuracy | Error |
|---|---|---|
| A | 91% | 0.09 |
| B | 87% | 0.13 |
| C | 85% | 0.15 |

# Method
The objective is given by the equation below.

$$ L(a) = ½ a^{2}, for |a| ≤ δ $$

Add {wide} to a table or figure caption to make it span both columns.

# Conclusion
Edit the front matter at the top, then run "Export paper as PDF".

# References
[1] A. Author, B. Author: Title of the First Article, Journal of Examples, Vol. 1, No. 1, 2020, pp. 1–10.
[2] C. Writer: Title of a Book, Publisher, City, 2019.
`;

    /* ---------- commands ---------- */
    api.registerCommand("export", {
      label: "Export paper as PDF", category: "Paper", key: "alt+shift+p",
      async run() {
        const d = api.doc(); if (!d.text.trim()) { api.notify("Nothing to export: the document is empty.", true); return; }
        api.notify("Building the paper…");
        let r; try { r = await build(d.text); } catch (e) { api.notify("Could not build the paper: " + e.message, true); return; }
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(r.parts, { type: "application/pdf" }));
        a.download = d.name.replace(/\.[^.]+$/, "") + ".pdf"; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        api.notify("Downloaded " + a.download + " (" + r.pages + " page" + (r.pages > 1 ? "s" : "") + ")" + (r.failed ? "; " + r.failed + " figure(s) became placeholders" : ""), !!r.failed);
      }
    });
    api.registerCommand("newOne", { label: "New paper: one column", category: "Paper", run() { api.openDoc("paper-one-column.md", ONE); } });
    api.registerCommand("newTwo", { label: "New paper: two columns", category: "Paper", run() { api.openDoc("paper-two-columns.md", TWO); } });
    api.registerCommand("switch", {
      label: "Switch paper between one and two columns", category: "Paper",
      run() {
        const t = api.editor.text(), m = t.match(/^template:\s*(one|two)\s*$/m);
        if (!m) { api.notify("This document has no “template: one|two” line in its front matter.", true); return; }
        const i = t.indexOf(m[0]); api.editor.replace(i, i + m[0].length, "template: " + (m[1] === "one" ? "two" : "one")); api.notify("Template is now " + (m[1] === "one" ? "two columns" : "one column") + ". Front-matter header/footer lines may need adjusting.");
      }
    });
    api.registerCommand("insertImage", {
      label: "Insert image into paper", category: "Paper",
      run() {
        const i = document.createElement("input"); i.type = "file"; i.accept = "image/*";
        i.onchange = async () => {
          const f = i.files[0]; if (!f) return; const cap = await api.prompt("Figure caption", f.name.replace(/\.[^.]+$/, ""));
          const url = URL.createObjectURL(f), im = await loadImg(url); URL.revokeObjectURL(url);
          if (!im) { api.notify("That file could not be read as an image.", true); return; }
          const k = Math.min(1, 1400 / im.naturalWidth), cv = document.createElement("canvas"); cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
          const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(im, 0, 0, cv.width, cv.height);
          const [s, e] = api.editor.sel(); api.editor.replace(s, e, "\n![" + (cap || "").replace(/[\[\]()]/g, "") + "](" + cv.toDataURL("image/jpeg", .85) + ")\n");
          api.notify("Image embedded (max 1400 px wide). Add {wide} inside the caption to span both columns.");
        };
        i.click();
      }
    });
    api.registerCommand("insertTable", {
      label: "Insert table into paper", category: "Paper",
      run() { const [s, e] = api.editor.sel(); api.editor.replace(s, e, "\nTable: Caption of the table.\n| Column 1 | Column 2 | Column 3 |\n|---|---|---|\n| a | b | c |\n| d | e | f |\n"); }
    });
    api.registerCommand("insertEquation", {
      label: "Insert numbered equation into paper", category: "Paper",
      run() { const [s, e] = api.editor.sel(); api.editor.replace(s, e, "\n$$ y = α x^{2} + β x + γ $$\n"); }
    });
  },
  deactivate() {}
});
