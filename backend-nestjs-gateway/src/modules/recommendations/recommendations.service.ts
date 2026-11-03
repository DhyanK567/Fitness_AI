import { Injectable, Logger, Optional } from '@nestjs/common';
import { ErpBaseService, ToolContext, ToolResult } from '../../common/erp-base.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { PrismaService } from '../../common/prisma.service';
import { RecommendationQueryDto, RecommendationResponseDto } from './dto';
import { ERP_METHODS } from '@wsos/erp-methods';

interface CategoryScoreRule {
  keywords: string[];
  primaryCategories: string[];
  secondaryCategories: string[];
  tertiaryCategories: string[];
}

const GOAL_RULES: CategoryScoreRule[] = [
  {
    keywords: ['strength', 'muscle', 'tone', 'hypertrophy', 'power', 'lifting'],
    primaryCategories: ['strength', 'hiit', 'conditioning', 'power', 'crossfit', 'bootcamp', 'weightlifting'],
    secondaryCategories: ['pilates', 'core', 'functional', 'bodyweight'],
    tertiaryCategories: ['yoga', 'mobility', 'recovery', 'stretching'],
  },
  {
    keywords: ['flexib', 'mobility', 'posture', 'stretch', 'balance', 'alignment'],
    primaryCategories: ['yoga', 'pilates', 'mobility', 'stretch', 'stretching', 'recovery', 'barre'],
    secondaryCategories: ['functional', 'core', 'bodyweight'],
    tertiaryCategories: ['strength', 'hiit', 'cardio', 'boxing'],
  },
  {
    keywords: ['cardio', 'endurance', 'stamina', 'weight loss', 'burn', 'fat loss', 'conditioning'],
    primaryCategories: ['cardio', 'hiit', 'spin', 'cycling', 'boxing', 'conditioning', 'dance'],
    secondaryCategories: ['strength', 'functional', 'bootcamp'],
    tertiaryCategories: ['yoga', 'pilates', 'recovery'],
  },
  {
    keywords: ['recovery', 'mindful', 'stress', 'meditation', 'somatic', 'breath', 'relax'],
    primaryCategories: ['recovery', 'meditation', 'sound bath', 'yin yoga', 'breathwork', 'restorative yoga'],
    secondaryCategories: ['yoga', 'pilates', 'stretch', 'mobility'],
    tertiaryCategories: ['strength', 'hiit', 'cardio', 'crossfit'],
  },
];

