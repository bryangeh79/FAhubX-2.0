import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VpnController } from './vpn.controller';
import { VpnService } from './vpn.service';
import { VpnConfig } from '../vpn-integration/entities/vpn-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VpnConfig])],
  controllers: [VpnController],
  providers: [VpnService],
  exports: [VpnService],
})
export class VpnModule {}
