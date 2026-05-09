import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskExecutorService } from './task-executor.service';
import { BrowserAutomationService } from './integrations/browser-automation.service';
import { DialogueScriptService } from './integrations/dialogue-script.service';
import { FacebookChatService } from './integrations/facebook-chat.service';
import { FacebookPostService } from './integrations/facebook-post.service';
import { AccountWarmingService } from './integrations/account-warming.service';
import { FacebookSocialService } from './integrations/facebook-social.service';
import { FacebookGroupJoinService } from './integrations/facebook-group-join.service';
import { AiClientService } from './integrations/ai-client.service';
import { Task } from '../task-scheduler/entities/task.entity';
import { TaskExecutionLog } from '../task-scheduler/entities/task-execution-log.entity';
import { FacebookAccountsModule } from '../facebook-accounts/facebook-accounts.module';
import { ChatScriptsModule } from '../chat-scripts/chat-scripts.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, TaskExecutionLog]),
    FacebookAccountsModule,
    ChatScriptsModule,
    UsersModule, // v1.2.0 Phase 4b —— 拿 AI API Key
  ],
  providers: [
    TaskExecutorService,
    BrowserAutomationService,
    DialogueScriptService,
    FacebookChatService,
    FacebookPostService,
    AccountWarmingService,
    FacebookSocialService,
    FacebookGroupJoinService,
    AiClientService,
  ],
  exports: [
    TaskExecutorService,
    BrowserAutomationService,
    DialogueScriptService,
    FacebookChatService,
    FacebookPostService,
    AccountWarmingService,
    FacebookSocialService,
    FacebookGroupJoinService,
    AiClientService,
  ],
})
export class TaskExecutorModule {}
