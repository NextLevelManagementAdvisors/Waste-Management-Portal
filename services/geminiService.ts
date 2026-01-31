
import { GoogleGenAI } from "@google/genai";
import { User, Subscription, Invoice } from '../types';

// Use process.env.API_KEY directly in initialization as per the guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getSupportResponse = async (
  prompt: string,
  userContext: { user: User & { address: string }; subscriptions: Subscription[]; invoices: Invoice[] }
): Promise<string> => {
  // Guidelines: API key is handled externally, assume it's valid.

  const contextString = `
    User Details:
    - Name: ${userContext.user.firstName} ${userContext.user.lastName}
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
    // Guidelines: Use 'gemini-3-flash-preview' for basic text tasks like support Q&A.
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: fullPrompt,
        config: {
          systemInstruction: "You are a friendly and helpful customer support agent for a residential waste management company called 'Waste Management'. Your goal is to answer user questions accurately based on the provided context. If the answer isn't in the context, politely state that you don't have that information and suggest they contact human support. Be concise and clear. Today's date is " + new Date().toLocaleDateString() + "."
        }
    });
    // Guidelines: response.text is a property, not a method.
    return response.text || "I'm sorry, I couldn't process your request.";
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "I'm sorry, I encountered an error while trying to answer your question. Please try again later.";
  }
};
