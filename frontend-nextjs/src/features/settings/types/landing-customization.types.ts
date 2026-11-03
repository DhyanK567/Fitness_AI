/**
 * Types and defaults for Landing Page Customization (Phase 2A & Multi-Tenant)
 */

export interface NavLinkItem {
  label: string;
  href: string;
}

export interface HeaderConfig {
  logoUrl: string;
  studioName: string;
  navLinks: NavLinkItem[];
}

export interface HeroSectionConfig {
  badge: string;
  heading: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  overlayBadge: string;
  overlayHeading: string;
  primaryButtonText: string;
  secondaryButtonText: string;
}

export interface MovementCategoryItem {
  id: string;
  title: string;
  categoryLabel: string;
  imageUrl: string;
}

export interface MovementCategoriesConfig {
  heading: string;
  description: string;
  items: MovementCategoryItem[];
}

export interface EditorialStoryItemConfig {
  id: string;
  label: string;
  heading: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
}

export interface FeatureCardItem {
  id: string;
  icon: 'studio' | 'members' | 'classes' | 'ai';
  title: string;
  description: string;
}

export interface FeaturesSectionConfig {
  heading: string;
  description: string;
  cards: FeatureCardItem[];
}

export interface FinalCtaConfig {
  label: string;
  heading: string;
  description: string;
  primaryButtonText: string;
  secondaryButtonText: string;
}

export interface FooterConfig {
  logoUrl: string;
  studioName: string;
  description: string;
  exploreHeading: string;
  exploreLinks: NavLinkItem[];
  accessHeading: string;
  accessLinks: NavLinkItem[];
  copyright: string;
}

export interface LandingPageConfig {
  isPublished?: boolean;
  header: HeaderConfig;
  hero: HeroSectionConfig;
  movementCategories: MovementCategoriesConfig;
  l3StudioManagement: EditorialStoryItemConfig;
  l4MembershipExperience: EditorialStoryItemConfig;
  l5ConnectedJourneys: EditorialStoryItemConfig;
  l6AiAssistance: EditorialStoryItemConfig;
  l7Features: FeaturesSectionConfig;
  l8FinalCta: FinalCtaConfig;
  footer: FooterConfig;
}

