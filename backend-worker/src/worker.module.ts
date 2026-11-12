import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from './common/prisma.service';
import { RedisClient, RedisModule } from './common/redis-client';
import { OutboxDispatcherService } from './outbox-dispatcher/outbox-dispatcher.service';
import { SchedulerService } from './schedulers/scheduler.service';
import { TrainerRosterScheduler } from './schedulers/trainer-roster/trainer-roster.scheduler';
import { TrainerRosterService } from './trainer-roster/trainer-roster.service';

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
    TrainerRosterScheduler,
    TrainerRosterService,
  ],
  exports: [RedisClient, TrainerRosterService, TrainerRosterScheduler],
})
export class WorkerModule {}