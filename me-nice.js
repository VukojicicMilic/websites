(function(ME) {
  // Create a container with side-by-side layout
  const container = document.createElement("div");
  container.style.display = "flex";
  container.style.flex = "1";
  container.style.height = "100%";

  // Move the existing editor inside
  const editor = ME.editor;
  editor.style.flex = "1";
  editor.style.width = "50%";
  editor.style.fontFamily = '"JetBrains Mono", monospace';
  editor.style.fontSize = "14px";
  editor.style.lineHeight = "1.4";
  editor.style.color = "#2a2a2a";
  editor.style.background = "#fefdfb";
  editor.style.borderRight = "1px solid #ccc";
  editor.style.resize = "none";

  // Create the preview pane
  const preview = document.createElement("div");
  preview.id = "org-preview";
  Object.assign(preview.style, {
    flex: "1",
    width: "50%",
    padding: "1em",
    fontFamily: '"Source Serif Pro", Georgia, serif',
    background: "#fff",
    color: "#2a2a2a",
    overflowY: "auto",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
  });

  // Replace editor position in DOM
  const parent = editor.parentNode;
  parent.replaceChild(container, editor);
  container.appendChild(editor);
  container.appendChild(preview);

  function renderOrg(text) {
    // Escape HTML
    text = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Headers
    text = text.replace(/^(\*{3}) (.+)$/gm, '<h3 style="color:#a32638;">$2</h3>');
    text = text.replace(/^(\*{2}) (.+)$/gm, '<h2 style="color:#c53e4b;">$2</h2>');
    text = text.replace(/^(\*) (.+)$/gm, '<h1 style="color:#e35a5a;">$2</h1>');

    // Bold, italic, underline
    text = text.replace(/\*(.*?)\*/g, "<b>$1</b>");
    text = text.replace(/\/(.*?)\//g, "<i>$1</i>");
    text = text.replace(/_(.*?)_/g, "<u>$1</u>");

    // Lists
    text = text.replace(/^[\+\-] (.+)$/gm, "<li>$1</li>");
    text = text.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");

    // Image embedding
    text = text.replace(
      /\[\[(.*?)\.(png|jpg|jpeg|gif|webp)\]\]/gi,
      '<img src="$1.$2" style="max-width:100%; border-radius:5px; display:block; margin:0.5em 0;">'
    );

    // Video embedding
    text = text.replace(
      /\[\[(.*?)\.(mp4|webm|ogg)\]\]/gi,
      '<video controls style="max-width:100%; display:block; margin:0.5em 0;"><source src="$1.$2" type="video/$2"></video>'
    );

    return text;
  }

  function updatePreview() {
    preview.innerHTML = renderOrg(editor.value);
    preview.scrollTop = editor.scrollTop;
  }

  // Sync updates
  editor.addEventListener("input", updatePreview);
  editor.addEventListener("scroll", () => {
    preview.scrollTop = editor.scrollTop;
  });

  // Initialize
  updatePreview();
  ME.status.textContent = "Org-mode live preview loaded (perfect typing).";
})(ME);
