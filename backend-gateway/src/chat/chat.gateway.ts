import { 
  WebSocketGateway, 
  WebSocketServer, 
  SubscribeMessage, 
  MessageBody, 
  ConnectedSocket 
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway(3001, { // <--- Forzamos el puerto 3000 aquí
  cors: {
    origin: 'http://localhost:5173', // La URL de tu React
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'], 
})
export class ChatGateway {
  @WebSocketServer() server: Server;

  constructor(private readonly chatService: ChatService) {}

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { prompt: string; userId: string; sessionId: string; image?: string }
  ) {
    // 1. Estado inicial
    client.emit('status', { state: 'thinking' });

    // 2. Ejecutar proceso con callbacks para streaming
    await this.chatService.processMessage(
      data.prompt,
      data.userId,
      data.sessionId,
      data.image,
      // Callback para texto (chunks)
      (chunk) => client.emit('contentChunk', { text: chunk }),
      // Callback para Tools
      (toolName) => client.emit('status', { state: 'executing_tool', tool: toolName })
    );

    // 3. Notificar fin de respuesta
    client.emit('responseFinished');
    client.emit('status', { state: 'idle' });
  }
}
