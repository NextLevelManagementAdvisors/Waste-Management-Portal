
import React, { useState, useRef, useEffect } from 'react';
import { SupportMessage } from '../types.ts';
import { Button } from './Button.tsx';
import { PaperAirplaneIcon, SparklesIcon, UserIcon } from './Icons.tsx';
import { getSupportResponseStream } from '../services/geminiService.ts';
import { useLocation } from '../LocationContext.tsx';

const ESCALATION_PHRASES = [
    'unable to help', 'contact support', 'reach out to', 'human support',
    'speak to a representative', 'contact us', 'support team', "can't assist",
    'cannot assist', 'beyond my capabilities', 'outside my scope',
];

const containsEscalationPhrase = (text: string) => {
    const lower = text.toLowerCase();
    return ESCALATION_PHRASES.some(phrase => lower.includes(phrase));
};

const Support: React.FC<{ onEscalateToHuman?: (context: { subject: string; body: string }) => void }> = ({ onEscalateToHuman }) => {
    const { user, selectedLocation, locations } = useLocation();
    const [messages, setMessages] = useState<SupportMessage[]>([
        { sender: 'gemini', text: "Welcome to your AI Concierge. I can help you with account billing, scheduling, or searching for holiday delays. How can I assist you?" }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamingText, setStreamingText] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const handleEscalate = () => {
        if (!onEscalateToHuman) return;
        const recent = messages.slice(-6);
        const summary = recent.map(m => `${m.sender === 'user' ? 'Customer' : 'AI'}: ${m.text}`).join('\n');
        onEscalateToHuman({
            subject: 'AI Concierge Escalation',
            body: `I was chatting with the AI Concierge and need human assistance. Here's a summary of our conversation:\n\n${summary}`,
        });
    };

    // Resolve the effective property: use selected, or auto-pick the first if only one exists
    const effectiveProperty = selectedLocation || (locations.length === 1 ? locations[0] : null);

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
            if (!user || !effectiveProperty) {
                 setMessages(prev => [...prev, { sender: 'gemini', text: "I need to know which property to look up. Please select a specific property from the dropdown at the top of the page, then ask your question again." }]);
                 setIsLoading(false);
                 return;
            }

            const stream = await getSupportResponseStream(userMsg, {
                locationId: effectiveProperty.id,
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
                        Active Support: {effectiveProperty?.address || "Select a property above"}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Live Engine</span>
                </div>
            </div>

            <div className="flex-1 p-8 overflow-y-auto space-y-8 bg-white">
                {messages.map((msg, index) => (
                    <React.Fragment key={index}>
                        <div className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[85%] px-6 py-4 rounded-[1.5rem] leading-relaxed font-medium shadow-sm border ${
                                msg.sender === 'user'
                                    ? 'bg-primary text-white border-primary shadow-primary/10'
                                    : 'bg-gray-50 text-gray-700 border-gray-100'
                            }`}>
                                <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
                            </div>
                        </div>
                        {msg.sender === 'gemini' && onEscalateToHuman && containsEscalationPhrase(msg.text) && (
                            <div className="flex flex-col items-start">
                                <button
                                    type="button"
                                    onClick={handleEscalate}
                                    className="max-w-[85%] px-5 py-3 rounded-[1.25rem] bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors flex items-center gap-3"
                                >
                                    <UserIcon className="w-5 h-5 text-primary flex-shrink-0" />
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-primary">Talk to our support team</p>
                                        <p className="text-xs text-gray-500">We'll carry over your conversation context</p>
                                    </div>
                                </button>
                            </div>
                        )}
                    </React.Fragment>
                ))}

                {streamingText && (
                    <div className="flex flex-col items-start">
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
                {onEscalateToHuman && (
                    <div className="mt-3 text-center">
                        <button
                            type="button"
                            onClick={handleEscalate}
                            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary transition-colors"
                        >
                            <UserIcon className="w-3.5 h-3.5" />
                            Need human help? Talk to our support team
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Support;
