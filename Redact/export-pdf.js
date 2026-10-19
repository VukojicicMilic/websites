/* Redact extension: Export Markdown as PDF
   Writes a real PDF in the browser, with no libraries and no network access.
   Supports headings, paragraphs, bullet lists, quotes and code blocks.
   Limits: standard PDF fonts only (Latin-1 characters; others become "?"),
   no images or tables, and link addresses are printed after the link text. */
editor.registerExtension({
  id: "export-pdf",
  name: "Export Markdown as PDF",
  version: "1.0.0",
  author: "Redact user",
  description: "Adds “Export as PDF” to the command palette. Builds the PDF locally and downloads it.",
  activate(api) {
    const W = 595, H = 842, M = 56; // A4 in points, margin

    function buildPdf(md) {
      const pages = []; let cur = [], y = H - M;
      const newPage = () => { pages.push(cur); cur = []; y = H - M; };
      const clean = s => s.replace(/\t/g, "    ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
        .replace(/[–—]/g, "-").replace(/…/g, "...").replace(/•/g, "*").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
      const pe = s => s.replace(/[\\()]/g, "\\$&");
      // Approximate Helvetica widths; Courier is exactly 0.6 em.
      const cw = c => /[ijl.,'!|:;]/.test(c) ? .28 : /[mwMW@]/.test(c) ? .85 : /[A-Z]/.test(c) ? .67 : .52;
      const width = (s, size, mono) => mono ? s.length * size * .6 : [...s].reduce((a, c) => a + cw(c), 0) * size;
      const wrap = (text, size, maxW, mono) => {
        const out = []; let line = "";
        const push = () => { out.push(line); line = ""; };
        for (let word of text.split(/(\s+)/)) {
          if (width(line + word, size, mono) <= maxW) { line += word; continue; }
          if (line.trim()) push();
          word = word.replace(/^\s+/, "");
          while (width(word, size, mono) > maxW) { // hard-break very long words
            let n = word.length; while (n > 1 && width(word.slice(0, n), size, mono) > maxW) n--;
            out.push(word.slice(0, n)); word = word.slice(n);
          }
          line = word;
        }
        if (line.length) push();
        return out.length ? out : [""];
      };
      const draw = (text, font, size, x, lead, color) => {
        if (y - lead < M) newPage();
        y -= lead;
        cur.push("BT " + (color || "0 g") + " /" + font + " " + size + " Tf " + x.toFixed(1) + " " + y.toFixed(1) + " Td (" + pe(clean(text)) + ") Tj ET");
      };
      const inline = s => s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/\*([^*]+)\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)");
      const RED = "0.77 0.07 0.19 rg", GREY = "0.4 g", maxW = W - 2 * M;

      let para = [], inCode = false;
      const flush = () => {
        if (!para.length) return;
        for (const l of wrap(inline(para.join(" ")), 11, maxW, false)) draw(l, "F1", 11, M, 15);
        y -= 5; para = [];
      };
      for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
        if (/^\s*```/.test(raw)) { flush(); inCode = !inCode; y -= 4; continue; }
        if (inCode) { for (const l of wrap(raw, 9, maxW - 8, true)) draw(l, "F3", 9, M + 8, 12); continue; }
        let m;
        if ((m = raw.match(/^(#{1,6})\s+(.*)/))) {
          flush(); const size = [22, 17, 14, 12, 11, 11][m[1].length - 1]; y -= size * .5;
          for (const l of wrap(inline(m[2]), size, maxW, false)) draw(l, "F2", size, M, size * 1.3, m[1].length <= 2 ? RED : "0 g");
          y -= 4;
        } else if ((m = raw.match(/^(\s*)[-*+]\s+(.*)/))) {
          flush(); const ind = M + 14 + Math.floor(m[1].length / 2) * 14;
          wrap(inline(m[2]), 11, W - M - ind, false).forEach((l, i) => {
            draw(l, "F1", 11, ind, 15);
            if (i === 0) cur.push("BT /F1 11 Tf " + (ind - 12).toFixed(1) + " " + y.toFixed(1) + " Td (-) Tj ET");
          });
        } else if ((m = raw.match(/^>\s?(.*)/))) {
          flush(); for (const l of wrap(inline(m[1]), 11, maxW - 16, false)) draw(l, "F1", 11, M + 16, 15, GREY);
        } else if (!raw.trim()) { flush(); y -= 4; }
        else para.push(raw.trim());
      }
      flush(); pages.push(cur);

      // Assemble PDF objects. 1 catalog, 2 pages, 3-5 fonts, then content+page per page.
      const total = pages.length, offs = []; let out = "%PDF-1.4\n";
      const add = (id, body) => { offs[id] = out.length; out += id + " 0 obj\n" + body + "\nendobj\n"; };
      const kids = pages.map((_, i) => (7 + 2 * i) + " 0 R").join(" ");
      add(1, "<</Type/Catalog/Pages 2 0 R>>");
      add(2, "<</Type/Pages/Kids [" + kids + "]/Count " + total + ">>");
      add(3, "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>");
      add(4, "<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>");
      add(5, "<</Type/Font/Subtype/Type1/BaseFont/Courier/Encoding/WinAnsiEncoding>>");
      pages.forEach((c, i) => {
        const s = c.join("\n") + "\nBT 0.5 g /F1 8 Tf " + (W / 2 - 14) + " 30 Td (" + (i + 1) + " / " + total + ") Tj ET";
        add(6 + 2 * i, "<</Length " + s.length + ">>\nstream\n" + s + "\nendstream");
        add(7 + 2 * i, "<</Type/Page/Parent 2 0 R/MediaBox [0 0 " + W + " " + H + "]/Resources<</Font<</F1 3 0 R/F2 4 0 R/F3 5 0 R>>>>/Contents " + (6 + 2 * i) + " 0 R>>");
      });
      const n = 6 + 2 * total, xref = out.length;
      out += "xref\n0 " + n + "\n0000000000 65535 f \n";
      for (let i = 1; i < n; i++) out += String(offs[i]).padStart(10, "0") + " 00000 n \n";
      out += "trailer\n<</Size " + n + "/Root 1 0 R>>\nstartxref\n" + xref + "\n%%EOF";
      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
      return bytes;
    }

    api.registerCommand("pdf", {
      label: "Export as PDF",
      desc: "Download the current document (or selection) as a PDF",
      category: "File",
      run() {
        const d = api.doc(), sel = api.editor.selected();
        const text = sel || d.text;
        if (!text.trim()) { api.notify("Nothing to export: the document is empty.", true); return; }
        const bytes = buildPdf(text);
        const name = d.name.replace(/\.[^.]+$/, "") + ".pdf";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        a.download = name;
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        api.notify("Downloaded " + name + (sel ? " (selection only)" : ""));
      }
    });
  },
  deactivate() {}
});
