import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface ReferralHistoryItem {
  id: string;
  date: string;
  refereeName: string;
  planName: string;
  status: string;
  rewardAmount: number;
  redeemed: boolean;
}

export interface MemberReferralSummary {
  referralCode: string;
  discountPercent: number;
  referrerRewardPercent: number;
  successfulReferrals: number;
  pendingReferrals: number;
  availableRewards: number;
  redeemedRewards: number;
  history: ReferralHistoryItem[];
}

export function generateMemberReferralCode(memberName: string, memberId: string): string {
  const firstName = (memberName || 'MEMBER')
    .trim()
    .split(/\s+/)[0]
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase() || 'MEMBER';

  const cleanId = (memberId || '8192').replace(/[^0-9a-fA-F]/g, '');
  let hash = 0;
  for (let i = 0; i < cleanId.length; i++) {
    hash = ((hash << 5) - hash + cleanId.charCodeAt(i)) | 0;
  }
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let suffix = '';
  let h = Math.abs(hash);
  for (let i = 0; i < 4; i++) {
    suffix += chars[h % chars.length];
    h = Math.floor(h / chars.length) + (i + 1) * 7;
  }
  return `${firstName}-${suffix}`;
}

@Injectable()
export class ReferralsService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveCampaign(tx: any, tenantId: string) {
    if (!tx.referralCampaign) {
      return {
        id: '00000000-0000-0000-0000-000000000001',
        tenantId,
        name: 'Studio Member Referral Program',
        referrerIncentiveValue: 5,
        refereeIncentiveValue: 5,
        status: 'active',
      };
    }

