
import { User, Subscription, Invoice } from '../types.ts';

/**
 * Calls the backend AI support endpoint which proxies Gemini securely server-side.
 * Returns an async iterable of text chunks for streaming.
 */
export const getSupportResponseStream = async (
  prompt: string,
  userContext: { user: User & { address: string }; subscriptions: Subscription[]; invoices: Invoice[] }
): Promise<AsyncIterable<{ text?: string }>> => {
  const response = await fetch('/api/ai/support', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, userContext }),
  });

  if (!response.ok) {
    throw new Error(`AI service error: ${response.statusText}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  async function* streamChunks(): AsyncIterable<{ text?: string }> {
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          try {
            yield JSON.parse(data);
          } catch {
            // skip malformed chunks
          }
        }
      }
    }
  }

  return streamChunks();
};
