import { SystemMessage, type MessageContent } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { ChatGoogle } from '@langchain/google/node';
import { MemorySaver, type LangGraphRunnableConfig } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';
import * as optimoRoute from './optimoRouteClient';
import { storage, type DbLocation } from './storage';

interface SelectedLocationSummary {
  id: string;
  address: string;
  serviceStatus: string | null;
  collectionDay: string | null;
  collectionFrequency: string | null;
}

interface SupportAgentContext extends Record<string, unknown> {
  thread_id: string;
  userId: string;
  userName: string;
  email: string;
  autopayEnabled: boolean;
  stripeCustomerId: string | null;
  totalLocations: number;
  selectedLocation: SelectedLocationSummary | null;
}

interface StreamSupportResponseInput {
  prompt: string;
  userId: string;
  locationId?: string;
  signal?: AbortSignal;
}

type JsonRecord = Record<string, unknown>;

const EMPTY_INPUT = z.object({});
const supportCheckpointer = new MemorySaver();

function getModel() {
  return new ChatGoogle({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.LANGGRAPH_SUPPORT_MODEL || 'gemini-2.5-flash',
    maxRetries: 2,
  });
}

function getContext(config?: { configurable?: unknown }): SupportAgentContext {
  const context = config?.configurable;
  if (!context || typeof context !== 'object') {
    throw new Error('Support agent context is missing');
  }
  return context as SupportAgentContext;
}

function safeParseRecord(value: unknown): JsonRecord {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed as JsonRecord : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value as JsonRecord : {};
}

function formatMoney(value: unknown): string {
  const numeric = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(numeric)) return 'unknown';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numeric / 100);
}

function formatDate(value: unknown): string {
  if (!value) return 'unknown';
  if (typeof value === 'number') {
    const millis = value > 1e12 ? value : value * 1000;
    return new Date(millis).toISOString().split('T')[0];
  }
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    return value;
  }
  return 'unknown';
}

function formatStatus(value: unknown): string {
  if (!value || typeof value !== 'string') return 'unknown';
  return value.replace(/_/g, ' ');
}

function summarizeLocation(location: SelectedLocationSummary | null): string[] {
  if (!location) {
    return ['Selected property: none'];
  }

  return [
    `Selected property: ${location.address}`,
    `Service status: ${formatStatus(location.serviceStatus)}`,
    `Collection day: ${location.collectionDay || 'unknown'}`,
    `Collection frequency: ${location.collectionFrequency || 'unknown'}`,
  ];
}

function formatAccountSnapshot(context: SupportAgentContext): string {
  return [
    `Customer: ${context.userName}`,
    `Email: ${context.email}`,
    `Autopay: ${context.autopayEnabled ? 'enabled' : 'disabled'}`,
    `Properties on account: ${context.totalLocations}`,
    ...summarizeLocation(context.selectedLocation),
  ].join('\n');
}

function getSubscriptionLocationId(subscription: any): string | null {
  const metadata = safeParseRecord(subscription?.metadata);
  const value = metadata.locationId ?? metadata.propertyId;
  return typeof value === 'string' ? value : null;
}

function extractText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((block: any) => {
      if (typeof block === 'string') return block;
      if (block?.type === 'text' && typeof block.text === 'string') return block.text;
      if (typeof block?.text === 'string') return block.text;
      return '';
    })
    .join('');
}

const accountSnapshotTool = tool(
  async (_input, runtime) => formatAccountSnapshot(getContext(runtime)),
  {
    name: 'get_account_snapshot',
    description: 'Fetch the current customer and selected property summary for account-specific answers.',
    schema: EMPTY_INPUT,
  }
);

const billingSnapshotTool = tool(
  async (_input, runtime) => {
    const context = getContext(runtime);
    if (!context.stripeCustomerId) {
      return 'This account does not have a Stripe billing profile yet.';
    }

    const [subscriptions, invoices] = await Promise.all([
      storage.listSubscriptions(context.stripeCustomerId),
      storage.listInvoices(context.stripeCustomerId),
    ]);

    const locationMatchedSubscriptions = context.selectedLocation
      ? subscriptions.filter((subscription: any) => getSubscriptionLocationId(subscription) === context.selectedLocation?.id)
      : [];
    const scopedSubscriptions = locationMatchedSubscriptions.length > 0 ? locationMatchedSubscriptions : subscriptions;

    const activeSubscriptions = scopedSubscriptions.filter((subscription: any) =>
      ['active', 'trialing', 'past_due', 'paused'].includes(String(subscription?.status || '').toLowerCase())
    );

    const recentInvoices = invoices.slice(0, 5);
    const lines = [
      `Active subscriptions in scope: ${activeSubscriptions.length}`,
    ];

    if (activeSubscriptions.length > 0) {
      lines.push(
        ...activeSubscriptions.slice(0, 3).map((subscription: any) => {
          const amount = subscription?.plan_amount ?? subscription?.amount ?? subscription?.unit_amount;
          const currentPeriodEnd = subscription?.current_period_end ?? subscription?.cancel_at ?? subscription?.ended_at;
          return `Subscription ${subscription.id}: ${formatStatus(subscription.status)}, amount ${formatMoney(amount)}, renews/ends ${formatDate(currentPeriodEnd)}`;
        })
      );
    } else {
      lines.push('No active subscriptions were found for this scope.');
    }

    if (recentInvoices.length > 0) {
      lines.push(
        ...recentInvoices.slice(0, 3).map((invoice: any) => {
          const amount = invoice?.amount_due ?? invoice?.total ?? invoice?.amount_remaining ?? 0;
          return `Invoice ${invoice.number || invoice.id}: ${formatStatus(invoice.status)}, amount ${formatMoney(amount)}, due ${formatDate(invoice.due_date || invoice.created)}`;
        })
      );
    } else {
      lines.push('No invoices were found for this account.');
    }

    return lines.join('\n');
  },
  {
    name: 'get_billing_snapshot',
    description: 'Fetch active subscriptions and recent invoices for the current customer account.',
    schema: EMPTY_INPUT,
  }
);

