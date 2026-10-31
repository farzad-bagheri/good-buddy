import { useEffect, useId, useState } from "react";
import type { MermaidArtifact as MermaidArtifactData } from "../../../types";
import { CopyButton } from "../../CopyButton/CopyButton";
import { IconButton } from "../../IconButton";
import styles from "./MermaidArtifact.module.css";

interface MermaidArtifactProps {
  artifact: MermaidArtifactData;
}

interface RenderState {
  source?: string;
  svg?: string;
  error?: string;
}

let mermaidInitialized = false;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.25;

export function MermaidArtifact({ artifact }: MermaidArtifactProps) {
  const previewId = useId();
  const previewTabId = useId();
  const sourceTabId = useId();
  const renderId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [tab, setTab] = useState<"preview" | "source">("preview");
  const [rendered, setRendered] = useState<RenderState>({});
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    void import("mermaid")
      .then(async ({ default: mermaid }) => {
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "base",
            themeVariables: mermaidThemeVariables(),
            themeCSS: mermaidThemeCss(),
            flowchart: { htmlLabels: false, useMaxWidth: true },
          });
          mermaidInitialized = true;
        }
        return mermaid.render(
          `good-buddy-mermaid-${renderId}`,
          artifact.content,
        );
      })
      .then(({ svg }) => {
        if (!cancelled) {
          setRendered({ source: artifact.content, svg: withStyleNonce(svg) });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRendered({
            source: artifact.content,
            error:
              error instanceof Error
                ? error.message
                : "The Mermaid diagram could not be rendered.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [artifact.content, renderId]);

  useEffect(() => setZoom(1), [artifact.content]);

  const downloadSource = () => {
    const url = URL.createObjectURL(
      new Blob([artifact.content], { type: "text/plain" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${artifact.title.replace(/[^a-zA-Z0-9_-]+/g, "-") || "diagram"}.mmd`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      className={styles.artifact}
      aria-label={`Mermaid artifact: ${artifact.title}`}
    >
      <header className={styles.header}>
        <div className={styles.label}>
          <strong>{artifact.title}</strong>
          <span>Mermaid</span>
        </div>
        <div
          className={styles.actions}
          role="tablist"
          aria-label="Mermaid artifact views"
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
          {tab === "preview" && (
            <>
              <IconButton
                iconName="zoom-out-icon"
                title="Zoom out"
                disabled={zoom <= MIN_ZOOM}
                onClick={() =>
                  setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))
                }
              />
              <IconButton
                iconName="zoom-reset-icon"
                title="Reset zoom"
                disabled={zoom === 1}
                onClick={() => setZoom(1)}
              />
              <IconButton
                iconName="zoom-in-icon"
                title="Zoom in"
                disabled={zoom >= MAX_ZOOM}
                onClick={() =>
                  setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))
                }
              />
            </>
          )}
          <CopyButton text={artifact.content} />
          <IconButton
            type="button"
            iconName="download-icon"
            title="Download Mermaid source"
            onClick={downloadSource}
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
          {rendered.source !== artifact.content ? (
            <p role="status">Preparing preview...</p>
          ) : rendered.svg ? (
            <div
              className={styles.diagram}
              style={{ transform: `scale(${zoom})` }}
              dangerouslySetInnerHTML={{ __html: rendered.svg }}
            />
          ) : (
            <p role="alert">
              {rendered.error ?? "The Mermaid diagram could not be rendered."}{" "}
              Switch to Source to inspect it.
            </p>
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

function withStyleNonce(svg: string): string {
  const nonce = document.body.dataset.styleNonce;
  if (!nonce) return svg;
  return svg.replace(/<style(?=[\s>])/gi, `<style nonce="${nonce}"`);
}

function mermaidThemeVariables(): Record<string, string> {
  const styles = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  const background = color("--vscode-editor-background", "#1e1e1e");
  const foreground = color("--vscode-foreground", "#cccccc");
  const border = color("--vscode-editorWidget-border", "#454545");
  const accent = color("--vscode-focusBorder", "#3794ff");
  const muted = color("--vscode-descriptionForeground", "#9d9d9d");

  return {
    background,
    primaryColor: color("--vscode-input-background", "#3c3c3c"),
    primaryTextColor: foreground,
    primaryBorderColor: accent,
    secondaryColor: color("--vscode-textCodeBlock-background", "#252526"),
    secondaryTextColor: foreground,
    secondaryBorderColor: border,
    tertiaryColor: background,
    tertiaryTextColor: foreground,
    tertiaryBorderColor: border,
    lineColor: muted,
    defaultLinkColor: muted,
    edgeLabelBackground: background,
    clusterBkg: background,
    clusterBorder: border,
    titleColor: foreground,
    nodeBorder: accent,
    fontFamily: color("--vscode-font-family", "sans-serif"),
  };
}

function mermaidThemeCss(): string {
  const styles = getComputedStyle(document.documentElement);
  const color = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  const node = color("--vscode-input-background", "#3c3c3c");
  const foreground = color("--vscode-foreground", "#cccccc");
  const accent = color("--vscode-focusBorder", "#3794ff");
  const edge = color("--vscode-descriptionForeground", "#9d9d9d");
  const background = color("--vscode-editor-background", "#1e1e1e");

  return `
    .node rect, .node circle, .node ellipse, .node polygon, .node path { fill: ${node} !important; stroke: ${accent} !important; }
    .node .label, .nodeLabel, .label text, .label foreignObject { color: ${foreground} !important; fill: ${foreground} !important; }
    .edgeLabel { background-color: ${background} !important; color: ${foreground} !important; }
    .edgeLabel span, .edgeLabel p { color: ${foreground} !important; }
    .flowchart-link, .edgePath .path { stroke: ${edge} !important; }
    marker path { fill: ${edge} !important; stroke: ${edge} !important; }
  `;
}
