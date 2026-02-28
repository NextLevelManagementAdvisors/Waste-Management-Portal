/**
 * Tests for activatePendingSelections:
 * - Atomic claiming of pending selections
 * - Stripe subscription creation
 * - Data-loss prevention when user lacks stripe_customer_id
 * - Partial failure handling
 * - Audit logging
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { activatePendingSelections } from '../activateSelections';
import { storage } from '../storage';
import { getUncachableStripeClient } from '../stripeClient';
import type { DbPendingSelection } from '../storage';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('../storage', () => ({
  storage: {
    getUserById: vi.fn(),
    claimPendingSelections: vi.fn(),
    savePendingSelections: vi.fn(),
    createAuditLog: vi.fn(),
  },
}));

vi.mock('../stripeClient', () => ({
  getUncachableStripeClient: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const userWithStripe = {
  id: 'user-1',
  stripe_customer_id: 'cus_test123',
  email: 'test@example.com',
};

const userWithoutStripe = {
  id: 'user-1',
  stripe_customer_id: null,
  email: 'test@example.com',
};

const dbSelections: DbPendingSelection[] = [
  { id: 'sel-1', property_id: 'prop-1', user_id: 'user-1', service_id: 'svc-trash', quantity: 1, use_sticker: false, created_at: new Date() },
  { id: 'sel-2', property_id: 'prop-1', user_id: 'user-1', service_id: 'svc-recycling', quantity: 2, use_sticker: true, created_at: new Date() },
];

const mockStripe = {
  products: {
    list: vi.fn().mockResolvedValue({
      data: [
        { id: 'svc-trash', name: 'Trash', default_price: { id: 'price_trash' } },
        { id: 'svc-recycling', name: 'Recycling', default_price: { id: 'price_recycling' } },
      ],
    }),
  },
  subscriptions: {
    create: vi.fn().mockResolvedValue({ id: 'sub_new', status: 'active' }),
  },
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUncachableStripeClient).mockResolvedValue(mockStripe as any);
  vi.mocked(storage.getUserById).mockResolvedValue(userWithStripe as any);
  vi.mocked(storage.claimPendingSelections).mockResolvedValue(dbSelections);
  vi.mocked(storage.createAuditLog).mockResolvedValue(undefined as any);
  vi.mocked(storage.savePendingSelections).mockResolvedValue(undefined);
});

// ===========================================================================
// Tests
// ===========================================================================
describe('activatePendingSelections', () => {
  it('claims selections, creates Stripe subscriptions, and logs audit trail', async () => {
    const result = await activatePendingSelections('prop-1', 'user-1', { source: 'auto_approval' });

    expect(result).toEqual({ activated: 2, failed: 0 });

    // Should claim atomically
    expect(storage.claimPendingSelections).toHaveBeenCalledWith('prop-1');

    // Should create 2 subscriptions
    expect(mockStripe.subscriptions.create).toHaveBeenCalledTimes(2);
    expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_test123',
      items: [{ price: 'price_trash', quantity: 1 }],
      metadata: { propertyId: 'prop-1', equipmentType: 'rental' },
    }));
    expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_test123',
      items: [{ price: 'price_recycling', quantity: 2 }],
      metadata: { propertyId: 'prop-1', equipmentType: 'own_can' },
    }));

    // Should log audit
    expect(storage.createAuditLog).toHaveBeenCalledWith(
      'user-1', 'subscriptions_activated', 'property', 'prop-1',
      expect.objectContaining({ source: 'auto_approval', automated: true, activated: 2, failed: 0 }),
    );
  });

  it('does NOT claim selections when user has no stripe_customer_id', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(userWithoutStripe as any);

    const result = await activatePendingSelections('prop-1', 'user-1');

    expect(result).toEqual({ activated: 0, failed: 0 });
    expect(storage.claimPendingSelections).not.toHaveBeenCalled();
    expect(mockStripe.subscriptions.create).not.toHaveBeenCalled();
  });

  it('restores preloaded selections when user has no stripe_customer_id', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(userWithoutStripe as any);

    const result = await activatePendingSelections('prop-1', 'user-1', {
      source: 'admin_approval',
      preloadedSelections: dbSelections,
    });

    expect(result).toEqual({ activated: 0, failed: 2 });
    expect(storage.claimPendingSelections).not.toHaveBeenCalled();

    // Should restore the preloaded selections back to DB
    expect(storage.savePendingSelections).toHaveBeenCalledWith('prop-1', 'user-1', [
      { serviceId: 'svc-trash', quantity: 1, useSticker: false },
      { serviceId: 'svc-recycling', quantity: 2, useSticker: true },
    ]);
  });

  it('returns early with zero counts when no selections exist', async () => {
    vi.mocked(storage.claimPendingSelections).mockResolvedValue([]);

    const result = await activatePendingSelections('prop-1', 'user-1');

    expect(result).toEqual({ activated: 0, failed: 0 });
    expect(mockStripe.subscriptions.create).not.toHaveBeenCalled();
    expect(storage.createAuditLog).not.toHaveBeenCalled();
  });

  it('handles partial failures when one product has no default price', async () => {
    mockStripe.products.list.mockResolvedValueOnce({
      data: [
        { id: 'svc-trash', name: 'Trash', default_price: { id: 'price_trash' } },
        { id: 'svc-recycling', name: 'Recycling', default_price: null }, // no price
      ],
    });

    const result = await activatePendingSelections('prop-1', 'user-1', { source: 'admin_approval' });

    expect(result).toEqual({ activated: 1, failed: 1 });
    expect(mockStripe.subscriptions.create).toHaveBeenCalledTimes(1);

    // Audit should reflect partial success
    expect(storage.createAuditLog).toHaveBeenCalledWith(
      'user-1', 'subscriptions_activated', 'property', 'prop-1',
      expect.objectContaining({ activated: 1, failed: 1, totalSelections: 2 }),
    );
  });

  it('uses preloadedSelections when provided and skips claiming', async () => {
    const result = await activatePendingSelections('prop-1', 'user-1', {
      source: 'bulk_approval',
      preloadedSelections: dbSelections,
    });

    expect(result).toEqual({ activated: 2, failed: 0 });
    expect(storage.claimPendingSelections).not.toHaveBeenCalled();
    expect(mockStripe.subscriptions.create).toHaveBeenCalledTimes(2);
  });

  it('catches Stripe subscription errors and reports correct failed count', async () => {
    mockStripe.subscriptions.create.mockRejectedValue(new Error('Stripe error'));

    const result = await activatePendingSelections('prop-1', 'user-1');

    expect(result).toEqual({ activated: 0, failed: 2 });

    // Audit trail should still fire
    expect(storage.createAuditLog).toHaveBeenCalledWith(
      'user-1', 'subscriptions_activated', 'property', 'prop-1',
      expect.objectContaining({ activated: 0, failed: 2 }),
    );
  });
});
