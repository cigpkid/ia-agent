import { Injectable } from '@nestjs/common';

type UnidadResumen = {
  unidad_id?: number;
  unidad_nombre?: string;
  nombre?: string;
  imei?: string;
  placa?: string;
  ultima_fecha?: string;
  ultima_comunicacion?: string;
  horas_sin_comunicacion?: number;
  suspendida?: boolean | number | string;
  severidad?: string;
  diagnostico?: string;
  accion_recomendada?: string;
};

type NocUiUnit = {
  unidad_id: number | null;
  unidad_nombre: string;
  imei: string | null;
  placa: string | null;
  ultima_comunicacion: string | null;
  horas_sin_comunicacion: number | null;
  severidad: string;
  diagnostico: string;
  accion_recomendada: string;
};

type NocUiPayload = {
  type: 'noc_single_unit' | 'noc_multi_unit';
  summary: {
    total_encontradas: number;
    ok: number;
    warning: number;
    critico: number;
    suspendida: number;
    sin_datos: number;
  };
  units: NocUiUnit[];
};

@Injectable()
export class ResponseFormatterService {
  formatNocResponse(params: {
    llmResponse: string;
    toolPayloads?: any[];
  }): { text: string; ui: NocUiPayload | null } {
    const { llmResponse, toolPayloads = [] } = params;

    const extracted = this.extractStructuredData(toolPayloads);

    if (!extracted.unidades.length) {
      return {
        text: llmResponse,
        ui: null,
      };
    }

    const units: NocUiUnit[] = extracted.unidades.map((unidad) => {
      const diagnostico = this.findDiagnosticoForUnidad(
        unidad.unidad_id,
        extracted.diagnosticosByUnidadId,
      );

      const severidad =
        diagnostico?.diagnostico_noc?.severidad ||
        unidad.severidad ||
        this.inferSeverity(unidad);

      const causa =
        diagnostico?.diagnostico_noc?.causa_probable ||
        unidad.diagnostico ||
        'Sin diagnóstico adicional';

      const accion =
        diagnostico?.diagnostico_noc?.accion_recomendada ||
        unidad.accion_recomendada ||
        'Sin acción recomendada específica';

      return {
        unidad_id: unidad.unidad_id ?? null,
        unidad_nombre:
          unidad.unidad_nombre ||
          unidad.nombre ||
          `Unidad ${unidad.unidad_id ?? 'N/D'}`,
        imei: unidad.imei ?? null,
        placa: unidad.placa ?? null,
        ultima_comunicacion:
          unidad.ultima_fecha || unidad.ultima_comunicacion || null,
        horas_sin_comunicacion:
          unidad.horas_sin_comunicacion !== undefined &&
          unidad.horas_sin_comunicacion !== null
            ? Number(unidad.horas_sin_comunicacion)
            : null,
        severidad,
        diagnostico: causa,
        accion_recomendada: accion,
      };
    });

    const summary = {
      total_encontradas: units.length,
      ok: units.filter((u) => this.norm(u.severidad) === 'OK').length,
      warning: units.filter((u) => this.norm(u.severidad) === 'WARNING').length,
      critico: units.filter((u) => this.norm(u.severidad) === 'CRITICO').length,
      suspendida: units.filter((u) => this.norm(u.severidad) === 'SUSPENDIDA')
        .length,
      sin_datos: units.filter((u) => this.norm(u.severidad) === 'SIN_DATOS')
        .length,
    };

    const ui: NocUiPayload = {
      type: units.length === 1 ? 'noc_single_unit' : 'noc_multi_unit',
      summary,
      units,
    };

    const text =
      units.length === 1
        ? this.formatSingleUnitText(units[0])
        : this.formatMultiUnitText(ui);

    return { text, ui };
  }

