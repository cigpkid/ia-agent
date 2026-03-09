import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './chat/chat.module';
import { McpModule } from './mcp/mcp.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LlmModule } from './llm/llm.module';
import { MessageEntity } from './chat/entities/message.entity';
import llmConfig from './config/llm.config';
import { AvlModule } from './avl/avl.module';
import { AgentModule } from './agent/agent.module';
import { Unidad } from './avl/entities/unidad.entity';
import { UnidadDispositivo } from './avl/entities/unidad-dispositivo.entity';
import { UltimaPosicion } from './avl/entities/ultima-posicion.entity';
import { Dispositivo } from './avl/entities/dispositivo.entity';

@Module({
  imports: [
    ChatModule,
    McpModule,

    ConfigModule.forRoot({
      isGlobal: true,
      load: [llmConfig],
      envFilePath: '.env', // Asegúrate de tener este archivo en la raíz
    }),

    TypeOrmModule.forRoot({
      name: 'local',
      type: 'mysql',
      host: 'mysql-db',
      port: 3306,
      username: 'ia_user',
      password: 'ia_pass',
      database: 'ia_chat_db',
      entities: [MessageEntity],
      synchronize: false,
      retryAttempts: 10,
      retryDelay: 3000, // Reintenta cada 3 segundos
    }),

    TypeOrmModule.forRootAsync({
      name: 'avl',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          name: configService.get<string>('llm.db.avl.name') || 'avl',
          type: 'mysql' as const,
          host: configService.get<string>('llm.db.avl.host'),
          port: configService.get<number>('llm.db.avl.port'),
          username: configService.get<string>('llm.db.avl.username'),
          password: configService.get<string>('llm.db.avl.password'),
          database: configService.get<string>('llm.db.avl.database'),
          entities: [Unidad, UnidadDispositivo, UltimaPosicion, Dispositivo],
          synchronize: configService.get<boolean>('llm.db.avl.synchronize'),
          retryAttempts: configService.get<number>('llm.db.avl.retryAttempts') || 10,
          retryDelay: configService.get<number>('llm.db.avl.retryDelay') || 3000,
          extra: {
            dateStrings: configService.get<boolean>('llm.db.avl.dateStrings') ?? true,
          },
        };
      },
    }),

    LlmModule,
    AvlModule,
    AgentModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
