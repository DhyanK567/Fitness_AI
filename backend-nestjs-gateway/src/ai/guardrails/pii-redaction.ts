import { ScopeRules } from './scope-rules';

/**
 * PII Redaction Utility
 * 
 * Redacts personally identifiable information from text before sending to LLM.
 * Follows the AI Guardrail Spec v0.1 Section 4 (PII and data minimisation).
 * 
 * Rules:
 * - Redact phone numbers (Indian format)
 * - Redact email addresses
 * - Redact full names (simple heuristic)
 * - Never send: health notes, payment details, emergency contacts, credentials
 * - Tool arguments are schema-validated (zod, strict). Unknown fields are rejected.
 */

// Phone number patterns (Indian, US, and International)
const PHONE_PATTERNS = [
  /(?:\+91\s*|\b0?)\d{10}\b/g,               // +919876543210, +91 9876543210, 9876543210, 09876543210
  /(?:\+91\s*)?\b\d{5}[\s-]?\d{5}\b/g,       // +91 98765 43210, 98765 43210
  /(?:\+\d{1,3}\s*)?(?:\(\d{3}\)|\b\d{3})[\s-]?\d{3}[\s-]?\d{4}\b/g, // +1 555-123-4567, (555) 123-4567, 555-123-4567
];

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

// Payment card numbers (13-19 digits: 16 digits Visa/MasterCard/Discover/Rupay, 15 digits Amex)
const CARD_PATTERNS = [
  /\b(?:\d{4}[\s-]?){3}\d{4}\b/g, // 16 digits: 4111 2222 3333 4444 or 4111-2222-3333-4444 or 4111222233334444
  /\b\d{4}[\s-]?\d{6}[\s-]?\d{5}\b/g, // Amex 15 digits
];

// Aadhaar number pattern (12 digits, optionally spaced)
const AADHAAR_PATTERN = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;

// Simple name pattern: Two capitalized words (first + last name)
const NAME_PATTERN = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;

// Words to skip when redacting names (calendar, common words, fitness/studio domain terms)
const SKIP_NAME_WORDS = new Set([
  // Articles, demonstratives, pronouns & common discourse
  'The', 'This', 'That', 'These', 'Those', 'Here', 'There', 'Where', 'When', 'What', 'Who', 'How', 'Why', 'Which',
  'Yes', 'No', 'Ok', 'Okay', 'Hello', 'Hi', 'Hey', 'Bye', 'Thanks', 'Thank', 'Please', 'Sorry', 'Welcome',
  'Good', 'Bad', 'New', 'Old', 'Big', 'Small', 'Great', 'Best', 'Top', 'High', 'Low', 'Total',
  'First', 'Last', 'Next', 'Prev', 'Current', 'Previous', 'Future', 'Past', 'Present',
  'Today', 'Tomorrow', 'Yesterday', 'Daily', 'Weekly', 'Monthly', 'Annual', 'Yearly',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  // Studio & fitness domain terms
  'Yoga', 'Pilates', 'Cardio', 'Strength', 'Zumba', 'CrossFit', 'Boxing', 'Spin', 'Cycling', 'Fitness', 'Wellness',
  'Studio', 'Gym', 'Class', 'Classes', 'Session', 'Sessions', 'Schedule', 'Schedules',
  'Plan', 'Plans', 'Membership', 'Memberships', 'Member', 'Members', 'Trainer', 'Trainers', 'Coach', 'Staff',
  'Admin', 'Front', 'Desk', 'Gold', 'Silver', 'Bronze', 'Platinum', 'Basic', 'Premium', 'Elite',
  'Pass', 'Package', 'Tier', 'Level', 'Event', 'Events', 'Report', 'Reports', 'Summary', 'Dashboard',
  'Attendance', 'Booking', 'Bookings', 'Payment', 'Payments', 'Invoice', 'Order', 'Lead', 'Leads',
  'Active', 'Inactive', 'All', 'Some', 'Any', 'None', 'Only', 'Can', 'Could', 'Would', 'Should', 'Will', 'May', 'Might',
]);

interface RedactionResult {
  redacted: string;
  redactions: Array<{
    type: 'phone' | 'email' | 'name' | 'aadhaar' | 'card';
    original: string;
    placeholder: string;
  }>;
}

