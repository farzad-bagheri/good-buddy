import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

const iconNames = [
  "app",
  "send",
  "back",
  "copy",
  "delete",
  "remove",
  "add",
  "check",
  "history",
  "new-chat",
  "retry",
  "models"
];
const iconClasses = iconNames
  .map(
    (name) => `
    .${name}-icon {
        mask-image: url("\${iconUri("${name}")}");
        -webkit-mask-image: url("\${iconUri("${name}")}");
      }`,
  )
  .join("\n");

const markdownStyles = readFileSync(
  path.join(dir, "../../webview/shared/markdown.css"),
  "utf8",
)
  .replaceAll("\\", "\\\\")
  .replaceAll("`", "\\`")
  .replaceAll("${", "\\${");

const shells = [
  {
    inputFile: "explain-shell.html",
    outputFile: "../../src/features/explain/shell.ts",
    arguments: [],
    inject: [{ markdownStyles: markdownStyles }],
  },
  {
    inputFile: "chat-shell.html",
    outputFile: "../../src/features/chat/shell.ts",
    arguments: [
      "cspSource: string",
      "nonce: string",
      "scriptUri: string",
      "styleUri: string",
      "iconUri: (name: string) => string",
    ],
    inject: [{ iconClasses: iconClasses }],
  },
];

for (const shell of shells) {
  const inputFile = path.join(dir, shell.inputFile);
  const outputFile = path.join(dir, shell.outputFile);
  const args = shell.arguments.join(", ");
  let content = readFileSync(inputFile, "utf8");

  // Inject dynamic content into the HTML template
  for (const injection of shell.inject) {
    for (const key in injection) {
      content = content.replace(`{{${key}}}`, () => injection[key]);
    }
  }

  const compiledContent =
    `// Auto-generated from ${inputFile}\n\n` +
    `export const shellHtml = (${args}) => \`${content}\`;\n`;

  writeFileSync(outputFile, compiledContent, "utf8");

  // eslint-disable-next-line no-undef
  console.log(`Compiled ${inputFile} to ${outputFile}`);
}
