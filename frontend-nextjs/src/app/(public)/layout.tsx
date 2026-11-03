import React from 'react';
import { PublicEnquiryChatWidget } from '@/features/ai';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <PublicEnquiryChatWidget />
    </>
  );
}
