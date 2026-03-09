import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  OneToOne,
  JoinColumn
} from 'typeorm';
import { UnidadDispositivo } from './unidad-dispositivo.entity';
import { UltimaPosicion } from './ultima-posicion.entity';

@Entity('dat_Unidad')
export class Unidad {

  @PrimaryGeneratedColumn({ name: 'n_unidad_id' })
  id: number;

  @Column({ name: 'n_cliente_id' })
  clienteId: number;

  @Column({ name: 'n_estatus_id' })
  estatusId: number;

  @Column({ name: 'b_unidad_suspendida', type: 'char', length: 1 })
  suspendida: string;

  @Column({ name: 'c_unidad_nombre' })
  nombre: string;

  @Column({ name: 'c_unidad_alias' })
  alias: string;

  @Column({ name: 'c_unidad_marca' })
  marca: string;

  @Column({ name: 'c_unidad_modelo' })
  modelo: string;

  @Column({ name: 'c_unidad_anio' })
  anio: string;

  @Column({ name: 'c_unidad_placa' })
  placa: string;

  @Column({ name: 'd_unidad_fechainstalacion', nullable: true })
  fechaInstalacion: Date;

  // 🔹 Relaciones

  @OneToMany(() => UnidadDispositivo, ud => ud.unidad)
  dispositivosRelacion: UnidadDispositivo[];

  @OneToOne(() => UltimaPosicion, up => up.unidad)
  ultimaPosicion: UltimaPosicion;
}
