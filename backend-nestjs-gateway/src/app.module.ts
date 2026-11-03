import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigHostModule } from '@nestjs/config/dist/config-host.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { SecurityHeadersMiddleware } from './common/security-headers.middleware';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { validateEnvironment } from './config/environment';
import { ErpnextModule } from './erpnext/erpnext.module';
import { PrismaService } from './common/prisma.service';
import { AuditOutboxService } from './common/audit-outbox.service';
import { RedisModule } from './common/redis-client';
import { AuthModule } from './auth/auth.module';
import { ConfigurationModule } from './configuration/configuration.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MembersModule } from './modules/members/members.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { ClassesModule } from './modules/classes/classes.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { PaymentsModule } from './payments/payments.module';
import { LeadsModule } from './modules/leads/leads.module';
import { EventsModule } from './modules/events/events.module';
import { StaffModule } from './modules/staff/staff.module';
import { ReportsModule } from './modules/reports/reports.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { AiModule } from './ai/ai.module';
import { PolicyModule } from './platform/roles-permissions/policy.module';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { RazorpayWebhookModule } from './webhooks/razorpay/razorpay-webhook.module';
import { ImportExportModule } from './import-export/import-export.module';
import { TrainerWorkspaceModule } from './modules/trainer-workspace/trainer-workspace.module';
import { EmployeeWorkspacesModule } from './modules/employee-workspaces/employee-workspaces.module';
import { ReferralsModule } from './modules/referrals/referrals.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    ConfigHostModule,
    PolicyModule,
    ErpnextModule,
    AuthModule,
    ConfigurationModule,
    DashboardModule,
    MembersModule,
    MembershipsModule,
    ClassesModule,
    SchedulesModule,
    BookingsModule,
    AttendanceModule,
    PaymentsModule,
    LeadsModule,
    EventsModule,
    StaffModule,
    ReportsModule,
    FeedbackModule,
    RecommendationsModule,
    RedisModule,
    AiModule,
    RazorpayWebhookModule,
    ImportExportModule,
    TrainerWorkspaceModule,
    EmployeeWorkspacesModule,
    ReferralsModule,
  ],

  controllers: [AppController],
  providers: [AppService, PrismaService, AuditOutboxService, RequestIdMiddleware, RateLimitGuard],
  exports: [PrismaService, AuditOutboxService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecurityHeadersMiddleware, RequestContextMiddleware, RequestIdMiddleware).forRoutes('*');
  }
}