  private formatSingleUnitText(unit: NocUiUnit): string {
    return [
      `Unidad: ${unit.unidad_nombre}`,
      `ID: ${unit.unidad_id ?? 'N/D'}`,
      `IMEI: ${unit.imei ?? 'No disponible'}`,
      `Última comunicación: ${unit.ultima_comunicacion ?? 'No disponible'}`,
      `Horas sin comunicación: ${
        unit.horas_sin_comunicacion ?? 'No disponible'
      }`,
      `Severidad: ${unit.severidad}`,
      ``,
      `Diagnóstico:`,
      `${unit.diagnostico}`,
      ``,
      `Acción recomendada:`,
      `${unit.accion_recomendada}`,
    ].join('\n');
  }

  private formatMultiUnitText(ui: NocUiPayload): string {
    const lines: string[] = [];

    lines.push(`Resumen NOC:`);
    lines.push(`Total encontradas: ${ui.summary.total_encontradas}`);
    lines.push(`OK: ${ui.summary.ok}`);
    lines.push(`WARNING: ${ui.summary.warning}`);
    lines.push(`CRITICO: ${ui.summary.critico}`);
    lines.push(`SUSPENDIDA: ${ui.summary.suspendida}`);
    lines.push(`SIN_DATOS: ${ui.summary.sin_datos}`);
    lines.push('');

    for (const unit of ui.units) {
      lines.push(`Unidad: ${unit.unidad_nombre}`);
      lines.push(`ID: ${unit.unidad_id ?? 'N/D'}`);
      lines.push(`IMEI: ${unit.imei ?? 'No disponible'}`);
      lines.push(
        `Última comunicación: ${unit.ultima_comunicacion ?? 'No disponible'}`,
      );
      lines.push(
        `Horas sin comunicación: ${
          unit.horas_sin_comunicacion ?? 'No disponible'
        }`,
      );
      lines.push(`Severidad: ${unit.severidad}`);
      lines.push('');
      lines.push(`Diagnóstico:`);
      lines.push(`${unit.diagnostico}`);
      lines.push('');
      lines.push(`Acción recomendada:`);
      lines.push(`${unit.accion_recomendada}`);
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  private extractStructuredData(toolPayloads: any[]) {
    const unidades: UnidadResumen[] = [];
    const diagnosticosByUnidadId: Record<string, any> = {};

    for (const payload of toolPayloads) {
      const parsed = this.parsePayload(payload);

      if (Array.isArray(parsed?.unidades)) {
        for (const u of parsed.unidades) {
          unidades.push(u);
        }
      }

      if (parsed?.unidad_id && parsed?.diagnostico_noc) {
        diagnosticosByUnidadId[String(parsed.unidad_id)] = parsed;
      }
    }

    return { unidades, diagnosticosByUnidadId };
  }

  private findDiagnosticoForUnidad(
    unidadId: number | undefined,
    diagnosticosByUnidadId: Record<string, any>,
  ) {
    if (unidadId === undefined || unidadId === null) return undefined;
    return diagnosticosByUnidadId[String(unidadId)];
  }

  private parsePayload(payload: any) {
    try {
      if (typeof payload === 'string') return JSON.parse(payload);

      if (Array.isArray(payload) && payload[0]?.text) {
        return JSON.parse(payload[0].text);
      }

      if (
        payload?.content &&
        Array.isArray(payload.content) &&
        payload.content[0]?.text
      ) {
        return JSON.parse(payload.content[0].text);
      }

      return payload;
    } catch {
      return payload;
    }
  }

  private inferSeverity(unidad: UnidadResumen): string {
    const suspendida =
      unidad.suspendida === true ||
      unidad.suspendida === 1 ||
      unidad.suspendida === '1' ||
      unidad.suspendida === 'true';

    if (suspendida) return 'SUSPENDIDA';

    const horas = Number(unidad.horas_sin_comunicacion);
    if (!Number.isFinite(horas)) return 'SIN_DATOS';
    if (horas >= 8) return 'CRITICO';
    if (horas >= 4) return 'WARNING';
    return 'OK';
  }

  private norm(value: string) {
    return (value || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}