(function(ME) {
  // --- Create container ---
  const container = document.createElement("div");
  container.style.display = "flex";
  container.style.flex = "1";
  container.style.height = "100%";
  container.style.position = "relative";

  // --- Editor setup ---
  const editor = ME.editor;
  editor.style.flex = "1 0 50%";
  editor.style.fontFamily = '"JetBrains Mono", monospace';
  editor.style.fontSize = "14px";
  editor.style.lineHeight = "1.4";
  editor.style.color = "#2a2a2a";
  editor.style.background = "#fefdfb";
  editor.style.borderRight = "1px solid #ccc";
  editor.style.resize = "none";
  editor.style.minWidth = "50px";

  // --- Preview pane setup ---
  const preview = document.createElement("div");
  preview.id = "org-preview";
  Object.assign(preview.style, {
    flex: "1 0 50%",
    padding: "1em",
    fontFamily: '"Source Serif Pro", Georgia, serif',
    background: "#fff",
    color: "#2a2a2a",
    overflowY: "auto",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
    transition: "all 0.3s",
    minWidth: "50px",
  });

  // --- Add resizer ---
  const resizer = document.createElement("div");
  Object.assign(resizer.style, {
    width: "5px",
    cursor: "col-resize",
    background: "#ccc",
    flexShrink: "0",
  });

  let isResizing = false;
  resizer.addEventListener("mousedown", () => { isResizing = true; });
  document.addEventListener("mousemove", e => {
    if (!isResizing) return;
    const containerRect = container.getBoundingClientRect();
    let editorWidth = e.clientX - containerRect.left;
    if (editorWidth < 50) editorWidth = 50;
    if (editorWidth > containerRect.width - 50) editorWidth = containerRect.width - 50;
    editor.style.flexBasis = editorWidth + "px";
    preview.style.flexBasis = containerRect.width - editorWidth - resizer.offsetWidth + "px";
  });
  document.addEventListener("mouseup", () => { isResizing = false; });

  // --- Replace editor position ---
  const parent = editor.parentNode;
  parent.replaceChild(container, editor);
  container.appendChild(editor);
  container.appendChild(resizer);
  container.appendChild(preview);

  // --- Render Org-mode ---
  function renderOrg(text) {
    text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    text = text.replace(/^(\*{3}) (.+)$/gm, '<h3 style="color:#a32638;">$2</h3>');
    text = text.replace(/^(\*{2}) (.+)$/gm, '<h2 style="color:#c53e4b;">$2</h2>');
    text = text.replace(/^(\*) (.+)$/gm, '<h1 style="color:#e35a5a;">$2</h1>');
    text = text.replace(/\*(.*?)\*/g, "<b>$1</b>");
    text = text.replace(/\/(.*?)\//g, "<i>$1</i>");
    text = text.replace(/_(.*?)_/g, "<u>$1</u>");
    text = text.replace(/^[\+\-] (.+)$/gm, "<li>$1</li>");
    text = text.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
    text = text.replace(/\[\[(.*?)\.(png|jpg|jpeg|gif|webp)\]\]/gi,
      '<img src="$1.$2" style="max-width:100%; border-radius:5px; display:block; margin:0.5em 0;">');
    text = text.replace(/\[\[(.*?)\.(mp4|webm|ogg)\]\]/gi,
      '<video controls style="max-width:100%; display:block; margin:0.5em 0;"><source src="$1.$2" type="video/$2"></video>');
    return text;
  }

  // --- Update preview ---
  function updatePreview() {
    preview.innerHTML = renderOrg(editor.value);
    preview.scrollTop = editor.scrollTop;
  }

  editor.addEventListener("input", updatePreview);
  editor.addEventListener("scroll", () => { preview.scrollTop = editor.scrollTop; });
  updatePreview();

  ME.status.textContent = "Org-mode live preview loaded (resizable + presentation).";

  // --- Presentation mode ---
  let presentationMode = false;
  let slides = [];
  let currentSlide = 0;

  const presButton = document.createElement("button");
  presButton.textContent = "Presentation Mode";
  Object.assign(presButton.style, {
    position: "absolute",
    top: "10px",
    right: "10px",
    zIndex: "1000",
    padding: "0.4em 0.8em",
    background: "#a32638",
    color: "white",
    border: "none",
    borderRadius: "3px",
    cursor: "pointer",
    fontFamily: "inherit"
  });
  container.appendChild(presButton);

  function buildSlides() {
    const lines = editor.value.split("\n");
    slides = [];
    let slideContent = "";
    for (let line of lines) {
      if (line.startsWith("* ")) {
        if (slideContent) slides.push(slideContent);
        slideContent = line + "\n";
      } else {
        slideContent += line + "\n";
      }
    }
    if (slideContent) slides.push(slideContent);
  }

  function showSlide(index) {
    if (index < 0) index = 0;
    if (index >= slides.length) index = slides.length - 1;
    currentSlide = index;
    preview.innerHTML = renderOrg(slides[currentSlide]);
    ME.status.textContent = `Presentation mode: Slide ${currentSlide + 1}/${slides.length}`;
  }

  presButton.addEventListener("click", () => {
    presentationMode = !presentationMode;
    if (presentationMode) {
      editor.style.display = "none";
      resizer.style.display = "none";
      preview.style.width = "100%";
      preview.style.height = "100vh";
      preview.style.padding = "3em";
      preview.style.fontSize = "2em";
      preview.style.lineHeight = "1.6";
      preview.style.background = "#fff"; // white background
      preview.style.color = "#2a2a2a";
      preview.style.overflow = "hidden";
      preview.style.whiteSpace = "normal";
      document.body.style.background = "#fff"; // body white
      buildSlides();
      currentSlide = 0;
      showSlide(currentSlide);
      ME.status.textContent = "Presentation mode ON (use Arrow keys to navigate).";
    } else {
      editor.style.display = "block";
      resizer.style.display = "block";
      editor.style.flexBasis = "50%";
      preview.style.flexBasis = "50%";
      preview.style.height = "100%";
      preview.style.padding = "1em";
      preview.style.fontSize = "1em";
      preview.style.lineHeight = "1.4";
      preview.style.background = "#fff";
      preview.style.color = "#2a2a2a";
      preview.style.overflowY = "auto";
      preview.style.whiteSpace = "pre-wrap";
      document.body.style.background = "#f8f6f2";
      updatePreview();
      ME.status.textContent = "Presentation mode OFF.";
    }
  });

  // --- Keyboard navigation for slides ---
  document.addEventListener("keydown", e => {
    if (!presentationMode) return;
    if (e.key === "ArrowRight" || e.key === " ") {
      showSlide(currentSlide + 1);
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      showSlide(currentSlide - 1);
      e.preventDefault();
    }
  });

})(ME);