export class PiiRedaction {
  /**
   * Redact PII from text
   */
  static redact(text: string): RedactionResult {
    if (!text || typeof text !== 'string') {
      return { redacted: text || '', redactions: [] };
    }

    const redactions: RedactionResult['redactions'] = [];
    let redacted = text;

    // Redact phone numbers
    for (const pattern of PHONE_PATTERNS) {
      redacted = redacted.replace(pattern, (match) => {
        const placeholder = '[PHONE]';
        redactions.push({ type: 'phone', original: match, placeholder });
        return placeholder;
      });
    }

    // Redact emails
    redacted = redacted.replace(EMAIL_PATTERN, (match) => {
      const placeholder = '[EMAIL]';
      redactions.push({ type: 'email', original: match, placeholder });
      return placeholder;
    });

    // Redact credit/debit card numbers
    for (const pattern of CARD_PATTERNS) {
      redacted = redacted.replace(pattern, (match) => {
        const placeholder = '[CARD]';
        redactions.push({ type: 'card', original: match, placeholder });
        return placeholder;
      });
    }

    // Redact Aadhaar numbers
    redacted = redacted.replace(AADHAAR_PATTERN, (match) => {
      const placeholder = '[AADHAAR]';
      redactions.push({ type: 'aadhaar', original: match, placeholder });
      return placeholder;
    });

    // Redact names (be careful not to redact common words or studio terminology)
    redacted = redacted.replace(NAME_PATTERN, (match) => {
      const words = match.split(' ');
      if (words.some((word) => SKIP_NAME_WORDS.has(word))) {
        return match;
      }
      
      const placeholder = '[NAME]';
      redactions.push({ type: 'name', original: match, placeholder });
      return placeholder;
    });

    return { redacted, redactions };
  }

  /**
   * Redact PII from an object (recursively)
   */
  static redactObject(obj: unknown): RedactionResult & { object: unknown } {
    if (obj === null || obj === undefined) {
      return { redacted: '', redactions: [], object: obj };
    }

    if (typeof obj === 'string') {
      const result = this.redact(obj);
      return { ...result, object: result.redacted };
    }

    if (Array.isArray(obj)) {
      const results = obj.map(item => this.redactObject(item));
      const allRedactions = results.flatMap(r => r.redactions);
      return { redacted: '', redactions: allRedactions, object: results.map(r => r.object) };
    }

    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      const allRedactions: RedactionResult['redactions'] = [];
      
      for (const [key, value] of Object.entries(obj)) {
        const redacted = this.redactObject(value);
        result[key] = redacted.object;
        allRedactions.push(...redacted.redactions);
      }
      
      return { redacted: '', redactions: allRedactions, object: result };
    }

    return { redacted: '', redactions: [], object: obj };
  }

  /**
   * Check if text contains potential PII
   */
  static hasPii(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    
    return PHONE_PATTERNS.some(p => p.test(text)) ||
           EMAIL_PATTERN.test(text) ||
           CARD_PATTERNS.some(p => p.test(text)) ||
           AADHAAR_PATTERN.test(text) ||
           this.hasPersonName(text);
  }

  private static hasPersonName(text: string): boolean {
    const matches = text.match(NAME_PATTERN);
    if (!matches) return false;
    return matches.some((match) => {
      const words = match.split(' ');
      return !words.some((word) => SKIP_NAME_WORDS.has(word));
    });
  }

  /**
   * Redact sensitive patterns (phones, emails, cards, Aadhaar) from text for audit logs
   * without stripping legitimate business names/titles
   */
  static redactTextForAudit(text: string): string {
    if (!text || typeof text !== 'string') return text || '';
    let redacted = text;
    for (const pattern of PHONE_PATTERNS) {
      redacted = redacted.replace(pattern, '[PHONE]');
    }
    redacted = redacted.replace(EMAIL_PATTERN, '[EMAIL]');
    for (const pattern of CARD_PATTERNS) {
      redacted = redacted.replace(pattern, '[CARD]');
    }
    redacted = redacted.replace(AADHAAR_PATTERN, '[AADHAAR]');
    return redacted;
  }

  /**
   * Sanitize tool arguments before logging
   */
  static sanitizeForLogging(args: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = [
      'phone',
      'email',
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
      'ssn',
      'aadhaar',
      'pan',
      'emergency_contact',
    ];
    
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(args)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(s => lowerKey.includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        sanitized[key] = this.redactTextForAudit(value);
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(item => {
          if (typeof item === 'string') return this.redactTextForAudit(item);
          if (typeof item === 'object' && item !== null) return this.sanitizeForLogging(item as Record<string, unknown>);
          return item;
        });
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeForLogging(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
}

/**
 * Convenience function for simple redaction
 */
export function redactPii(text: string): string {
  return PiiRedaction.redact(text).redacted;
}