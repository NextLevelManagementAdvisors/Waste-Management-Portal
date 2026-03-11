import twilio from 'twilio';

interface TwilioCredentials {
  accountSid: string;
  authToken?: string;
  apiKey?: string;
  apiKeySecret?: string;
  phoneNumber: string;
}

let cachedCredentials: TwilioCredentials | null = null;

function getCredentials(): TwilioCredentials {
  if (cachedCredentials) return cachedCredentials;

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    throw new Error('Twilio not configured: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER env vars');
  }

  cachedCredentials = {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  };
  return cachedCredentials;
}

export function resetTwilioCache() {
  cachedCredentials = null;
}

export function getTwilioCredentials() {
  return getCredentials();
}

export async function sendSms(to: string, body: string): Promise<void> {
  const creds = getCredentials();

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
