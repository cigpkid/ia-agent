import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { QdrantService } from './qdrant.service';

@Module({
  providers: [MemoryService, QdrantService],
  exports: [MemoryService, QdrantService],
})
export class MemoryModule {}
