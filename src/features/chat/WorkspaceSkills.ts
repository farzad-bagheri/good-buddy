import * as vscode from "vscode";

const MAX_SKILL_BYTES = 64 * 1024;
const SKILL_PATTERNS = [".github/skills/*/SKILL.md", ".agents/skills/*/SKILL.md"];

export interface WorkspaceSkill {
  id: string;
  name: string;
  description: string;
  location: string;
}

export function parseSkill(content: string): { name: string; description: string; instructions: string } {
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/.exec(content);
  if (!match) throw new Error("Expected YAML frontmatter and instructions.");
  const readField = (field: string) => {
    const line = match[1].split(/\r?\n/).find((value) => value.startsWith(`${field}:`));
    const value = line?.slice(field.length + 1).trim() ?? "";
    return value.replace(/^(['"])(.*)\1$/, "$2").trim();
  };
  const name = readField("name");
  const description = readField("description");
  const instructions = match[2].trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || !description || !instructions) {
    throw new Error("A skill needs a lowercase kebab-case name, a single-line description, and instructions.");
  }
  return { name, description, instructions };
}

export class WorkspaceSkills {
  private readonly discovered = new Map<string, vscode.Uri>();

  constructor(private readonly output: { appendLine(value: string): void }) {}

  async list(): Promise<WorkspaceSkill[]> {
    if (!vscode.workspace.isTrusted) {
      this.discovered.clear();
      return [];
    }
    const skills: WorkspaceSkill[] = [];
    const discovered = new Map<string, vscode.Uri>();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      for (const pattern of SKILL_PATTERNS) {
        const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, pattern));
        for (const uri of files) {
          try {
            const skill = await this.read(uri);
            const id = uri.toString();
            discovered.set(id, uri);
            skills.push({
              id,
              name: skill.name,
              description: skill.description,
              location: `${folder.name}: ${vscode.workspace.asRelativePath(uri, false)}`,
            });
          } catch (error) {
            this.output.appendLine(`[skill error] ${uri.toString()}: ${String(error)}`);
            void vscode.window.showWarningMessage(`Good Buddy could not load skill ${uri.toString()}: ${String(error)}`);
          }
        }
      }
    }
    this.discovered.clear();
    for (const [id, uri] of discovered) this.discovered.set(id, uri);
    return skills.sort((a, b) => a.name.localeCompare(b.name) || a.location.localeCompare(b.location));
  }

  async load(id: string): Promise<{ name: string; instructions: string }> {
    if (!vscode.workspace.isTrusted) throw new Error("Workspace trust is required to use workspace skills.");
    const uri = this.discovered.get(id);
    if (!uri || !vscode.workspace.getWorkspaceFolder(uri)) {
      throw new Error("The selected skill is no longer available. Open the command menu to refresh skills.");
    }
    return this.read(uri);
  }

  private async read(uri: vscode.Uri) {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (!folder) throw new Error("Skill is not in an open workspace.");
    const relative = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
    if (!/^(?:\.github|\.agents)\/skills\/[^/]+\/SKILL\.md$/.test(relative)) {
      throw new Error("Invalid skill location.");
    }
    let current = folder.uri;
    for (const segment of relative.split("/")) {
      current = vscode.Uri.joinPath(current, segment);
      const stat = await vscode.workspace.fs.stat(current);
      if (stat.type & vscode.FileType.SymbolicLink) throw new Error("Symbolic links are not supported for skills.");
      if (current.toString() === uri.toString() && stat.size > MAX_SKILL_BYTES) {
        throw new Error("Skill exceeds the 64 KB size limit.");
      }
    }
    const bytes = await vscode.workspace.fs.readFile(uri);
    if (bytes.byteLength > MAX_SKILL_BYTES) throw new Error("Skill exceeds the 64 KB size limit.");
    return parseSkill(Buffer.from(bytes).toString("utf8"));
  }
}
