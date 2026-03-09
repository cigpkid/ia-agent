import { Module } from '@nestjs/common';
import { AvlModule } from 'src/avl/avl.module';
import { AgentService } from './agent.service';
import { IntentResolver } from './intent.resolver';
import { MemoryModule } from 'src/memory/memory.module';
import { PlannerService } from './planner.service';

@Module({
  imports: [AvlModule, MemoryModule],
  providers: [AgentService, IntentResolver, PlannerService],
  exports: [AgentService,PlannerService],
})
export class AgentModule {}
