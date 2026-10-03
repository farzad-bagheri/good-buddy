// Auto-generated from D:\Code\good-buddy\scripts\html\explain-shell.html

export const shellHtml = () => `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />

    <style>
      :root {
        color-scheme: light dark;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 0;
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        line-height: 1.55;
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
      }

      .container {
        max-width: 900px;
        margin: 0 auto;
        padding: 20px 24px 40px;
      }

      /* Header */

      .header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 16px 0;
        margin-bottom: 20px;
        color: var(--vscode-descriptionForeground);
        border-bottom: 1px solid var(--vscode-editorWidget-border);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .header::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--vscode-textLink-foreground);
      }

      .explanation-content {
        font-size: 14px;
      }

      .markdown-content {
  white-space: normal;
  line-height: 1.55;
}

.markdown-content p {
  margin: 0 0 12px;
}

.markdown-content p:last-child {
  margin-bottom: 0;
}

.markdown-content h1,
.markdown-content h2,
.markdown-content h3,
.markdown-content h4 {
  margin: 20px 0 8px;
  line-height: 1.3;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.markdown-content h1 {
  font-size: 1.35em;
}

.markdown-content h2 {
  font-size: 1.2em;
}

.markdown-content h3,
.markdown-content h4 {
  font-size: 1.05em;
}

.markdown-content ul,
.markdown-content ol {
  margin: 8px 0 16px;
  padding-left: 24px;
}

.markdown-content li {
  margin: 4px 0;
}

.markdown-content code {
  padding: 0.15em 0.35em;
  border-radius: 4px;
  color: var(--vscode-textPreformat-foreground);
  background: var(--vscode-textCodeBlock-background);
  font-family: var(--vscode-editor-font-family);
  font-size: 0.9em;
}

.markdown-content pre {
  overflow: auto;
  margin: 16px 0;
  padding: 12px;
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 4px;
  color: var(--vscode-textPreformat-foreground);
  background: var(--vscode-textCodeBlock-background);
  white-space: pre;
}

.markdown-content pre code {
  padding: 0;
  color: inherit;
  background: transparent;
}

.markdown-content blockquote {
  margin: 12px 0;
  padding: 8px 12px;
  border-left: 3px solid var(--vscode-textLink-foreground);
  color: var(--vscode-descriptionForeground);
  background: var(--vscode-textCodeBlock-background);
}

.markdown-content a {
  color: var(--vscode-textLink-foreground);
}

.markdown-content a:hover {
  text-decoration: underline;
}

.markdown-content table {
  width: 100%;
  margin: 12px 0;
  border-collapse: collapse;
}

.markdown-content th,
.markdown-content td {
  padding: 8px;
  border: 1px solid var(--vscode-editorWidget-border);
  text-align: left;
}

.markdown-content th {
  background: var(--vscode-textCodeBlock-background);
}

.markdown-content .mermaid-diagram {
  max-width: 100%;
  overflow-x: auto;
  margin: 16px 0;
  background-color: wheat;
}

.markdown-content .mermaid-diagram svg {
  max-width: 100%;
}


      /* Error */

      .error {
        margin-top: 16px;
        padding: 10px 12px;
        border: 1px solid var(--vscode-inputValidation-errorBorder);
        border-radius: 4px;
        color: var(--vscode-errorForeground);
        background: var(--vscode-inputValidation-errorBackground);
      }
    </style>
  </head>

  <body>
    <div class="container">
      <div class="header">
        <span>Good Buddy</span>
      </div>

      <main id="out" class="explanation-content markdown-content"></main>

      <div id="error"></div>
    </div>

    <script>
      const out = document.getElementById("out");
      const error = document.getElementById("error");

      out.textContent = "Waiting for explanation...";

      window.addEventListener("message", (event) => {
        const msg = event.data;
        switch (msg.type) {
          case "vsc:error":
            error.innerHTML = "";

            const errorElement = document.createElement("div");
            errorElement.className = "error";
            errorElement.textContent = "Error: " + msg.text;

            error.appendChild(errorElement);
            break;

          case "vsc:done":
            out.innerHTML = msg.text;
            break;
        }
      });
    </script>
  </body>
</html>
`;
