'use client';

import React from 'react';
import {
  SparklesIcon,
  UsersIcon,
  ShieldCheckIcon,
  CalendarIcon,
} from '@/components/ui/icons';

interface MemberExplorePillarsProps {
  studioName?: string;
}

export function MemberExplorePillars({ studioName = 'Fitness AI' }: MemberExplorePillarsProps) {
  const pillars = [
    {
      icon: SparklesIcon,
      title: 'Mindful Movement',
      description: 'Pilates, yoga, and somatic flow guided by certified practitioners for mindful alignment and strength.',
    },
    {
      icon: UsersIcon,
      title: 'Personalized Guidance',
      description: 'Tailored coaching adapting to your goals, personal form, and individual practice pace.',
    },
    {
      icon: ShieldCheckIcon,
      title: 'Intelligent Recovery',
      description: 'Restorative sound baths, myofascial release, and breathwork sessions to replenish body and mind.',
    },
    {
      icon: CalendarIcon,
      title: 'Vibrant Community',
      description: 'An inclusive, welcoming space where every milestone, practice, and personal breakthrough is celebrated.',
    },
  ];

  return (
    <section id="about" className="border-t border-slate-200/80 bg-[#FAF8F5] py-18 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-10 border-b border-slate-200/70">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-rose-800">
              <SparklesIcon className="h-3.5 w-3.5 text-rose-700" />
              <span>{studioName} &bull; Practice Standard</span>
            </span>
            <h2 className="mt-3 font-serif text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-950">
              Designed around your well-being.
            </h2>
          </div>
          <p className="max-w-md text-sm sm:text-base leading-relaxed text-slate-600">
            A cohesive environment where dedicated teachers, quality equipment, and welcoming community spaces come together.
          </p>
        </div>

        {/* 4 Pillars Grid (Balanced proportions & premium typography) */}
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <div
                key={idx}
                className="group relative rounded-[2rem] border border-slate-200/80 bg-white p-8 transition-all duration-300 hover:-translate-y-1 hover:border-rose-300/80 hover:shadow-xl shadow-sm flex flex-col justify-between min-h-[280px]"
              >
                <div>
                  <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-rose-50 text-rose-800 border border-rose-100 transition-colors duration-200 group-hover:bg-rose-800 group-hover:text-white shadow-2xs">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-6 font-serif text-xl font-bold tracking-tight text-slate-950">
                    {pillar.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    {pillar.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
