'use client';

import React, { useState } from 'react';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import {
  SparklesIcon,
  CheckCircleIcon,
  ZapIcon,
  CheckIcon,
  CopyIcon,
  GiftIcon,
  UsersIcon,
} from '@/components/ui/icons';

interface ReferralRecord {
  id: string;
  name: string;
  date: string;
  status: 'active' | 'pending';
  pointsEarned: number;
}

const REFERRALS_DATA: ReferralRecord[] = [
  { id: 'ref_1', name: 'Rohan Varma', date: '02 Oct 2026', status: 'active', pointsEarned: 150 },
  { id: 'ref_2', name: 'Kavita Iyer', date: '28 Sep 2026', status: 'active', pointsEarned: 150 },
  { id: 'ref_3', name: 'Siddharth Rao', date: '24 Sep 2026', status: 'pending', pointsEarned: 0 },
];

interface RewardItem {
  id: string;
  title: string;
  cost: number;
  description: string;
  badge: string;
  category: string;
}

const REWARDS_CATALOG: RewardItem[] = [
  {
    id: 'rew_1',
    title: '1 Free Organic Protein Smoothie',
    cost: 100,
    description: 'Redeemable at the Sanctuary Juice Bar (Spirulina, Berry, or Raw Almond Whey).',
    badge: 'Quick Perk',
    category: 'Nutrition',
  },
  {
    id: 'rew_2',
    title: 'Complimentary Guest Pass for a Friend',
    cost: 200,
    description: 'Invite a partner or friend to join any open mat or reformer session for free.',
    badge: 'Community',
    category: 'Passes',
  },
  {
    id: 'rew_3',
    title: 'Free 1-on-1 Coach PT Session',
    cost: 300,
    description: '50-minute personal movement assessment & injury rehabilitation with a senior coach.',
    badge: 'Popular',
    category: 'Coaching',
  },
  {
    id: 'rew_4',
    title: '10% Discount on Annual Pass Renewal',
    cost: 500,
    description: 'Instant discount voucher applied toward your next annual studio membership block.',
    badge: 'High Value',
    category: 'Membership',
  },
];

