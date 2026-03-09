import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, SelectQueryBuilder } from 'typeorm';
import { Unidad } from './entities/unidad.entity';

type ObtenerUnidadesNocFiltros = {
  unidad_ids?: number[];
  unidad_nombres?: string[];
  imeis?: string[];
  placas?: string[];
  vins?: string[];
  solo_suspendidas?: boolean;
  horas_sin_comunicacion?: number;
  solo_mas_reciente?: boolean;
  busqueda_parcial_nombre?: boolean;
  busqueda_parcial_placa?: boolean;
};

@Injectable()
export class AvlService {
  constructor(
    @InjectRepository(Unidad, 'avl')
    private readonly unidadRepo: Repository<Unidad>,
  ) {}

  async obtenerUnidadesNoc(filtros: ObtenerUnidadesNocFiltros) {
    const {
      unidad_ids,
      unidad_nombres,
      imeis,
      placas,
      vins,
      solo_suspendidas,
      horas_sin_comunicacion,
      solo_mas_reciente,
      busqueda_parcial_nombre,
      busqueda_parcial_placa,
    } = filtros;

    // =========================
    // 1. BÚSQUEDA PRINCIPAL
    // =========================
    const query = this.buildBaseQuery();

    this.applyCommonFilters(query, {
      unidad_ids,
      unidad_nombres,
      imeis,
      placas,
      vins,
      solo_suspendidas,
      horas_sin_comunicacion,
      solo_mas_reciente,
      busqueda_parcial_nombre: !!busqueda_parcial_nombre,
      busqueda_parcial_placa: !!busqueda_parcial_placa,
    });

    const unidades = await query.getRawMany();

    // =========================
    // 2. FALLBACK AUTOMÁTICO POR NOMBRE
    // =========================
    if (
      unidades.length === 0 &&
      unidad_nombres?.length &&
      !busqueda_parcial_nombre
    ) {
      const retryByName = this.buildBaseQuery();

      this.applyCommonFilters(retryByName, {
        unidad_ids,
        unidad_nombres,
        imeis,
        placas,
        vins,
        solo_suspendidas,
        horas_sin_comunicacion,
        solo_mas_reciente,
        busqueda_parcial_nombre: true,
        busqueda_parcial_placa: !!busqueda_parcial_placa,
      });

      const retryResults = await retryByName.getRawMany();

      return {
        total_solicitadas: this.countSolicitadas({
          unidad_ids,
          unidad_nombres,
          imeis,
          placas,
          vins,
        }),
        total_encontradas: retryResults.length,
        estrategia_busqueda: 'fallback_like_nombre',
        unidades: retryResults,
      };
    }

    // =========================
    // 3. FALLBACK AUTOMÁTICO POR PLACA
    // =========================
    if (
      unidades.length === 0 &&
      placas?.length &&
      !busqueda_parcial_placa
    ) {
      const retryByPlaca = this.buildBaseQuery();

      this.applyCommonFilters(retryByPlaca, {
        unidad_ids,
        unidad_nombres,
        imeis,
        placas,
        vins,
        solo_suspendidas,
        horas_sin_comunicacion,
        solo_mas_reciente,
        busqueda_parcial_nombre: !!busqueda_parcial_nombre,
        busqueda_parcial_placa: true,
      });

      const retryResults = await retryByPlaca.getRawMany();

      return {
        total_solicitadas: this.countSolicitadas({
          unidad_ids,
          unidad_nombres,
          imeis,
          placas,
          vins,
        }),
        total_encontradas: retryResults.length,
        estrategia_busqueda: 'fallback_like_placa',
        unidades: retryResults,
      };
    }

    // =========================
    // 4. RESPUESTA NORMAL
    // =========================
    return {
      total_solicitadas: this.countSolicitadas({
        unidad_ids,
        unidad_nombres,
        imeis,
        placas,
        vins,
      }),
      total_encontradas: unidades.length,
      estrategia_busqueda: 'exacta',
      unidades,
    };
  }

