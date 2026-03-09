import { Injectable } from '@nestjs/common';

@Injectable()
export class IntentResolver {
  resolve(text: string, _context?: any) {
    const normalized = text.toLowerCase();
    const ids = Array.from(normalized.matchAll(/\b\d{1,6}\b/g)).map((m) => Number(m[0]));
    const uniqueIds = [...new Set(ids)];
    const soloMasReciente = /recient|últim|ultima|ultimas|últimas|reportaron/.test(normalized);
    const soloSuspendidas = /suspendid/.test(normalized);

    return {
      tool: 'consultar_unidades',
      params: {
        unidad_ids: uniqueIds.length ? uniqueIds : undefined,
        solo_mas_reciente: soloMasReciente || undefined,
        solo_suspendidas: soloSuspendidas || undefined,
      },
    };
  }
}
