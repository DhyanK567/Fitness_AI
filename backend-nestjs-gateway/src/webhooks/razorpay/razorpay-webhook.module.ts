import { Module } from '@nestjs/common';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { RazorpayWebhookService } from './razorpay-webhook.service';
import { WebhookIngestDatabaseService } from './webhook-ingest-database.service';

@Module({
  controllers: [RazorpayWebhookController],
  providers: [RazorpayWebhookService, WebhookIngestDatabaseService],
  exports: [RazorpayWebhookService, WebhookIngestDatabaseService],
})
export class RazorpayWebhookModule {}
