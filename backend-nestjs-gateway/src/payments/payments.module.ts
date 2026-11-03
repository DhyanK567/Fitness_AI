import { Module } from '@nestjs/common';
import { ErpnextModule } from '../erpnext/erpnext.module';
import { PrismaService } from '../common/prisma.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { PaymentWebhookController } from './payment-webhook.controller';
import { PaymentWebhookService } from './payment-webhook.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { HttpModule } from '@nestjs/axios';
import { RazorpayService } from './razorpay.service';
import { MemberOrStaffAccessGuard } from '../modules/bookings/booking-access.guard';

import { ReferralsModule } from '../modules/referrals/referrals.module';

@Module({ imports: [ErpnextModule, HttpModule, ReferralsModule], controllers: [PaymentWebhookController, PaymentsController], providers: [PrismaService, AuditOutboxService, PaymentWebhookService, PaymentsService, RazorpayService, StaffAccessGuard, MemberOrStaffAccessGuard, TenantContextGuard] })
export class PaymentsModule {}
