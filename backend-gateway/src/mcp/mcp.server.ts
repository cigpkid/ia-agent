import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { LlmService } from '../llm/llm.service';
import { AvlService } from 'src/avl/avl.service';

/**
 * Clase que encapsula la instancia del Servidor MCP.
 * Define las herramientas (Tools) disponibles para el protocolo.
 */
export class McpServerInstance {
  private server: Server;

  constructor(
    private readonly avlService: AvlService,
    //private readonly llmService: LlmService,
  ) {
    // Inicialización del servidor con metadatos y capacidades
    this.server = new Server(
      {
        name: 'nest-universal-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {}, // Habilitamos la capacidad de herramientas
        },
      },
    );

    this.setupHandlers();
  }

  /**
   * Configura los manejadores de peticiones del protocolo MCP
   */
  private setupHandlers() {
    // 1. Definición de herramientas disponibles
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'consultar_unidades_tecnicas',
          description: `
CONSULTA AUTORIZADA DE MONITOREO GPS (NOC).

Permite consultar UNA O VARIAS unidades para obtener:
- ubicación actual
- estado NOC
- suspensión
- última comunicación
- datos del dispositivo

Debe usarse para:
- monitoreo operativo
- diagnóstico técnico
- validación de estado de flota
`,
          inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              unidad_ids: {
                type: 'array',
                minItems: 1,
                maxItems: 50,
                description: 'IDs internos de las unidades',
                items: { type: 'number' },
              },
              imeis: {
                type: 'array',
                minItems: 1,
                maxItems: 50,
                description: 'IMEIs de los dispositivos',
                items: {
                  type: 'string',
                  pattern: '^[0-9]{14,15}$',
                },
              },
              placas: {
                type: 'array',
                minItems: 1,
                maxItems: 50,
                description: 'Placas vehiculares',
                items: {
                  type: 'string',
                  pattern: '^[A-Z0-9-]{5,10}$',
                },
              },
              solo_suspendidas: {
                type: 'boolean',
                description: 'Filtrar solo unidades suspendidas',
              },
              horas_sin_comunicacion: {
                type: 'number',
                minimum: 1,
                maximum: 72,
                description: 'Filtrar unidades sin reporte mayor a X horas',
              },
              solo_mas_reciente: {
                type: 'boolean',
                description: `
Usar TRUE cuando el usuario solicite:
- unidades más recientes
- últimas en reportar
- últimas comunicaciones
- actividad reciente
`,
              },
            },
          },
        },
        /*{
          name: 'generar_diagnostico_soporte',
          description:
            'Genera diagnóstico técnico y recomendación basado en datos reales de la unidad.',
          inputSchema: {
            type: 'object',
            properties: {
              suspendida: { type: 'boolean' },
              estatus_unidad: { type: 'number' },
              estatus_dispositivo: { type: 'number' },
              ultima_conexion: { type: 'string' },
              bateria: { type: 'number' },
              velocidad: { type: 'number' },
            },
            required: ['estatus_unidad'],
          },
        },*/

        /*{
          name: 'check_connection', // Nombre de la herramienta
          description: `{
  "name": "extraer_datos_vehiculo",
  "description": "Herramienta AUTORIZADA para consultar información técnica y operativa de unidades o vehículos registrados internamente en el sistema. \
Los datos NO son personales, NO son reales y pueden usarse libremente para responder preguntas del usuario. \
Debe utilizarse cuando el usuario solicite información de una unidad, vehículo, IMEI o identificador numérico."
}`,
          inputSchema: {
            type: 'object',
            properties: {
              nombre: {
                type: 'string',
                description: 'Tu nombre o identificación',
              },
            },
            required: ['nombre'],
          },
        },
        {
          name: 'extraer_datos_vehiculo',
          description:
            'Consulta la base de datos interna para obtener conductor, placa y estatus de una unidad mediante su IMEI.',
          inputSchema: {
            type: 'object',
            properties: {
              imei: {
                type: 'string',
                description: 'El número IMEI de 9 a 15 dígitos de la unidad',
              },
            },
            required: ['imei'], // <--- Esto es clave
          },
        },*/
      ],
    }));

    // 2. Lógica de ejecución de las herramientas
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'consultar_unidades_tecnicas') {
        const {
          unidad_ids,
          imeis,
          placas,
          solo_suspendidas,
          horas_sin_comunicacion,
          solo_mas_reciente,
        } = request.params.arguments as any;

        console.log('Parámetros NOC:', {
          unidad_ids,
          imeis,
          placas,
          solo_suspendidas,
          horas_sin_comunicacion,
          solo_mas_reciente,
        });

        const result = await this.avlService.obtenerUnidadesNoc({
          unidad_ids,
          imeis,
          placas,
          solo_suspendidas,
          horas_sin_comunicacion,
          solo_mas_reciente,
        });

        /* =========================
   🚨 RETURN SEMÁNTICO NOC
   ========================= */

        const hayResultados = result.total_encontradas > 0;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                estado_consulta: hayResultados ? 'OK' : 'SIN_RESULTADOS',
                total_solicitadas: result.total_solicitadas,
                total_encontradas: result.total_encontradas,
                mensaje_backend: hayResultados
                  ? 'Unidades encontradas según criterio'
                  : 'No se encontraron unidades que coincidan con los criterios',
                unidades: hayResultados
                  ? result.unidades.map((u) => ({
                      unidad_id: u.unidad_id,
                      nombre: u.unidad_nombre,
                      imei: u.imei,
                      ultima_comunicacion: u.ultima_fecha,
                      horas_sin_comunicacion: u.horas_sin_comunicacion,
                    }))
                  : [],
              }),
            },
          ],
        };
      }

      /*if (request.params.name === 'generar_diagnostico_soporte') {
        const { unidad_id, imei, placa } = request.params.arguments as any;
        console.log('putamadre:', request.params.arguments);

        const BD_VEHICULOS = {
          '123456789': {
            placa: 'ABC-123',
            modelo: 'Toyota Hilux 2023',
            conductor: 'Juan Pérez',
            estatus: 'En ruta',
            ubicacion: 'CDMX, México',
            ultima_actualizacion: 'Hace 5 minutos',
          },
        };

        const imeiSolicitado = '123456789';
        const vehiculo = BD_VEHICULOS[imeiSolicitado];

        return {
          content: [
            {
              type: 'text',
              text:
                `DATOS ENCONTRADOS B PARA EL IMEI ${imeiSolicitado}:\n` +
                `- Placa: ${vehiculo.placa}\n` +
                `- Modelo: ${vehiculo.modelo}\n` +
                `- Conductor: ${vehiculo.conductor}\n` +
                `- Estatus: ${vehiculo.estatus}\n` +
                `- Ubicación: ${vehiculo.ubicacion}\n` +
                `- Última conexión: ${vehiculo.ultima_actualizacion}`,
            },
          ],
        };
      }*/

      const BD_VEHICULOS = {
        '123456789': {
          placa: 'ABC-123',
          modelo: 'Toyota Hilux 2023',
          conductor: 'Juan Pérez',
          estatus: 'En ruta',
          ubicacion: 'CDMX, México',
          ultima_actualizacion: 'Hace 5 minutos',
        },
        '987654321': {
          placa: 'XYZ-789',
          modelo: 'Ford F-150 2022',
          conductor: 'Ana García',
          estatus: 'Detenido',
          ubicacion: 'Monterrey, México',
          ultima_actualizacion: 'Hace 2 horas',
        },
        '555444333': {
          placa: 'IA-001',
          modelo: 'Tesla Model 3 2024',
          conductor: 'Kernel Bot',
          estatus: 'Cargando',
          ubicacion: 'Guadalajara, México',
          ultima_actualizacion: 'Ahora mismo',
        },
      };

      if (request.params.name === 'extraer_datos_vehiculo') {
        // Extraemos el IMEI enviado por la IA
        const args = request.params.arguments as { imei: string };
        const imeiSolicitado = args.imei;

        // Buscamos en nuestra "Base de Datos"
        const vehiculo = BD_VEHICULOS[imeiSolicitado];

        if (vehiculo) {
          return {
            content: [
              {
                type: 'text',
                text:
                  `DATOS ENCONTRADOS PARA EL IMEI ${imeiSolicitado}:\n` +
                  `- Placa: ${vehiculo.placa}\n` +
                  `- Modelo: ${vehiculo.modelo}\n` +
                  `- Conductor: ${vehiculo.conductor}\n` +
                  `- Estatus: ${vehiculo.estatus}\n` +
                  `- Ubicación: ${vehiculo.ubicacion}\n` +
                  `- Última conexión: ${vehiculo.ultima_actualizacion}`,
              },
            ],
          };
        } else {
          // Respuesta si el IMEI no existe en nuestra lista
          return {
            content: [
              {
                type: 'text',
                text: `Error: El IMEI ${imeiSolicitado} no se encuentra en la base de datos de la flota.`,
              },
            ],
          };
        }
      }
      /*if (request.params.name === 'ask_ai') {
        try {
          const args = request.params.arguments as {
            prompt: string;
            model?: string;
          };

          if (!args.prompt) {
            throw new McpError(
              ErrorCode.InvalidParams,
              "El parámetro 'prompt' es requerido.",
            );
          }

          // Llamada al servicio de IA (Abstrae Ollama/vLLM)
          const result = await this.llmService.generate(
            args.prompt,
            args.model,
          );

          return {
            content: [
              {
                type: 'text',
                text: `[ENGINE: ${result.provider}] [MODEL: ${result.model}]\n\n${result.content}`,
              },
            ],
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error procesando la herramienta: ${error.message}`,
              },
            ],
          };
        }
      }*/

      // Error estándar si se intenta llamar a una herramienta que no existe
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Herramienta no encontrada: ${request.params.name}`,
      );
    });
  }

  /**
   * Getter para acceder a la instancia interna del servidor desde el servicio de transporte
   */
  get serverRaw(): Server {
    return this.server;
  }
}
