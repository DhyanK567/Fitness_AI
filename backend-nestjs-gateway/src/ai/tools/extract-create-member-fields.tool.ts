import { Injectable } from '@nestjs/common';
import { BaseTool, ToolContext, ToolResult } from './base-tool';

export interface ExtractedMemberFields {
  fullName?: string;
  phone?: string;
  email?: string;
  planId?: string;
  startDate?: string;
}

export interface ExtractionResult {
  extracted: ExtractedMemberFields;
  missingFields: string[];
  isComplete: boolean;
  isAmbiguousPhone?: boolean;
  isMalformedPhone?: boolean;
  malformedPhoneReason?: string;
  rawPhoneCandidates?: string[];
  clarificationPrompt?: string;
  summary: string;
}

const E164_REGEX = /^\+[1-9][0-9]{7,14}$/;

@Injectable()
export class ExtractCreateMemberFieldsTool extends BaseTool {
  /**
   * Deterministic local extraction of member fields from unredacted text.
   * Keeps raw PII server-side and prevents LLM hallucination or overwriting.
   */
  static extractFields(text: string): ExtractionResult {
    const extracted: ExtractedMemberFields = {};
    const missingFields: string[] = [];
    const trimmed = (text || '').trim();

    // 1. Phone extraction and validation
    // Disambiguate explicit emergency contact phone if present
    const emergencyMatch = trimmed.match(
      /(?:emergency(?:\s+contact)?\s*[:-]?\s*)(\+?[1-9][0-9\s().-]{6,16}[0-9]|\b0?[0-9]{10}\b)/i,
    );
    const textWithoutEmergency = emergencyMatch ? trimmed.replace(emergencyMatch[0], '') : trimmed;

    // Match phone candidates: strings of digits with optional leading +, spaces, dashes, or parens
    const phoneCandidateRegex = /(?:\+[1-9][0-9\s().-]{6,16}[0-9]|\b0?[0-9]{10}\b|\b[0-9]{3,5}[-.\s][0-9]{3,5}[-.\s]?[0-9]{3,5}\b)/g;
    const rawMatches = textWithoutEmergency.match(phoneCandidateRegex) || [];
    
    // Normalize and deduplicate candidates
    const cleanedCandidates = Array.from(
      new Set(
        rawMatches
          .map((m) => m.replace(/[\s().-]/g, ''))
          .filter((p) => p.length >= 7 && p.length <= 16),
      ),
    );

    let isAmbiguousPhone = false;
    let isMalformedPhone = false;
    let malformedPhoneReason: string | undefined = undefined;

    if (cleanedCandidates.length > 1) {
      isAmbiguousPhone = true;
    } else if (cleanedCandidates.length === 1) {
      const candidate = cleanedCandidates[0];
      if (E164_REGEX.test(candidate)) {
        extracted.phone = candidate;
      } else {
        isMalformedPhone = true;
        malformedPhoneReason =
          'Phone must use E.164 format (e.g., +919876543210 or +12025550123 with country code and leading +)';
      }
    } else {
      missingFields.push('phone');
    }

    // 2. Email extraction
    const emailMatch = trimmed.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      extracted.email = emailMatch[0].toLowerCase();
    }

    // 3. Start date extraction (YYYY-MM-DD)
    const dateMatch = trimmed.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if (dateMatch) {
      extracted.startDate = dateMatch[0];
    }

    // 4. Name extraction
    const namePatterns = [
      /(?:named|name\s+is|name\s*[:-]|new\s+member\s*[:-]?)\s+([A-Za-z][A-Za-z\s.'-]{1,60})/i,
      /(?:create|add|register)\s+(?:a\s+)?member\s+([A-Za-z][A-Za-z\s.'-]{1,60})/i,
      /(?:member\s+details\s+from\s*:\s*(?:New\s+member\s*-\s*)?)([A-Za-z][A-Za-z\s.'-]{1,60})/i,
    ];

    for (const pattern of namePatterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        const candidate = match[1]
          .replace(/[,;].*$/, '')
          .replace(/\b(phone|email|with|and|at|for|from|female|male|plan|starting|start|date)\b.*$/i, '')
          .trim();
        if (candidate.length >= 2 && candidate.length <= 120) {
          extracted.fullName = candidate;
          break;
        }
      }
    }

    if (!extracted.fullName) {
      missingFields.push('fullName');
    }

    const isComplete = !isAmbiguousPhone && !isMalformedPhone && missingFields.length === 0;

    let clarificationPrompt: string | undefined = undefined;
    if (isAmbiguousPhone) {
      clarificationPrompt =
        `Multiple phone numbers were detected (${cleanedCandidates.join(', ')}). Please clarify which phone number should be used for the member record.`;
    } else if (isMalformedPhone) {
      clarificationPrompt =
        'Phone must use E.164 format (e.g., +919876543210 or +12025550123 with country code and leading +). Please provide the valid E.164 phone number to proceed.';
    } else if (!isComplete) {
      if (missingFields.includes('fullName') && missingFields.includes('phone')) {
        clarificationPrompt =
          "Please provide the member's full name and phone number (E.164 format, e.g. +919876543210) to create the member record.";
      } else if (missingFields.includes('phone')) {
        clarificationPrompt = `Please provide a phone number for ${extracted.fullName || 'the member'} using E.164 format (e.g., +919876543210) to proceed with creating the member record.`;
      } else {
        clarificationPrompt = "Please provide the member's full name to proceed with creating the member record.";
      }
    }

    let summary = '';
    if (isAmbiguousPhone) {
      summary = `Ambiguous phone numbers detected: ${cleanedCandidates.join(', ')}`;
    } else if (isMalformedPhone) {
      summary = `Malformed phone number: ${malformedPhoneReason}`;
    } else if (isComplete) {
      summary = `Extracted all mandatory fields for ${extracted.fullName}: phone ${extracted.phone}`;
    } else {
      summary = `Missing mandatory field(s): ${missingFields.join(', ')}`;
    }

    return {
      extracted,
      missingFields,
      isComplete,
      isAmbiguousPhone,
      isMalformedPhone,
      malformedPhoneReason,
      rawPhoneCandidates: cleanedCandidates,
      clarificationPrompt,
      summary,
    };
  }

  async execute(context: ToolContext, args: { message?: string } | Record<string, any>): Promise<ToolResult> {
    if (!args || typeof args.message !== 'string' || args.message.trim() === '') {
      return this.error('message is required for field extraction', 'INVALID_ARGUMENTS');
    }

    const result = ExtractCreateMemberFieldsTool.extractFields(args.message);
    return this.success(result);
  }
}
