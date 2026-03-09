import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { MessageEntity } from './entities/message.entity';
import { McpModule } from '../mcp/mcp.module';
import { LlmModule } from '../llm/llm.module';
import { AgentModule } from '../agent/agent.module';
import { ResponseFormatterService } from './response.formatter';
import { ChatController } from './chat.controller';

@Module({
  controllers: [ChatController],
  imports: [
    TypeOrmModule.forFeature([MessageEntity], 'local'),
    McpModule,
    LlmModule,
    AgentModule,
  ],
  providers: [ChatService, ChatGateway, ResponseFormatterService],
  exports: [ChatService],
})
export class ChatModule {}