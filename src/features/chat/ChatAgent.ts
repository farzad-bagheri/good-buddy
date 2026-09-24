import { ChatMessage, GoodBuddyProvider } from "@/provider";
import { ToolCall } from "./types";
import { ToolRegistry } from "./tools";
import { agentInstructions, formatError, parseToolCall } from "./utils";
import { WorkspaceTools } from "./tools/WorkspaceTools";

export interface ChatAgentEvents {
  onToolStatus(tool: ToolCall): void;
}

const MAX_STEPS = 6;

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
  ): Promise<string> {
    const messages: ChatMessage[] = [
      agentInstructions(
        await this.workspaceTools.projectContext(),
        this.tools.list(),
      ),
      ...history,
    ];

    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await this.provider.chat({ model, messages }, signal);
      this.output.appendLine(`[agent response] ${response.slice(0, 2_000)}`);
      const toolCall = parseToolCall(response);

      if (!toolCall) return response;

      this.events.onToolStatus(toolCall);
      let result: string;
      try {
        result = await this.tools.execute(toolCall);
      } catch (error) {
        result = `Tool error: ${formatError(error)}`;
      }
      messages.push({ role: "assistant", content: response });
      messages.push({
        role: "user",
        content: `Tool result for ${toolCall.tool}:\n${result}\nNow answer the original request.`,
      });
    }

    return "I stopped after five tool calls. Please narrow the request and try again.";
  }
}
