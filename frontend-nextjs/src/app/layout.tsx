import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { TenantBrandingProvider } from '@/features/settings';

export const metadata: Metadata = {
  title: 'Fitness AI | Studio Platform',
  description: 'Studio management and member portal for dance, yoga, Zumba, meditation, fitness and other wellness businesses.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="min-h-screen bg-[#FAF8F5] text-slate-900 antialiased font-sans selection:bg-[#0F766E] selection:text-white"
        suppressHydrationWarning
      >
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        <AuthProvider>
          <TenantBrandingProvider>
            <ToastProvider>{children}</ToastProvider>
          </TenantBrandingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
