import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from './common/prisma.service';
import { RedisModule } from './common/redis-client';
import { OutboxDispatcherService } from './outbox-dispatcher/outbox-dispatcher.service';
import { SchedulerService } from './schedulers/scheduler.service';
import { FloorAlertService } from './services/floor-alert.service';
import { FloorAlertDeliveryService } from './services/floor-alert-delivery.service';
import { StudioCapacityScheduler } from './schedulers/studio-capacity/studio-capacity.scheduler';

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
    FloorAlertService,
    FloorAlertDeliveryService,
    StudioCapacityScheduler,
  ],
  exports: [RedisModule],
})
export class WorkerModule {}
