import type { Request } from 'express';

export type RequestWithContext = Request & {
  correlationId?: string;
  tenantId?: string;
  tenantCode?: string;
  rawBody?: Buffer;
  auth?: { userId: string; roles: string[]; sessionId?: string; memberRef?: string; userType?: string };
};
