import { useEffect, useRef, useState } from "react";
import type { AttachmentState, WorkspaceSkill } from "../../types";
import type { VisionSupport } from "../../visionSupport";
import { vscode } from "../../vscode";
import { IconButton } from "../IconButton";
import { Attachment } from "./Attachment";
import { getSlashCommands, getSlashQuery, type SlashCommand } from "./slashCommands";
import styles from "./Composer.module.css";

interface ComposerProps {
  attachments: AttachmentState;
  vision: VisionSupport;
  text: string;
  busy: boolean;
  skills: WorkspaceSkill[];
  skillsTrusted: boolean;
  selectedSkill?: WorkspaceSkill;
  onSelectSkill: (skill: WorkspaceSkill | undefined) => void;
  onTextChange: (text: string) => void;
  onSend: () => void;
  onCancel: () => void;
}

export function Composer({
  attachments,
  vision,
  text,
  busy,
  skills,
  skillsTrusted,
  selectedSkill,
  onSelectSkill,
  onTextChange,
  onSend,
  onCancel,
}: ComposerProps) {
  const [attachmentError, setAttachmentError] = useState("");
  const [pendingImages, setPendingImages] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [activeCommand, setActiveCommand] = useState(0);
  const [cancelPending, setCancelPending] = useState(false);
  const pendingImagesRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!busy) setCancelPending(false);
  }, [busy]);

  const slash = getSlashQuery(text, cursor);
  const commands = slash ? getSlashCommands(skills, slash.query) : [];
  const menuOpen = !busy && !menuDismissed && !!slash;
  const isDisabled = (command: SlashCommand) =>
    command.kind === "prompt" && command.requiresImage === true && vision === "unsupported";
  const activeIndex =
    commands[activeCommand] && !isDisabled(commands[activeCommand])
      ? activeCommand
      : commands.findIndex((command) => !isDisabled(command));

  useEffect(() => {
    if (menuOpen) vscode.postMessage({ type: "wv:listSkills" });
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen && activeIndex >= 0) {
      document.getElementById(`good-buddy-command-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [menuOpen, activeIndex]);

  const reviewChanges = () => {
    if (busy) return;
    onSelectSkill(undefined);
    onSend();
    vscode.postMessage({ type: "wv:reviewChanges" });
  };

  const chooseCommand = (command: SlashCommand) => {
    if (!slash || isDisabled(command)) return;
    const insertion = command.kind === "prompt" ? command.prompt : "";
    const next = text.slice(0, slash.start) + insertion + text.slice(slash.end);
    onTextChange(next);
    const nextCursor = slash.start + insertion.length;
    setCursor(nextCursor);
    setMenuDismissed(true);
    if (command.kind === "skill") onSelectSkill(command.skill);
    if (command.kind === "action") {
      if (command.id === "review-changes") reviewChanges();
      else {
        const type = {
          "attach-files": "wv:attachFiles",
          "attach-selection": "wv:attachSelection",
          "attach-terminal": "wv:attachTerminal",
          "attach-problems": "wv:attachProblems",
        }[command.id];
        if (type) vscode.postMessage({ type });
      }
    }
    textareaRef.current?.focus();
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(nextCursor, nextCursor));
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
    if (menuOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuDismissed(true);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (activeIndex >= 0) {
          const direction = event.key === "ArrowDown" ? 1 : -1;
          let next = activeIndex;
          do {
            next = (next + direction + commands.length) % commands.length;
          } while (next !== activeIndex && isDisabled(commands[next]));
          setActiveCommand(next);
        }
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && activeIndex >= 0) {
        event.preventDefault();
        chooseCommand(commands[activeIndex]);
        return;
      }
    }
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
    vscode.postMessage({ type: "wv:send", text: message, skillId: selectedSkill?.id });
    onTextChange("");
  };

  return (
    <footer className={styles.footer}>
      <div className={styles.attachments}>
        {selectedSkill && (
          <Attachment
            name={`Skill: ${selectedSkill.name}`}
            path={selectedSkill.location}
            removeTitle="Remove selected skill"
            disabled={busy}
            onRemove={() => onSelectSkill(undefined)}
          />
        )}
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
      {attachments.images.length > 0 && vision === "unsupported" && (
        <div className={styles.attachmentError} role="alert">
          The selected model cannot read images. Choose a vision-capable model
          or remove the image.
        </div>
      )}

      <div className={styles.composer}>
        {menuOpen && (
          <div className={styles.promptMenu} id="good-buddy-command-menu" role="listbox" aria-label="Chat commands">
            {commands.map((command, index) => {
              const disabled = isDisabled(command);
              return (
                <button
                  type="button"
                  key={`${command.kind}:${command.id}`}
                  id={`good-buddy-command-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  disabled={disabled}
                  className={styles.promptMenuItem}
                  title={disabled ? "The selected model cannot read images." : command.description}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseCommand(command)}
                >
                  {command.icon && (
                    <span className={`${styles.promptMenuIcon} ${command.icon}`} aria-hidden="true" />
                  )}
                  <span className={styles.promptMenuText}>
                    <span><strong>/{command.kind === "skill" ? command.skill.name : command.id}</strong> · {command.label}</span>
                    <small>{command.kind === "skill" ? "Skill" : command.kind === "prompt" ? "Prompt" : "Action"} · {command.description}</small>
                  </span>
                </button>
              );
            })}
            {!commands.length && <div className={styles.menuNote}>No matching commands.</div>}
            {!skillsTrusted && <div className={styles.menuNote}>Trust this workspace to use its skills.</div>}
          </div>
        )}
        <textarea
          ref={textareaRef}
          disabled={busy}
          rows={2}
          placeholder="Ask Good Buddy or type / for commands... (Enter to send, Shift+Enter for new line)"
          value={text}
          role="combobox"
          aria-label="Chat message"
          aria-autocomplete="list"
          aria-expanded={menuOpen}
          aria-controls="good-buddy-command-menu"
          aria-activedescendant={menuOpen && activeIndex >= 0 ? `good-buddy-command-${activeIndex}` : undefined}
          onChange={(event) => {
            onTextChange(event.target.value);
            setCursor(event.target.selectionStart);
            setMenuDismissed(false);
            setActiveCommand(0);
          }}
          onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />

        <div className={styles.toolbar}>
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
            <IconButton
              iconName="commands-icon"
              title="Open chat commands"
              disabled={busy}
              onClick={() => {
                const position = textareaRef.current?.selectionStart ?? text.length;
                const prefix = position > 0 && !/\s/.test(text[position - 1]) ? " " : "";
                const next = `${text.slice(0, position)}${prefix}/${text.slice(position)}`;
                const nextCursor = position + prefix.length + 1;
                onTextChange(next);
                setCursor(nextCursor);
                setMenuDismissed(false);
                setActiveCommand(0);
                textareaRef.current?.focus();
                requestAnimationFrame(() => textareaRef.current?.setSelectionRange(nextCursor, nextCursor));
              }}
            />
          </div>
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