  private buildBaseQuery(): SelectQueryBuilder<Unidad> {
    return this.unidadRepo
      .createQueryBuilder('u')
      .leftJoin('u.ultimaPosicion', 'up')
      .leftJoin('u.dispositivosRelacion', 'ud')
      .leftJoin('ud.dispositivo', 'd')
      .select([
        'u.n_unidad_id AS unidad_id',
        'u.c_unidad_nombre AS unidad_nombre',
        'u.c_unidad_placa AS placa',
        'u.c_unidad_vin AS vin',
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
  }

  private applyCommonFilters(
    query: SelectQueryBuilder<Unidad>,
    filtros: ObtenerUnidadesNocFiltros,
  ) {
    const {
      unidad_ids,
      unidad_nombres,
      imeis,
      placas,
      vins,
      solo_suspendidas,
      horas_sin_comunicacion,
      solo_mas_reciente,
      busqueda_parcial_nombre,
      busqueda_parcial_placa,
    } = filtros;

    // =========================
    // FILTRO POR ID
    // =========================
    if (unidad_ids?.length) {
      query.andWhere('u.n_unidad_id IN (:...unidadIds)', {
        unidadIds: unidad_ids,
      });
    }

    // =========================
    // FILTRO POR NOMBRE
    // =========================
    if (unidad_nombres?.length) {
      if (busqueda_parcial_nombre) {
        query.andWhere(
          new Brackets((qb) => {
            unidad_nombres.forEach((nombre, index) => {
              qb.orWhere(`u.c_unidad_nombre LIKE :unidadNombre${index}`, {
                [`unidadNombre${index}`]: `%${nombre}%`,
              });
            });
          }),
        );
      } else {
        query.andWhere('u.c_unidad_nombre IN (:...unidadNombres)', {
          unidadNombres: unidad_nombres,
        });
      }
    }

    // =========================
    // FILTRO POR IMEI
    // =========================
    if (imeis?.length) {
      query.andWhere('d.c_dispositivo_imei IN (:...imeis)', { imeis });
    }

    // =========================
    // FILTRO POR PLACA
    // =========================
    if (placas?.length) {
      if (busqueda_parcial_placa) {
        query.andWhere(
          new Brackets((qb) => {
            placas.forEach((placa, index) => {
              qb.orWhere(`u.c_unidad_placa LIKE :placa${index}`, {
                [`placa${index}`]: `%${placa}%`,
              });
            });
          }),
        );
      } else {
        query.andWhere('u.c_unidad_placa IN (:...placas)', { placas });
      }
    }

    // =========================
    // FILTRO POR VIN
    // =========================
    if (vins?.length) {
      query.andWhere('u.c_unidad_vin IN (:...vins)', { vins });
    }

    // =========================
    // FILTRO SOLO SUSPENDIDAS
    // =========================
    if (solo_suspendidas === true) {
      query.andWhere("u.b_unidad_suspendida = '1'");
    }

    // =========================
    // FILTRO HORAS SIN COMUNICACIÓN
    // =========================
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

    // =========================
    // SOLO MÁS RECIENTE
    // =========================
    if (solo_mas_reciente === true) {
      query
        .andWhere('up.d_ultimaposicion_fechaequipo IS NOT NULL')
        .orderBy('up.d_ultimaposicion_fechaequipo', 'DESC')
        .limit(5);
    }
  }

  private countSolicitadas(filtros: {
    unidad_ids?: number[];
    unidad_nombres?: string[];
    imeis?: string[];
    placas?: string[];
    vins?: string[];
  }): number {
    return (
      (filtros.unidad_ids?.length || 0) +
      (filtros.unidad_nombres?.length || 0) +
      (filtros.imeis?.length || 0) +
      (filtros.placas?.length || 0) +
      (filtros.vins?.length || 0)
    );
  }
}