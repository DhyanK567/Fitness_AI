/**
 * Wellness Studio OS — Design Tokens
 * Visual direction inspired by Danza / Modern Wellness Studios:
 * Deep Forest/Teal + Warm Terracotta/Coral + Amber Gold accents + Warm Neutral surfaces.
 */

export const colors = {
  // Brand Primary (Deep Teal / Forest Wellness)
  primary: {
    50: '#F0FDFA',
    100: '#CCFBF1',
    200: '#99F6E4',
    300: '#5EEAD4',
    400: '#2DD4BF',
    500: '#14B8A6',
    600: '#0D9488', // Core Brand Teal
    700: '#0F766E', // Primary Button / Active
    800: '#115E59', // Deep Forest Focus
    900: '#134E4A', // High contrast header
    950: '#042F2C',
  },

  // Brand Secondary (Warm Terracotta / Coral Energy - Danza inspiration)
  secondary: {
    50: '#FFF7ED',
    100: '#FFEDD5',
    200: '#FED7AA',
    300: '#FDBA74',
    400: '#FB923C',
    500: '#F97316',
    600: '#EA580C', // Energetic Action
    700: '#C2410C', // Terracotta Dark
    800: '#9A3412',
    900: '#7C2D12',
    950: '#431407',
  },

  // Brand Accent (Warm Amber / Studio Gold)
  accent: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706', // Luxury VIP / Highlight
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
    950: '#451A03',
  },

  // Neutrals / Surfaces / Warm Off-White (Light Mode & Editorial)
  neutral: {
    50: '#FAFAF9',  // Warm off-white page background
    100: '#F5F5F4', // Subtle surface card
    200: '#E7E5E4', // Subtle border
    300: '#D6D3D1', // Secondary border
    400: '#A8A29E', // Muted icon / placeholder
    500: '#78716C', // Restrained secondary text
    600: '#57534E', // Medium text
    700: '#44403C', // Body text
    800: '#292524', // Headings
    900: '#1C1917', // High contrast typography
    950: '#0C0A09', // Darkest charcoal
  },

  // Dark Luxury Studio Neutrals (Dark Mode / High-energy night sessions)
  dark: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    700: '#334155',
    800: '#1E293B', // Dark card surface
    900: '#0F172A', // Dark page background
    950: '#070B13', // Deep obsidian background
  },

  // Semantic Status Colors
  status: {
    success: {
      light: '#ECFDF5',
      border: '#A7F3D0',
      text: '#065F46',
      DEFAULT: '#10B981', // Emerald
    },
    warning: {
      light: '#FFFBEB',
      border: '#FDE68A',
      text: '#92400E',
      DEFAULT: '#F59E0B', // Amber
    },
    danger: {
      light: '#FEF2F2',
      border: '#FECACA',
      text: '#991B1B',
      DEFAULT: '#EF4444', // Rose Red
    },
    info: {
      light: '#F0F9FF',
      border: '#BAE6FD',
      text: '#075985',
      DEFAULT: '#0284C7', // Sky Blue
    },
  },
} as const;

export const typography = {
  fontFamilies: {
    sans: [
      'Plus Jakarta Sans',
      'Inter',
      'system-ui',
      '-apple-system',
      'Segoe UI',
      'Roboto',
      'sans-serif',
    ].join(', '),
    display: [
      'Outfit',
      'Plus Jakarta Sans',
      'system-ui',
      'sans-serif',
    ].join(', '),
    serif: [
      'Playfair Display',
      'Georgia',
      'serif',
    ].join(', '),
    mono: [
      'JetBrains Mono',
      'Menlo',
      'Monaco',
      'Consolas',
      'monospace',
    ].join(', '),
  },
  fontSizes: {
    xs: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
    sm: ['0.8125rem', { lineHeight: '1.25rem', letterSpacing: '0.01em' }],
    base: ['0.9375rem', { lineHeight: '1.5rem', letterSpacing: '0' }],
    md: ['1.0625rem', { lineHeight: '1.625rem', letterSpacing: '-0.01em' }],
    lg: ['1.1875rem', { lineHeight: '1.75rem', letterSpacing: '-0.015em' }],
    xl: ['1.375rem', { lineHeight: '1.875rem', letterSpacing: '-0.02em' }],
    '2xl': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.025em' }],
    '3xl': ['2.25rem', { lineHeight: '2.625rem', letterSpacing: '-0.03em' }],
    '4xl': ['2.875rem', { lineHeight: '3.25rem', letterSpacing: '-0.035em' }],
    '5xl': ['3.5rem', { lineHeight: '3.875rem', letterSpacing: '-0.04em' }],
  },
  fontWeights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
} as const;

export const spacing = {
  xs: '0.25rem', // 4px
  sm: '0.5rem',  // 8px
  md: '0.75rem', // 12px
  base: '1rem',  // 16px
  lg: '1.25rem', // 20px
  xl: '1.5rem',  // 24px
  '2xl': '2rem', // 32px
  '3xl': '2.5rem', // 40px
  '4xl': '3rem', // 48px
  '5xl': '4rem', // 64px
} as const;

export const radii = {
  none: '0',
  xs: '0.25rem',  // 4px
  sm: '0.375rem', // 6px
  md: '0.5rem',   // 8px
  lg: '0.75rem',  // 12px
  xl: '1rem',     // 16px
  '2xl': '1.25rem', // 20px
  '3xl': '1.75rem', // 28px
  full: '9999px',
} as const;

export const shadows = {
  subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.04), 0 1px 3px 0 rgba(0, 0, 0, 0.06)',
  card: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
  elevated: '0 10px 15px -3px rgba(0, 0, 0, 0.07), 0 4px 6px -4px rgba(0, 0, 0, 0.04)',
  modal: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
  glowTeal: '0 0 20px -3px rgba(13, 148, 136, 0.25)',
  glowCoral: '0 0 20px -3px rgba(234, 88, 12, 0.25)',
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

export const focusRings = {
  primary: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2',
  secondary: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2',
  danger: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2',
} as const;
