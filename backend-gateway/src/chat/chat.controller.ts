import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Delete,
} from '@nestjs/common';
import { ChatService } from './chat.service';

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

  @Get('sessions/:userId')
  async getSessions(@Param('userId') userId: string) {
    return this.chatService.getSessionsByUser(userId);
  }
}