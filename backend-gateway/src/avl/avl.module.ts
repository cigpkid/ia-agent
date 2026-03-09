// src/unidades/unidades.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Unidad } from './entities/unidad.entity';
import { UltimaPosicion } from './entities/ultima-posicion.entity';
import { Dispositivo } from './entities/dispositivo.entity';
import { UnidadDispositivo } from './entities/unidad-dispositivo.entity';
import { AvlService } from './avl.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Unidad,
      UltimaPosicion,
      Dispositivo,
      UnidadDispositivo
    ],'avl')
  ],
  providers: [AvlService],
  exports: [AvlService] // Para que MCP lo use
})
export class AvlModule {}
