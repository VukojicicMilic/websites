/* Redact extension: Exam Paper PDF
   Builds a printed exam question paper in the style of a Cambridge-type written paper: numbered questions with
   (a)/(i) parts, dotted answer lines, mark brackets [n], tables and trace grids, line-matching questions,
   answer boxes, numbered code listings, entity boxes, figures, blank pages, running page numbers,
   footer with copyright / paper code / [Turn over, an optional cover page, and a separate mark scheme.

   Front matter (between --- lines): cover: yes|no  board  level  subject  paper  series  time  code  copyright
     startpage  turnover: yes|no  instructions: item | item | item  acknowledgement: text
   Body (one element per line / block):
     # Question text                     (auto-numbered 1, 2, 3 …)
     (a) Part text       (i) Sub-part text      plain lines continue the current part
     lines 4 [4]         dotted answer lines, marks on the last line      numbered 3 [3]    "1 ....", "2 ...." then marks
     line: Drawback 1    prefix + dotted line            [3]  (alone on a line) marks at the right
     boxes 8 [1]         row of answer squares           box height=120    empty answer box
     @table widths=20,60,20 rowh=24 empty=6 center [3]   then | pipe | rows |   (first row is the header; "<" merges left, "^" merges up)
     @match Left heading | Right heading [3]   then lines  Left item | Right item
     @entities cols=3 [4]   then one entity name per line      ```numbers … ```  code listing      ![caption {w=200}](url)
     @blank  (BLANK PAGE)     @pagebreak      % comment line      ANS: model answer (kept out of the question paper)
   Inline: **bold** *italic* `code`, ✓ and common symbols.  Use \\| for a literal | inside table cells.
   Limits: standard PDF fonts (Helvetica, Courier, Symbol, ZapfDingbats); wide tables are not split across pages;
   remote pictures need a server that allows cross-origin use, otherwise a labelled placeholder is drawn. */
