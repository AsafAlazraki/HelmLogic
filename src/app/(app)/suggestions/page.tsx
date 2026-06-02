'use client';

import { SuggestionApprovalQueue } from '@/components/suggestion-approval-queue';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';

export default function SuggestionsPage() {
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">Suggestion Approval</h1>
                <BreadcrumbNav />
            </div>
            <SuggestionApprovalQueue />
        </div>
    );
}
