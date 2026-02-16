import React, { useMemo } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

async function fetchPublishableKeyWithRetry(retries = 10, delay = 3000): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('/api/stripe/publishable-key');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text) throw new Error('Empty response');
      const data = JSON.parse(text);
      if (data.publishableKey) return data.publishableKey;
      throw new Error('No publishable key in response');
    } catch {
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  return null;
}

let cachedPromise: Promise<Stripe | null> | null = null;

function getStripePromise(): Promise<Stripe | null> {
  if (!cachedPromise) {
    cachedPromise = fetchPublishableKeyWithRetry()
      .then(key => key ? loadStripe(key) : null)
      .catch(err => {
        console.error('Failed to load Stripe:', err);
        return null;
      });
  }
  return cachedPromise;
}

const StripeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const stripePromise = useMemo(() => getStripePromise(), []);

  return (
    <Elements stripe={stripePromise} options={{ appearance: { theme: 'stripe' } }}>
      {children}
    </Elements>
  );
};

export default StripeProvider;
export { getStripePromise };
