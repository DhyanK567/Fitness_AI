import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LANDING_PAGE_CONFIG,
  LANDING_PAGE_SETTINGS_KEY,
  SETTINGS_MAX_PAYLOAD_BYTES,
  calculateConfigPayloadSize,
  isValidImageUrl,
  LandingPageConfig,
} from './types/landing-customization.types';
import { saveLandingPageDraft } from './api/settings-api';

describe('Landing Page Customization (Phase 2A)', () => {
  it('validates settings key matches backend NestJS regex requirement', () => {
    const BACKEND_SETTING_KEY_REGEX = /^[a-z][a-z0-9_.-]{1,99}$/;
    assert.strictEqual(
      BACKEND_SETTING_KEY_REGEX.test(LANDING_PAGE_SETTINGS_KEY),
      true,
      'Settings key must match backend ConfigurationService key validation'
    );
  });

  it('provides complete default landing page configuration with all required sections', () => {
    const config = DEFAULT_LANDING_PAGE_CONFIG;

    // Header
    assert.ok(config.header);
    assert.strictEqual(config.header.studioName, 'Fitness AI');
    assert.ok(config.header.navLinks.length >= 4);

    // L1 Hero
    assert.ok(config.hero);
    assert.strictEqual(config.hero.primaryButtonText, 'Member Sign In');
    assert.strictEqual(config.hero.secondaryButtonText, 'Studio Login');
    assert.ok(config.hero.imageUrl.startsWith('https://'));

    // L2 Movement Categories
    assert.ok(config.movementCategories);
    assert.strictEqual(config.movementCategories.items.length, 6);
    const categoryTitles = config.movementCategories.items.map((i) => i.title);
    assert.deepStrictEqual(categoryTitles, ['Dance', 'Yoga', 'Zumba', 'Fitness', 'Meditation', 'Wellness']);

    // L3 - L6 Editorial Stories
    assert.ok(config.l3StudioManagement);
    assert.ok(config.l4MembershipExperience);
    assert.ok(config.l5ConnectedJourneys);
    assert.ok(config.l6AiAssistance);
    assert.strictEqual(config.l3StudioManagement.id, 'studio-operations');
    assert.strictEqual(config.l4MembershipExperience.id, 'member-experience');
    assert.strictEqual(config.l5ConnectedJourneys.id, 'connected-workflows');
    assert.strictEqual(config.l6AiAssistance.id, 'assistive-ai');

    // L7 Features (replaces Pricing)
    assert.ok(config.l7Features);
    assert.strictEqual(config.l7Features.heading, 'Everything your studio needs, in one place.');
    assert.strictEqual(config.l7Features.cards.length, 4);
    const cardIds = config.l7Features.cards.map((c) => c.id);
    assert.deepStrictEqual(cardIds, [
      'studio-management',
      'members-memberships',
      'classes-scheduling',
      'ai-assistance',
    ]);

    // L8 Final Call to Action
    assert.ok(config.l8FinalCta);
    assert.strictEqual(config.l8FinalCta.primaryButtonText, 'Member Sign In');
    assert.strictEqual(config.l8FinalCta.secondaryButtonText, 'Studio Login');

    // Footer
    assert.ok(config.footer);
    assert.strictEqual(config.footer.studioName, 'Fitness AI');
    assert.ok(config.footer.exploreLinks.length >= 3);
    assert.ok(config.footer.accessLinks.length >= 2);
  });

  it('guarantees default configuration is well below the 16KB backend settings limit', () => {
    const size = calculateConfigPayloadSize(DEFAULT_LANDING_PAGE_CONFIG);
    assert.ok(size > 500, 'Payload size should be non-trivial');
    assert.ok(
      size < 8192,
      `Default configuration size (${size} bytes) should be well below 8KB (limit is 16KB)`
    );
    assert.ok(size <= SETTINGS_MAX_PAYLOAD_BYTES);
  });

  it('detects payloads exceeding 16KB limit to protect backend', () => {
    const hugeConfig: LandingPageConfig = {
      ...DEFAULT_LANDING_PAGE_CONFIG,
      hero: {
        ...DEFAULT_LANDING_PAGE_CONFIG.hero,
        description: 'x'.repeat(20000), // 20KB description
      },
    };
    const size = calculateConfigPayloadSize(hugeConfig);
    assert.ok(size > SETTINGS_MAX_PAYLOAD_BYTES, 'Payload should exceed 16KB limit');
  });

  it('validates image URLs correctly', () => {
    // Valid URLs
    assert.strictEqual(isValidImageUrl('https://images.unsplash.com/photo-1518834107812'), true);
    assert.strictEqual(isValidImageUrl('http://example.com/image.png'), true);
    assert.strictEqual(isValidImageUrl('/images/logo.png'), true);
    assert.strictEqual(isValidImageUrl(''), true); // Empty allowed

    // Invalid URLs
    assert.strictEqual(isValidImageUrl('not-a-valid-url'), false);
    assert.strictEqual(isValidImageUrl('javascript:alert(1)'), false);
    assert.strictEqual(isValidImageUrl('ftp://invalid.com/image.jpg'), false);
  });

  it('rejects saving drafts when not authenticated without creating fake persistence', async () => {
    // In node test environment without browser localStorage, getStaffAuthStatus returns unauthenticated
    const result = await saveLandingPageDraft(DEFAULT_LANDING_PAGE_CONFIG);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'UNAUTHENTICATED');
    assert.ok(result.message.includes('disabled'));
  });

  it('loads public landing page configuration scoped by tenant host', async () => {
    const originalFetch = globalThis.fetch;
    let interceptedUrl = '';
    let interceptedHeaders: Record<string, string> = {};

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      interceptedUrl = url.toString();
      interceptedHeaders = (init?.headers as Record<string, string>) || {};
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            value: {
              ...DEFAULT_LANDING_PAGE_CONFIG,
              header: {
                ...DEFAULT_LANDING_PAGE_CONFIG.header,
                studioName: 'Zen Pulse Fitness',
              },
              isPublished: true,
            },
          },
        }),
      } as unknown as Response;
    }) as typeof fetch;

    try {
      const config = await (await import('./api/settings-api')).loadPublicLandingPageConfig('zenpulse.fitnessai.com');
      assert.ok(config);
      assert.strictEqual(config.header.studioName, 'Zen Pulse Fitness');
      assert.strictEqual(interceptedHeaders['x-tenant-host'], 'zenpulse.fitnessai.com');
      assert.ok(interceptedUrl.includes('/settings/landing_page_config'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles 404 for unconfigured tenants cleanly by returning null for default fallback', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Setting not found' }),
    })) as unknown as typeof fetch;

    try {
      const config = await (await import('./api/settings-api')).loadPublicLandingPageConfig('brand-new-studio.fitnessai.com');
      assert.strictEqual(config, null, 'Unconfigured tenant should return null so public page can render defaults');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('enforces multi-tenant isolation by passing distinct tenant headers per studio', async () => {
    const originalFetch = globalThis.fetch;
    const requestedTenants: string[] = [];

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = (init?.headers as Record<string, string>) || {};
      const tenant = headers['x-tenant-host'];
      requestedTenants.push(tenant);
      const studioName = tenant === 'zen-yoga.fitnessai.com' ? 'Zen Yoga Studio' : 'PowerFit Gym';
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            value: {
              ...DEFAULT_LANDING_PAGE_CONFIG,
              header: { ...DEFAULT_LANDING_PAGE_CONFIG.header, studioName },
              isPublished: true,
            },
          },
        }),
      } as unknown as Response;
    }) as typeof fetch;

    try {
      const { loadPublicLandingPageConfig } = await import('./api/settings-api');
      const studioA = await loadPublicLandingPageConfig('zen-yoga.fitnessai.com');
      const studioB = await loadPublicLandingPageConfig('powerfit-gym.fitnessai.com');

      assert.strictEqual(studioA?.header.studioName, 'Zen Yoga Studio');
      assert.strictEqual(studioB?.header.studioName, 'PowerFit Gym');
      assert.deepStrictEqual(requestedTenants, [
        'zen-yoga.fitnessai.com',
        'powerfit-gym.fitnessai.com',
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('saves landing page draft and distinguishes published vs draft status', async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = (globalThis as any).window;
    const originalLocalStorage = (globalThis as any).localStorage;

    let savedPayloads: any[] = [];

    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = {
      getItem: (key: string) => (key === 'ws_staff_token' ? 'test-staff-jwt' : null),
    };

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      savedPayloads.push(body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: body }),
      } as unknown as Response;
    }) as typeof fetch;

    try {
      const { saveLandingPageDraft } = await import('./api/settings-api');

      // Test 1: Save Draft (publish = false)
      const draftResult = await saveLandingPageDraft(DEFAULT_LANDING_PAGE_CONFIG, false);
      assert.strictEqual(draftResult.success, true);
      assert.strictEqual(savedPayloads[0].value.isPublished, false);
      assert.ok(draftResult.message.includes('Draft saved'));

      // Test 2: Publish Live (publish = true)
      const publishResult = await saveLandingPageDraft(DEFAULT_LANDING_PAGE_CONFIG, true);
      assert.strictEqual(publishResult.success, true);
      assert.strictEqual(savedPayloads[1].value.isPublished, true);
      assert.ok(publishResult.message.includes('successfully published live'));
    } finally {
      globalThis.fetch = originalFetch;
      (globalThis as any).window = originalWindow;
      (globalThis as any).localStorage = originalLocalStorage;
    }
  });
});
