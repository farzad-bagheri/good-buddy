import { useRef, useState } from "react";
import type { AttachmentState } from "../../types";
import { vscode } from "../../vscode";
import { IconButton } from "../IconButton";
import { Attachment } from "./Attachment";
import styles from "./Composer.module.css";

interface ComposerProps {
  attachments: AttachmentState;
  text: string;
  onTextChange: (text: string) => void;
  onSend: () => void;
}

export function Composer({
  attachments,
  text,
  onTextChange,
  onSend,
}: ComposerProps) {
  const [attachmentError, setAttachmentError] = useState("");
  const [pendingImages, setPendingImages] = useState(0);
  const pendingImagesRef = useRef(0);

  const handleRemoveAttachment = (index: number) => () => {
    vscode.postMessage({ type: "wv:removeAttachment", index });
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (files.length === 0) return;

    event.preventDefault();
    setAttachmentError("");
    pendingImagesRef.current += files.length;
    setPendingImages(pendingImagesRef.current);
    for (const file of files) void attachImage(file);
  };

  const attachImage = async (file: File) => {
    try {
      const mimeType = file.type.toLowerCase();
      if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
        setAttachmentError("Paste a PNG, JPEG, or WebP image.");
        return;
      }
      if (file.size === 0 || file.size > 5 * 1024 * 1024) {
        setAttachmentError("Images must be smaller than 5 MB.");
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      vscode.postMessage({
        type: "wv:addImage",
        name: file.name || `Pasted image.${mimeType.split("/")[1]}`,
        mimeType,
        data: btoa(binary),
      });
    } catch {
      setAttachmentError("Could not read the pasted image.");
    } finally {
      pendingImagesRef.current = Math.max(0, pendingImagesRef.current - 1);
      setPendingImages(pendingImagesRef.current);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (pendingImagesRef.current > 0) {
      setAttachmentError("Wait for pasted images to finish attaching.");
      return;
    }
    if (
      !text.trim() &&
      attachments.attached.length === 0 &&
      attachments.images.length === 0
    ) {
      return;
    }
    const message =
      text.trim() ||
      (attachments.images.length > 0
        ? "Please analyze the attached image."
        : "Please inspect the attached files.");
    onSend();
    vscode.postMessage({ type: "wv:send", text: message });
    onTextChange("");
  };

  return (
    <footer className={styles.footer}>
      <div className={styles.attachments}>
        {attachments.activeDocument && (
          <Attachment
            name={attachments.activeDocument.name}
            path={attachments.activeDocument.path}
            removeTitle="Exclude open file from the next message"
            onRemove={() =>
              vscode.postMessage({ type: "wv:excludeActiveDocument" })
            }
          />
        )}
        {attachments.attached.map((item, index) => (
          <Attachment
            key={`${item.name}-${index}`}
            name={item.name}
            path={item.path}
            onRemove={handleRemoveAttachment(index)}
          />
        ))}
        {attachments.images.map((image) => (
          <Attachment
            key={image.id}
            name={image.name}
            path={`Image · ${image.name}`}
            onRemove={() =>
              vscode.postMessage({ type: "wv:removeImage", id: image.id })
            }
          />
        ))}
      </div>
      {attachmentError && (
        <div className={styles.attachmentError} role="alert">
          {attachmentError}
        </div>
      )}

      <div className={styles.composer}>
        <textarea
          rows={2}
          placeholder="Ask Good Buddy... (Enter to send, Shift+Enter for new line)"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />

        <div className={styles.controls}>
          <IconButton
            iconName="add-icon"
            title="Attach text or image files; paste an image to attach it"
            onClick={() => vscode.postMessage({ type: "wv:attachFiles" })}
          />
          <IconButton
            iconName="selection-icon"
            title="Attach the selected code from the active editor"
            onClick={() =>
              vscode.postMessage({ type: "wv:attachSelection" })
            }
          />
          <IconButton
            iconName="git-icon"
            title="Ask Good Buddy to review staged, unstaged, and untracked Git changes"
            onClick={() => {
              onSend();
              vscode.postMessage({ type: "wv:reviewChanges" });
            }}
          />
          <IconButton
            iconName="send-icon"
            title={
              pendingImages > 0
                ? "Wait for pasted images to finish attaching"
                : "Send message"
            }
            onClick={handleSend}
          />
        </div>
      </div>
    </footer>
  );
}
