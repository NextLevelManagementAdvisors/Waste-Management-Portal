import { sendEmail } from './gmailClient';
import { sendSms } from './twilioClient';
import { storage } from './storage';
import { pool } from './db';

const APP_NAME = 'Rural Waste Management';

/** Log an outbound communication to the communication_log table */
export async function logCommunication(entry: {
  recipientId?: string;
  recipientType?: string;
  recipientName?: string;
  recipientContact?: string;
  channel: string;
  direction?: string;
  subject?: string;
  body?: string;
  templateId?: string;
  status?: string;
  scheduledFor?: string;
  sentAt?: string;
  errorMessage?: string;
  sentBy?: string;
}): Promise<string> {
  const result = await pool.query(
    `INSERT INTO communication_log
       (recipient_id, recipient_type, recipient_name, recipient_contact, channel, direction,
        subject, body, template_id, status, scheduled_for, sent_at, error_message, sent_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [
      entry.recipientId || null,
      entry.recipientType || null,
      entry.recipientName || null,
      entry.recipientContact || null,
      entry.channel,
      entry.direction || 'outbound',
      entry.subject || null,
      entry.body || null,
      entry.templateId || null,
      entry.status || 'sent',
      entry.scheduledFor || null,
      entry.sentAt || (entry.status !== 'scheduled' ? new Date().toISOString() : null),
      entry.errorMessage || null,
      entry.sentBy || null,
    ]
  );
  return result.rows[0].id;
}

/** Render template body by replacing {{variable}} placeholders */
export function renderTemplate(body: string, variables: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] ?? match);
}

/** Send a custom notification and log it */
export async function sendAndLogNotification(opts: {
  userId: string;
  channel: 'email' | 'sms' | 'both';
  subject?: string;
  body: string;
  templateId?: string;
  sentBy?: string;
}): Promise<{ email?: boolean; sms?: boolean }> {
  const user = await storage.getUserById(opts.userId);
  if (!user) return {};
  const result: { email?: boolean; sms?: boolean } = {};
  const name = `${user.first_name} ${user.last_name}`.trim();

  if (opts.channel === 'email' || opts.channel === 'both') {
    const subject = opts.subject || `Message from ${APP_NAME}`;
    const html = baseTemplate(subject, `
      <p style="color:#4b5563;line-height:1.6;">Hi ${user.first_name},</p>
      <p style="color:#4b5563;line-height:1.6;white-space:pre-wrap;">${opts.body}</p>
    `);
    try {
      await sendEmail(user.email, subject, html);
      result.email = true;
      logCommunication({ recipientId: opts.userId, recipientType: 'user', recipientName: name, recipientContact: user.email, channel: 'email', subject, body: opts.body, templateId: opts.templateId, status: 'sent', sentBy: opts.sentBy }).catch(() => {});
    } catch (e: any) {
      result.email = false;
      logCommunication({ recipientId: opts.userId, recipientType: 'user', recipientName: name, recipientContact: user.email, channel: 'email', subject, body: opts.body, templateId: opts.templateId, status: 'failed', errorMessage: e?.message, sentBy: opts.sentBy }).catch(() => {});
    }
  }

  if (opts.channel === 'sms' || opts.channel === 'both') {
    if (user.phone) {
      const sent = await trySendSms(user.phone, `${APP_NAME}: ${opts.body}`);
      result.sms = sent;
      logCommunication({ recipientId: opts.userId, recipientType: 'user', recipientName: name, recipientContact: user.phone, channel: 'sms', body: opts.body, templateId: opts.templateId, status: sent ? 'sent' : 'failed', sentBy: opts.sentBy }).catch(() => {});
    } else {
      result.sms = false;
    }
  }

  return result;
}

/** Process scheduled messages that are due */
export async function processScheduledMessages(): Promise<void> {
  try {
    const due = await pool.query(
      `SELECT * FROM communication_log WHERE status = 'scheduled' AND scheduled_for <= NOW() ORDER BY scheduled_for LIMIT 20`
    );
    for (const row of due.rows) {
      try {
        if (row.channel === 'email' && row.recipient_contact) {
          const html = baseTemplate(row.subject || `Message from ${APP_NAME}`, `
            <p style="color:#4b5563;line-height:1.6;white-space:pre-wrap;">${row.body}</p>
          `);
          await sendEmail(row.recipient_contact, row.subject || `Message from ${APP_NAME}`, html);
        } else if (row.channel === 'sms' && row.recipient_contact) {
          await sendSms(row.recipient_contact, `${APP_NAME}: ${row.body}`);
        }
        await pool.query(`UPDATE communication_log SET status = 'sent', sent_at = NOW() WHERE id = $1`, [row.id]);
      } catch (e: any) {
        await pool.query(`UPDATE communication_log SET status = 'failed', error_message = $2 WHERE id = $1`, [row.id, e?.message || 'Unknown error']);
      }
    }
  } catch (e) {
    console.error('Error processing scheduled messages:', e);
  }
}

function baseTemplate(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:#0d9488;padding:24px 32px;border-radius:16px 16px 0 0;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:900;letter-spacing:-0.5px;">${APP_NAME}</h1>
    </div>
    <div style="background:#fff;padding:32px;border-radius:0 0 16px 16px;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
      <h2 style="color:#1f2937;font-size:18px;font-weight:800;margin:0 0 16px 0;">${title}</h2>
      ${body}
    </div>
    <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px;">
      You received this email from ${APP_NAME}. Manage your notification preferences in your account settings.
    </p>
  </div>
</body>
</html>`;
}

async function trySendSms(phone: string, message: string): Promise<boolean> {
  if (!phone || phone.trim().length < 7) return false;
  try {
    await sendSms(phone, message);
    return true;
  } catch (e) {
    console.error('SMS send failed:', e);
    return false;
  }
}

export async function sendCollectionReminder(userId: string, locationAddress: string, collectionDate: string, collectionType: string = 'Regular') {
  const user = await storage.getUserById(userId);
  if (!user) return;

  const locations = await storage.getLocationsForUser(userId);
  const location = locations.find((l: any) => l.address === locationAddress);
  const prefs = location?.notification_preferences;

  const emailEnabled = !(prefs?.collectionReminders?.email === false);
  const smsEnabled = prefs?.collectionReminders?.sms === true;

  if (emailEnabled) {
    const subject = `Collection Reminder - ${collectionDate}`;
    const body = `
      <p style="color:#4b5563;line-height:1.6;">Hi ${user.first_name},</p>
      <p style="color:#4b5563;line-height:1.6;">This is a reminder that your <strong>${collectionType}</strong> collection is scheduled for:</p>
      <div style="background:#f0fdfa;border-left:4px solid #0d9488;padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;">
        <p style="margin:0;color:#0d9488;font-weight:700;font-size:16px;">${collectionDate}</p>
        <p style="margin:4px 0 0;color:#6b7280;font-size:14px;">${locationAddress}</p>
      </div>
      <p style="color:#4b5563;line-height:1.6;">Please ensure your bins are placed curbside by 6:00 AM.</p>
    `;
    try {
      await sendEmail(user.email, subject, baseTemplate('Collection Reminder', body));
    } catch (e) {
      console.error('Failed to send collection reminder email:', e);
    }
  }

  if (smsEnabled && user.phone) {
    await trySendSms(user.phone, `${APP_NAME}: Reminder - Your ${collectionType} collection at ${locationAddress} is scheduled for ${collectionDate}. Please have bins curbside by 6 AM.`);
  }
}

export async function sendBillingAlert(userId: string, invoiceNumber: string, amount: number, dueDate: string) {
  const user = await storage.getUserById(userId);
  if (!user) return;

  const properties = await storage.getLocationsForUser(userId);
  const prefs = properties[0]?.notification_preferences;

  const emailEnabled = !(prefs?.invoiceDue === false);
  const smsEnabled = prefs?.invoiceDue?.sms === true;

  if (emailEnabled) {
    const subject = `Invoice #${invoiceNumber} - $${amount.toFixed(2)} Due`;
    const body = `
      <p style="color:#4b5563;line-height:1.6;">Hi ${user.first_name},</p>
      <p style="color:#4b5563;line-height:1.6;">You have a new invoice that requires your attention.</p>
      <div style="background:#fefce8;border-left:4px solid #eab308;padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;">
        <p style="margin:0;font-weight:700;color:#854d0e;">Invoice #${invoiceNumber}</p>
        <p style="margin:4px 0 0;color:#854d0e;font-size:24px;font-weight:900;">$${amount.toFixed(2)}</p>
        <p style="margin:4px 0 0;color:#a16207;font-size:14px;">Due by ${dueDate}</p>
      </div>
      <p style="color:#4b5563;line-height:1.6;">Log in to your account to make a payment.</p>
    `;
    try {
      await sendEmail(user.email, subject, baseTemplate('Invoice Due', body));
    } catch (e) {
      console.error('Failed to send billing alert email:', e);
    }
  }

  if (smsEnabled && user.phone) {
    await trySendSms(user.phone, `${APP_NAME}: Invoice #${invoiceNumber} for $${amount.toFixed(2)} is due by ${dueDate}. Log in to your account to pay.`);
  }
}

export async function sendPaymentConfirmation(userId: string, amount: number, invoiceNumber: string) {
  const user = await storage.getUserById(userId);
  if (!user) return;

  const properties = await storage.getLocationsForUser(userId);
  const prefs = properties[0]?.notification_preferences;

  const emailEnabled = !(prefs?.paymentConfirmation === false);
  const smsEnabled = prefs?.paymentConfirmation?.sms === true;

  if (emailEnabled) {
    const subject = `Payment Confirmed - $${amount.toFixed(2)}`;
    const body = `
      <p style="color:#4b5563;line-height:1.6;">Hi ${user.first_name},</p>
      <p style="color:#4b5563;line-height:1.6;">Your payment has been successfully processed.</p>
      <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;">
        <p style="margin:0;font-weight:700;color:#166534;">Payment Received</p>
        <p style="margin:4px 0 0;color:#166534;font-size:24px;font-weight:900;">$${amount.toFixed(2)}</p>
        <p style="margin:4px 0 0;color:#15803d;font-size:14px;">Invoice #${invoiceNumber}</p>
      </div>
      <p style="color:#4b5563;line-height:1.6;">Thank you for your payment!</p>
    `;
    try {
      await sendEmail(user.email, subject, baseTemplate('Payment Confirmed', body));
    } catch (e) {
      console.error('Failed to send payment confirmation email:', e);
    }
  }

  if (smsEnabled && user.phone) {
    await trySendSms(user.phone, `${APP_NAME}: Payment of $${amount.toFixed(2)} for Invoice #${invoiceNumber} confirmed. Thank you!`);
  }
}

export async function sendServiceUpdate(userId: string, updateType: string, details: string) {
  const user = await storage.getUserById(userId);
  if (!user) return;

  const properties = await storage.getLocationsForUser(userId);
  const prefs = properties[0]?.notification_preferences;

  const emailEnabled = !(prefs?.serviceUpdates === false);
  const smsEnabled = prefs?.serviceUpdates?.sms === true;

  if (emailEnabled) {
    const subject = `Service Update - ${updateType}`;
    const body = `
      <p style="color:#4b5563;line-height:1.6;">Hi ${user.first_name},</p>
      <p style="color:#4b5563;line-height:1.6;">There's been an update to your service:</p>
      <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;">
        <p style="margin:0;font-weight:700;color:#1e40af;">${updateType}</p>
        <p style="margin:8px 0 0;color:#1e3a5f;font-size:14px;line-height:1.5;">${details}</p>
      </div>
    `;
    try {
      await sendEmail(user.email, subject, baseTemplate('Service Update', body));
    } catch (e) {
      console.error('Failed to send service update email:', e);
    }
  }

  if (smsEnabled && user.phone) {
    await trySendSms(user.phone, `${APP_NAME}: ${updateType} - ${details}`);
  }
}

export async function sendMissedCollectionConfirmation(userId: string, locationAddress: string, collectionDate: string) {
  const user = await storage.getUserById(userId);
  if (!user) return;

  const subject = `Missed Collection Report Received`;
  const body = `
    <p style="color:#4b5563;line-height:1.6;">Hi ${user.first_name},</p>
    <p style="color:#4b5563;line-height:1.6;">We've received your missed collection report and will investigate:</p>
    <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;">
      <p style="margin:0;font-weight:700;color:#991b1b;">Missed Collection Report</p>
      <p style="margin:4px 0 0;color:#7f1d1d;font-size:14px;">${locationAddress}</p>
      <p style="margin:4px 0 0;color:#7f1d1d;font-size:14px;">Date: ${collectionDate}</p>
    </div>
    <p style="color:#4b5563;line-height:1.6;">Our team will follow up within 24 hours.</p>
  `;

  try {
    await sendEmail(user.email, subject, baseTemplate('Missed Collection Report', body));
  } catch (e) {
    console.error('Failed to send missed collection confirmation email:', e);
  }

  if (user.phone) {
    await trySendSms(user.phone, `${APP_NAME}: We received your missed collection report for ${locationAddress} on ${collectionDate}. Our team will follow up within 24 hours.`);
  }
}

export async function sendMessageNotificationEmail(
  recipientId: string,
  recipientType: 'user' | 'driver',
  senderName: string,
  messageBody: string,
  conversationSubject?: string,
): Promise<void> {
  // After unified people migration, all recipient IDs are users.id
  const user = await storage.getUserById(recipientId);
  if (!user) return;

  let recipientEmail = user.email;
  let recipientFirstName = user.first_name;
  let optedIn: boolean | undefined;

  if (recipientType === 'driver') {
    // Check driver_profiles for notification preference
    const driverProfile = await storage.getDriverProfileByUserId(recipientId);
    optedIn = driverProfile?.message_email_notifications;
  } else {
    optedIn = (user as any).message_email_notifications;
  }

  if (!optedIn || !recipientEmail) return;

  const subjectLine = `New message${conversationSubject ? ` re: ${conversationSubject}` : ''}`;
  const snippet = messageBody.length > 200 ? messageBody.slice(0, 197) + '…' : messageBody;
  const body = `
    <p style="color:#4b5563;line-height:1.6;">Hi ${recipientFirstName || 'there'},</p>
    <p style="color:#4b5563;line-height:1.6;">You have a new message from <strong>${senderName}</strong>:</p>
    <div style="background:#f0fdfa;border-left:4px solid #0d9488;padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;">
      <p style="margin:0;color:#1f2937;font-size:15px;line-height:1.6;">${snippet}</p>
    </div>
    <p style="color:#4b5563;line-height:1.6;">Log in to your account to read and reply.</p>
  `;
  try {
    await sendEmail(recipientEmail, subjectLine, baseTemplate('New Message', body));
  } catch (e) {
    console.error('Failed to send message notification email:', e);
  }
}

export async function sendVerificationEmail(userId: string, token: string) {
  const user = await storage.getUserById(userId);
  if (!user) return;

  const appDomain = process.env.APP_DOMAIN || 'https://app.ruralwm.com';
  const verifyUrl = `${appDomain}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  const subject = 'Verify Your Email Address';
  const body = `
    <p style="color:#4b5563;line-height:1.6;">Hi ${user.first_name},</p>
    <p style="color:#4b5563;line-height:1.6;">Please verify your email address to ensure you receive important notifications about your service.</p>
    <p style="color:#4b5563;line-height:1.6;">
      <a href="${verifyUrl}" style="display:inline-block;background:#0d9488;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Verify Email</a>
    </p>
    <p style="color:#9ca3af;font-size:13px;margin-top:24px;">If you didn't create an account, you can safely ignore this email.</p>
  `;
  const name = `${user.first_name} ${user.last_name}`.trim();

  try {
    await sendEmail(user.email, subject, baseTemplate('Verify Your Email', body));
    logCommunication({ recipientId: userId, recipientType: 'user', recipientName: name, recipientContact: user.email, channel: 'email', subject, body: 'Verification email', status: 'sent' }).catch(() => {});
  } catch (e) {
    console.error('Failed to send verification email:', e);
    logCommunication({ recipientId: userId, recipientType: 'user', recipientName: name, recipientContact: user.email, channel: 'email', subject, body: 'Verification email', status: 'failed', errorMessage: (e as any)?.message }).catch(() => {});
  }
}

export async function sendWelcomeEmail(userId: string) {
  const user = await storage.getUserById(userId);
  if (!user) return;

  const subject = 'Welcome to Rural Waste Management!';
  const body = `
    <p style="color:#4b5563;line-height:1.6;">Hi ${user.first_name},</p>
    <p style="color:#4b5563;line-height:1.6;">Your account is ready. Here's what happens next:</p>
    <div style="background:#f0fdfa;border-left:4px solid #0d9488;padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;">
      <p style="margin:0 0 8px;color:#0d9488;font-weight:700;">Getting Started</p>
      <ol style="margin:0;padding:0 0 0 20px;color:#115e59;font-size:14px;line-height:1.8;">
        <li><strong>Add your address</strong> &mdash; we'll verify it's in our service area</li>
        <li><strong>Choose your services</strong> &mdash; pick the plan that fits your needs</li>
        <li><strong>We handle the rest</strong> &mdash; sit back and let us take care of your waste</li>
      </ol>
    </div>
    <p style="color:#4b5563;line-height:1.6;">
      <a href="${process.env.APP_DOMAIN || 'https://app.ruralwm.com'}" style="display:inline-block;background:#0d9488;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Log In to Get Started</a>
    </p>
    <p style="color:#9ca3af;font-size:13px;margin-top:24px;">Questions? Use the AI Concierge in your dashboard or message our support team anytime.</p>
  `;
  const name = `${user.first_name} ${user.last_name}`.trim();

  try {
    await sendEmail(user.email, subject, baseTemplate('Welcome!', body));
    logCommunication({ recipientId: userId, recipientType: 'user', recipientName: name, recipientContact: user.email, channel: 'email', subject, body: 'Welcome email', status: 'sent' }).catch(() => {});
  } catch (e) {
    console.error('Failed to send welcome email:', e);
    logCommunication({ recipientId: userId, recipientType: 'user', recipientName: name, recipientContact: user.email, channel: 'email', subject, body: 'Welcome email', status: 'failed', errorMessage: (e as any)?.message }).catch(() => {});
  }
}

export async function sendCollectionCompleteNotification(userId: string, address: string, date: string) {
  const user = await storage.getUserById(userId);
  if (!user) return;

  const name = `${user.first_name} ${user.last_name}`.trim();

  // Always send in-app notification
  await storage.createNotification(
    userId,
    'collection_complete',
    'Collection Complete',
    `Your waste collection at ${address} was completed on ${date}.`,
    { address, date }
  );

  // Send email if collection reminders are enabled for this location
  const locations = await storage.getLocationsByUserId(userId);
  const loc = locations.find((l: any) => l.address === address);
  const prefs = loc?.notification_preferences;
  const emailEnabled = prefs?.collectionReminders?.email !== false;

  if (emailEnabled) {
    const subject = 'Collection Complete';
    const body = `
      <p style="color:#4b5563;line-height:1.6;">Hi ${user.first_name},</p>
      <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;">
        <p style="margin:0 0 4px;color:#16a34a;font-weight:700;">Collection Completed</p>
        <p style="margin:0;color:#166534;font-size:14px;">Your waste at <strong>${address}</strong> was picked up on <strong>${date}</strong>.</p>
      </div>
      <p style="color:#9ca3af;font-size:13px;margin-top:16px;">No action needed. See you next collection day!</p>
    `;
    try {
      await sendEmail(user.email, subject, baseTemplate('Collection Complete', body));
      logCommunication({ recipientId: userId, recipientType: 'user', recipientName: name, recipientContact: user.email, channel: 'email', subject, body: 'Collection complete notification', status: 'sent' }).catch(() => {});
    } catch (e) {
      console.error('Failed to send collection complete email:', e);
      logCommunication({ recipientId: userId, recipientType: 'user', recipientName: name, recipientContact: user.email, channel: 'email', subject, body: 'Collection complete notification', status: 'failed', errorMessage: (e as any)?.message }).catch(() => {});
    }
  }
}

export async function sendCustomNotification(userId: string, message: string, channel: 'email' | 'sms' | 'both' = 'email'): Promise<{ email?: boolean; sms?: boolean }> {
  const user = await storage.getUserById(userId);
  if (!user) return {};

  const result: { email?: boolean; sms?: boolean } = {};

  if (channel === 'email' || channel === 'both') {
    const subject = `Message from ${APP_NAME}`;
    const body = `
      <p style="color:#4b5563;line-height:1.6;">Hi ${user.first_name},</p>
      <p style="color:#4b5563;line-height:1.6;white-space:pre-wrap;">${message}</p>
    `;
    try {
      await sendEmail(user.email, subject, baseTemplate('Notification', body));
      result.email = true;
    } catch (e) {
      console.error('Failed to send custom email notification:', e);
      result.email = false;
    }
  }

  if (channel === 'sms' || channel === 'both') {
    if (user.phone) {
      result.sms = await trySendSms(user.phone, `${APP_NAME}: ${message}`);
    } else {
      result.sms = false;
    }
  }

  return result;
}

export async function sendAccountDeletionEmail(userId: string) {
  const user = await storage.getUserById(userId);
  if (!user) return;

  const subject = 'Account Deletion Scheduled';
  const body = `
    <p style="color:#4b5563;line-height:1.6;">Hi ${user.first_name},</p>
    <p style="color:#4b5563;line-height:1.6;">Your account has been scheduled for deletion. All active subscriptions have been canceled.</p>
    <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;">
      <p style="margin:0 0 4px;color:#dc2626;font-weight:700;">30-Day Grace Period</p>
      <p style="margin:0;color:#991b1b;font-size:14px;">Your data will be permanently deleted after 30 days. If you change your mind, contact our support team before then to cancel the deletion.</p>
    </div>
    <p style="color:#9ca3af;font-size:13px;margin-top:16px;">We're sorry to see you go. Thank you for being a customer.</p>
  `;
  const name = `${user.first_name} ${user.last_name}`.trim();

  try {
    await sendEmail(user.email, subject, baseTemplate('Account Deletion', body));
    logCommunication({ recipientId: userId, recipientType: 'user', recipientName: name, recipientContact: user.email, channel: 'email', subject, body: 'Account deletion email', status: 'sent' }).catch(() => {});
  } catch (e) {
    console.error('Failed to send account deletion email:', e);
    logCommunication({ recipientId: userId, recipientType: 'user', recipientName: name, recipientContact: user.email, channel: 'email', subject, body: 'Account deletion email', status: 'failed', errorMessage: (e as any)?.message }).catch(() => {});
  }
}
