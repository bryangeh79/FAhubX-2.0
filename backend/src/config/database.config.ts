import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

@Injectable()
export class DatabaseConfig implements TypeOrmOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: 'postgres',
      host: this.configService.get('database.host', 'localhost'),
      port: this.configService.get<number>('database.port', 5432),
      database: this.configService.get('database.name', 'fbautobot'),
      username: this.configService.get('database.user', 'postgres'),
      password: this.configService.get('database.password', 'password'),
      entities: [
        join(__dirname, '../modules/auth/**/*.entity{.ts,.js}'),
        join(__dirname, '../modules/users/**/*.entity{.ts,.js}'),
        join(__dirname, '../modules/facebook-accounts/**/*.entity{.ts,.js}'),
        join(__dirname, '../modules/vpn/**/*.entity{.ts,.js}'),
        join(__dirname, '../modules/vpn-integration/entities/vpn-config.entity{.ts,.js}'),
        join(__dirname, '../modules/task-scheduler/**/*.entity{.ts,.js}'),
        join(__dirname, '../modules/chat-scripts/**/*.entity{.ts,.js}'),
        join(__dirname, '../modules/warmup/**/*.entity{.ts,.js}'),
      ],
      synchronize: false,
      logging: this.configService.get('database.logging', false),
      ssl: this.configService.get('database.ssl', false)
        ? { rejectUnauthorized: process.env.NODE_ENV === 'production' }  // 生产环境验证证书，开发环境跳过
        : false,
    };
  }
}
