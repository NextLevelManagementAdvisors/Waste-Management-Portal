
import React, { useState, useRef, useEffect } from 'react';
import { SupportMessage } from '../types';
import { Button } from './Button';
import { PaperAirplaneIcon, SparklesIcon, XMarkIcon } from './Icons';
import { getSupportResponseStream } from '../services/geminiService';
import { getSubscriptions, getInvoices } from '../services/mockApiService';
import { useProperty } from '../App';

const Support: React.FC = () => {
    const { user, selectedProperty } = useProperty();
    const [messages, setMessages] = useState<SupportMessage[]>([
        { sender: 'gemini', text: "Welcome to your AI Concierge. I can help you with account billing, scheduling, or searching for holiday delays. How can I assist you?" }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingText, setStreamingText] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingText]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
        setInput('');
        setIsLoading(true);
        setStreamingText('');

        try {
            if (!user || !selectedProperty) {
                 setMessages(prev => [...prev, { sender: 'gemini', text: "I'd love to help, but please select a property context at the top of the screen so I can look up your specific schedule." }]);
                 setIsLoading(false);
                 return;
            }

            const allSubs = await getSubscriptions();
            const allInvoices = await getInvoices();
            const propertySubs = allSubs.filter(s => s.propertyId === selectedProperty.id);
            const propertyInvoices = allInvoices.filter(i => i.propertyId === selectedProperty.id);

            const stream = await getSupportResponseStream(userMsg, {
                user: { ...user, address: selectedProperty.address },
                subscriptions: propertySubs,
                invoices: propertyInvoices
            });

            let fullText = "";
            for await (const chunk of stream) {
                const text = chunk.text || "";
                fullText += text;
                setStreamingText(fullText);
            }

            setMessages(prev => [...prev, { sender: 'gemini', text: fullText }]);
            setStreamingText('');
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { sender: 'gemini', text: "I'm having trouble connecting to my knowledge base. Please try again or call our support line." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-12rem)] bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-base-200">
            <div className="p-8 border-b border-base-100 bg-gray-50/50 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-primary rounded-xl">
                            <SparklesIcon className="w-5 h-5 text-white" />
                        </div>
                        Concierge AI
                    </h2>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                        Active Support: {selectedProperty?.address || "Universal"}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Live Engine</span>
                </div>
            </div>

            <div className="flex-1 p-8 overflow-y-auto space-y-8 bg-white">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] px-6 py-4 rounded-[1.5rem] leading-relaxed font-medium shadow-sm border ${
                            msg.sender === 'user' 
                                ? 'bg-primary text-white border-primary shadow-primary/10' 
                                : 'bg-gray-50 text-gray-700 border-gray-100'
                        }`}>
                            <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
                        </div>
                    </div>
                ))}
                
                {streamingText && (
                    <div className="flex justify-start">
                        <div className="max-w-[85%] px-6 py-4 rounded-[1.5rem] bg-gray-50 text-gray-700 border border-gray-100 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                             <p className="whitespace-pre-wrap text-sm">{streamingText}</p>
                        </div>
                    </div>
                )}

                {isLoading && !streamingText && (
                    <div className="flex justify-start">
                         <div className="px-6 py-4 rounded-[1.5rem] bg-gray-50 border border-gray-100">
                            <div className="flex space-x-2">
                                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                                <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.2s]" />
                                <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:0.4s]" />
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-8 border-t border-base-100">
                <form onSubmit={handleSendMessage} className="relative flex items-center">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about your bill, schedule, or holiday delays..."
                        className="w-full bg-gray-50 border-none rounded-[1.5rem] py-5 pl-8 pr-20 text-gray-900 focus:ring-2 focus:ring-primary focus:bg-white transition-all text-sm font-medium"
                        disabled={isLoading}
                    />
                    <button 
                        type="submit" 
                        disabled={isLoading || !input.trim()}
                        className="absolute right-3 p-3 bg-primary text-white rounded-2xl hover:bg-primary-focus transition-colors disabled:opacity-50 shadow-lg shadow-primary/20"
                    >
                        <PaperAirplaneIcon className="w-5 h-5" />
                    </button>
                </form>
                <div className="mt-4 flex gap-4 justify-center">
                    {["Holiday Schedule", "Pay Balance", "Missed Collection"].map(tag => (
                        <button 
                            key={tag}
                            type="button"
                            onClick={() => setInput(tag)}
                            className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-primary transition-colors"
                        >
                            {tag}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Support;