    let campaign = await tx.referralCampaign.findFirst({
      where: { tenantId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    if (!campaign) {
      const adminUser = tx.user
        ? await tx.user.findFirst({
            where: { tenantId, userType: { in: ['admin', 'owner', 'staff'] } },
          })
        : null;

      const systemAdminId = adminUser?.id || '00000000-0000-0000-0000-000000000000';
      try {
        campaign = await tx.referralCampaign.create({
          data: {
            tenantId,
            name: 'Studio Member Referral Program',
            description: 'Give 5% off to friends, earn 5% credit on future renewals.',
            referrerIncentiveType: 'discount',
            referrerIncentiveValue: 5,
            referrerIncentiveDescription: '5% reward credit toward future membership',
            refereeIncentiveType: 'discount',
            refereeIncentiveValue: 5,
            refereeIncentiveDescription: '5% instant discount on membership pass',
            validFrom: new Date(Date.now() - 86400000),
            status: 'active',
            createdBy: systemAdminId,
          },
        });
      } catch {
        // Fallback in case of constraint collision
        campaign = await tx.referralCampaign.findFirst({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
        });
      }
    }

    return campaign;
  }

  async findReferrerByCode(tenantId: string, code: string) {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) return null;

    return this.prisma.withTenant(tenantId, async (tx) => {
      if (!tx.studioMember) return null;

      // Extract candidate prefix from code (e.g. PRIYA from PRIYA-8X4K)
      const parts = cleanCode.split('-');
      const prefix = parts[0] || '';

      const members = await tx.studioMember.findMany({
        where: { tenantId },
      });

      for (const m of members) {
        const expected = generateMemberReferralCode(m.fullName, m.id);
        if (expected === cleanCode) {
          return m;
        }
      }

      // Check if code was stored explicitly in referral metadata
      if (tx.referral) {
        const priorReferral = await tx.referral.findFirst({
          where: { tenantId },
        });
        if (priorReferral && (priorReferral.metadata as any)?.referralCode === cleanCode) {
          return tx.studioMember.findFirst({
            where: { tenantId, id: priorReferral.referrerMemberId },
          });
        }
      }

      // Fallback matching if first name matches exactly
      if (prefix) {
        const matchByName = members.find((m: any) =>
          (m.fullName || '').trim().toUpperCase().startsWith(prefix),
        );
        if (matchByName) return matchByName;
      }

      return null;
    });
  }

  async getMyReferral(tenantId: string, memberRef: string): Promise<MemberReferralSummary> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      let member = tx.studioMember
        ? await tx.studioMember.findFirst({
            where: { tenantId, id: memberRef },
          })
        : null;

      if (!member && tx.userErpLink) {
        const link = await tx.userErpLink.findFirst({
          where: { tenantId, userId: memberRef },
        });
        if (link?.erpUserRef) {
          member = await tx.studioMember.findFirst({
            where: { tenantId, id: link.erpUserRef },
          });
        }
      }

      if (!member && tx.studioMember) {
        member = await tx.studioMember.findFirst({ where: { tenantId } });
      }

      const memberName = member?.fullName || 'Studio Member';
      const memberId = member?.id || memberRef;
      const referralCode = generateMemberReferralCode(memberName, memberId);
      const campaign = await this.getActiveCampaign(tx, tenantId);

      const discountPercent = campaign?.refereeIncentiveValue ?? 5;
      const referrerRewardPercent = campaign?.referrerIncentiveValue ?? 5;

      if (!tx.referral) {
        return {
          referralCode,
          discountPercent,
          referrerRewardPercent,
          successfulReferrals: 0,
          pendingReferrals: 0,
          availableRewards: 0,
          redeemedRewards: 0,
          history: [],
        };
      }

      const referrals = await tx.referral.findMany({
        where: { tenantId, referrerMemberId: memberId },
        orderBy: { createdAt: 'desc' },
      });

      const converted = referrals.filter((r: any) => r.status === 'converted');
      const pending = referrals.filter((r: any) => r.status === 'pending');

      let availableRewards = 0;
      let redeemedRewards = 0;

      const history: ReferralHistoryItem[] = [];

      for (const r of referrals) {
        const meta = (r.metadata as Record<string, any>) || {};
        const reward = Number(meta.rewardAmount || 5);
        const isRedeemed = r.referrerRewardPaid === true;

        if (r.status === 'converted') {
          if (isRedeemed) {
            redeemedRewards += reward;
          } else {
            availableRewards += reward;
          }
        }

        const refereeMember = r.refereeMemberId && tx.studioMember
          ? await tx.studioMember.findFirst({ where: { id: r.refereeMemberId, tenantId }, select: { fullName: true } })
          : null;

        const dateStr = (r.convertedAt || r.referredAt || r.createdAt) as Date;
        const formattedDate = dateStr
          ? new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : 'Recent';

        history.push({
          id: r.id,
          date: formattedDate,
          refereeName: refereeMember?.fullName || meta.refereeName || 'New Member',
          planName: meta.planName || 'Membership Pass',
          status: r.status === 'converted' ? 'Completed' : 'Pending Payment',
          rewardAmount: reward,
          redeemed: isRedeemed,
        });
      }

      return {
        referralCode,
        discountPercent,
        referrerRewardPercent,
        successfulReferrals: converted.length,
        pendingReferrals: pending.length,
        availableRewards,
        redeemedRewards,
        history,
      };
    });
  }

  async validateCode(
    tenantId: string,
    code: string,
    currentMemberRef?: string,
    planId?: string,
  ) {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) {
      throw new BadRequestException('Please provide a valid referral code');
    }

    const referrer = await this.findReferrerByCode(tenantId, cleanCode);
    if (!referrer) {
      throw new BadRequestException(`Referral code "${cleanCode}" is invalid or does not exist for this studio`);
    }

    // Prevent self-referral
    if (currentMemberRef && (referrer.id === currentMemberRef || referrer.email === currentMemberRef)) {
      throw new BadRequestException('You cannot use your own referral code');
    }

    return this.prisma.withTenant(tenantId, async (tx) => {
      const campaign = await this.getActiveCampaign(tx, tenantId);
      const discountPercent = campaign?.refereeIncentiveValue ?? 5;

      let discountAmount = 0;
      let finalAmount = 0;
      let planName = 'Membership Pass';

      if (planId && tx.studioMembership) {
        const plan = await tx.studioMembership.findFirst({
          where: { tenantId, id: planId },
        });
        if (plan) {
          planName = plan.name;
          discountAmount = Math.round(plan.priceINR * (discountPercent / 100));
          finalAmount = Math.max(1, plan.priceINR - discountAmount);
        }
      }

      const referrerFirst = (referrer.fullName || 'Member').trim().split(/\s+/)[0];

      return {
        valid: true,
        referralCode: cleanCode,
        referrerName: referrerFirst,
        discountPercent,
        discountAmount,
        finalAmount,
        planName,
        message: `${discountPercent}% referral discount applied from ${referrerFirst}!`,
      };
    });
  }

  async getAvailableRewardAmount(tenantId: string, memberId: string): Promise<number> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (!tx.referral) return 0;
      const unredeemed = await tx.referral.findMany({
        where: {
          tenantId,
          referrerMemberId: memberId,
          status: 'converted',
          referrerRewardPaid: false,
        },
      });

      return unredeemed.reduce((sum: number, r: any) => {
        const meta = (r.metadata as Record<string, any>) || {};
        return sum + Number(meta.rewardAmount || 5);
      }, 0);
    });
  }

  async recordConvertedReferral(
    tenantId: string,
    data: {
      referralCode: string;
      referrerMemberId: string;
      refereeMemberId?: string;
      planId: string;
      planName: string;
      orderId: string;
      paymentId: string;
      orderAmount: number;
      discountAmount: number;
    },
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (!tx.referral) return null;

      // Idempotency: avoid duplicate rewards for the same payment
      const existing = await tx.referral.findFirst({
        where: {
          tenantId,
          metadata: { path: ['paymentId'], equals: data.paymentId },
        },
      });
      if (existing) return existing;

      const campaign = await this.getActiveCampaign(tx, tenantId);
      const rewardPercent = campaign?.referrerIncentiveValue ?? 5;
      const baseTotal = data.orderAmount + data.discountAmount;
      const rewardAmount = Math.round(baseTotal * (rewardPercent / 100)) || 5;

      return tx.referral.create({
        data: {
          tenantId,
          campaignId: campaign.id,
          referrerMemberId: data.referrerMemberId,
          refereeMemberId: data.refereeMemberId,
          status: 'converted',
          referredAt: new Date(),
          convertedAt: new Date(),
          referrerRewardPaid: false, // Available to be redeemed!
          refereeRewardPaid: true,
          metadata: {
            referralCode: data.referralCode,
            planId: data.planId,
            planName: data.planName,
            orderId: data.orderId,
            paymentId: data.paymentId,
            orderAmount: data.orderAmount,
            discountAmount: data.discountAmount,
            rewardAmount,
          },
        },
      });
    });
  }

  async markRewardsRedeemed(
    tenantId: string,
    memberId: string,
    redeemedAmount: number,
    paymentId: string,
  ) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      if (!tx.referral) return;

      const unredeemed = await tx.referral.findMany({
        where: {
          tenantId,
          referrerMemberId: memberId,
          status: 'converted',
          referrerRewardPaid: false,
        },
        orderBy: { createdAt: 'asc' },
      });

      let remainingToMark = redeemedAmount;
      for (const r of unredeemed) {
        if (remainingToMark <= 0) break;
        const meta = (r.metadata as Record<string, any>) || {};
        const val = Number(meta.rewardAmount || 5);

        await tx.referral.update({
          where: { id: r.id },
          data: {
            referrerRewardPaid: true,
            updatedAt: new Date(),
            metadata: {
              ...meta,
              redeemedPaymentId: paymentId,
              redeemedAt: new Date().toISOString(),
            },
          },
        });
        remainingToMark -= val;
      }
    });
  }
}
