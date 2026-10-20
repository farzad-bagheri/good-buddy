import { useEffect, useId, useState } from "react";
import type { SvgArtifact as SvgArtifactData } from "../../../types";
import { CopyButton } from "../../CopyButton/CopyButton";
import { IconButton } from "../../IconButton";
import styles from "./SvgArtifact.module.css";

interface SvgArtifactProps {
  artifact: SvgArtifactData;
}

interface PreviewState {
  content?: string;
  url?: string;
  error?: string;
}

export function SvgArtifact({ artifact }: SvgArtifactProps) {
  const previewId = useId();
  const previewTabId = useId();
  const sourceTabId = useId();
  const [tab, setTab] = useState<"preview" | "source">("preview");

  const [preview, setPreview] = useState<PreviewState>({});
  const previewReady = preview.content === artifact.content && !!preview.url;

  useEffect(() => {
    let url: string | undefined;
    try {
      const safeSvg = artifact.content;
      url = URL.createObjectURL(new Blob([safeSvg], { type: "image/svg+xml" }));
      setPreview({ content: artifact.content, url });
    } catch (error) {
      setPreview({
        content: artifact.content,
        error:
          error instanceof Error
            ? error.message
            : "The SVG preview could not be created.",
      });
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [artifact.content]);

  const downloadSvg = () => {
    if (!previewReady || !preview.url) return;
    const anchor = document.createElement("a");
    anchor.href = preview.url;
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
            disabled={!previewReady}
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
          {preview.content === artifact.content && preview.url ? (
            <img src={preview.url} alt={artifact.title} />
          ) : preview.content === artifact.content && preview.error ? (
            <p role="alert">{preview.error} Switch to Source to inspect it.</p>
          ) : (
            <p role="status">Preparing preview...</p>
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
