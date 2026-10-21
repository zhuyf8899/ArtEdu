import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AtomicController } from './atomic.controller';
import { AtomicService } from './atomic.service';
@Module({imports:[AuthModule],controllers:[AtomicController],providers:[AtomicService]})
export class AtomicModule {}