const serviceStatusTool = tool(
  async (_input, runtime) => {
    const context = getContext(runtime);
    const location = context.selectedLocation;

    if (!location) {
      return 'No property is selected. Ask the customer to select the relevant property before answering location-specific questions.';
    }

    const [alerts, nextPickup] = await Promise.all([
      storage.getActiveServiceAlerts().catch(() => []),
      optimoRoute.getNextPickupForAddress(location.address).catch(() => null),
    ]);

    const alertSummaries = alerts.slice(0, 3).map((alert: any) => {
      const title = alert?.title || alert?.message || alert?.body || alert?.type || 'Active service alert';
      return `Alert: ${title}`;
    });

    return [
      `Property: ${location.address}`,
      `Service status: ${formatStatus(location.serviceStatus)}`,
      `Collection day: ${location.collectionDay || 'unknown'}`,
      `Collection frequency: ${location.collectionFrequency || 'unknown'}`,
      `Next pickup: ${nextPickup?.date ? formatDate(nextPickup.date) : 'unknown'}`,
      ...(alertSummaries.length > 0 ? alertSummaries : ['Alert: none']),
    ].join('\n');
  },
  {
    name: 'get_service_status',
    description: 'Fetch schedule, next pickup, and active service alerts for the selected property.',
    schema: EMPTY_INPUT,
  }
);

const supportAgent = createReactAgent({
  llm: () => getModel(),
  tools: [accountSnapshotTool, billingSnapshotTool, serviceStatusTool],
  checkpointer: supportCheckpointer,
  prompt: (_state, config) => {
    const context = getContext(config as LangGraphRunnableConfig);

    return [
      new SystemMessage(
        [
          'You are the Waste Management AI Concierge for a residential waste portal.',
          'Be concise, direct, and operational.',
          'Use the provided tools for billing, account, schedule, and service-status questions instead of guessing.',
          'Never invent payment status, pickup dates, or service changes.',
          'If there is no selected property and the answer depends on a specific property, tell the user to select a property first.',
          'If the request requires manual staff action, exceptions, refunds, account edits, route changes, or anything you cannot verify, say exactly: "Talk to our support team." Then explain the handoff in one sentence.',
          'Do not mention internal tool names or internal system details.',
          '',
          'Current account context:',
          formatAccountSnapshot(context),
        ].join('\n')
      ),
    ];
  },
});

async function buildContext(userId: string, locationId?: string): Promise<SupportAgentContext> {
  const user = await storage.getUserById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  const locations = await storage.getLocationsForUser(userId);
  const selectedLocation = resolveSelectedLocation(locations, locationId);

  return {
    thread_id: `support:${userId}:${selectedLocation?.id || 'account'}`,
    userId,
    userName: `${user.first_name} ${user.last_name}`.trim(),
    email: user.email,
    autopayEnabled: Boolean(user.autopay_enabled),
    stripeCustomerId: user.stripe_customer_id,
    totalLocations: locations.length,
    selectedLocation: selectedLocation
      ? {
          id: selectedLocation.id,
          address: selectedLocation.address,
          serviceStatus: selectedLocation.service_status,
          collectionDay: selectedLocation.collection_day,
          collectionFrequency: selectedLocation.collection_frequency,
        }
      : null,
  };
}

function resolveSelectedLocation(locations: DbLocation[], locationId?: string): DbLocation | null {
  if (locationId) {
    const match = locations.find(location => location.id === locationId);
    if (!match) {
      throw new Error('Location not found');
    }
    return match;
  }

  return locations.length === 1 ? locations[0] : null;
}

export async function* streamSupportResponse(input: StreamSupportResponseInput): AsyncGenerator<string> {
  const context = await buildContext(input.userId, input.locationId);
  const stream = await supportAgent.stream(
    {
      messages: [{ role: 'user', content: input.prompt }],
    },
    {
      configurable: context,
      signal: input.signal,
      streamMode: 'messages',
    }
  ) as AsyncIterable<[any, any]>;

  for await (const chunk of stream) {
    const [message, metadata] = chunk;
    if (input.signal?.aborted) return;
    if (message.getType() !== 'ai') continue;
    if (metadata?.langgraph_node && metadata.langgraph_node !== 'agent') continue;

    const text = extractText(message.content);
    if (text) {
      yield text;
    }
  }
}

export function isSupportAgentErrorStatus(error: unknown): 401 | 404 | null {
  if (!(error instanceof Error)) return null;
  if (error.message === 'User not found') return 401;
  if (error.message === 'Location not found') return 404;
  return null;
}
