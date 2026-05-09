import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { VpnIntegrationService } from './vpn-integration.service';
import { VpnIntegrationController } from './vpn-integration.controller';
import { VpnConfig } from './entities/vpn-config.entity';
import { IpPool } from './entities/ip-pool.entity';
import { FacebookAccount } from '../facebook-accounts/entities/facebook-account.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([VpnConfig, IpPool, FacebookAccount]),
    ScheduleModule.forRoot(),
  ],
  controllers: [VpnIntegrationController],
  providers: [VpnIntegrationService],
  exports: [VpnIntegrationService],
})
export class VpnIntegrationModule {}