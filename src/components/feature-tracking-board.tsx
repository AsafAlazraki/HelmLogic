'use client';

/**
 * Feature Tracking board — v1.5 entry point.
 *
 * Stage 1 (this commit): placeholder shell + header so the sidebar nav
 * lights up and routing works. The real Kanban board, create dialog,
 * detail sheet, and drag-and-drop come in stages 2–5.
 */

import { Lightbulb } from 'lucide-react';

export function FeatureTrackingBoard() {
    return (
        <div className="flex flex-col h-full">
            {/* Gradient banner — matches the app's module header pattern */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-white/15 rounded-xl flex items-center justify-center border border-white/20">
                        <Lightbulb className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Feature Tracking</h1>
                        <p className="text-sm text-blue-50">
                            Submit ideas, vote on what matters, and watch them ship.
                        </p>
                    </div>
                </div>
            </div>

            {/* Placeholder — replaced in stage 2 */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="max-w-md text-center space-y-3">
                    <Lightbulb className="h-10 w-10 text-slate-300 mx-auto" />
                    <h2 className="text-lg font-semibold text-slate-700">
                        Feature Tracking is coming online
                    </h2>
                    <p className="text-sm text-slate-500">
                        The Kanban board, feature submission, voting and comments are
                        being built in stages. This nav entry + route shell are the
                        first piece; the full board lands next.
                    </p>
                </div>
            </div>
        </div>
    );
}
