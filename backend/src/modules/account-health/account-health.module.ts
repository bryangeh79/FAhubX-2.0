import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AccountHealthService } from './account-health.service';
import { AccountHealthController } from './account-health.controller';
import { HealthCheckLog } from './entities/health-check-log.entity';
import { HealthAlert } from './entities/health-alert.entity';
import { FacebookAccount } from '../facebook-accounts/entities/facebook-account.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([HealthCheckLog, HealthAlert, FacebookAccount]),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
  ],
  controllers: [AccountHealthController],
  providers: [AccountHealthService],
  exports: [AccountHealthService],
})
export class AccountHealthModule {}