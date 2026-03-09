import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChatModule } from './chat/chat.module';
import { McpModule } from './mcp/mcp.module';
import { ConfigModule } from '@nestjs/config';
import { LlmModule } from './llm/llm.module';
import { MessageEntity } from './chat/entities/message.entity';
import llmConfig from './config/llm.config';
import { AvlModule } from './avl/avl.module';
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

    TypeOrmModule.forRoot({
      name: llmConfig[0].db.avl.name,
      type: 'mysql',
      host: llmConfig[0].db.avl.host,
      port: llmConfig[0].db.avl.port,
      username: llmConfig[0].db.avl.username,
      password: llmConfig[0].db.avl.password,
      database: llmConfig[0].db.avl.database,
      entities: [Unidad,UnidadDispositivo,UltimaPosicion,Dispositivo],
      synchronize: llmConfig[0].db.avl.synchronize,
      dateStrings: llmConfig[0].db.avl.dateStrings,
      retryAttempts: llmConfig[0].db.avl.retryAttempts,
      retryDelay: llmConfig[0].db.avl.retryDelay, // Reintenta cada 3 segundos
    }),

    LlmModule,
    AvlModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
