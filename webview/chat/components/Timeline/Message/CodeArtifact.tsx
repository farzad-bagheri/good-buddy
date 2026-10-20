import { useId } from "react";
import type { CodeArtifact as CodeArtifactData } from "../../../types";
import { CopyButton } from "../../CopyButton/CopyButton";
import styles from "./CodeArtifact.module.css";

interface CodeArtifactProps {
  artifact: CodeArtifactData;
}

export function CodeArtifact({ artifact }: CodeArtifactProps) {
  const codeId = useId();

  return (
    <section
      className={styles.artifact}
      aria-label={`Code artifact: ${artifact.title}`}
    >
      <header className={styles.header}>
        <div className={styles.label}>
          <strong>{artifact.title}</strong>
          <span>{artifact.language}</span>
        </div>
        <div className={styles.actions}>
          <CopyButton text={artifact.content} />
        </div>
      </header>
      <pre id={codeId} className={styles.code}>
        <code>{artifact.content}</code>
      </pre>
    </section>
  );
}
