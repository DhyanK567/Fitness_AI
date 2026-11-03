/**
 * Wellness Studio OS — Public Enquiry AI API Client (PUB-05)
 * Interfaces with NestJS API Gateway endpoints (/api/v1/public/ai/enquiry/...)
 * Aligned with Document 5 (API Contract §6.3)
 */

import {
  CreatePublicEnquiryLeadPayload,
  CreatePublicEnquirySessionPayload,
  PostPublicEnquiryMessagePayload,
  PublicEnquiryHandoffPayload,
  PublicEnquiryHandoffResponse,
  PublicEnquiryLeadResponse,
  PublicEnquiryMessageResponse,
  PublicEnquirySessionResponse,
} from '../types/public-enquiry';
import { resolveClientTenantHost } from '@/lib/tenant';

export class PublicEnquiryApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'PublicEnquiryApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class PublicEnquiryApi {
  public static getBaseUrl(): string {
    const raw = process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL.trim()
      : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');
    return raw.replace(/\/+$/, '').replace(/\/api\/v1\/?$/, '');
  }

  public static getEndpoint(path: string): string {
    const base = this.getBaseUrl();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;

    if (cleanPath.startsWith('/api/v1/public/ai/enquiry') || cleanPath.startsWith('/api/v1/ai/public/enquiry')) {
      return `${base}${cleanPath}`;
    }
    if (cleanPath.startsWith('/public/ai/enquiry') || cleanPath.startsWith('/ai/public/enquiry')) {
      return `${base}/api/v1${cleanPath}`;
    }
    return `${base}/api/v1/public/ai/enquiry${cleanPath}`;
  }

  private static getHeaders(): Record<string, string> {
    const tenantHost = resolveClientTenantHost();
    return {
      'Content-Type': 'application/json',
      ...(tenantHost ? { 'Host': tenantHost, 'x-tenant-host': tenantHost } : {}),
    };
  }

  private static async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = this.getEndpoint(endpoint);
    const headers = {
      ...this.getHeaders(),
      ...(options.headers as Record<string, string>),
    };

    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        headers,
      });
    } catch (networkErr: any) {
      throw new PublicEnquiryApiError(
        'Unable to connect to the studio concierge service. Please check your connection or contact our front desk.',
        0,
        'NETWORK_ERROR',
        networkErr,
      );
    }

    if (res.status === 204) {
      return undefined as unknown as T;
    }

    let payload: any = null;
    let rawText: string | null = null;
    try {
      if (typeof res.json === 'function') {
        payload = await res.json();
      } else if (typeof res.text === 'function') {
        rawText = await res.text();
        payload = rawText ? JSON.parse(rawText) : null;
      }
    } catch {
      payload = rawText;
    }

    if (!res.ok) {
      const errObject = payload?.error;
      const code =
        errObject?.code ||
        payload?.code ||
        (res.status === 403 ? 'CAPTCHA_FAILED' : res.status === 410 ? 'SESSION_EXPIRED' : res.status === 429 ? 'AI_RATE_LIMITED' : 'API_ERROR');

      let message =
        errObject?.message ||
        payload?.message ||
        (typeof payload === 'string' ? payload : `Request failed with status ${res.status}`);

      if (Array.isArray(message)) {
        message = message.join(', ');
      }

      throw new PublicEnquiryApiError(message, res.status, code, payload);
    }

    // Standard NestJS Response Envelope unwrap
    if (payload && typeof payload === 'object' && payload.success === true && 'data' in payload) {
      return payload.data as T;
    }

    return payload as T;
  }

  /**
   * 1. POST /api/v1/public/ai/enquiry/sessions
   */
  public static async createSession(
    payload: CreatePublicEnquirySessionPayload,
  ): Promise<PublicEnquirySessionResponse> {
    return this.request<PublicEnquirySessionResponse>('/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * 2. POST /api/v1/public/ai/enquiry/sessions/:id/messages
   */
  public static async postMessage(
    sessionId: string,
    payload: PostPublicEnquiryMessagePayload,
  ): Promise<PublicEnquiryMessageResponse> {
    return this.request<PublicEnquiryMessageResponse>(
      `/sessions/${encodeURIComponent(sessionId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  }

  /**
   * 3. POST /api/v1/public/ai/enquiry/sessions/:id/lead
   */
  public static async submitLead(
    sessionId: string,
    payload: CreatePublicEnquiryLeadPayload,
  ): Promise<PublicEnquiryLeadResponse> {
    return this.request<PublicEnquiryLeadResponse>(
      `/sessions/${encodeURIComponent(sessionId)}/lead`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  }

  /**
   * 4. POST /api/v1/public/ai/enquiry/sessions/:id/handoff
   */
  public static async requestHandoff(
    sessionId: string,
    payload: PublicEnquiryHandoffPayload = {},
  ): Promise<PublicEnquiryHandoffResponse> {
    return this.request<PublicEnquiryHandoffResponse>(
      `/sessions/${encodeURIComponent(sessionId)}/handoff`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  }
}
