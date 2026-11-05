import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { LeadScoringService } from '../ai/crm/lead-scoring.service';
import { PipelineService } from '../ai/crm/pipeline.service';
import { CrmCampaignService } from '../ai/crm/crm-campaign.service';
import {
  ScoreLeadTool,
  GetPipelineOverviewTool,
  MoveLeadInPipelineTool,
  CreatePipelineStageTool,
  CreateCrmCampaignTool,
  EnrollInCampaignTool,
  GetCampaignMetricsTool,
} from '../ai/tools/crm-tools';
import { ToolRegistry } from '../ai/tools/tool-registry';
import { AgentRegistryService } from '../ai/agents/agent-registry.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { can } from '../common/policy';
import { canUseTool } from '../ai/guardrails/scope-rules';

describe('AI-06: CRM Agent (crm-agent) Specification & Verification Suite', () => {
  const TENANT_A = '11111111-1111-4000-8000-000000000001';
  const TENANT_B = '22222222-2222-4000-8000-000000000002';
  const LEAD_A_ID = '33333333-3333-4000-8000-000000000001';
  const LEAD_B_ID = '33333333-3333-4000-8000-000000000002';
  const STAGE_1_ID = '44444444-4444-4000-8000-000000000001';
  const STAGE_2_ID = '44444444-4444-4000-8000-000000000002';
  const CAMPAIGN_ID = '55555555-5555-4000-8000-000000000001';
  const USER_ADMIN_ID = '66666666-6666-4000-8000-000000000001';

  let inMemoryLeads: Map<string, any>;
  let inMemoryScores: Map<string, any>;
  let inMemoryStages: Map<string, any>;
  let inMemoryEntries: Map<string, any>;
  let inMemoryCampaigns: Map<string, any>;
  let inMemoryEnrollments: Map<string, any>;
  let inMemoryMembers: Map<string, any>;
  let inMemoryAuditLogs: any[];
  let inMemoryOutboxEvents: any[];

  let mockTx: any;
  let mockPrisma: any;
  let mockLlmGateway: any;
  let mockOrchestrator: any;
  let auditOutbox: AuditOutboxService;
  let leadScoringService: LeadScoringService;
  let pipelineService: PipelineService;
  let crmCampaignService: CrmCampaignService;
  let toolRegistry: ToolRegistry;
  let agentRegistry: AgentRegistryService;

  beforeEach(() => {
    inMemoryLeads = new Map([
      [
        LEAD_A_ID,
        {
          id: LEAD_A_ID,
          tenantId: TENANT_A,
          name: 'Priya Sharma',
          phone: '+919876543210',
          email: 'priya.sharma@example.com',
          stage: 'New enquiry',
          source: 'Website',
          plan: 'Premium',
          notes: 'Interested in early morning yoga and strength training.',
          createdAt: new Date(Date.now() - 3 * 86400000), // 3 days ago
          updatedAt: new Date(Date.now() - 1 * 86400000),
        },
      ],
      [
        LEAD_B_ID,
        {
          id: LEAD_B_ID,
          tenantId: TENANT_B,
          name: 'Rahul Varma',
          phone: '+919123456789',
          email: 'rahul.varma@example.com',
          stage: 'New enquiry',
          source: 'Walk-in',
          plan: 'Basic',
          notes: 'Looking for evening gym access.',
          createdAt: new Date(Date.now() - 10 * 86400000),
          updatedAt: new Date(Date.now() - 5 * 86400000),
        },
      ],
    ]);

    inMemoryScores = new Map();
    inMemoryStages = new Map([
      [
        STAGE_1_ID,
        {
          id: STAGE_1_ID,
          tenantId: TENANT_A,
          name: 'new_enquiry',
          displayName: 'New enquiry',
          stageOrder: 1,
          isDefault: true,
          isActive: true,
          winProbability: 10,
          color: '#3B82F6',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      [
        STAGE_2_ID,
        {
          id: STAGE_2_ID,
          tenantId: TENANT_A,
          name: 'trial_scheduled',
          displayName: 'Trial scheduled',
          stageOrder: 2,
          isDefault: false,
          isActive: true,
          winProbability: 30,
          color: '#10B981',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ]);

    inMemoryEntries = new Map([
      [
        'entry-1',
        {
          id: 'entry-1',
          tenantId: TENANT_A,
          leadId: LEAD_A_ID,
          stageId: STAGE_1_ID,
          enteredAt: new Date(Date.now() - 2 * 86400000),
          exitedAt: null,
          movedBy: 'system',
        },
      ],
    ]);

    inMemoryCampaigns = new Map([
      [
        CAMPAIGN_ID,
        {
          id: CAMPAIGN_ID,
          tenantId: TENANT_A,
          name: 'Diwali Fitness Kickstart',
          description: 'Special seasonal promotion for trial enquiries',
          campaignType: 'promotional',
          status: 'active',
          targetAudience: { stage: 'New enquiry' },
          scheduledAt: null,
          launchedAt: new Date(),
          completedAt: null,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ]);

    inMemoryEnrollments = new Map();
    inMemoryMembers = new Map([
      [
        'member-1',
        {
          id: 'member-1',
          tenantId: TENANT_A,
          fullName: 'Ananya Roy',
          email: 'ananya@example.com',
          phone: '+919988776655',
          status: 'Active',
          joined: new Date(),
        },
      ],
      [
        'member-cross-tenant',
        {
          id: 'member-cross-tenant',
          tenantId: TENANT_B,
          fullName: 'Vikram Seth',
          email: 'vikram@example.com',
          phone: '+919988776644',
          status: 'Active',
          joined: new Date(),
        },
      ],
    ]);
    inMemoryAuditLogs = [];
    inMemoryOutboxEvents = [];

    mockTx = {
      tenant: {
        findUnique: jest.fn<any>().mockResolvedValue({ id: TENANT_A }),
      },
      studioMember: {
        findMany: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          return Array.from(inMemoryMembers.values()).filter((m) => {
            if (where.tenantId && m.tenantId !== where.tenantId) return false;
            if (where.id && Array.isArray(where.id.in) && !where.id.in.includes(m.id)) return false;
            return true;
          });
        }),
        findFirst: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          const m = inMemoryMembers.get(where.id);
          if (m && (!where.tenantId || m.tenantId === where.tenantId)) {
            return { ...m };
          }
          return null;
        }),
      },
      studioLead: {
        findFirst: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          const lead = inMemoryLeads.get(where.id);
          if (lead && (!where.tenantId || lead.tenantId === where.tenantId)) {
            return { ...lead };
          }
          return null;
        }),
        findMany: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          return Array.from(inMemoryLeads.values()).filter((l) => {
            if (where.tenantId && l.tenantId !== where.tenantId) return false;
            if (where.id && Array.isArray(where.id.in) && !where.id.in.includes(l.id)) return false;
            return true;
          });
        }),
        update: jest.fn<any>().mockImplementation(async ({ where, data }: any) => {
          const lead = inMemoryLeads.get(where.id);
          if (!lead) throw new NotFoundException('Lead not found');
          const updated = { ...lead, ...data, updatedAt: new Date() };
          inMemoryLeads.set(where.id, updated);
          return updated;
        }),
        updateMany: jest.fn<any>().mockImplementation(async ({ where, data }: any) => {
          let count = 0;
          for (const [id, lead] of Array.from(inMemoryLeads.entries())) {
            if ((!where.id || where.id === id) && (!where.tenantId || lead.tenantId === where.tenantId)) {
              inMemoryLeads.set(id, { ...lead, ...data, updatedAt: new Date() });
              count++;
            }
          }
          return { count };
        }),
        count: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          return Array.from(inMemoryLeads.values()).filter((l) => {
            if (where.tenantId && l.tenantId !== where.tenantId) return false;
            return true;
          }).length;
        }),
      },
      leadScore: {
        upsert: jest.fn<any>().mockImplementation(async ({ where, create, update }: any) => {
          const leadId = where.tenantId_leadId?.leadId || create.leadId;
          const existing = inMemoryScores.get(leadId);
          const score = existing ? { ...existing, ...update, updatedAt: new Date() } : { id: `score-${Date.now()}`, ...create, createdAt: new Date(), updatedAt: new Date() };
          inMemoryScores.set(leadId, score);
          return score;
        }),
        findFirst: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          const score = inMemoryScores.get(where.leadId);
          if (score && (!where.tenantId || score.tenantId === where.tenantId)) {
            return { ...score };
          }
          return null;
        }),
        findMany: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          return Array.from(inMemoryScores.values()).filter((s) => {
            if (where.tenantId && s.tenantId !== where.tenantId) return false;
            return true;
          });
        }),
      },
      pipelineStage: {
        findMany: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          return Array.from(inMemoryStages.values()).filter((s) => {
            if (where.tenantId && s.tenantId !== where.tenantId) return false;
            if (where.isActive !== undefined && s.isActive !== where.isActive) return false;
            return true;
          }).sort((a, b) => a.stageOrder - b.stageOrder);
        }),
        findFirst: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          return Array.from(inMemoryStages.values()).find((s) => {
            if (where.tenantId && s.tenantId !== where.tenantId) return false;
            if (where.id && s.id !== where.id) return false;
            if (where.name && s.name.toLowerCase() !== where.name.toLowerCase()) return false;
            if (where.displayName && s.displayName.toLowerCase() !== where.displayName.toLowerCase()) return false;
            if (where.isDefault !== undefined && s.isDefault !== where.isDefault) return false;
            return true;
          }) || null;
        }),
        count: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          return Array.from(inMemoryStages.values()).filter((s) => {
            if (where.tenantId && s.tenantId !== where.tenantId) return false;
            return true;
          }).length;
        }),
        upsert: jest.fn<any>().mockImplementation(async ({ where, create, update }: any) => {
          const tenantId = where.tenantId_name?.tenantId || create.tenantId;
          const name = where.tenantId_name?.name || create.name;
          const existing = Array.from(inMemoryStages.values()).find(
            (s) => s.tenantId === tenantId && s.name.toLowerCase() === name.toLowerCase(),
          );
          if (existing) {
            const updated = { ...existing, ...update, updatedAt: new Date() };
            inMemoryStages.set(existing.id, updated);
            return updated;
          }
          const stage = {
            id: `stage-${Date.now()}-${Math.random()}`,
            displayName: create.displayName || create.name,
            stageOrder: create.stageOrder || 1,
            isActive: create.isActive ?? true,
            isDefault: create.isDefault ?? false,
            winProbability: create.winProbability || 0,
            color: create.color || null,
            metadata: create.metadata || {},
            createdAt: new Date(),
            updatedAt: new Date(),
            ...create,
          };
          inMemoryStages.set(stage.id, stage);
          return stage;
        }),
        create: jest.fn<any>().mockImplementation(async ({ data }: any) => {
          const stage = {
            id: `stage-${Date.now()}-${Math.random()}`,
            displayName: data.displayName || data.name,
            stageOrder: data.stageOrder || 1,
            isActive: data.isActive ?? true,
            isDefault: data.isDefault ?? false,
            winProbability: data.winProbability || 0,
            color: data.color || null,
            metadata: data.metadata || {},
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          };
          inMemoryStages.set(stage.id, stage);
          return stage;
        }),
        createMany: jest.fn<any>().mockImplementation(async ({ data }: any) => {
          for (const item of data) {
            const stage = {
              id: `stage-${Date.now()}-${Math.random()}`,
              displayName: item.displayName || item.name,
              stageOrder: item.stageOrder || 1,
              isActive: item.isActive ?? true,
              isDefault: item.isDefault ?? false,
              winProbability: item.winProbability || 0,
              color: item.color || null,
              metadata: item.metadata || {},
              createdAt: new Date(),
              updatedAt: new Date(),
              ...item,
            };
            inMemoryStages.set(stage.id, stage);
          }
          return { count: data.length };
        }),
        updateMany: jest.fn<any>().mockImplementation(async ({ where, data }: any) => {
          let count = 0;
          for (const [id, stage] of Array.from(inMemoryStages.entries())) {
            if ((!where.id || where.id === id) && (!where.tenantId || stage.tenantId === where.tenantId)) {
              inMemoryStages.set(id, { ...stage, ...data, updatedAt: new Date() });
              count++;
            }
          }
          return { count };
        }),
      },
      pipelineEntry: {
        findMany: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          return Array.from(inMemoryEntries.values()).filter((e) => {
            if (where.tenantId && e.tenantId !== where.tenantId) return false;
            if (where.leadId && e.leadId !== where.leadId) return false;
            if (where.stageId && e.stageId !== where.stageId) return false;
            if (where.exitedAt === null && e.exitedAt !== null) return false;
            return true;
          });
        }),
        findFirst: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          return Array.from(inMemoryEntries.values()).find((e) => {
            if (where.tenantId && e.tenantId !== where.tenantId) return false;
            if (where.leadId && e.leadId !== where.leadId) return false;
            if (where.stageId && e.stageId !== where.stageId) return false;
            if (where.exitedAt === null && e.exitedAt !== null) return false;
            return true;
          }) || null;
        }),
        count: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          return Array.from(inMemoryEntries.values()).filter((e) => {
            if (where.tenantId && e.tenantId !== where.tenantId) return false;
            if (where.leadId && e.leadId !== where.leadId) return false;
            return true;
          }).length;
        }),
        updateMany: jest.fn<any>().mockImplementation(async ({ where, data }: any) => {
          let count = 0;
          for (const [id, entry] of Array.from(inMemoryEntries.entries())) {
            if (
              (!where.id || where.id === id) &&
              (!where.tenantId || entry.tenantId === where.tenantId) &&
              (!where.leadId || entry.leadId === where.leadId) &&
              (!where.stageId || entry.stageId === where.stageId) &&
              (where.exitedAt === undefined || (where.exitedAt === null && entry.exitedAt === null))
            ) {
              inMemoryEntries.set(id, { ...entry, ...data });
              count++;
            }
          }
          return { count };
        }),
        create: jest.fn<any>().mockImplementation(async ({ data }: any) => {
          const entry = { id: `entry-${Date.now()}-${Math.random()}`, exitedAt: null, createdAt: new Date(), ...data };
          inMemoryEntries.set(entry.id, entry);
          return { ...entry, stage: inMemoryStages.get(data.stageId) };
        }),
      },
      crmCampaign: {
        findFirst: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          const c = inMemoryCampaigns.get(where.id);
          if (c && (!where.tenantId || c.tenantId === where.tenantId)) {
            return { ...c };
          }
          return null;
        }),
        findMany: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          return Array.from(inMemoryCampaigns.values()).filter((c) => {
            if (where.tenantId && c.tenantId !== where.tenantId) return false;
            if (where.status && c.status !== where.status) return false;
            return true;
          });
        }),
        create: jest.fn<any>().mockImplementation(async ({ data }: any) => {
          const campaign = { id: `campaign-${Date.now()}`, createdAt: new Date(), updatedAt: new Date(), ...data };
          inMemoryCampaigns.set(campaign.id, campaign);
          return campaign;
        }),
        update: jest.fn<any>().mockImplementation(async ({ where, data }: any) => {
          const c = inMemoryCampaigns.get(where.id);
          if (!c) throw new NotFoundException('Campaign not found');
          const updated = { ...c, ...data, updatedAt: new Date() };
          inMemoryCampaigns.set(where.id, updated);
          return updated;
        }),
      },
      campaignEnrollment: {
        findMany: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          return Array.from(inMemoryEnrollments.values()).filter((e) => {
            if (where.tenantId && e.tenantId !== where.tenantId) return false;
            if (where.campaignId && e.campaignId !== where.campaignId) return false;
            return true;
          });
        }),
        createMany: jest.fn<any>().mockImplementation(async ({ data }: any) => {
          let count = 0;
          for (const item of data) {
            const key = `${item.tenantId}:${item.campaignId}:${item.leadId}`;
            if (!inMemoryEnrollments.has(key)) {
              inMemoryEnrollments.set(key, { id: `enroll-${count++}`, ...item, enrolledAt: new Date() });
            }
          }
          return { count };
        }),
        count: jest.fn<any>().mockImplementation(async ({ where }: any) => {
          return Array.from(inMemoryEnrollments.values()).filter((e) => {
            if (where.tenantId && e.tenantId !== where.tenantId) return false;
            if (where.campaignId && e.campaignId !== where.campaignId) return false;
            if (where.status && e.status !== where.status) return false;
            return true;
          }).length;
        }),
      },
      auditLog: {
        create: jest.fn<any>().mockImplementation(async ({ data }: any) => {
          const row = { id: `audit-${inMemoryAuditLogs.length + 1}`, createdAt: new Date(), ...data };
          inMemoryAuditLogs.push(row);
          return row;
        }),
      },
      outboxEvent: {
        create: jest.fn<any>().mockImplementation(async ({ data }: any) => {
          const row = { id: `outbox-${inMemoryOutboxEvents.length + 1}`, createdAt: new Date(), ...data };
          inMemoryOutboxEvents.push(row);
          return row;
        }),
      },
    };

    mockPrisma = {
      withTenant: jest.fn<any>().mockImplementation(async (tenantId: string, fn: (tx: any) => Promise<any>) => {
        return fn(mockTx);
      }),
    };

    mockLlmGateway = {
      healthCheck: jest.fn<any>().mockResolvedValue({ status: 'healthy', provider: 'gemini' }),
    };

    mockOrchestrator = {};

    auditOutbox = new AuditOutboxService(mockPrisma as any);
    leadScoringService = new LeadScoringService(mockPrisma as any);
    pipelineService = new PipelineService(mockPrisma as any, auditOutbox);
    crmCampaignService = new CrmCampaignService(mockPrisma as any, auditOutbox);

    const t26 = new ScoreLeadTool(null as any, leadScoringService);
    const t27 = new GetPipelineOverviewTool(null as any, pipelineService);
    const t28 = new MoveLeadInPipelineTool(null as any, pipelineService);
    const t29 = new CreatePipelineStageTool(null as any, pipelineService);
    const t30 = new CreateCrmCampaignTool(null as any, crmCampaignService);
    const t31 = new EnrollInCampaignTool(null as any, crmCampaignService);
    const t32 = new GetCampaignMetricsTool(null as any, crmCampaignService);

    const mockModuleRef: any = {
      get: (toolClass: any) => {
        if (toolClass === ScoreLeadTool) return t26;
        if (toolClass === GetPipelineOverviewTool) return t27;
        if (toolClass === MoveLeadInPipelineTool) return t28;
        if (toolClass === CreatePipelineStageTool) return t29;
        if (toolClass === CreateCrmCampaignTool) return t30;
        if (toolClass === EnrollInCampaignTool) return t31;
        if (toolClass === GetCampaignMetricsTool) return t32;
        return null;
      },
    };

    toolRegistry = new ToolRegistry(mockModuleRef, auditOutbox);
    void toolRegistry.onModuleInit();

    agentRegistry = new AgentRegistryService(
      mockPrisma as any,
      mockLlmGateway as any,
      auditOutbox,
      mockOrchestrator as any,
      toolRegistry,
      leadScoringService,
      pipelineService,
      crmCampaignService,
    );
  });

  // =========================================================================
  // 1. T-26: Lead Scoring from Real Domain Records & Persistence
  // =========================================================================
  describe('T-26: Lead Scoring from Real Domain Records (scoreLead)', () => {
    it('calculates deterministic score from real StudioLead and persists to lead_scores', async () => {
      const scoreResult = await leadScoringService.scoreLead(TENANT_A, LEAD_A_ID);

      expect(scoreResult).toBeDefined();
      expect(scoreResult.leadId).toBe(LEAD_A_ID);
      expect(scoreResult.leadName).toBe('Priya Sharma');
      expect(typeof scoreResult.score).toBe('number');
      expect(scoreResult.score).toBeGreaterThanOrEqual(0);
      expect(scoreResult.score).toBeLessThanOrEqual(100);
      expect(['HOT', 'WARM', 'COLD']).toContain(scoreResult.status);
      expect(scoreResult.breakdown).toBeDefined();
      expect(scoreResult.breakdown.source).toBeDefined();
      expect(scoreResult.breakdown.recency).toBeDefined();
      expect(scoreResult.breakdown.completeness).toBeDefined();

      // Check persistence in Prisma mock
      expect(mockTx.leadScore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_leadId: { tenantId: TENANT_A, leadId: LEAD_A_ID } },
          create: expect.objectContaining({
            tenantId: TENANT_A,
            leadId: LEAD_A_ID,
            score: scoreResult.score,
          }),
        }),
      );
    });

    it('throws NotFoundException when scoring a lead that does not exist', async () => {
      await expect(
        leadScoringService.scoreLead(TENANT_A, 'non-existent-lead-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('enforces tenant isolation: Tenant B cannot score Tenant A lead', async () => {
      await expect(
        leadScoringService.scoreLead(TENANT_B, LEAD_A_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // 2. T-27 & T-29: Pipeline Overview & Stage Creation
  // =========================================================================
  describe('T-27 & T-29: Pipeline Overview and Stage Management', () => {
    it('seeds 7 deterministic default stages if tenant pipeline is empty', async () => {
      inMemoryStages.clear(); // Empty stages
      const overview = await pipelineService.getPipelineOverview(TENANT_A);

      expect(overview).toBeDefined();
      expect(overview.length).toBe(7);
      expect(overview.map((s: any) => s.stage.displayName)).toEqual([
        'New Lead',
        'Contacted',
        'Qualified',
        'Proposal Sent',
        'Negotiation',
        'Won',
        'Lost',
      ]);
      expect(overview.find((s: any) => s.stage.name === 'new')?.stage.isDefault).toBe(true);
    });

    it('returns real stages and lead counts when stages exist', async () => {
      const overview = await pipelineService.getPipelineOverview(TENANT_A);

      expect(overview.length).toBe(2);
      const stage1 = overview.find((s: any) => s.stage.id === STAGE_1_ID);
      expect(stage1).toBeDefined();
      expect(stage1?.count).toBe(1);
      expect(stage1?.leads[0]?.lead?.name).toBe('Priya Sharma');
    });

    it('creates a custom pipeline stage and emits audit outbox event', async () => {
      const newStage = await pipelineService.createStage({
        tenantId: TENANT_A,
        name: 'vip_assessment',
        displayName: 'VIP Assessment',
        stageOrder: 3,
        color: '#8B5CF6',
      });

      expect(newStage).toBeDefined();
      expect(newStage.displayName).toBe('VIP Assessment');
      expect(newStage.tenantId).toBe(TENANT_A);

      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_A,
            eventType: 'pipeline_stage.created',
          }),
        }),
      );
    });

    it('rejects duplicate stage name within the same tenant', async () => {
      await expect(
        pipelineService.createStage({
          tenantId: TENANT_A,
          name: 'new_enquiry',
          displayName: 'New enquiry',
          stageOrder: 5,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('safely handles concurrency race when initializing default stages (CORR-CRM-05)', async () => {
      const EMPTY_TENANT = '33333333-0000-4000-8000-000000000000';
      const [res1, res2] = await Promise.all([
        pipelineService.getPipelineOverview(EMPTY_TENANT),
        pipelineService.getPipelineOverview(EMPTY_TENANT),
      ]);

      expect(res1).toBeDefined();
      expect(res2).toBeDefined();
      expect(res1.length).toBe(7);
      expect(res2.length).toBe(7);
      expect(res1[0].stage.name).toBe('new');
    });
  });

  // =========================================================================
  // 3. T-28: Lead Movement in Pipeline
  // =========================================================================
  describe('T-28: Move Lead in Pipeline (moveLeadInPipeline)', () => {
    it('moves lead to target stage, updates lead record, and emits outbox event', async () => {
      const moveResult = await pipelineService.moveLead({
        tenantId: TENANT_A,
        leadId: LEAD_A_ID,
        fromStageId: STAGE_1_ID,
        toStageId: STAGE_2_ID,
        notes: 'Lead confirmed attendance for Saturday trial class',
      });

      expect(moveResult).toBeDefined();
      expect(moveResult.stage.displayName).toBe('Trial scheduled');

      // Verify lead stage updated in domain model
      const updatedLead = inMemoryLeads.get(LEAD_A_ID);
      expect(updatedLead.stage).toBe('Trial scheduled');

      // Verify audit/outbox event recorded
      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_A,
            eventType: 'lead.moved_in_pipeline',
            subjectRef: LEAD_A_ID,
          }),
        }),
      );
    });

    it('rejects movement if target stage does not exist or belongs to another tenant', async () => {
      await expect(
        pipelineService.moveLead({
          tenantId: TENANT_A,
          leadId: LEAD_A_ID,
          fromStageId: STAGE_1_ID,
          toStageId: 'nonexistent-stage',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects movement if leadId does not exist in tenant (CORR-CRM-02)', async () => {
      await expect(
        pipelineService.moveLead({
          tenantId: TENANT_A,
          leadId: 'nonexistent-lead-id',
          fromStageId: STAGE_1_ID,
          toStageId: STAGE_2_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects movement if leadId belongs to another tenant (CORR-CRM-02)', async () => {
      await expect(
        pipelineService.moveLead({
          tenantId: TENANT_A,
          leadId: LEAD_B_ID, // belongs to TENANT_B
          fromStageId: STAGE_1_ID,
          toStageId: STAGE_2_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects movement if fromStageId does not match current active stage (CORR-CRM-03)', async () => {
      await expect(
        pipelineService.moveLead({
          tenantId: TENANT_A,
          leadId: LEAD_A_ID,
          fromStageId: STAGE_2_ID, // lead is currently in STAGE_1_ID
          toStageId: STAGE_1_ID,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('leaves exactly one active entry on successful move and creates no partial records on failure (CORR-CRM-03)', async () => {
      await pipelineService.moveLead({
        tenantId: TENANT_A,
        leadId: LEAD_A_ID,
        fromStageId: STAGE_1_ID,
        toStageId: STAGE_2_ID,
      });

      const activeEntries = Array.from(inMemoryEntries.values()).filter(
        (e) => e.leadId === LEAD_A_ID && e.exitedAt === null,
      );
      expect(activeEntries.length).toBe(1);
      expect(activeEntries[0].stageId).toBe(STAGE_2_ID);

      const outboxCountBefore = inMemoryOutboxEvents.length;
      await expect(
        pipelineService.moveLead({
          tenantId: TENANT_A,
          leadId: LEAD_A_ID,
          fromStageId: STAGE_1_ID, // stale source stage
          toStageId: STAGE_1_ID,
        }),
      ).rejects.toThrow(ConflictException);

      expect(inMemoryOutboxEvents.length).toBe(outboxCountBefore);
      const activeEntriesAfter = Array.from(inMemoryEntries.values()).filter(
        (e) => e.leadId === LEAD_A_ID && e.exitedAt === null,
      );
      expect(activeEntriesAfter.length).toBe(1);
      expect(activeEntriesAfter[0].stageId).toBe(STAGE_2_ID);
    });
  });

  // =========================================================================
  // 4. T-30, T-31, T-32: CRM Campaign Lifecycle & Metrics
  // =========================================================================
  describe('T-30, T-31, T-32: CRM Campaigns and Metrics', () => {
    it('creates campaign in draft status and emits outbox event', async () => {
      const campaign = await crmCampaignService.createCampaign({
        tenantId: TENANT_A,
        name: 'New Year Resolution 2027',
        description: 'Targeted nurture sequence for January signups',
        campaignType: 'nurture',
        targetSegment: { source: 'Website' },
        triggerConfig: { event: 'signup' },
        createdBy: USER_ADMIN_ID,
      });

      expect(campaign).toBeDefined();
      expect(campaign.name).toBe('New Year Resolution 2027');
      expect(campaign.status).toBe('draft');
      expect(campaign.tenantId).toBe(TENANT_A);

      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_A,
            eventType: 'crm_campaign.created',
          }),
        }),
      );
    });

    it('enrolls leads into active campaign with duplicate suppression', async () => {
      const enrollResult = await crmCampaignService.enrollLeads({
        tenantId: TENANT_A,
        campaignId: CAMPAIGN_ID,
        leadIds: [LEAD_A_ID, LEAD_A_ID], // Duplicate in array
      });

      expect(enrollResult.count).toBe(1); // Deduplicated

      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_A,
            eventType: 'crm_campaign.enrolled',
          }),
        }),
      );
    });

    it('rejects lead enrollment if campaign is not active', async () => {
      inMemoryCampaigns.set('draft-camp', {
        id: 'draft-camp',
        tenantId: TENANT_A,
        name: 'Draft Campaign',
        status: 'draft',
      });

      await expect(
        crmCampaignService.enrollLeads({
          tenantId: TENANT_A,
          campaignId: 'draft-camp',
          leadIds: [LEAD_A_ID],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('computes accurate campaign metrics', async () => {
      inMemoryEnrollments.set('e1', {
        id: 'e1',
        tenantId: TENANT_A,
        campaignId: CAMPAIGN_ID,
        leadId: LEAD_A_ID,
        status: 'converted',
      });

      const metrics = await crmCampaignService.getCampaignMetrics(TENANT_A, CAMPAIGN_ID);

      expect(metrics).toBeDefined();
      expect(metrics.campaign.id).toBe(CAMPAIGN_ID);
      expect(metrics.totalEnrolled).toBe(1);
      expect(metrics.converted).toBe(1);
      expect(metrics.conversionRate).toBe(100);
      expect(metrics.active).toBe(0);
      expect(metrics.unsubscribed).toBe(0);
    });

    it('rejects enrollment if leadId is nonexistent or belongs to another tenant (CORR-CRM-04)', async () => {
      await expect(
        crmCampaignService.enrollLeads({
          tenantId: TENANT_A,
          campaignId: CAMPAIGN_ID,
          leadIds: ['nonexistent-lead-id'],
        }),
      ).rejects.toThrow(NotFoundException);

      await expect(
        crmCampaignService.enrollLeads({
          tenantId: TENANT_A,
          campaignId: CAMPAIGN_ID,
          leadIds: [LEAD_B_ID],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects enrollment if memberId is nonexistent or belongs to another tenant (CORR-CRM-04)', async () => {
      await expect(
        crmCampaignService.enrollLeads({
          tenantId: TENANT_A,
          campaignId: CAMPAIGN_ID,
          memberIds: ['nonexistent-member-id'],
        }),
      ).rejects.toThrow(NotFoundException);

      await expect(
        crmCampaignService.enrollLeads({
          tenantId: TENANT_A,
          campaignId: CAMPAIGN_ID,
          memberIds: ['member-cross-tenant'],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects mixed batch with valid and invalid IDs, leaving enrollments unchanged (CORR-CRM-04)', async () => {
      const enrollCountBefore = inMemoryEnrollments.size;
      const outboxCountBefore = inMemoryOutboxEvents.length;

      await expect(
        crmCampaignService.enrollLeads({
          tenantId: TENANT_A,
          campaignId: CAMPAIGN_ID,
          leadIds: [LEAD_A_ID, 'invalid-lead-id'],
        }),
      ).rejects.toThrow(NotFoundException);

      expect(inMemoryEnrollments.size).toBe(enrollCountBefore);
      expect(inMemoryOutboxEvents.length).toBe(outboxCountBefore);
    });

    it('enrolls valid members into active campaign (CORR-CRM-04)', async () => {
      const result = await crmCampaignService.enrollLeads({
        tenantId: TENANT_A,
        campaignId: CAMPAIGN_ID,
        memberIds: ['member-1'],
      });

      expect(result.count).toBe(1);
    });
  });

  // =========================================================================
  // 5. Approval Architecture: Write Tools Two-Phase Confirmation Enforcement
  // =========================================================================
  describe('Approval Architecture: Write Tools Two-Phase Confirmation', () => {
    const adminContext = {
      tenantId: TENANT_A,
      tenantCode: 'TEST',
      userId: USER_ADMIN_ID,
      role: 'admin',
      correlationId: 'corr-approval-test',
    };

    it('blocks direct execution of T-28 (moveLeadInPipeline) without confirmation', async () => {
      const result = await toolRegistry.execute('moveLeadInPipeline', adminContext, {
        leadId: LEAD_A_ID,
        fromStageId: STAGE_1_ID,
        toStageId: STAGE_2_ID,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CONFIRMATION_REQUIRED');
      expect(result.error).toContain('requires pending-action confirmation');
    });

    it('allows execution of T-28 (moveLeadInPipeline) when isConfirmedPendingAction is true', async () => {
      const result = await toolRegistry.execute(
        'moveLeadInPipeline',
        adminContext,
        {
          leadId: LEAD_A_ID,
          fromStageId: STAGE_1_ID,
          toStageId: STAGE_2_ID,
        },
        { isConfirmedPendingAction: true },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).data.stage.displayName).toBe('Trial scheduled');
    });

    it('blocks direct execution of T-29 (createPipelineStage) without confirmation', async () => {
      const result = await toolRegistry.execute('createPipelineStage', adminContext, {
        name: 'vip_consult',
        displayName: 'VIP Consult',
        stageOrder: 4,
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CONFIRMATION_REQUIRED');
    });

    it('allows execution of T-29 (createPipelineStage) when confirmed', async () => {
      const result = await toolRegistry.execute(
        'createPipelineStage',
        adminContext,
        { name: 'vip_consult', displayName: 'VIP Consult', stageOrder: 4 },
        { isConfirmedPendingAction: true },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).displayName).toBe('VIP Consult');
    });

    it('blocks direct execution of T-30 (createCrmCampaign) without confirmation', async () => {
      const result = await toolRegistry.execute('createCrmCampaign', adminContext, {
        name: 'Summer Bootcamp Promo',
        campaignType: 'promotional',
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CONFIRMATION_REQUIRED');
    });

    it('blocks direct execution of T-31 (enrollInCampaign) without confirmation', async () => {
      const result = await toolRegistry.execute('enrollInCampaign', adminContext, {
        campaignId: CAMPAIGN_ID,
        leadIds: [LEAD_A_ID],
      });

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('CONFIRMATION_REQUIRED');
    });

    it('blocks direct execution of move-stage action via AgentRegistryService', async () => {
      const res = await agentRegistry.executeAgentAction(
        TENANT_A,
        'TEST',
        'crm-agent',
        'move-stage',
        { leadId: LEAD_A_ID, toStage: 'Trial scheduled' },
        { id: USER_ADMIN_ID, role: 'admin' },
      );
      expect(res.success).toBe(false);
      expect(res.error).toContain('requires two-phase confirmation');
    });
  });

  // =========================================================================
  // 6. Role Authorization & Denied Roles
  // =========================================================================
  describe('RBAC & Policy Alignment for CRM Agent', () => {
    it('allows admin and owner access to CRM tools', () => {
      expect(canUseTool('admin', 'scoreLead')).toBe(true);
      expect(canUseTool('admin', 'getPipelineOverview')).toBe(true);
      expect(canUseTool('admin', 'moveLeadInPipeline')).toBe(true);
      expect(canUseTool('admin', 'createPipelineStage')).toBe(true);
      expect(canUseTool('admin', 'createCrmCampaign')).toBe(true);
      expect(canUseTool('admin', 'enrollInCampaign')).toBe(true);
      expect(canUseTool('admin', 'getCampaignMetrics')).toBe(true);

      expect(can('admin', 'pipeline:read')).toBe(true);
      expect(can('admin', 'pipeline:write')).toBe(true);
      expect(can('admin', 'leads:read')).toBe(true);
      expect(can('admin', 'campaigns:read')).toBe(true);
    });

    it('denies CRM tools to unauthorized roles (member, visitor, trainer)', async () => {
      const deniedRoles = ['member', 'visitor', 'trainer'];

      for (const role of deniedRoles) {
        expect(canUseTool(role, 'scoreLead')).toBe(false);
        expect(canUseTool(role, 'getPipelineOverview')).toBe(false);
        expect(canUseTool(role, 'moveLeadInPipeline')).toBe(false);

        const execResult = await toolRegistry.execute('scoreLead', {
          tenantId: TENANT_A,
          tenantCode: 'TEST',
          userId: 'unauthorized-user',
          role,
          correlationId: 'corr-denied-test',
        }, { leadId: LEAD_A_ID });

        expect(execResult.success).toBe(false);
        expect(execResult.errorCode).toBe('PERMISSION_DENIED');
      }
    });

    it('denies campaign creation tool to front_desk (least-privilege boundary)', async () => {
      expect(canUseTool('front_desk', 'createCrmCampaign')).toBe(false);

      const execResult = await toolRegistry.execute('createCrmCampaign', {
        tenantId: TENANT_A,
        tenantCode: 'TEST',
        userId: 'unauthorized-user',
        role: 'front_desk',
        correlationId: 'corr-denied-test',
      }, { name: 'Promo', campaignType: 'nurture' });

      expect(execResult.success).toBe(false);
      expect(execResult.errorCode).toBe('PERMISSION_DENIED');
    });

    it('denies agent action execution when caller lacks requiredRoles', async () => {
      await expect(
        agentRegistry.executeAgentAction(
          TENANT_A,
          'TEST',
          'crm-agent',
          'score-lead',
          { leadId: LEAD_A_ID },
          { id: 'user-front-desk', role: 'front_desk' }, // front_desk not authorized
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies createPipelineStage and moveLeadInPipeline to front_desk, trainer, member, visitor (SEC-CRM-01)', async () => {
      const deniedRoles = ['front_desk', 'trainer', 'member', 'visitor'];

      for (const role of deniedRoles) {
        expect(canUseTool(role, 'createPipelineStage')).toBe(false);
        expect(canUseTool(role, 'moveLeadInPipeline')).toBe(false);
        expect(can(role, 'pipeline:write')).toBe(false);

        const stageExec = await toolRegistry.execute('createPipelineStage', {
          tenantId: TENANT_A,
          tenantCode: 'TEST',
          userId: 'unauthorized-user',
          role,
          correlationId: 'corr-denied-pipeline',
        }, { name: 'New Stage', displayName: 'New Stage', stageOrder: 10 });
        expect(stageExec.success).toBe(false);
        expect(stageExec.errorCode).toBe('PERMISSION_DENIED');
      }

      // Admin and owner are authorized
      expect(canUseTool('admin', 'createPipelineStage')).toBe(true);
      expect(canUseTool('admin', 'moveLeadInPipeline')).toBe(true);
      expect(can('admin', 'pipeline:write')).toBe(true);
      expect(can('owner', 'pipeline:write')).toBe(true);
    });
  });

  // =========================================================================
  // 7. End-to-End CRM Tool Execution via ToolRegistry
  // =========================================================================
  describe('End-to-End Tool Dispatch via ToolRegistry', () => {
    const adminCtx = {
      tenantId: TENANT_A,
      tenantCode: 'TEST',
      userId: USER_ADMIN_ID,
      role: 'admin',
      correlationId: 'corr-e2e',
    };

    it('executes T-26 scoreLead via ToolRegistry', async () => {
      const res = await toolRegistry.execute('scoreLead', adminCtx, { leadId: LEAD_A_ID });
      expect(res.success).toBe(true);
      expect((res.data as any).leadName).toBe('Priya Sharma');
    });

    it('executes T-27 getPipelineOverview via ToolRegistry', async () => {
      const res = await toolRegistry.execute('getPipelineOverview', adminCtx, {});
      expect(res.success).toBe(true);
      expect(Array.isArray((res.data as any).stages)).toBe(true);
    });

    it('executes T-32 getCampaignMetrics via ToolRegistry', async () => {
      const res = await toolRegistry.execute('getCampaignMetrics', adminCtx, { campaignId: CAMPAIGN_ID });
      expect(res.success).toBe(true);
      expect((res.data as any).campaign.id).toBe(CAMPAIGN_ID);
    });
  });

  // =========================================================================
  // 8. AgentRegistryService Direct Action Boundaries (ARCH-CRM-06)
  // =========================================================================
  describe('AgentRegistryService Direct Action Boundaries (ARCH-CRM-06)', () => {
    it('executes supported read agent actions (score-lead, pipeline-overview, active-campaigns)', async () => {
      const scoreResult = await agentRegistry.executeAgentAction(
        TENANT_A,
        'TEST',
        'crm-agent',
        'score-lead',
        { leadId: LEAD_A_ID },
        { id: USER_ADMIN_ID, role: 'admin' },
      );
      expect(scoreResult.success).toBe(true);
      expect(scoreResult.data).toBeDefined();

      const pipelineResult = await agentRegistry.executeAgentAction(
        TENANT_A,
        'TEST',
        'crm-agent',
        'pipeline-overview',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );
      expect(pipelineResult.success).toBe(true);
      expect(pipelineResult.data).toBeDefined();

      const campaignsResult = await agentRegistry.executeAgentAction(
        TENANT_A,
        'TEST',
        'crm-agent',
        'active-campaigns',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );
      expect(campaignsResult.success).toBe(true);
      expect(campaignsResult.data).toBeDefined();
    });

    it('rejects move-stage action via executeAgentAction requiring two-phase confirmation', async () => {
      const result = await agentRegistry.executeAgentAction(
        TENANT_A,
        'TEST',
        'crm-agent',
        'move-stage',
        { leadId: LEAD_A_ID, fromStageId: STAGE_1_ID, toStageId: STAGE_2_ID },
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('move-stage requires two-phase confirmation');
    });

    it('rejects unsupported direct actions with explicit error and performs no mutations', async () => {
      const unsupportedActions = ['create-campaign', 'create-pipeline-stage', 'delete-stage'];

      for (const actionId of unsupportedActions) {
        await expect(
          agentRegistry.executeAgentAction(
            TENANT_A,
            'TEST',
            'crm-agent',
            actionId,
            {},
            { id: USER_ADMIN_ID, role: 'admin' },
          ),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });
});
