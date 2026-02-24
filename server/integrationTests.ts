import twilio from 'twilio';
import { google } from 'googleapis';
import { getUncachableStripeClient } from './stripeClient';
import { getTwilioCredentials } from './twilioClient';
import * as optimo from './optimoRouteClient';
import { GoogleGenAI } from '@google/genai';

export interface IntegrationTestResult {
  status: 'connected' | 'not_configured' | 'error';
  message: string;
  latencyMs?: number;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Test timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function timed(fn: () => Promise<Omit<IntegrationTestResult, 'latencyMs'>>): Promise<IntegrationTestResult> {
  const start = Date.now();
  try {
    const result = await withTimeout(fn(), 10_000);
    return { ...result, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { status: 'error', message: err.message || 'Unknown error', latencyMs: Date.now() - start };
  }
}

// ── Twilio ──

async function testTwilio(): Promise<IntegrationTestResult> {
  return timed(async () => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const phone = process.env.TWILIO_PHONE_NUMBER;
    if (!sid || !token || !phone) {
      return { status: 'not_configured', message: 'Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER' };
    }
    const creds = await getTwilioCredentials();
    const client = creds.authToken
      ? twilio(creds.accountSid, creds.authToken)
      : twilio(creds.apiKey!, creds.apiKeySecret!, { accountSid: creds.accountSid });
    const account = await client.api.accounts(creds.accountSid).fetch();
    return { status: 'connected', message: `Account: ${account.friendlyName}` };
  });
}

// ── Stripe ──

async function testStripe(): Promise<IntegrationTestResult> {
  return timed(async () => {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PUBLISHABLE_KEY) {
      return { status: 'not_configured', message: 'Missing STRIPE_SECRET_KEY or STRIPE_PUBLISHABLE_KEY' };
    }
    const stripe = await getUncachableStripeClient();
    const balance = await stripe.balance.retrieve();
    const amt = balance.available?.[0];
    return { status: 'connected', message: amt ? `Balance: ${(amt.amount / 100).toFixed(2)} ${amt.currency.toUpperCase()}` : 'Connected' };
  });
}

// ── Gmail ──

async function testGmail(): Promise<IntegrationTestResult> {
  return timed(async () => {
    const mode = process.env.GMAIL_AUTH_MODE; // 'oauth' | 'service_account' | undefined
    const hasServiceAcct = process.env.GMAIL_SERVICE_ACCOUNT_JSON && process.env.GMAIL_SENDER_EMAIL;
    const hasOAuth = process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN;

    // Determine which path to test based on explicit mode or credential availability
    const useServiceAcct = mode === 'service_account' || (!mode && hasServiceAcct);
    const useOAuth = mode === 'oauth' || (!mode && !hasServiceAcct && hasOAuth);

    if (!useServiceAcct && !useOAuth) {
      return { status: 'not_configured', message: 'Missing Gmail credentials (Service Account or OAuth)' };
    }
    if (useServiceAcct) {
      if (!hasServiceAcct) {
        return { status: 'error', message: 'Mode set to Service Account but credentials are missing' };
      }
      const { getUncachableGmailClient } = await import('./gmailClient');
      const gmail = await getUncachableGmailClient();
      const profile = await gmail.users.getProfile({ userId: 'me' });
      return { status: 'connected', message: `Email: ${profile.data.emailAddress}` };
    }
    // OAuth: only has gmail.send scope, so verify by refreshing the access token
    if (!hasOAuth) {
      return { status: 'error', message: 'Mode set to OAuth but credentials are missing' };
    }
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    );
    oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    const { token } = await oauth2.getAccessToken();
    if (!token) throw new Error('Failed to obtain access token');
    return { status: 'connected', message: 'OAuth token valid (gmail.send)' };
  });
}

// ── Google Maps ──

async function testGoogleMaps(): Promise<IntegrationTestResult> {
  return timed(async () => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return { status: 'not_configured', message: 'Missing GOOGLE_MAPS_API_KEY' };
    }
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=1600+Amphitheatre+Parkway&key=${apiKey}`
    );
    const data = await res.json();
    if (data.status === 'OK') {
      return { status: 'connected', message: 'Geocoding API working' };
    }
    return { status: 'error', message: `Google Maps API: ${data.error_message || data.status}` };
  });
}

// ── OptimoRoute ──

async function testOptimoRoute(): Promise<IntegrationTestResult> {
  return timed(async () => {
    if (!process.env.OPTIMOROUTE_API_KEY) {
      return { status: 'not_configured', message: 'Missing OPTIMOROUTE_API_KEY' };
    }
    const today = new Date().toISOString().split('T')[0];
    const result = await optimo.getRoutes(today);
    const routes = result.routes || [];
    return { status: 'connected', message: `${routes.length} route(s) today` };
  });
}

// ── Gemini AI ──

async function testGemini(): Promise<IntegrationTestResult> {
  return timed(async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { status: 'not_configured', message: 'Missing GEMINI_API_KEY' };
    }
    const ai = new GoogleGenAI({ apiKey });
    await ai.models.get({ model: 'gemini-2.0-flash' });
    return { status: 'connected', message: 'Gemini API working' };
  });
}

// ── App Config ──

async function testAppConfig(): Promise<IntegrationTestResult> {
  return timed(async () => {
    const domain = process.env.APP_DOMAIN;
    const cors = process.env.CORS_ORIGIN;
    if (!domain && !cors) {
      return { status: 'not_configured', message: 'Missing APP_DOMAIN and CORS_ORIGIN' };
    }
    if (!domain) return { status: 'not_configured', message: 'Missing APP_DOMAIN' };
    if (!cors) return { status: 'not_configured', message: 'Missing CORS_ORIGIN' };
    return { status: 'connected', message: `Domain: ${domain}` };
  });
}

// ── Orchestrator ──

const TEST_MAP: Record<string, () => Promise<IntegrationTestResult>> = {
  twilio: testTwilio,
  stripe: testStripe,
  gmail: testGmail,
  google_maps: testGoogleMaps,
  optimoroute: testOptimoRoute,
  gemini: testGemini,
  app: testAppConfig,
};

export async function testSingleIntegration(category: string): Promise<IntegrationTestResult> {
  const fn = TEST_MAP[category];
  if (!fn) return { status: 'error', message: `Unknown integration: ${category}` };
  return fn();
}

export async function testAllIntegrations(): Promise<Record<string, IntegrationTestResult>> {
  const entries = Object.entries(TEST_MAP);
  const results = await Promise.allSettled(entries.map(([, fn]) => fn()));

  const out: Record<string, IntegrationTestResult> = {};
  entries.forEach(([key], i) => {
    const r = results[i];
    out[key] = r.status === 'fulfilled'
      ? r.value
      : { status: 'error', message: r.reason?.message || 'Unknown error' };
  });
  return out;
}
