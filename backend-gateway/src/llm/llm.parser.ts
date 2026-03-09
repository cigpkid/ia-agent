import { Injectable } from '@nestjs/common';

@Injectable()
export class LlmParser {
  parseResponse(content: string | null, provider: string): string {
    if (!content) return '';
    return content.replace(/<\|.*?\|>/g, '').trim();
  }

  mapToAnthropic(messages: any[]) {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        // Caso A: Resultado de herramienta (Tool Result)
        if (m.role === 'tool') {
          return {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: m.tool_call_id,
                content: m.content,
              },
            ],
          };
        }

        // Caso B: El asistente pide usar herramientas (Tool Use)
        if (m.role === 'assistant' && m.tool_calls) {
          return {
            role: 'assistant',
            content: [
              { type: 'text', text: m.content || 'Procesando...' },
              ...m.tool_calls.map((tc: any) => ({
                type: 'tool_use',
                id: tc.id,
                name: tc.function.name,
                input: typeof tc.function.arguments === 'string' 
                       ? JSON.parse(tc.function.arguments) 
                       : tc.function.arguments,
              })),
            ],
          };
        }

        // Caso C: Mensaje con Imágenes (Multimodal)
        if (Array.isArray(m.content)) {
          return {
            role: m.role,
            content: m.content.map((item: any) => {
              if (item.type === 'image_url') {
                // Extraer base64 y media_type del formato data:image/jpeg;base64,xxxx
                const match = item.image_url.url.match(/^data:(image\/\w+);base64,(.+)$/);
                return {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: match ? match[1] : 'image/jpeg',
                    data: match ? match[2] : item.image_url.url,
                  },
                };
              }
              return item; // Devuelve el texto tal cual
            }),
          };
        }

        // Caso D: Mensaje de texto normal
        return { role: m.role, content: m.content };
      });
  }
}
