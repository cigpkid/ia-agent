import { Module } from '@nestjs/common';
import { McpService } from './mcp.service';
import { McpController } from './mcp.controller';
import { LlmModule } from 'src/llm/llm.module';
import { AvlModule } from 'src/avl/avl.module';

@Module({
  controllers: [McpController],
  providers: [McpService],
  exports: [McpService],
  imports: [LlmModule,AvlModule]
})
export class McpModule {}


