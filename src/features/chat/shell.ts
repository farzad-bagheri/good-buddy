// Auto-generated from D:\Code\good-buddy\scripts\html\chat-shell.html

export const shellHtml = (cspSource: string, nonce: string, scriptUri: string, styleUri: string, iconUri: (name: string) => string) => `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${cspSource}; style-src ${cspSource} 'nonce-${nonce}' 'unsafe-inline'; script-src ${cspSource} 'nonce-${nonce}';"
    />
    <link rel="stylesheet" href="${styleUri}" />
    <style nonce="${nonce}">
      
    .app-icon {
        mask-image: url("${iconUri("app")}");
        -webkit-mask-image: url("${iconUri("app")}");
      }

    .send-icon {
        mask-image: url("${iconUri("send")}");
        -webkit-mask-image: url("${iconUri("send")}");
      }

    .back-icon {
        mask-image: url("${iconUri("back")}");
        -webkit-mask-image: url("${iconUri("back")}");
      }

    .copy-icon {
        mask-image: url("${iconUri("copy")}");
        -webkit-mask-image: url("${iconUri("copy")}");
      }

    .delete-icon {
        mask-image: url("${iconUri("delete")}");
        -webkit-mask-image: url("${iconUri("delete")}");
      }

    .remove-icon {
        mask-image: url("${iconUri("remove")}");
        -webkit-mask-image: url("${iconUri("remove")}");
      }

    .add-icon {
        mask-image: url("${iconUri("add")}");
        -webkit-mask-image: url("${iconUri("add")}");
      }

    .check-icon {
        mask-image: url("${iconUri("check")}");
        -webkit-mask-image: url("${iconUri("check")}");
      }

    .history-icon {
        mask-image: url("${iconUri("history")}");
        -webkit-mask-image: url("${iconUri("history")}");
      }

    .new-chat-icon {
        mask-image: url("${iconUri("new-chat")}");
        -webkit-mask-image: url("${iconUri("new-chat")}");
      }

    .retry-icon {
        mask-image: url("${iconUri("retry")}");
        -webkit-mask-image: url("${iconUri("retry")}");
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>
`;
