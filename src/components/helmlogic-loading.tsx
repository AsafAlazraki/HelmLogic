'use client';

import { Ship, Zap } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface HelmLogicLoadingProps {
    title?: string;
    subtext?: string;
    label?: string;
    organisation?: {
        name: string;
        primaryLogoUrl?: string | null;
    } | null;
    className?: string;
}

export function HelmLogicLoading({ 
    title = "HelmLogic", 
    subtext = "Synchronizing maritime data sets...", 
    label = "Initializing Global Workspace",
    organisation,
    className
}: HelmLogicLoadingProps) {
    return (
        <div className={cn("fixed inset-0 z-[200] bg-primary flex flex-col items-center justify-center text-white overflow-hidden animate-in fade-in duration-500", className)}>
            <div className="absolute inset-0 z-0">
                <div className="absolute top-20 right-20 w-[400px] h-[400px] bg-indigo-400/10 rounded-full blur-3xl animate-pulse duration-[4000ms]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-accent/20 rounded-full blur-3xl animate-pulse duration-[6000ms]" />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-12 max-w-2xl text-center">
                {/* Brand Plate */}
                <div className="relative h-64 w-64 bg-white/10 backdrop-blur-xl rounded-[3.5rem] p-10 border border-white/20 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-700">
                    {organisation?.primaryLogoUrl ? (
                        <div className="relative h-full w-full">
                            <Image 
                                src={organisation.primaryLogoUrl} 
                                alt={organisation.name} 
                                fill 
                                className="object-contain p-2 brightness-0 invert" 
                                unoptimized
                            />
                        </div>
                    ) : (
                        <Ship className="h-full w-full text-white/40" />
                    )}
                </div>

                {/* Identity & Status */}
                <div className="space-y-4 px-6">
                    <div className="flex items-center justify-center gap-3 text-[12px] font-black uppercase tracking-[0.5em] text-white/50 leading-none">
                        <Zap className="h-4 w-4 fill-current" />
                        <span>{label}</span>
                    </div>
                    <h2 className="text-5xl sm:text-6xl font-black italic uppercase tracking-tighter line-clamp-2">
                        {title}
                    </h2>
                </div>

                {/* Shimmer Progress Bar */}
                <div className="relative w-64 h-1.5 flex items-center justify-center bg-white/10 rounded-full overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-[shimmer_2s_infinite] w-1/2" />
                </div>

                {/* Actionable Subtext */}
                <p className="text-[12px] font-bold uppercase tracking-widest text-white/60 animate-pulse">
                    {subtext}
                </p>
            </div>
            
            <style jsx global>{`
                @keyframes shimmer {
                    0% { transform: translateX(-200%); }
                    100% { transform: translateX(200%); }
                }
            `}</style>
        </div>
    );
}
