import { Injectable, Logger, Optional, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ToolContext, ToolResult } from '../tools/base-tool';

export interface SessionDebriefArgs {
  sessionId: string;
  includeMemberDetails?: boolean;
}

export interface TrainerNotesArgs {
  sessionId: string;
}

export interface MemberMilestonesArgs {
  sessionId?: string;
  periodDays: number;
  milestoneIntervals: number[];
}

export interface SessionDebriefResult {
  sessionId: string;
  className: string;
  sessionDate: string;
  startTime: string;
  trainerName: string;
  capacity: number;
  totalBooked: number;
  checkedIn: number;
  noShows: number;
  lateCancellations: number;
  occupancyRate: string;
  occupancyPercent: number;
  waitlistCount: number;
  waitlistPromoted: number;
  revenue: number;
  averageRating: number | null;
  followUpActions: string[];
  memberDetails?: Array<{
    memberId: string;
    memberName: string;
    email: string;
    phone: string;
    bookingStatus: string;
    checkedIn: boolean;
    checkInTime: string | null;
    membershipPlan: string;
  }>;
}

export interface TrainerNotesResult {
  sessionId: string;
  className: string;
  sessionDate: string;
  trainerName: string;
  notes: string | null;
  equipmentUsed: string[];
  modifications: string[];
  observations: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MilestoneResult {
  memberId: string;
  memberName: string;
  email: string;
  phone: string;
  totalSessions: number;
  milestone: number;
  milestoneLabel: string;
  achievedAt: string;
  recentAttendanceRate: number;
  membershipPlan: string;
}

export interface MemberMilestonesResult {
  milestones: MilestoneResult[];
  periodDays: number;
  totalMembersWithMilestones: number;
}

@Injectable()
export class SessionSummaryService {
  private readonly logger = new Logger(SessionSummaryService.name);

  constructor(
    @Optional() private readonly prismaService?: PrismaService,
  ) {}

  /**
   * Generate automated post-class debrief with attendance data
   * PostgreSQL-first implementation
   */
  async getSessionDebrief(
    context: ToolContext,
    args: SessionDebriefArgs,
  ): Promise<any> {
    if (!context?.tenantId) {
      return { success: false, error: 'Tenant context required' };
    }

    const sessionId = args.sessionId;
    if (!sessionId) {
      return { success: false, error: 'sessionId is required' };
    }

    try {
      return await this.getSessionDebriefFromPostgres(context, args);
    } catch (error) {
      this.logger.error(`Session debrief failed:`, error);
      return { success: false, error: 'Session debrief unavailable' };
    }
  }

