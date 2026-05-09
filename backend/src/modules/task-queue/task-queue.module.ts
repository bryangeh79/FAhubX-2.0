import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { TaskQueueService } from './task-queue.service';
import { AccountManagerModule } from '../account-manager/account-manager.module';
import { TaskExecutorModule } from '../task-executor/task-executor.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'task-queue',
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 100, // 保留最近100个完成的任务
        removeOnFail: 1000, // 保留最近1000个失败的任务
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    }),
    AccountManagerModule,
    TaskExecutorModule,
  ],
  providers: [TaskQueueService],
  exports: [TaskQueueService],
})
export class TaskQueueModule {}