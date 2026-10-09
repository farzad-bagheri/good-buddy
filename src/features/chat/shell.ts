// Auto-generated from D:\Code\good-buddy\scripts\html\chat-shell.html

export const shellHtml = (cspSource: string, nonce: string, scriptUri: string, styleUri: string, iconUri: (name: string) => string) => `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${cspSource}; style-src ${cspSource} 'nonce-${nonce}'; script-src ${cspSource} 'nonce-${nonce}';"
    />
    <link rel="stylesheet" href="${styleUri}" />
    <style nonce="${nonce}">
      
    .add-icon {
        mask-image: url("${iconUri("add")}");
        -webkit-mask-image: url("${iconUri("add")}");
      }

    .app-icon {
        mask-image: url("${iconUri("app")}");
        -webkit-mask-image: url("${iconUri("app")}");
      }

    .back-icon {
        mask-image: url("${iconUri("back")}");
        -webkit-mask-image: url("${iconUri("back")}");
      }

    .check-icon {
        mask-image: url("${iconUri("check")}");
        -webkit-mask-image: url("${iconUri("check")}");
      }

    .copy-icon {
        mask-image: url("${iconUri("copy")}");
        -webkit-mask-image: url("${iconUri("copy")}");
      }

    .debug-icon {
        mask-image: url("${iconUri("debug")}");
        -webkit-mask-image: url("${iconUri("debug")}");
      }

    .delete-icon {
        mask-image: url("${iconUri("delete")}");
        -webkit-mask-image: url("${iconUri("delete")}");
      }

    .explain-icon {
        mask-image: url("${iconUri("explain")}");
        -webkit-mask-image: url("${iconUri("explain")}");
      }

    .git-icon {
        mask-image: url("${iconUri("git")}");
        -webkit-mask-image: url("${iconUri("git")}");
      }

    .history-icon {
        mask-image: url("${iconUri("history")}");
        -webkit-mask-image: url("${iconUri("history")}");
      }

    .improve-icon {
        mask-image: url("${iconUri("improve")}");
        -webkit-mask-image: url("${iconUri("improve")}");
      }

    .models-icon {
        mask-image: url("${iconUri("models")}");
        -webkit-mask-image: url("${iconUri("models")}");
      }

    .new-chat-icon {
        mask-image: url("${iconUri("new-chat")}");
        -webkit-mask-image: url("${iconUri("new-chat")}");
      }

    .remove-icon {
        mask-image: url("${iconUri("remove")}");
        -webkit-mask-image: url("${iconUri("remove")}");
      }

    .retry-icon {
        mask-image: url("${iconUri("retry")}");
        -webkit-mask-image: url("${iconUri("retry")}");
      }

    .selection-icon {
        mask-image: url("${iconUri("selection")}");
        -webkit-mask-image: url("${iconUri("selection")}");
      }

    .send-icon {
        mask-image: url("${iconUri("send")}");
        -webkit-mask-image: url("${iconUri("send")}");
      }

    .tests-icon {
        mask-image: url("${iconUri("tests")}");
        -webkit-mask-image: url("${iconUri("tests")}");
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>
`;
