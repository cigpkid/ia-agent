import { Injectable, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { McpService } from '../mcp/mcp.service';
import { LlmService } from '../llm/llm.service';
import { VectorService } from '../llm/vector.service';
import { SummaryService } from '../llm/summary.service';
import { AgentService } from '../agent/agent.service';
import { PlannerService } from '../agent/planner.service';

import { MessageEntity } from './entities/message.entity';
import { ResponseFormatterService } from './response.formatter';

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
    @InjectRepository(MessageEntity, 'local')
    private readonly msgRepo: Repository<MessageEntity>,
    private readonly mcpService: McpService,
    private readonly llmService: LlmService,
    private readonly vectorService: VectorService,
    private readonly summaryService: SummaryService,
    private readonly agentService: AgentService,
    private readonly plannerService: PlannerService,
    private readonly responseFormatter: ResponseFormatterService,
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
      this.logger.log('✅ ChatService vinculado al BUS MCP');
    } catch (error) {
      this.logger.error('❌ Error conectando MCP', error);
    }
  }

  async getMessagesBySession(sessionId: string) {
    return await this.msgRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
  }

  async getSessionsByUser(userId: string) {
    const rows = await this.msgRepo
      .createQueryBuilder('m')
      .select('m.sessionId', 'sessionId')
      .addSelect('MIN(m.createdAt)', 'firstCreatedAt')
      .addSelect('MAX(m.createdAt)', 'lastCreatedAt')
      .where('m.userId = :userId', { userId })
      .groupBy('m.sessionId')
      .orderBy('lastCreatedAt', 'DESC')
      .getRawMany();

    const sessions = await Promise.all(
      rows.map(async (row) => {
        const firstUserMessage = await this.msgRepo.findOne({
          where: {
            userId,
            sessionId: row.sessionId,
            role: 'user',
          },
          order: {
            createdAt: 'ASC',
          },
        });

        return {
          sessionId: row.sessionId,
          title:
            firstUserMessage?.content?.slice(0, 40) ||
            `Chat ${new Date(row.firstCreatedAt).toLocaleString()}`,
          firstCreatedAt: row.firstCreatedAt,
          lastCreatedAt: row.lastCreatedAt,
        };
      }),
    );

    return sessions;
  }

  async processMessage(
    prompt: string,
    userId: string,
    sessionId: string,
    image?: string,
    onChunk?: (chunk: string) => void,
    onToolCall?: (toolName: string) => void,
  ) {
    if (!this.threads.has(sessionId)) {
      const dbHistory = await this.getMessagesBySession(sessionId);

      if (dbHistory.length > 0) {
        this.threads.set(
          sessionId,
          dbHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        );
      } else {
        this.threads.set(sessionId, [
          {
            role: 'system',
            content: `
Eres un agente NOC de monitoreo GPS especializado en soporte técnico y operación de flota.

Tu trabajo es responder con base en datos reales obtenidos de herramientas MCP. Nunca inventes información, identificadores, placas, IMEIs, estados ni diagnósticos.

Reglas obligatorias:
1. Usa consultar_unidades_tecnicas para obtener datos reales de unidades.
2. Si detectas unidades con más de 4 horas sin comunicación, genera diagnóstico automáticamente con generar_diagnostico_soporte.
3. Si el usuario pide soporte, falla, problema, solución o diagnóstico, genera diagnóstico directamente.
4. Nunca inventes parámetros de entrada para herramientas MCP.
5. Los IDs numéricos cortos deben tratarse como unidad_ids, no como IMEIs.
6. Si el usuario pide información reciente, activa solo_mas_reciente.
7. Puedes trabajar con una o múltiples unidades al mismo tiempo.
8. Si una unidad no existe o no hay resultados, indícalo claramente sin inventar causas.
9. Si hay información parcial, repórtala como parcial.
10. No preguntes si deseas generar diagnóstico cuando ya exista una condición crítica; debes hacerlo directamente.
`,
          },
        ]);
      }
    }

    const currentHistory = this.threads.get(sessionId)!;

    await this.msgRepo.save({
      userId,
      sessionId,
      role: 'user',
      content: prompt,
      uiPayload: null,
    });

    const memory = await this.vectorService.findRelevantContext(
      userId,
      prompt,
      sessionId,
    );

    if (memory) {
      currentHistory.push({
        role: 'system',
        content: `Contexto relevante recuperado de memoria:\n${memory}`,
      });
    }

    const agentContext = await this.agentService.preprocess({
      prompt,
      userId,
      sessionId,
      history: currentHistory,
    });

    if (agentContext?.systemHints?.length) {
      const systemMsg = currentHistory.find((m) => m.role === 'system');
      if (systemMsg) {
        systemMsg.content += '\n' + agentContext.systemHints.join('\n');
      }
    }

    currentHistory.push({ role: 'user', content: prompt });

    const { tools } = await this.mcpClient.listTools();

    const mcpTools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    let iterations = 0;
    let finalResponseText = '';
    const executedToolPayloads: any[] = [];

    while (iterations < 5) {
      iterations++;

      const result = await this.llmService.chatStream(
        currentHistory,
        mcpTools,
        (chunk) => onChunk && onChunk(chunk),
      );

      if (!result.toolCalls || result.toolCalls.length === 0) {
        finalResponseText = result.content;
        break;
      }

      currentHistory.push({
        role: 'assistant',
        content: result.content || null,
        tool_calls: result.toolCalls,
      });

      for (const call of result.toolCalls) {
        const toolCall = call as any;
        const toolName = toolCall.function.name;

        if (onToolCall) onToolCall(toolName);

        try {
          const rawArgs =
            typeof toolCall.function.arguments === 'string'
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;

          const args = await this.agentService.normalizeToolArgs({
            toolName,
            rawArgs,
            prompt,
            sessionId,
          });

          const toolResult = await this.mcpClient.callTool({
            name: toolName,
            arguments: args,
          });

          executedToolPayloads.push(toolResult);

          await this.agentService.updateContextFromToolResult({
            sessionId,
            toolName,
            args,
            toolResult,
          });

          currentHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id || `call_${Date.now()}`,
            name: toolName,
            content: JSON.stringify(toolResult.content),
          });

          const nextActions = await this.plannerService.getNextActions({
            prompt,
            toolName,
            toolArgs: args,
            toolResult,
          });

          for (const action of nextActions) {
            try {
              if (onToolCall) onToolCall(action.name);

              const plannedToolResult = await this.mcpClient.callTool({
                name: action.name,
                arguments: action.arguments,
              });

              executedToolPayloads.push(plannedToolResult);

              await this.agentService.updateContextFromToolResult({
                sessionId,
                toolName: action.name,
                args: action.arguments,
                toolResult: plannedToolResult,
              });

              currentHistory.push({
                role: 'tool',
                tool_call_id: `planned_${Date.now()}_${action.name}`,
                name: action.name,
                content: JSON.stringify(plannedToolResult.content),
              });
            } catch (plannerError) {
              this.logger.error(
                `Error ejecutando acción planeada ${action.name}`,
                plannerError,
              );

              currentHistory.push({
                role: 'tool',
                tool_call_id: `planned_error_${Date.now()}`,
                name: action.name,
                content: 'Error en tool planeada',
              });
            }
          }
        } catch (error) {
          this.logger.error('Error ejecutando tool', error);

          currentHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: 'Error en tool',
          });
        }
      }
    }

    const formatted = this.responseFormatter.formatNocResponse({
      llmResponse: finalResponseText,
      toolPayloads: executedToolPayloads,
    });

    await this.msgRepo.save({
      userId,
      sessionId,
      role: 'assistant',
      content: formatted.text,
      uiPayload: formatted.ui ? JSON.stringify(formatted.ui) : null,
    });

    this.manageBackgroundMemory(userId, sessionId, currentHistory).catch((e) =>
      this.logger.error('Error en memoria background', e),
    );

    return {
      response: formatted.text,
      ui: formatted.ui,
    };
  }

  private async manageBackgroundMemory(
    userId: string,
    sessionId: string,
    history: any[],
  ) {
    const count = (this.messageCounters.get(sessionId) || 0) + 1;
    this.messageCounters.set(sessionId, count);

    if (count >= this.MAX_MESSAGES_FOR_SUMMARY) {
      const oldSummary = await this.vectorService.findRelevantContext(
        userId,
        'resumen',
        sessionId,
      );

      const newSummary = await this.summaryService.generateProgressiveSummary(
        history,
        oldSummary,
      );

      await this.vectorService.saveMemory(userId, newSummary, sessionId);
      this.messageCounters.set(sessionId, 0);
    }
  }

  async deleteChat(userId: string, sessionId: string) {
    try {
      await this.msgRepo.delete({ sessionId, userId });
      await this.vectorService.deleteSessionMemory(userId, sessionId);
      this.threads.delete(sessionId);
      this.messageCounters.delete(sessionId);

      return { deleted: true, sessionId };
    } catch (error) {
      this.logger.error(
        `Error eliminando sesión ${sessionId}: ${error.message}`,
      );
      throw error;
    }
  }
}