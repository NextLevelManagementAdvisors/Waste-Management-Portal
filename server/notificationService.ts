import { sendEmail } from './gmailClient';
import { sendSms } from './twilioClient';
import { storage } from './storage';

const APP_NAME = 'Zip-A-Dee Services';

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

export async function sendPickupReminder(userId: string, propertyAddress: string, pickupDate: string, pickupType: string = 'Regular') {
  const user = await storage.getUserById(userId);
  if (!user) return;

  const properties = await storage.getPropertiesForUser(userId);
  const property = properties.find((p: any) => p.address === propertyAddress);
  const prefs = property?.notification_preferences;

  const emailEnabled = !(prefs?.pickupReminders?.email === false);
  const smsEnabled = prefs?.pickupReminders?.sms === true;

  if (emailEnabled) {
    const subject = `Pickup Reminder - ${pickupDate}`;
    const body = `
      <p style="color:#4b5563;line-height:1.6;">Hi ${user.first_name},</p>
      <p style="color:#4b5563;line-height:1.6;">This is a reminder that your <strong>${pickupType}</strong> pickup is scheduled for:</p>
      <div style="background:#f0fdfa;border-left:4px solid #0d9488;padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;">
        <p style="margin:0;color:#0d9488;font-weight:700;font-size:16px;">${pickupDate}</p>
        <p style="margin:4px 0 0;color:#6b7280;font-size:14px;">${propertyAddress}</p>
      </div>
      <p style="color:#4b5563;line-height:1.6;">Please ensure your bins are placed curbside by 6:00 AM.</p>
    `;
    try {
      await sendEmail(user.email, subject, baseTemplate('Pickup Reminder', body));
    } catch (e) {
      console.error('Failed to send pickup reminder email:', e);
    }
  }

  if (smsEnabled && user.phone) {
    await trySendSms(user.phone, `${APP_NAME}: Reminder - Your ${pickupType} pickup at ${propertyAddress} is scheduled for ${pickupDate}. Please have bins curbside by 6 AM.`);
  }
}

export async function sendBillingAlert(userId: string, invoiceNumber: string, amount: number, dueDate: string) {
  const user = await storage.getUserById(userId);
  if (!user) return;

  const properties = await storage.getPropertiesForUser(userId);
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

  const properties = await storage.getPropertiesForUser(userId);
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

  const properties = await storage.getPropertiesForUser(userId);
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

export async function sendMissedPickupConfirmation(userId: string, propertyAddress: string, pickupDate: string) {
  const user = await storage.getUserById(userId);
  if (!user) return;

  const subject = `Missed Pickup Report Received`;
  const body = `
    <p style="color:#4b5563;line-height:1.6;">Hi ${user.first_name},</p>
    <p style="color:#4b5563;line-height:1.6;">We've received your missed pickup report and will investigate:</p>
    <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;">
      <p style="margin:0;font-weight:700;color:#991b1b;">Missed Pickup Report</p>
      <p style="margin:4px 0 0;color:#7f1d1d;font-size:14px;">${propertyAddress}</p>
      <p style="margin:4px 0 0;color:#7f1d1d;font-size:14px;">Date: ${pickupDate}</p>
    </div>
    <p style="color:#4b5563;line-height:1.6;">Our team will follow up within 24 hours.</p>
  `;

  try {
    await sendEmail(user.email, subject, baseTemplate('Missed Pickup Report', body));
  } catch (e) {
    console.error('Failed to send missed pickup confirmation email:', e);
  }

  if (user.phone) {
    await trySendSms(user.phone, `${APP_NAME}: We received your missed pickup report for ${propertyAddress} on ${pickupDate}. Our team will follow up within 24 hours.`);
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
