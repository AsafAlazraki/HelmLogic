
'use client';

import { Loader2, Ship } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background gap-6 animate-in fade-in duration-500">
      <div className="relative">
        <div className="h-24 w-24 rounded-full border-4 border-primary/10 border-t-primary animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Ship className="h-8 w-8 text-primary" />
        </div>
      </div>
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-black uppercase tracking-widest text-slate-900 italic">HelmLogic</h2>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em] animate-pulse">Syncing Maritime Data...</p>
      </div>
    </div>
  );
}
