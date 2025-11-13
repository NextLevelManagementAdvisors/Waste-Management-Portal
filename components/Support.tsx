
import React, { useState, useRef, useEffect } from 'react';
import { SupportMessage, User, Subscription, Invoice } from '../types';
import { Button } from './Button';
import { PaperAirplaneIcon } from './Icons';
import { getSupportResponse } from '../services/geminiService';
import { getSubscriptions, getInvoices } from '../services/mockApiService';
import { useProperty } from '../App';

const Support: React.FC = () => {
    const { user, selectedProperty } = useProperty();
    const [messages, setMessages] = useState<SupportMessage[]>([
        { sender: 'gemini', text: "Hello! I'm your virtual assistant. How can I help you with your Waste Management account today?" }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [contextError, setContextError] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage: SupportMessage = { sender: 'user', text: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);
        setContextError(null);

        if (user && selectedProperty) {
            try {
                // Fetch latest data for the selected property to build context
                const allSubs = await getSubscriptions();
                const allInvoices = await getInvoices();
                const propertySubs = allSubs.filter(s => s.propertyId === selectedProperty.id);
                const propertyInvoices = allInvoices.filter(i => i.propertyId === selectedProperty.id);

                const userContextForGemini = {
                    user: { ...user, address: selectedProperty.address }, // Pass selected property address
                    subscriptions: propertySubs,
                    invoices: propertyInvoices
                };
                
                const responseText = await getSupportResponse(input, userContextForGemini);
                const geminiMessage: SupportMessage = { sender: 'gemini', text: responseText };
                setMessages(prev => [...prev, geminiMessage]);

            } catch (error) {
                 const errorMessage: SupportMessage = { sender: 'gemini', text: "Sorry, I couldn't load your account details. Please try again later." };
                 setMessages(prev => [...prev, errorMessage]);
            }
        } else {
            setContextError("Please select a property before asking questions about a specific address or service.");
            const errorMessage: SupportMessage = { sender: 'gemini', text: "I can answer general questions, but to help with your account, please select a property first." };
            setMessages(prev => [...prev, errorMessage]);
        }

        setIsLoading(false);
    };

    return (
        <div className="flex flex-col h-full max-h-[85vh] bg-white rounded-lg shadow-lg">
            <div className="p-4 border-b">
                <h2 className="text-xl font-semibold text-neutral">Smart Support Chat</h2>
                <p className="text-sm text-gray-500">
                    Context: {selectedProperty ? selectedProperty.address : "General"}
                </p>
            </div>
            <div className="flex-1 p-4 overflow-y-auto bg-base-100">
                <div className="space-y-4">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-xs md:max-w-md lg:max-w-2xl px-4 py-2 rounded-lg shadow-sm ${msg.sender === 'user' ? 'bg-primary text-primary-content' : 'bg-base-200 text-neutral'}`}>
                                <p style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</p>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                             <div className="max-w-xs md:max-w-md lg:max-w-2xl px-4 py-2 rounded-lg bg-base-200 text-neutral">
                                <div className="flex items-center space-x-2">
                                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
                                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse [animation-delay:0.2s]"></div>
                                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse [animation-delay:0.4s]"></div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>
            <div className="p-4 border-t bg-white">
                <form onSubmit={handleSendMessage} className="flex items-center space-x-4">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a question..."
                        className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-100 text-neutral focus:bg-white"
                        disabled={isLoading}
                    />
                    <Button type="submit" disabled={isLoading || !input.trim()}>
                        <PaperAirplaneIcon className="w-5 h-5" />
                    </Button>
                </form>
                {contextError && <p className="text-xs text-red-500 mt-2">{contextError}</p>}
            </div>
        </div>
    );
};

export default Support;
