import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SimpleTasksController } from './simple-tasks.controller';
import { SimpleTasksService } from './simple-tasks.service';
import { TaskAutoRunnerService } from './task-auto-runner.service';
import { Task } from '../task-scheduler/entities/task.entity';
import { TaskExecutionLog } from '../task-scheduler/entities/task-execution-log.entity';
import { FacebookAccount } from '../facebook-accounts/entities/facebook-account.entity';
import { AuthModule } from '../auth/auth.module';
import { FacebookAccountsModule } from '../facebook-accounts/facebook-accounts.module';
import { ChatScriptsModule } from '../chat-scripts/chat-scripts.module';
import { TaskExecutorModule } from '../task-executor/task-executor.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, TaskExecutionLog, FacebookAccount]),
    AuthModule,
    FacebookAccountsModule,
    ChatScriptsModule,
    TaskExecutorModule,
  ],
  controllers: [SimpleTasksController],
  providers: [SimpleTasksService, TaskAutoRunnerService],
  exports: [SimpleTasksService],
})
export class SimpleTasksModule {}
