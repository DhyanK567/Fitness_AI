'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { ApiClient, RecommendationItem } from '@/lib/api-client';
import { SparklesIcon, CalendarIcon, ClockIcon, ArrowRightIcon } from '@/components/ui/icons';
import { AlertCircle, RefreshCw, Users, Dumbbell } from 'lucide-react';

const GOAL_OPTIONS = [
  { id: 'all', label: 'All Practices', query: '' },
  { id: 'strength', label: 'Strength & Muscle', query: 'strength & muscle' },
  { id: 'flexibility', label: 'Flexibility & Posture', query: 'flexibility & mobility' },
  { id: 'cardio', label: 'Cardio & Conditioning', query: 'cardio & endurance' },
  { id: 'recovery', label: 'Mindfulness & Recovery', query: 'recovery & mindfulness' },
];

const CATEGORY_IMAGE_MAP: Record<string, string> = {
  yoga: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=800&q=80',
  pilates: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=800&q=80',
  hiit: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80',
  strength: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80',
  cardio: 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?auto=format&fit=crop&w=800&q=80',
  recovery: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80',
  meditation: 'https://images.unsplash.com/photo-1512290900672-1f4961817730?auto=format&fit=crop&w=800&q=80',
  default: 'https://images.unsplash.com/photo-1518459031867-a89b944bffe4?auto=format&fit=crop&w=800&q=80',
};

function getCategoryPhoto(category: string): string {
  const cat = (category || '').toLowerCase();
  for (const [key, url] of Object.entries(CATEGORY_IMAGE_MAP)) {
    if (cat.includes(key)) return url;
  }
  return CATEGORY_IMAGE_MAP.default;
}

export default function MemberRecommendationsPage() {
  const { user } = useAuthContext();
  const [selectedGoal, setSelectedGoal] = useState<string>('all');
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendations = useCallback(async (goalId: string) => {
    setLoading(true);
    setError(null);
    try {
      const selectedObj = GOAL_OPTIONS.find((g) => g.id === goalId);
      const goalParam = selectedObj?.query ? selectedObj.query : undefined;

      const results = await ApiClient.getRecommendations({
        goal: goalParam,
        days: 14,
      });

      setRecommendations(results);
    } catch (err: any) {
      setError(err?.message || 'Could not retrieve your personalized recommendations. Please try again.');
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecommendations(selectedGoal);
  }, [selectedGoal, fetchRecommendations]);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-teal-950 text-white rounded-3xl p-6 sm:p-10 shadow-xl space-y-4">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-5 h-5 text-purple-300" />
          <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-purple-300">
            MINDFUL PRACTICE INSIGHTS (AI-04)
          </span>
        </div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold">Personalized Practice Recommendations</h1>
        <p className="text-xs sm:text-sm text-purple-200 max-w-xl">
          Deterministically ranked based on your declared fitness goals, 30-day attendance variety, and real-time studio capacity.
        </p>

        {/* Goal Selector Pills */}
        <div className="pt-2 flex flex-wrap gap-2">
          {GOAL_OPTIONS.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGoal(g.id)}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition cursor-pointer ${
                selectedGoal === g.id
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'bg-white/10 hover:bg-white/20 text-purple-200'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <p className="text-xs sm:text-sm font-medium">{error}</p>
          </div>
          <button
            onClick={() => fetchRecommendations(selectedGoal)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 text-xs font-bold transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4 animate-pulse">
              <div className="h-44 bg-slate-200 rounded-2xl w-full" />
              <div className="h-4 bg-slate-200 rounded w-1/4" />
              <div className="h-6 bg-slate-200 rounded w-3/4" />
              <div className="h-14 bg-slate-100 rounded-xl w-full" />
              <div className="h-10 bg-slate-200 rounded-full w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && recommendations.length === 0 && (
        <div className="text-center py-16 px-4 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-full bg-purple-50 text-purple-700 mx-auto flex items-center justify-center">
            <Dumbbell className="w-8 h-8" />
          </div>
          <h3 className="font-serif text-xl font-bold text-slate-800">No Eligible Sessions Found</h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
            There are currently no open sessions with available capacity matching this goal. New classes are scheduled daily.
          </p>
          <div className="pt-2">
            <Link
              href="/member/book-class"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold uppercase tracking-wider transition"
            >
              Browse Full Timetable
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Recommendations Grid */}
      {!loading && !error && recommendations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {recommendations.map((rec) => {
            const photoUrl = getCategoryPhoto(rec.category);
            const bookingUrl = `/member/book-class?classId=${encodeURIComponent(rec.sessionId)}&className=${encodeURIComponent(rec.className)}&category=${encodeURIComponent(rec.category)}`;

            return (
              <div
                key={rec.sessionId}
                className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition"
              >
                <div className="relative aspect-[16/9] bg-slate-100">
                  <Image src={photoUrl} alt={rec.className} fill className="object-cover" />
                  <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-purple-900/90 text-purple-200 text-xs font-bold backdrop-blur-xs shadow-xs">
                    {rec.matchScore}% Match
                  </div>
                  <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-teal-900/90 text-teal-200 text-xs font-bold backdrop-blur-xs flex items-center gap-1.5 shadow-xs">
                    <Users className="w-3.5 h-3.5" />
                    {rec.availableSpots} {rec.availableSpots === 1 ? 'spot' : 'spots'} left
                  </div>
                </div>

                <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-purple-700 block mb-1">
                      {rec.category}
                    </span>
                    <h3 className="font-serif text-xl font-bold text-slate-900">{rec.className}</h3>
                    <p className="text-xs text-slate-600 mt-2 bg-purple-50/80 p-3.5 rounded-xl border border-purple-100 leading-relaxed font-normal">
                      &ldquo;{rec.reason}&rdquo;
                    </p>

                    <div className="mt-4 space-y-1 text-xs text-slate-500">
                      <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                        {rec.date} &bull; {rec.startTime}
                      </p>
                      <p className="text-slate-600">Guide: {rec.trainer}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <Link
                      href={bookingUrl}
                      className="w-full py-2.5 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold uppercase tracking-wider text-center transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      Book Recommended Session
                      <ArrowRightIcon className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
