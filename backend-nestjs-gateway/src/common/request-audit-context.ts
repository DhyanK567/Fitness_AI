import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestAuditContext = {
  ipAddress?: string;
  route?: string;
  userAgent?: string;
};

const storage = new AsyncLocalStorage<RequestAuditContext>();

export function withRequestAuditContext<T>(context: RequestAuditContext, callback: () => T): T {
  const bounded: RequestAuditContext = {
    ...(context.ipAddress ? { ipAddress: context.ipAddress.slice(0, 64) } : {}),
    ...(context.route ? { route: context.route.slice(0, 200) } : {}),
    ...(context.userAgent ? { userAgent: context.userAgent.slice(0, 512) } : {}),
  };
  return storage.run(bounded, callback);
}

export function currentRequestAuditContext(): RequestAuditContext | undefined {
  return storage.getStore();
}
