import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Column
} from 'typeorm';
import { Unidad } from './unidad.entity';
import { Dispositivo } from './dispositivo.entity';

@Entity('rel_UnidadDispositivo')
export class UnidadDispositivo {

  @PrimaryGeneratedColumn({ name: 'n_unidaddispositivo_id' })
  id: number;

  @Column({ name: 'n_estatus_id' })
  estatusId: number;

  @ManyToOne(() => Unidad, unidad => unidad.dispositivosRelacion)
  @JoinColumn({ name: 'n_unidad_id' })
  unidad: Unidad;

  @ManyToOne(() => Dispositivo, dispositivo => dispositivo.unidadesRelacion)
  @JoinColumn({ name: 'n_dispositivo_id' })
  dispositivo: Dispositivo;
}
