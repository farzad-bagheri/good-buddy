import mermaid from "mermaid";

let nextItemId = 0;
mermaid.initialize({ startOnLoad: false, securityLevel: "strict", darkMode: false });

export function createItemId(): string {
  nextItemId += 1;
  return String(nextItemId);
}

export function sanitizeHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content
    .querySelectorAll("script, style, iframe, object, embed, form")
    .forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (
        name.startsWith("on") ||
        ((name === "href" || name === "src") && /^javascript:/i.test(value))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  return template.innerHTML;
}

export async function renderMermaidDiagrams(html: string): Promise<string> {
  const template = document.createElement("template");
  template.innerHTML = sanitizeHtml(html);
  const diagrams = template.content.querySelectorAll(
    "pre > code.language-mermaid",
  );

  if (diagrams.length === 0) return template.innerHTML;

  for (const [index, code] of [...diagrams].entries()) {
    const block = code.parentElement;
    if (!block) continue;

    try {
      const { svg } = await mermaid.render(
        `good-buddy-mermaid-${crypto.randomUUID()}`,
        code.textContent ?? "",
      );
      const diagram = document.createElement("div");
      diagram.className = "mermaid-diagram";
      const svgTemplate = document.createElement("template");
      svgTemplate.innerHTML = svg;
      diagram.append(svgTemplate.content);
      block.replaceWith(diagram);
    } catch (error) {
      console.error(`Failed to render Mermaid diagram ${index + 1}.`, error);
    }
  }

  return template.innerHTML;
}
