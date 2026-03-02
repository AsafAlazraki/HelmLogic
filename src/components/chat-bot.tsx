'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
    MessageSquare, 
    X, 
    Send, 
    Loader2, 
    Ship, 
    Bot, 
    User,
    ArrowDownCircle,
    Maximize2,
    Minimize2
} from 'lucide-react';
import { maritimeAssistantChat } from '@/ai/flows/maritime-assistant-flow';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export function ChatBot() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: 'Hello! I am the HelmLogic Assistant. Ask me anything about our boat models, motor compatibility, or technical specs.' }
    ]);
    const [isLoading, setIsLoading] = useState(false);
    
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport) {
                viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
            }
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);

        try {
            // Prepare history for Genkit
            const history = messages.slice(1).map(m => ({
                role: m.role === 'assistant' ? 'model' as const : 'user' as const,
                content: [{ text: m.content }]
            }));

            const result = await maritimeAssistantChat({
                message: userMessage,
                history: history
            });

            setMessages(prev => [...prev, { role: 'assistant', content: result.text }]);
        } catch (error) {
            console.error('Chat error:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I encountered an error processing your request. Please try again." }]);
        } finally {
            setIsLoading(false);
        }
    };

    // Hide chatbot in quote builder
    if (pathname?.includes('/quote/')) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            {isOpen ? (
                <Card className={cn(
                    "mb-4 shadow-2xl border-2 flex flex-col transition-all duration-300 animate-in slide-in-from-bottom-4 zoom-in-95",
                    isExpanded ? "w-[500px] h-[700px]" : "w-80 sm:w-96 h-[500px]"
                )}>
                    <CardHeader className="p-4 bg-primary text-primary-foreground flex flex-row items-center justify-between rounded-t-lg">
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 bg-white/20 rounded-full flex items-center justify-center">
                                <Bot className="h-5 w-5" />
                            </div>
                            <div>
                                <CardTitle className="text-sm font-black uppercase tracking-widest">HelmLogic AI</CardTitle>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className="h-1.5 w-1.5 bg-green-400 rounded-full animate-pulse" />
                                    <span className="text-[10px] font-bold opacity-70 uppercase">Online Assistant</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10 hidden sm:flex" onClick={() => setIsExpanded(!isExpanded)}>
                                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setIsOpen(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    
                    <CardContent className="flex-1 p-0 overflow-hidden bg-muted/5">
                        <ScrollArea ref={scrollRef} className="h-full p-4">
                            <div className="space-y-4">
                                {messages.map((m, i) => (
                                    <div key={i} className={cn(
                                        "flex gap-3 max-w-[85%]",
                                        m.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                                    )}>
                                        <div className={cn(
                                            "h-8 w-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm",
                                            m.role === 'assistant' ? "bg-white text-primary" : "bg-primary text-white"
                                        )}>
                                            {m.role === 'assistant' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                                        </div>
                                        <div className={cn(
                                            "p-3 rounded-2xl text-sm shadow-sm",
                                            m.role === 'assistant' 
                                                ? "bg-white border rounded-tl-none font-medium leading-relaxed" 
                                                : "bg-primary text-primary-foreground rounded-tr-none font-semibold"
                                        )}>
                                            {m.content}
                                        </div>
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className="flex gap-3 mr-auto max-w-[85%]">
                                        <div className="h-8 w-8 rounded-full bg-white border flex items-center justify-center text-primary animate-pulse">
                                            <Bot className="h-4 w-4" />
                                        </div>
                                        <div className="bg-white border p-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Analyzing warehouse...</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>

                    <CardFooter className="p-4 border-t bg-white">
                        <form 
                            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                            className="flex w-full items-center gap-2"
                        >
                            <Input 
                                placeholder="Ask about boats or motors..." 
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                className="flex-1 h-10 font-bold bg-muted/10 border-muted"
                                disabled={isLoading}
                            />
                            <Button type="submit" size="icon" disabled={isLoading || !input.trim()} className="h-10 w-10 shrink-0">
                                <Send className="h-4 w-4" />
                            </Button>
                        </form>
                    </CardFooter>
                </Card>
            ) : (
                <Button 
                    onClick={() => setIsOpen(true)}
                    size="lg"
                    className="h-14 w-14 rounded-full shadow-2xl hover:scale-110 transition-transform bg-primary"
                >
                    <MessageSquare className="h-6 w-6" />
                </Button>
            )}
        </div>
    );
}
