import {
  Entity,
  PrimaryColumn,
  Column,
  OneToOne,
  JoinColumn
} from 'typeorm';
import { Unidad } from './unidad.entity';

@Entity('dat_UltimaPosicion')
export class UltimaPosicion {

  @PrimaryColumn({ name: 'n_unidad_id' })
  unidadId: number;

  @Column({ name: 'd_ultimaposicion_fechaequipo', nullable: true })
  fechaEquipo: Date;

  @Column({ name: 'n_ultimaposicion_latitude', type: 'double' })
  latitud: number;

  @Column({ name: 'n_ultimaposicion_longitude', type: 'double' })
  longitud: number;

  @Column({ name: 'n_ultimaposicion_velocidad', type: 'double' })
  velocidad: number;

  @Column({ name: 'n_ultimaposicion_bateria', type: 'tinyint', nullable: true })
  bateria: number;

  @Column({ name: 'b_ultimaposicion_paromotor', type: 'char', length: 1 })
  paroMotor: string;

  @OneToOne(() => Unidad, unidad => unidad.ultimaPosicion)
  @JoinColumn({ name: 'n_unidad_id' })
  unidad: Unidad;
}
