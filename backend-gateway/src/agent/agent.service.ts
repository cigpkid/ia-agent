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
   * Complementa Qdrant, no lo reemplaza.
   */
  private readonly shortMemory = new Map<
    string,
    {
      lastUnidadIds?: number[];
      lastUnidadNombres?: string[];
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
    const unidadNombres = this.extractUnidadNombres(prompt);
    const imeis = this.extractImeis(prompt);
    const placas = this.extractPlacas(prompt);

    const soloMasReciente = this.detectSoloMasReciente(prompt);
    const soloSuspendidas = this.detectSoloSuspendidas(prompt);

    if (unidadIds.length) {
      hints.push(
        `Los identificadores numéricos del usuario deben tratarse como unidad_ids: [${unidadIds.join(', ')}].`,
      );
    }

    if (unidadNombres.length) {
      hints.push(
        `Los nombres de unidad detectados son: [${unidadNombres.join(', ')}].`,
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
      !unidadNombres.length &&
      !imeis.length &&
      !placas.length &&
      ctx?.lastUnidadIds?.length
    ) {
      hints.push(
        `Si el usuario hace referencia implícita a una unidad previa, el último contexto estructurado fue unidad_ids: [${ctx.lastUnidadIds.join(', ')}]. No inventes nuevos identificadores.`,
      );
    }

    if (
      !unidadIds.length &&
      !unidadNombres.length &&
      !imeis.length &&
      !placas.length &&
      ctx?.lastUnidadNombres?.length
    ) {
      hints.push(
        `Si el usuario hace referencia implícita a una unidad previa, los últimos nombres de unidad fueron: [${ctx.lastUnidadNombres.join(', ')}]. No inventes nuevos identificadores.`,
      );
    }

    hints.push(
      'Nunca inventes IMEIs, placas, nombres o IDs que no hayan sido mencionados por el usuario o confirmados por herramientas.',
    );

    return {
      systemHints: hints,
      extracted: {
        unidad_ids: unidadIds,
        unidad_nombres: unidadNombres,
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

    // 1. Extraer directamente del prompt
    const promptUnidadIds = this.extractUnidadIds(prompt);
    const promptVINs = this.extractVINs(prompt);
    const promptImeis = this.extractImeis(prompt);
    const promptPlacas = this.extractPlacas(prompt);
    const promptUnidadNombres = this.extractUnidadNombres(prompt);

    this.logger.debug({
      event: 'prompt_extraction',
      prompt,
      promptUnidadIds,
      promptVINs,
      promptImeis,
      promptPlacas,
      promptUnidadNombres,
    });

    // 2. Leer args del modelo, pero filtrados
    let unidadIds: number[] = this.parseNumberArray(rawArgs?.unidad_ids);
    let vins: string[] = this.parseStringArray(rawArgs?.vins).filter((v) =>
      /^[A-HJ-NPR-Z0-9]{17}$/i.test(v),
    );
    let imeis: string[] = this.parseStringArray(rawArgs?.imeis).filter((v) =>
      /^\d{14,15}$/.test(v),
    );
    let placas: string[] = this.parseStringArray(rawArgs?.placas)
      .map((v) => v.toUpperCase())
      .filter((v) => /^(?:[A-Z]{3}-\d{3,4}|[A-Z]{2,3}\d{3,4}[A-Z]?)$/.test(v));
    let unidadNombres: string[] = this.parseStringArray(
      rawArgs?.unidad_nombres,
    );

    if (rawArgs?.unidad_id !== undefined && rawArgs?.unidad_id !== null) {
      const n = Number(rawArgs.unidad_id);
      if (Number.isInteger(n)) unidadIds.push(n);
    }

    if (typeof rawArgs?.vin === 'string') {
      const vin = rawArgs.vin.trim().toUpperCase();
      if (/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) vins.push(vin);
    }

    if (
      typeof rawArgs?.imei === 'string' &&
      /^\d{14,15}$/.test(rawArgs.imei.trim())
    ) {
      imeis.push(rawArgs.imei.trim());
    }

    if (typeof rawArgs?.placa === 'string') {
      const p = rawArgs.placa.trim().toUpperCase();
      if (/^(?:[A-Z]{3}-\d{3,4}|[A-Z]{2,3}\d{3,4}[A-Z]?)$/.test(p)) {
        placas.push(p);
      }
    }

    if (typeof rawArgs?.unidad_nombre === 'string') {
      const nombre = rawArgs.unidad_nombre.trim();
      if (nombre) unidadNombres.push(nombre);
    }

    unidadIds = [...new Set<number>(unidadIds)];
    vins = [...new Set<string>(vins)];
    imeis = [...new Set<string>(imeis)];
    placas = [...new Set<string>(placas)];
    unidadNombres = [...new Set<string>(unidadNombres)];

    /**
     * Prioridad correcta:
     * 1. unidad_ids
     * 2. vins
     * 3. imeis
     * 4. placas
     * 5. unidad_nombres
     */
    if (promptUnidadIds.length) {
      normalized.unidad_ids = promptUnidadIds;
    } else if (promptVINs.length) {
      normalized.vins = promptVINs;
    } else if (promptImeis.length) {
      normalized.imeis = promptImeis;
    } else if (promptPlacas.length) {
      normalized.placas = promptPlacas;
    } else if (promptUnidadNombres.length) {
      normalized.unidad_nombres = promptUnidadNombres;
    } else {
      if (unidadIds.length) {
        normalized.unidad_ids = unidadIds;
      } else if (vins.length) {
        normalized.vins = vins;
      } else if (imeis.length) {
        normalized.imeis = imeis;
      } else if (placas.length) {
        normalized.placas = placas;
      } else if (unidadNombres.length) {
        normalized.unidad_nombres = unidadNombres;
      } else if (ctx?.lastUnidadIds?.length) {
        normalized.unidad_ids = ctx.lastUnidadIds;
      } else if (ctx?.lastUnidadNombres?.length) {
        normalized.unidad_nombres = ctx.lastUnidadNombres;
      }
    }

    // 3. Filtros adicionales: solo confiar en el prompt
    const soloMasReciente = this.detectSoloMasReciente(prompt);
    const soloSuspendidas = this.detectSoloSuspendidas(prompt);
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

    const next: {
      lastUnidadIds?: number[];
      lastUnidadNombres?: string[];
      lastImeis?: string[];
      lastPlacas?: string[];
      lastIntent?: string;
      lastTool?: string;
      updatedAt?: number;
    } = {
      ...current,
      lastTool: toolName,
      updatedAt: Date.now(),
    };

    if (Array.isArray(args?.unidad_ids) && args.unidad_ids.length) {
      next.lastUnidadIds = args.unidad_ids;
      next.lastUnidadNombres = undefined;
      next.lastImeis = undefined;
      next.lastPlacas = undefined;
    }

    if (Array.isArray(args?.unidad_nombres) && args.unidad_nombres.length) {
      next.lastUnidadNombres = args.unidad_nombres;
      next.lastUnidadIds = undefined;
      next.lastImeis = undefined;
      next.lastPlacas = undefined;
    }

    if (Array.isArray(args?.imeis) && args.imeis.length) {
      next.lastImeis = args.imeis;
      next.lastUnidadIds = undefined;
      next.lastUnidadNombres = undefined;
      next.lastPlacas = undefined;
    }

    if (Array.isArray(args?.placas) && args.placas.length) {
      next.lastPlacas = args.placas;
      next.lastUnidadIds = undefined;
      next.lastUnidadNombres = undefined;
      next.lastImeis = undefined;
    }

    try {
      let parsed: any = toolResult;

      if (Array.isArray(toolResult?.content) && toolResult.content[0]?.text) {
        parsed = JSON.parse(toolResult.content[0].text);
      }

      if (Array.isArray(parsed?.unidades) && parsed.unidades.length) {
        const ids: number[] = (parsed.unidades ?? [])
          .map((u: any) => Number(u?.unidad_id))
          .filter((v: number) => Number.isInteger(v));

        if (ids.length > 0) {
          next.lastUnidadIds = [...new Set<number>(ids)];
        }

        const nombres: string[] = (parsed.unidades ?? [])
          .map((u: any) => String(u?.unidad_nombre || '').trim())
          .filter((v: string) => v.length > 0);

        if (nombres.length > 0) {
          next.lastUnidadNombres = [...new Set<string>(nombres)];
        }
      }
    } catch {
      // noop
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

    const matches =
      text
        .toUpperCase()
        .match(/\b(?:[A-Z]{3}-\d{3,4}|[A-Z]{2,3}\d{3,4}[A-Z]?)\b/g) || [];

    return [...new Set(matches)];
  }

  private extractVINs(text: string): string[] {
    if (!text) return [];

    const matches = text.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) || [];

    return [...new Set(matches)];
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

  private extractUnidadNombres(text: string): string[] {
    if (!text) return [];

    const normalized = text
      .replace(/[¿?¡!.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const directRegex = /\bunidad\s+([A-ZÁÉÍÓÚa-z0-9._ -]{3,80})\b/gi;
    const directResults: string[] = [];

    let match;
    while ((match = directRegex.exec(normalized)) !== null) {
      const value = match[1]?.trim();
      if (!value) continue;
      if (/^\d{1,6}$/.test(value)) continue;
      if (/^\d{14,15}$/.test(value)) continue;
      if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(value)) continue;
      if (/\b(imei|vin|placa|id)\b/i.test(value)) continue;
      directResults.push(value);
    }

    if (directResults.length) {
      return [...new Set(directResults)];
    }

    const cleaned = normalized
      .replace(
        /\b(dame|das|dime|quiero|consulta|buscar|busca|informacion|información|del|de|la|el|las|los|unidad|unidades|sobre|que|qué|tienes|imei|vin|placa|id)\b/gi,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return [];

    if (/^\d{1,6}$/.test(cleaned)) return [];
    if (/^\d{14,15}$/.test(cleaned)) return [];
    if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(cleaned)) return [];
    if (/^(?:[A-Z]{3}-\d{3,4}|[A-Z]{2,3}\d{3,4}[A-Z]?)$/i.test(cleaned))
      return [];
    if (cleaned.length < 3) return [];

    return [cleaned];
  }

  private parseStringArray(value: any): string[] {
    if (Array.isArray(value)) {
      return value.map((v) => String(v).trim()).filter(Boolean);
    }

    if (typeof value !== 'string') {
      return [];
    }

    const trimmed = value.trim();
    if (!trimmed) return [];

    // Intento 1: JSON válido
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      // noop
    }

    // Intento 2: formato tipo Python ['A', 'B']
    const normalized = trimmed
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map((part) => part.replace(/^['"]|['"]$/g, '').trim())
      .filter(Boolean);

    return normalized;
  }

  private parseNumberArray(value: any): number[] {
    const items = this.parseStringArray(value);
    return items.map((v) => Number(v)).filter((v) => Number.isInteger(v));
  }
}
