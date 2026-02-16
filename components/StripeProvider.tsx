import React, { useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;
let stripeResolved = false;

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

function getStripePromise() {
  if (!stripePromise) {
    stripePromise = fetchPublishableKeyWithRetry()
      .then(key => {
        if (key) {
          stripeResolved = true;
          return loadStripe(key);
        }
        stripePromise = null;
        return null;
      })
      .catch(err => {
        console.error('Failed to load Stripe:', err);
        stripePromise = null;
        return null;
      });
  }
  return stripePromise;
}

const StripeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stripeInstance, setStripeInstance] = useState<Promise<Stripe | null>>(Promise.resolve(null));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const promise = getStripePromise();
    setStripeInstance(promise);
    promise.then(() => {
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <Elements stripe={stripeInstance} options={{ appearance: { theme: 'stripe' } }}>
      {children}
    </Elements>
  );
};

export default StripeProvider;
export { getStripePromise };
