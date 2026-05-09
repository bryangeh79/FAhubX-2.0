import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatScript } from './entities/chat-script.entity';
import { ChatScriptsService } from './chat-scripts.service';
import { ChatScriptsController } from './chat-scripts.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([ChatScript]), AuthModule],
  controllers: [ChatScriptsController],
  providers: [ChatScriptsService],
  exports: [ChatScriptsService],
})
export class ChatScriptsModule {}
