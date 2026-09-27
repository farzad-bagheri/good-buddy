import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

const iconNames = ["app", "send", "back", "delete", "add", "history", "new-chat"];
const iconClasses = iconNames
  .map(
    (name) => `
    .${name}-icon {
        mask-image: url("\${iconUri("${name}")}");
        -webkit-mask-image: url("\${iconUri("${name}")}");
      }`,
  )
  .join("\n");

const shells = [
  {
    inputFile: "explain-shell.html",
    outputFile: "../../src/features/explain/shell.ts",
    arguments: ["iconUri: (name: string) => string"],
    inject: [],
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
      content = content.replace(`{{${key}}}`, injection[key]);
    }
  }

  const compiledContent =
    `// Auto-generated from ${inputFile}\n\n` +
    `export const shellHtml = (${args}) => \`${content}\`;\n`;

  writeFileSync(outputFile, compiledContent, "utf8");

  // eslint-disable-next-line no-undef
  console.log(`Compiled ${inputFile} to ${outputFile}`);
}