@Injectable()
export class RecommendationsService extends ErpBaseService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    @Optional() protected readonly erp: ErpnextService,
    @Optional() private readonly prisma?: PrismaService,
  ) {
    super(erp);
  }

  async getRecommendations(
    context: ToolContext,
    query: RecommendationQueryDto = {},
  ): Promise<ToolResult<RecommendationResponseDto[]>> {
    const importStore = (process.env.IMPORT_STORE || 'postgres').toLowerCase();
    const isErpStore = ['erp', 'erpnext'].includes(importStore);

    // 1. Frappe mode: strict source exclusivity when configured
    if (isErpStore) {
      if (!this.erp) {
        return { success: false, error: 'ERPNext integration service is unavailable' };
      }

      const erpPayload = {
        tenant: context.tenantId,
        member_id: query.memberId || context.userId,
        goal: query.goal?.trim() || undefined,
        level: query.level?.trim() || undefined,
        days: query.days || 7,
      };

      const result = await this.callErp<{ recommendations: RecommendationResponseDto[] }>(
        context,
        ERP_METHODS.RECOMMENDATION_GET,
        erpPayload,
      );

      // In ERP mode, return the ERP result directly. Do NOT silently fall back to PostgreSQL.
      if (!result.success) {
        return result as unknown as ToolResult<RecommendationResponseDto[]>;
      }

      const rawRecs = result.data?.recommendations;
      const normalized = Array.isArray(rawRecs)
        ? rawRecs.map((rec) => this.normalizeRecommendation(rec))
        : [];
      return this.success(normalized);
    }

    // 2. PostgreSQL mode: authoritative domain persistence with tenant RLS scoping
    if (this.prisma) {
      return this.getPostgresRecommendations(context, query);
    }

    return this.success([]);
  }

  /**
   * Deterministic PostgreSQL recommendation engine with tenant-scoped RLS context,
   * active member verification, neutral undeclared goal scoring, and variety weighting.
   */
  async getPostgresRecommendations(
    context: ToolContext,
    query: RecommendationQueryDto,
  ): Promise<ToolResult<RecommendationResponseDto[]>> {
    const tenantId = context.tenantId;
    const memberId = String(query.memberId || context.userId);
    const daysAhead = Number(query.days || 7);

    // Declared goal vs neutral: only apply goal keywords when member explicitly declared a goal
    const rawGoal = query.goal?.trim();
    const hasDeclaredGoal = Boolean(rawGoal);
    const goal = hasDeclaredGoal ? rawGoal!.toLowerCase() : null;

    const executeWithClient = async (tx: any): Promise<ToolResult<RecommendationResponseDto[]>> => {
      // 1. Verify target member exists in this tenant and is Active
      const member = await tx.studioMember.findFirst({
        where: {
          id: memberId,
          tenantId,
        },
        select: {
          id: true,
          status: true,
          fullName: true,
        },
      });

      if (!member) {
        return { success: false, error: 'Member not found for this tenant' };
      }

      if (member.status?.toLowerCase() !== 'active') {
        return { success: false, error: 'Member is not active' };
      }

      const now = new Date();
      // Start of current day in UTC
      const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      const maxDate = new Date(startOfToday.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      // 2. Fetch upcoming scheduled classes for this tenant
      const scheduledClasses = await tx.studioClass.findMany({
        where: {
          tenantId,
          status: 'Scheduled',
          date: {
            gte: startOfToday,
            lte: maxDate,
          },
        },
        orderBy: [
          { date: 'asc' },
          { startTime: 'asc' },
        ],
      });

      if (!scheduledClasses || scheduledClasses.length === 0) {
        return this.success([]);
      }

      // 3. Fetch existing bookings for candidate classes to calculate confirmed capacity
      const classIds = scheduledClasses.map((c: any) => c.id);
      const confirmedBookings = await tx.studioBooking.findMany({
        where: {
          tenantId,
          classId: { in: classIds },
          status: 'Confirmed',
        },
        select: {
          id: true,
          classId: true,
          memberId: true,
        },
      });

      // Map booked count per class and detect classes already booked by the member
      const bookingsByClassId = new Map<string, number>();
      const memberBookedClassIds = new Set<string>();

      for (const booking of confirmedBookings || []) {
        bookingsByClassId.set(booking.classId, (bookingsByClassId.get(booking.classId) || 0) + 1);
        if (booking.memberId === memberId) {
          memberBookedClassIds.add(booking.classId);
        }
      }

      // 4. Query member attendance history for past 30 days to compute variety weighting
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const memberPastBookings = await tx.studioBooking.findMany({
        where: {
          tenantId,
          memberId,
          status: 'Confirmed',
          bookedAt: { gte: thirtyDaysAgo },
        },
        select: {
          id: true,
          classId: true,
        },
      });

      const pastBookingIds = (memberPastBookings || []).map((b: any) => b.id);
      const pastAttendances = pastBookingIds.length > 0
        ? await tx.studioAttendance.findMany({
            where: {
              tenantId,
              bookingId: { in: pastBookingIds },
              status: 'Present',
            },
            select: {
              bookingId: true,
            },
          })
        : [];

      const attendedBookingIdSet = new Set((pastAttendances || []).map((a: any) => a.bookingId));
      const attendedClassIds = (memberPastBookings || [])
        .filter((b: any) => attendedBookingIdSet.has(b.id))
        .map((b: any) => b.classId);

      // Get categories of attended classes
      const attendedClasses = attendedClassIds.length > 0
        ? await tx.studioClass.findMany({
            where: {
              tenantId,
              id: { in: attendedClassIds },
            },
            select: {
              category: true,
            },
          })
        : [];

      const attendanceCategoryCounts: Record<string, number> = {};
      for (const ac of (attendedClasses || [])) {
        const catKey = (ac.category || 'general').toLowerCase();
        attendanceCategoryCounts[catKey] = (attendanceCategoryCounts[catKey] || 0) + 1;
      }

      // Most frequently attended category for variety context
      let dominantCategory = '';
      let dominantCount = 0;
      for (const [cat, cnt] of Object.entries(attendanceCategoryCounts)) {
        if (cnt > dominantCount) {
          dominantCount = cnt;
          dominantCategory = cat;
        }
      }

      // 5. Candidate filtering and multi-factor scoring
      interface ScoredCandidate {
        classItem: typeof scheduledClasses[0];
        availableSpots: number;
        goalScore: number;
        varietyScore: number;
        capacityScore: number;
        totalScore: number;
        reason: string;
      }

      const scoredCandidates: ScoredCandidate[] = [];

      for (const c of scheduledClasses) {
        // Exclude if already booked by this member
        if (memberBookedClassIds.has(c.id)) {
          continue;
        }

        const bookedCount = bookingsByClassId.get(c.id) || 0;
        const availableSpots = c.capacity - bookedCount;

        // Candidate eligibility: must have confirmed capacity available
        if (availableSpots <= 0) {
          continue;
        }

        const categoryLower = (c.category || 'general').toLowerCase();

        // A. Goal Alignment Score: neutral (35) if undeclared, or keyword-based if declared
        const goalScore = this.calculateGoalScore(goal, categoryLower);

        // B. Attendance Variety Score (up to 30 pts)
        // Sessions in categories less frequently attended receive higher variety weighting
        const pastVisits = attendanceCategoryCounts[categoryLower] || 0;
        let varietyScore = 30;
        if (pastVisits >= 3) {
          varietyScore = 5;
        } else if (pastVisits >= 1) {
          varietyScore = 15;
        }

        // C. Available Capacity Score (up to 20 pts)
        let capacityScore = 20;
        if (availableSpots === 1) {
          capacityScore = 10;
        } else if (availableSpots === 2) {
          capacityScore = 15;
        }

        // Total deterministic score (clamped between 50 and 99)
        const rawTotal = goalScore + varietyScore + capacityScore;
        const totalScore = Math.min(99, Math.max(50, rawTotal));

        // Explainable reason formulation
        const reason = this.buildExplainableReason(
          goal,
          c.category,
          pastVisits,
          dominantCategory,
          availableSpots,
        );

        scoredCandidates.push({
          classItem: c,
          availableSpots,
          goalScore,
          varietyScore,
          capacityScore,
          totalScore,
          reason,
        });
      }

      // 6. Deterministic sorting: match score desc, available spots desc, date asc, time asc
      scoredCandidates.sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        if (b.availableSpots !== a.availableSpots) return b.availableSpots - a.availableSpots;
        const dateA = new Date(a.classItem.date).getTime();
        const dateB = new Date(b.classItem.date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return a.classItem.startTime.localeCompare(b.classItem.startTime);
      });

      // 7. Return top 3 to 5 recommendations (never fabricate sessions)
      const selected = scoredCandidates.slice(0, 5);

      const formatted: RecommendationResponseDto[] = selected.map((item) => {
        const c = item.classItem;
        const dateStr = c.date instanceof Date
          ? c.date.toISOString().split('T')[0]
          : String(c.date).split('T')[0];

        const bookHref = `/member/book-class?classId=${encodeURIComponent(c.id)}&className=${encodeURIComponent(c.name)}&category=${encodeURIComponent(c.category)}`;

        return {
          session_id: c.id,
          sessionId: c.id,
          class_name: c.name,
          className: c.name,
          category: c.category,
          trainer: c.trainer,
          session_date: dateStr,
          date: dateStr,
          start_time: c.startTime,
          startTime: c.startTime,
          end_time: c.endTime || '',
          endTime: c.endTime || '',
          available_spots: item.availableSpots,
          availableSpots: item.availableSpots,
          match_score: item.totalScore,
          matchScore: item.totalScore,
          reason: item.reason,
          book_href: bookHref,
          bookHref: bookHref,
        };
      });

      return this.success(formatted);
    };

    // Execute with tenant-scoped transaction when withTenant is available (sets app.current_tenant for RLS)
    if (typeof this.prisma!.withTenant === 'function') {
      return this.prisma!.withTenant(tenantId, async (tx) => executeWithClient(tx));
    }

    return executeWithClient(this.prisma!);
  }

  private calculateGoalScore(goal: string | null, category: string): number {
    // Neutral baseline score when member has not declared a fitness goal
    if (!goal) {
      return 35;
    }

    for (const rule of GOAL_RULES) {
      const matchesGoal = rule.keywords.some((kw) => goal.includes(kw));
      if (matchesGoal) {
        if (rule.primaryCategories.some((cat) => category.includes(cat))) {
          return 50;
        }
        if (rule.secondaryCategories.some((cat) => category.includes(cat))) {
          return 35;
        }
        if (rule.tertiaryCategories.some((cat) => category.includes(cat))) {
          return 20;
        }
        return 28;
      }
    }
    // General fallback when declared goal doesn't match predefined category keywords
    return 35;
  }

  private buildExplainableReason(
    goal: string | null,
    category: string,
    pastVisits: number,
    dominantCategory: string,
    availableSpots: number,
  ): string {
    const spotsText = `${availableSpots} ${availableSpots === 1 ? 'spot' : 'spots'} open`;

    // 1. Neutral explanation when no member goal is declared
    if (!goal) {
      if (pastVisits === 0 && dominantCategory && dominantCategory.toLowerCase() !== category.toLowerCase()) {
        return `Adds cross-training variety based on your recent ${dominantCategory} attendance (${spotsText}).`;
      }
      if (pastVisits === 0) {
        return `Introduces fresh studio cross-training to diversify your practice (${spotsText}).`;
      }
      if (pastVisits <= 2) {
        return `Maintains balanced weekly practice consistency in ${category} (${spotsText}).`;
      }
      return `Reinforces your established ${category} practice rhythm (${spotsText}).`;
    }

    // 2. Goal-directed explanation when member declared a goal
    if (pastVisits === 0 && dominantCategory && dominantCategory.toLowerCase() !== category.toLowerCase()) {
      return `Aligns with your ${goal} target and adds variety from your recent ${dominantCategory} sessions (${spotsText}).`;
    }
    if (pastVisits === 0) {
      return `Directly targets your ${goal} focus with fresh cross-training stimulus (${spotsText}).`;
    }
    if (pastVisits <= 2) {
      return `Balances your ${goal} routine with consistent ${category} progression (${spotsText}).`;
    }
    return `Reinforces your established ${category} consistency toward your ${goal} goals (${spotsText}).`;
  }

  private normalizeRecommendation(rec: any): RecommendationResponseDto {
    const id = rec.session_id || rec.sessionId || rec.id || '';
    const name = rec.class_name || rec.className || rec.name || 'Studio Session';
    const cat = rec.category || rec.class_type || 'General';
    const trainer = rec.trainer || 'Studio Trainer';
    const dateStr = rec.session_date || rec.date || '';
    const start = rec.start_time || rec.startTime || '09:00';
    const end = rec.end_time || rec.endTime || '';
    const spots = Number(rec.available_spots ?? rec.availableSpots ?? 10);
    const score = Number(rec.match_score ?? rec.matchScore ?? 90);
    const reason = rec.reason || `Personalized recommendation for your practice (${spots} spots available).`;
    const bookHref = rec.book_href || rec.bookHref || `/member/book-class?classId=${encodeURIComponent(id)}&className=${encodeURIComponent(name)}&category=${encodeURIComponent(cat)}`;

    return {
      session_id: id,
      sessionId: id,
      class_name: name,
      className: name,
      category: cat,
      trainer,
      session_date: dateStr,
      date: dateStr,
      start_time: start,
      startTime: start,
      end_time: end,
      endTime: end,
      available_spots: spots,
      availableSpots: spots,
      match_score: score,
      matchScore: score,
      reason,
      book_href: bookHref,
      bookHref: bookHref,
    };
  }
}
