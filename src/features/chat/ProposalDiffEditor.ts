import * as vscode from "vscode";

const PROPOSAL_SCHEME = "good-buddy-proposal";

export class ProposalDiffEditor implements vscode.Disposable {
  private readonly contents = new Map<string, string>();
  private readonly openDocuments = new Map<string, Set<string>>();
  private readonly completedProposals = new Set<string>();
  private readonly subscriptions: vscode.Disposable[];

  constructor() {
    this.subscriptions = [
      vscode.workspace.registerTextDocumentContentProvider(PROPOSAL_SCHEME, {
        provideTextDocumentContent: (uri) => this.contents.get(uri.toString()) ?? "",
      }),
      vscode.workspace.onDidOpenTextDocument((document) => {
        const proposalId = this.proposalIdForDocument(document.uri);
        if (!proposalId) return;
        const documents = this.openDocuments.get(proposalId) ?? new Set();
        documents.add(document.uri.toString());
        this.openDocuments.set(proposalId, documents);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        const proposalId = this.proposalIdForDocument(document.uri);
        if (!proposalId) return;
        this.openDocuments.get(proposalId)?.delete(document.uri.toString());
        this.cleanup(proposalId);
      }),
    ];
  }

  async open(
    id: string,
    relativePath: string,
    before: string,
    after: string,
  ): Promise<void> {
    const normalizedPath = relativePath
      .replaceAll("\\", "/")
      .replace(/^\/+/, "");
    const beforeUri = this.createUri(id, normalizedPath, "before");
    const afterUri = this.createUri(id, normalizedPath, "after");

    this.contents.set(beforeUri.toString(), before);
    this.contents.set(afterUri.toString(), after);
    this.openDocuments.set(id, new Set());

    try {
      await vscode.commands.executeCommand(
        "vscode.diff",
        beforeUri,
        afterUri,
        `Proposed change: ${relativePath}`,
      );
    } catch (error) {
      this.contents.delete(beforeUri.toString());
      this.contents.delete(afterUri.toString());
      this.openDocuments.delete(id);
      throw error;
    }
  }

  complete(id: string): void {
    this.completedProposals.add(id);
    this.cleanup(id);
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
    this.contents.clear();
    this.openDocuments.clear();
    this.completedProposals.clear();
  }

  private createUri(
    id: string,
    relativePath: string,
    side: "before" | "after",
  ): vscode.Uri {
    return vscode.Uri.from({
      scheme: PROPOSAL_SCHEME,
      path: `/${relativePath}`,
      query: `proposalId=${encodeURIComponent(id)}&side=${side}`,
    });
  }

  private proposalIdForDocument(uri: vscode.Uri): string | undefined {
    if (uri.scheme !== PROPOSAL_SCHEME) return undefined;
    return new URLSearchParams(uri.query).get("proposalId") ?? undefined;
  }

  private cleanup(id: string): void {
    if (
      !this.completedProposals.has(id) ||
      (this.openDocuments.get(id)?.size ?? 0) > 0
    ) {
      return;
    }

    for (const uri of this.contents.keys()) {
      if (this.proposalIdForDocument(vscode.Uri.parse(uri)) === id) {
        this.contents.delete(uri);
      }
    }
    this.openDocuments.delete(id);
    this.completedProposals.delete(id);
  }
}
