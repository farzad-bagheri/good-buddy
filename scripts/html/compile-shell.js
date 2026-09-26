import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

const shells = [
  {
    inputFile: "explain-shell.html",
    outputFile: "../../src/features/explain/shell.ts",
    inject: ["iconUri: string"],
  },
  {
    inputFile: "chat-shell.html",
    outputFile: "../../src/features/chat/shell.ts",
    inject: [
      "cspSource: string",
      "nonce: string",
      "addIconUri: string",
      "sendIconUri: string",
    ],
  },
];

for (const shell of shells) {
  const inputFile = path.join(dir, shell.inputFile);
  const outputFile = path.join(dir, shell.outputFile);
  const injection = shell.inject.join(", ");
  const content = readFileSync(inputFile, "utf8");

  const compiledContent =
    `// Auto-generated from ${inputFile}\n\n` +
    `export const shellHtml = (${injection}) => \`${content}\`;\n`;

  writeFileSync(outputFile, compiledContent, "utf8");

  // eslint-disable-next-line no-undef
  console.log(`Compiled ${inputFile} to ${outputFile}`);
}
