import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { TaskSchedulerService } from './task-scheduler.service';
import { TaskSchedulerController } from './task-scheduler.controller';
import { Task } from './entities/task.entity';
import { TaskExecutionLog } from './entities/task-execution-log.entity';
import { TaskQueueModule } from '../task-queue/task-queue.module';
import { TaskExecutorModule } from '../task-executor/task-executor.module';
import { AccountManagerModule } from '../account-manager/account-manager.module';
import { TaskMonitorModule } from '../task-monitor/task-monitor.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, TaskExecutionLog]),
    BullModule.registerQueue({
      name: 'task-queue',
    }),
    ScheduleModule.forRoot(),
    TaskQueueModule,
    TaskExecutorModule,
    AccountManagerModule,
    TaskMonitorModule,
  ],
  controllers: [TaskSchedulerController],
  providers: [TaskSchedulerService],
  exports: [TaskSchedulerService],
})
export class TaskSchedulerModule {}