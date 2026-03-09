import { Controller, Get, Post, Body, BadRequestException } from '@nestjs/common';
import { McpService } from './mcp.service';

@Controller('mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  /**
   * Verifica el estado del servidor MCP y qué motor de IA está activo
   */
  @Get('status')
  getStatus() {
    return {
      status: 'online',
      transport: 'InMemory',
      engine: process.env.LLM_PROVIDER || 'ollama',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Endpoint de utilidad para probar herramientas directamente vía HTTP
   * Útil para probar tu lógica de negocio desde Postman/Insomnia
   */
@Post('test-tool')
async testTool(@Body() body: { toolName: string; arguments: any }) {
  // Ahora llama al método que acabamos de arreglar
  return await this.mcpService.callToolDirectly(body.toolName, body.arguments);
}

}
