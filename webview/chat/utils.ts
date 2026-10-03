let nextItemId = 0;

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
