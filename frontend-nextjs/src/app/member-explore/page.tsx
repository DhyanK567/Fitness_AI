'use client';

import React, { Suspense } from 'react';
import { useTenantBranding } from '@/features/settings';
import { MemberExploreHeader } from '@/components/member-explore/MemberExploreHeader';
import { MemberExploreHero } from '@/components/member-explore/MemberExploreHero';
import { MemberExploreMemberships } from '@/components/member-explore/MemberExploreMemberships';
import { MemberExploreEvents } from '@/components/member-explore/MemberExploreEvents';
import { MemberExplorePillars } from '@/components/member-explore/MemberExplorePillars';
import { MemberExploreFooter } from '@/components/member-explore/MemberExploreFooter';
import { FloatingAIChat } from '@/components/chat/FloatingAIChat';
import { useAIChat } from '@/features/ai/hooks/useAIChat';

function MemberExploreContent() {
  const branding = useTenantBranding();

  // AI Chat integration for public enquiry
  const { sendMessage, isLoading, error, sessionId } = useAIChat({
    variant: 'enquiry',
    onMessageReceived: (response) => {
      console.log('Public AI Response:', response);
    },
    onError: (err) => {
      console.error('Public AI Chat Error:', err);
    },
  });

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F5] font-sans text-slate-800 antialiased selection:bg-rose-800 selection:text-white">
      {/* 1. Clean Customer Header Navigation */}
      <MemberExploreHeader
        studioName={branding.studioName}
        logoUrl={branding.logoUrl || undefined}
      />

      <main className="flex-1">
        {/* 2. Premium Hero with Single Action Button */}
        <MemberExploreHero studioName={branding.studioName} />

        {/* 3. Active Membership Plans Carousel */}
        <MemberExploreMemberships studioName={branding.studioName} />

        {/* 4. Upcoming Studio Events Carousel */}
        <MemberExploreEvents studioName={branding.studioName} />

        {/* 5. Designed Around Your Well-being (Moved below memberships and events) */}
        <MemberExplorePillars studioName={branding.studioName} />
      </main>

      {/* 6. Clean Customer Footer (No repeated giant CTA button) */}
      <MemberExploreFooter
        studioName={branding.studioName}
        logoUrl={branding.logoUrl || undefined}
      />

      {/* 7. Floating Studio Enquiry AI Assistant */}
      <FloatingAIChat
        variant="enquiry"
        title="Enquiry AI"
        subtitle="Your studio assistant"
        welcomeMessage="Hi there! 👋 Welcome to our studio. How can we help you today?"
        studioName={branding.studioName || 'Fitness Studio'}
        onSendMessage={sendMessage}
        onMessageReceived={(response) => {
          console.log('Public AI Response:', response);
        }}
        isBackendConnected={!!sessionId}
      />
    </div>
  );
}

export default function MemberExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-800 border-t-transparent" />
        </div>
      }
    >
      <MemberExploreContent />
    </Suspense>
  );
}
