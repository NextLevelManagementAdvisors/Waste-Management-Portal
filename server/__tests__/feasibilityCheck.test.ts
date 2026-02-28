/**
 * Tests for feasibility check:
 * - checkRouteFeasibility: OptimoRoute probe (create order, plan, poll, check, cleanup)
 * - runFeasibilityAndApprove: background approval handler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRouteFeasibility, runFeasibilityAndApprove } from '../feasibilityCheck';
import { storage } from '../storage';
import * as optimo from '../optimoRouteClient';
import { activatePendingSelections } from '../activateSelections';
import { sendServiceUpdate } from '../notificationService';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('../storage', () => ({
  storage: {
    createAuditLog: vi.fn(),
    approveIfPending: vi.fn(),
    updateProperty: vi.fn(),
  },
}));

vi.mock('../optimoRouteClient', () => ({
  createOrder: vi.fn(),
  startPlanning: vi.fn(),
  getPlanningStatus: vi.fn(),
  getSchedulingInfo: vi.fn(),
  deleteOrder: vi.fn(),
}));

vi.mock('../activateSelections', () => ({
  activatePendingSelections: vi.fn(),
}));

vi.mock('../notificationService', () => ({
  sendServiceUpdate: vi.fn(),
}));

vi.mock('../addressReviewMessages', () => ({
  approvalMessage: vi.fn((address: string, _pickupDay?: string, _hasRental?: boolean) => ({
    subject: 'Address Approved',
    body: `Great news! Your address at ${address} has been approved.`,
  })),
}));

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(storage.createAuditLog).mockResolvedValue(undefined as any);
  vi.mocked(storage.approveIfPending).mockResolvedValue(true);
  vi.mocked(storage.updateProperty).mockResolvedValue(undefined as any);
  vi.mocked(optimo.createOrder).mockResolvedValue(undefined as any);
  vi.mocked(optimo.deleteOrder).mockResolvedValue(undefined as any);
  vi.mocked(activatePendingSelections).mockResolvedValue({ activated: 1, failed: 0, rentalDeliveries: 0 });
  vi.mocked(sendServiceUpdate).mockResolvedValue(undefined as any);
});

// ===========================================================================
// checkRouteFeasibility
// ===========================================================================
describe('checkRouteFeasibility', () => {
  it('returns feasible when order gets scheduled', async () => {
    vi.mocked(optimo.startPlanning).mockResolvedValue({ planningId: 'plan-1' } as any);
    vi.mocked(optimo.getPlanningStatus).mockResolvedValue({ status: 'F' } as any);
    vi.mocked(optimo.getSchedulingInfo).mockResolvedValue({
      orderScheduled: true,
      scheduledAt: '2026-03-03',
      driverName: 'John',
    } as any);

    const result = await checkRouteFeasibility('123 Main St', 'prop-1');

    expect(result).toEqual(expect.objectContaining({ feasible: true, reason: 'scheduled' }));
    expect(optimo.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      address: '123 Main St',
      locationName: 'Feasibility Check',
    }));
    // Cleanup should always run
    expect(optimo.deleteOrder).toHaveBeenCalled();
  });

  it('returns not_schedulable when order is not scheduled', async () => {
    vi.mocked(optimo.startPlanning).mockResolvedValue({ planningId: 'plan-1' } as any);
    vi.mocked(optimo.getPlanningStatus).mockResolvedValue({ status: 'F' } as any);
    vi.mocked(optimo.getSchedulingInfo).mockResolvedValue({ orderScheduled: false } as any);

    const result = await checkRouteFeasibility('456 Remote Rd', 'prop-2');

    expect(result).toEqual({ feasible: false, reason: 'not_schedulable' });
    expect(optimo.deleteOrder).toHaveBeenCalled();
  });

  it('returns invalid_address when order has invalid location', async () => {
    vi.mocked(optimo.startPlanning).mockResolvedValue({
      ordersWithInvalidLocation: [expect.stringContaining('FEASIBILITY')],
    } as any);

    // Make the mock match any temp order number
    vi.mocked(optimo.startPlanning).mockImplementation(async () => ({
      ordersWithInvalidLocation: ['FEASIBILITY-PROP-2XX-1234567890'],
      planningId: null,
    }) as any);

    // Re-mock to use a simpler approach: just check ordersWithInvalidLocation includes the temp order
    vi.mocked(optimo.startPlanning).mockResolvedValue({
      ordersWithInvalidLocation: null,
      planningId: 'plan-1',
    } as any);
    vi.mocked(optimo.getPlanningStatus).mockResolvedValue({ status: 'F' } as any);
    vi.mocked(optimo.getSchedulingInfo).mockResolvedValue({ orderScheduled: false } as any);

    // For invalid address, startPlanning returns the order in ordersWithInvalidLocation
    vi.mocked(optimo.startPlanning).mockImplementation(async (params: any) => ({
      ordersWithInvalidLocation: params.useOrders,
      planningId: null,
    }));

    const result = await checkRouteFeasibility('Invalid Address', 'prop-3');

    expect(result).toEqual({ feasible: false, reason: 'invalid_address' });
    expect(optimo.deleteOrder).toHaveBeenCalled();
  });

  it('always cleans up the temp order even on error', async () => {
    vi.mocked(optimo.createOrder).mockRejectedValue(new Error('API error'));

    const result = await checkRouteFeasibility('123 Main St', 'prop-1');

    expect(result).toEqual({ feasible: false, reason: 'unknown' });
    expect(optimo.deleteOrder).toHaveBeenCalled();
  });
});

// ===========================================================================
// runFeasibilityAndApprove
// ===========================================================================
describe('runFeasibilityAndApprove', () => {
  // Helper to set up a feasible check result
  function mockFeasibleResult() {
    vi.mocked(optimo.startPlanning).mockResolvedValue({ planningId: 'plan-1' } as any);
    vi.mocked(optimo.getPlanningStatus).mockResolvedValue({ status: 'F' } as any);
    vi.mocked(optimo.getSchedulingInfo).mockResolvedValue({
      orderScheduled: true,
      scheduledAt: '2026-03-03',
      driverName: 'John',
    } as any);
  }

  function mockNotFeasibleResult() {
    vi.mocked(optimo.startPlanning).mockResolvedValue({ planningId: 'plan-1' } as any);
    vi.mocked(optimo.getPlanningStatus).mockResolvedValue({ status: 'F' } as any);
    vi.mocked(optimo.getSchedulingInfo).mockResolvedValue({ orderScheduled: false } as any);
  }

  it('approves, activates, and notifies when feasible and still pending', async () => {
    mockFeasibleResult();
    vi.mocked(storage.approveIfPending).mockResolvedValue(true);
    vi.mocked(activatePendingSelections).mockResolvedValue({ activated: 1, failed: 0, rentalDeliveries: 0 });

    await runFeasibilityAndApprove('prop-1', 'user-1', '123 Main St');

    expect(storage.approveIfPending).toHaveBeenCalledWith('prop-1');
    expect(activatePendingSelections).toHaveBeenCalledWith('prop-1', 'user-1', { source: 'auto_approval' });
    expect(sendServiceUpdate).toHaveBeenCalledWith('user-1', 'Address Approved', expect.stringContaining('123 Main St'));
  });

  it('skips activation and notification when admin already decided', async () => {
    mockFeasibleResult();
    vi.mocked(storage.approveIfPending).mockResolvedValue(false); // admin already approved/denied

    await runFeasibilityAndApprove('prop-1', 'user-1', '123 Main St');

    expect(storage.approveIfPending).toHaveBeenCalledWith('prop-1');
    expect(activatePendingSelections).not.toHaveBeenCalled();
    expect(sendServiceUpdate).not.toHaveBeenCalled();
  });

  it('does not approve or activate when feasibility check fails', async () => {
    mockNotFeasibleResult();

    await runFeasibilityAndApprove('prop-1', 'user-1', '123 Main St');

    expect(storage.approveIfPending).not.toHaveBeenCalled();
    expect(activatePendingSelections).not.toHaveBeenCalled();
    expect(sendServiceUpdate).not.toHaveBeenCalled();
  });

  it('withholds notification when all activations fail', async () => {
    mockFeasibleResult();
    vi.mocked(storage.approveIfPending).mockResolvedValue(true);
    vi.mocked(activatePendingSelections).mockResolvedValue({ activated: 0, failed: 2, rentalDeliveries: 0 });

    await runFeasibilityAndApprove('prop-1', 'user-1', '123 Main St');

    expect(activatePendingSelections).toHaveBeenCalled();
    expect(sendServiceUpdate).not.toHaveBeenCalled();
  });

  it('still notifies when there are no selections to activate', async () => {
    mockFeasibleResult();
    vi.mocked(storage.approveIfPending).mockResolvedValue(true);
    vi.mocked(activatePendingSelections).mockResolvedValue({ activated: 0, failed: 0, rentalDeliveries: 0 });

    await runFeasibilityAndApprove('prop-1', 'user-1', '123 Main St');

    // No selections to activate but approval still happened — customer should know
    expect(sendServiceUpdate).toHaveBeenCalledWith('user-1', 'Address Approved', expect.stringContaining('123 Main St'));
  });

  it('logs audit trail for feasibility check result', async () => {
    mockFeasibleResult();

    await runFeasibilityAndApprove('prop-1', 'user-1', '123 Main St');

    expect(storage.createAuditLog).toHaveBeenCalledWith(
      'user-1', 'auto_feasibility_check', 'property', 'prop-1',
      expect.objectContaining({ feasible: true, reason: 'scheduled', automated: true }),
    );
  });
});
