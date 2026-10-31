import { useId, useState } from "react";
import type { SvgArtifact as SvgArtifactData } from "../../../types";
import { CopyButton } from "../../CopyButton/CopyButton";
import { IconButton } from "../../IconButton";
import styles from "./SvgArtifact.module.css";

interface SvgArtifactProps {
  artifact: SvgArtifactData;
}

export function SvgArtifact({ artifact }: SvgArtifactProps) {
  const previewId = useId();
  const previewTabId = useId();
  const sourceTabId = useId();
  const [tab, setTab] = useState<"preview" | "source">("preview");

  const previewUrl = svgDataUrl(artifact.content);

  const downloadSvg = () => {
    if (!previewUrl) return;
    const anchor = document.createElement("a");
    anchor.href = previewUrl;
    const safeTitle =
      artifact.title.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") ||
      "artifact";
    anchor.download = `${safeTitle}.svg`;
    anchor.click();
  };

  return (
    <section
      className={styles.artifact}
      aria-label={`SVG artifact: ${artifact.title}`}
    >
      <header className={styles.header}>
        <div className={styles.label}>
          <strong>{artifact.title}</strong>
          <span>SVG</span>
        </div>
        <div
          className={styles.actions}
          role="tablist"
          aria-label="SVG artifact views"
        >
          <IconButton
            type="button"
            role="tab"
            id={previewTabId}
            iconName="svg-icon"
            title="Preview"
            aria-controls={previewId}
            aria-selected={tab === "preview"}
            onClick={() => setTab("preview")}
          />
          <IconButton
            type="button"
            role="tab"
            id={sourceTabId}
            iconName="code-icon"
            title="Source"
            aria-controls={sourceTabId}
            aria-selected={tab === "source"}
            onClick={() => setTab("source")}
          />
          <CopyButton text={artifact.content} />
          <IconButton
            type="button"
            iconName="download-icon"
            title="Download SVG"
            onClick={downloadSvg}
            disabled={!previewUrl}
          />
        </div>
      </header>
      {tab === "preview" ? (
        <div
          id={previewId}
          className={styles.preview}
          role="tabpanel"
          aria-labelledby={previewTabId}
        >
          {previewUrl ? (
            <img src={previewUrl} alt={artifact.title} />
          ) : (
            <p role="alert">The SVG preview could not be created. Switch to Source to inspect it.</p>
          )}
        </div>
      ) : (
        <pre
          id={sourceTabId}
          className={styles.source}
          role="tabpanel"
          aria-labelledby={sourceTabId}
        >
          <code>{artifact.content}</code>
        </pre>
      )}
    </section>
  );
}

function svgDataUrl(svg: string): string | undefined {
  try {
    const bytes = new TextEncoder().encode(svg);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:image/svg+xml;base64,${btoa(binary)}`;
  } catch {
    return undefined;
  }
}
