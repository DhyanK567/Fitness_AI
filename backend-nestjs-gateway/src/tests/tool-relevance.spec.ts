import { describe, it, expect } from '@jest/globals';
import { selectRelevantTools, calculateToolRelevanceScore, TOOL_RELEVANCE_MAP } from '../ai/tools/tool-relevance';
import { TOOLS } from '@wsos/ai-tool-definitions';

describe('Tool Relevance Scoring', () => {
  const adminContext = { role: 'admin', tenantId: 'tenant-1' };
  const availableTools = TOOLS;

  describe('getDashboardSummary relevance', () => {
    it('scores higher for "summarize" queries', () => {
      const score = calculateToolRelevanceScore(
        'Summarize my studio operational status',
        'getDashboardSummary',
        'Return the same KPI payload the dashboard shows.'
      );
      expect(score).toBeGreaterThan(0);
    });

    it('scores higher for "operational" queries', () => {
      const score = calculateToolRelevanceScore(
        'Give me an overview of studio operations',
        'getDashboardSummary',
        'Return the same KPI payload the dashboard shows.'
      );
      expect(score).toBeGreaterThan(0);
    });

    it('scores higher for "dashboard" queries', () => {
      const score = calculateToolRelevanceScore(
        'Show my studio dashboard',
        'getDashboardSummary',
        'Return the same KPI payload the dashboard shows.'
      );
      expect(score).toBeGreaterThan(0);
    });

    it('scores higher for "overview" queries', () => {
      const score = calculateToolRelevanceScore(
        'Give me an overview of studio operations',
        'getDashboardSummary',
        'Return the same KPI payload the dashboard shows.'
      );
      expect(score).toBeGreaterThan(0);
    });

    it('scores higher for "status" queries', () => {
      const score = calculateToolRelevanceScore(
        'What is the current operational status?',
        'getDashboardSummary',
        'Return the same KPI payload the dashboard shows.'
      );
      expect(score).toBeGreaterThan(0);
    });

    it('scores higher for "metrics" queries', () => {
      const score = calculateToolRelevanceScore(
        'Give me the latest operational metrics',
        'getDashboardSummary',
        'Return the same KPI payload the dashboard shows.'
      );
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('getMemberCount relevance', () => {
    it('scores higher for "member count" queries', () => {
      const score = calculateToolRelevanceScore(
        'How many active members do we have?',
        'getMemberCount',
        'Count members with an optional status filter.'
      );
      expect(score).toBeGreaterThan(0);
    });

    it('scores higher for "total members" queries', () => {
      const score = calculateToolRelevanceScore(
        'Total member count',
        'getMemberCount',
        'Count members with an optional status filter.'
      );
      expect(score).toBeGreaterThan(0);
    });

    it('scores higher for "frozen members" queries', () => {
      const score = calculateToolRelevanceScore(
        'How many frozen members?',
        'getMemberCount',
        'Count members with an optional status filter.'
      );
      expect(score).toBeGreaterThan(0);
    });

    it('scores higher for "paused members" queries', () => {
      const score = calculateToolRelevanceScore(
        'How many members are paused?',
        'getMemberCount',
        'Count members with an optional status filter.'
      );
      expect(score).toBeGreaterThan(0);
    });

    it('scores higher for "count members by status" queries', () => {
      const score = calculateToolRelevanceScore(
        'Count members by membership status',
        'getMemberCount',
        'Count members with an optional status filter.'
      );
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('Tool selection for operational status queries', () => {
    it('selects getDashboardSummary for "Summarize my studio operational status"', () => {
      const selected = selectRelevantTools(
        'Summarize my studio operational status',
        availableTools,
        adminContext,
        { maxTools: 10 }
      );
      expect(selected.some(t => t.name === 'getDashboardSummary')).toBe(true);
    });

    it('selects getDashboardSummary for "Give me an overview of studio operations"', () => {
      const selected = selectRelevantTools(
        'Give me an overview of studio operations',
        availableTools,
        adminContext,
        { maxTools: 10 }
      );
      expect(selected.some(t => t.name === 'getDashboardSummary')).toBe(true);
    });

    it('selects getDashboardSummary for "Show my studio dashboard"', () => {
      const selected = selectRelevantTools(
        'Show my studio dashboard',
        availableTools,
        adminContext,
        { maxTools: 10 }
      );
      expect(selected.some(t => t.name === 'getDashboardSummary')).toBe(true);
    });

    it('selects getDashboardSummary for "Give me the latest operational metrics"', () => {
      const selected = selectRelevantTools(
        'Give me the latest operational metrics',
        availableTools,
        adminContext,
        { maxTools: 10 }
      );
      expect(selected.some(t => t.name === 'getDashboardSummary')).toBe(true);
    });

    it('selects getDashboardSummary for "Show me the overall studio summary"', () => {
      const selected = selectRelevantTools(
        'Show me the overall studio summary',
        availableTools,
        adminContext,
        { maxTools: 10 }
      );
      expect(selected.some(t => t.name === 'getDashboardSummary')).toBe(true);
    });

    it('selects ONLY getDashboardSummary for dashboard summary query (excludes unrelated tools)', () => {
      const selected = selectRelevantTools(
        'Give me a complete summary of my fitness studio for today. Include total active members, today\'s scheduled sessions, total bookings, verified attendance, occupancy rate, memberships expiring in the next 7 days, and revenue for this month.',
        availableTools,
        adminContext,
        { maxTools: 10 }
      );
      expect(selected.some(t => t.name === 'getDashboardSummary')).toBe(true);
      // Should NOT include unrelated tools
      expect(selected.some(t => t.name === 'createMember')).toBe(false);
      expect(selected.some(t => t.name === 'getPublicEventList')).toBe(false);
      expect(selected.some(t => t.name === 'getPublicClassSchedule')).toBe(false);
      expect(selected.some(t => t.name === 'getActivePlansPublic')).toBe(false);
      expect(selected.some(t => t.name === 'captureLead')).toBe(false);
      expect(selected.some(t => t.name === 'getMemberGoalAndLevel')).toBe(false);
      expect(selected.some(t => t.name === 'getEligibleSessionsForRecommendation')).toBe(false);
      expect(selected.some(t => t.name === 'classifyFeedback')).toBe(false);
      expect(selected.some(t => t.name === 'searchKnowledgeBase')).toBe(false);
    });

    it('selects ONLY getDashboardSummary and getExpiringMemberships for dashboard with expiring query', () => {
      const selected = selectRelevantTools(
        'Show me the studio dashboard summary and also memberships expiring in the next 7 days',
        availableTools,
        adminContext,
        { maxTools: 10 }
      );
      expect(selected.some(t => t.name === 'getDashboardSummary')).toBe(true);
      expect(selected.some(t => t.name === 'getExpiringMemberships')).toBe(true);
      // Should NOT include unrelated tools
      expect(selected.some(t => t.name === 'createMember')).toBe(false);
      expect(selected.some(t => t.name === 'getPublicEventList')).toBe(false);
      expect(selected.some(t => t.name === 'captureLead')).toBe(false);
    });
  });

  describe('Tool selection for member count queries', () => {
    it('selects getMemberCount for "How many active members do we have?"', () => {
      const selected = selectRelevantTools(
        'How many active members do we have?',
        availableTools,
        adminContext,
        { maxTools: 10 }
      );
      expect(selected.some(t => t.name === 'getMemberCount')).toBe(true);
    });

    it('selects getMemberCount for "Total member count"', () => {
      const selected = selectRelevantTools(
        'Total member count',
        availableTools,
        adminContext,
        { maxTools: 10 }
      );
      expect(selected.some(t => t.name === 'getMemberCount')).toBe(true);
    });

    it('selects getMemberCount for "How many frozen members?"', () => {
      const selected = selectRelevantTools(
        'How many frozen members?',
        availableTools,
        adminContext,
        { maxTools: 10 }
      );
      expect(selected.some(t => t.name === 'getMemberCount')).toBe(true);
    });

    it('selects getMemberCount for "How many members are paused?"', () => {
      const selected = selectRelevantTools(
        'How many members are paused?',
        availableTools,
        adminContext,
        { maxTools: 10 }
      );
      expect(selected.some(t => t.name === 'getMemberCount')).toBe(true);
    });

    it('selects getMemberCount for "Count members by membership status"', () => {
      const selected = selectRelevantTools(
        'Count members by membership status',
        availableTools,
        adminContext,
        { maxTools: 10 }
      );
      expect(selected.some(t => t.name === 'getMemberCount')).toBe(true);
    });
  });

  describe('Keyword map completeness', () => {
    it('getDashboardSummary has operational status keywords', () => {
      const entry = TOOL_RELEVANCE_MAP.find(e => e.toolName === 'getDashboardSummary');
      expect(entry).toBeDefined();
      expect(entry!.keywords).toContain('summarize');
      expect(entry!.keywords).toContain('operational');
      expect(entry!.keywords).toContain('overview');
      expect(entry!.keywords).toContain('dashboard');
      expect(entry!.keywords).toContain('status');
      expect(entry!.keywords).toContain('summary');
      expect(entry!.keywords).toContain('metrics');
    });

    it('getMemberCount does not have "status" in purpose', () => {
      const memberCountTool = TOOLS.find(t => t.name === 'getMemberCount');
      expect(memberCountTool).toBeDefined();
      expect(memberCountTool!.purpose).not.toContain('optionally by status');
      expect(memberCountTool!.purpose).toContain('optional status filter');
    });
  });
});