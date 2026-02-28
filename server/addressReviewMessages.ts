/**
 * Shared notification message templates for address review decisions.
 * Used by auto-approval (feasibilityCheck), admin individual approval,
 * and admin bulk approval flows.
 */

export function approvalMessage(address: string): { subject: string; body: string } {
  return {
    subject: 'Address Approved',
    body: `Great news! Your address at ${address} has been approved. Your waste collection service is now being set up and you will be billed according to your selected plan.`,
  };
}

export function denialMessage(address: string, notes?: string): { subject: string; body: string } {
  return {
    subject: 'Address Denied',
    body: `Your address at ${address} has been reviewed and unfortunately we are unable to service this location at this time.${notes ? ` Note: ${notes}` : ''} Please contact us if you have any questions.`,
  };
}
