import { google } from 'googleapis';

// Auth mode is controlled by GMAIL_AUTH_MODE setting (persisted in DB).
// When set to 'oauth' or 'service_account', only that path is used.
// When unset (legacy), falls back to priority order:
// 1. Service Account  2. OAuth2  3. Replit connector

let connectionSettings: any;

function getServiceAccountAuth() {
  const serviceAccountJson = process.env.GMAIL_SERVICE_ACCOUNT_JSON;
  const senderEmail = process.env.GMAIL_SENDER_EMAIL;
  if (!serviceAccountJson || !senderEmail) return null;

  let credentials: any;
  try {
    credentials = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error('GMAIL_SERVICE_ACCOUNT_JSON is not valid JSON. Check your .env file for formatting issues.');
  }
  return { credentials, senderEmail };
}

async function buildServiceAccountClient() {
  const sa = getServiceAccountAuth();
  if (!sa) throw new Error('Service Account credentials not configured (GMAIL_SERVICE_ACCOUNT_JSON + GMAIL_SENDER_EMAIL)');
  const auth = new google.auth.GoogleAuth({
    credentials: sa.credentials,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
  });
  const client = await auth.getClient() as any;
  client.subject = sa.senderEmail;
  return client;
}

function buildOAuthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('OAuth credentials not configured (GOOGLE_OAUTH_CLIENT_ID + SECRET + GMAIL_REFRESH_TOKEN)');
  }
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

async function getGmailAuth() {
  const mode = process.env.GMAIL_AUTH_MODE; // 'oauth' | 'service_account' | undefined

  // Explicit mode — only try the selected path
  if (mode === 'service_account') return buildServiceAccountClient();
  if (mode === 'oauth') return buildOAuthClient();

  // Legacy: no mode set — try Service Account first, then OAuth
  const sa = getServiceAccountAuth();
  if (sa) {
    const auth = new google.auth.GoogleAuth({
      credentials: sa.credentials,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
    });
    const client = await auth.getClient() as any;
    client.subject = sa.senderEmail;
    return client;
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (clientId && clientSecret && refreshToken) {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return oauth2Client;
  }

  // 3. Replit connector fallback
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('Gmail not configured. Set GMAIL_SERVICE_ACCOUNT_JSON and GMAIL_SENDER_EMAIL in .env');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    { headers: { 'Accept': 'application/json', 'X_REPLIT_TOKEN': xReplitToken } }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return oauth2Client;
}

export async function getUncachableGmailClient() {
  const auth = await getGmailAuth();
  return google.gmail({ version: 'v1', auth });
}

export async function sendEmail(to: string, subject: string, htmlBody: string) {
  const gmail = await getUncachableGmailClient();

  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
  ];
  const message = messageParts.join('\n');

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });
}
