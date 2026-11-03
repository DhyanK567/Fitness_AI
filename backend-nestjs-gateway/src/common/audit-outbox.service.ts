import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { currentRequestAuditContext } from './request-audit-context';

export type AuditOutboxInput = {
  tenantId: string;
  correlationId: string;
  actorType: string;
  actorId?: string;
  action: string;
  resourceType: string;
  resourceRef: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  beforeData?: Prisma.InputJsonValue;
  afterData?: Prisma.InputJsonValue;
  idempotencyKey?: string;
};

const VALID_ACTOR_TYPES = new Set(['human', 'automation', 'ai', 'agent', 'system']);
const ACTOR_TYPE_MAP: Record<string, string> = {
  user: 'human',
  staff: 'human',
  member: 'human',
  visitor: 'human',
  admin: 'human',
  erp: 'system',
  webhook: 'system',
  cron: 'automation',
  worker: 'automation',
};
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AUDIT_SNAPSHOT_ALLOWLIST: Record<string, ReadonlySet<string>> = {
  staff: new Set(['status', 'roleCodes']),
  tenant_setting: new Set(['settingKey']),
  tool: new Set([
    'toolName',
    'arguments',
    'success',
    'error',
    'errorCode',
    'durationMs',
    'result',
    'decision',
    'approval',
  ]),
  pending_action: new Set([
    'actionType',
    'summary',
    'status',
    'payload',
    'result',
    'error',
    'decision',
    'approval',
    'reason',
    'arguments',
  ]),
  conversation: new Set([
    'userMessage',
    'response',
    'toolCalls',
    'toolResults',
    'durationMs',
    'pendingActionId',
  ]),
  security: new Set([
    'tool',
    'toolName',
    'error',
    'reason',
    'action',
    'details',
  ]),
  feedback: new Set([
    'feedbackId',
    'sentiment',
    'topics',
    'theme',
    'lowConfidence',
    'rating',
    'reviewStatus',
  ]),
};

const AUDIT_PHONE_PATTERNS = [
  /(?:\+91\s*|\b0?)\d{10}\b/g,
  /(?:\+91\s*)?\b\d{5}[\s-]?\d{5}\b/g,
  /(?:\+\d{1,3}\s*)?(?:\(\d{3}\)|\b\d{3})[\s-]?\d{3}[\s-]?\d{4}\b/g,
];
const AUDIT_EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const AUDIT_CARD_PATTERNS = [
  /\b(?:\d{4}[\s-]?){3}\d{4}\b/g,
  /\b\d{4}[\s-]?\d{6}[\s-]?\d{5}\b/g,
];
const AUDIT_AADHAAR_PATTERN = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;

function sanitizeAuditString(text: string): string {
  if (!text || typeof text !== 'string') return text || '';
  let sanitized = text;
  for (const pattern of AUDIT_PHONE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[PHONE]');
  }
  sanitized = sanitized.replace(AUDIT_EMAIL_PATTERN, '[EMAIL]');
  for (const pattern of AUDIT_CARD_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[CARD]');
  }
  sanitized = sanitized.replace(AUDIT_AADHAAR_PATTERN, '[AADHAAR]');
  return sanitized;
}

function sanitizeAuditValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val === 'number' || typeof val === 'boolean') {
    return val;
  }
  if (typeof val === 'string') {
    return sanitizeAuditString(val);
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeAuditValue);
  }
  if (typeof val === 'object') {
    const sensitiveKeys = [
      'password',
      'passcode',
      'token',
      'secret',
      'key',
      'pin',
      'otp',
      'credit_card',
      'creditcard',
      'card_number',
      'cardnumber',
      'paymentcard',
      'payment_card',
      'cvv',
      'cvc',
      'pan',
      'aadhaar',
      'auth_token',
      'access_token',
      'refresh_token',
      'phone',
      'email',
      'ssn',
      'emergency_contact',
    ];
    const sanitizedObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (sensitiveKeys.some((s) => lower.includes(s))) {
        sanitizedObj[k] = '[REDACTED]';
      } else {
        sanitizedObj[k] = sanitizeAuditValue(v);
      }
    }
    return sanitizedObj;
  }
  return sanitizeAuditString(String(val));
}

function redactSnapshot(resourceType: string, value?: Prisma.InputJsonValue): Prisma.InputJsonValue | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const allowedFields = AUDIT_SNAPSHOT_ALLOWLIST[resourceType];
  if (!allowedFields) return undefined;

  // Preserve legacy strict string/string[] behavior for staff & tenant_setting
  if (resourceType === 'staff' || resourceType === 'tenant_setting') {
    const safe: Record<string, string | string[]> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!allowedFields.has(key)) continue;
      if (typeof entry === 'string') safe[key] = entry;
      else if (key === 'roleCodes' && Array.isArray(entry)) {
        safe[key] = entry.filter((role): role is string => typeof role === 'string');
      }
    }
    return Object.keys(safe).length ? (safe as Prisma.InputJsonObject) : undefined;
  }

  // For AI resource types (tool, pending_action, conversation, security)
  const safe: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!allowedFields.has(key)) continue;
    safe[key] = sanitizeAuditValue(entry);
  }
  return Object.keys(safe).length ? (safe as Prisma.InputJsonObject) : undefined;
}

@Injectable()
export class AuditOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditOutboxInput) {
    return this.prisma.withTenant(input.tenantId, (tx) => this.recordInTransaction(tx, input));
  }

  async recordInTransaction(tx: Prisma.TransactionClient, input: AuditOutboxInput) {
      const requestContext = currentRequestAuditContext();
      const rawAfter =
        input.afterData ??
        (['tool', 'pending_action', 'conversation', 'security', 'feedback'].includes(input.resourceType)
          ? input.payload
          : undefined);

      const normalizedActorType = VALID_ACTOR_TYPES.has(input.actorType)
        ? input.actorType
        : (ACTOR_TYPE_MAP[String(input.actorType).toLowerCase()] || 'system');

      const normalizedCorrelationId = UUID_REGEX.test(input.correlationId)
        ? input.correlationId
        : randomUUID();

      const audit = await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          correlationId: normalizedCorrelationId,
          actorType: normalizedActorType,
          actorId: input.actorId,
          action: input.action,
          resourceType: input.resourceType,
          resourceRef: input.resourceRef,
          beforeData: redactSnapshot(input.resourceType, input.beforeData),
          afterData: redactSnapshot(input.resourceType, rawAfter),
          requestContext: { correlationId: normalizedCorrelationId, ...(requestContext ?? {}) },
        },
      });
      const outboxPayload = (['tool', 'pending_action', 'conversation', 'security', 'feedback'].includes(input.resourceType) || input.eventType.startsWith('ai.'))
        ? (sanitizeAuditValue(input.payload) as Prisma.InputJsonValue)
        : input.payload;

      const outbox = await tx.outboxEvent.create({
        data: {
          tenantId: input.tenantId,
          correlationId: normalizedCorrelationId,
          eventType: input.eventType,
          subjectType: input.resourceType,
          subjectRef: input.resourceRef,
          payload: outboxPayload,
          idempotencyKey: input.idempotencyKey ?? undefined,
        },
      });
      return { audit, outbox };
  }
}
