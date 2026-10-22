/* Redact extension (for index2.html): Export Markdown as PDF
   Writes a real PDF in the browser, with no libraries. Compared with export-pdf.js it also handles what index2.html adds:
   pictures (inserted from a file, pasted, dragged in, or a web address), tables, numbered and nested lists,
   horizontal lines, and videos (YouTube / Vimeo / .mp4 links become a clickable poster box).
   Pictures stored in the browser (asset:...) are read through the editor's api.doc(), which resolves them.
   Limits: standard PDF fonts (Helvetica, Courier; Latin-1 characters, others are simplified or become "?");
   every picture is stored as JPEG (transparency becomes white); a picture from a web address needs a server that allows
   cross-origin use, otherwise a labelled placeholder is drawn; video does not play inside a PDF (it links out);
   table rows can continue on the next page but the header row is not repeated; link addresses are printed after the link text. */
editor.registerExtension({
  id: "export-pdf-index2",
  name: "Export Markdown as PDF (pictures, tables, video links)",
  version: "1.0.0",
  author: "Redact user",
  description: "Adds “Export as PDF (pictures…)” for index2.html. Builds the PDF locally with pictures, tables, lists and video links.",
  activate(api) {
    const W = 595, H = 842, M = 56, CWID = W - 2 * M;
    const REDRGB = "0.77 0.07 0.19", REDF = REDRGB + " rg", INK = "0.13 g", GREY = "0.45 g";

    /* ---------- Helvetica metrics (ASCII 32-126) ---------- */
    const D = "556 556 556 556 556 556 556 556 556 556";
    const WT = {
      R: ("278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 " + D + " 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 " +
        "278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584").split(" ").map(Number),
      B: ("278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 " + D + " 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 " +
        "333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584").split(" ").map(Number)
    };
    const cw = (ch, f) => { if (f === "M") return 600; const c = ch.charCodeAt(0); return c >= 32 && c <= 126 ? WT[f === "B" ? "B" : "R"][c - 32] : 556; };
    const sw = (s, size, f) => { let w = 0; for (const ch of s) w += cw(ch, f); return w * size / 1000; };
    const WIN = { "€": 128, "…": 133, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151, "š": 154, "Š": 138, "ž": 158, "Ž": 142 };
    const SIMPLE = { "đ": "d", "Đ": "D", "ł": "l", "Ł": "L" };
    const esc = s => {
      let o = "";
      for (const ch of s) {
        let c = ch.charCodeAt(0);
        if (!(c >= 32 && c <= 126)) {
          if (WIN[ch]) c = WIN[ch]; else if (c >= 160 && c <= 255) c = c;
          else { const b = SIMPLE[ch] || ch.normalize("NFD")[0]; c = b && b.charCodeAt(0) >= 32 && b.charCodeAt(0) < 127 ? b.charCodeAt(0) : 63; }
        }
        o += c < 32 || c > 126 || c === 40 || c === 41 || c === 92 ? "\\" + c.toString(8).padStart(3, "0") : String.fromCharCode(c);
      }
      return o;
    };
    const f = n => (+n).toFixed(2);
    const FN = { R: "F1", B: "F2", I: "F3", M: "F4" };

    /* ---------- inline markup -> font segments ---------- */
    function inline(s) {
      s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, a) => "[" + (a || "picture") + "]").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");
      const segs = []; let b = false, i = false, m = false, buf = "", k = 0;
      const fnt = () => m ? "M" : b ? "B" : i ? "I" : "R";
      const flush = () => { if (buf) { segs.push({ t: buf, f: fnt() }); buf = ""; } };
      while (k < s.length) {
        const c = s[k];
        if (c === "`") { flush(); m = !m; k++; continue; }
        if (!m && c === "*") {
          if (s[k + 1] === "*") { flush(); b = !b; k += 2; continue; }
          const pv = s[k - 1] || " ", nx = s[k + 1] || " ";
          if ((!i && nx !== " ") || (i && pv !== " ")) { flush(); i = !i; k++; continue; }
        }
        if (!m && c === "_" && s[k + 1] === "_") { flush(); b = !b; k += 2; continue; }
        buf += c; k++;
      }
      flush(); return segs;
    }
    function lines(segs, size, w0, w1) {
      const toks = []; for (const sg of segs) for (const p of sg.t.split(/(\s+)/)) if (p) toks.push({ t: p, f: sg.f, sp: /^\s+$/.test(p) });
      const out = []; let cur = [], cwid = 0, lim = w0;
      const trim = () => { while (cur.length && cur[cur.length - 1].t === " ") cur.pop(); };
      for (let tk of toks) {
        if (tk.sp) { if (cur.length) { const w = sw(" ", size, tk.f); cur.push({ t: " ", f: tk.f, w }); cwid += w; } continue; }
        let w = sw(tk.t, size, tk.f);
        if (cur.length && cwid + w > lim + .01) { trim(); out.push(cur); cur = []; cwid = 0; lim = w1; }
        while (w > lim && tk.t.length > 1) {
          let n = tk.t.length; while (n > 1 && sw(tk.t.slice(0, n), size, tk.f) > lim) n--;
          out.push([{ t: tk.t.slice(0, n), f: tk.f, w: sw(tk.t.slice(0, n), size, tk.f) }]); lim = w1; tk = { ...tk, t: tk.t.slice(n) }; w = sw(tk.t, size, tk.f);
        }
        cur.push({ t: tk.t, f: tk.f, w }); cwid += w;
      }
      trim(); if (cur.length || !out.length) out.push(cur); return out;
    }

    /* ---------- Markdown -> blocks ---------- */
    const VID = /(youtube\.com|youtu\.be|vimeo\.com)|\.(mp4|webm|ogv|m4v|mov)(\?|#|$)/i;
    function parse(md) {
      const L = md.replace(/\r\n?/g, "\n").split("\n"), out = []; let para = [], inCode = false, code = [];
      const flush = () => { if (para.length) { out.push({ k: "p", text: para.join(" ") }); para = []; } };
      for (let i = 0; i < L.length; i++) {
        const l = L[i]; let m;
        if (/^\s*```/.test(l)) { if (inCode) { out.push({ k: "code", lines: code }); code = []; inCode = false; } else { flush(); inCode = true; } continue; }
        if (inCode) { code.push(l); continue; }
        if ((m = l.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/))) { flush(); const vid = /^video\s*:/i.test(m[1]) || VID.test(m[2]); out.push(vid ? { k: "vid", cap: m[1].replace(/^video\s*:\s*/i, ""), src: m[2] } : { k: "img", cap: m[1], src: m[2] }); continue; }
        if (/^\s*\|/.test(l)) { flush(); const rows = []; while (i < L.length && /^\s*\|/.test(L[i])) { if (!/^\s*\|[\s:|-]+\|?\s*$/.test(L[i])) rows.push(L[i].trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim())); i++; } i--; if (rows.length) out.push({ k: "table", rows }); continue; }
        if ((m = l.match(/^(#{1,6})\s+(.*)$/))) { flush(); out.push({ k: "h", lvl: m[1].length, text: m[2] }); continue; }
        if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(l)) { flush(); out.push({ k: "hr" }); continue; }
        if ((m = l.match(/^(\s*)[-*+]\s+(.*)$/))) { flush(); out.push({ k: "li", lvl: Math.floor(m[1].replace(/\t/g, "  ").length / 2), text: m[2] }); continue; }
        if ((m = l.match(/^(\s*)\d+[.)]\s+(.*)$/))) { flush(); out.push({ k: "li", ol: true, lvl: Math.floor(m[1].replace(/\t/g, "  ").length / 2), text: m[2] }); continue; }
        if ((m = l.match(/^>\s?(.*)$/))) { flush(); out.push({ k: "q", text: m[1] }); continue; }
        if (!l.trim()) { flush(); continue; }
        para.push(l.trim());
      }
      flush(); if (inCode) out.push({ k: "code", lines: code }); return out;
    }

    /* ---------- pictures ---------- */
    const loadImg = src => new Promise(res => { const im = new Image(); if (/^https?:/i.test(src)) im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); setTimeout(() => res(null), 12000); im.src = src; });
    function toJpeg(el) {
      const w = el.naturalWidth, h = el.naturalHeight; if (!w || !h) return null;
      const k = Math.min(1, 1800 / w), cv = document.createElement("canvas"); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(el, 0, 0, cv.width, cv.height);
      try { const b = atob(cv.toDataURL("image/jpeg", .88).split(",")[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return { bytes: u, w: cv.width, h: cv.height }; } catch (e) { return null; }
    }
    async function loadMedia(b) {
      const src = b.src;
      if (/^asset:/i.test(src)) return { reason: "This picture is no longer stored in the browser" };
      if (!/^https?:\/\//i.test(src) && !/^data:image\//i.test(src)) return { reason: "Local or unsupported address" };
      if (b.k === "vid") {
        const yt = src.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i);
        if (yt) for (const q of ["maxresdefault", "hqdefault", "mqdefault"]) { const im = await loadImg("https://i.ytimg.com/vi/" + yt[1] + "/" + q + ".jpg"); if (im && im.naturalWidth > 200) { const j = toJpeg(im); if (j) return { jpg: j }; } }
        return { reason: "No poster frame" };
      }
      const im = await loadImg(src), j = im && toJpeg(im);
      return j ? { jpg: j } : { reason: "Picture could not be loaded (not found, or the server blocks cross-origin use)" };
    }

    /* ---------- layout ---------- */
    function layout(blocks, media) {
      const pages = [], imgs = [], imgIdx = new Map(); let P, y, cnt = [];
      const np = () => { P = { cmds: [], ims: new Set(), links: [] }; pages.push(P); y = H - M; };
      const ensure = h => { if (y - h < M + 8 && y < H - M - 1) np(); };
      const T = (s, fnt, size, x, yy, col) => P.cmds.push("BT " + (col || INK) + " /" + FN[fnt] + " " + f(size) + " Tf " + f(x) + " " + f(yy) + " Td (" + esc(s) + ") Tj ET");
      const rect = (col, x, yy, w, h) => P.cmds.push(col + " rg " + f(x) + " " + f(yy) + " " + f(w) + " " + f(h) + " re f");
      const box = (x, yy, w, h) => P.cmds.push("0.7 G 0.6 w " + f(x) + " " + f(yy) + " " + f(w) + " " + f(h) + " re S");
      function para(segs, o) {
        const size = o.size || 11, ld = o.lead || size * 1.4, x = o.x != null ? o.x : M, w = o.w || CWID - (x - M);
        lines(segs, size, w, w).forEach((ln, i) => {
          ensure(ld); y -= ld; let cx = x + (o.center ? (w - ln.reduce((a, p) => a + p.w, 0)) / 2 : 0);
          if (o.bar) rect(REDRGB, x - 12, y - 3, 3, ld);
          for (const p of ln) { T(p.t, p.f, size, cx, y, o.col); cx += p.w; }
          if (i === 0 && o.mark) o.mark(y);
        });
      }
      np();
      for (const b of blocks) {
        if (b.k !== "li") cnt = [];
        switch (b.k) {
          case "h": {
            const size = [22, 17, 14, 12, 11, 11][b.lvl - 1]; if (y < H - M - 1) y -= size * .6; ensure(size * 2.4);
            para(inline(b.text).map(s => ({ ...s, f: "B" })), { size, lead: size * 1.3, col: b.lvl <= 2 ? REDF : INK }); y -= 4; break;
          }
          case "p": para(inline(b.text), {}); y -= 6; break;
          case "li": {
            const ind = M + 16 + b.lvl * 18; if (b.ol) { cnt[b.lvl] = (cnt[b.lvl] || 0) + 1; cnt.length = b.lvl + 1; const n = cnt[b.lvl]; para(inline(b.text), { x: ind, mark: yy => T(n + ".", "B", 11, ind - 18, yy, REDF) }); }
            else para(inline(b.text), { x: ind, mark: yy => rect(REDRGB, ind - 11, yy + 3, 4, 4) });
            y -= 2; break;
          }
          case "q": para(inline(b.text).map(s => ({ ...s, f: s.f === "R" ? "I" : s.f })), { x: M + 16, col: GREY, bar: true }); y -= 4; break;
          case "hr": ensure(16); y -= 9; P.cmds.push("0.75 G 0.8 w " + M + " " + f(y) + " m " + (W - M) + " " + f(y) + " l S"); y -= 7; break;
          case "code": {
            const sz = 9; y -= 4;
            b.lines.forEach(l => lines([{ t: l || " ", f: "M" }], sz, CWID - 16, CWID - 16).forEach(ln => { ensure(12); y -= 12; rect("0.95 0.95 0.95", M, y - 3, CWID, 12); let cx = M + 8; for (const p of ln) { T(p.t, "M", sz, cx, y); cx += p.w; } }));
            y -= 8; break;
          }
          case "table": table(b.rows); break;
          case "img": picture(b); break;
          case "vid": video(b); break;
        }
      }
      function table(rows) {
        const nc = Math.max(...rows.map(r => r.length)), sz = 10, ld = 13, pad = 5;
        const cells = rows.map((r, ri) => Array.from({ length: nc }, (_, c) => inline(r[c] || "").map(s => ({ ...s, f: ri === 0 ? "B" : s.f }))));
        const nat = Array(nc).fill(40); cells.forEach(r => r.forEach((sg, c) => { nat[c] = Math.max(nat[c], Math.min(sg.reduce((a, s) => a + sw(s.t, sz, s.f), 0) + 2 * pad, CWID)); }));
        const sum = nat.reduce((a, b) => a + b, 0), cws = nat.map(n => n * CWID / sum);
        if (y < H - M - 1) y -= 6;
        cells.forEach((r, ri) => {
          const ls = r.map((sg, c) => lines(sg, sz, cws[c] - 2 * pad, cws[c] - 2 * pad)), h = Math.max(...ls.map(l => l.length)) * ld + 2 * pad;
          ensure(h + 2); const top = y; let x = M;
          ls.forEach((cl, c) => {
            if (ri === 0) rect("0.97 0.88 0.9", x, top - h, cws[c], h); box(x, top - h, cws[c], h);
            cl.forEach((ln, k) => { let cx = x + pad; for (const p of ln) { T(p.t, p.f, sz, cx, top - pad - (k + 1) * ld + 3.5); cx += p.w; } });
            x += cws[c];
          });
          y = top - h;
        });
        y -= 10;
      }
      function picture(b) {
        const m = media.get(b.k + b.src), ok = m && m.jpg, w0 = ok ? m.jpg.w : 4, h0 = ok ? m.jpg.h : 1.2, sc = ok ? Math.min(CWID / w0, 340 / h0, 2) : CWID / w0;
        const dw = w0 * sc, dh = ok ? h0 * sc : 90, capLines = b.cap ? lines(inline(b.cap), 9, CWID, CWID).length : 0;
        ensure(dh + capLines * 12 + 20); y -= 8; const x = M + (CWID - dw) / 2, yb = y - dh;
        if (ok) { if (!imgIdx.has(b.src)) { imgIdx.set(b.src, imgs.length); imgs.push(m.jpg); } const k = imgIdx.get(b.src); P.ims.add(k); P.cmds.push("q " + f(dw) + " 0 0 " + f(dh) + " " + f(x) + " " + f(yb) + " cm /Im" + k + " Do Q"); }
        else { rect("0.94 0.94 0.94", x, yb, dw, dh); lines([{ t: "Picture not available: " + ((m && m.reason) || "") + " " + b.src.slice(0, 80), f: "R" }], 8.5, dw - 20, dw - 20).slice(0, 4).forEach((ln, k) => { let cx = x + 10; for (const p of ln) { T(p.t, p.f, 8.5, cx, yb + dh - 18 - k * 11, GREY); cx += p.w; } }); }
        y = yb - 4;
        if (b.cap) para(inline(b.cap).map(s => ({ ...s, f: s.f === "R" ? "I" : s.f })), { size: 9, lead: 12, center: true, col: GREY });
        y -= 8;
      }
      function video(b) {
        const m = media.get(b.k + b.src), ok = m && m.jpg, bw = Math.min(CWID, 380), bh = bw * 9 / 16; ensure(bh + 46); y -= 8; const x = M + (CWID - bw) / 2, yb = y - bh;
        if (ok) { if (!imgIdx.has(b.src)) { imgIdx.set(b.src, imgs.length); imgs.push(m.jpg); } const k = imgIdx.get(b.src); P.ims.add(k); P.cmds.push("q " + f(bw) + " 0 0 " + f(bh) + " " + f(x) + " " + f(yb) + " cm /Im" + k + " Do Q"); }
        else rect("0.16 0.16 0.16", x, yb, bw, bh);
        const cx = x + bw / 2, cy = yb + bh / 2; rect(REDRGB, cx - 30, cy - 21, 60, 42);
        P.cmds.push("1 g " + f(cx - 8) + " " + f(cy - 12) + " m " + f(cx - 8) + " " + f(cy + 12) + " l " + f(cx + 14) + " " + f(cy) + " l f");
        if (/^https?:\/\//i.test(b.src)) P.links.push({ r: [x, yb, x + bw, yb + bh], u: b.src });
        y = yb - 4; para([{ t: "Video: " + (b.cap || "open in browser"), f: "B" }], { size: 10, lead: 13, center: true, col: REDF });
        para([{ t: b.src.slice(0, 95), f: "R" }], { size: 8, lead: 11, center: true, col: GREY }); y -= 8;
      }
      const n = pages.length;
      pages.forEach((p, i) => p.cmds.push("BT 0.5 g /F1 8 Tf " + f(W / 2 - 14) + " 30 Td (" + (i + 1) + " / " + n + ") Tj ET"));
      return { pages, imgs };
    }

    /* ---------- PDF assembly (binary-safe) ---------- */
    function assemble({ pages, imgs }) {
      const parts = []; let len = 0; const offs = [];
      const put = d => { if (typeof d === "string") { const b = new Uint8Array(d.length); for (let i = 0; i < d.length; i++) b[i] = d.charCodeAt(i) & 255; d = b; } parts.push(d); len += d.length; };
      const obj = (id, body) => { offs[id] = len; put(id + " 0 obj\n" + body + "\nendobj\n"); };
      let nid = 7; imgs.forEach(im => im.id = nid++); pages.forEach(p => { p.cid = nid++; p.pid = nid++; p.aids = p.links.map(() => nid++); });
      put("%PDF-1.4\n");
      const font = n => "<</Type/Font/Subtype/Type1/BaseFont/" + n + "/Encoding/WinAnsiEncoding>>";
      obj(3, font("Helvetica")); obj(4, font("Helvetica-Bold")); obj(5, font("Helvetica-Oblique")); obj(6, font("Courier"));
      imgs.forEach(im => { offs[im.id] = len; put(im.id + " 0 obj\n<</Type/XObject/Subtype/Image/Width " + im.w + "/Height " + im.h + "/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length " + im.bytes.length + ">>\nstream\n"); put(im.bytes); put("\nendstream\nendobj\n"); });
      pages.forEach(p => {
        const s = p.cmds.join("\n"); obj(p.cid, "<</Length " + s.length + ">>\nstream\n" + s + "\nendstream");
        p.links.forEach((l, i) => obj(p.aids[i], "<</Type/Annot/Subtype/Link/Rect [" + l.r.map(n => n.toFixed(1)).join(" ") + "]/Border [0 0 0]/A<</S/URI/URI (" + esc(encodeURI(l.u)) + ")>>>>"));
        const xo = [...p.ims].map(k => "/Im" + k + " " + imgs[k].id + " 0 R").join(" ");
        obj(p.pid, "<</Type/Page/Parent 2 0 R/MediaBox [0 0 " + W + " " + H + "]/Resources<</Font<</F1 3 0 R/F2 4 0 R/F3 5 0 R/F4 6 0 R>>" + (xo ? "/XObject<<" + xo + ">>" : "") + ">>/Contents " + p.cid + " 0 R" + (p.aids.length ? "/Annots [" + p.aids.map(a => a + " 0 R").join(" ") + "]" : "") + ">>");
      });
      obj(1, "<</Type/Catalog/Pages 2 0 R>>"); obj(2, "<</Type/Pages/Kids [" + pages.map(p => p.pid + " 0 R").join(" ") + "]/Count " + pages.length + ">>");
      const xref = len; let x = "xref\n0 " + nid + "\n0000000000 65535 f \n"; for (let i = 1; i < nid; i++) x += String(offs[i]).padStart(10, "0") + " 00000 n \n";
      put(x + "trailer\n<</Size " + nid + "/Root 1 0 R>>\nstartxref\n" + xref + "\n%%EOF"); return parts;
    }
    async function build(md) {
      const blocks = parse(md), media = new Map();
      for (const b of blocks) if ((b.k === "img" || b.k === "vid") && !media.has(b.k + b.src)) media.set(b.k + b.src, await loadMedia(b));
      const L = layout(blocks, media); return { parts: assemble(L), pages: L.pages.length, failed: [...media.values()].filter(m => !m.jpg && m.reason && !/poster/i.test(m.reason)).length };
    }
    editor.exportPdfIndex2 = { build, parse };

    api.registerCommand("pdf", {
      label: "Export as PDF (pictures, tables, video links)", desc: "Download the document (or selection) as a PDF", category: "File",
      async run() {
        const d = api.doc(); let sel = api.editor.selected();
        if (sel && typeof Assets !== "undefined") sel = Assets.resolve(sel);
        const text = sel || d.text; if (!text.trim()) { api.notify("Nothing to export: the document is empty.", true); return; }
        api.notify("Building the PDF…");
        let r; try { r = await build(text); } catch (e) { api.notify("Could not build the PDF: " + e.message, true); return; }
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(r.parts, { type: "application/pdf" })); a.download = d.name.replace(/\.[^.]+$/, "") + ".pdf";
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        api.notify("Downloaded " + a.download + " (" + r.pages + " page" + (r.pages > 1 ? "s" : "") + (sel ? ", selection only" : "") + ")" + (r.failed ? "; " + r.failed + " picture(s) became placeholders" : ""), !!r.failed);
      }
    });
  },
  deactivate() {}
});
