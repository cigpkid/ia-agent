import { Injectable, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import type { ConfigType } from '@nestjs/config';
import llmConfig from 'src/config/llm.config';

@Injectable()
export class VectorService implements OnModuleInit {
  private client: QdrantClient;
  private readonly collectionName = 'user_memories';
  private readonly logger = new Logger(VectorService.name);
  private configValue: ConfigType<typeof llmConfig>;

  constructor(
    @Inject(llmConfig.KEY) config: ConfigType<typeof llmConfig>,
  ) {
    this.configValue = config;
  }  

  async onModuleInit() {
    this.client = new QdrantClient({ url: this.configValue.memory.vector }); //host: 'qdrant', port: 6333
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (c) => c.name === this.collectionName,
      );

      if (!exists) {
        await this.client.createCollection(this.collectionName, {
          vectors: { size: 4096, distance: 'Cosine' }, // Tamaño para Llama 3 / Ollama
        });
        this.logger.log(`✅ Colección ${this.collectionName} creada en Qdrant`);
      }
    } catch (e) {
      this.logger.error('❌ Error al conectar con Qdrant:', e.message);
    }
  }

  // Generar vector usando Ollama (Gratis)
  async getEmbedding(text: string): Promise<number[]> {
    try {
      const response = await axios.post(`${this.configValue.memory.vectorProvider}/embeddings`, { //'http://ollama:11434/api/embeddings'
        model: this.configValue.memory.vectorProviderModel,//'llama3.1:8b', // Asegúrate de tener este modelo en Ollama
        prompt: text,
      });
      return response.data.embedding;
    } catch (error) {
      this.logger.error(
        'Error al generar embedding con Ollama:',
        error.message,
      );
      return new Array(4096).fill(0); // Fallback
    }
  }

  async saveMemory(userId: string, text: string, sessionId: string) {
    // <-- Agregamos sessionId
    const vector = await this.getEmbedding(text);
    return await this.client.upsert(this.collectionName, {
      points: [
        {
          id: uuidv4(),
          vector: vector,
          payload: {
            userId,
            sessionId, // <-- Guardamos la sesión
            content: text,
            date: new Date().toISOString(),
          },
        },
      ],
    });
  }

  // src/llm/vector.service.ts
  async deleteSessionMemory(userId: string, sessionId: string) {
    return await this.client.delete(this.collectionName, {
      filter: {
        must: [
          { key: 'userId', match: { value: userId } },
          { key: 'sessionId', match: { value: sessionId } }
        ]
      }
    });
  }

  async findRelevantContext(
    userId: string,
    query: string,
    sessionId: string,
  ): Promise<string> {
    const vector = await this.getEmbedding(query);
    try {
      const results = await this.client.search(this.collectionName, {
        vector: vector,
        filter: {
          must: [
            { key: 'userId', match: { value: userId } },
            { key: 'sessionId', match: { value: sessionId } }, // <-- Filtro estricto
          ],
        },
        limit: 3,
      });
      return results
        .filter((r) => r.payload && typeof r.payload.content === 'string')
        .map((r) => r.payload!.content as string)
        .join('\n---\n');
    } catch (e) {
      return '';
    }
  }
}
