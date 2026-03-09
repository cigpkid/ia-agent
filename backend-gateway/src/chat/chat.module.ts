import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { McpModule } from '../mcp/mcp.module'; // <--- Importa el módulo
import { LlmModule } from 'src/llm/llm.module';
import { SummaryService } from 'src/llm/summary.service';
import { VectorService } from 'src/llm/vector.service';
import { MessageEntity } from './entities/message.entity';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [LlmModule, McpModule, TypeOrmModule.forFeature([MessageEntity],'local')],
  controllers: [ChatController],
  providers: [ChatService,SummaryService,VectorService,ChatGateway],
})
export class ChatModule {}
