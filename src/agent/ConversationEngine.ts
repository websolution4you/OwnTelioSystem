import { callLogger } from '../shared/logger.js';
import type { ConversationMessage, LlmProvider } from '../voice/contracts.js';
import { bookingToolDefinitions, BookingToolExecutor } from './tools/bookingTools.js';

export class ConversationEngine {
  private readonly history: ConversationMessage[];
  private activeTurn: AbortController | null = null;

  constructor(
    private readonly callId: string,
    systemPrompt: string,
    private readonly llm: LlmProvider,
    private readonly tools = new BookingToolExecutor(),
  ) {
    this.history = [{ role: 'system', content: systemPrompt }];
  }

  cancelActiveTurn(): void {
    this.activeTurn?.abort();
    this.activeTurn = null;
  }

  async processUserText(text: string): Promise<string> {
    this.cancelActiveTurn();
    const controller = new AbortController();
    this.activeTurn = controller;
    this.history.push({ role: 'user', content: text });

    try {
      for (let round = 0; round < 4; round += 1) {
        const result = await this.llm.complete({
          callId: this.callId,
          messages: this.history,
          tools: bookingToolDefinitions,
          signal: controller.signal,
        });
        if (result.toolCalls.length === 0) {
          const response = result.text || 'Prepáčte, môžete to prosím zopakovať?';
          this.history.push({ role: 'assistant', content: response });
          return response;
        }

        this.history.push({
          role: 'assistant',
          content: result.text,
          toolCalls: result.toolCalls,
        });
        for (const toolCall of result.toolCalls) {
          let toolResult: unknown;
          try {
            toolResult = await this.tools.execute(toolCall.name, toolCall.arguments);
          } catch (error) {
            callLogger(this.callId).warn({ error, tool: toolCall.name }, 'Tool execution failed');
            toolResult = { ok: false, error: error instanceof Error ? error.message : 'TOOL_ERROR' };
          }
          this.history.push({
            role: 'tool',
            toolCallId: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }
      }
      throw new Error('TOOL_LOOP_LIMIT');
    } finally {
      if (this.activeTurn === controller) this.activeTurn = null;
    }
  }

  transcript(): ConversationMessage[] {
    return [...this.history];
  }
}