export const DEFAULT_LANDING_PAGE_CONFIG: LandingPageConfig = {
  isPublished: true,
  header: {
    logoUrl: '',
    studioName: 'Fitness AI',
    navLinks: [
      { label: 'Classes', href: '/classes' },
      { label: 'Platform', href: '/#studio-operations' },
      { label: 'Members', href: '/#member-experience' },
      { label: 'Features', href: '/#features' },
      { label: 'Events', href: '/events' },
    ],
  },
  hero: {
    badge: 'Fitness AI · Studio platform',
    heading: 'The operating system for wellness studios.',
    description: 'Bring studio operations and member experiences together across dance, yoga, Zumba, meditation, fitness and more.',
    imageUrl: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=80',
    imageAlt: 'Strength training in a fitness studio',
    overlayBadge: 'One configurable platform',
    overlayHeading: 'Built around studios, their teams and their members.',
    primaryButtonText: 'Member Sign In',
    secondaryButtonText: 'Studio Login',
  },
  movementCategories: {
    heading: 'Find your kind of movement.',
    description: 'A universal, configurable platform for dance, yoga, Zumba, meditation, fitness and other wellness programs.',
    items: [
      {
        id: 'dance',
        title: 'Dance',
        categoryLabel: 'Rhythm and expression',
        imageUrl: 'https://images.unsplash.com/photo-1518834107812-67b0b7c58434?auto=format&fit=crop&w=900&q=80',
      },
      {
        id: 'yoga',
        title: 'Yoga',
        categoryLabel: 'Movement and balance',
        imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=900&q=80',
      },
      {
        id: 'zumba',
        title: 'Zumba',
        categoryLabel: 'Music and movement',
        imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=900&q=80',
      },
      {
        id: 'fitness',
        title: 'Fitness',
        categoryLabel: 'Strength and conditioning',
        imageUrl: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=80',
      },
      {
        id: 'meditation',
        title: 'Meditation',
        categoryLabel: 'Mindful practice',
        imageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=80',
      },
      {
        id: 'wellness',
        title: 'Wellness',
        categoryLabel: 'Your studio, configured',
        imageUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=900&q=80',
      },
    ],
  },
  l3StudioManagement: {
    id: 'studio-operations',
    label: 'Studio operations',
    heading: 'One place for the work of running a studio.',
    description: 'Connect members, memberships, classes, bookings, attendance, events, payments and reporting in a configurable studio management portal.',
    imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=900&q=80',
    imageAlt: 'Group fitness class in a studio',
  },
  l4MembershipExperience: {
    id: 'member-experience',
    label: 'Member portal',
    heading: 'A clearer path through every membership.',
    description: 'Members can access their membership, classes and bookings, attendance, events, payments and profile through the member portal.',
    imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=900&q=80',
    imageAlt: 'Yoga practice in a bright studio',
  },
  l5ConnectedJourneys: {
    id: 'connected-workflows',
    label: 'Connected workflows',
    heading: 'Keep everyday studio journeys connected.',
    description: 'The platform brings together booking, check-in, payment and notification workflows, with business records managed through governed interfaces.',
    imageUrl: 'https://images.unsplash.com/photo-1518834107812-67b0b7c58434?auto=format&fit=crop&w=900&q=80',
    imageAlt: 'Dancers moving together in a studio',
  },
  l6AiAssistance: {
    id: 'assistive-ai',
    label: 'Assistive AI',
    heading: 'Useful assistance, with people in control.',
    description: 'The documented AI scope supports operational questions and narrow enquiry, booking-suggestion, recommendation and feedback assistance through governed capabilities.',
    imageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=80',
    imageAlt: 'Quiet wellness practice in a calm space',
  },
  l7Features: {
    heading: 'Everything your studio needs, in one place.',
    description: 'A unified platform built specifically for high-touch boutique wellness studios and gyms.',
    cards: [
      {
        id: 'studio-management',
        icon: 'studio',
        title: 'Studio Management',
        description: 'Comprehensive roster, attendance tracking, scheduling, and staff coordination.',
      },
      {
        id: 'members-memberships',
        icon: 'members',
        title: 'Members & Memberships',
        description: 'Member directory, flexible plan tiers, renewal reminders, and member self-service portal.',
      },
      {
        id: 'classes-scheduling',
        icon: 'classes',
        title: 'Classes & Scheduling',
        description: 'Multi-modality class timetable, waitlist automation, room allocation, and instant check-in.',
      },
      {
        id: 'ai-assistance',
        icon: 'ai',
        title: 'AI-Powered Assistance',
        description: 'Operational copilot for enquiry drafting, class recommendations, and studio analytics.',
      },
    ],
  },
  l8FinalCta: {
    label: 'Fitness AI',
    heading: 'A connected experience for studio teams and members.',
    description: 'Choose the existing portal that fits your day.',
    primaryButtonText: 'Member Sign In',
    secondaryButtonText: 'Studio Login',
  },
  footer: {
    logoUrl: '',
    studioName: 'Fitness AI',
    description: 'Studio management and member portal experiences for configurable dance, fitness and wellness businesses.',
    exploreHeading: 'Explore',
    exploreLinks: [
      { label: 'Programs', href: '/#programs' },
      { label: 'Classes', href: '/classes' },
      { label: 'Events', href: '/events' },
      { label: 'Features', href: '/#features' },
    ],
    accessHeading: 'Access',
    accessLinks: [
      { label: 'Member Sign In', href: '/member-explore' },
      { label: 'Studio Login', href: '/staff-login' },
    ],
    copyright: 'Fitness AI. All rights reserved.',
  },
};

/**
 * Tenant settings key used in the backend settings store:
 * Matches regex /^[a-z][a-z0-9_.-]{1,99}$/
 */
export const LANDING_PAGE_SETTINGS_KEY = 'landing_page_config';

/**
 * Validates payload size to conform to the 16KB limit in ConfigurationService
 */
export const SETTINGS_MAX_PAYLOAD_BYTES = 16384;

export function calculateConfigPayloadSize(config: unknown): number {
  try {
    const serialized = JSON.stringify(config);
    return new TextEncoder().encode(serialized).length;
  } catch {
    return 0;
  }
}

export function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return true; // empty allowed
  const trimmed = url.trim();
  if (trimmed === '') return true;
  if (trimmed.startsWith('/') || trimmed.startsWith('data:image/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
