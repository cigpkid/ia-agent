import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany
} from 'typeorm';
import { UnidadDispositivo } from './unidad-dispositivo.entity';

@Entity('dat_Dispositivo')
export class Dispositivo {

  @PrimaryGeneratedColumn({ name: 'n_dispositivo_id' })
  id: number;

  @Column({ name: 'c_dispositivo_imei' })
  imei: string;

  @Column({ name: 'c_dispositivo_sim' })
  sim: string;

  @Column({ name: 'c_dispositivo_linea' })
  linea: string;

  @Column({ name: 'n_estatus_id' })
  estatusId: number;

  @OneToMany(() => UnidadDispositivo, ud => ud.dispositivo)
  unidadesRelacion: UnidadDispositivo[];
}
