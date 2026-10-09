import { useEffect, useRef, useState } from "react";
import { insertPromptTemplate, PROMPT_TEMPLATES } from "../../prompts";
import type { AttachmentState } from "../../types";
import { vscode } from "../../vscode";
import { IconButton } from "../IconButton";
import { Attachment } from "./Attachment";
import styles from "./Composer.module.css";

interface ComposerProps {
  attachments: AttachmentState;
  text: string;
  busy: boolean;
  onTextChange: (text: string) => void;
  onSend: () => void;
  onCancel: () => void;
}

export function Composer({
  attachments,
  text,
  busy,
  onTextChange,
  onSend,
  onCancel,
}: ComposerProps) {
  const [attachmentError, setAttachmentError] = useState("");
  const [pendingImages, setPendingImages] = useState(0);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const pendingImagesRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!busy) setCancelPending(false);
    if (busy) setPromptsOpen(false);
  }, [busy]);

  const insertTemplate = (prompt: string) => {
    onTextChange(insertPromptTemplate(text, prompt));
    setPromptsOpen(false);
    textareaRef.current?.focus();
  };

  const reviewChanges = () => {
    if (busy) return;
    setPromptsOpen(false);
    onSend();
    vscode.postMessage({ type: "wv:reviewChanges" });
  };

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
        binary += String.fromCharCode(
          ...bytes.subarray(offset, offset + 0x8000),
        );
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
    if (busy) return;
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
            disabled={busy}
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
            disabled={busy}
            onRemove={handleRemoveAttachment(index)}
          />
        ))}
        {attachments.images.map((image) => (
          <Attachment
            key={image.id}
            name={image.name}
            path={`Image · ${image.name}`}
            disabled={busy}
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

      <div
        className={styles.composer}
        onKeyDown={(event) => {
          if (event.key === "Escape") setPromptsOpen(false);
        }}
      >
        <div className={styles.controls}>
          {" "}
          <div className={styles.promptPicker}>
            <button
              type="button"
              className={styles.promptButton}
              title="Insert a reusable prompt into the composer"
              aria-haspopup="true"
              aria-expanded={promptsOpen}
              aria-controls="good-buddy-prompt-menu"
              disabled={busy}
              onClick={() => setPromptsOpen((open) => !open)}
            >
              Prompts
            </button>
            {promptsOpen && (
              <div
                className={styles.promptMenu}
                id="good-buddy-prompt-menu"
                role="group"
                aria-label="Prompt templates"
              >
                {PROMPT_TEMPLATES.map((template) => (
                  <IconButton
                    type="button"
                    key={template.id}
                    caption={template.label}
                    iconName={template.icon}
                    className={styles.promptMenuItem}
                    disabled={busy}
                    onClick={() => insertTemplate(template.prompt)}
                  />
                ))}
                <IconButton
                  type="button"
                  iconName="git-icon"
                  caption="Review changes"
                  className={styles.promptMenuItem}
                  title="Ask Good Buddy to review staged, unstaged, and untracked Git changes"
                  disabled={busy}
                  onClick={reviewChanges}
                />
              </div>
            )}
          </div>
        </div>
        <textarea
          ref={textareaRef}
          disabled={busy}
          rows={2}
          placeholder="Ask Good Buddy, attach files or paste an image... (Enter to send, Shift+Enter for new line)"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />

        <div className={styles.controls}>
          <IconButton
            iconName="add-icon"
            title="Attach text or image files; paste an image to attach it"
            disabled={busy}
            onClick={() => vscode.postMessage({ type: "wv:attachFiles" })}
          />
          <IconButton
            iconName="selection-icon"
            title="Attach the selected code from the active editor"
            disabled={busy}
            onClick={() => vscode.postMessage({ type: "wv:attachSelection" })}
          />
          {busy ? (
            <IconButton
              caption={cancelPending ? "Stopping..." : "Stop"}
              className={styles.stopButton}
              title={
                cancelPending
                  ? "Waiting for Good Buddy to stop"
                  : "Cancel the current request"
              }
              disabled={cancelPending}
              onClick={() => {
                setCancelPending(true);
                onCancel();
              }}
            />
          ) : (
            <IconButton
              iconName="send-icon"
              title={
                pendingImages > 0
                  ? "Wait for pasted images to finish attaching"
                  : "Send message"
              }
              disabled={pendingImages > 0}
              onClick={handleSend}
            />
          )}
        </div>
      </div>
    </footer>
  );
}
