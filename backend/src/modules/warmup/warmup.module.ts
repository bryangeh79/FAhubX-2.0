import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarmupService } from './warmup.service';
import { WarmupController } from './warmup.controller';
import { WarmupProgress } from './entities/warmup-progress.entity';
import { FacebookAccount } from '../facebook-accounts/entities/facebook-account.entity';
import { Task } from '../task-scheduler/entities/task.entity';
import { TaskExecutorModule } from '../task-executor/task-executor.module';
import { SimpleTasksModule } from '../simple-tasks/simple-tasks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WarmupProgress, FacebookAccount, Task]),
    TaskExecutorModule, // v1.3.0：调度器直接调 action services
    SimpleTasksModule, // 需要 SimpleTasksService.persistLogsToDb + appendLog
  ],
  providers: [WarmupService],
  controllers: [WarmupController],
  exports: [WarmupService],
})
export class WarmupModule {}
