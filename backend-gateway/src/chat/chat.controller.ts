import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Get,
  Param,
  Delete,
} from '@nestjs/common';
import { ChatService } from './chat.service';

// Definimos una interfaz sencilla para validar la entrada
interface ChatRequest {
  prompt: string;
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Delete('session/:userId/:sessionId')
  async deleteSession(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return await this.chatService.deleteChat(userId, sessionId);
  }

  @Get('history/:sessionId')
  async getHistory(@Param('sessionId') sessionId: string) {
    return await this.chatService.getMessagesBySession(sessionId);
  }

  @Post('process')
  async processMessage(
    @Body()
    body: {
      prompt: string;
      image?: string;
      userId: string;
      sessionId: string;
    },
  ) {
    return await this.chatService.processMessage(
      body.prompt,
      body.userId,
      body.sessionId,
      body.image,
    );
  }
  /*@Post('process')
  async processMessage(@Body() body: ChatRequest) {
    // 1. Validación básica del input
    if (!body.prompt || body.prompt.trim() === '') {
      throw new HttpException('El prompt es requerido', HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.chatService.processMessage(body.prompt);
      
      return {
        status: 'success',
        response: result.response,
        // Eliminamos toolUsed o lo dejamos como null si tu frontend lo espera
        toolUsed: null, 
      };    
    } catch (error) {
      console.error('Error en el Orquestador de IA:', error);
      
      throw new HttpException(
        'Error procesando la solicitud con la IA',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }*/
}