  private async getSessionDebriefFromPostgres(
    context: ToolContext,
    args: SessionDebriefArgs,
  ): Promise<any> {
    const { sessionId, includeMemberDetails = false } = args;

    const result = await this.prismaService!.withTenant(context.tenantId, async (prisma) => {
      // Get the session/class details
      const session = await prisma.studioClass.findFirst({
        where: {
          id: sessionId,
          tenantId: context.tenantId,
        },
      });

      if (!session) {
        throw new NotFoundException(`Session ${sessionId} not found`);
      }

      // Get all bookings for this session
      const bookings = await prisma.studioBooking.findMany({
        where: {
          tenantId: context.tenantId,
          classId: sessionId,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (bookings.length === 0) {
        return {
          success: true,
          data: {
            sessionId: session.id,
            className: session.name,
            sessionDate: session.date.toISOString().split('T')[0],
            startTime: session.startTime,
            trainerName: session.trainer,
            capacity: session.capacity,
            totalBooked: 0,
            checkedIn: 0,
            noShows: 0,
            lateCancellations: 0,
            occupancyRate: '0%',
            occupancyPercent: 0,
            waitlistCount: 0,
            waitlistPromoted: 0,
            revenue: 0,
            averageRating: null,
            followUpActions: ['No bookings found for this session'],
            memberDetails: includeMemberDetails ? [] : undefined,
          },
        };
      }

      // Get attendance records for this session's bookings
      const bookingIds = bookings.map(b => b.id);
      const attendances = await prisma.studioAttendance.findMany({
        where: {
          tenantId: context.tenantId,
          bookingId: { in: bookingIds },
        },
      });

      const attendanceMap = new Map(attendances.map(a => [a.bookingId, a]));

      // Get member details for bookings
      const memberIds = [...new Set(bookings.map(b => b.memberId))];
      const members = await prisma.studioMember.findMany({
        where: {
          tenantId: context.tenantId,
          id: { in: memberIds },
        },
      });
      const memberMap = new Map(members.map(m => [m.id, m]));

      // Calculate metrics
      const checkedInBookings = bookings.filter(b => b.status === 'CheckedIn');
      const confirmedBookings = bookings.filter(b => b.status === 'Confirmed');
      const noShowBookings = bookings.filter(b => b.status === 'NoShow');
      const waitlistedBookings = bookings.filter(b => b.status === 'Waitlisted');

      const totalBooked = bookings.length;
      const checkedIn = checkedInBookings.length;
      const noShows = noShowBookings.length;
      const waitlistCount = waitlistedBookings.length;
      const occupancyPercent = session.capacity > 0 ? Math.round((checkedIn / session.capacity) * 100) : 0;

      // Generate follow-up actions
      const followUpActions = [];
      if (noShows > 0) {
        followUpActions.push(`Follow up with ${noShows} no-show member(s) via friendly SMS/email`);
      }
      if (waitlistCount > 0) {
        followUpActions.push(`Notify ${waitlistCount} waitlisted member(s) about future availability`);
      }
      if (occupancyPercent < 50 && session.capacity > 0) {
        followUpActions.push(`Low occupancy (${occupancyPercent}%) - review schedule or marketing for this class`);
      }

      const memberDetails = includeMemberDetails ? bookings.map(b => {
        const attendance = attendanceMap.get(b.id);
        const member = memberMap.get(b.memberId);
        return {
          memberId: b.memberId,
          memberName: member?.fullName || 'Unknown',
          email: member?.email || '',
          phone: member?.phone || '',
          bookingStatus: b.status,
          checkedIn: b.status === 'CheckedIn',
          checkInTime: attendance?.checkedInAt?.toISOString() || null,
          membershipPlan: member?.plan || 'Unknown',
        };
      }) : undefined;

      return {
        success: true,
        data: {
          sessionId: session.id,
          className: session.name,
          sessionDate: session.date.toISOString().split('T')[0],
          startTime: session.startTime,
          trainerName: session.trainer,
          capacity: session.capacity,
          totalBooked,
          checkedIn,
          noShows,
          lateCancellations: 0, // Would need cancellation timestamp tracking
          occupancyRate: `${occupancyPercent}%`,
          occupancyPercent,
          waitlistCount,
          waitlistPromoted: 0, // Would need promotion tracking
          revenue: 0, // Would need membership pricing
          averageRating: null, // Would need feedback
          followUpActions,
          memberDetails,
        },
      };
    });

    return result;
  }

  /**
   * Retrieve trainer notes for a session
   */
  async getTrainerNotes(
    context: ToolContext,
    args: TrainerNotesArgs,
  ): Promise<any> {
    if (!context?.tenantId) {
      return { success: false, error: 'Tenant context required' };
    }

    const sessionId = args.sessionId;
    if (!sessionId) {
      return { success: false, error: 'sessionId is required' };
    }

    try {
      return await this.getTrainerNotesFromPostgres(context, args);
    } catch (error) {
      this.logger.error(`Trainer notes failed:`, error);
      return { success: false, error: 'Trainer notes unavailable' };
    }
  }

  private async getTrainerNotesFromPostgres(
    context: ToolContext,
    args: TrainerNotesArgs,
  ): Promise<any> {
    const { sessionId } = args;

    const result = await this.prismaService!.withTenant(context.tenantId, async (prisma) => {
      const session = await prisma.studioClass.findFirst({
        where: {
          id: sessionId,
          tenantId: context.tenantId,
        },
      });

      if (!session) {
        throw new NotFoundException(`Session ${sessionId} not found`);
      }

      // Check for trainer progress notes linked to this session
      // Note: There's no direct sessionId link in the schema,
      // so we'll return session info with any available notes
      return {
        success: true,
        data: {
          sessionId: session.id,
          className: session.name,
          sessionDate: session.date.toISOString().split('T')[0],
          trainerName: session.trainer,
          notes: null, // Session model doesn't have notes field
          equipmentUsed: [], // Would need equipment tracking
          modifications: [], // Would need modification tracking
          observations: [], // Would need observation tracking
          createdAt: session.createdAt?.toISOString() || null,
          updatedAt: session.updatedAt?.toISOString() || null,
        },
      };
    });

    return result;
  }

  /**
   * Identify members hitting attendance milestones
   */
  async getMemberMilestones(
    context: ToolContext,
    args: MemberMilestonesArgs,
  ): Promise<any> {
    if (!context?.tenantId) {
      return { success: false, error: 'Tenant context required' };
    }

    const { sessionId, periodDays = 30, milestoneIntervals = [10, 25, 50, 75, 100, 200, 300] } = args;

    try {
      return await this.getMemberMilestonesFromPostgres(context, { sessionId, periodDays, milestoneIntervals });
    } catch (error) {
      this.logger.error(`Member milestones failed:`, error);
      return { success: false, error: 'Member milestones unavailable' };
    }
  }

  private async getMemberMilestonesFromPostgres(
    context: ToolContext,
    args: { sessionId?: string; periodDays: number; milestoneIntervals: number[] },
  ): Promise<any> {
    const { sessionId, periodDays, milestoneIntervals } = args;
    const now = new Date();
    const startDate = new Date(now.getTime() - periodDays * 86400000);

    const result = await this.prismaService!.withTenant(context.tenantId, async (prisma) => {
      // Get attendance records for the period
      let attendances: any[];
      
      if (sessionId) {
        // For specific session, get bookings for that session and their attendance
        const bookings = await prisma.studioBooking.findMany({
          where: {
            tenantId: context.tenantId,
            classId: sessionId,
            status: 'CheckedIn',
          },
          select: { id: true, memberId: true },
        });
        
        const bookingIds = bookings.map(b => b.id);
        attendances = await prisma.studioAttendance.findMany({
          where: {
            tenantId: context.tenantId,
            bookingId: { in: bookingIds },
            status: 'Present',
          },
        });
      } else {
        // For period, get all attendance records
        attendances = await prisma.studioAttendance.findMany({
          where: {
            tenantId: context.tenantId,
            checkedInAt: { gte: startDate },
            status: 'Present',
          },
          orderBy: { checkedInAt: 'desc' },
        });
      }

      if (attendances.length === 0) {
        return {
          success: true,
          data: {
            milestones: [],
            periodDays,
            totalMembersWithMilestones: 0,
          },
        };
      }

      // Get member IDs from attendances (via bookings)
      const bookingIds = [...new Set(attendances.map(a => a.bookingId))];
      const bookings = await prisma.studioBooking.findMany({
        where: {
          tenantId: context.tenantId,
          id: { in: bookingIds },
        },
        select: { id: true, memberId: true },
      });

      const bookingMemberMap = new Map(bookings.map(b => [b.id, b.memberId]));
      const memberIds = [...new Set(bookings.map(b => b.memberId))];
      
      const members = await prisma.studioMember.findMany({
        where: {
          tenantId: context.tenantId,
          id: { in: memberIds },
        },
      });
      const memberMap = new Map(members.map(m => [m.id, m]));

      // Group by member and count sessions
      const memberSessionCounts = new Map<string, {
        member: any;
        sessions: any[];
        totalCount: number;
      }>();

      for (const attendance of attendances) {
        const memberId = bookingMemberMap.get(attendance.bookingId);
        if (!memberId) continue;
        
        const member = memberMap.get(memberId);
        if (!member) continue;
        
        if (!memberSessionCounts.has(memberId)) {
          memberSessionCounts.set(memberId, {
            member,
            sessions: [],
            totalCount: 0,
          });
        }
        const entry = memberSessionCounts.get(memberId)!;
        entry.sessions.push(attendance);
        entry.totalCount++;
      }

      // Find milestones
      const milestones: MilestoneResult[] = [];
      const sortedIntervals = [...milestoneIntervals].sort((a, b) => a - b);

      for (const [memberId, data] of memberSessionCounts.entries()) {
        const totalCount = data.totalCount;
        
        // Find the highest milestone reached that's in our intervals
        const reachedMilestones = sortedIntervals.filter(m => m <= totalCount);
        if (reachedMilestones.length > 0) {
          const highestMilestone = reachedMilestones[reachedMilestones.length - 1];
          
          // Calculate attendance rate (sessions in period / total possible)
          const memberSince = new Date(data.member.joined);
          const daysSinceJoin = Math.max(1, Math.floor((now.getTime() - memberSince.getTime()) / 86400000));
          const weeksSinceJoin = daysSinceJoin / 7;
          const attendanceRate = weeksSinceJoin > 0 ? Math.min(100, Math.round((totalCount / weeksSinceJoin) * 100)) : 0;

          // Get the latest session date for achievedAt
          const latestSession = data.sessions.sort((a, b) => 
            new Date(b.checkedInAt || 0).getTime() - new Date(a.checkedInAt || 0).getTime()
          )[0];

          milestones.push({
            memberId: data.member.id,
            memberName: data.member.fullName,
            email: data.member.email,
            phone: data.member.phone,
            totalSessions: totalCount,
            milestone: highestMilestone,
            milestoneLabel: `${highestMilestone}th Studio Workout completed`,
            achievedAt: latestSession?.checkedInAt?.toISOString() || now.toISOString(),
            recentAttendanceRate: attendanceRate,
            membershipPlan: data.member.plan,
          });
        }
      }

      // Sort by milestone descending, then by achievedAt
      milestones.sort((a, b) => b.milestone - a.milestone || new Date(b.achievedAt).getTime() - new Date(a.achievedAt).getTime());

      return {
        success: true,
        data: {
          milestones,
          periodDays,
          totalMembersWithMilestones: milestones.length,
        },
      };
    });

    return result;
  }
}