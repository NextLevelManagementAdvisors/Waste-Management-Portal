import { GoogleGenAI } from "@google/genai";
import { User, Subscription, Invoice } from '../types';

// Assume process.env.API_KEY is available in the environment
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  // In a real app, you'd want to handle this more gracefully.
  // For this example, we'll proceed, but API calls will fail without a key.
  console.warn("API_KEY environment variable not set. Gemini API calls will fail.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export const getSupportResponse = async (
  prompt: string,
  // FIX: Updated user type to include the dynamically added 'address' property.
  userContext: { user: User & { address: string }; subscriptions: Subscription[]; invoices: Invoice[] }
): Promise<string> => {
  if (!API_KEY) {
    return Promise.resolve("I'm sorry, my connection to the support system is currently unavailable. Please provide an API key.");
  }

  const contextString = `
    User Details:
    - Name: ${userContext.user.name}
    - Address: ${userContext.user.address}

    Active Subscriptions:
    ${userContext.subscriptions.filter(s => s.status === 'active').map(s => `- ${s.serviceName} ($${s.price}/mo), next bill on ${s.nextBillingDate}`).join('\n')}

    Recent Invoices:
    ${userContext.invoices.slice(0, 3).map(i => `- Invoice #${i.id} for $${i.amount} on ${i.date}, Status: ${i.status}`).join('\n')}
  `;

  const fullPrompt = `
    ---
    User Context:
    ${contextString}
    ---
    User Question: "${prompt}"
    ---
  `;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
        config: {
          systemInstruction: "You are a friendly and helpful customer support agent for a residential waste management company called 'Waste Management'. Your goal is to answer user questions accurately based on the provided context. If the answer isn't in the context, politely state that you don't have that information and suggest they contact human support. Be concise and clear. Today's date is " + new Date().toLocaleDateString() + "."
        }
    });
    return response.text;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "I'm sorry, I encountered an error while trying to answer your question. Please try again later.";
  }
};