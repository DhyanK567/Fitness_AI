'use client';

import { useState, useCallback, useEffect } from 'react';
import { AiApi } from '@/features/ai/api/ai-api';
import { PublicEnquiryApi } from '@/features/ai/api/public-enquiry-api';
import { AssistantMessageResponse } from '@/features/ai/types';
import { PublicEnquiryMessageResponse } from '@/features/ai/types/public-enquiry';

export interface UseAIChatOptions {
  variant: 'enquiry' | 'member';
  onMessageReceived?: (response: AssistantMessageResponse | PublicEnquiryMessageResponse) => void;
  onError?: (error: Error) => void;
}

export interface UseAIChatReturn {
  sendMessage: (message: string) => Promise<{ text: string; type?: string; pending_action?: any; tools_used?: any[] } | void>;
  isLoading: boolean;
  error: Error | null;
  sessionId: string | null;
  clearError: () => void;
}

// Mock captcha token for development mode
const MOCK_CAPTCHA_TOKEN = 'dev_mock_captcha_token';

/**
 * Hook for connecting FloatingAIChat to the backend AI assistant
 * Handles session creation, message sending, and error handling
 * Uses PublicEnquiryApi for 'enquiry' variant (no auth required)
 * Uses AiApi for 'member' variant (requires member/staff JWT)
 */
export function useAIChat({
  variant,
  onMessageReceived,
  onError,
}: UseAIChatOptions): UseAIChatReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initialize session on mount
  useEffect(() => {
    const initSession = async () => {
      try {
        let response: any;
        if (variant === 'enquiry') {
          response = await PublicEnquiryApi.createSession({
            captcha_token: MOCK_CAPTCHA_TOKEN,
          });
        } else {
          response = await AiApi.createSession();
        }
        if (response?.session_id) {
          setSessionId(response.session_id);
        }
      } catch (err) {
        console.error('Failed to create AI chat session:', err);
        // Don't set error here - we'll handle it on first message attempt
      }
    };
    initSession();
  }, [variant]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim()) return;
      setIsLoading(true);
      setError(null);

      try {
        // Create session if not exists
        let currentSessionId = sessionId;
        if (!currentSessionId) {
          let response: any;
          if (variant === 'enquiry') {
            response = await PublicEnquiryApi.createSession({
              captcha_token: MOCK_CAPTCHA_TOKEN,
            });
          } else {
            response = await AiApi.createSession();
          }
          currentSessionId = response?.session_id || null;
          if (currentSessionId) {
            setSessionId(currentSessionId);
          }
        }

        if (!currentSessionId) {
          throw new Error('Unable to establish chat session. Please try again.');
        }

        // Send message
        let response: any;
        if (variant === 'enquiry') {
          response = await PublicEnquiryApi.postMessage(currentSessionId, { message });
        } else {
          response = await AiApi.sendMessage(currentSessionId, message);
        }

        // Call callback with response
        if (onMessageReceived) {
          onMessageReceived(response);
        }

        // Return response for FloatingAIChat to handle
        return {
          text: response.text || response.response || 'No response',
          type: response.type,
          pending_action: response.pending_action,
          tools_used: response.tools_used,
        };
      } catch (err: any) {
        const errorMessage = err?.message || 'Failed to send message. Please try again.';
        const error = new Error(errorMessage);
        setError(error);
        if (onError) {
          onError(error);
        }
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId, variant, onMessageReceived, onError]
  );

  return {
    sendMessage,
    isLoading,
    error,
    sessionId,
    clearError,
  };
}