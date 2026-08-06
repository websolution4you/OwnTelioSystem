import OpenAI from 'openai';
import { env } from '../../config/env.js';
import type { LlmProvider, LlmTurnResult } from '../../voice/contracts.js';

export class OpenAiLlmProvider implements LlmProvider {
  private readonly client: OpenAI;

  constructor() {
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required');
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async complete(options: Parameters<LlmProvider['complete']>[0]): Promise<LlmTurnResult> {
    const response = await this.client.chat.completions.create(
      {
        model: env.OPENAI_LLM_MODEL,
        temperature: 0,
        messages: options.messages.map((message) => {
          if (message.role === 'tool') {
            return { role: 'tool' as const, content: message.content, tool_call_id: message.toolCallId! };
          }
          if (message.role === 'assistant' && message.toolCalls?.length) {
            return {
              role: 'assistant' as const,
              content: message.content || null,
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function' as const,
                function: { name: call.name, arguments: JSON.stringify(call.arguments) },
              })),
            };
          }
          return { role: message.role, content: message.content } as
            | OpenAI.Chat.Completions.ChatCompletionSystemMessageParam
            | OpenAI.Chat.Completions.ChatCompletionUserMessageParam
            | OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;
        }),
        tools: options.tools.map((tool) => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
            strict: true,
          },
        })),
        tool_choice: 'auto',
      },
      { signal: options.signal },
    );

    const message = response.choices[0]?.message;
    return {
      text: message?.content ?? '',
      toolCalls: (message?.tool_calls ?? [])
        .filter((call): call is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall => call.type === 'function')
        .map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: JSON.parse(call.function.arguments) as unknown,
        })),
    };
  }
}
