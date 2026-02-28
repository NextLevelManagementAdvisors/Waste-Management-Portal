/**
 * Shared notification message templates for address review decisions.
 * Used by auto-approval (feasibilityCheck), admin individual approval,
 * and admin bulk approval flows.
 */

export function approvalMessage(address: string, pickupDay?: string, hasRentalDelivery?: boolean): { subject: string; body: string } {
  const dayInfo = pickupDay
    ? ` Your scheduled pickup day is ${pickupDay.charAt(0).toUpperCase() + pickupDay.slice(1)}. Please have your bins at the curb by 6:00 AM on your pickup day.`
    : '';
  const deliveryInfo = hasRentalDelivery
    ? ' A rental container will be delivered to your address within 3-5 business days.'
    : '';
  return {
    subject: 'Address Approved',
    body: `Great news! Your address at ${address} has been approved. Your waste collection service is now being set up and you will be billed according to your selected plan.${dayInfo}${deliveryInfo}`,
  };
}

export function denialMessage(address: string, notes?: string): { subject: string; body: string } {
  return {
    subject: 'Address Denied',
    body: `Your address at ${address} has been reviewed and unfortunately we are unable to service this location at this time.${notes ? ` Note: ${notes}` : ''} Please contact us if you have any questions.`,
  };
}

export function waitlistMessage(address: string): { subject: string; body: string } {
  return {
    subject: 'Address Update',
    body: `Your address at ${address} is not currently in our service area, but we're expanding! We've added you to our waiting list and will notify you when service becomes available. Your service selections have been saved.`,
  };
}