export const PortalRewards: React.FC = () => {
  const { user, activeMembership, redeemReward } = useAuthContext();
  const { addToast } = useToast();

  const [copiedCode, setCopiedCode] = useState(false);
  const referralCode = 'DEMO-0001-1404';

  const invitedCount = REFERRALS_DATA.length;
  const enrolledCount = REFERRALS_DATA.filter((r) => r.status === 'active').length;
  const pointsEarnedTotal = REFERRALS_DATA.reduce((sum, r) => sum + r.pointsEarned, 0);

  const currentPoints = activeMembership?.loyaltyPoints ?? 0;
  const currentTier = activeMembership?.loyaltyTier || 'Gold';

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopiedCode(true);
      addToast({
        type: 'success',
        title: 'Referral Code Copied',
        message: `Code "${referralCode}" copied to your clipboard. Share it with friends!`,
      });
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      addToast({
        type: 'info',
        title: 'Referral Code',
        message: referralCode,
      });
    }
  };

  const handleShareWhatsApp = () => {
    const studioName = user?.studioName || 'Prana Yoga & Shala';
    const message = `Hey! Join me for workouts at ${studioName}. Use my invite code *${referralCode}* to get ₹500 OFF your first class pack or membership: https://pranayoga.in/join?ref=${referralCode}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleRedeem = (item: RewardItem) => {
    if (currentPoints < item.cost) {
      addToast({
        type: 'error',
        title: 'Insufficient Points',
        message: `You need ${item.cost} points to redeem this perk. Workout more days to earn points!`,
      });
      return;
    }

    const success = redeemReward(item.cost);
    if (success) {
      addToast({
        type: 'success',
        title: 'Perk Redeemed!',
        message: `Redeemed "${item.title}". Digital voucher added to your desk profile.`,
      });
    }
  };

  return (
    <div className="space-y-8 font-sans text-slate-800">
      {/* Header */}
      <div className="border-b border-slate-200/80 pb-5">
        <span className="text-[11px] uppercase font-bold text-[#E11D48] tracking-[0.2em] block mb-1">
          STUDIO PATRON RECOGNITION
        </span>
        <h2 className="font-serif text-3xl font-bold text-slate-900 tracking-tight">
          Gamified Loyalty Rewards
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Earn points through consistent workout streaks and redeem them for studio perks.
        </p>
      </div>

      {/* ── Points Wallet & Tier Badge Banner ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Wallet Balance */}
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 space-y-2">
          <span className="text-[11px] uppercase font-bold text-slate-400 tracking-[0.15em]">
            Available Reward Points
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white tracking-tight">
              {currentPoints}
            </span>
            <span className="text-xs text-[#E11D48] font-bold tracking-wider">PTS</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            +25 points credited for every completed workout or turnstile check-in.
          </p>
        </div>

        {/* Tier Status */}
        <div className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 space-y-2">
          <span className="text-[11px] uppercase font-bold text-slate-400 tracking-[0.15em]">
            Current Patron Tier
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-3xl font-bold text-slate-900 tracking-tight">
              {currentTier} Patron
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Enjoy priority waitlist bumping and complimentary tea at the lounge.
          </p>
        </div>

        {/* Milestone to Next Tier */}
        <div className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 space-y-2">
          <span className="text-[11px] uppercase font-bold text-slate-400 tracking-[0.15em]">
            Next Milestone
          </span>
          <p className="font-serif text-xl font-bold text-[#E11D48] tracking-tight">
            Platinum Sanctuary Patron
          </p>
          <p className="text-xs text-slate-500">
            50 more points needed. Maintain workout streak for 2 consecutive days.
          </p>
        </div>
      </div>

      {/* ── Tier Badges Progress Bar ── */}
      <div className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-sm space-y-4">
        <h3 className="font-serif text-lg font-bold text-slate-900">
          Studio Patron Tier Progression
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-1">
            <span className="text-xs font-bold text-slate-600 block">Silver Patron</span>
            <p className="text-[10px] text-slate-400 font-mono">0 – 200 Pts</p>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
              <CheckCircleIcon className="w-3 h-3 text-emerald-500" />
              <span>Achieved</span>
            </span>
          </div>
          <div className="p-3.5 bg-rose-50/50 border-2 border-[#E11D48] rounded-xl space-y-1 shadow-sm shadow-rose-500/10">
            <span className="text-xs font-bold text-[#E11D48] block">Gold Patron</span>
            <p className="text-[10px] text-slate-500 font-mono">201 – 600 Pts</p>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#E11D48]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E11D48] animate-pulse" />
              <span>Current Tier</span>
            </span>
          </div>
          <div className="p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-1">
            <span className="text-xs font-bold text-slate-400 block">Platinum Patron</span>
            <p className="text-[10px] text-slate-400 font-mono">601+ Pts</p>
            <span className="text-[10px] font-bold text-slate-400">Locked</span>
          </div>
        </div>
      </div>

      {/* ── Referral Program & Share Container ── */}
      <div className="p-6 sm:p-7 bg-white border border-slate-200/80 rounded-2xl shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 border-b border-slate-100 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-rose-50 text-[#E11D48]">
                <GiftIcon className="w-4 h-4 text-[#E11D48]" />
              </span>
              <h3 className="font-serif text-xl font-bold text-slate-900 tracking-tight">
                Invite Friends, Earn Points
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-600">
              Friends get <span className="font-semibold text-slate-900">₹500 off</span> their first class pack; you get <span className="font-semibold text-[#E11D48]">150 points</span> when they enroll!
            </p>
          </div>

          {/* 3-Column Stats Counter */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4 bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 sm:px-5 sm:py-3.5 text-center min-w-[280px] sm:min-w-[320px]">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Invited
              </span>
              <span className="font-serif text-xl font-bold text-slate-900">{invitedCount}</span>
            </div>
            <div className="border-x border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Enrolled
              </span>
              <span className="font-serif text-xl font-bold text-emerald-600">{enrolledCount}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Points Earned
              </span>
              <span className="font-serif text-xl font-bold text-[#E11D48]">+{pointsEarnedTotal}</span>
            </div>
          </div>
        </div>

        {/* Interactive Referral Code Box */}
        <div className="bg-gradient-to-r from-rose-50/60 via-slate-50/60 to-rose-50/30 border border-rose-200/70 rounded-xl p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center md:text-left w-full md:w-auto">
            <span className="text-[10px] uppercase font-bold tracking-wider text-rose-500 block">
              Exclusive Referral Code
            </span>
            <div className="inline-block">
              <span className="font-mono text-xl sm:text-2xl font-bold text-slate-900 tracking-wider bg-white px-3.5 py-1 rounded-lg border border-slate-200 shadow-xs select-all">
                {referralCode}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              type="button"
              onClick={handleCopyCode}
              className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold tracking-wide transition-all shadow-xs active:scale-[0.98]"
            >
              {copiedCode ? (
                <>
                  <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <CopyIcon className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy Code</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold tracking-wide transition-all shadow-xs hover:shadow-md hover:shadow-emerald-600/20 active:scale-[0.98]"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
              </svg>
              <span>Share on WhatsApp</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Reward Redemption Catalog ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xl font-bold text-slate-900">
            Redeemable Perks Catalog
          </h3>
          <span className="text-xs text-slate-500">Instant digital voucher issue</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {REWARDS_CATALOG.map((item) => {
            const canAfford = currentPoints >= item.cost;
            return (
              <div
                key={item.id}
                className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-sm flex flex-col justify-between space-y-5 hover:border-rose-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="space-y-2 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 bg-rose-500/10 text-[#E11D48] border border-rose-500/20 rounded-full">
                      {item.badge}
                    </span>
                    <span className="font-serif text-lg font-bold text-slate-900">
                      {item.cost} Points
                    </span>
                  </div>

                  <h4 className="font-serif text-lg font-bold text-slate-900 tracking-tight">{item.title}</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
                </div>

                <button
                  type="button"
                  onClick={() => handleRedeem(item)}
                  disabled={!canAfford}
                  className={`w-full py-3 text-xs uppercase font-bold tracking-wider rounded-xl transition-all duration-200 ${
                    canAfford
                      ? 'bg-[#E11D48] hover:bg-[#BE123C] active:scale-[0.98] text-white shadow-sm hover:shadow-md hover:shadow-rose-500/20'
                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  }`}
                >
                  {canAfford ? `Redeem (${item.cost} Pts)` : `Need ${item.cost - currentPoints} More Points`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
