/* Redact extension: Export Scientific Paper as PDF (Editorial Red Template)
   Formats Markdown documents into professional 1-column or 2-column scientific PDF papers.
   Features:
   - Full text justification in 1-column PDF export
   - In-text numeric citation support [1], [2], [1, 2], [1-3]
   - Matching Redact Editorial Red theme (#c41230)
   - Strict layout order: Title -> Authors -> Affiliations/Email -> Abstract & Keywords -> Body
   - Clean Unicode character handling (ć, č, š, đ, ž)
   - Clean display equations and formatted grid tables
*/

editor.registerExtension({
  id: "export-paper-pdf-red",
  name: "Export Scientific Paper PDF (Red Theme)",
  version: "1.3.0",
  author: "Redact user",
  description: "Exports Markdown into Editorial Red styled 1-column (justified) or 2-column scientific PDF papers.",
  activate(api) {
    const W = 595.28, H = 841.89; // A4 dimensions in points
    const M = 40;                 // Page margin
    const PRINT_W = W - 2 * M;    // Printable width: 515.28 pt

    // Editorial Red Palette (matches Redact theme)
    const COLOR_RED = "0.77 0.07 0.19 rg";      // Primary Accent (#c41230)
    const COLOR_RED_DARK = "0.62 0.06 0.16 rg"; // Darker Red
    const COLOR_INK = "0.13 g";                 // Main text body
    const COLOR_GREY = "0.45 g";                // Subtitles / Muted text
    const COLOR_BG_RED = "0.98 0.95 0.96 rg";   // Soft Red background tint
    const COLOR_LINE_RED = "0.88 0.70 0.73 rg"; // Red accent lines
    const COLOR_LINE_GREY = "0.85 g";           // Subtle dividers

    // Extended Unicode Sanitizer Dictionary (Serbian Latin, Accent marks, Symbols)
    const CHAR_MAP = {
      'ć': 'c', 'Ć': 'C', 'č': 'c', 'Č': 'C',
      'š': 's', 'Š': 'S', 'đ': 'dj', 'Đ': 'Dj',
      'ž': 'z', 'Ž': 'Z', 'ä': 'a', 'ö': 'o',
      'ü': 'u', 'ß': 'ss', '–': '-', '—': '-',
      '“': '"', '”': '"', '‘': "'", '’': "'",
      '…': '...', '•': '*', '≤': '<=', '≥': '>=',
      '≠': '<>', '±': '+/-', '°': ' deg', '∈': 'in',
      'Δ': 'Delta', 'α': 'alpha', 'β': 'beta', 'ε': 'epsilon'
    };

    const cleanText = str => str.replace(/[\u0080-\uFFFF]/g, m => CHAR_MAP[m] || "?")
                               .replace(/\t/g, "    ");

    const pe = str => str.replace(/[\\()]/g, "\\$&");

    // Width calculation for PDF Type1 fonts
    const cw = c => /[ijl.,'!|:;]/.test(c) ? 0.28 : /[mwMW@]/.test(c) ? 0.85 : /[A-Z]/.test(c) ? 0.67 : 0.52;
    const calcWidth = (str, size, mono) => mono ? str.length * size * 0.6 : [...str].reduce((a, c) => a + cw(c), 0) * size;

    // Word wrapping helper
    function wrapText(text, size, maxW, mono) {
      const lines = [];
      let current = "";
      for (const word of text.split(/(\s+)/)) {
        if (calcWidth(current + word, size, mono) <= maxW) {
          current += word;
          continue;
        }
        if (current.trim()) { lines.push(current); current = ""; }
        let w = word.replace(/^\s+/, "");
        while (calcWidth(w, size, mono) > maxW) {
          let n = w.length;
          while (n > 1 && calcWidth(w.slice(0, n), size, mono) > maxW) n--;
          lines.push(w.slice(0, n));
          w = w.slice(n);
        }
        current = w;
      }
      if (current.length) lines.push(current);
      return lines.length ? lines : [""];
    }

    // Clean LaTeX Math String into readable text notation
    function cleanMath(rawMath) {
      return rawMath
        .replace(/\\begin\{cases\}|\\end\{cases\}/g, "")
        .replace(/\\text\{([^}]+)\}/g, "\$1")
        .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "(\$1)/(\$2)")
        .replace(/\\frac\s*([0-9a-zA-Z])\s*([0-9a-zA-Z])/g, "(\$1)/(\$2)")
        .replace(/\\sum_\{([^}]+)\}\^\{([^}]+)\}/g, "SUM(\$1..\$2)")
        .replace(/\\sum_\{([^}]+)\}/g, "SUM(\$1)")
        .replace(/\\sum/g, "SUM")
        .replace(/\\quad/g, "  ")
        .replace(/\\qquad/g, "    ")
        .replace(/\\le/g, "<=")
        .replace(/\\ge/g, ">=")
        .replace(/\\ne/g, "<>")
        .replace(/\\delta/g, "delta")
        .replace(/\\alpha/g, "alpha")
        .replace(/\\beta/g, "beta")
        .replace(/\\epsilon/g, "epsilon")
        .replace(/\\Delta/g, "Delta")
        .replace(/\\\\/g, " ; ")
        .replace(/\^\{([^}]+)\}/g, "^(\$1)")
        .replace(/_\{([^}]+)\}/g, "_(\$1)")
        .replace(/\\/g, "");
    }

    // Parse Markdown Paper Document
    function parsePaperMarkdown(mdText, forcedLayout) {
      const lines = mdText.replace(/\r\n?/g, "\n").split("\n");
      const paper = {
        title: "",
        authors: "",
        affiliation: "",
        abstract: "",
        keywords: "",
        layout: forcedLayout || "2-column",
        elements: []
      };

      let inAbstract = false;
      let inTable = false;
      let tableRows = [];

      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const trimmed = raw.trim();

        // Strip HTML comment directives
        if (trimmed.startsWith("<!--") && trimmed.endsWith("-->")) {
          const directive = trimmed.slice(4, -3).trim();
          if (!forcedLayout && /^layout:\s*(1-column|2-column)/i.test(directive)) {
            paper.layout = directive.match(/1-column/i) ? "1-column" : "2-column";
          }
          continue;
        }

        // 1. Title (# Title)
        if (/^#\s+/.test(raw) && !paper.title) {
          paper.title = raw.replace(/^#\s+/, "").trim();
          continue;
        }

        // 2. Authors (**Author Names**)
        if (/^\*\*([^*]+)\*\*\$/.test(trimmed) && !paper.authors) {
          paper.authors = trimmed.replace(/\*\*/g, "");
          continue;
        }

        // 3. Affiliation & Email (*Institution / Email*)
        if (/^\*([^*]+)\*\$/.test(trimmed) && paper.authors && !paper.abstract) {
          const affilText = trimmed.replace(/\*/g, "");
          paper.affiliation += (paper.affiliation ? "\n" : "") + affilText;
          continue;
        }

        // 4. Abstract & Keywords
        if (/^Abstract:?\s*/i.test(trimmed)) {
          paper.abstract = trimmed.replace(/^Abstract:?\s*/i, "");
          inAbstract = true;
          continue;
        }
        if (inAbstract) {
          if (/^Keywords:?\s*/i.test(trimmed)) {
            paper.keywords = trimmed.replace(/^Keywords:?\s*/i, "");
            inAbstract = false;
            continue;
          }
          if (trimmed === "" || /^#{1,3}\s+/.test(trimmed)) {
            inAbstract = false;
          } else {
            paper.abstract += " " + trimmed;
            continue;
          }
        }

        // 5. Tables
        if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
          if (/^\|[\s:-|-]+\|\$/.test(trimmed)) continue; // Separator line
          const cols = trimmed.slice(1, -1).split("|").map(c => c.trim());
          tableRows.push(cols);
          inTable = true;
          continue;
        } else if (inTable) {
          paper.elements.push({ type: "table", rows: tableRows });
          tableRows = [];
          inTable = false;
        }

        if (!trimmed) continue;

        // Section Headings
        if (/^##\s+/.test(raw)) {
          paper.elements.push({ type: "h1", text: raw.replace(/^##\s+/, "").trim() });
        } else if (/^###\s+/.test(raw)) {
          paper.elements.push({ type: "h2", text: raw.replace(/^###\s+/, "").trim() });
        }
        // Images / Figures
        else if (/^!\[([^\]]*)\]\(([^)]+)\)/.test(trimmed)) {
          const m = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
          paper.elements.push({ type: "image", caption: m[1], src: m[2] });
        }
        // Display Equations $$...$$
        else if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) {
          paper.elements.push({ type: "math", text: cleanMath(trimmed.slice(2, -2).trim()) });
        }
        // Blockquotes
        else if (trimmed.startsWith(">")) {
          paper.elements.push({ type: "quote", text: trimmed.replace(/^>\s?/, "") });
        }
        // Code Blocks
        else if (trimmed.startsWith("```")) {
          let codeText = "";
          i++;
          while (i < lines.length && !lines[i].trim().startsWith("```")) {
            codeText += lines[i] + "\n";
            i++;
          }
          paper.elements.push({ type: "code", text: codeText.trimEnd() });
        }
        // Bullet Lists or Numbered References [1]
        else if (/^\[\d+\]\s+/.test(trimmed)) {
          const m = trimmed.match(/^(\[\d+\])\s+(.*)/);
          paper.elements.push({ type: "reference", num: m[1], text: m[2] });
        } else if (/^[-*+]\s+/.test(trimmed)) {
          paper.elements.push({ type: "bullet", text: trimmed.replace(/^[-*+]\s+/, "") });
        }
        // Regular Paragraphs (with inline math $...$)
        else {
          let formattedPara = trimmed.replace(/\$([^\$]+)\$/g, (m, g1) => cleanMath(g1));
          paper.elements.push({ type: "paragraph", text: formattedPara });
        }
      }

      if (inTable && tableRows.length) {
        paper.elements.push({ type: "table", rows: tableRows });
      }

      return paper;
    }

    // Generate PDF Stream
    function buildPaperPDF(paper) {
      const isTwoCol = paper.layout === "2-column";
      const colGap = 16;
      const colWidth = isTwoCol ? (PRINT_W - colGap) / 2 : PRINT_W;

      const pages = [];
      let curPage = [];
      let colIdx = 0;
      let y = H - M;
      let pageTopY = H - M;

      const getX = () => M + colIdx * (colWidth + colGap);

      const newPage = () => {
        pages.push(curPage);
        curPage = [];
        colIdx = 0;
        y = H - M;
        pageTopY = H - M;
      };

      const nextColumn = () => {
        if (isTwoCol && colIdx === 0) {
          colIdx = 1;
          y = pageTopY;
        } else {
          newPage();
        }
      };

      const checkSpace = (needed) => {
        if (y - needed < M + 20) {
          nextColumn();
        }
      };

      // PDF Text Drawing with Full Justification Support
      const drawText = (str, font, size, x, lead, color = COLOR_INK, justifyWidth = 0) => {
        y -= lead;
        let twOp = "";
        if (justifyWidth > 0) {
          const naturalW = calcWidth(str, size, false);
          const spaces = (str.match(/ /g) || []).length;
          const diff = justifyWidth - naturalW;
          if (spaces > 0 && diff > 0 && diff < justifyWidth * 0.22) {
            const wordSpace = diff / spaces;
            twOp = `${wordSpace.toFixed(2)} Tw `;
          }
        }
        curPage.push(`BT ${color} /${font} ${size} Tf ${twOp}${x.toFixed(1)} ${y.toFixed(1)} Td (${pe(cleanText(str))}) Tj 0 Tw ET`);
      };

      const drawRect = (x, rY, w, h, color) => {
        curPage.push(`${color} ${x.toFixed(1)} ${rY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
      };

      const drawLine = (x1, y1, x2, y2, color = COLOR_LINE_RED, lw = 0.5) => {
        curPage.push(`${color} ${lw} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);
      };

      // HEADER LAYOUT (Full width across top of Page 1)
      // Order: 1. Title -> 2. Authors -> 3. Affiliations/Email -> 4. Abstract & Keywords

      // 1. Title
      if (paper.title) {
        drawRect(M, y - 14, 12, 12, COLOR_RED);
        for (const l of wrapText(paper.title, 16, PRINT_W - 20, false)) {
          drawText(l, "F2", 16, M + 18, 18, COLOR_RED);
        }
        y -= 8;
      }

      // 2. Authors
      if (paper.authors) {
        for (const l of wrapText(paper.authors, 10, PRINT_W, false)) {
          drawText(l, "F2", 10, M, 13, COLOR_INK);
        }
        y -= 2;
      }

      // 3. Affiliations & Email
      if (paper.affiliation) {
        for (const aff of paper.affiliation.split("\n")) {
          for (const l of wrapText(aff, 8.5, PRINT_W, false)) {
            drawText(l, "F1", 8.5, M, 11, COLOR_GREY);
          }
        }
        y -= 6;
      }

      drawLine(M, y, M + PRINT_W, y, COLOR_LINE_RED, 1);
      y -= 10;

      // 4. Abstract & Keywords Block
      if (paper.abstract) {
        const absWidth = PRINT_W - 16;
        const absLines = wrapText("Abstract— " + paper.abstract, 8.5, absWidth, false);
        const kwLines = paper.keywords ? wrapText("Keywords— " + paper.keywords, 8.5, absWidth, false) : [];
        const boxHeight = (absLines.length + kwLines.length) * 11 + 12;

        drawRect(M, y - boxHeight, PRINT_W, boxHeight, COLOR_BG_RED);
        drawLine(M, y, M + PRINT_W, y, COLOR_LINE_RED, 0.75);
        drawLine(M, y - boxHeight, M + PRINT_W, y - boxHeight, COLOR_LINE_RED, 0.75);

        let startY = y - 3;
        y = startY;
        for (let idx = 0; idx < absLines.length; idx++) {
          const isLast = idx === absLines.length - 1;
          drawText(absLines[idx], "F1", 8.5, M + 8, 11, COLOR_INK, !isTwoCol && !isLast ? absWidth : 0);
        }
        if (kwLines.length) {
          y -= 2;
          for (let idx = 0; idx < kwLines.length; idx++) {
            const isLast = idx === kwLines.length - 1;
            drawText(kwLines[idx], "F2", 8.5, M + 8, 11, COLOR_INK, !isTwoCol && !isLast ? absWidth : 0);
          }
        }
        y -= 12;
      }

      // Record column start threshold for Page 1 body
      pageTopY = y;

      // BODY CONTENT
      for (const elem of paper.elements) {
        if (elem.type === "h1") {
          checkSpace(26);
          y -= 8;
          for (const l of wrapText(elem.text, 10.5, colWidth, false)) {
            drawText(l, "F2", 10.5, getX(), 13, COLOR_RED);
          }
          drawLine(getX(), y - 2, getX() + colWidth, y - 2, COLOR_LINE_RED, 0.75);
          y -= 5;
        } else if (elem.type === "h2") {
          checkSpace(20);
          y -= 6;
          for (const l of wrapText(elem.text, 9.5, colWidth, false)) {
            drawText(l, "F2", 9.5, getX(), 12, COLOR_INK);
          }
          y -= 3;
        } else if (elem.type === "paragraph") {
          const lines = wrapText(elem.text, 8.5, colWidth, false);
          lines.forEach((l, idx) => {
            checkSpace(11);
            const isLast = idx === lines.length - 1;
            // Full Justification in 1-column layout for paragraph lines
            const justW = (!isTwoCol && !isLast) ? colWidth : 0;
            drawText(l, "F1", 8.5, getX(), 11, COLOR_INK, justW);
          });
          y -= 3;
        } else if (elem.type === "bullet") {
          const lines = wrapText(elem.text, 8.5, colWidth - 10, false);
          lines.forEach((l, idx) => {
            checkSpace(11);
            if (idx === 0) {
              drawText("-", "F2", 8.5, getX() + 2, 11, COLOR_RED);
              drawText(l, "F1", 8.5, getX() + 10, 0, COLOR_INK);
            } else {
              drawText(l, "F1", 8.5, getX() + 10, 11, COLOR_INK);
            }
          });
          y -= 2;
        } else if (elem.type === "reference") {
          const refIndent = calcWidth(elem.num, 8.5, false) + 6;
          const lines = wrapText(elem.text, 8.5, colWidth - refIndent, false);
          lines.forEach((l, idx) => {
            checkSpace(11);
            if (idx === 0) {
              drawText(elem.num, "F2", 8.5, getX(), 11, COLOR_RED);
              drawText(l, "F1", 8.5, getX() + refIndent, 0, COLOR_INK);
            } else {
              drawText(l, "F1", 8.5, getX() + refIndent, 11, COLOR_INK);
            }
          });
          y -= 2;
        } else if (elem.type === "math") {
          // Display Equations in clean shaded box
          const mathLines = wrapText(elem.text, 8.5, colWidth - 16, true);
          const mathH = mathLines.length * 11 + 8;
          checkSpace(mathH + 6);

          drawRect(getX(), y - mathH, colWidth, mathH, COLOR_BG_RED);
          drawLine(getX(), y, getX() + colWidth, y, COLOR_LINE_RED, 0.5);
          drawLine(getX(), y - mathH, getX() + colWidth, y - mathH, COLOR_LINE_RED, 0.5);

          for (const ml of mathLines) {
            drawText(ml, "F3", 8.5, getX() + 8, 11, COLOR_RED_DARK);
          }
          y -= 6;
        } else if (elem.type === "code") {
          const lines = elem.text.split("\n");
          for (const l of lines) {
            for (const wl of wrapText(l, 8, colWidth - 8, true)) {
              checkSpace(10);
              drawText(wl, "F3", 8, getX() + 4, 10, COLOR_INK);
            }
          }
          y -= 4;
        } else if (elem.type === "table") {
          const rows = elem.rows;
          if (!rows.length) continue;
          const colsCount = Math.max(...rows.map(r => r.length));
          const cellW = colWidth / colsCount;
          const rowH = 13;
          const totalH = rows.length * rowH;

          checkSpace(totalH + 10);
          const startTableY = y;

          rows.forEach((row, rIdx) => {
            const isHeader = rIdx === 0;
            if (isHeader) {
              drawRect(getX(), y - rowH, colWidth, rowH, COLOR_RED);
            }
            row.forEach((cell, cIdx) => {
              const cX = getX() + cIdx * cellW;
              const wrapped = wrapText(cell, 8, cellW - 4, false)[0] || "";
              drawText(wrapped, isHeader ? "F2" : "F1", 8, cX + 3, 9.5, isHeader ? "1 g" : COLOR_INK);
              y += 9.5;
            });
            y = startTableY - (rIdx + 1) * rowH;
            drawLine(getX(), y, getX() + colWidth, y, COLOR_LINE_GREY, 0.5);
          });
          y -= 6;
        } else if (elem.type === "image") {
          const imgH = 70;
          checkSpace(imgH + 16);
          drawRect(getX(), y - imgH, colWidth, imgH, COLOR_BG_RED);
          drawText(`[Figure: ${elem.caption || elem.src}]`, "F2", 8, getX() + 8, imgH / 2 + 3, COLOR_GREY);
          y -= (imgH / 2 - 3);
          if (elem.caption) {
            for (const cl of wrapText(`Fig: ${elem.caption}`, 8, colWidth, false)) {
              checkSpace(9.5);
              drawText(cl, "F1", 8, getX(), 9.5, COLOR_GREY);
            }
          }
          y -= 5;
        }
      }

      pages.push(curPage);

      // PDF Binary Stream Assembly
      const totalPages = pages.length;
      const offsets = [];
      let pdfStr = "%PDF-1.4\n";

      const addObj = (id, body) => {
        offsets[id] = pdfStr.length;
        pdfStr += id + " 0 obj\n" + body + "\nendobj\n";
      };

      const kids = pages.map((_, i) => (7 + 2 * i) + " 0 R").join(" ");
      addObj(1, "<</Type/Catalog/Pages 2 0 R>>");
      addObj(2, `<</Type/Pages/Kids [${kids}]/Count ${totalPages}>>`);
      addObj(3, "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>");
      addObj(4, "<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>");
      addObj(5, "<</Type/Font/Subtype/Type1/BaseFont/Courier/Encoding/WinAnsiEncoding>>");

      pages.forEach((content, i) => {
        const headerText = i > 0 ? paper.title.slice(0, 70) : "";
        const header = i > 0 ? `BT ${COLOR_GREY} /F1 7.5 Tf ${M} ${H - 25} Td (${pe(cleanText(headerText))}) Tj ET` : "";
        const footer = `BT ${COLOR_GREY} /F1 7.5 Tf ${W / 2 - 20} 20 Td (Page ${i + 1} of ${totalPages}) Tj ET`;
        const streamData = (header ? header + "\n" : "") + content.join("\n") + "\n" + footer;

        addObj(6 + 2 * i, `<</Length ${streamData.length}>>\nstream\n${streamData}\nendstream`);
        addObj(7 + 2 * i, `<</Type/Page/Parent 2 0 R/MediaBox [0 0 ${W} ${H}]/Resources<</Font<</F1 3 0 R/F2 4 0 R/F3 5 0 R>>>>/Contents ${6 + 2 * i} 0 R>>`);
      });

      const nObj = 6 + 2 * totalPages;
      const xrefOffset = pdfStr.length;
      pdfStr += `xref\n0 ${nObj}\n0000000000 65535 f \n`;
      for (let i = 1; i < nObj; i++) {
        pdfStr += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
      }
      pdfStr += `trailer\n<</Size ${nObj}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF`;

      const bytes = new Uint8Array(pdfStr.length);
      for (let i = 0; i < pdfStr.length; i++) {
        bytes[i] = pdfStr.charCodeAt(i) & 255;
      }
      return bytes;
    }

    // Export Handler
    function runExport(forcedLayout) {
      const doc = api.doc();
      const text = doc.text;
      if (!text.trim()) {
        api.notify("Document is empty. Nothing to export.", true);
        return;
      }

      const paper = parsePaperMarkdown(text, forcedLayout);
      const bytes = buildPaperPDF(paper);
      const fileName = doc.name.replace(/\.[^.]+\$/, "") + `-${paper.layout}.pdf`;

      const blob = new Blob([bytes], { type: "application/pdf" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      api.notify(`Downloaded ${fileName} (${paper.layout})`);
    }

    // Register Commands into Redact
    api.registerCommand("exportPaperPdf2Col", {
      label: "Export as 2-Column PDF Paper",
      desc: "Exports the document as a 2-column scientific PDF with Red Editorial theme",
      category: "Paper Exporter",
      run() { runExport("2-column"); }
    });

    api.registerCommand("exportPaperPdf1Col", {
      label: "Export as 1-Column Justified PDF Paper",
      desc: "Exports the document as a 1-column justified scientific PDF with Red Editorial theme",
      category: "Paper Exporter",
      run() { runExport("1-column"); }
    });

    api.registerCommand("insertPaperTemplateRed", {
      label: "Insert Scientific Paper Template (Red Theme)",
      desc: "Inserts a structured Markdown paper template matching Redact editor styling",
      category: "Paper Exporter",
      run() {
        const template = `# Optimization of Multimodal Trait Prediction Using Particle Swarm Optimization

**Milić VUKOJIČIĆ, Mladen VEINOVIĆ**
*Singidunum University, 32 Danijelova, Belgrade, 11000, Serbia*
*vukojicic.milic@gmail.com, mveinovic@singidunum.ac.rs*

Abstract: Multimodal trait prediction is one of the hardest problems in the domain of Computer Science, Machine Learning, and neural networks. Human traits are subjected to changes in terms of time, situation, place, observer, etc. This paper will try to overcome the problem through the optimization of multimodal trait prediction using Particle Swarm Optimization (PSO) algorithm [1]. Parameter optimization problem based on PSO shown in this paper represents a method that is more efficient for both linear and nonlinear models [1, 2]. The obtained results show that PSO can improve both the prediction of the aggregation model which gives a linear approximation of traits and the nonlinear robust estimation models based on the Huber function [3].

Keywords: Particle Swarm Optimization, Metaheuristics, Aggregation functions, Robust loss function, Apparent personality analysis, Personality classification.

## 1. Introduction
Automatic apparent trait analysis and trait prediction use modern computer methods to predict human personality from various input parameters such as text, handwriting, image, and audio supports. The main aim of the models used in computer science is not to understand traits, but to predict them [1, 3].

## 2. Literature Review
Differentiating individualities, explaining why each person has different traits and understanding why their traits are different represent a wide research area in the psychology domain.

### 2.1 Extraction Models Before SAM
Multimodal trait prediction is often related to several input parameters like images, sounds, audio, and video parameters which are combined into a single discrete output [2].

## 3. The Proposed Soft Aggregation Model
The proposed method will be based on the Soft Aggregation Model. The model is constructed from three different parts: aggregation functions, Huber loss function, and Particle Swarm Optimization [1].

### 3.1 Aggregation Model
Mean and Median aggregation functions can be defined as:

$$ mean(x) = \frac{\sum_{i=1}^{n} x_i}{n} $$

### 3.2 Robust Estimation
Huber loss function is defined as:

$$ L(a) = \begin{cases} \frac{1}{2} a^2 & \text{for } |a| \le \delta \\ \delta |a| - \frac{1}{2} \delta^2 & \text{otherwise} \end{cases} $$

### 3.3 Particle Swarm Optimization (PSO)
Velocity and position update equations for particle $i$:

$$ v_i^{t+1} = v_i^t + \alpha \epsilon_1 [g^* - x_i^t] + \beta \epsilon_2 [x_i^* - x_i^t] $$

$$ x_i^{t+1} = x_i^t + v_i^{t+1} \Delta t $$

## 4. Experimental Design
The experiment done in this paper is based on 64 subjects, 33 males and 31 females, aged between 18 and 70.

| Attempt | Swarm Size | Number of Iterations |
| 1 | 4 | 10 |
| 2 | 5 | 20 |
| 3 | 4 | 25 |
| 4 | 25 | 50 |

## 5. Results and Discussion
Comparison regarding absolute error results of the Soft Aggregation Model [1, 3]:

| Model | Openness | Conscientiousness | Extraversion | Agreeableness | Neuroticism |
| MAX | 0.27 | 0.29 | 0.32 | 0.35 | 0.34 |
| MIN | 0.55 | 0.45 | 0.46 | 0.46 | 0.48 |
| HUBER | 0.17 | 0.14 | 0.16 | 0.13 | 0.14 |
| SAM | 0.11 | 0.14 | 0.14 | 0.10 | 0.13 |

## 6. Conclusion and Future Development
Apparent personality analysis represents one of the hardest problems that can be found in the domain of psychology and Computer Science.

## REFERENCES
[1] Kennedy, J. & Eberhart, R. (1995). Particle swarm optimization. IEEE.
[2] Bansal, J. C., Singh, P. K. & Pal, N. R. (2019). Evolutionary and Swarm Intelligence Algorithms. Springer.
[3] Huber, P. J. (1992). Robust estimation of a location parameter. Breakthroughs in Statistics.
`;
        api.openDoc("scientific_paper.md", template);
      }
    });
  },
  deactivate() {}
});