import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

export interface IngestWebhookEventParams {
  provider: string;
  providerEventId: string;
  eventType: string;
  payload: Record<string, any>;
  rawBodySha256: string;
}

export interface IngestWebhookEventResult {
  inserted: boolean;
  duplicate: boolean;
  providerEventId: string;
}

@Injectable()
export class WebhookIngestDatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookIngestDatabaseService.name);
  private readonly client: PrismaClient;

  constructor(
    private readonly config: ConfigService,
    @Optional() customClient?: PrismaClient,
  ) {
    if (customClient) {
      this.client = customClient;
    } else {
      const ingestUrl =
        this.config?.get<string>('WEBHOOK_INGEST_DATABASE_URL') ||
        this.config?.get<string>('DATABASE_INGEST_URL') ||
        this.config?.get<string>('DATABASE_URL') ||
        process.env.WEBHOOK_INGEST_DATABASE_URL ||
        process.env.DATABASE_INGEST_URL ||
        process.env.DATABASE_URL;

      this.client = ingestUrl
        ? new PrismaClient({
            datasources: {
              db: { url: ingestUrl },
            },
          })
        : new PrismaClient();
    }
  }

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.client.$connect();
      this.logger.log('Webhook ingest database client connected');
    } catch (error) {
      this.logger.error('Failed to connect webhook ingest database client', (error as Error).message);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.client.$disconnect();
      this.logger.log('Webhook ingest database client disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting webhook ingest database client', (error as Error).message);
    }
  }

  /**
   * Persists a signature-verified platform webhook event into platform.platform_webhook_inbox.
   * Uses an idempotent INSERT with ON CONFLICT (provider, provider_event_id) DO NOTHING.
   * Compatible with the INSERT-only privileges of the fitness_webhook_ingest role.
   */
  async recordEvent(params: IngestWebhookEventParams): Promise<IngestWebhookEventResult> {
    const payloadJson = JSON.stringify(params.payload);

    const affectedRows = await this.client.$executeRaw`
      INSERT INTO platform.platform_webhook_inbox (
        provider,
        provider_event_id,
        event_type,
        payload,
        raw_body_sha256,
        status
      ) VALUES (
        ${params.provider},
        ${params.providerEventId},
        ${params.eventType},
        ${payloadJson}::jsonb,
        ${params.rawBodySha256},
        'received'
      )
      ON CONFLICT (provider, provider_event_id) DO NOTHING;
    `;

    return {
      inserted: affectedRows === 1,
      duplicate: affectedRows === 0,
      providerEventId: params.providerEventId,
    };
  }

  /**
   * Returns the underlying PrismaClient instance (useful for lifecycle management in tests).
   */
  getClient(): PrismaClient {
    return this.client;
  }
}
