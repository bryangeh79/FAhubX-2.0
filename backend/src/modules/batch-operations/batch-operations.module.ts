import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BatchOperationsService } from './batch-operations.service';
import { BatchOperationsController } from './batch-operations.controller';
import { TaskSchedulerModule } from '../task-scheduler/task-scheduler.module';
import { Task } from '../task-scheduler/entities/task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task]),
    TaskSchedulerModule,
  ],
  controllers: [BatchOperationsController],
  providers: [BatchOperationsService],
  exports: [BatchOperationsService],
})
export class BatchOperationsModule {}