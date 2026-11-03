/**
 * Wellness Studio OS — Public Enquiry Assistant (AI-5 / PUB-05) Types & Contracts
 * Aligned with Official Document 5 (Section 6.3) and Document 6 (AI & Agent Architecture Section 3.2)
 */

export interface CreatePublicEnquirySessionPayload {
  captcha_token: string;
  page_context?: string;
}

export interface PublicEnquirySessionResponse {
  session_id: string;
  greeting: string;
  expires_at: string;
}

export interface PostPublicEnquiryMessagePayload {
  message: string;
}

export interface PublicEnquiryMessageResponse {
  response: string;
  source_refs: string[];
  lead_capture_prompt: boolean;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

export interface CreatePublicEnquiryLeadPayload {
  name: string;
  phone: string;
  email?: string;
  interest: string;
  consent: {
    whatsapp: boolean;
  };
}

export interface PublicEnquiryLeadResponse {
  lead_id: string;
  message: string;
  duplicate_flag?: boolean;
}

export interface PublicEnquiryHandoffPayload {
  reason?: string;
  contact?: string;
}

export interface PublicEnquiryHandoffResponse {
  handoff_id: string;
  message: string;
}

export interface EnquiryChatMessage {
  id: string;
  role: 'visitor' | 'assistant' | 'system';
  content: string;
  source_refs?: string[];
  lead_capture_prompt?: boolean;
  timestamp: string;
  error?: boolean;
}
