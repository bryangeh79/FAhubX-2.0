import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { RedisModule } from '@nestjs-modules/ioredis';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { join } from 'path';

import configuration from './config/configuration';
import { DatabaseConfig } from './config/database.config';
import { RedisConfig } from './config/redis.config';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FacebookAccountsModule } from './modules/facebook-accounts/facebook-accounts.module';
import { VpnModule } from './modules/vpn/vpn.module';
import { ChatScriptsModule } from './modules/chat-scripts/chat-scripts.module';
import { SimpleTasksModule } from './modules/simple-tasks/simple-tasks.module';
import { WarmupModule } from './modules/warmup/warmup.module';
import { LicenseModule } from './modules/license/license.module';
import { AdminLicensesModule } from './modules/admin-licenses/admin-licenses.module';
// import { VPNClientModule } from './modules/vpn-client/vpn-client.module';
// import { TaskSchedulerModule } from './modules/task-scheduler/task-scheduler.module';
// import { TaskQueueModule } from './modules/task-queue/task-queue.module';
// import { TaskExecutorModule } from './modules/task-executor/task-executor.module';
// import { AccountManagerModule } from './modules/account-manager/account-manager.module';
// import { TaskMonitorModule } from './modules/task-monitor/task-monitor.module';
// import { BatchOperationsModule } from './modules/batch-operations/batch-operations.module';
// import { AccountBatchModule } from './modules/account-batch/account-batch.module';
// import { AccountHealthModule } from './modules/account-health/account-health.module';
// import { AccountRecoveryModule } from './modules/account-recovery/account-recovery.module';
// import { VpnIntegrationModule } from './modules/vpn-integration/vpn-integration.module';

@Module({
  imports: [
    // 静态文件服务（本地模式：NestJS 直接托管前端）
    ...(process.env.SERVE_STATIC === 'true'
      ? [ServeStaticModule.forRoot({
          rootPath: join(__dirname, '..', '..', 'frontend', 'dist'),
          exclude: ['/api(.*)'],
        })]
      : []),

    // 配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [`.env.${process.env.NODE_ENV}`, '.env'],
    }),

    // 数据库模块
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useClass: DatabaseConfig,
    }),

    // Redis模块
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useClass: RedisConfig,
    }),

    // 消息队列模块
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
          password: configService.get('REDIS_PASSWORD'),
          db: configService.get('REDIS_DB', 0),
        },
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
          attempts: configService.get('TASK_RETRY_MAX_ATTEMPTS', 3),
          backoff: {
            type: 'exponential',
            delay: configService.get('TASK_RETRY_DELAY', 300000),
          },
          timeout: configService.get('TASK_TIMEOUT', 1800000),
        },
      }),
      inject: [ConfigService],
    }),

    // 限流模块
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get('RATE_LIMIT_WINDOW', 900000),
            limit: configService.get('RATE_LIMIT_MAX', 100),
          },
        ],
      }),
      inject: [ConfigService],
    }),

    // 定时任务模块
    ScheduleModule.forRoot(),

    // 事件发射器模块
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: true,
      ignoreErrors: false,
    }),

    // 业务模块 (核心)
    AuthModule,
    UsersModule,
    FacebookAccountsModule,
    VpnModule,
    ChatScriptsModule,
    SimpleTasksModule,
    WarmupModule, // v1.2.0 Phase 2 —— 账号暖化调度

    // License 模块（local 和 cloud 模式都加载，但 service 内部自动跳过 cloud 逻辑）
    LicenseModule,
    AdminLicensesModule,
    // VPNClientModule,        // TODO: fix missing service files
    // TaskSchedulerModule,
    // TaskQueueModule,
    // TaskExecutorModule,
    // AccountManagerModule,
    // TaskMonitorModule,
    // BatchOperationsModule,
    // AccountBatchModule,
    // AccountHealthModule,
    // AccountRecoveryModule,
    // VpnIntegrationModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}