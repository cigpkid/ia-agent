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

  async chatStream(messages: any[], tools: any[], onChunk: (chunk: string) => void, forcedProvider?: string) {
    const provider = forcedProvider || this.config.provider;
    const settings = this.config.providers[provider];

    // --- LÓGICA ANTHROPIC STREAM ---
    if (provider === 'anthropic') {
      const stream = this.anthropic.messages.stream({
        model: settings.textModel,
        max_tokens: 1024,
        messages: messages.filter(m => m.role !== 'system'),
        system: messages.find(m => m.role === 'system')?.content,
      }).on('text', (text) => onChunk(text));

      const final = await stream.finalMessage();
      return { 
        content: final.content[0]['text'], 
        toolCalls: [], // Implementar tool_use stream si es necesario
        model: final.model 
      };
    }

    // --- LÓGICA OPENAI / OLLAMA / VLLM STREAM ---
    const response = await this.openai.chat.completions.create({
      model: settings.textModel,
      messages: messages,
      tools: tools.length ? tools : undefined,
      stream: true, // <--- ACTIVAMOS STREAMING
    });

    let fullContent = '';
    let toolCalls: any[] = [];

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta;
      
      // Si hay texto, lo enviamos al socket
      if (delta?.content) {
        fullContent += delta.content;
        onChunk(delta.content);
      }

      // Si hay herramientas (OpenAI style)
      if (delta?.tool_calls) {
        toolCalls = delta.tool_calls; // Simplificado para el ejemplo
      }
    }

    return { 
      content: fullContent, 
      toolCalls: toolCalls, 
      model: settings.textModel 
    };
  }
}
