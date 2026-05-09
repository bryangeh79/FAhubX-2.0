import { Module } from '@nestjs/common';
import { TaskMonitorGateway } from './task-monitor.gateway';
import { TaskSchedulerModule } from '../task-scheduler/task-scheduler.module';
import { TaskQueueModule } from '../task-queue/task-queue.module';
import { AccountManagerModule } from '../account-manager/account-manager.module';

@Module({
  imports: [
    TaskSchedulerModule,
    TaskQueueModule,
    AccountManagerModule,
  ],
  providers: [TaskMonitorGateway],
  exports: [TaskMonitorGateway],
})
export class TaskMonitorModule {}