import { Module } from '@nestjs/common';
import { PaymentsController, PaymentsWebhookController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextModule } from '../../erpnext/erpnext.module';

@Module({
  imports: [ErpnextModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, PrismaService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
