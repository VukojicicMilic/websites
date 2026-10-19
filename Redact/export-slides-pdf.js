/* Redact extension: Export as PDF presentation
   Turns the current Markdown document into a 16:9 PDF slide deck.

   Writing slides:
     # Deck title            -> title slide (plain lines after it become the subtitle)
     ## Slide heading        -> new slide
     ---                     -> new slide without a heading
     - bullet, > quote, ``` code ```, plain paragraphs
     ![caption](https://example.com/photo.jpg)   -> picture
     ![caption](data:image/jpeg;base64,...)      -> picture (use "Insert image" to create these)
     ![video: caption](https://example.com/clip.mp4) -> video poster + clickable link

   Honest limits:
   - PDF viewers do not reliably play embedded video. A video appears as a poster
     frame (or a placeholder box) that opens the video URL when clicked.
     A poster frame needs a server that allows cross-origin access; YouTube/Vimeo
     pages and local files always get the placeholder.
   - Remote pictures also need cross-origin access. Pictures that cannot be loaded
     become a labelled placeholder rather than failing silently.
   - Standard PDF fonts only: characters outside Latin-1 print as "?".
   - All pictures are stored in the PDF as JPEG (transparency becomes white). */
editor.registerExtension({
  id: "export-slides-pdf",
  name: "Export PDF Presentation",
  version: "1.0.0",
  author: "Redact user",
  description: "Export the document as a PDF slide deck with title slide, pictures and video links. Includes commands to insert images and video links.",
  activate(api) {
    const PW = 960, PH = 540, X = 64, CW = PW - 2 * X, BOTTOM = 56;
    const RED = "0.77 0.07 0.19", INK = "0.13 g", GREY = "0.45 g";
    const clean = s => s.replace(/\t/g, "    ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/•/g, "*").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
    const pe = s => s.replace(/[\\()]/g, "\\$&");
    const inline = s => s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)");
    const cw = c => /[ijl.,'!|:;]/.test(c) ? .28 : /[mwMW@]/.test(c) ? .85 : /[A-Z]/.test(c) ? .67 : .52;
    const width = (s, size, mono) => mono ? s.length * size * .6 : [...s].reduce((a, c) => a + cw(c), 0) * size;
    const wrap = (text, size, maxW, mono) => {
      const out = []; let line = "";
      for (let word of text.split(/(\s+)/)) {
        if (width(line + word, size, mono) <= maxW) { line += word; continue; }
        if (line.trim()) { out.push(line); line = ""; }
        word = word.replace(/^\s+/, "");
        while (width(word, size, mono) > maxW) {
          let n = word.length; while (n > 1 && width(word.slice(0, n), size, mono) > maxW) n--;
          out.push(word.slice(0, n)); word = word.slice(n);
        }
        line = word;
      }
      if (line.length) out.push(line);
      return out.length ? out : [""];
    };
    const T = (s, font, size, x, y, col) => "BT " + (col || INK) + " /" + font + " " + size + " Tf " + x.toFixed(1) + " " + y.toFixed(1) + " Td (" + pe(clean(s)) + ") Tj ET";
    const rect = (col, x, y, w, h) => col + " rg " + x.toFixed(1) + " " + y.toFixed(1) + " " + w.toFixed(1) + " " + h.toFixed(1) + " re f";

    /* ---------- Markdown -> slides ---------- */
    const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i, VIDEO_HOST = /(youtube\.com|youtu\.be|vimeo\.com)/i;
    function parse(md) {
      const slides = []; let s = null, inCode = false;
      const start = (title, kind) => { s = { kind, title, items: [] }; slides.push(s); };
      for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
        if (/^\s*```/.test(raw)) { inCode = !inCode; continue; }
        if (inCode) { if (!s) start("", "slide"); s.items.push({ t: "code", text: raw }); continue; }
        let m;
        if ((m = raw.match(/^#\s+(.*)/))) start(inline(m[1]), "title");
        else if ((m = raw.match(/^#{2,6}\s+(.*)/))) start(inline(m[1]), "slide");
        else if (/^---+\s*$/.test(raw)) start("", "slide");
        else {
          if (!raw.trim()) continue;
          if (!s) start("", "slide");
          if ((m = raw.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/))) {
            const vid = /^video\b/i.test(m[1]) || VIDEO_EXT.test(m[2]) || VIDEO_HOST.test(m[2]);
            s.items.push({ t: vid ? "vid" : "img", alt: m[1].replace(/^video\s*:?\s*/i, ""), src: m[2] });
          } else if ((m = raw.match(/<video[^>]*\ssrc="([^"]+)"/i))) s.items.push({ t: "vid", alt: "", src: m[1] });
          else if ((m = raw.match(/^(\s*)[-*+]\s+(.*)/))) s.items.push({ t: "li", text: inline(m[2]), lvl: Math.floor(m[1].length / 2) });
          else if ((m = raw.match(/^>\s?(.*)/))) s.items.push({ t: "q", text: inline(m[1]) });
          else s.items.push({ t: "p", text: inline(raw.trim()) });
        }
      }
      return slides;
    }

    /* ---------- Media loading (all converted to JPEG bytes) ---------- */
    const okSrc = u => /^https?:\/\//i.test(u) || /^data:image\//i.test(u);
    const loadImg = src => new Promise(res => {
      const im = new Image(); if (/^https?:/i.test(src)) im.crossOrigin = "anonymous";
      im.onload = () => res(im); im.onerror = () => res(null); setTimeout(() => res(null), 12000); im.src = src;
    });
    const loadVid = src => new Promise(res => {
      const v = document.createElement("video"); let done = false; const fin = r => { if (!done) { done = true; res(r); } };
      v.crossOrigin = "anonymous"; v.muted = true; v.preload = "auto"; v.playsInline = true;
      v.onloadeddata = () => { try { v.currentTime = Math.min(1, (v.duration || 4) / 4); } catch (e) { fin(null); } };
      v.onseeked = () => fin(v); v.onerror = () => fin(null); setTimeout(() => fin(null), 12000); v.src = src;
    });
    function toJpeg(el, w, h, maxW = 1600) {
      if (!w || !h) return null; const k = Math.min(1, maxW / w), cv = document.createElement("canvas");
      cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(el, 0, 0, cv.width, cv.height);
      try { const b = atob(cv.toDataURL("image/jpeg", .85).split(",")[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return { bytes: u, w: cv.width, h: cv.height }; }
      catch (e) { return null; } // tainted canvas: server did not allow cross-origin use
    }
    async function loadMedia(item) {
      if (!okSrc(item.src)) return { reason: "Local or unsupported address cannot be read by the browser" };
      if (item.t === "vid") {
        const yt = item.src.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i);
        if (yt) { // YouTube: use its public thumbnail as the poster frame
          for (const q of ["maxresdefault", "hqdefault", "mqdefault"]) {
            const im = await loadImg("https://i.ytimg.com/vi/" + yt[1] + "/" + q + ".jpg");
            if (im && im.naturalWidth > 200) { const j = toJpeg(im, im.naturalWidth, im.naturalHeight); if (j) return { jpg: j }; }
          }
          return { reason: "YouTube thumbnail could not be loaded" };
        }
        if (VIDEO_HOST.test(item.src) || !VIDEO_EXT.test(item.src) && !/^data:/i.test(item.src)) return { reason: "Poster frame not available for this link" };
        const v = await loadVid(item.src); const j = v && toJpeg(v, v.videoWidth, v.videoHeight);
        return j ? { jpg: j } : { reason: "Poster frame unavailable (video blocked or not cross-origin accessible)" };
      }
      const im = await loadImg(item.src); const j = im && toJpeg(im, im.naturalWidth, im.naturalHeight);
      return j ? { jpg: j } : { reason: "Image could not be loaded (not found, or the server blocks cross-origin use)" };
    }

    /* ---------- Layout ---------- */
    async function build(md, docTitle) {
      const slides = parse(md); if (!slides.length) return null;
      const media = new Map();
      for (const s of slides) for (const it of s.items) if ((it.t === "img" || it.t === "vid") && !media.has(it.t + it.src)) media.set(it.t + it.src, await loadMedia(it));
      const pages = [], imgs = [], imgIdx = new Map(); let page, y, curTitle;
      const newPage = t => { page = { cmds: [], ims: new Set(), links: [] }; pages.push(page); return page; };
      const contSlide = () => { newPage(); header(/\(cont\.\)$/.test(curTitle) || !curTitle ? curTitle : curTitle + " (cont.)"); };
      function header(t) {
        curTitle = t; page.cmds.push(rect(RED, X, PH - 52, 12, 12)); y = PH - 52;
        if (t) { for (const l of wrap(t, 28, CW - 30, false)) { y -= 34; page.cmds.push(T(l, "F2", 28, X + 24, y)); } y -= 14; page.cmds.push(rect(RED, X, y, CW, 1.5)); y -= 26; }
        else y -= 16;
        page.cmds.push(T(docTitle, "F1", 9, X, 24, GREY));
      }
      const need = h => { if (y - h < BOTTOM) contSlide(); };
      for (const s of slides) {
        newPage();
        if (s.kind === "title") {
          curTitle = s.title; page.cmds.push(rect(RED, 0, 0, 28, PH)); y = 330;
          for (const l of wrap(s.title, 46, PW - 2 * X - 40, false)) { page.cmds.push(T(l, "F2", 46, X + 20, y)); y -= 56; }
          page.cmds.push(rect(RED, X + 20, y + 20, 120, 4)); y -= 24;
          for (const it of s.items) if (it.text) for (const l of wrap(it.text, 22, PW - 2 * X - 40, false)) { page.cmds.push(T(l, "F1", 22, X + 20, y, GREY)); y -= 30; }
          continue;
        }
        header(s.title);
        for (const it of s.items) {
          if (it.t === "p" || it.t === "q") { for (const l of wrap(it.text, 18, CW - (it.t === "q" ? 24 : 0), false)) { need(24); y -= 24; page.cmds.push(T(l, "F1", 18, X + (it.t === "q" ? 24 : 0), y, it.t === "q" ? GREY : INK)); } y -= 6; }
          else if (it.t === "li") { const ind = X + 20 + it.lvl * 24; wrap(it.text, 18, PW - X - ind, false).forEach((l, i) => { need(24); y -= 24; if (i === 0) page.cmds.push(rect(RED, ind - 16, y + 5, 6, 6)); page.cmds.push(T(l, "F1", 18, ind, y)); }); y -= 4; }
          else if (it.t === "code") { for (const l of wrap(it.text, 13, CW - 12, true)) { need(17); y -= 17; page.cmds.push(T(l, "F3", 13, X + 12, y)); } }
          else placeMedia(it, media.get(it.t + it.src));
        }
      }
      function placeMedia(it, m) {
        const ok = m && m.jpg, w = ok ? m.jpg.w : 640, h = ok ? m.jpg.h : 360, cap = it.alt ? 22 : (it.t === "vid" ? 22 : 0);
        let avail = y - BOTTOM - cap; if (avail < 110) { contSlide(); avail = y - BOTTOM - cap; }
        const sc = Math.min(CW / w, avail / h), dw = w * sc, dh = h * sc, x = X + (CW - dw) / 2, yb = y - dh;
        if (ok) {
          if (!imgIdx.has(it.src + it.t)) { imgIdx.set(it.src + it.t, imgs.length); imgs.push(m.jpg); }
          const k = imgIdx.get(it.src + it.t); page.ims.add(k);
          page.cmds.push("q " + dw.toFixed(1) + " 0 0 " + dh.toFixed(1) + " " + x.toFixed(1) + " " + yb.toFixed(1) + " cm /Im" + k + " Do Q");
        } else {
          page.cmds.push(rect("0.16 g", x, yb, dw, dh));
          const msg = (m && m.reason) || "Not available";
          const big = it.t === "vid" ? (it.alt || "Video") : "Image not available";
          wrap(big, 26, dw - 48, false).slice(0, 3).forEach((l, i) => page.cmds.push(T(l, "F2", 26, x + 24, yb + dh - 50 - i * 32, "1 g")));
          page.cmds.push(T(it.t === "vid" ? "Click to open the video" : msg, "F1", 12, x + 24, yb + 36, "0.8 g"));
          page.cmds.push(T(it.src.slice(0, 90), "F1", 10, x + 24, yb + 18, "0.6 g"));
        }
        if (it.t === "vid") { // play button + clickable link
          const cx = x + dw / 2, cy = yb + dh / 2;
          page.cmds.push(rect(RED, cx - 34, cy - 24, 68, 48));
          page.cmds.push("1 g " + (cx - 8).toFixed(1) + " " + (cy - 12).toFixed(1) + " m " + (cx - 8).toFixed(1) + " " + (cy + 12).toFixed(1) + " l " + (cx + 14).toFixed(1) + " " + cy.toFixed(1) + " l f");
          if (/^https?:\/\//i.test(it.src)) page.links.push({ r: [x, yb, x + dw, yb + dh], u: it.src });
        }
        y = yb - 6;
        const label = it.alt || (it.t === "vid" ? it.src : "");
        if (label) { y -= 14; page.cmds.push(T((it.t === "vid" ? "Video: " : "") + label.slice(0, 100), "F1", 11, X, y, it.t === "vid" ? RED + " rg" : GREY)); }
        y -= 12;
      }

      /* ---------- PDF assembly (binary-safe) ---------- */
      pages.forEach((p, i) => { if (i > 0) p.cmds.push(T(String(i + 1), "F1", 10, PW - X - 10, 24, GREY)); });
      const parts = []; let len = 0; const offs = [];
      const put = d => { if (typeof d === "string") { const b = new Uint8Array(d.length); for (let i = 0; i < d.length; i++) b[i] = d.charCodeAt(i) & 255; d = b; } parts.push(d); len += d.length; };
      const obj = (id, body) => { offs[id] = len; put(id + " 0 obj\n" + body + "\nendobj\n"); };
      let nid = 6; imgs.forEach(im => im.id = nid++);
      pages.forEach(p => { p.cid = nid++; p.pid = nid++; p.aids = p.links.map(() => nid++); });
      put("%PDF-1.4\n");
      const font = n => "<</Type/Font/Subtype/Type1/BaseFont/" + n + "/Encoding/WinAnsiEncoding>>";
      obj(3, font("Helvetica")); obj(4, font("Helvetica-Bold")); obj(5, font("Courier"));
      imgs.forEach(im => { offs[im.id] = len; put(im.id + " 0 obj\n<</Type/XObject/Subtype/Image/Width " + im.w + "/Height " + im.h + "/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length " + im.bytes.length + ">>\nstream\n"); put(im.bytes); put("\nendstream\nendobj\n"); });
      pages.forEach(p => {
        const s = p.cmds.join("\n");
        obj(p.cid, "<</Length " + s.length + ">>\nstream\n" + s + "\nendstream");
        p.links.forEach((l, i) => obj(p.aids[i], "<</Type/Annot/Subtype/Link/Rect [" + l.r.map(n => n.toFixed(1)).join(" ") + "]/Border [0 0 0]/A<</S/URI/URI (" + pe(encodeURI(l.u)) + ")>>>>"));
        const xo = [...p.ims].map(k => "/Im" + k + " " + imgs[k].id + " 0 R").join(" ");
        obj(p.pid, "<</Type/Page/Parent 2 0 R/MediaBox [0 0 " + PW + " " + PH + "]/Resources<</Font<</F1 3 0 R/F2 4 0 R/F3 5 0 R>>" + (xo ? "/XObject<<" + xo + ">>" : "") + ">>/Contents " + p.cid + " 0 R" + (p.aids.length ? "/Annots [" + p.aids.map(a => a + " 0 R").join(" ") + "]" : "") + ">>");
      });
      obj(1, "<</Type/Catalog/Pages 2 0 R>>");
      obj(2, "<</Type/Pages/Kids [" + pages.map(p => p.pid + " 0 R").join(" ") + "]/Count " + pages.length + ">>");
      const xref = len; let x = "xref\n0 " + nid + "\n0000000000 65535 f \n";
      for (let i = 1; i < nid; i++) x += String(offs[i]).padStart(10, "0") + " 00000 n \n";
      put(x + "trailer\n<</Size " + nid + "/Root 1 0 R>>\nstartxref\n" + xref + "\n%%EOF");
      return { blob: new Blob(parts, { type: "application/pdf" }), pages: pages.length, failed: [...media.values()].filter(m => !m.jpg).length };
    }

    /* ---------- Commands ---------- */
    api.registerCommand("export", {
      label: "Export as PDF presentation", category: "File", desc: "# title slide, ## slides, pictures and video links",
      async run() {
        const d = api.doc(), text = d.text;
        if (!text.trim()) { api.notify("Nothing to export: the document is empty.", true); return; }
        api.notify("Building slides… remote pictures and videos are fetched first.");
        const base = d.name.replace(/\.[^.]+$/, "");
        const r = await build(text, base);
        if (!r) { api.notify("No slides found. Start with “# Title” and add “## Slide” headings.", true); return; }
        const a = document.createElement("a"); a.href = URL.createObjectURL(r.blob); a.download = base + "-slides.pdf";
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        api.notify("Downloaded " + a.download + " (" + r.pages + " slides)" + (r.failed ? "; " + r.failed + " picture/video(s) became placeholders" : ""), !!r.failed);
      }
    });
    api.registerCommand("insertImage", {
      label: "Insert image from file (embedded in document)", category: "Insert",
      run() {
        const i = document.createElement("input"); i.type = "file"; i.accept = "image/*";
        i.onchange = async () => {
          const f = i.files[0]; if (!f) return;
          const url = URL.createObjectURL(f), im = await loadImg(url); URL.revokeObjectURL(url);
          if (!im) { api.notify("That file could not be read as an image.", true); return; }
          const k = Math.min(1, 1280 / im.naturalWidth), cv = document.createElement("canvas");
          cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
          const c = cv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(im, 0, 0, cv.width, cv.height);
          const [s, e] = api.editor.sel(), name = f.name.replace(/\.[^.]+$/, "").replace(/[\[\]()]/g, "");
          api.editor.replace(s, e, "\n![" + name + "](" + cv.toDataURL("image/jpeg", .8) + ")\n");
          api.notify("Image embedded as text (resized to max 1280 px). Large images may exceed browser draft storage.");
        };
        i.click();
      }
    });
    api.registerCommand("insertVideo", {
      label: "Insert video link", category: "Insert",
      async run() {
        const u = await api.prompt("Video URL (https://…)", "https://"); if (!u || !/^https?:\/\//i.test(u)) return;
        const c = await api.prompt("Caption", ""); const [s, e] = api.editor.sel();
        api.editor.replace(s, e, "\n![video: " + (c || "").replace(/[\[\]]/g, "") + "](" + u + ")\n");
      }
    });
    api.registerCommand("template", {
      label: "New presentation from template", category: "File",
      run() { api.openDoc("presentation.md", "# My presentation\nA short subtitle\n\n## First slide\n- A point worth making\n- Another point\n\n## A picture\n![A caption](https://example.com/picture.jpg)\n\n## A video\n![video: Demo clip](https://example.com/clip.mp4)\n\n---\n> A closing quote\n"); }
    });
  },
  deactivate() {}
});
