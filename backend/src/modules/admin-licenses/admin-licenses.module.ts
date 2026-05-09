import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminLicensesController } from './admin-licenses.controller';

@Module({
  imports: [ConfigModule],
  controllers: [AdminLicensesController],
})
export class AdminLicensesModule {}
