import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AccountRecoveryService } from './account-recovery.service';
import { AccountRecoveryController } from './account-recovery.controller';
import { RecoveryLog } from './entities/recovery-log.entity';
import { FacebookAccount } from '../facebook-accounts/entities/facebook-account.entity';
import { AccountHealthModule } from '../account-health/account-health.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecoveryLog, FacebookAccount]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    AccountHealthModule,
  ],
  controllers: [AccountRecoveryController],
  providers: [AccountRecoveryService],
  exports: [AccountRecoveryService],
})
export class AccountRecoveryModule {}