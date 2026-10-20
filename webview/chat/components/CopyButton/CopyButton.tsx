import { useState } from "react";
import { IconButton } from "../IconButton";

export interface CopyButtonProps {
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  const copyContent = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    setTimeout(() => setCopyState("idle"), 2000);
  };

  const copyButtonProps = {
    idle: ["copy-icon", "Copy"],
    copied: ["check-icon", "Copied"],
    error: ["error-icon", "Copy failed"],
  }[copyState];

  return (
    <IconButton
      iconName={copyButtonProps[0]}
      title={copyButtonProps[1]}
      onClick={() => void copyContent()}
    />
  );
}
