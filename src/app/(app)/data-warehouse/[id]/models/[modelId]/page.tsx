import { notFound } from 'next/navigation';

// This page intentionally triggers a 404 error.
// It exists to resolve a routing ambiguity with the more specific model details page:
// src/app/(app)/data-warehouse/[id]/ranges/[rangeId]/models/[modelId]/page.tsx
export default function Page() {
    notFound();
}
