import {
  ChatMessage,
  ResponseExtras,
  GoodBuddyProvider,
  ProviderModel,
  createEmptyResponseExtras,
} from "@/provider";
import { stripThinking } from "@/provider/ollama/utils";
import {
  MAX_AGENT_TOOL_RESULT_LENGTH,
  MAX_CHAT_STEPS,
  MAX_RESPONSE_RETRIES,
} from "../constants";
import { ToolRegistry, WorkspaceTools } from "../tools";
import { ToolCall } from "../types";
import {
  agentInstructions,
  assistantResponseFormat,
  extractJsonStringFieldPrefix,
  formatError,
  parseAssistantEnvelope,
  type AssistantEnvelope,
} from "../utils";

export interface ChatAgentResult {
  response: string;
  title?: string;
  extras: ResponseExtras;
}

export interface ChatAgentEvents {
  /** Event triggered when the status of a tool call changes. */
  onToolStatus(tool: ToolCall): void;
  /** Event triggered when the model's status changes (e.g., when it starts or stops processing a request). */
  onModelStatus(waiting: boolean, signal: AbortSignal): void;
  /** Event triggered when the assistant's user-facing response changes while streaming. */
  onAssistantResponse?(text: string, signal: AbortSignal): void;
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
    providerModel: ProviderModel | null,
    signal: AbortSignal,
    isRetry = false,
  ): Promise<ChatAgentResult> {
    if (!providerModel) {
      throw new Error("No model selected");
    }

    const availableTools = this.tools.list();
    const requestTitle = !history.some(({ role }) => role === "assistant");
    const messages: ChatMessage[] = [
      agentInstructions(
        providerModel,
        await this.workspaceTools.projectContext(),
        availableTools,
        requestTitle,
        isRetry,
      ),
      ...history.map(({ role, content, images, extras }) => ({
        role,
        content:
          role === "assistant" && extras?.artifacts.length
            ? `${content}\n\n${extras.artifacts
                .map(
                  (artifact) =>
                    `[${artifact.type === "svg" ? "SVG" : "Code"} artifact: ${artifact.title} (${artifact.language})]\n${artifact.content}`,
                )
                .join("\n\n")}`
            : content,
        images,
      })),
    ];
    let title: string | undefined;
    let responseRetries = 0;
    let titleRequired = requestTitle;

    for (let step = 0; step < MAX_CHAT_STEPS; step++) {
      // Notify the webview that the model is processing a request.
      this.events.onModelStatus(true, signal);
      let response = "";
      let finishReason: string | undefined;
      let streamedResponse = "";
      try {
        const result = await this.provider.chatStreamWithMetadata(
          {
            model: providerModel.model,
            messages,
            format: assistantResponseFormat(availableTools, titleRequired),
          },
          (chunk) => {
            response += chunk;
            const partialResponse = extractJsonStringFieldPrefix(
              response,
              "response",
            );
            if (partialResponse === undefined) return;
            const visibleResponse = stripThinking(partialResponse);
            if (visibleResponse === streamedResponse) return;
            streamedResponse = visibleResponse;
            this.events.onAssistantResponse?.(visibleResponse, signal);
          },
          signal,
        );
        response = result.content;
        finishReason = result.finishReason;
        const finalResponse = extractJsonStringFieldPrefix(
          response,
          "response",
        );
        if (finalResponse !== undefined) {
          streamedResponse = stripThinking(finalResponse);
        }
      } finally {
        this.events.onModelStatus(false, signal);
      }

      // Log the agent's response for debugging purposes.
      this.output.appendLine(`[agent response] ${response.slice(0, 2_000)}`); // Log the first 2,000 characters of the agent's response

      let envelope: AssistantEnvelope | undefined;
      let invalidReason: string | undefined;
      let outputLimitReached = false;
      if (finishReason === "length") {
        outputLimitReached = true;
        invalidReason =
          "The provider reached its output token limit. Reply concisely with no more than five bullet points, and set extras.suggestions, extras.files, and extras.artifacts to empty arrays.";
      } else {
        try {
          envelope = parseAssistantEnvelope(
            response,
            availableTools,
            titleRequired,
          );
        } catch (error) {
          invalidReason = formatError(error);
        }
      }

      if (invalidReason) {
        this.output.appendLine(`[invalid assistant response] ${invalidReason}`);
        if (streamedResponse) {
          streamedResponse = "";
          this.events.onAssistantResponse?.("", signal);
        }
        if (responseRetries >= MAX_RESPONSE_RETRIES) {
          return {
            response: outputLimitReached
              ? "The model stopped mid-response because it reached its output token limit. Try asking for a shorter answer or increase the response token limit in your model server."
              : "I couldn't get a valid response after asking the model to correct its format. Please try again.",
            title,
              extras: createEmptyResponseExtras(),
          };
        }
        responseRetries++;
        if (!outputLimitReached) {
          messages.push({ role: "assistant", content: response });
        }
        messages.push({
          role: "system",
          content: `Your previous response could not be used: ${invalidReason} Follow the required response schema and return one complete JSON object only.`,
        });
        continue;
      }

      responseRetries = 0;
      titleRequired = false;
      if (!envelope) throw new Error("The assistant response was not parsed.");
      title ??= envelope.title;
      if (envelope.type === "final") {
        if (streamedResponse !== envelope.response) {
          this.events.onAssistantResponse?.(envelope.response, signal);
        }
        return {
          response: envelope.response,
          title,
          extras: envelope.extras,
        };
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
      if (result.length > MAX_AGENT_TOOL_RESULT_LENGTH) {
        result = `${result.slice(0, MAX_AGENT_TOOL_RESULT_LENGTH)}\n[Tool result truncated to ${MAX_AGENT_TOOL_RESULT_LENGTH} characters.]`;
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
      response: `I stopped after ${MAX_CHAT_STEPS} assistant steps. Please narrow the request and try again.`,
      title,
      extras: createEmptyResponseExtras(),
    };
  }
}
