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

export async function notifyZoneDecision(zoneName: string, driverName: string, decision: string, adminName?: string): Promise<void> {
  const emoji = decision === 'approved' ? '✅' : '❌';
  await sendSlackMessage(
    `${emoji} *Driver zone ${decision}:* ${zoneName} (${driverName})${adminName ? `\nBy ${adminName}` : ''}`
  );
}

export async function notifyNewZoneProposal(driverName: string, zoneName: string, daysOfWeek: string[]): Promise<void> {
  await sendSlackMessage(
    `📍 *New zone expansion proposal* from ${driverName}: "${zoneName}" (${daysOfWeek.join(', ') || 'days TBD'}) — review and convert in the admin portal.`
  );
}

export async function notifyQualificationsUpdated(driverName: string): Promise<void> {
  await sendSlackMessage(
    `📋 *Driver qualifications updated:* ${driverName} — please verify in the admin portal.`
  );
}

export async function notifyZoneConflict(zoneName: string, driverName: string, conflictCount: number): Promise<void> {
  await sendSlackMessage(
    `⚠️ *Zone submission needs review:* "${zoneName}" by ${driverName} overlaps ${conflictCount} existing active zone${conflictCount === 1 ? '' : 's'} — sent to pending approval.`
  );
}

export async function notifyWaitlistFlagged(count: number, zoneName: string, driverName: string): Promise<void> {
  if (count === 0) return;
  await sendSlackMessage(
    `🏠 *${count} waitlisted location${count === 1 ? '' : 's'}* now ${count === 1 ? 'has' : 'have'} driver coverage (zone: ${zoneName} by ${driverName})`
  );
}

export async function notifyContractRenewalRequest(driverName: string, contractId: string, proposedRate: number | null, proposedEndDate: string | null): Promise<void> {
  const details = [proposedRate ? `$${proposedRate}/stop` : null, proposedEndDate ? `end ${proposedEndDate}` : null].filter(Boolean).join(', ');
  await sendSlackMessage(
    `🔄 *Contract renewal request* from ${driverName}${details ? ` (${details})` : ''} — review in admin portal.`
  );
}

export async function notifyNewProviderApplication(companyName: string, ownerName: string): Promise<void> {
  await sendSlackMessage(
    `🏢 *New provider application* from *${companyName}* (owner: ${ownerName}) — review in admin portal under Operations > Company Applications.`
  );
}

export async function notifyProviderApproval(companyName: string): Promise<void> {
  await sendSlackMessage(`✅ Provider *${companyName}* has been *approved* and is now active.`);
}

export async function notifyProviderRejection(companyName: string, notes?: string): Promise<void> {
  await sendSlackMessage(
    `❌ Provider *${companyName}* has been *rejected*.${notes ? ` Reason: ${notes}` : ''}`
  );
}

export async function notifyProviderInsuranceExpiring(companyName: string, ownerEmail: string, daysRemaining: number): Promise<void> {
  await sendSlackMessage(
    `⚠️ Provider *${companyName}* (${ownerEmail}) insurance expires in *${daysRemaining} days*. Review in admin portal.`
  );
}

