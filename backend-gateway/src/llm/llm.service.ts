import { Injectable, Inject } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { ConfigType } from '@nestjs/config';
import llmConfig from '../config/llm.config';

@Injectable()
export class LlmService {
  private openai: OpenAI;
  private anthropic: Anthropic;

  constructor(
    @Inject(llmConfig.KEY)
    private config: ConfigType<typeof llmConfig>,
  ) {
    const provider = this.config.provider;
    const settings = this.config.providers[provider];

    this.openai = new OpenAI({
      baseURL: settings.baseUrl,
      apiKey: settings.apiKey || 'ollama',
    });

    this.anthropic = new Anthropic({
      apiKey: this.config.providers.anthropic.apiKey,
    });
  }

  private looksLikeFakeToolCall(text?: string | null): boolean {
    if (!text) return false;

    const normalized = text.toLowerCase();

    return (
      normalized.includes('"name"') &&
      (normalized.includes('"parameters"') ||
        normalized.includes('"arguments"')) &&
      (normalized.includes('consultar_') ||
        normalized.includes('generar_') ||
        normalized.includes('tool'))
    );
  }

  async chat(
    messages: any[],
    tools: any[] = [],
    forcedProvider?: string,
  ): Promise<{
    content: string;
    toolCalls: any[];
    model: string;
  }> {
    const provider = forcedProvider || this.config.provider;
    const settings = this.config.providers[provider];

    if (provider === 'anthropic') {
      const result = await this.anthropic.messages.create({
        model: settings.textModel,
        max_tokens: 1024,
        system: this.buildAnthropicSystem(messages),
        messages: this.buildAnthropicMessages(messages),
      });

      const textBlocks = result.content.filter((b: any) => b.type === 'text');
      const content = textBlocks.map((b: any) => b.text).join('');

      return {
        content: this.looksLikeFakeToolCall(content) ? '' : content,
        toolCalls: [],
        model: result.model,
      };
    }

    const response = await this.openai.chat.completions.create({
      model: settings.textModel,
      messages,
      tools: tools.length ? tools : undefined,
      stream: false,
      temperature: 0,
    });

    const message = response.choices[0]?.message;
    const rawContent = message?.content || '';
    const toolCalls = message?.tool_calls || [];

    return {
      content:
        toolCalls.length > 0 || this.looksLikeFakeToolCall(rawContent)
          ? ''
          : rawContent,
      toolCalls,
      model: settings.textModel,
    };
  }

  async chatStreamFinal(
    messages: any[],
    onChunk: (chunk: string) => void,
    forcedProvider?: string,
  ): Promise<{
    content: string;
    toolCalls: any[];
    model: string;
  }> {
    const provider = forcedProvider || this.config.provider;
    const settings = this.config.providers[provider];

    if (provider === 'anthropic') {
      const stream = this.anthropic.messages
        .stream({
          model: settings.textModel,
          max_tokens: 1024,
          system: this.buildAnthropicSystem(messages),
          messages: this.buildAnthropicMessages(messages),
        })
        .on('text', (text) => onChunk(text));

      const final = await stream.finalMessage();

      const content = (final.content || [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');

      return {
        content,
        toolCalls: [],
        model: final.model,
      };
    }

    const response = await this.openai.chat.completions.create({
      model: settings.textModel,
      messages,
      stream: true,
      temperature: 0,
    });

    let fullContent = '';

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        fullContent += delta.content;
        onChunk(delta.content);
      }
    }

    return {
      content: fullContent,
      toolCalls: [],
      model: settings.textModel,
    };
  }

  private buildAnthropicSystem(messages: any[]): string | undefined {
    const systemMessages = messages.filter((m) => m.role === 'system');
    if (!systemMessages.length) return undefined;

    return systemMessages
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .filter(Boolean)
      .join('\n\n');
  }

  private buildAnthropicMessages(messages: any[]) {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: this.normalizeAnthropicContent(m),
      }));
  }

  private normalizeAnthropicContent(message: any): string {
    if (typeof message?.content === 'string') {
      if (message.role === 'tool') {
        const toolName = message?.name || 'tool';
        return `[Resultado de herramienta: ${toolName}]\n${message.content}`;
      }

      return message.content;
    }

    if (Array.isArray(message?.content)) {
      return message.content
        .map((part: any) => {
          if (typeof part === 'string') return part;
          if (typeof part?.text === 'string') return part.text;
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }

    if (message?.content == null) {
      if (message?.tool_calls?.length) {
        return `[Tool calls internos: ${JSON.stringify(message.tool_calls)}]`;
      }
      return '';
    }

    return String(message.content);
  }
}