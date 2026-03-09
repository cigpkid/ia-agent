// src/unidades/unidades.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Unidad } from './entities/unidad.entity';

@Injectable()
export class AvlService {
  constructor(
    @InjectRepository(Unidad, 'avl')
    private readonly unidadRepo: Repository<Unidad>,
  ) {}

  async obtenerUnidadesNoc(filtros: {
    unidad_ids?: number[];
    imeis?: string[];
    placas?: string[];
    solo_suspendidas?: boolean;
    horas_sin_comunicacion?: number;
    solo_mas_reciente?: boolean;
  }) {
    const {
      unidad_ids,
      imeis,
      placas,
      solo_suspendidas,
      horas_sin_comunicacion,
      solo_mas_reciente,
    } = filtros;

    const query = this.unidadRepo
      .createQueryBuilder('u')
      .leftJoin('u.ultimaPosicion', 'up')
      .leftJoin('u.dispositivosRelacion', 'ud')
      .leftJoin('ud.dispositivo', 'd')
      .select([
        'u.n_unidad_id AS unidad_id',
        'u.c_unidad_nombre AS unidad_nombre',
        'u.c_unidad_placa AS placa',
        'u.b_unidad_suspendida AS suspendida',
        'd.c_dispositivo_imei AS imei',
        'up.d_ultimaposicion_fechaequipo AS ultima_fecha',
        `
        TIMESTAMPDIFF(
          HOUR,
          up.d_ultimaposicion_fechaequipo,
          NOW()
        ) AS horas_sin_comunicacion
        `,
      ]);

    /* =========================
       FILTROS
       ========================= */

    if (unidad_ids?.length) {
      query.andWhere('u.n_unidad_id IN (:...unidadIds)', {
        unidadIds: unidad_ids,
      });
    }

    if (imeis?.length) {
      query.andWhere('d.c_dispositivo_imei IN (:...imeis)', { imeis });
    }

    if (placas?.length) {
      query.andWhere('u.c_unidad_placa IN (:...placas)', { placas });
    }

    if (solo_suspendidas === true) {
      query.andWhere('u.b_unidad_suspendida = 1');
    }

    if (horas_sin_comunicacion) {
      query.andWhere(
        `
        up.d_ultimaposicion_fechaequipo IS NULL
        OR TIMESTAMPDIFF(
          HOUR,
          up.d_ultimaposicion_fechaequipo,
          NOW()
        ) >= :horas
        `,
        { horas: horas_sin_comunicacion },
      );
    }

    /* =========================
       MÁS RECIENTE (POR UNIDAD)
       ========================= */

    if (solo_mas_reciente === true) {
      query.andWhere(`
        up.d_ultimaposicion_fechaequipo = (
          SELECT MAX(up2.d_ultimaposicion_fechaequipo)
          FROM dat_UltimaPosicion up2
          WHERE up2.n_unidad_id = u.n_unidad_id
        )
      `);
    }

    /* =========================
       EJECUCIÓN
       ========================= */

const [sql, params] = query.getQueryAndParameters();
console.log('SQL:', sql);
console.log('PARAMS:', params);
    const rows = await query.getRawMany();

    /* =========================
       NORMALIZACIÓN NOC
       ========================= */

    const unidadesMap = new Map<number, any>();

    for (const row of rows) {
      if (!unidadesMap.has(row.unidad_id)) {
        unidadesMap.set(row.unidad_id, {
          unidad_id: row.unidad_id,
          unidad_nombre: row.unidad_nombre,
          placa: row.placa,
          suspendida: row.suspendida,
          imei: row.imei,
          ultima_fecha: row.ultima_fecha,
          horas_sin_comunicacion: row.horas_sin_comunicacion,
        });
      }
    }

    const unidades = Array.from(unidadesMap.values());

    return {
      total_solicitadas:
        unidad_ids?.length ??
        imeis?.length ??
        placas?.length ??
        0,
      total_encontradas: unidades.length,
      unidades,
    };
  }
}