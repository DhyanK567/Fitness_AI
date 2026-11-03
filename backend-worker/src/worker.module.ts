import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from './common/prisma.service';
import { RedisClient, RedisModule } from './common/redis-client';
import { OutboxDispatcherService } from './outbox-dispatcher/outbox-dispatcher.service';
import { SchedulerService } from './schedulers/scheduler.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    RedisModule.forRoot(),
  ],
  providers: [
    PrismaService,
    OutboxDispatcherService,
    SchedulerService,
  ],
  exports: [RedisClient],
})
export class WorkerModule {}