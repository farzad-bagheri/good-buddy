# Good Buddy

Good Buddy is a VS Code extension that uses local [Ollama](https://ollama.com/) or OpenAI-compatible model servers for inline code completions, a chat view, and selected-code explanations.

![hero](./docs/images/hero.png)

## Features

- 💻 Inline code completions using a local Ollama or OpenAI-compatible server.
- 🗨️ Chat view for interactive discussions and explanations.
- 🧩 Selected-code explanations to understand complex code snippets.

## Usage

Once installed and configured, you can:
- Trigger inline completions by typing in the editor.
- Open the chat view via the **Good Buddy: Open Chat** command.
- Request explanations for selected code using the **Good Buddy: Explain Selection** command.

## Contributing

Contributions are welcome! Please open issues or submit pull requests on the [GitHub repository](https://github.com/farzad-bagheri/good-buddy).

## Installation

Good Buddy defaults to the OpenAI-compatible provider, which can talk to servers such as LM Studio, llama.cpp, and Open WebUI. [Ollama](https://ollama.com/) is also supported. The extension does not require a cloud API.

1. Choose and start a supported model server:
   - For Ollama, [install Ollama](https://ollama.com/download) and make sure it's running (`ollama serve`, or the desktop app's background service).
   - For an OpenAI-compatible server such as LM Studio, llama.cpp, or Open WebUI, enable its OpenAI-compatible API.
2. Make at least one model available to the server. For Ollama, pull models such as:

   ```sh
   ollama pull qwen2.5-coder:7b
   ollama pull qwen3:8b
   ```

3. Install/enable the Good Buddy extension in VS Code, then open **Settings** and configure it under **Good Buddy** (search `goodBuddy`):
   - `goodBuddy.provider` — defaults to `openai-compatible`; choose `ollama` to use Ollama instead.
   - `goodBuddy.endpoint` — Ollama server URL. Defaults to `http://localhost:11434`.
   - `goodBuddy.openAICompatibleEndpoint` — OpenAI-compatible API base URL, including `/v1` when required. Defaults to LM Studio's `http://localhost:1234/v1`.
   - `goodBuddy.openAICompatibleApiKey` — optional authentication key for servers that require API-key authentication.
   - Choose the chat and inline-completion models from the models reported by the configured server in the chat setup notice. Choices are saved independently for each provider and endpoint.
   - `goodBuddy.inlineCompletionsEnabled` — toggle ghost-text completions on/off (also available via the **Good Buddy: Toggle Inline Completions** command).
   - `goodBuddy.maxContextLines` — how many lines of surrounding code to send with each completion request.
   - `goodBuddy.completionTimeoutMs` — how long to wait for a completion before giving up; raise this if you use a larger model or have slower hardware.

   When changing provider or endpoint, Good Buddy loads that connection's saved model selections. If either choice is missing or unavailable, the setup notice lets you choose a model from the server's current list. `goodBuddy.chatModel` and `goodBuddy.completionModel` are legacy Ollama fallback settings; new setups do not preselect Ollama models.

For an OpenAI-compatible server, choose model IDs returned by its `/models` endpoint in the setup notice. The server must support `/chat/completions`; chat uses JSON response formats for the assistant's structured tool protocol. Inline completion requests are sent as user prompts to the chat-completions endpoint, so model behavior can differ from Ollama's native fill-in-the-middle endpoint.

### Ollama model suggestions

If using Ollama, pick models sized for your hardware; smaller models respond faster and are a better fit for inline completions where latency matters. Select the downloaded model IDs in the chat setup notice.

**Completion** — code-focused models are recommended:

- [`qwen2.5-coder:7b`](https://ollama.com/library/qwen2.5-coder) — good balance of speed and quality, recommended default.
- [`qwen2.5-coder:1.5b`](https://ollama.com/library/qwen2.5-coder) — fastest option, best for low-resource machines.
- [`codellama:7b-code`](https://ollama.com/library/codellama) — alternative code-focused model.

**Chat / explanations**:

- [`qwen3:8b`](https://ollama.com/library/qwen3) — matches the extension's default, good general-purpose reasoning.
- [`llama3.1:8b`](https://ollama.com/library/llama3.1) — widely used general-purpose alternative.
- [`deepseek-r1:7b`](https://ollama.com/library/deepseek-r1) — stronger reasoning if you don't mind slower responses.

Browse the full catalog at [ollama.com/library](https://ollama.com/library) for other sizes/quantizations that fit your hardware.

## Project layout

- `src/extension.ts` registers VS Code commands and providers.
- `src/config.ts` is the single place that reads extension settings.
- `src/features/chat/` contains the chat webview and its lifecycle.
- `src/features/completion/` contains inline-completion behavior.
- `src/features/explain/` contains selected-code explanation behavior.
- `src/provider/` contains the provider abstraction and Ollama/OpenAI-compatible implementations.
- `src/gateway/` contains the HTTP request helpers.
- `out/` is generated JavaScript. Do not edit it directly.

## Develop

1. Install dependencies with `pnpm install`.
2. Start your configured model server and ensure the configured models are available.
3. Run `pnpm run watch`, then launch **Run Good Buddy Extension** from VS Code.

Run `pnpm run check` and `pnpm run lint` before committing. Use `pnpm run build` to create a production bundle.

## Testing

This project now includes a Vitest-based unit-test setup for fast validation and coverage reports.

- Run unit tests with `pnpm test`
- Re-run automatically while editing with `pnpm test:watch`
- Generate a coverage report with `pnpm coverage`

The test suite uses mocked fetch responses for provider HTTP calls so you can verify request/response handling without a live model server.

## License

Good Buddy is available under the [MIT License](LICENSE). You may use it for
personal or commercial purposes, modify it, and redistribute it, subject to
the license terms.

Attribution or citation is appreciated but not required. If Good Buddy is
useful in your research, software, or commercial work, you can use the
metadata in [CITATION.cff](CITATION.cff) or cite it as **Good Buddy** by the
Good Buddy contributors.

## Troubleshooting chat

The chat view reports the response body when a provider returns malformed JSON rather than presenting an opaque parse error. Check the **Good Buddy** output channel for model-listing failures, and verify the endpoint setting for the selected provider.

## Workspace tools

Ask the chat to inspect the project, read a file, make a change, or run a command. Every request begins with the opened workspace path and a compact project tree, so the model has project context before it chooses a tool. It can list the project tree and read workspace files directly. For small changes it uses an exact `replace_in_file` edit; full-file writes are also supported. Both appear as an in-chat unified diff with **Approve** and **Reject** controls, and approval checks that the file has not changed since the proposal was generated. Shell commands retain a VS Code confirmation dialog. Tool paths are limited to the opened workspace, command output is capped, and an agent request can use at most five tools.

Use **Attach** in the chat footer to add up to five text files (80 KB each) to the next message. Selected filenames appear beneath the composer. Attachments are sent only with that next message and are then cleared; binary and oversized files are not attached.
