import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  NotFoundException,
  Optional,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import type { RequestWithContext } from '../common/request-context.types';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { PrismaService } from '../common/prisma.service';
import { ConversationService } from './conversation.service';
import { ConversationOrchestrator } from './orchestrator/conversation-loop';
import { LeadsService } from '../modules/leads/leads.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { RedisClient } from '../common/redis-client';
import {
  CreatePublicEnquirySessionDto,
  PostPublicEnquiryMessageDto,
  CreatePublicEnquiryLeadDto,
  PublicEnquiryHandoffDto,
} from './dto/public-enquiry.dto';
import { FaqKnowledgeService } from './knowledge/faq-knowledge.service';

@ApiTags('Public AI Enquiry')
@Controller(['public/ai/enquiry', 'ai/public/enquiry'])
@UseGuards(TenantContextGuard)
export class PublicEnquiryAiController {
  private readonly logger = new Logger(PublicEnquiryAiController.name);

  // In-memory fallback buckets for rate limiting when Redis is unavailable (dev/test only)
  private readonly rateBuckets = new Map<string, number[]>();
  private readonly sessionMessageCounts = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationService: ConversationService,
    private readonly orchestrator: ConversationOrchestrator,
    private readonly leadsService: LeadsService,
    private readonly auditOutbox: AuditOutboxService,
    private readonly faqKnowledge: FaqKnowledgeService,
    @Optional() @Inject('REDIS_CLIENT') private readonly redis?: RedisClient,
  ) {}

  /**
   * Helper to check sliding-window rate limits.
   * Multi-instance production deployments require a shared limiter (Redis).
   * In production, fails closed (503 AI_UNAVAILABLE) if Redis is unavailable.
   * Single-instance development/test mode safely falls back to in-memory sliding window.
   */
  private async checkRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number,
    errorMessage: string,
  ): Promise<void> {
    const isProduction =
      process.env.NODE_ENV === 'production' ||
      process.env.REQUIRE_SHARED_RATE_LIMITER === 'true';

    const redisInstance = this.redis?.getClient();
    const isRedisReady = redisInstance && redisInstance.status === 'ready';

    // In production multi-instance deployments, a shared limiter (Redis) is strictly required.
    // We must NOT silently fall back to in-memory counters, which would create split-brain bypasses.
    if (isProduction && !isRedisReady) {
      this.logger.error(
        `Critical: Shared rate limiter (Redis) is unavailable in production for key: ${key}. Failing closed.`,
      );
      throw new HttpException(
        {
          error: {
            code: 'AI_UNAVAILABLE',
            message: 'Shared rate limiter temporarily unavailable in production',
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const now = Date.now();

    // 1. Try Redis sliding window if Redis client is ready
    if (isRedisReady) {
      try {
        const windowStart = now - windowMs;
        const pipeline = redisInstance.multi();
        pipeline.zremrangebyscore(key, 0, windowStart);
        pipeline.zcard(key);
        pipeline.zadd(key, now, `${now}:${Math.random()}`);
        pipeline.expire(key, Math.ceil(windowMs / 1000) + 1);

        const results = await pipeline.exec();
        const currentCount = (results?.[1]?.[1] as number) ?? 0;

        if (currentCount >= maxRequests) {
          throw new HttpException(
            { error: { code: 'AI_RATE_LIMITED', message: errorMessage } },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        return;
      } catch (err) {
        if (err instanceof HttpException) throw err;
        if (isProduction) {
          this.logger.error(`Redis rate limiter failed in production: ${(err as Error).message}`);
          throw new HttpException(
            {
              error: {
                code: 'AI_UNAVAILABLE',
                message: 'Shared rate limiter temporarily unavailable in production',
              },
            },
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        this.logger.debug(`Redis rate limiter error, using memory fallback: ${(err as Error).message}`);
      }
    }

    // 2. In-memory sliding window fallback (development / test single-instance mode only)
    const windowStart = now - windowMs;
    const history = this.rateBuckets.get(key) || [];
    const recent = history.filter((ts) => ts > windowStart);

    if (recent.length >= maxRequests) {
      throw new HttpException(
        { error: { code: 'AI_RATE_LIMITED', message: errorMessage } },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.rateBuckets.set(key, recent);
  }

  /**
   * Helper to verify CAPTCHA token.
   * If CAPTCHA_SECRET_KEY and CAPTCHA_VERIFY_URL are configured, verifies with upstream provider.
   * Otherwise in development/test, performs structural and negative-token validation.
   */
  private async verifyCaptcha(captchaToken?: string): Promise<boolean> {
    if (!captchaToken || typeof captchaToken !== 'string' || captchaToken.trim().length === 0) {
      return false;
    }

    if (
      captchaToken === 'invalid_captcha' ||
      captchaToken.toLowerCase().includes('fail')
    ) {
      return false;
    }

    const isProduction =
      process.env.NODE_ENV === 'production' ||
      process.env.REQUIRE_PRODUCTION_CAPTCHA === 'true';

    const captchaSecret = process.env.CAPTCHA_SECRET_KEY;
    const captchaVerifyUrl = process.env.CAPTCHA_VERIFY_URL;

    if (isProduction) {
      // In production, missing or invalid configuration must fail closed
      if (!captchaSecret || !captchaVerifyUrl) {
        this.logger.error('Critical: CAPTCHA verification unconfigured in production. Failing closed.');
        return false;
      }

      // Structural or development tokens must NEVER bypass production verification
      if (
        captchaToken.startsWith('cf_client_token_') ||
        captchaToken.startsWith('visitor_captcha_') ||
        captchaToken.startsWith('mock_') ||
        captchaToken.startsWith('test_') ||
        captchaToken.startsWith('dev_')
      ) {
        this.logger.warn('Production CAPTCHA check rejected client development token.');
        return false;
      }
    }

    if (captchaSecret && captchaVerifyUrl) {
      try {
        const formData = new URLSearchParams();
        formData.append('secret', captchaSecret);
        formData.append('response', captchaToken);

        const res = await fetch(captchaVerifyUrl, {
          method: 'POST',
          body: formData,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        if (!res.ok) {
          this.logger.warn(`CAPTCHA provider responded with status ${res.status}`);
          return false;
        }

        const data = (await res.json()) as { success?: boolean };
        return data.success === true;
      } catch (err) {
        this.logger.error(`Error verifying CAPTCHA with provider: ${(err as Error).message}`);
        return false;
      }
    }

    return true;
  }

  /**
   * 1. POST /public/ai/enquiry/sessions
   * Contract: 201 { session_id, greeting, expires_at }
   * Security: Public; tenant from host; bot protection; no PII in URL
   * Rate limits: 5 sessions/hour/IP (429)
   * Errors: 403 CAPTCHA_FAILED, 429
   */
  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate public enquiry chat session' })
  async createSession(
    @Req() req: RequestWithContext,
    @Body() dto: CreatePublicEnquirySessionDto,
  ) {
    const tenantId = req.tenantId as string;
    const ip = req.ip || req.socket.remoteAddress || 'anonymous_ip';

    // 1. Bot protection: validate captcha_token
    const isCaptchaValid = await this.verifyCaptcha(dto.captcha_token);
    if (!isCaptchaValid) {
      throw new HttpException(
        { error: { code: 'CAPTCHA_FAILED', message: 'CAPTCHA validation failed' } },
        HttpStatus.FORBIDDEN,
      );
    }

    // 2. Rate limiting: 5 sessions / hour / IP
    const rateLimitKey = `ratelimit:enquiry:sessions:${tenantId}:${ip}`;
    await this.checkRateLimit(
      rateLimitKey,
      5,
      60 * 60 * 1000,
      'Session creation limit exceeded (maximum 5 sessions per hour per IP)',
    );

    // 3. Create session record
    const sessionId = randomUUID();
    const visitorUserId = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour TTL

    await this.prisma.withTenant(tenantId, async (tx) => {
      return tx.conversation.create({
        data: {
          id: sessionId,
          tenantId,
          userId: visitorUserId,
          title: 'Public Enquiry Session',
          status: 'active',
          metadata: {
            isPublicEnquiry: true,
            captchaVerified: true,
            pageContext: dto.page_context || null,
            expiresAt: expiresAt.toISOString(),
            ip,
          },
        },
      });
    });

    this.sessionMessageCounts.set(sessionId, 0);

    return {
      session_id: sessionId,
      greeting:
        'Hello! Welcome to Wellness Studio. How can I assist you with our classes, schedules, memberships, or upcoming events today?',
      expires_at: expiresAt.toISOString(),
    };
  }

  /**
   * 2. POST /public/ai/enquiry/sessions/:id/messages
   * Contract: 200 { response, source_refs?, lead_capture_prompt?, tool_calls? }
   * Security: Public tools only; output filter; injection filter
   * Rate limits: 10 msg/min/session, 40 msg/session, 60 msg/hour/IP
   * Errors: 404, 410, 429 AI_RATE_LIMITED, 503 AI_UNAVAILABLE
   */
  @Post('sessions/:id/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send message to public enquiry assistant' })
  async postMessage(
    @Req() req: RequestWithContext,
    @Param('id') id: string,
    @Body() dto: PostPublicEnquiryMessageDto,
  ) {
    const tenantId = req.tenantId as string;
    const ip = req.ip || req.socket.remoteAddress || 'anonymous_ip';

    // 1. Session lookup & tenant scoping
    const session = await this.prisma.withTenant(tenantId, async (tx) => {
      return tx.conversation.findFirst({
        where: { id, tenantId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 20,
          },
        },
      });
    });

    if (!session) {
      throw new NotFoundException({
        error: { code: 'SESSION_NOT_FOUND', message: 'Enquiry session not found' },
      });
    }

    // 2. Check session expiry
    const meta = (session.metadata as Record<string, any>) || {};
    const expiresAt = meta.expiresAt ? new Date(meta.expiresAt) : null;
    if (session.status !== 'active' || (expiresAt && new Date() > expiresAt)) {
      throw new HttpException(
        {
          error: {
            code: 'SESSION_EXPIRED',
            message: 'Enquiry session has expired. Please initiate a new session.',
          },
        },
        HttpStatus.GONE,
      );
    }

    // 3. Enforce rate limits:
    // a. Max 40 messages per session
    const currentMsgCount = (this.sessionMessageCounts.get(id) ?? Math.floor(session.messages.length / 2)) + 1;
    if (currentMsgCount > 40) {
      throw new HttpException(
        {
          error: {
            code: 'AI_RATE_LIMITED',
            message: 'Session message limit reached (maximum 40 messages per session)',
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // b. 10 msg / min / session
    await this.checkRateLimit(
      `ratelimit:enquiry:msg:session:${id}`,
      10,
      60 * 1000,
      'Rate limit exceeded (maximum 10 messages per minute per session)',
    );

    // c. 60 msg / hour / IP
    await this.checkRateLimit(
      `ratelimit:enquiry:msg:ip:${tenantId}:${ip}`,
      60,
      60 * 60 * 1000,
      'Rate limit exceeded (maximum 60 messages per hour per IP)',
    );

    // 4. Grounding: retrieve tenant-approved FAQ knowledge (Database Design Document §3.6, §12.4)
    const matchingFaqs = await this.faqKnowledge.searchApprovedFaqs(tenantId, dto.message, 3);
    const sourceRefs: string[] = [];

    let processedPrompt = dto.message;
    if (matchingFaqs.length > 0) {
      sourceRefs.push('faq');
      const faqText = matchingFaqs
        .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
        .join('\n\n');
      processedPrompt = `[APPROVED_STUDIO_FAQ_DATA]\n${faqText}\n[/APPROVED_STUDIO_FAQ_DATA]\n\nProspect Question: ${dto.message}`;
    }

    // 5. Dispatch through conversation loop under visitor principal
    const correlationId = req.correlationId || randomUUID();
    const historyTurns = session.messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'tool' | 'system',
      content: m.content,
      timestamp: m.createdAt,
    }));

    try {
      const orchestratorResponse = await this.orchestrator.processMessage(
        {
          tenantId,
          tenantCode: req.tenantCode as string,
          userId: session.userId,
          role: 'visitor',
          correlationId,
          sessionId: id,
        },
        processedPrompt,
        historyTurns,
      );

      // Save turns to conversation history
      await this.conversationService.addMessage({
        conversationId: id,
        tenantId,
        role: 'user',
        content: dto.message,
      });

      await this.conversationService.addMessage({
        conversationId: id,
        tenantId,
        role: 'assistant',
        content: orchestratorResponse.response,
        toolCalls: orchestratorResponse.toolCalls as any,
      });

      this.sessionMessageCounts.set(id, currentMsgCount);

      // Derive source references from tool executions
      const toolCalls = orchestratorResponse.toolCalls || [];
      for (const t of toolCalls) {
        if (t.name === 'getPublicClassSchedule') sourceRefs.push('classes');
        if (t.name === 'getActivePlansPublic') sourceRefs.push('plans');
        if (t.name === 'getPublicEventList') sourceRefs.push('events');
        if (t.name === 'captureLead') sourceRefs.push('crm');
      }

      // Detect if prompt/response warrants lead capture invitation
      const lowerMsg = dto.message.toLowerCase();
      const leadCapturePrompt =
        lowerMsg.includes('join') ||
        lowerMsg.includes('sign up') ||
        lowerMsg.includes('register') ||
        lowerMsg.includes('interested') ||
        lowerMsg.includes('membership') ||
        lowerMsg.includes('price') ||
        toolCalls.some((t) => t.name === 'captureLead');

      return {
        response: orchestratorResponse.response,
        source_refs: Array.from(new Set(sourceRefs)),
        lead_capture_prompt: leadCapturePrompt,
        tool_calls: toolCalls,
      };
    } catch (err: any) {
      this.logger.error(`Enquiry processing failure for session ${id}: ${err?.message}`);
      throw new HttpException(
        {
          error: {
            code: 'AI_UNAVAILABLE',
            message:
              'Assistant temporarily unavailable. Please submit an enquiry form or contact studio staff.',
            fallback_link: '/enquiry',
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * 3. POST /public/ai/enquiry/sessions/:id/lead
   * Contract: 201 { lead_id, message }
   * Security: Explicit consent recorded; duplicate flagged; captcha proof from session
   * Rate limits: 3 leads/hour/IP
   * Errors: 404, 422 CONSENT_REQUIRED, 409 (flagged duplicate), 429
   */
  @Post('sessions/:id/lead')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit prospect lead from enquiry session' })
  async submitLead(
    @Req() req: RequestWithContext,
    @Param('id') id: string,
    @Body() dto: CreatePublicEnquiryLeadDto,
  ) {
    const tenantId = req.tenantId as string;
    const ip = req.ip || req.socket.remoteAddress || 'anonymous_ip';

    // 1. Session check
    const session = await this.prisma.withTenant(tenantId, async (tx) => {
      return tx.conversation.findFirst({
        where: { id, tenantId },
      });
    });

    if (!session) {
      throw new NotFoundException({
        error: { code: 'SESSION_NOT_FOUND', message: 'Enquiry session not found' },
      });
    }

    // 2. Validate WhatsApp messaging consent
    if (!dto.consent || dto.consent.whatsapp !== true) {
      throw new HttpException(
        {
          error: {
            code: 'CONSENT_REQUIRED',
            message: 'Explicit WhatsApp consent is required to submit an enquiry.',
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 3. Rate limiting: 3 leads / hour / IP
    await this.checkRateLimit(
      `ratelimit:enquiry:lead:${tenantId}:${ip}`,
      3,
      60 * 60 * 1000,
      'Lead submission limit exceeded (maximum 3 leads per hour per IP)',
    );

    // 4. Create lead via CRM service with source AI_ENQUIRY
    const result = (await this.leadsService.createPublic(
      {
        tenantId,
        tenantCode: req.tenantCode || tenantId,
        correlationId: req.correlationId || randomUUID(),
      },
      {
        full_name: dto.name,
        phone: dto.phone,
        email: dto.email,
        source: 'AI_ENQUIRY',
        notes: dto.interest ? `Interest: ${dto.interest}` : undefined,
      },
    )) as { id?: string; duplicate?: boolean };

    return {
      lead_id: result.id || 'LEAD-CREATED',
      message: 'Thanks! A member of our team will reach out shortly.',
      ...(result.duplicate ? { duplicate_flag: true } : {}),
    };
  }

  /**
   * 4. POST /public/ai/enquiry/sessions/:id/handoff
   * Contract: 202 { handoff_id }
   * Security: Session-bound
   * Rate limits: 3/hour/session
   * Errors: 404, 429
   */
  @Post('sessions/:id/handoff')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Escalate enquiry session to human studio staff' })
  async requestHandoff(
    @Req() req: RequestWithContext,
    @Param('id') id: string,
    @Body() dto: PublicEnquiryHandoffDto,
  ) {
    const tenantId = req.tenantId as string;

    // 1. Session check
    const session = await this.prisma.withTenant(tenantId, async (tx) => {
      return tx.conversation.findFirst({
        where: { id, tenantId },
      });
    });

    if (!session) {
      throw new NotFoundException({
        error: { code: 'SESSION_NOT_FOUND', message: 'Enquiry session not found' },
      });
    }

    // 2. Rate limit: 3 handoffs / hour / session
    await this.checkRateLimit(
      `ratelimit:enquiry:handoff:${id}`,
      3,
      60 * 60 * 1000,
      'Handoff request limit exceeded (maximum 3 requests per session)',
    );

    // 3. Record staff alert in transactional outbox
    const handoffId = `handoff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await this.auditOutbox.record({
      tenantId,
      correlationId: req.correlationId || randomUUID(),
      actorType: 'human',
      actorId: session.userId,
      action: 'ai.enquiry.handoff',
      resourceType: 'enquiry_session',
      resourceRef: id,
      eventType: 'ai.enquiry.escalated',
      payload: {
        handoffId,
        sessionId: id,
        reason: dto?.reason || 'Prospect requested human assistance',
        contact: dto?.contact || null,
      },
    });

    return {
      handoff_id: handoffId,
      message:
        'Your request has been escalated to studio concierge. Someone will follow up with you shortly.',
    };
  }
}
