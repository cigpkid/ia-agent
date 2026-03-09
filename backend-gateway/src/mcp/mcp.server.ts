import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { AvlService } from 'src/avl/avl.service';

export class McpServerInstance {
  private server: Server;

  constructor(
    private readonly avlService: AvlService,
  ) {
    this.server = new Server(
      {
        name: 'nest-universal-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    /* =====================================================
       1. LISTADO DE TOOLS
    ===================================================== */
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

        {
          name: 'generar_diagnostico_soporte',
          description: `
Genera diagnóstico técnico NOC de una unidad con base en:
- suspensión
- última conexión
- horas sin comunicación
- batería
- velocidad
- estatus operativo

Debe usarse cuando:
- una unidad tiene condición crítica
- el usuario pide soporte o diagnóstico
- una unidad supera 4 horas sin comunicación
`,
          inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              unidad_id: {
                type: 'number',
                description: 'ID interno de la unidad',
              },
              suspendida: {
                type: 'boolean',
                description: 'Indica si la unidad está suspendida',
              },
              estatus_unidad: {
                type: 'number',
                description: 'Estatus técnico de la unidad',
              },
              estatus_dispositivo: {
                type: 'number',
                description: 'Estatus técnico del dispositivo',
              },
              ultima_conexion: {
                type: 'string',
                description: 'Fecha/hora de última conexión',
              },
              bateria: {
                type: 'number',
                description: 'Nivel de batería reportado',
              },
              velocidad: {
                type: 'number',
                description: 'Velocidad reportada',
              },
              horas_sin_comunicacion: {
                type: 'number',
                description: 'Horas sin comunicación',
              },
            },
            required: ['unidad_id'],
          },
        },
      ],
    }));

    /* =====================================================
       2. EJECUCIÓN DE TOOLS
    ===================================================== */
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      /* -------------------------------------------------
         TOOL: consultar_unidades_tecnicas
      ------------------------------------------------- */
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
                  ? result.unidades.map((u: any) => ({
                      unidad_id: u.unidad_id,
                      unidad_nombre: u.unidad_nombre,
                      placa: u.placa,
                      suspendida: u.suspendida,
                      imei: u.imei,
                      ultima_fecha: u.ultima_fecha,
                      horas_sin_comunicacion: u.horas_sin_comunicacion,
                    }))
                  : [],
              }),
            },
          ],
        };
      }

      /* -------------------------------------------------
         TOOL: generar_diagnostico_soporte
      ------------------------------------------------- */
      if (request.params.name === 'generar_diagnostico_soporte') {
        const {
          unidad_id,
          suspendida,
          estatus_unidad,
          estatus_dispositivo,
          ultima_conexion,
          bateria,
          velocidad,
          horas_sin_comunicacion,
        } = request.params.arguments as any;

        let severidad = 'OK';
        let causa_probable = 'Operación normal';
        let accion_recomendada = 'Sin acción requerida';
        let prioridad = 4;
        let requiere_intervencion_humana = false;

        if (suspendida === true) {
          severidad = 'SUSPENDIDA';
          causa_probable = 'Unidad suspendida administrativamente';
          accion_recomendada = 'No realizar acciones técnicas';
          prioridad = 4;
          requiere_intervencion_humana = false;
        } else if (
          typeof horas_sin_comunicacion === 'number' &&
          horas_sin_comunicacion >= 8
        ) {
          severidad = 'CRITICO';
          causa_probable =
            'Pérdida prolongada de comunicación. Posible falla de energía, desconexión física o pérdida de cobertura.';
          accion_recomendada =
            'Validar energía del dispositivo, cobertura celular y estado físico del GPS. Contactar operador.';
          prioridad = 1;
          requiere_intervencion_humana = true;
        } else if (
          typeof horas_sin_comunicacion === 'number' &&
          horas_sin_comunicacion >= 4
        ) {
          severidad = 'WARNING';
          causa_probable =
            'Retraso en transmisión GPS o comunicación intermitente.';
          accion_recomendada =
            'Monitorear comportamiento, validar señal y revisar dispositivo si persiste.';
          prioridad = 2;
          requiere_intervencion_humana = false;
        } else if (
          estatus_unidad === 0 ||
          estatus_dispositivo === 0
        ) {
          severidad = 'WARNING';
          causa_probable = 'Estatus operativo irregular en unidad o dispositivo.';
          accion_recomendada =
            'Validar estado operativo de unidad y dispositivo.';
          prioridad = 2;
          requiere_intervencion_humana = false;
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                unidad_id,
                diagnostico_noc: {
                  severidad,
                  causa_probable,
                  accion_recomendada,
                  prioridad,
                  requiere_intervencion_humana,
                  ultima_conexion: ultima_conexion || null,
                  bateria: bateria ?? null,
                  velocidad: velocidad ?? null,
                  horas_sin_comunicacion: horas_sin_comunicacion ?? null,
                },
              }),
            },
          ],
        };
      }

      /* -------------------------------------------------
         TOOL NO ENCONTRADA
      ------------------------------------------------- */
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Herramienta no encontrada: ${request.params.name}`,
      );
    });
  }

  get serverRaw(): Server {
    return this.server;
  }
}