import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisModuleOptions, RedisModuleOptionsFactory as RedisOptionsFactory } from '@nestjs-modules/ioredis';

@Injectable()
export class RedisConfig implements RedisOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  createRedisModuleOptions(): RedisModuleOptions {
    return {
      type: 'single',
      url: `redis://${this.configService.get('redis.host', 'localhost')}:${this.configService.get('redis.port', 6379)}`,
    };
  }
}
