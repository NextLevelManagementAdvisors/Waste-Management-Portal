
import { GoogleGenAI } from "@google/genai";
import { User, Subscription, Invoice } from '../types.ts';

/**
 * Enhanced Support AI with Streaming and Google Search Grounding.
 */
export const getSupportResponseStream = async (
  prompt: string,
  userContext: { user: User & { address: string }; subscriptions: Subscription[]; invoices: Invoice[] },
  location: { latitude: number; longitude: number } | null
) => {
  // FIX: Created a new GoogleGenAI instance before making an API call.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const contextString = `
    User Details:
    - Name: ${userContext.user.firstName} ${userContext.user.lastName}
    - Current Focus Address: ${userContext.user.address}

    Account Status:
    - Subscriptions: ${userContext.subscriptions.filter(s => s.status === 'active').map(s => s.serviceName).join(', ')}
    - Outstanding Balance: $${userContext.invoices.filter(i => i.status !== 'Paid').reduce((acc, inv) => acc + inv.amount, 0).toFixed(2)}
  `;

  const config: any = {
    systemInstruction: "You are the Waste Management AI Concierge. You are helpful, professional, and proactive. You have access to the user's account details, Google Search, and Google Maps for location-based info. Use search to verify any external events like holiday schedules, weather delays, or local traffic if relevant to the user's trash collection. Use Maps for queries about locations, directions, or nearby facilities. Always cite your sources if used.",
    tools: [{ googleSearch: {} }, { googleMaps: {} }]
  };

  if (location) {
    config.toolConfig = {
      retrievalConfig: {
        latLng: {
          latitude: location.latitude,
          longitude: location.longitude
        }
      }
    };
  }

  try {
    const responseStream = await ai.models.generateContentStream({
      // FIX: Use a model that supports Google Maps grounding.
      model: 'gemini-2.5-flash',
      contents: `Context:\n${contextString}\n\nQuestion: ${prompt}`,
      config: config,
    });

    return responseStream;
  } catch (error) {
    console.error("Error initiating Gemini stream:", error);
    throw error;
  }
};
