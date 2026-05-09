import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountBatchService } from './account-batch.service';
import { AccountBatchController } from './account-batch.controller';
import { BatchOperation } from './entities/batch-operation.entity';
import { FacebookAccount } from '../facebook-accounts/entities/facebook-account.entity';
import { BatchProcessor } from './processors/batch.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([BatchOperation, FacebookAccount]),
    BullModule.registerQueue({
      name: 'batch-operations',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        timeout: 300000, // 5分钟超时
      },
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  controllers: [AccountBatchController],
  providers: [AccountBatchService, BatchProcessor],
  exports: [AccountBatchService],
})
export class AccountBatchModule {}