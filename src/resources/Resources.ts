import * as vscode from "vscode";

export type IconName = "add" | "send" | "icon";

export class Resources {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getIcon(icon: IconName) {
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
