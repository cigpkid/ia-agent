import { Injectable, Logger } from '@nestjs/common';

type PreprocessInput = {
  prompt: string;
  userId: string;
  sessionId: string;
  history: any[];
};

type NormalizeToolArgsInput = {
  toolName: string;
  rawArgs: any;
  prompt: string;
  sessionId: string;
};

type UpdateContextInput = {
  sessionId: string;
  toolName: string;
  args: any;
  toolResult: any;
};

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  /**
   * Memoria corta estructurada por sesión.
   * Esto complementa Qdrant, no lo reemplaza.
   */
  private readonly shortMemory = new Map<
    string,
    {
      lastUnidadIds?: number[];
      lastImeis?: string[];
      lastPlacas?: string[];
      lastIntent?: string;
      lastTool?: string;
      updatedAt?: number;
    }
  >();

  async preprocess(input: PreprocessInput) {
    const { prompt, sessionId } = input;

    const hints: string[] = [];
    const ctx = this.shortMemory.get(sessionId);

    const unidadIds = this.extractUnidadIds(prompt);
    const imeis = this.extractImeis(prompt);
    const placas = this.extractPlacas(prompt);

    const soloMasReciente = this.detectSoloMasReciente(prompt);
    const soloSuspendidas = this.detectSoloSuspendidas(prompt);

    if (unidadIds.length) {
      hints.push(
        `Los identificadores numéricos del usuario deben tratarse como unidad_ids: [${unidadIds.join(', ')}].`,
      );
    }

    if (imeis.length) {
      hints.push(
        `Los identificadores detectados como IMEI son: [${imeis.join(', ')}].`,
      );
    }

    if (placas.length) {
      hints.push(`Las placas detectadas son: [${placas.join(', ')}].`);
    }

    if (soloMasReciente) {
      hints.push(
        'El usuario está pidiendo unidades o reportes más recientes, por lo que solo_mas_reciente debe ser true.',
      );
    }

    if (soloSuspendidas) {
      hints.push(
        'El usuario está pidiendo unidades suspendidas, por lo que solo_suspendidas debe ser true.',
      );
    }

    if (
      !unidadIds.length &&
      !imeis.length &&
      !placas.length &&
      ctx?.lastUnidadIds?.length
    ) {
      hints.push(
        `Si el usuario hace referencia implícita a una unidad previa, el último contexto estructurado fue unidad_ids: [${ctx.lastUnidadIds.join(', ')}]. No inventes nuevos identificadores.`,
      );
    }

    hints.push(
      'Nunca inventes IMEIs, placas o IDs que no hayan sido mencionados por el usuario o confirmados por herramientas.',
    );

    return {
      systemHints: hints,
      extracted: {
        unidad_ids: unidadIds,
        imeis,
        placas,
        solo_mas_reciente: soloMasReciente,
        solo_suspendidas: soloSuspendidas,
      },
    };
  }

  async normalizeToolArgs(input: NormalizeToolArgsInput) {
    const { toolName, rawArgs, prompt, sessionId } = input;
    const ctx = this.shortMemory.get(sessionId);

    if (
      toolName !== 'consultar_unidades_tecnicas' &&
      toolName !== 'consultar_unidad_tecnica'
    ) {
      return rawArgs;
    }

    const normalized: any = {};

    const promptUnidadIds = this.extractUnidadIds(prompt);
    const promptImeis = this.extractImeis(prompt);
    const promptPlacas = this.extractPlacas(prompt);

    let unidadIds: number[] = [];
    let imeis: string[] = [];
    let placas: string[] = [];

    if (Array.isArray(rawArgs?.unidad_ids)) {
      unidadIds = rawArgs.unidad_ids
        .map((v: any) => Number(v))
        .filter((v: number) => Number.isInteger(v));
    }

    if (rawArgs?.unidad_id !== undefined && rawArgs?.unidad_id !== null) {
      const n = Number(rawArgs.unidad_id);
      if (Number.isInteger(n)) unidadIds.push(n);
    }

    if (Array.isArray(rawArgs?.imeis)) {
      imeis = rawArgs.imeis
        .map((v: any) => String(v).trim())
        .filter((v: string) => /^\d{14,15}$/.test(v));
    }

    if (
      typeof rawArgs?.imei === 'string' &&
      /^\d{14,15}$/.test(rawArgs.imei.trim())
    ) {
      imeis.push(rawArgs.imei.trim());
    }

    if (Array.isArray(rawArgs?.placas)) {
      placas = rawArgs.placas
        .map((v: any) => String(v).trim().toUpperCase())
        .filter((v: string) => /^[A-Z0-9-]{5,10}$/.test(v));
    }

    if (typeof rawArgs?.placa === 'string') {
      const p = rawArgs.placa.trim().toUpperCase();
      if (/^[A-Z0-9-]{5,10}$/.test(p)) placas.push(p);
    }

    /**
     * Regla crítica:
     * si el prompt trae ids cortos, se fuerzan como unidad_ids
     * y se descartan imeis inventados por el modelo.
     */
    if (promptUnidadIds.length) {
      unidadIds = promptUnidadIds;
      imeis = [];
      placas = promptPlacas.length ? promptPlacas : [];
    } else if (promptImeis.length) {
      imeis = promptImeis;
      unidadIds = [];
      placas = promptPlacas.length ? promptPlacas : [];
    } else if (promptPlacas.length) {
      placas = promptPlacas;
      unidadIds = [];
      imeis = [];
    } else if (
      !unidadIds.length &&
      !imeis.length &&
      !placas.length &&
      ctx?.lastUnidadIds?.length
    ) {
      /**
       * Solo reutilizamos memoria corta si el usuario no dio identificadores nuevos.
       */
      unidadIds = ctx.lastUnidadIds;
    }

    unidadIds = [...new Set(unidadIds)];
    imeis = [...new Set(imeis)];
    placas = [...new Set(placas)];

    /**
     * No permitimos mezclar arbitrariamente filtros.
     * Priorizamos:
     * 1. unidad_ids
     * 2. imeis
     * 3. placas
     */
    if (unidadIds.length) {
      normalized.unidad_ids = unidadIds;
    } else if (imeis.length) {
      normalized.imeis = imeis;
    } else if (placas.length) {
      normalized.placas = placas;
    }

    const soloMasReciente =
      rawArgs?.solo_mas_reciente === true || this.detectSoloMasReciente(prompt);

    const soloSuspendidas =
      rawArgs?.solo_suspendidas === true || this.detectSoloSuspendidas(prompt);

    const horasSinComunicacion = this.normalizeHorasSinComunicacion(
      rawArgs?.horas_sin_comunicacion,
      prompt,
    );

    if (soloMasReciente) normalized.solo_mas_reciente = true;
    if (soloSuspendidas) normalized.solo_suspendidas = true;
    if (horasSinComunicacion !== undefined) {
      normalized.horas_sin_comunicacion = horasSinComunicacion;
    }

    this.logger.debug({
      event: 'normalize_tool_args',
      toolName,
      rawArgs,
      normalized,
    });

    return normalized;
  }

  async updateContextFromToolResult(input: UpdateContextInput) {
    const { sessionId, toolName, args, toolResult } = input;

    const current = this.shortMemory.get(sessionId) || {};

    const next = {
      ...current,
      lastTool: toolName,
      updatedAt: Date.now(),
    };

    if (Array.isArray(args?.unidad_ids) && args.unidad_ids.length) {
      next.lastUnidadIds = args.unidad_ids;
      next.lastImeis = undefined;
      next.lastPlacas = undefined;
    }

    if (Array.isArray(args?.imeis) && args.imeis.length) {
      next.lastImeis = args.imeis;
      next.lastUnidadIds = undefined;
      next.lastPlacas = undefined;
    }

    if (Array.isArray(args?.placas) && args.placas.length) {
      next.lastPlacas = args.placas;
      next.lastUnidadIds = undefined;
      next.lastImeis = undefined;
    }

    /**
     * Intentamos enriquecer contexto con lo que regrese la tool.
     */
    try {
      let parsed: any = toolResult;

      if (Array.isArray(toolResult?.content) && toolResult.content[0]?.text) {
        parsed = JSON.parse(toolResult.content[0].text);
      }

      if (Array.isArray(parsed?.unidades) && parsed.unidades.length) {
        const ids: number[] = (parsed?.unidades ?? [])
          .map((u: any) => Number(u?.unidad_id))
          .filter((v: number) => Number.isInteger(v));

        if (ids.length > 0) {
          next.lastUnidadIds = [...new Set<number>(ids)];
        }
      }
    } catch {
      // sin romper flujo si el toolResult no viene parseable
    }

    this.shortMemory.set(sessionId, next);

    this.logger.debug({
      event: 'update_context_from_tool_result',
      sessionId,
      memory: next,
    });
  }

  private extractUnidadIds(text: string): number[] {
    if (!text) return [];

    const matches = text.match(/\b\d{1,6}\b/g) || [];
    return [...new Set(matches.map(Number).filter((n) => Number.isInteger(n)))];
  }

  private extractImeis(text: string): string[] {
    if (!text) return [];

    const matches = text.match(/\b\d{14,15}\b/g) || [];
    return [...new Set(matches)];
  }

  private extractPlacas(text: string): string[] {
    if (!text) return [];

    const matches = text.toUpperCase().match(/\b[A-Z0-9-]{5,10}\b/g) || [];
    return [
      ...new Set(
        matches.filter((p) => /[A-Z]/.test(p) && /^[A-Z0-9-]{5,10}$/.test(p)),
      ),
    ];
  }

  private detectSoloMasReciente(text: string): boolean {
    return /recient|últim|ultima|última|ultimas|últimas|reporte más nuevo|más nuevo/i.test(
      text,
    );
  }

  private detectSoloSuspendidas(text: string): boolean {
    return /suspendid/i.test(text);
  }

  private normalizeHorasSinComunicacion(
    rawValue: any,
    prompt: string,
  ): number | undefined {
    if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
      const n = Number(rawValue);
      if (Number.isFinite(n) && n >= 1 && n <= 72) return n;
    }

    const match = prompt.match(/(\d+)\s*horas?/i);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 72) return n;
    }

    return undefined;
  }
}
