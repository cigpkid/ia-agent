import { Injectable } from '@nestjs/common';
import { QdrantService } from './qdrant.service';

@Injectable()
export class MemoryService {
  private readonly memory = new Map<string, any[]>();

  constructor(private readonly qdrantService: QdrantService) {}

  async getContext(conversationId: string, text: string) {
    const shortMemory = this.memory.get(conversationId) ?? [];
    let semanticMemory: any[] = [];

    try {
      semanticMemory = await this.qdrantService.searchByText(text);
    } catch {
      semanticMemory = [];
    }

    return {
      shortMemory: shortMemory.slice(-5),
      semanticMemory,
    };
  }

  async saveMemory(conversationId: string, item: any) {
    const current = this.memory.get(conversationId) ?? [];
    current.push(item);
    this.memory.set(conversationId, current.slice(-20));

    try {
      await this.qdrantService.upsertText(JSON.stringify(item));
    } catch {
      // fallback silencioso si Qdrant no está disponible
    }
  }
}
