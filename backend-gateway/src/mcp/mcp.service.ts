import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServerInstance } from './mcp.server';
import { LlmService } from '../llm/llm.service';
import { AvlService } from 'src/avl/avl.service';

@Injectable()
export class McpService implements OnModuleInit {
  private readonly logger = new Logger(McpService.name);
  private mcpServer: McpServerInstance;

  // Este transporte es el que inyectarás en tu cliente interno
  public clientTransport: any;

  constructor(
    private avlService: AvlService,
    private llmService: LlmService
  ) {}

  async onModuleInit() {
    try {
      // La respuesta es un Array/Tupla: el primer elemento es el cliente, el segundo el servidor
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();

      this.clientTransport = clientTransport;

      this.mcpServer = new McpServerInstance(this.avlService/*, this.llmService*/);

      // Conectamos el servidor usando el segundo elemento del array
      await this.mcpServer.serverRaw.connect(serverTransport);

      this.logger.log('### MCP SERVER READY ###');
    } catch (error) {
      this.logger.error('Error inicializando el servidor MCP:', error.stack);
    }
  }

  /**
   * Método de utilidad para obtener el transporte del cliente
   * Útil para pruebas o comunicación interna en main.ts
   */
  getTransport() {
    return this.clientTransport;
  }

  // Añade este método a tu McpService
  async callToolDirectly(name: string, args: any) {
    try {
      // Creamos un cliente temporal para la prueba o usamos el del ChatService
      const { Client } =
        await import('@modelcontextprotocol/sdk/client/index.js');
      const testClient = new Client(
        {
          name: 'tester',
          version: '1.0.0', // <-- Añade esto para solucionar el error
        },
        {
          capabilities: {},
        },
      );

      // Nos conectamos al MISMO transporte que el servidor
      await testClient.connect(this.clientTransport);

      const result = await testClient.callTool({
        name: name,
        arguments: args,
      });

      return result;
    } catch (error) {
      throw new Error(`Fallo al ejecutar herramienta: ${error.message}`);
    }
  }
}
