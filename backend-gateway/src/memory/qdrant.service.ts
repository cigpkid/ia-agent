import { Injectable } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';

@Injectable()
export class QdrantService {
  private readonly client = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://localhost:6333',
  });

  async searchByText(_text: string) {
    // Placeholder seguro para no romper despliegue inicial.
    // Aquí integrarás embeddings reales en el siguiente paso.
    return [];
  }

  async upsertText(_text: string) {
    // Placeholder seguro para no romper despliegue inicial.
    return true;
  }
}
