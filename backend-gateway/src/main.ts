import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Aumentamos el límite para recibir imágenes en Base64
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));

  app.enableCors();

  // 1. Conexión a NATS para mensajería entre microservicios
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.NATS,
    options: { servers: [process.env.NATS_URL || 'nats://localhost:4222'] },
  });

  app.enableCors(); // Para que React se conecte
  await app.startAllMicroservices();
  await app.listen(3000); // Puerto para HTTP (React y MCP SSE)
}
bootstrap();
