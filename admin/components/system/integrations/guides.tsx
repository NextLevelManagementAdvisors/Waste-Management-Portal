import React from 'react';

const ExtLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-teal-600 underline hover:text-teal-800">{children}</a>
);

export const twilioGuide = (
  <ol className="list-decimal list-inside space-y-1">
    <li>Sign up at <ExtLink href="https://www.twilio.com/try-twilio">twilio.com/try-twilio</ExtLink></li>
    <li>Your <strong>Account SID</strong> and <strong>Auth Token</strong> are on the <ExtLink href="https://console.twilio.com">Console Dashboard</ExtLink></li>
    <li>Buy a phone number at <ExtLink href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming">Phone Numbers</ExtLink></li>
  </ol>
);

export const stripeGuide = (
  <div className="space-y-2">
    <ol className="list-decimal list-inside space-y-2">
      <li>Sign up at <ExtLink href="https://dashboard.stripe.com/register">stripe.com</ExtLink></li>
      <li>Get your keys at <ExtLink href="https://dashboard.stripe.com/apikeys">API Keys</ExtLink></li>
      <li>
        Create a webhook at <ExtLink href="https://dashboard.stripe.com/webhooks">Webhooks</ExtLink>:
        <ul className="list-disc list-inside ml-5 mt-1 text-xs text-gray-600 space-y-0.5">
          <li>Click <strong>+ Add endpoint</strong></li>
          <li>Destination type: <strong>Webhook endpoint</strong></li>
          <li>Endpoint URL: <code className="bg-gray-100 px-1 rounded text-xs select-all">{window.location.origin}/api/stripe/webhook</code></li>
          <li>Listen to events from <strong>Your account</strong></li>
          <li>API version: <strong>2026-01-28.clover</strong></li>
          <li>Under <strong>Events</strong>, check <strong>Select all</strong> and click <strong>Continue</strong></li>
        </ul>
      </li>
      <li>Copy the <strong>Signing secret</strong> (starts with <code className="bg-gray-100 px-1 rounded text-xs">whsec_</code>) and paste it as the <strong>Webhook Secret</strong> below</li>
    </ol>
    <div className="mt-3 pt-3 border-t border-gray-200">
      <p className="font-semibold text-gray-800 text-xs">Local development</p>
      <p className="text-xs text-gray-600 mt-1">Stripe can&apos;t reach localhost. Use the <ExtLink href="https://docs.stripe.com/stripe-cli">Stripe CLI</ExtLink> to forward events:</p>
      <ol className="list-decimal list-inside text-xs text-gray-600 mt-1 space-y-0.5">
        <li>Install the CLI and run <code className="bg-gray-100 px-1 rounded">stripe login</code></li>
        <li>Forward events: <code className="bg-gray-100 px-1 rounded select-all">stripe listen --forward-to localhost:5000/api/stripe/webhook</code></li>
        <li>Copy the <code className="bg-gray-100 px-1 rounded">whsec_</code> signing secret printed by the CLI and paste it as the <strong>Webhook Secret</strong> below</li>
      </ol>
    </div>
  </div>
);

export const googleOAuthGuide = (
  <div className="space-y-2">
    <p className="font-semibold text-gray-800">These credentials are shared by Gmail (email sending), Google SSO (sign-in), and other Google services.</p>
    <ol className="list-decimal list-inside space-y-2">
      <li>
        Go to <ExtLink href="https://console.cloud.google.com/apis/credentials">Google Cloud Console &gt; Credentials</ExtLink>
        <ul className="list-disc list-inside ml-5 mt-1 text-xs text-gray-600 space-y-0.5">
          <li>Click <strong>+ Create Credentials</strong> &rarr; <strong>OAuth client ID</strong></li>
          <li>Application type: <strong>Web application</strong></li>
        </ul>
      </li>
      <li>
        Under <strong>Authorized redirect URIs</strong>, add both:
        <div className="mt-1 ml-5 space-y-1">
          <code className="bg-gray-100 px-2 py-1 rounded text-xs block w-fit select-all">{window.location.origin}/api/admin/gmail/callback</code>
          <code className="bg-gray-100 px-2 py-1 rounded text-xs block w-fit select-all">{window.location.origin}/api/auth/google/callback</code>
          <code className="bg-gray-100 px-2 py-1 rounded text-xs block w-fit select-all">{window.location.origin}/api/team/auth/google/callback</code>
        </div>
      </li>
      <li>
        Configure the <ExtLink href="https://console.cloud.google.com/apis/credentials/consent">OAuth consent screen</ExtLink>
      </li>
    </ol>
  </div>
);

