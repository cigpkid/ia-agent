import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway(3001, {
  cors: {
    origin: 'http://localhost:5173',
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
    @MessageBody()
    data: { prompt: string; userId: string; sessionId: string; image?: string },
  ) {
    client.emit('status', { state: 'thinking' });

    const result = await this.chatService.processMessage(
      data.prompt,
      data.userId,
      data.sessionId,
      data.image,
      (chunk) => client.emit('contentChunk', { text: chunk }),
      (toolName) =>
        client.emit('status', { state: 'executing_tool', tool: toolName }),
    );

    client.emit('responseFinished', {
      response: result.response,
      ui: result.ui || null,
    });

    client.emit('status', { state: 'idle' });
  }
}