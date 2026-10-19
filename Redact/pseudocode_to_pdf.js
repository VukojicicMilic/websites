/* Redact extension: Export Pseudocode as PDF (With ASCII Character Sanitization)
   Translates and formats Cambridge 9618 Pseudocode documents into a PDF document.
   Requires the "pseudocode" extension to be loaded. */
editor.registerExtension({
  id: "export-pseudocode-pdf",
  name: "Export Pseudocode as PDF",
  version: "1.0.1",
  author: "Redact user",
  description: "Exports the current pseudocode document as a formatted PDF file with Unicode character fixes.",
  activate(api) {
    const W = 595, H = 842, M = 56; // A4 dimensions in points, margin

    function buildPdf(codeText, docName) {
      const pages = [];
      let cur = [];
      let y = H - M;

      const newPage = () => {
        pages.push(cur);
        cur = [];
        y = H - M;
      };

      // Sanitizes special pseudocode symbols into standard ASCII equivalents
      const clean = s => s.replace(/\t/g, "   ")
        .replace(/←/g, "<-")
        .replace(/≤/g, "<=")
        .replace(/≥/g, ">=")
        .replace(/≠/g, "<>")
        .replace(/[‘’ꞌ]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/[–—−]/g, "-")
        .replace(/…/g, "...")
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

      const pe = s => s.replace(/[\\()]/g, "\\$&");
      const cw = c => /[ijl.,'!|:;]/.test(c) ? 0.28 : /[mwMW@]/.test(c) ? 0.85 : /[A-Z]/.test(c) ? 0.67 : 0.52;
      const width = (s, size, mono) => mono ? s.length * size * 0.6 : [...s].reduce((a, c) => a + cw(c), 0) * size;

      const wrap = (text, size, maxW, mono) => {
        const out = [];
        let line = "";
        for (let word of text.split(/(\s+)/)) {
          if (width(line + word, size, mono) <= maxW) {
            line += word;
            continue;
          }
          if (line.trim()) {
            out.push(line);
            line = "";
          }
          word = word.replace(/^\s+/, "");
          while (width(word, size, mono) > maxW) {
            let n = word.length;
            while (n > 1 && width(word.slice(0, n), size, mono) > maxW) n--;
            out.push(word.slice(0, n));
            word = word.slice(n);
          }
          line = word;
        }
        if (line.length) out.push(line);
        return out.length ? out : [""];
      };

      const draw = (text, font, size, x, lead, color) => {
        if (y - lead < M) newPage();
        y -= lead;
        cur.push("BT " + (color || "0 g") + " /" + font + " " + size + " Tf " + x.toFixed(1) + " " + y.toFixed(1) + " Td (" + pe(clean(text)) + ") Tj ET");
      };

      const RED = "0.77 0.07 0.19 rg";
      const GREY = "0.45 g";
      const maxW = W - 2 * M;

      // Header Title
      draw("Pseudocode Listing: " + docName, "F2", 16, M, 20, RED);
      y -= 8;
      cur.push("0.77 0.07 0.19 rg " + M + " " + y.toFixed(1) + " " + maxW + " 1.5 re f");
      y -= 16;

      // Code Body rendering
      const lines = codeText.replace(/\r\n?/g, "\n").split("\n");
      lines.forEach((lineStr, idx) => {
        const lineNumStr = String(idx + 1).padStart(3, " ") + "  ";
        const wrappedLines = wrap(lineStr, 10, maxW - 35, true);

        wrappedLines.forEach((wl, i) => {
          if (y - 13 < M) newPage();
          y -= 13;
          if (i === 0) {
            cur.push("BT " + GREY + " /F3 9 Tf " + M + " " + y.toFixed(1) + " Td (" + pe(lineNumStr) + ") Tj ET");
          }
          cur.push("BT 0 g /F3 10 Tf " + (M + 30).toFixed(1) + " " + y.toFixed(1) + " Td (" + pe(clean(wl)) + ") Tj ET");
        });
      });

      pages.push(cur);

      // Assemble PDF objects
      const total = pages.length;
      const offs = [];
      let out = "%PDF-1.4\n";

      const add = (id, body) => {
        offs[id] = out.length;
        out += id + " 0 obj\n" + body + "\nendobj\n";
      };

      const kids = pages.map((_, i) => (7 + 2 * i) + " 0 R").join(" ");
      add(1, "<</Type/Catalog/Pages 2 0 R>>");
      add(2, "<</Type/Pages/Kids [" + kids + "]/Count " + total + ">>");
      add(3, "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>");
      add(4, "<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>");
      add(5, "<</Type/Font/Subtype/Type1/BaseFont/Courier/Encoding/WinAnsiEncoding>>");

      pages.forEach((c, i) => {
        const s = c.join("\n") + "\nBT " + GREY + " /F1 8 Tf " + (W / 2 - 14) + " 30 Td (" + (i + 1) + " / " + total + ") Tj ET";
        add(6 + 2 * i, "<</Length " + s.length + ">>\nstream\n" + s + "\nendstream");
        add(7 + 2 * i, "<</Type/Page/Parent 2 0 R/MediaBox [0 0 " + W + " " + H + "]/Resources<</Font<</F1 3 0 R/F2 4 0 R/F3 5 0 R>>>>/Contents " + (6 + 2 * i) + " 0 R>>");
      });

      const n = 6 + 2 * total;
      const xref = out.length;
      out += "xref\n0 " + n + "\n0000000000 65535 f \n";
      for (let i = 1; i < n; i++) out += String(offs[i]).padStart(10, "0") + " 00000 n \n";
      out += "trailer\n<</Size " + n + "/Root 1 0 R>>\nstartxref\n" + xref + "\n%%EOF";

      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
      return bytes;
    }

    api.registerCommand("exportPdf", {
      label: "Export pseudocode as PDF",
      desc: "Generates and downloads a PDF listing of the current pseudocode file",
      category: "Pseudocode",
      run() {
        const d = api.doc();
        const text = d.text;
        if (!text.trim()) {
          api.notify("Nothing to export: the document is empty.", true);
          return;
        }

        const bytes = buildPdf(text, d.name);
        const pdfName = d.name.replace(/\.[^.]+$/, "") + ".pdf";

        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        a.download = pdfName;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
        api.notify("Downloaded " + pdfName);
      }
    });
  },
  deactivate() {}
});