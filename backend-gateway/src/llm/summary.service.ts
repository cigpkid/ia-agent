// src/llm/summary.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { LlmService } from './llm.service';
import type { ConfigType } from '@nestjs/config';
import llmConfig from '../config/llm.config';

@Injectable()
export class SummaryService {
  constructor(
    private readonly llmService: LlmService,
    @Inject(llmConfig.KEY)
    private readonly configValue: ConfigType<typeof llmConfig>,
  ) {}

  async generateProgressiveSummary(history: any[], oldSummary?: string) {
    const messages = [
      {
        role: 'system',
        content: `
Eres un sistema que genera resúmenes progresivos de conversaciones técnicas.

Debes resumir la conversación manteniendo:
- unidades consultadas
- diagnósticos generados
- información relevante para futuras consultas

El resumen debe ser corto y útil para contexto futuro.
`,
      },
      {
        role: 'user',
        content: `
Resumen anterior:
${oldSummary || 'Ninguno'}

Historial reciente:
${JSON.stringify(history.slice(-10), null, 2)}
`,
      },
    ];

    const result = await this.llmService.chat(messages, []);

    return result.content;
  }
}