editor.registerExtension({
  id: "exam-paper",
  name: "Exam Paper PDF",
  version: "1.0.0",
  author: "Redact user",
  description: "Create printable exam question papers (answer lines, marks, tables, matching, trace grids) and a mark scheme.",
  activate(api) {
    /* ---------- Helvetica / Arial metrics, ASCII 32-126 ---------- */
    const D = "556 556 556 556 556 556 556 556 556 556";
    const WT = {
      R: ("278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 " + D + " 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 " +
        "278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584").split(" ").map(Number),
      B: ("278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 " + D + " 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 " +
        "333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584").split(" ").map(Number)
    };
    WT.I = WT.R; WT.BI = WT.B;
    const SPECIAL = { "–": 556, "—": 1000, "‘": 222, "’": 222, "“": 333, "”": 333, "•": 350, "…": 1000, "\u00a0": 278 };
    const cw = (ch, f) => {
      if (f === "M" || f === "MB") return 600; if (f === "S") return 550; if (f === "Z") return 760;
      const t = WT[f], c = ch.charCodeAt(0);
      if (c >= 32 && c <= 126) return t[c - 32]; if (SPECIAL[ch]) return SPECIAL[ch];
      const b = ch.normalize("NFD")[0]; if (b !== ch && b.charCodeAt(0) < 127) return t[b.charCodeAt(0) - 32]; return 556;
    };
    const WIN = { "€": 128, "…": 133, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151, "™": 153, "š": 154, "Š": 138, "ž": 158, "Ž": 142 };
    const EXTRA = { "ć": 1, "č": 2, "Ć": 3, "Č": 4, "đ": 5, "Đ": 6, "ł": 7, "Ł": 8, "ě": 9, "ř": 10 };
    const SYM = { "α": 97, "β": 98, "γ": 103, "δ": 100, "θ": 113, "λ": 108, "μ": 109, "π": 112, "σ": 115, "Δ": 68, "Σ": 83, "Ω": 87, "≤": 163, "≥": 179, "≠": 185, "±": 177, "∞": 165, "←": 172, "→": 174, "↔": 171 };
    const ZAP = { "✓": 52, "✔": 52, "✗": 56, "✘": 56 };
    const code = ch => { const c = ch.charCodeAt(0); return c >= 32 && c <= 126 ? c : EXTRA[ch] || WIN[ch] || (c >= 160 && c <= 255 ? c : 63); };
    const esc = (s, f) => { let o = ""; for (const ch of s) { const c = f === "S" ? (SYM[ch] || 63) : f === "Z" ? (ZAP[ch] || 63) : code(ch); o += c < 32 || c > 126 || c === 40 || c === 41 || c === 92 ? "\\" + c.toString(8).padStart(3, "0") : String.fromCharCode(c); } return o; };
    const FN = { R: "F1", B: "F2", I: "F3", BI: "F4", M: "F5", MB: "F6", S: "F7", Z: "F8" };

    /* ---------- inline markup ---------- */
    function inline(s) {
      const segs = []; let b = false, i = false, m = false, buf = "", k = 0;
      const fnt = () => m ? (b ? "MB" : "M") : b && i ? "BI" : b ? "B" : i ? "I" : "R";
      const flush = () => { if (buf) { segs.push({ t: buf, f: fnt() }); buf = ""; } };
      while (k < s.length) {
        const c = s[k];
        if (c === "\\" && k + 1 < s.length) { buf += s[k + 1]; k += 2; continue; }
        if (c === "*") { if (s[k + 1] === "*") { flush(); b = !b; k += 2; continue; } const pv = s[k - 1] || " ", nx = s[k + 1] || " "; if ((!i && nx !== " ") || (i && pv !== " ")) { flush(); i = !i; k++; continue; } }
        if (c === "`") { flush(); m = !m; k++; continue; }
        buf += c; k++;
      }
      flush();
      const out = [];
      for (const sg of segs) { let cur = ""; for (const ch of sg.t) { const sp = ZAP[ch] ? "Z" : SYM[ch] && sg.f !== "M" && sg.f !== "MB" ? "S" : null; if (sp) { if (cur) out.push({ ...sg, t: cur }); cur = ""; out.push({ ...sg, t: ch, f: sp }); } else cur += ch; } if (cur) out.push({ ...sg, t: cur }); }
      return out;
    }
    const toWords = segs => {
      const words = []; let cur = [];
      for (const sg of segs) { if (sg.f === "S" || sg.f === "Z") { cur.push(sg); continue; } for (const p of sg.t.split(/(\s+)/)) { if (!p) continue; if (/^\s+$/.test(p)) { if (cur.length) { words.push(cur); cur = []; } } else cur.push({ ...sg, t: p }); } }
      if (cur.length) words.push(cur); return words;
    };
    const segW = (sg, size) => { let w = 0; for (const ch of sg.t) w += cw(ch, sg.f); return w * size / 1000; };
    const ww = (wd, size) => wd.reduce((a, s) => a + segW(s, size), 0);
    const sw = (t, f, size) => segW({ t, f }, size);
    function splitWord(word, size, limit) { const out = []; let cur = [], w = 0; for (const sg of word) for (const ch of sg.t) { const x = segW({ t: ch, f: sg.f }, size); if (w + x > limit && cur.length) { out.push(cur); cur = []; w = 0; } cur.push({ ...sg, t: ch }); w += x; } if (cur.length) out.push(cur); return out; }
    function wrapText(words, size, w0, w1) {
      const sp = cw(" ", "R") * size / 1000, lines = []; let cur = [], cwid = 0, limit = w0; const q = words.slice();
      while (q.length) {
        let wd = q.shift(), x = ww(wd, size);
        if (x > limit + .01 && !cur.length) { const parts = splitWord(wd, size, limit); if (parts.length > 1) { wd = parts[0]; x = ww(wd, size); q.unshift(...parts.slice(1)); } }
        if (cur.length && cwid + sp + x > limit + .01) { lines.push({ w: cur, nat: cwid }); cur = []; cwid = 0; limit = w1; q.unshift(wd); continue; }
        cur.push(wd); cwid += (cur.length > 1 ? sp : 0) + x;
      }
      if (cur.length) lines.push({ w: cur, nat: cwid }); return lines;
    }

    /* ---------- parsing ---------- */
    const ROMAN = new Set("i ii iii iv v vi vii viii ix x".split(" "));
    function opts(str) { const o = { flags: new Set(), kv: {} }; for (const t of (str || "").split(/\s+/).filter(Boolean)) { const m = t.match(/^(\w+)=(.*)$/); if (m) o.kv[m[1]] = m[2]; else o.flags.add(t); } return o; }
    const takeMarks = s => { const m = s.match(/\s*\[(\d+)\]\s*$/); return m ? [s.slice(0, m.index), +m[1]] : [s, 0]; };
    const cells = ln => ln.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, "|"));
    function parse(src) {
      const lines = src.replace(/\r\n?/g, "\n").split("\n"), meta = {}; let i = 0;
      if (/^---\s*$/.test(lines[0] || "")) {
        let key = null; for (i = 1; i < lines.length && !/^---\s*$/.test(lines[i]); i++) { const m = lines[i].match(/^([a-z]+)\s*:\s*(.*)$/i); if (m) { key = m[1].toLowerCase(); meta[key] = m[2].trim(); } else if (key && lines[i].trim()) meta[key] += " " + lines[i].trim(); } i++;
      }
      const items = []; let para = [];
      const flush = () => { if (para.length) { items.push({ t: "p", text: para.join(" ") }); para = []; } };
      for (; i < lines.length; i++) {
        const ln = lines[i]; let m;
        if (/^\s*%/.test(ln)) continue;
        if (!ln.trim()) { flush(); continue; }
        if (/^\s*```/.test(ln)) { flush(); const num = /numbers/.test(ln), cl = []; i++; while (i < lines.length && !/^\s*```/.test(lines[i])) cl.push(lines[i++]); items.push({ t: "code", lines: cl, num }); continue; }
        if ((m = ln.match(/^#\s+(.*)$/))) { flush(); items.push({ t: "q", text: m[1] }); continue; }
        if ((m = ln.match(/^\(([a-z]|[ivx]+)\)\s+(.*)$/))) { flush(); items.push({ t: "part", label: m[1], text: m[2] }); continue; }
        if ((m = ln.match(/^ANS\s*:\s*(.*)$/))) { flush(); items.push({ t: "ans", text: m[1] }); continue; }
        if ((m = ln.match(/^@mcq\b(.*)$/))) { flush(); const [, mk] = takeMarks(m[1]), os = []; while (i + 1 < lines.length && /^[A-H]\s+\S/.test(lines[i + 1])) os.push(lines[++i].trim()); items.push({ t: "mcq", opts: os, m: mk }); continue; }
        if ((m = ln.match(/^@words\b(.*)$/))) { flush(); items.push({ t: "words", list: m[1].split(",").map(x => x.trim()).filter(Boolean) }); continue; }
        if ((m = ln.match(/^ruled\s+(\d+)(?:\s+\[(\d+)\])?\s*$/))) { flush(); items.push({ t: "ruled", n: +m[1], m: +(m[2] || 0) }); continue; }
        if ((m = ln.match(/^@graph\b(.*)$/))) { flush(); const [rest, mk] = takeMarks(m[1]); items.push({ t: "graph", o: opts(rest), m: mk }); continue; }
        if ((m = ln.match(/^@extract\b(.*)$/))) { flush(); const tx = []; while (i + 1 < lines.length && lines[i + 1].trim() && !/^(ANS\s*:|#|\(|@|lines|numbered|line:|boxes|box\b|ruled|\[)/.test(lines[i + 1])) tx.push(lines[++i].trim()); items.push({ t: "extract", title: m[1].trim(), text: tx.join(" ") }); continue; }
        if (/^@blank/.test(ln)) { flush(); items.push({ t: "blank" }); continue; }
        if (/^@pagebreak/.test(ln)) { flush(); items.push({ t: "pb" }); continue; }
        if ((m = ln.match(/^lines\s+(\d+)(?:\s+\[(\d+)\])?\s*$/))) { flush(); items.push({ t: "lines", n: +m[1], m: +(m[2] || 0) }); continue; }
        if ((m = ln.match(/^numbered\s+(\d+)(?:\s+\[(\d+)\])?\s*$/))) { flush(); items.push({ t: "numbered", n: +m[1], m: +(m[2] || 0) }); continue; }
        if ((m = ln.match(/^line\s*:\s*(.*)$/))) { flush(); const [tx, mk] = takeMarks(m[1]); items.push({ t: "line", text: tx, m: mk }); continue; }
        if ((m = ln.match(/^\[(\d+)\]\s*$/))) { flush(); items.push({ t: "marks", m: +m[1] }); continue; }
        if ((m = ln.match(/^boxes\s+(\d+)(?:\s+\[(\d+)\])?\s*$/))) { flush(); items.push({ t: "boxes", n: +m[1], m: +(m[2] || 0) }); continue; }
        if ((m = ln.match(/^box\b(.*)$/))) { flush(); const [rest, mk] = takeMarks(m[1]); items.push({ t: "box", o: opts(rest), m: mk }); continue; }
        if ((m = ln.match(/^@table\b(.*)$/))) {
          flush(); const [rest, mk] = takeMarks(m[1]), rows = [];
          while (i + 1 < lines.length && /^\s*\|/.test(lines[i + 1])) { i++; if (!/^\s*\|[\s:|-]+\|?\s*$/.test(lines[i])) rows.push(cells(lines[i])); }
          items.push({ t: "table", o: opts(rest), rows, m: mk }); continue;
        }
        if ((m = ln.match(/^@match\b(.*)$/))) {
          flush(); const [rest, mk] = takeMarks(m[1]), rows = [];
          while (i + 1 < lines.length && lines[i + 1].trim() && lines[i + 1].includes("|") && !/^ANS\s*:/.test(lines[i + 1])) rows.push(cells(lines[++i]));
          items.push({ t: "match", head: rest.split("|").map(s => s.trim()), rows, m: mk }); continue;
        }
        if ((m = ln.match(/^@entities\b(.*)$/))) {
          flush(); const [rest, mk] = takeMarks(m[1]), names = []; while (i + 1 < lines.length && lines[i + 1].trim() && !/^(ANS\s*:|#|\(|@|lines|numbered|line:|boxes|box\b|ruled|\[)/.test(lines[i + 1])) names.push(lines[++i].trim());
          items.push({ t: "entities", o: opts(rest), names, m: mk }); continue;
        }
        if ((m = ln.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/))) { flush(); const w = (m[1].match(/\{w=(\d+)\}/) || [])[1]; items.push({ t: "fig", alt: m[1].replace(/\s*\{w=\d+\}/, ""), src: m[2], w: w ? +w : 0 }); continue; }
        para.push(ln.trim());
      }
      flush(); items.forEach(it => { if (it.text && typeof it.text === "string" && it.t !== "extract") it.text = it.text.replace(/\{gap\}/g, ".".repeat(42)); }); return { meta, items };
    }

    /* ---------- media ---------- */
    const loadImg = src => new Promise(res => { if (typeof Image === "undefined") return res(null); const im = new Image(); if (/^https?:/i.test(src)) im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); setTimeout(() => res(null), 12000); im.src = src; });
    function toJpeg(el) {
      const w = el.naturalWidth, h = el.naturalHeight; if (!w || !h) return null; const k = Math.min(1, 1600 / w), cv = document.createElement("canvas"); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(el, 0, 0, cv.width, cv.height);
      try { const b = atob(cv.toDataURL("image/jpeg", .9).split(",")[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return { bytes: u, w: cv.width, h: cv.height }; } catch (e) { return null; }
    }
    async function loadMedia(src) { if (!/^https?:\/\//i.test(src) && !/^data:image\//i.test(src)) return { reason: "Local or unsupported address" }; const im = await loadImg(src), j = im && toJpeg(im); return j ? { jpg: j } : { reason: "Image could not be loaded (not found, or the server blocks cross-origin use)" }; }

    /* ---------- layout ---------- */
    function layout(doc, media) {
      const M = doc.meta, PW = 595, PH = 842, L0 = 50, IND = [72, 95, 118], XR = 545, BOT = 74, TOP = PH - 80, FS = 10, LEAD = 12.7;
      const pages = [], imgs = [], imgIdx = new Map(); let P, y, tx = IND[0], qn = 0, total = 0, lastL2 = "", path = { q: 0, a: "", i: "" };
      const cover = (M.cover || "").toLowerCase() === "yes", turn = (M.turnover || "yes").toLowerCase() !== "no", ms = [];
      const startNo = +M.startpage || (cover ? 2 : 1), INK = "0.08 g", GREY = "0.4 g";
      const cmd = s => P.cmds.push(s);
      const T = (s, f, size, x, yy, col) => cmd("BT " + (col || INK) + " /" + FN[f] + " " + size.toFixed(2) + " Tf " + x.toFixed(2) + " " + yy.toFixed(2) + " Td (" + esc(s, f) + ") Tj ET");
      const TR = (s, f, size, xr, yy) => T(s, f, size, xr - sw(s, f, size), yy);
      const stroke = (w, d) => "q " + (d || "[] 0 d") + " " + w + " w 0 G ";
      const line = (x1, y1, x2, y2, w) => cmd(stroke(w || .7) + x1.toFixed(1) + " " + y1.toFixed(1) + " m " + x2.toFixed(1) + " " + y2.toFixed(1) + " l S Q");
      const rect = (x, yy, w, h, lw) => cmd(stroke(lw || .7) + x.toFixed(1) + " " + yy.toFixed(1) + " " + w.toFixed(1) + " " + h.toFixed(1) + " re S Q");
      const dotted = (x1, x2, yy) => cmd("q [0.1 2.7] 0 d 1 J 0.9 w 0.15 G " + x1.toFixed(1) + " " + yy.toFixed(1) + " m " + x2.toFixed(1) + " " + yy.toFixed(1) + " l S Q");
      const newPage = (noNum) => { P = { cmds: [], ims: new Set(), cover: !!noNum }; pages.push(P); y = TOP; };
      const ensure = h => { if (y - h < BOT && y < TOP - 1) newPage(); };
      const gap = h => { if (y < TOP - 1) y -= h; };
      function drawLine(ln, x, yy, size, justify, width) {
        const n = ln.w.length, sp = cw(" ", "R") * size / 1000; let g = sp, cx = x;
        if (justify && n > 1) g = Math.max(sp * .8, (width - (ln.nat - (n - 1) * sp)) / (n - 1));
        for (const wd of ln.w) { for (const sg of wd) { T(sg.t, sg.f, size, cx, yy); cx += segW(sg, size); } cx += g; }
      }
      function para(segs, x, o = {}) {
        const w = XR - x, size = o.size || FS, ld = o.lead || LEAD, lines = wrapText(toWords(segs), size, w, w);
        lines.forEach((ln, i) => { ensure(ld); y -= ld; drawLine(ln, x, y, size, o.justify !== false && i < lines.length - 1, w); if (i === 0 && o.label) T(o.label, "B", size, o.labelX, y); });
        return lines.length;
      }
      const markText = m => "[" + m + "]";
      const marksRight = (m, dy) => { if (!m) return; total += m; ensure(14); y -= dy != null ? dy : 14; TR(markText(m), "R", FS, XR, y); };

      /* ----- cover page ----- */
      if (cover) {
        newPage(true); const c = P; let yy = PH - 70;
        T(M.board || "Examination Board", "B", 13, L0, yy); yy -= 16; if (M.level) T(M.level, "R", 11, L0, yy); yy -= 40;
        T("Candidate name", "R", 11, L0, yy); dotted(L0 + 90, XR, yy - 1); yy -= 34;
        T("Centre number", "R", 11, L0, yy + 5); for (let k = 0; k < 5; k++) rect(L0 + 85 + k * 20, yy, 20, 20, .7);
        T("Candidate number", "R", 11, 300, yy + 5); for (let k = 0; k < 4; k++) rect(300 + 95 + k * 20, yy, 20, 20, .7); yy -= 70;
        line(L0, yy + 20, XR, yy + 20, 1); T((M.subject || "SUBJECT").toUpperCase() + (M.code ? "    " + M.code.split("/").slice(0, 2).join("/") : ""), "B", 16, L0, yy - 8);
        if (M.series) TR(M.series, "R", 12, XR, yy - 8); yy -= 26; if (M.paper) T(M.paper, "R", 12, L0, yy); if (M.time) TR(M.time, "R", 12, XR, yy); yy -= 18; line(L0, yy, XR, yy, 1); yy -= 34;
        const ins = (M.instructions || "Write your name, centre number and candidate number in the boxes above. | Write in dark blue or black pen. | Do not use staples, paper clips, glue or correction fluid. | Answer all questions. | Write your answers in the spaces provided on this question paper.").split("|").map(s => s.trim()).filter(Boolean);
        c._ins = ins; c._y = yy;
      }
      newPage();
      const refOf = p => p.q + (p.a ? "(" + p.a + ")" : "") + (p.i ? "(" + p.i + ")" : "");
      const refKey = p => refOf(p); let pendingNew = false;
      /* ----- body ----- */
      for (let ix = 0; ix < doc.items.length; ix++) {
        const it = doc.items[ix], nxt = doc.items[ix + 1], keep = nxt && /^(table|match|entities|boxes|box|code|fig|graph|extract|mcq|words)$/.test(nxt.t) ? 120 : 0;
        if (pendingNew && it.t !== "blank" && it.t !== "pb" && it.t !== "ans") { newPage(); pendingNew = false; }
        switch (it.t) {
          case "q": {
            qn++; path = { q: qn, a: "", i: "" }; lastL2 = ""; tx = IND[0]; gap(14); ensure(LEAD * 4 + keep);
            para(inline(it.text), IND[0], { label: String(qn), labelX: L0 }); y -= 3; break;
          }
          case "part": {
            const lb = it.label, isLetter = !ROMAN.has(lb) || (lastL2 && lb.length === 1 && lb.charCodeAt(0) === lastL2.charCodeAt(0) + 1);
            const lvl = isLetter ? 2 : 3; if (lvl === 2) { lastL2 = lb; path.a = lb; path.i = ""; } else path.i = lb;
            const lx = lvl === 2 ? IND[0] : IND[1]; tx = lvl === 2 ? IND[1] : IND[2]; gap(8); ensure(LEAD * 3 + keep);
            para(inline(it.text), tx, { label: "(" + lb + ")", labelX: lx }); y -= 3; break;
          }
          case "p": ensure(LEAD * 2 + keep); para(inline(it.text), tx); y -= 5; break;
          case "ans": ms.push({ ref: refOf(path), ans: it.text, key: refKey(path) }); break;
          case "lines": {
            for (let k = 0; k < it.n; k++) { ensure(26); y -= 26; const last = k === it.n - 1 && it.m; dotted(tx, last ? XR - 28 : XR, y); if (last) { TR(markText(it.m), "R", FS, XR, y); } } if (it.m) { total += it.m; noteMarks(it.m); } y -= 4; break;
          }
          case "numbered": {
            for (let k = 1; k <= it.n; k++) { ensure(26); y -= 26; T(String(k), "R", FS, tx, y); dotted(tx + 14, XR, y); } marksRight(it.m, 14); if (it.m) noteMarks(it.m); y -= 4; break;
          }
          case "line": {
            ensure(26); y -= 26; const [txt] = [it.text], pw = txt ? sw(txt, "R", FS) + 5 : 0, last = it.m ? XR - 28 : XR; if (txt) T(txt, "R", FS, tx, y); dotted(tx + pw, last, y); if (it.m) { TR(markText(it.m), "R", FS, XR, y); total += it.m; noteMarks(it.m); } break;
          }
          case "marks": marksRight(it.m, 4); noteMarks(it.m); y -= 2; break;
          case "boxes": { const s = 22, w = it.n * s; ensure(s + 30); y -= 14; const x0 = (PW - w) / 2; for (let k = 0; k < it.n; k++) rect(x0 + k * s, y - s, s, s, .7); y -= s; marksRight(it.m, 14); if (it.m) noteMarks(it.m); y -= 4; break; }
          case "box": { const h = +it.o.kv.height || 100; ensure(h + 20); y -= 6; rect(tx, y - h, XR - tx, h, .7); y -= h; marksRight(it.m, 14); if (it.m) noteMarks(it.m); y -= 4; break; }
          case "blank": if (y < TOP - 1 || P.cmds.length) newPage(); T("BLANK PAGE", "B", FS + 1, (PW - sw("BLANK PAGE", "B", FS + 1)) / 2, TOP + 4); pendingNew = true; break;
          case "pb": newPage(); break;
          case "code": {
            const sz = 9, ld = 12; gap(4); it.lines.forEach((l, k) => { ensure(ld); y -= ld; if (it.num) { T(String(k + 1).padStart(2, "0"), "M", sz, tx, y); T(l, "M", sz, tx + 24, y); } else T(l, "M", sz, tx, y); }); y -= 8; break;
          }
          case "fig": {
            const m = media.get(it.src), ok = m && m.jpg, w0 = ok ? m.jpg.w : 4, h0 = ok ? m.jpg.h : 3, maxW = it.w || 300, maxH = 230, sc = Math.min(maxW / w0, maxH / h0), dw = w0 * sc, dh = h0 * sc;
            ensure(dh + 16); y -= 8; const x = (PW - dw) / 2, yb = y - dh;
            if (ok) { if (!imgIdx.has(it.src)) { imgIdx.set(it.src, imgs.length); imgs.push(m.jpg); } const k = imgIdx.get(it.src); P.ims.add(k); cmd("q " + dw.toFixed(1) + " 0 0 " + dh.toFixed(1) + " " + x.toFixed(1) + " " + yb.toFixed(1) + " cm /Im" + k + " Do Q"); }
            else { cmd("0.94 g " + x.toFixed(1) + " " + yb.toFixed(1) + " " + dw.toFixed(1) + " " + dh.toFixed(1) + " re f"); wrapText(toWords([{ t: "Figure not available: " + ((m && m.reason) || "") + " " + it.src, f: "R" }]), 8, dw - 16, dw - 16).slice(0, 5).forEach((l, k) => drawLine(l, x + 8, yb + dh - 16 - k * 10, 8, false, dw - 16)); }
            y = yb - 8; break;
          }
          case "mcq": { gap(4); it.opts.forEach(o => { const lb = o[0], tx2 = o.slice(1).trim(); ensure(LEAD * 2); para(inline(tx2), tx + 24, { label: lb, labelX: tx + 4, justify: false }); y -= 4; }); marksRight(it.m, 6); if (it.m) noteMarks(it.m); break; }
          case "words": {
            const cols = 4, cwid = (XR - tx) / cols, rows = Math.ceil(it.list.length / cols); ensure(rows * 18 + 10); y -= 6;
            for (let r = 0; r < rows; r++) { y -= 17; for (let c = 0; c < cols; c++) { const w = it.list[r * cols + c]; if (w) T(w, "B", FS, tx + c * cwid, y); } } y -= 6; break;
          }
          case "ruled": { for (let k = 0; k < it.n; k++) { ensure(25); y -= 25; const last = k === it.n - 1 && it.m; line(tx, y, last ? XR - 28 : XR, y, .5); if (last) TR(markText(it.m), "R", FS, XR, y + 2); } if (it.m) { total += it.m; noteMarks(it.m); } y -= 4; break; }
          case "graph": {
            const w = Math.min(XR - tx, +it.o.kv.w || XR - tx), h = +it.o.kv.h || 220, nc = +it.o.kv.cols || 10, nr = +it.o.kv.rows || 10; ensure(h + 24); y -= 8; const x0 = tx + (XR - tx - w) / 2;
            for (let c = 0; c <= nc; c++) cmd("q 0.7 G " + (c % 5 === 0 ? .6 : .25) + " w " + (x0 + c * w / nc).toFixed(1) + " " + (y - h).toFixed(1) + " m " + (x0 + c * w / nc).toFixed(1) + " " + y.toFixed(1) + " l S Q");
            for (let r = 0; r <= nr; r++) cmd("q 0.7 G " + (r % 5 === 0 ? .6 : .25) + " w " + x0.toFixed(1) + " " + (y - r * h / nr).toFixed(1) + " m " + (x0 + w).toFixed(1) + " " + (y - r * h / nr).toFixed(1) + " l S Q");
            rect(x0, y - h, w, h, .9); y -= h; marksRight(it.m, 14); if (it.m) noteMarks(it.m); y -= 6; break;
          }
          case "extract": {
            const w = XR - tx - 16, ls = wrapText(toWords(inline(it.text)), 9.5, w, w), h = ls.length * 12 + (it.title ? 20 : 8) + 8; ensure(h + 10); y -= 8;
            cmd("0.95 g " + tx.toFixed(1) + " " + (y - h).toFixed(1) + " " + (XR - tx).toFixed(1) + " " + h.toFixed(1) + " re f"); rect(tx, y - h, XR - tx, h, .6);
            let yy = y - 6; if (it.title) { yy -= 11; T(it.title, "B", FS, tx + 8, yy); yy -= 6; } ls.forEach((l, k) => { yy -= 12; drawLine(l, tx + 8, yy, 9.5, k < ls.length - 1, w); }); y -= h + 8; break;
          }
          case "table": table(it); break;
          case "match": matchQ(it); break;
          case "entities": entities(it); break;
        }
      }
      function noteMarks(m) { const k = refKey(path); const e = ms.find(x => x.key === k && x.markOnly); if (e) e.marks += m; else ms.push({ ref: refOf(path), key: k, marks: m, markOnly: true }); }
      function table(it) {
        const o = it.o, rows = it.rows.map(r => r.slice()), nc = Math.max(...rows.map(r => r.length)); rows.forEach(r => { while (r.length < nc) r.push(""); });
        const sz = +o.kv.fs || FS, ld = sz * 1.28, pad = 5, nh = o.kv.header != null ? +o.kv.header : 1;
        const avail = XR - tx, wpct = o.kv.widths ? o.kv.widths.split(",").map(Number) : Array(nc).fill(100 / nc), tw = (o.kv.w ? +o.kv.w / 100 : 1) * avail, sum = wpct.reduce((a, b) => a + b, 0), cwid = wpct.map(p => p * tw / sum);
        const eh = +o.kv.emptyh || +o.kv.rowh || 24; for (let k = 0; k < (+o.kv.empty || 0); k++) rows.push(Array(nc).fill(""));
        const nr = rows.length, X = [0]; cwid.forEach(w => X.push(X[X.length - 1] + w));
        const prim = []; // primary cells with spans
        for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) { const t = rows[r][c]; if (t === "<" || t === "^") continue; let cs = 1, rs = 1; while (c + cs < nc && rows[r][c + cs] === "<") cs++; while (r + rs < nr && rows[r + rs][c] === "^") rs++; prim.push({ r, c, cs, rs, t, hd: r < nh }); }
        const rh = Array(nr).fill(0); const minH = +o.kv.rowh || 0;
        prim.forEach(p => { const w = X[p.c + p.cs] - X[p.c] - 2 * pad; p.lines = wrapText(toWords(p.hd ? inline("**" + p.t.replace(/\*\*/g, "") + "**") : inline(p.t)), sz, w, w); p.need = Math.max(1, p.lines.length) * ld + 2 * pad; if (p.rs === 1) rh[p.r] = Math.max(rh[p.r], p.need); });
        for (let r = 0; r < nr; r++) { rh[r] = Math.max(rh[r], minH || 0, r >= nr - (+o.kv.empty || 0) ? eh : 0, ld + 2 * pad); }
        prim.forEach(p => { if (p.rs > 1) { let have = 0; for (let k = 0; k < p.rs; k++) have += rh[p.r + k]; if (have < p.need) rh[p.r + p.rs - 1] += p.need - have; } });
        const H = rh.reduce((a, b) => a + b, 0); ensure(H + 14); gap(8); const x0 = o.flags.has("center") ? tx + (avail - tw) / 2 : tx; const Y = [y]; rh.forEach(h => Y.push(Y[Y.length - 1] - h));
        prim.forEach(p => {
          const cx = x0 + X[p.c], cwd = X[p.c + p.cs] - X[p.c], top = Y[p.r], bot = Y[p.r + p.rs], chh = top - bot; rect(cx, bot, cwd, chh, .7);
          const bh = p.lines.length * ld, by = top - (chh - bh) / 2; const center = p.hd || o.flags.has("center") || o.flags.has("centre");
          p.lines.forEach((l, k) => { const yy = by - (k + 1) * ld + (ld - sz) * .55 + 1; drawLine(l, cx + pad + (center ? (cwd - 2 * pad - l.nat) / 2 : 0), yy, sz, false, cwd - 2 * pad); });
        });
        y = Y[nr] - 2; marksRight(it.m, 14); if (it.m) noteMarks(it.m); y -= 6;
      }
      function matchQ(it) {
        const [lh, rh_] = it.head, lw = 76, rw = 226, lx = tx + 8, rx = XR - rw - 10, ld = LEAD, pad = 6; const rows = it.rows;
        const heights = rows.map(r => Math.max(36, wrapText(toWords(inline(r[1] || "")), FS, rw - 2 * pad, rw - 2 * pad).length * ld + 2 * pad));
        const H = heights.reduce((a, b) => a + b + 16, 0) + 36; ensure(H); y -= 14;
        if (lh) T(lh, "B", FS, lx, y); if (rh_) T(rh_, "B", FS, rx + (rw - sw(rh_, "B", FS)) / 2, y); y -= 22;
        rows.forEach((r, k) => {
          const h = heights[k], top = y; if (r[1]) { rect(rx, top - h, rw, h, .7); const ls = wrapText(toWords(inline(r[1])), FS, rw - 2 * pad, rw - 2 * pad); ls.forEach((l, j) => drawLine(l, rx + pad, top - pad - (j + 1) * ld + 3, FS, false, rw - 2 * pad)); }
          if (r[0]) { const ls = wrapText(toWords(inline(r[0])), FS, lw - 8, lw - 8), lhh = Math.max(36, ls.length * ld + 12), ty = top - (h - lhh) / 2; rect(lx, ty - lhh, lw, lhh, .7); ls.forEach((l, j) => drawLine(l, lx + (lw - l.nat) / 2, ty - (lhh - ls.length * ld) / 2 - (j + 1) * ld + 3, FS, false, lw)); }
          y -= h + 16;
        });
        marksRight(it.m, 0); if (it.m) noteMarks(it.m); y -= 4;
      }
      function entities(it) {
        const cols = +it.o.kv.cols || 3, bw = 112, bh = 48, gy = +it.o.kv.gapy || 78, rows = Math.ceil(it.names.length / cols); ensure(rows * (bh + gy) + 10); y -= 8;
        const x0 = tx, span = XR - tx - bw; it.names.forEach((nm, k) => {
          const r = Math.floor(k / cols), c = k % cols, x = cols > 1 ? x0 + c * span / (cols - 1) : x0, top = y - r * (bh + gy); rect(x, top - bh, bw, bh, .7);
          const ls = wrapText(toWords([{ t: nm, f: "M" }]), 9, bw - 8, bw - 8); ls.forEach((l, j) => drawLine(l, x + (bw - l.nat) / 2, top - bh / 2 + (ls.length * 11) / 2 - (j + 1) * 11 + 3, 9, false, bw));
        }); y -= rows * (bh + gy) - gy; marksRight(it.m, 14); if (it.m) noteMarks(it.m); y -= 6;
      }

      /* ----- cover contents, headers and footers ----- */
      if (cover) {
        const c = pages[0]; P = c; let yy = c._y;
        T("INSTRUCTIONS", "B", 11, L0, yy); yy -= 8;
        c._ins.forEach(s => { wrapText(toWords(inline(s)), 10.5, XR - L0 - 16, XR - L0 - 16).forEach((l, i) => { yy -= 14; if (i === 0) T("•", "R", 10.5, L0 + 2, yy); drawLine(l, L0 + 16, yy, 10.5, false, 0); }); yy -= 2; });
        yy -= 20; T("INFORMATION", "B", 11, L0, yy); yy -= 8;
        ["The total mark for this paper is " + total + ".", "The number of marks for each question or part question is shown in brackets [ ]."].forEach(s => { wrapText(toWords(inline(s)), 10.5, XR - L0 - 16, XR - L0 - 16).forEach((l, i) => { yy -= 14; if (i === 0) T("•", "R", 10.5, L0 + 2, yy); drawLine(l, L0 + 16, yy, 10.5, false, 0); }); yy -= 2; });
      }
      const body = pages.filter(p => !p.cover), lastIdx = pages.length - 1;
      pages.forEach((pg, idx) => {
        P = pg; const isCover = pg.cover, no = startNo + body.indexOf(pg);
        if (!isCover) { const s = String(no); T(s, "B", 10, (PW - sw(s, "B", 10)) / 2, PH - 42); }
        if (M.copyright) T(M.copyright, "R", 7.5, L0, 44);
        if (M.code) T(M.code, "R", 7.5, isCover ? 270 : 270, 44);
        if (turn && idx < lastIdx) TR("[Turn over", "B", 10, XR, 44);
        if (idx === lastIdx && M.acknowledgement) { line(L0, 100, XR, 100, .8); wrapText(toWords(inline(M.acknowledgement)), 7, XR - L0, XR - L0).forEach((l, i) => drawLine(l, L0, 90 - i * 9, 7, true, XR - L0)); }
      });
      return { pages, imgs, PW, PH, total, ms };
    }

    /* ---------- PDF assembly ---------- */
    function assemble({ pages, imgs, PW, PH }) {
      const parts = []; let len = 0; const offs = [];
      const put = d => { if (typeof d === "string") { const b = new Uint8Array(d.length); for (let i = 0; i < d.length; i++) b[i] = d.charCodeAt(i) & 255; d = b; } parts.push(d); len += d.length; };
      const obj = (id, body) => { offs[id] = len; put(id + " 0 obj\n" + body + "\nendobj\n"); };
      let nid = 12; imgs.forEach(im => im.id = nid++); pages.forEach(p => { p.cid = nid++; p.pid = nid++; });
      put("%PDF-1.4\n");
      const fnt = (n, e) => "<</Type/Font/Subtype/Type1/BaseFont/" + n + (e ? "/Encoding 11 0 R" : "") + ">>";
      obj(3, fnt("Helvetica", 1)); obj(4, fnt("Helvetica-Bold", 1)); obj(5, fnt("Helvetica-Oblique", 1)); obj(6, fnt("Helvetica-BoldOblique", 1)); obj(7, fnt("Courier", 1)); obj(8, fnt("Courier-Bold", 1)); obj(9, fnt("Symbol", 0)); obj(10, fnt("ZapfDingbats", 0));
      obj(11, "<</Type/Encoding/BaseEncoding/WinAnsiEncoding/Differences[1/cacute/ccaron/Cacute/Ccaron/dcroat/Dcroat/lslash/Lslash/ecaron/rcaron]>>");
      imgs.forEach(im => { offs[im.id] = len; put(im.id + " 0 obj\n<</Type/XObject/Subtype/Image/Width " + im.w + "/Height " + im.h + "/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length " + im.bytes.length + ">>\nstream\n"); put(im.bytes); put("\nendstream\nendobj\n"); });
      pages.forEach(p => {
        const s = p.cmds.join("\n"); obj(p.cid, "<</Length " + s.length + ">>\nstream\n" + s + "\nendstream");
        const xo = [...p.ims].map(k => "/Im" + k + " " + imgs[k].id + " 0 R").join(" ");
        obj(p.pid, "<</Type/Page/Parent 2 0 R/MediaBox [0 0 " + PW + " " + PH + "]/Resources<</Font<</F1 3 0 R/F2 4 0 R/F3 5 0 R/F4 6 0 R/F5 7 0 R/F6 8 0 R/F7 9 0 R/F8 10 0 R>>" + (xo ? "/XObject<<" + xo + ">>" : "") + ">>/Contents " + p.cid + " 0 R>>");
      });
      obj(1, "<</Type/Catalog/Pages 2 0 R>>"); obj(2, "<</Type/Pages/Kids [" + pages.map(p => p.pid + " 0 R").join(" ") + "]/Count " + pages.length + ">>");
      const xref = len; let x = "xref\n0 " + nid + "\n0000000000 65535 f \n"; for (let i = 1; i < nid; i++) x += String(offs[i]).padStart(10, "0") + " 00000 n \n";
      put(x + "trailer\n<</Size " + nid + "/Root 1 0 R>>\nstartxref\n" + xref + "\n%%EOF"); return parts;
    }
    async function build(src) {
      const doc = parse(src), media = new Map();
      for (const it of doc.items) if (it.t === "fig" && !media.has(it.src)) media.set(it.src, await loadMedia(it.src));
      const out = layout(doc, media); return { parts: assemble(out), pages: out.pages.length, total: out.total, failed: [...media.values()].filter(m => !m.jpg).length, ms: out.ms, meta: doc.meta };
    }
    /* Mark scheme: reuse the same engine by generating a table document */
    function schemeSource(r) {
      const rows = new Map(); r.ms.forEach(e => { const g = rows.get(e.key) || { ref: e.ref, ans: [], marks: 0 }; if (e.ans) g.ans.push(e.ans); if (e.marks) g.marks += e.marks; rows.set(e.key, g); });
      const list = [...rows.values()].filter(g => g.ans.length || g.marks);
      const sum = list.reduce((a, g) => a + g.marks, 0), esc2 = s => s.replace(/\|/g, "\\|");
      return "---\ncover: no\nstartpage: 1\nturnover: no\ncode: " + (r.meta.code || "") + "  MARK SCHEME\ncopyright: " + (r.meta.copyright || "") + "\n---\n# **Mark scheme** " + (r.meta.subject ? "– " + r.meta.subject : "") + "\n@table widths=14,72,14 header=1\n| Question | Answer | Marks |\n" +
        list.map(g => "| " + g.ref + " | " + (g.ans.length ? g.ans.map(esc2).join(" ; ") : "(see marking guidance)") + " | " + (g.marks || "") + " |").join("\n") + "\n| **Total** | | " + sum + " |\n";
    }
    editor.exam = { build, parse, schemeSource };

    /* ---------- templates and commands ---------- */
    const SAMPLE = `---
cover: yes
board: Example Examination Board
level: Example Advanced Subsidiary Level
subject: Computer Science
paper: Paper 1 Theory Fundamentals
series: May/June 2027
time: 1 hour 30 minutes
code: 9999/11/M/J/27
copyright: © Example Board 2027
startpage: 2
turnover: yes
---
# Draw **one** line from each hardware component to its correct description.
@match Component | Description [3]
CPU | Temporary storage for programs and data that are currently in use
RAM | Carries out the instructions of a program
SSD | Permanent storage that keeps data when the power is switched off
ANS: CPU – carries out instructions; RAM – temporary storage; SSD – permanent storage.

# A school keeps student details in a database.
(a) Give **three** security measures that restrict access to authorised staff.
numbered 3 [3]
ANS: Passwords; user access levels; biometric login; two-factor authentication.
(b) Describe what is meant by **validation**.
lines 3 [2]
ANS: An automatic check that data entered is reasonable / follows rules; it does not check the data is correct.
(c) The table shows part of the STUDENT table.
@table widths=18,27,27,28 center
| StudentID | FirstName | LastName | Form |
| \`001\` | Mia | Novak | 10A |
| \`002\` | Ivan | Horvat | 10B |
(i) Write a statement to return the first name of every student in form 10A.
lines 3 [3]
ANS: SELECT FirstName FROM STUDENT WHERE Form = '10A';
(ii) State the maximum number of values that can be stored using 8 bits.
line: [1]
ANS: 256

# The table shows part of the instruction set for a processor.
@table widths=18,22,60 header=2
| Instruction | < | Explanation |
| Op code | Operand | ^ |
| \`LDD\` | <address> | Load the contents of the address into ACC. |
| \`DEC\` | <register> | Subtract 1 from the register. |
| \`END\` | | Return control to the operating system. |
(a) Trace the program using the trace table.
\`\`\`numbers
LDD 200
DEC ACC
STO 200
END
\`\`\`
@table widths=22,16,20,20,22 rowh=22 empty=6 center [3]
| Instruction address | ACC | 200 | 201 | 202 |
| | | 2 | 0 | 200 |
(b) Convert the number 201 into 8-bit binary.
boxes 8 [1]
(c) Tick (✓) **one** box in each row to show whether the statement is true or false.
@table widths=70,15,15 rowh=26 center [2]
| Statement | True | False |
| An interpreter translates and runs code one line at a time. | | |
| A compiler must be present in memory to run the compiled program. | | |

# Complete the entity relationship diagram for the database.
@entities cols=3 [4]
COURSE
BOOKING
CUSTOMER

@blank
`;
    api.registerCommand("export", {
      label: "Export exam paper as PDF", category: "Exam", key: "alt+shift+e",
      async run() {
        const d = api.doc(); if (!d.text.trim()) { api.notify("Nothing to export: the document is empty.", true); return; }
        api.notify("Building the paper…");
        let r; try { r = await build(d.text); } catch (e) { api.notify("Could not build the paper: " + e.message, true); return; }
        save(r.parts, d.name.replace(/\.[^.]+$/, "") + ".pdf"); api.notify("Downloaded the paper: " + r.pages + " page(s), " + r.total + " marks" + (r.failed ? "; " + r.failed + " figure(s) became placeholders" : ""), !!r.failed);
      }
    });
    api.registerCommand("scheme", {
      label: "Export mark scheme as PDF", category: "Exam",
      async run() {
        const d = api.doc(); let r; try { r = await build(d.text); } catch (e) { api.notify("Could not build the paper: " + e.message, true); return; }
        if (!r.ms.some(e => e.ans)) { api.notify("No ANS: lines found. Add “ANS: model answer” under each part to build a mark scheme.", true); return; }
        const s = await build(schemeSource(r)); save(s.parts, d.name.replace(/\.[^.]+$/, "") + "-mark-scheme.pdf"); api.notify("Downloaded the mark scheme (" + r.total + " marks).");
      }
    });
    function save(parts, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(parts, { type: "application/pdf" })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
    api.registerCommand("new", { label: "New exam paper", category: "Exam", run() { api.openDoc("exam-paper.md", SAMPLE); } });
    const ins = (id, label, text) => api.registerCommand(id, { label, category: "Exam", run() { const [s, e] = api.editor.sel(); api.editor.replace(s, e, text); } });
    ins("question", "Insert question with parts", "\n# Question text.\n(a) Part text.\nlines 3 [2]\nANS: \n(b) Part text.\nlines 2 [2]\nANS: \n");
    ins("lines", "Insert answer lines", "\nlines 3 [3]\n");
    ins("table", "Insert answer table", "\n@table widths=40,20,20,20 rowh=24 empty=4 center [4]\n| Heading | A | B | C |\n");
    ins("match", "Insert matching question", "\n@match Term | Description [3]\nTerm 1 | Description 1\nTerm 2 | Description 2\nTerm 3 | Description 3\n");
    const WORDS = [["Calculate", "work out from given facts or figures; show the working"], ["Complete", "add the missing information"], ["Define", "give the precise meaning"], ["Describe", "state the points of a topic / give characteristics"], ["Draw", "make a line representation"], ["Evaluate", "judge or calculate the quality, importance or amount"], ["Explain", "set out purposes or reasons, with a reason for each point"], ["Give", "produce an answer from recall or the information given"], ["Identify", "name or select and recognise"], ["Justify", "support a case with evidence or argument"], ["Label", "add names or labels to a diagram"], ["Name", "give the name of something"], ["Outline", "set out the main points"], ["State", "express in clear terms"], ["Suggest", "apply knowledge to a situation that is not a standard case"], ["Tick (✓)", "mark the correct box(es)"], ["Compare", "identify similarities and differences"], ["Discuss", "write about issues or ideas in a balanced way"], ["Predict", "suggest what may happen based on information"], ["Trace", "follow through step by step, recording values"]];
    api.registerCommand("commandWord", {
      label: "Insert command word", category: "Exam", desc: "Common exam command words with short meanings",
      run() {
        const box = h("div", {}, WORDS.map(([w, d]) => h("div", { class: "it", onclick: () => { Modal.close(); setTimeout(() => { const [a, b] = api.editor.sel(); api.editor.replace(a, b, w.replace(/ \(.*/, "") + " "); }, 0); } }, h("span", {}, h("b", {}, w), h("small", {}, " – " + d)))));
        Modal.open("Command words", box);
      }
    });
    ins("mcq", "Insert multiple-choice question", "\n# Question stem?\n@mcq [1]\nA first option\nB second option\nC third option\nD fourth option\nANS: C\n");
    ins("words", "Insert word bank and gap-fill", "\n@words alpha, beta, gamma, delta, epsilon, zeta\nComplete the sentences using words from the list. {gap} is used when {gap} .\n");
    ins("ruled", "Insert ruled (essay) lines", "\nruled 12 [6]\n");
    ins("graph", "Insert graph grid", "\n@graph h=240 cols=10 rows=12 [3]\n");
    ins("extract", "Insert source extract box", "\n@extract Source A\nPaste the source text here.\n");
    api.registerCommand("insertImage", {
      label: "Insert image into exam paper", category: "Exam",
      run() {
        const i = document.createElement("input"); i.type = "file"; i.accept = "image/*";
        i.onchange = async () => {
          const f = i.files[0]; if (!f) return; const url = URL.createObjectURL(f), im = await loadImg(url); URL.revokeObjectURL(url); if (!im) { api.notify("That file could not be read as an image.", true); return; }
          const k = Math.min(1, 1000 / im.naturalWidth), cv = document.createElement("canvas"); cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
          const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(im, 0, 0, cv.width, cv.height);
          const [s, e] = api.editor.sel(); api.editor.replace(s, e, "\n![{w=260}](" + cv.toDataURL("image/jpeg", .85) + ")\n"); api.notify("Image embedded. Change {w=260} to resize it (points).");
        };
        i.click();
      }
    });
  },
  deactivate() {}
});
