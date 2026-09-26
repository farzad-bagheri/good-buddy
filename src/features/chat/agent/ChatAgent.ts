import { ChatMessage, GoodBuddyProvider } from "@/provider";
import { MAX_CHAT_STEPS } from "../constants";
import { ToolRegistry, WorkspaceTools } from "../tools";
import { ToolCall } from "../types";
import {
  agentInstructions,
  assistantResponseFormat,
  formatError,
  parseAssistantEnvelope,
} from "../utils";

export interface ChatAgentResult {
  response: string;
  title?: string;
}

export interface ChatAgentEvents {
  /** Event triggered when the status of a tool call changes. */
  onToolStatus(tool: ToolCall): void;
  /** Event triggered when the model's status changes (e.g., when it starts or stops processing a request). */
  onModelStatus(waiting: boolean, signal: AbortSignal): void;
}

export class ChatAgent {
  constructor(
    private readonly provider: GoodBuddyProvider,
    private readonly output: { appendLine(value: string): void },
    private readonly workspaceTools: WorkspaceTools,
    private readonly tools: ToolRegistry,
    private readonly events: ChatAgentEvents,
  ) {}

  async run(
    history: ChatMessage[],
    model: string,
    signal: AbortSignal,
  ): Promise<ChatAgentResult> {
    const availableTools = this.tools.list();
    const requestTitle = !history.some(({ role }) => role === "assistant");
    const messages: ChatMessage[] = [
      agentInstructions(
        await this.workspaceTools.projectContext(),
        availableTools,
        requestTitle,
      ),
      ...history.map(({ role, content }) => ({ role, content })),
    ];
    let title: string | undefined;

    for (let step = 0; step < MAX_CHAT_STEPS; step++) {
      // Notify the webview that the model is processing a request.
      this.events.onModelStatus(true, signal);
      let response: string;
      try {
        response = await this.provider.chat(
          {
            model,
            messages,
            format: assistantResponseFormat(availableTools, requestTitle),
          },
          signal,
        );
      } finally {
        this.events.onModelStatus(false, signal);
      }

      // Log the agent's response for debugging purposes.
      this.output.appendLine(`[agent response] ${response.slice(0, 2_000)}`); // Log the first 2,000 characters of the agent's response

      const envelope = parseAssistantEnvelope(response, availableTools);
      title ??= envelope.title;
      if (envelope.type === "final") {
        return { response: envelope.response, title };
      }
      const toolCall = envelope.tool;

      // Notify the webview that a tool call is about to be executed.
      this.events.onToolStatus(toolCall);
      let result: string;
      try {
        // Execute the tool call and capture its result (it may propose approval or perform the action)
        result = await this.tools.execute(toolCall);
      } catch (error) {
        result = `Tool error: ${formatError(error)}`;
      }

      // Append the agent's response and the tool result to the message history for the next iteration.
      messages.push({ role: "assistant", content: response });
      messages.push({
        role: "user",
        content: `Tool result for ${toolCall.tool}:\n${result}\nNow answer the original request.`,
      });
    }

    // If the loop completes without returning, it means the agent reached the maximum number of tool calls.
    return {
      response: `I stopped after ${MAX_CHAT_STEPS} tool calls. Please narrow the request and try again.`,
      title,
    };
  }
}
