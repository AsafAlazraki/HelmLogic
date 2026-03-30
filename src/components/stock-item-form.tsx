'use client';

export function StockItemForm({ open, onOpenChange, item, moduleId, organisationId, locations, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; item?: any; moduleId: string; organisationId: string; locations?: string[]; onSaved?: () => void }) {
    if (!open) return null;
    return null;
}
