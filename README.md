# Good Buddy

Good Buddy is a VS Code extension that uses a local [Ollama](https://ollama.com/) server for inline code completions, a chat view, and selected-code explanations.

## Project layout

- `src/extension.ts` registers VS Code commands and providers.
- `src/config.ts` is the single place that reads extension settings.
- `src/features/chat/` contains the chat webview and its lifecycle.
- `src/features/completion/` contains inline-completion behavior.
- `src/features/explain/` contains selected-code explanation behavior.
- `src/ollama/` is the isolated HTTP client and API types.
- `out/` is generated JavaScript. Do not edit it directly.

## Develop

1. Install dependencies with `npm install`.
2. Start Ollama and ensure the configured models are available.
3. Run `npm run watch`, then launch **Run Good Buddy Extension** from VS Code.

Run `npm run check` before committing. It type-checks and builds the extension.

## Troubleshooting chat

The chat view reports the response body when Ollama returns malformed JSON rather than presenting an opaque parse error. Check the **Good Buddy** output channel for model-listing failures, and verify `goodBuddy.endpoint` points to the Ollama server (normally `http://localhost:11434`).

## Workspace tools

Ask the chat to inspect the project, read a file, make a change, or run a command. Every request begins with the opened workspace path and a compact project tree, so the model has project context before it chooses a tool. It can list the project tree and read workspace files directly. For small changes it uses an exact `replace_in_file` edit; full-file writes are also supported. Both appear as an in-chat unified diff with **Approve** and **Reject** controls, and approval checks that the file has not changed since the proposal was generated. Shell commands retain a VS Code confirmation dialog. Tool paths are limited to the opened workspace, command output is capped, and an agent request can use at most five tools.

Use **Attach** in the chat footer to add up to five text files (80 KB each) to the next message. Selected filenames appear beneath the composer. Attachments are sent only with that next message and are then cleared; binary and oversized files are not attached.
