import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountManagerService } from './account-manager.service';
import { AccountStatusEntity } from './entities/account-status.entity';
import { FacebookAccount } from '../facebook-accounts/entities/facebook-account.entity';
import { Task } from '../task-scheduler/entities/task.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountStatusEntity, FacebookAccount, Task]),
    ScheduleModule.forRoot(),
  ],
  providers: [AccountManagerService],
  exports: [AccountManagerService],
})
export class AccountManagerModule {}