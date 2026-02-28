/**
 * Simple Slack webhook notifier for admin alerts.
 * Sends notifications to a Slack channel when configured via SLACK_WEBHOOK_URL setting.
 */
import { pool } from './db';

let cachedWebhookUrl: string | null | undefined = undefined;

async function getWebhookUrl(): Promise<string | null> {
  if (cachedWebhookUrl !== undefined) return cachedWebhookUrl;
  try {
    const result = await pool.query(
      `SELECT value FROM system_settings WHERE key = 'SLACK_WEBHOOK_URL'`
    );
    cachedWebhookUrl = result.rows[0]?.value || null;
    // Cache for 5 minutes, then re-check
    setTimeout(() => { cachedWebhookUrl = undefined; }, 5 * 60 * 1000);
  } catch {
    cachedWebhookUrl = null;
  }
  return cachedWebhookUrl;
}

async function sendSlackMessage(text: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL || await getWebhookUrl();
  if (!url) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error('[Slack] Failed to send notification:', err);
  }
}

export async function notifyNewAddressReview(address: string, customerName: string): Promise<void> {
  await sendSlackMessage(
    `📋 *New address review:* ${address}\nSubmitted by ${customerName}`
  );
}

export async function notifyAddressDecision(address: string, decision: string, adminName?: string): Promise<void> {
  const emoji = decision === 'approved' ? '✅' : decision === 'waitlist' ? '⏳' : '❌';
  await sendSlackMessage(
    `${emoji} *Address ${decision}:* ${address}${adminName ? `\nBy ${adminName}` : ''}`
  );
}
