import twilio from 'twilio';

interface TwilioCredentials {
  accountSid: string;
  authToken?: string;
  apiKey?: string;
  apiKeySecret?: string;
  phoneNumber: string;
}

let cachedCredentials: TwilioCredentials | null = null;

async function getCredentials(): Promise<TwilioCredentials> {
  if (cachedCredentials) return cachedCredentials;

  // Priority 1: Direct env vars (production VPS)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    cachedCredentials = {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    };
    return cachedCredentials;
  }

  // Priority 2: Replit connector
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('Twilio not configured: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER env vars');
  }

  const connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected via Replit connector');
  }

  cachedCredentials = {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number,
  };
  return cachedCredentials;
}

export function resetTwilioCache() {
  cachedCredentials = null;
}

export async function getTwilioCredentials() {
  return getCredentials();
}

export async function sendSms(to: string, body: string): Promise<void> {
  const creds = await getCredentials();

  const client = creds.authToken
    ? twilio(creds.accountSid, creds.authToken)
    : twilio(creds.apiKey!, creds.apiKeySecret!, { accountSid: creds.accountSid });

  const formatted = to.startsWith('+') ? to : `+1${to.replace(/\D/g, '')}`;

  await client.messages.create({
    body,
    from: creds.phoneNumber,
    to: formatted,
  });
}
