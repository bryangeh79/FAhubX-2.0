import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { VPNClientService } from './services/vpn-client.service';
import { ConfigValidatorService } from './services/config-validator.service';
import { NetworkMonitorService } from './services/network-monitor.service';
import { NetworkAutomationService } from './services/network-automation.service';
import { VPNClientController } from './controllers/vpn-client.controller';

import { VPNConfig } from './entities/vpn-config.entity';
import { IPPool } from './entities/ip-pool.entity';
import { AccountIPMapping } from './entities/account-ip-mapping.entity';
import { NetworkMonitorLog } from './entities/network-monitor-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VPNConfig,
      IPPool,
      AccountIPMapping,
      NetworkMonitorLog,
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [VPNClientController],
  providers: [
    VPNClientService,
    ConfigValidatorService,
    NetworkMonitorService,
    NetworkAutomationService,
  ],
  exports: [
    VPNClientService,
    ConfigValidatorService,
    NetworkMonitorService,
    NetworkAutomationService,
  ],
})
export class VPNClientModule {}