export function getGmailGuide(mode: 'oauth' | 'service_account'): React.ReactNode {
  if (mode === 'oauth') {
    return (
      <div className="space-y-3">
        <p className="font-semibold text-gray-800">OAuth lets you send email from a personal Gmail or Workspace account. Best for most setups.</p>
        <ol className="list-decimal list-inside space-y-2">
          <li>Ensure <strong>OAuth Client ID</strong> and <strong>Client Secret</strong> are configured in the <strong>Google OAuth</strong> section</li>
          <li>
            Enable the <ExtLink href="https://console.cloud.google.com/apis/library/gmail.googleapis.com">Gmail API</ExtLink>
            <ul className="list-disc list-inside ml-5 mt-1 text-xs text-gray-600 space-y-0.5">
              <li>Search for "Gmail API" in the API Library and click <strong>Enable</strong></li>
            </ul>
          </li>
          <li>
            Add scope <code className="bg-gray-100 px-1 rounded">https://www.googleapis.com/auth/gmail.send</code> to the <ExtLink href="https://console.cloud.google.com/apis/credentials/consent">OAuth consent screen</ExtLink>
          </li>
          <li>Click <strong>Authorize Gmail</strong> below to sign in with Google &mdash; the refresh token will be saved automatically</li>
        </ol>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="font-semibold text-gray-800">Service Account uses domain-wide delegation to send as any user. Requires Google Workspace (not personal Gmail).</p>
      <ol className="list-decimal list-inside space-y-2">
        <li>
          Go to <ExtLink href="https://console.cloud.google.com/iam-admin/serviceaccounts">Google Cloud Console &gt; IAM &gt; Service Accounts</ExtLink>
          <ul className="list-disc list-inside ml-5 mt-1 text-xs text-gray-600 space-y-0.5">
            <li>Click <strong>+ Create Service Account</strong></li>
            <li>Name it (e.g. "waste-portal-mailer") and click <strong>Create and Continue</strong></li>
          </ul>
        </li>
        <li>
          Enable domain-wide delegation and authorize scope <code className="bg-gray-100 px-1 rounded">https://www.googleapis.com/auth/gmail.send</code> in <ExtLink href="https://admin.google.com/ac/owl/domainwidedelegation">Workspace Admin</ExtLink>
        </li>
        <li>
          Enable the <ExtLink href="https://console.cloud.google.com/apis/library/gmail.googleapis.com">Gmail API</ExtLink> in your Google Cloud project
        </li>
        <li>
          Create a JSON key from the <strong>Keys</strong> tab and upload below
        </li>
        <li>
          Set <strong>Sender Email</strong> to the Google Workspace email address to send from
        </li>
      </ol>
    </div>
  );
}

export const googleSsoGuide = (
  <div className="space-y-2">
    <p>Google SSO uses the OAuth credentials configured in the <strong>Google OAuth</strong> section above.</p>
    <ul className="list-disc list-inside space-y-1">
      <li>The toggle below enables or disables the "Sign in with Google" buttons on login pages</li>
      <li>When disabled, users must use email/password to sign in</li>
    </ul>
  </div>
);

export const googleMapsGuide = (
  <ol className="list-decimal list-inside space-y-1">
    <li>Go to <ExtLink href="https://console.cloud.google.com/apis/credentials">Google Cloud Console &gt; Credentials</ExtLink> and create an API key</li>
    <li>Enable the <ExtLink href="https://console.cloud.google.com/apis/library/maps-backend.googleapis.com">Maps JavaScript API</ExtLink> and <ExtLink href="https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com">Geocoding API</ExtLink></li>
  </ol>
);

export const optimoRouteGuide = (
  <ol className="list-decimal list-inside space-y-1">
    <li>Log into <ExtLink href="https://optimoroute.com">OptimoRoute</ExtLink></li>
    <li>Go to <strong>Settings &gt; Integrations &gt; API</strong> to find your API key</li>
  </ol>
);

export const geminiGuide = (
  <ol className="list-decimal list-inside space-y-1">
    <li>Get an API key at <ExtLink href="https://aistudio.google.com/apikey">Google AI Studio</ExtLink></li>
  </ol>
);

export const appConfigGuide = (
  <ul className="list-disc list-inside space-y-1">
    <li><strong>App Domain</strong> &mdash; Your public URL, e.g. <code className="bg-gray-100 px-1 rounded text-xs">https://app.ruralwm.com</code></li>
    <li><strong>CORS Origin</strong> &mdash; Allowed origins for cross-origin requests (usually same as your domain)</li>
  </ul>
);

export const GUIDES: Record<string, React.ReactNode> = {
  twilio: twilioGuide,
  stripe: stripeGuide,
  google_oauth: googleOAuthGuide,
  google_sso: googleSsoGuide,
  google_maps: googleMapsGuide,
  optimoroute: optimoRouteGuide,
  gemini: geminiGuide,
  app: appConfigGuide,
};
