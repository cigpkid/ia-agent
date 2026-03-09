import { Injectable, Logger } from '@nestjs/common';

type PlannerInput = {
  prompt: string;
  toolName: string;
  toolArgs: any;
  toolResult: any;
};

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);

  async getNextActions(input: PlannerInput) {
    const { prompt, toolName, toolResult } = input;

    if (toolName !== 'consultar_unidades_tecnicas' && toolName !== 'consultar_unidad_tecnica') {
      return [];
    }

    const parsed = this.parseToolResult(toolResult);
    const unidades = Array.isArray(parsed?.unidades) ? parsed.unidades : [];

    if (!unidades.length) {
      return [];
    }

    const promptPideDiagnostico = /diagn[oó]stic|soporte|problema|falla|soluci[oó]n/i.test(prompt);

    const actions: Array<{ name: string; arguments: any }> = [];

    for (const u of unidades) {
      const horas = this.toNumber(u.horas_sin_comunicacion);
      const suspendida = this.toBooleanLike(u.suspendida);
      const ultimaConexion = u.ultima_fecha || u.ultima_comunicacion || null;

      const requiereDiagnostico =
        promptPideDiagnostico ||
        (Number.isFinite(horas) && horas > 4);

      if (!requiereDiagnostico) continue;

      actions.push({
        name: 'generar_diagnostico_soporte',
        arguments: {
          unidad_id: this.toNumber(u.unidad_id),
          suspendida,
          estatus_unidad: Number.isFinite(horas) && horas > 4 ? 0 : 1,
          estatus_dispositivo: Number.isFinite(horas) && horas > 4 ? 0 : 1,
          ultima_conexion: ultimaConexion,
          bateria: this.toNumber(u.bateria) || 0,
          velocidad: this.toNumber(u.velocidad) || 0,
          horas_sin_comunicacion: Number.isFinite(horas) ? horas : null,
        },
      });
    }

    this.logger.debug({
      event: 'planner_next_actions',
      actions_count: actions.length,
      actions,
    });

    return actions;
  }

  private parseToolResult(toolResult: any) {
    try {
      if (Array.isArray(toolResult?.content) && toolResult.content[0]?.text) {
        return JSON.parse(toolResult.content[0].text);
      }

      if (typeof toolResult === 'string') {
        return JSON.parse(toolResult);
      }

      return toolResult;
    } catch {
      return toolResult;
    }
  }

  private toNumber(value: any): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  private toBooleanLike(value: any): boolean {
    return value === true || value === 1 || value === '1' || value === 'true';
  }
}