import { Injectable } from '@nestjs/common';
import { AvlService } from 'src/avl/avl.service';
import { ConsultarUnidadesTool } from 'src/tools/consultar-unidades.tool';

@Injectable()
export class ToolRouter {
  constructor(private readonly avlService: AvlService) {}

  async execute(name: string, params: any) {
    switch (name) {
      case 'consultar_unidades': {
        const tool = new ConsultarUnidadesTool(this.avlService);
        return tool.execute(params);
      }
      default:
        throw new Error(`Tool no encontrada: ${name}`);
    }
  }
}
