import Stripe from 'stripe';

function getCredentials() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) {
    throw new Error('Stripe keys not configured. Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in .env');
  }
  return { secretKey, publishableKey };
}

/**
 * Creates a new Stripe Client using the recommended pattern.
 * The SDK automatically uses the latest API version — no need to set apiVersion.
 */
export function getUncachableStripeClient() {
  const { secretKey } = getCredentials();
  return new Stripe(secretKey);
}

export function getStripePublishableKey() {
  const { publishableKey } = getCredentials();
  return publishableKey;
}

export function getStripeSecretKey() {
  const { secretKey } = getCredentials();
  return secretKey;
}

let stripeSync: any = null;

export function resetStripeSyncCache() {
  stripeSync = null;
}

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = getStripeSecretKey();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
