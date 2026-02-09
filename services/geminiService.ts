
import { GoogleGenAI } from "@google/genai";
import { User, Subscription, Invoice } from '../types.ts';

/**
 * Enhanced Support AI with Streaming and Google Search Grounding.
 */
export const getSupportResponseStream = async (
  prompt: string,
  userContext: { user: User & { address: string }; subscriptions: Subscription[]; invoices: Invoice[] }
) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const contextString = `
    User Details:
    - Name: ${userContext.user.firstName} ${userContext.user.lastName}
    - Current Focus Address: ${userContext.user.address}

    Account Status:
    - Subscriptions: ${userContext.subscriptions.filter(s => s.status === 'active').map(s => s.serviceName).join(', ')}
    - Outstanding Balance: $${userContext.invoices.filter(i => i.status !== 'Paid').reduce((acc, inv) => acc + inv.amount, 0).toFixed(2)}
  `;

  try {
    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3-flash-preview',
      contents: `Context:\n${contextString}\n\nQuestion: ${prompt}`,
      config: {
        systemInstruction: "You are the Waste Management AI Concierge. You are helpful, professional, and proactive. You have access to the user's account details and Google Search. Use search to verify any external events like holiday schedules, weather delays, or local traffic if relevant to the user's trash collection. Always cite your search sources if used.",
        tools: [{ googleSearch: {} }]
      },
    });

    return responseStream;
  } catch (error) {
    console.error("Error initiating Gemini stream:", error);
    throw error;
  }
};
