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
    private readonly configValue: ConfigType<typeof llmConfig>
  ) {}

  async generateProgressiveSummary(history: any[], currentSummary: string) {
    const promptText = `
      RESUMEN ACTUAL: "${currentSummary || 'No hay resumen previo'}"
      NUEVOS MENSAJES: ${JSON.stringify(history)}
      
      TAREA: Crea un nuevo resumen corto y denso. Máximo 3 párrafos.
    `;

    const messages = [
      { role: 'system', content: `
Eres un agente de soporte de monitoreo GPS.

Siempre debes:
1. Usar consultar_unidad_tecnica para obtener datos reales.
2. Si detectas unidades con más de 4 horas sin comunicación,
   debes generar diagnóstico automáticamente.
3. Si el usuario pide solución o soporte, usa generar_diagnostico_soporte.
4. Nunca inventes información.
5. Puedes trabajar con múltiples unidades al mismo tiempo.
6. Nunca inventes información de parametros de entrada para las herramientas de mcp.
` },
      { role: 'user', content: promptText }
    ];

    // USAMOS chatStream pasándole:
    // 1. Mensajes
    // 2. Herramientas (undefined)
    // 3. Callback de chunk (vacío, no necesitamos streaming para el resumen interno)
    // 4. Proveedor forzado ('ollama')
    const result = await this.llmService.chatStream(
      messages, 
      [], 
      () => {}, // Callback vacío para el stream
      this.configValue.memory.summarizerProvider,
    );
    
    return result.content; 
  }
}
