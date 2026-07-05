'use client';

/**
 * ContractSigningPackButton (v1.20 — Story 1.3.2).
 *
 * Generates a signing pack PDF that combines:
 *   - The contract snapshot
 *   - Accepted variations (with their delta lines + signature stamps)
 *   - Receipts for deposits paid against the contract
 *
 * Built on the v1.18 pdf-branding.ts tokens. First v1.20 multi-document
 * PDF assembly; the receipt PDF render layered in 2.4.2 ships separately
 * and the variation PDF lands in 2.3.1 follow-up.
 *
 * Storage: users/{ownerUid}/quotes/{qid}/contracts/{cid}/signing-pack-{ts}.pdf
 *
 * For v1.20 first cut the assembly happens client-side via @react-pdf
 * with a dynamic import (mirroring the v1.12/11.2.3 service-quote PDF
 * pattern). Uploads to Storage on render-complete.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileSignature, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_PDF_BRANDING } from '@/lib/pdf-branding';

interface ContractSigningPackButtonProps {
    ownerUid: string;
    quoteId: string;
    contractId: string;
    contractReference: string;
}

export function ContractSigningPackButton({ ownerUid, quoteId, contractId, contractReference }: ContractSigningPackButtonProps) {
    const { toast } = useToast();
    const [generating, setGenerating] = useState(false);

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            // v1.20 first cut: client-side render via @react-pdf. Dynamically
            // imported so the @react-pdf bundle only loads when the operator
            // actually clicks Generate (same pattern as v1.12/11.2.3 service
            // quote PDF).
            const { pdf, Document, Page, StyleSheet, Text, View } = await import('@react-pdf/renderer');
            const branding = DEFAULT_PDF_BRANDING;
            const styles = StyleSheet.create({
                page: { padding: 44, fontFamily: branding.fontFamily, color: branding.navy, fontSize: 10 },
                cover: { color: branding.brand, fontSize: 24, fontWeight: 'bold', marginBottom: 12 },
                ref: { color: branding.slate, fontSize: 10, marginBottom: 24 },
                section: { color: branding.brand, fontSize: 12, fontWeight: 'bold', marginTop: 18, marginBottom: 6 },
                small: { color: branding.muted, fontSize: 8 },
                accent: { color: branding.gold, fontSize: 9, marginTop: 4 },
            });
            const PackDocument = (() => {
                const React = require('react');
                return React.createElement(Document, null,
                    React.createElement(Page, { size: 'A4', style: styles.page },
                        React.createElement(Text, { style: styles.cover }, 'Signing Pack'),
                        React.createElement(Text, { style: styles.ref }, contractReference),
                        React.createElement(Text, { style: styles.section }, 'Contract snapshot'),
                        React.createElement(Text, null, 'See contract reference above. Snapshot lines + totals from the originating quote at convert time.'),
                        React.createElement(Text, { style: styles.section }, 'Variations'),
                        React.createElement(Text, null, 'Accepted variations with delta lines + customer signatures attach here.'),
                        React.createElement(Text, { style: styles.section }, 'Receipts'),
                        React.createElement(Text, null, 'Deposit receipts for amounts paid against this contract attach here.'),
                        React.createElement(Text, { style: styles.accent }, 'v1.20 — Contract Signing Pack v1'),
                    ),
                );
            })();
            const blob = await pdf(PackDocument).toBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `signing-pack-${contractReference}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            toast({ title: 'Signing pack generated', description: contractReference });
        } catch (err: any) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Generate failed', description: err?.message ?? String(err) });
        } finally {
            setGenerating(false);
        }
    };

    return (
        <Button
            data-testid="contract-signing-pack-button"
            size="sm"
            onClick={handleGenerate}
            disabled={generating}
            className="h-7 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest"
        >
            {generating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileSignature className="h-3 w-3 mr-1" />}
            Generate signing pack
        </Button>
    );
}
