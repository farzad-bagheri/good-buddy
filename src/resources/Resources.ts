import * as vscode from "vscode";

export class Resources {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getIcon(icon: string) {
    return {
      uri: vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        `${icon}.svg`,
      ),
      asWebUri(webView: vscode.Webview) {
        return webView.asWebviewUri(this.uri);
      },
    };
  }

  getWebViewAsset(name: string) {
    const chatWebviewRoot = vscode.Uri.joinPath(
      this.context.extensionUri,
      "out",
      "webview",
      "chat",
    );
    return {
      uri: vscode.Uri.joinPath(chatWebviewRoot, "assets", name),
      asWebUri(webView: vscode.Webview) {
        return webView.asWebviewUri(this.uri);
      },
    };
  }
}
