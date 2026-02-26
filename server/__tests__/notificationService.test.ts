import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendPickupReminder, sendMessageNotificationEmail } from '../notificationService';
import { storage } from '../storage';
import { sendEmail } from '../gmailClient';
import { sendSms } from '../twilioClient';

// ---------------------------------------------------------------------------
// Module mocks (hoisted before imports by vitest)
// ---------------------------------------------------------------------------
vi.mock('../storage', () => ({
  storage: {
    getUserById: vi.fn(),
    getPropertiesForUser: vi.fn(),
    getDriverById: vi.fn(),
    getDriverProfileByUserId: vi.fn(),
  },
  pool: {},
}));

vi.mock('../gmailClient', () => ({ sendEmail: vi.fn() }));
vi.mock('../twilioClient', () => ({ sendSms: vi.fn() }));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const mockUser = {
  id: 'user-1',
  first_name: 'Jane',
  last_name: 'Doe',
  email: 'jane@example.com',
  phone: '+15551234567',
  password_hash: 'hashed',
  member_since: '2024-01-01',
  autopay_enabled: false,
  stripe_customer_id: null,
  is_admin: false,
  admin_role: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

const mockProperty = (overrides: Record<string, unknown> = {}) => ({
  id: 'prop-1',
  user_id: 'user-1',
  address: '123 Main St',
  service_type: 'personal',
  in_hoa: false,
  community_name: null,
  has_gate_code: false,
  gate_code: null,
  notes: null,
  transfer_status: null,
  pending_owner: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  notification_preferences: {
    pickupReminders: { email: true, sms: false },
  },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// sendPickupReminder
// ---------------------------------------------------------------------------
describe('sendPickupReminder', () => {
  it('returns early without sending if user is not found', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(null);

    await sendPickupReminder('unknown-id', '123 Main St', '2025-02-10');

    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('sends email when email notifications are enabled (default on)', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(mockUser as any);
    vi.mocked(storage.getPropertiesForUser).mockResolvedValue([
      mockProperty({ notification_preferences: { pickupReminders: { email: true, sms: false } } }) as any,
    ]);

    await sendPickupReminder('user-1', '123 Main St', '2025-02-10');

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe('jane@example.com');
    expect(vi.mocked(sendEmail).mock.calls[0][1]).toContain('2025-02-10');
  });

  it('skips email when email notifications are explicitly disabled', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(mockUser as any);
    vi.mocked(storage.getPropertiesForUser).mockResolvedValue([
      mockProperty({ notification_preferences: { pickupReminders: { email: false, sms: false } } }) as any,
    ]);

    await sendPickupReminder('user-1', '123 Main St', '2025-02-10');

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends SMS when SMS notifications are enabled', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(mockUser as any);
    vi.mocked(storage.getPropertiesForUser).mockResolvedValue([
      mockProperty({ notification_preferences: { pickupReminders: { email: false, sms: true } } }) as any,
    ]);
    vi.mocked(sendSms).mockResolvedValue(undefined);

    await sendPickupReminder('user-1', '123 Main St', '2025-02-10');

    expect(sendSms).toHaveBeenCalledOnce();
    expect(vi.mocked(sendSms).mock.calls[0][0]).toBe('+15551234567');
  });

  it('sends both email and SMS when both are enabled', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(mockUser as any);
    vi.mocked(storage.getPropertiesForUser).mockResolvedValue([
      mockProperty({ notification_preferences: { pickupReminders: { email: true, sms: true } } }) as any,
    ]);
    vi.mocked(sendSms).mockResolvedValue(undefined);

    await sendPickupReminder('user-1', '123 Main St', '2025-02-10');

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendSms).toHaveBeenCalledOnce();
  });

  it('sends email even when property has no preferences (defaults to on)', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(mockUser as any);
    // No matching property address found — prefs will be undefined
    vi.mocked(storage.getPropertiesForUser).mockResolvedValue([
      mockProperty({ address: 'Different St', notification_preferences: null }) as any,
    ]);

    await sendPickupReminder('user-1', '123 Main St', '2025-02-10');

    // emailEnabled defaults to true when prefs are absent
    expect(sendEmail).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// sendMessageNotificationEmail
// ---------------------------------------------------------------------------
describe('sendMessageNotificationEmail', () => {
  it('sends no email when the user has not opted in', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({
      ...mockUser,
      message_email_notifications: false,
    } as any);

    await sendMessageNotificationEmail('user-1', 'user', 'Admin', 'Hello!');

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends email when the user has opted in', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({
      ...mockUser,
      message_email_notifications: true,
    } as any);

    await sendMessageNotificationEmail('user-1', 'user', 'Support Team', 'Hello, Jane!');

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe('jane@example.com');
  });

  it('includes the conversation subject in the email subject line', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({
      ...mockUser,
      message_email_notifications: true,
    } as any);

    await sendMessageNotificationEmail('user-1', 'user', 'Admin', 'Hello!', 'Billing Question');

    const emailSubject = vi.mocked(sendEmail).mock.calls[0][1] as string;
    expect(emailSubject).toContain('Billing Question');
  });

  it('omits subject suffix when no conversation subject is given', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({
      ...mockUser,
      message_email_notifications: true,
    } as any);

    await sendMessageNotificationEmail('user-1', 'user', 'Admin', 'Hello!');

    const emailSubject = vi.mocked(sendEmail).mock.calls[0][1] as string;
    expect(emailSubject).toBe('New message');
  });

  it('truncates a message body longer than 200 characters', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({
      ...mockUser,
      message_email_notifications: true,
    } as any);

    const longBody = 'x'.repeat(300);
    await sendMessageNotificationEmail('user-1', 'user', 'Admin', longBody);

    const htmlBody = vi.mocked(sendEmail).mock.calls[0][2] as string;
    // Truncated to 197 chars + ellipsis character
    expect(htmlBody).toContain('x'.repeat(197) + '…');
    // Full 300-char string should NOT appear in the email
    expect(htmlBody).not.toContain('x'.repeat(300));
  });

  it('returns early without sending if user is not found', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue(null);

    await sendMessageNotificationEmail('bad-id', 'user', 'Admin', 'Hello!');

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('uses getDriverProfileByUserId when recipientType is "driver"', async () => {
    // After unified people migration, sendMessageNotificationEmail calls getUserById first,
    // then getDriverProfileByUserId for the notification preference check.
    vi.mocked(storage.getUserById).mockResolvedValue({
      ...mockUser,
      id: 'driver-1',
      email: 'bob@drivers.com',
      first_name: 'Bob',
    } as any);
    vi.mocked((storage as any).getDriverProfileByUserId).mockResolvedValue({
      id: 'dp-1',
      user_id: 'driver-1',
      message_email_notifications: true,
    });

    await sendMessageNotificationEmail('driver-1', 'driver', 'Customer', 'Hi Bob!');

    expect(vi.mocked((storage as any).getDriverProfileByUserId)).toHaveBeenCalledWith('driver-1');
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toBe('bob@drivers.com');
  });

  it('sends no email when driver has not opted in', async () => {
    vi.mocked(storage.getUserById).mockResolvedValue({
      ...mockUser,
      id: 'driver-1',
      email: 'bob@drivers.com',
      first_name: 'Bob',
    } as any);
    vi.mocked((storage as any).getDriverProfileByUserId).mockResolvedValue({
      id: 'dp-1',
      user_id: 'driver-1',
      message_email_notifications: false,
    });

    await sendMessageNotificationEmail('driver-1', 'driver', 'Customer', 'Hi Bob!');

    expect(sendEmail).not.toHaveBeenCalled();
  });
});
