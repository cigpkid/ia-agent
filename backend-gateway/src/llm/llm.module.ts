import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LlmParser } from './llm.parser';
import { SummaryService } from './summary.service';
import { VectorService } from './vector.service';

@Module({
  providers: [LlmService, LlmParser, SummaryService,VectorService],
  exports: [LlmService,VectorService,SummaryService],
})
export class LlmModule {}
