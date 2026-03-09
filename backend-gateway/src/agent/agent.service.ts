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

type ShortMemory = {
  lastUnidadIds?: number[];
  lastUnidadNombres?: string[];
  lastImeis?: string[];
  lastPlacas?: string[];
  lastVins?: string[];
  lastIntent?: string;
  lastTool?: string;
  updatedAt?: number;
};

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  private readonly shortMemory = new Map<string, ShortMemory>();

  async preprocess(input: PreprocessInput) {
    const { prompt, sessionId } = input;

    const hints: string[] = [];
    const ctx = this.shortMemory.get(sessionId);

    const unidadIds = this.extractUnidadIds(prompt);
    const unidadNombres = this.extractUnidadNombres(prompt);
    const vins = this.extractVINs(prompt);
    const imeis = this.extractImeis(prompt);
    const placas = this.extractPlacas(prompt);

    const soloMasReciente = this.detectSoloMasReciente(prompt);
    const soloSuspendidas = this.detectSoloSuspendidas(prompt);
    const isContextualReference = this.isContextualReference(prompt);

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

    if (vins.length) {
      hints.push(`Los VIN detectados son: [${vins.join(', ')}].`);
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

    if (isContextualReference) {
      hints.push(
        'El usuario está haciendo referencia a la unidad consultada anteriormente. Debes reutilizar el último identificador confirmado por contexto y no inventar un nuevo nombre de unidad.',
      );
    }

    if (
      !unidadIds.length &&
      !unidadNombres.length &&
      !vins.length &&
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
      !vins.length &&
      !imeis.length &&
      !placas.length &&
      ctx?.lastUnidadNombres?.length
    ) {
      hints.push(
        `Si el usuario hace referencia implícita a una unidad previa, los últimos nombres de unidad fueron: [${ctx.lastUnidadNombres.join(', ')}]. No inventes nuevos identificadores.`,
      );
    }

    if (
      !unidadIds.length &&
      !unidadNombres.length &&
      !vins.length &&
      !imeis.length &&
      !placas.length &&
      ctx?.lastImeis?.length
    ) {
      hints.push(
        `Si el usuario hace referencia implícita a una unidad previa, los últimos IMEIs fueron: [${ctx.lastImeis.join(', ')}]. No inventes nuevos identificadores.`,
      );
    }

    if (
      !unidadIds.length &&
      !unidadNombres.length &&
      !vins.length &&
      !imeis.length &&
      !placas.length &&
      ctx?.lastPlacas?.length
    ) {
      hints.push(
        `Si el usuario hace referencia implícita a una unidad previa, las últimas placas fueron: [${ctx.lastPlacas.join(', ')}]. No inventes nuevos identificadores.`,
      );
    }

    if (
      !unidadIds.length &&
      !unidadNombres.length &&
      !vins.length &&
      !imeis.length &&
      !placas.length &&
      ctx?.lastVins?.length
    ) {
      hints.push(
        `Si el usuario hace referencia implícita a una unidad previa, los últimos VINs fueron: [${ctx.lastVins.join(', ')}]. No inventes nuevos identificadores.`,
      );
    }

    hints.push(
      'Nunca inventes IMEIs, placas, nombres, VINs o IDs que no hayan sido mencionados por el usuario o confirmados por herramientas.',
    );

    return {
      systemHints: hints,
      extracted: {
        unidad_ids: unidadIds,
        unidad_nombres: unidadNombres,
        vins,
        imeis,
        placas,
        solo_mas_reciente: soloMasReciente,
        solo_suspendidas: soloSuspendidas,
        is_contextual_reference: isContextualReference,
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
    const promptVINs = this.extractVINs(prompt);
    const promptImeis = this.extractImeis(prompt);
    const promptPlacas = this.extractPlacas(prompt);
    const promptUnidadNombres = this.extractUnidadNombres(prompt);
    const isContextualReference = this.isContextualReference(prompt);
    const promptLooksLikeName = this.promptLooksLikeUnitName(prompt);

    this.logger.debug({
      event: 'prompt_extraction',
      prompt,
      promptUnidadIds,
      promptVINs,
      promptImeis,
      promptPlacas,
      promptUnidadNombres,
      isContextualReference,
      promptLooksLikeName,
    });

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

    if (promptUnidadIds.length) {
      normalized.unidad_ids = promptUnidadIds;
    } else if (promptVINs.length) {
      normalized.vins = promptVINs;
    } else if (promptImeis.length) {
      normalized.imeis = promptImeis;
    } else if (
      promptUnidadNombres.length &&
      !isContextualReference &&
      promptLooksLikeName
    ) {
      normalized.unidad_nombres = promptUnidadNombres;
      normalized.busqueda_parcial_nombre = true;
    } else if (promptPlacas.length) {
      normalized.placas = promptPlacas;
    } else if (promptUnidadNombres.length && !isContextualReference) {
      normalized.unidad_nombres = promptUnidadNombres;
      normalized.busqueda_parcial_nombre = true;
    } else {
      if (unidadIds.length) {
        normalized.unidad_ids = unidadIds;
      } else if (vins.length) {
        normalized.vins = vins;
      } else if (imeis.length) {
        normalized.imeis = imeis;
      } else if (
        unidadNombres.length &&
        !isContextualReference &&
        promptLooksLikeName
      ) {
        normalized.unidad_nombres = unidadNombres;
        normalized.busqueda_parcial_nombre = true;
      } else if (placas.length) {
        normalized.placas = placas;
      } else if (unidadNombres.length && !isContextualReference) {
        normalized.unidad_nombres = unidadNombres;
        normalized.busqueda_parcial_nombre = true;
      } else if (ctx?.lastUnidadIds?.length) {
        normalized.unidad_ids = ctx.lastUnidadIds;
      } else if (ctx?.lastVins?.length) {
        normalized.vins = ctx.lastVins;
      } else if (ctx?.lastImeis?.length) {
        normalized.imeis = ctx.lastImeis;
      } else if (ctx?.lastUnidadNombres?.length) {
        normalized.unidad_nombres = ctx.lastUnidadNombres;
        normalized.busqueda_parcial_nombre = true;
      } else if (ctx?.lastPlacas?.length) {
        normalized.placas = ctx.lastPlacas;
      }
    }

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

    const next: ShortMemory = {
      ...current,
      lastTool: toolName,
      updatedAt: Date.now(),
    };

    if (Array.isArray(args?.unidad_ids) && args.unidad_ids.length) {
      next.lastUnidadIds = args.unidad_ids;
      next.lastUnidadNombres = undefined;
      next.lastImeis = undefined;
      next.lastPlacas = undefined;
      next.lastVins = undefined;
    }

    if (Array.isArray(args?.unidad_nombres) && args.unidad_nombres.length) {
      next.lastUnidadNombres = args.unidad_nombres;
      next.lastUnidadIds = undefined;
      next.lastImeis = undefined;
      next.lastPlacas = undefined;
      next.lastVins = undefined;
    }

    if (Array.isArray(args?.imeis) && args.imeis.length) {
      next.lastImeis = args.imeis;
      next.lastUnidadIds = undefined;
      next.lastUnidadNombres = undefined;
      next.lastPlacas = undefined;
      next.lastVins = undefined;
    }

    if (Array.isArray(args?.placas) && args.placas.length) {
      next.lastPlacas = args.placas;
      next.lastUnidadIds = undefined;
      next.lastUnidadNombres = undefined;
      next.lastImeis = undefined;
      next.lastVins = undefined;
    }

    if (Array.isArray(args?.vins) && args.vins.length) {
      next.lastVins = args.vins;
      next.lastUnidadIds = undefined;
      next.lastUnidadNombres = undefined;
      next.lastImeis = undefined;
      next.lastPlacas = undefined;
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

        const imeis: string[] = (parsed.unidades ?? [])
          .map((u: any) => String(u?.imei || '').trim())
          .filter((v: string) => /^\d{14,15}$/.test(v));

        if (imeis.length > 0) {
          next.lastImeis = [...new Set<string>(imeis)];
        }

        const placas: string[] = (parsed.unidades ?? [])
          .map((u: any) => String(u?.placa || '').trim().toUpperCase())
          .filter(
            (v: string) =>
              /^(?:[A-Z]{3}-\d{3,4}|[A-Z]{2,3}\d{3,4}[A-Z]?)$/.test(v),
          );

        if (placas.length > 0) {
          next.lastPlacas = [...new Set<string>(placas)];
        }

        const vins: string[] = (parsed.unidades ?? [])
          .map((u: any) => String(u?.vin || '').trim().toUpperCase())
          .filter((v: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(v));

        if (vins.length > 0) {
          next.lastVins = [...new Set<string>(vins)];
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

  private isContextualReference(text: string): boolean {
    if (!text) return false;

    const normalized = text
      .toLowerCase()
      .replace(/[¿?¡!.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const contextualPatterns = [
      /^y\s+su\s+/i,
      /^su\s+/i,
      /^y\s+el\s+/i,
      /^y\s+la\s+/i,
      /^ese\s+/i,
      /^esa\s+/i,
      /^esta\s+/i,
      /^este\s+/i,
      /^de\s+esa\s+/i,
      /^de\s+ese\s+/i,
      /^de\s+esta\s+/i,
      /^de\s+este\s+/i,
      /^la\s+misma\s+/i,
      /^el\s+mismo\s+/i,
      /^esa\s+misma\s+/i,
      /^ese\s+mismo\s+/i,
      /^ahora\s+su\s+/i,
      /^también\s+su\s+/i,
    ];

    return contextualPatterns.some((pattern) => pattern.test(normalized));
  }

  private promptLooksLikeUnitName(text: string): boolean {
    if (!text) return false;

    const cleaned = text
      .replace(/[¿?¡!"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return false;

    if (cleaned.split(' ').length >= 2) return true;

    if (/informacion de|información de|unidad\s+/i.test(cleaned)) return true;

    return false;
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

    const normalized = text.toUpperCase().trim();

    if (normalized.split(/\s+/).length > 1) {
      return [];
    }

    const matches =
      normalized.match(/\b(?:[A-Z]{3}-\d{3,4}|[A-Z]{2,3}\d{3,4}[A-Z]?)\b/g) ||
      [];

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

    if (this.isContextualReference(text)) {
      return [];
    }

    const normalizedForIntent = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (
      /\b(imei|vin|placa|ultimo|reporte|falla|diagnostico|soporte|estado|estatus)\b/.test(
        normalizedForIntent,
      )
    ) {
      return [];
    }

    const normalized = text
      .replace(/[¿?¡!.,"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const blockedPhrases = [
      'y su último reporte',
      'y su ultimo reporte',
      'su último reporte',
      'su ultimo reporte',
      'último reporte',
      'ultimo reporte',
      'su reporte',
      'y su reporte',
      'esa unidad',
      'ese unidad',
      'esta unidad',
      'este unidad',
      'la misma unidad',
      'el mismo vehículo',
      'el mismo vehiculo',
      'esa misma unidad',
      'ese mismo vehículo',
      'ese mismo vehiculo',
    ];

    if (blockedPhrases.includes(normalized.toLowerCase())) {
      return [];
    }

    const directRegex = /\bunidad\s+([A-ZÁÉÍÓÚa-z0-9._ -]{3,80})\b/gi;
    const directResults: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = directRegex.exec(normalized)) !== null) {
      const value = match[1]?.trim();
      if (!value) continue;
      if (/^\d{1,6}$/.test(value)) continue;
      if (/^\d{14,15}$/.test(value)) continue;
      if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(value)) continue;
      if (
        /\b(imei|vin|placa|id|reporte|último|ultimo|misma|mismo)\b/i.test(
          value,
        )
      )
        continue;
      directResults.push(value);
    }

    if (directResults.length) {
      return [...new Set(directResults)];
    }

    const cleaned = normalized
      .replace(
        /\b(dame|das|dime|quiero|consulta|consultar|buscar|busca|informacion|información|del|de|la|el|las|los|unidad|unidades|sobre|que|qué|tienes|imei|vin|placa|id|reporte|último|ultimo|su|misma|mismo|esa|ese|esta|este|y|ahora|también|tambien)\b/gi,
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
    if (/\b(reporte|último|ultimo|su|misma|mismo)\b/i.test(cleaned))
      return [];

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

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      // noop
    }

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