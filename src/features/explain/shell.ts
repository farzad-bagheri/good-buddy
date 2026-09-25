// Auto-generated from D:\Code\good-buddy\scripts\html\explain-shell.html

export const shellHtml = (iconUri: string) => `<!doctype html>
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
        margin-bottom: 20px;
        color: var(--vscode-descriptionForeground);
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

      /* LLM output */

      .content {
        font-size: 14px;
      }

      .content p {
        margin: 0 0 16px;
      }

      .content h1,
      .content h2,
      .content h3 {
        margin-top: 28px;
        margin-bottom: 12px;
        line-height: 1.3;
        font-weight: 600;
        color: var(--vscode-foreground);
      }

      .content h1 {
        font-size: 20px;
      }

      .content h2 {
        font-size: 17px;
      }

      .content h3 {
        font-size: 15px;
      }

      .content ul,
      .content ol {
        padding-left: 24px;
        margin: 8px 0 18px;
      }

      .content li {
        margin: 5px 0;
      }

      /* Inline code */

      code {
        font-family: var(--vscode-editor-font-family);
        font-size: 0.9em;
        color: var(--vscode-textPreformat-foreground);
        background: var(--vscode-textCodeBlock-background);
        padding: 0.15em 0.35em;
        border-radius: 3px;
      }

      /* Code blocks */

      pre {
        margin: 16px 0;
        padding: 14px 16px;
        overflow-x: auto;
        border: 1px solid var(--vscode-editorWidget-border);
        border-radius: 5px;
        background: var(--vscode-textCodeBlock-background);
        color: var(--vscode-textPreformat-foreground);
        font-family: var(--vscode-editor-font-family);
        font-size: var(--vscode-editor-font-size);
        line-height: 1.5;
        white-space: pre;
      }

      pre code {
        padding: 0;
        background: transparent;
        color: inherit;
      }

      /* Block quotes */

      blockquote {
        margin: 16px 0;
        padding: 8px 16px;
        border-left: 3px solid var(--vscode-textLink-foreground);
        color: var(--vscode-descriptionForeground);
        background: var(--vscode-textCodeBlock-background);
      }

      /* Links */

      a {
        color: var(--vscode-textLink-foreground);
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
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

      .iconic {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* Loading cursor */

      .cursor {
        display: inline-block;
        width: 6px;
        height: 15px;
        margin-left: 2px;
        vertical-align: -2px;
        background: var(--vscode-foreground);
        animation: blink 1s step-end infinite;
      }

      @keyframes blink {
        50% {
          opacity: 0;
        }
      }
    </style>
  </head>

  <body>
    <div class="container">
      <div class="iconic">
        <img src="${iconUri}" alt="Good Buddy Icon" class="logo" />
        <span>Good Buddy</span>
      </div>

      <main id="out" class="content"></main>

      <div id="error"></div>
    </div>

    <script>
      const out = document.getElementById("out");
      const error = document.getElementById("error");

      out.textContent = "Waiting for explanation...";

      window.addEventListener("message", (event) => {
        const msg = event.data;

        switch (msg.type) {
          case "chunk":
            if (out.textContent === "Waiting for explanation...") {
              out.textContent = "";
            }

            out.textContent += msg.text;
            break;

          case "error":
            error.innerHTML = "";

            const errorElement = document.createElement("div");
            errorElement.className = "error";
            errorElement.textContent = "Error: " + msg.text;

            error.appendChild(errorElement);
            break;

          case "done":
            out.innerHTML = msg.text;
            break;
        }
      });
    </script>
  </body>
</html>
`;
