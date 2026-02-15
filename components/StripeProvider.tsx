import React, { useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;

function getStripePromise() {
  if (!stripePromise) {
    stripePromise = fetch('/api/stripe/publishable-key')
      .then(res => res.json())
      .then(data => loadStripe(data.publishableKey))
      .catch(err => {
        console.error('Failed to load Stripe:', err);
        return null;
      });
  }
  return stripePromise;
}

const StripeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStripePromise().then(s => {
      setStripe(s);
      setLoading(false);
    });
  }, []);

  if (loading) return <>{children}</>;

  if (!stripe) {
    console.warn('Stripe failed to load, rendering children without Elements');
    return <>{children}</>;
  }

  return (
    <Elements stripe={stripe} options={{ appearance: { theme: 'stripe' } }}>
      {children}
    </Elements>
  );
};

export default StripeProvider;
export { getStripePromise };
