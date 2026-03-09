import { Injectable, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpService } from '../mcp/mcp.service';
import { LlmService } from '../llm/llm.service';
import { VectorService } from '../llm/vector.service';
import { SummaryService } from '../llm/summary.service';
import { MessageEntity } from './entities/message.entity';
import type { ConfigType } from '@nestjs/config';
import llmConfig from '../config/llm.config';

@Injectable()
export class ChatService implements OnModuleInit {
  private mcpClient: Client;
  private threads = new Map<string, any[]>();
  private messageCounters = new Map<string, number>();
  private readonly logger = new Logger(ChatService.name);
  private readonly MAX_MESSAGES_FOR_SUMMARY = 7;

  constructor(
    @InjectRepository(MessageEntity,'local')
    private readonly msgRepo: Repository<MessageEntity>,
    private readonly mcpService: McpService,
    private readonly llmService: LlmService,
    private readonly vectorService: VectorService,
    private readonly summaryService: SummaryService,
    @Inject(llmConfig.KEY)
    private readonly config: ConfigType<typeof llmConfig>,
  ) {}

  async onModuleInit() {
    this.mcpClient = new Client(
      { name: 'orchestrator-client', version: '1.0.0' },
      { capabilities: {} },
    );

    try {
      await this.mcpClient.connect(this.mcpService.clientTransport);
      this.logger.log('✅ ChatService vinculado al BUS de MCP');
    } catch (error) {
      this.logger.error('❌ Fallo al conectar ChatService con MCP', error);
    }
  }

  async getMessagesBySession(sessionId: string) {
    return await this.msgRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
  }

  async processMessage(
    prompt: string, 
    userId: string, 
    sessionId: string, 
    image?: string,
    onChunk?: (chunk: string) => void,
    onToolCall?: (toolName: string) => void
  ) {
    // 1. CARGA DE HISTORIAL (MySQL -> RAM)
    if (!this.threads.has(sessionId)) {
      const dbHistory = await this.getMessagesBySession(sessionId);
      if (dbHistory.length > 0) {
        this.threads.set(sessionId, dbHistory.map(m => ({ role: m.role, content: m.content })));
      } else {
        this.threads.set(sessionId, [
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
` }
        ]);
      }
    }

    // Usamos el operador "!" o una validación para asegurar que no es undefined
    const currentHistory = this.threads.get(sessionId)!;

    // 2. PERSISTIR MENSAJE DEL USUARIO EN MYSQL
    await this.msgRepo.save({ userId, sessionId, role: 'user', content: prompt });

    // 3. RECUPERACIÓN DE MEMORIA SEMÁNTICA (Qdrant)
    const memory = await this.vectorService.findRelevantContext(userId, prompt, sessionId);
    if (memory) {
        const systemMsg = currentHistory.find(m => m.role === 'system');
        if (systemMsg) systemMsg.content += `\nRecuerdos: ${memory}`;
    }

    currentHistory.push({ role: 'user', content: prompt });

    // 4. HERRAMIENTAS MCP
    const { tools } = await this.mcpClient.listTools();
    const mcpTools = tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema }
    }));

    // 5. BUCLE DE RAZONAMIENTO CON STREAMING
    let iterations = 0;
    let finalResponseText = '';

    while (iterations < 5) {
      iterations++;
      
      const result = await this.llmService.chatStream(
        currentHistory, 
        mcpTools, 
        (chunk) => onChunk && onChunk(chunk) // Flujo al Socket
      );

      if (!result.toolCalls || result.toolCalls.length === 0) {
        finalResponseText = result.content;
        break;
      }

      // Procesar Tools
      currentHistory.push({ role: 'assistant', content: result.content || null, tool_calls: result.toolCalls });

      for (const call of result.toolCalls) {
        const toolCall = call as any;
        const toolName = toolCall.function.name;
        if (onToolCall) onToolCall(toolName);

        try {
          const args = typeof toolCall.function.arguments === 'string' ? JSON.parse(toolCall.function.arguments) : toolCall.function.arguments;
          const toolResult = await this.mcpClient.callTool({ name: toolName, arguments: args });
          
          currentHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id || `call_${Date.now()}`,
            name: toolName,
            content: JSON.stringify(toolResult.content),
          });
        } catch (error) {
          currentHistory.push({ role: 'tool', tool_call_id: toolCall.id, name: toolName, content: 'Error en tool' });
        }
      }
    }

    // 6. PERSISTIR RESPUESTA DE LA IA EN MYSQL
    await this.msgRepo.save({ userId, sessionId, role: 'assistant', content: finalResponseText });

    // 7. GESTIÓN DE MEMORIA EN SEGUNDO PLANO (Qdrant)
    this.manageBackgroundMemory(userId, sessionId, currentHistory)
      .catch(e => this.logger.error('Error en Background Memory:', e));

    return { response: finalResponseText };
  }

  private async manageBackgroundMemory(userId: string, sessionId: string, history: any[]) {
    const count = (this.messageCounters.get(sessionId) || 0) + 1;
    this.messageCounters.set(sessionId, count);

    if (count >= this.MAX_MESSAGES_FOR_SUMMARY) {
      const oldSummary = await this.vectorService.findRelevantContext(userId, "resumen", sessionId);
      const newSummary = await this.summaryService.generateProgressiveSummary(history, oldSummary);
      await this.vectorService.saveMemory(userId, newSummary, sessionId);
      this.messageCounters.set(sessionId, 0);
    }
  }

  async deleteChat(userId: string, sessionId: string) {
    try {
      // 1. Borrar de MySQL
      await this.msgRepo.delete({ sessionId, userId });

      // 2. Borrar de Qdrant (Memoria semántica)
      await this.vectorService.deleteSessionMemory(userId, sessionId);

      // 3. Limpiar la memoria RAM (hilos activos)
      this.threads.delete(sessionId);
      this.messageCounters.delete(sessionId);

      this.logger.log(`🗑️ Sesión ${sessionId} eliminada por el usuario ${userId}`);
      return { deleted: true, sessionId };
    } catch (error) {
      this.logger.error(`Error al eliminar sesión ${sessionId}: ${error.message}`);
      throw error;
    }
  }

}
