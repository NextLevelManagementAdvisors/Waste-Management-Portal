/**
 * One-time script to generate a Gmail refresh token.
 * Usage: npx tsx server/get-gmail-token.ts <authorization_code>
 *
 * If no code provided, prints the authorization URL.
 */
import 'dotenv/config';
import { auth } from '@googleapis/gmail';

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set in .env');
  process.exit(1);
}

const oauth2Client = new auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

const code = process.argv[2];

if (!code) {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.send'],
  });
  console.log('\nOpen this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nThen run: npx tsx server/get-gmail-token.ts <code>\n');
} else {
  const { tokens } = await oauth2Client.getToken(code.trim());
  if (!tokens.refresh_token) {
    console.error('No refresh token returned. Make sure you used prompt=consent and access_type=offline.');
    process.exit(1);
  }
  console.log('\nAdd this to your .env:\n');
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
}
