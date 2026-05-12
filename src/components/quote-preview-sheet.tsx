'use client';

/**
 * Quote Preview Sheet (v1.9 — story 1.8.4).
 *
 * Inline customer-PDF preview from the Proposal toolbar. The operator
 * clicks "Preview", a side Sheet opens, renderQuotePdf() runs against
 * the actual quote (same pipeline as Download / Send), and the
 * resulting Blob is displayed in an <iframe> using the browser's
 * native PDF viewer chrome (zoom, page nav, search).
 *
 * Same source-of-truth as Download — there's no separate "preview
 * pipeline" that could drift from production output. Once the blob is
 * in memory, a Download button reuses it directly so the operator
 * doesn't pay for a second render.
 *
 * Why iframe (not @react-pdf's PDFViewer)?
 *   - renderQuotePdf already returns a Blob; iframe + objectURL is
 *     trivial.
 *   - Browser PDF chrome gives operators familiar controls
 *     (zoom / pages / find) that PDFViewer's minimal chrome lacks.
 *   - Avoids re-running the @react-pdf renderer here while
 *     renderQuotePdf already ran it — single render per preview.
 */

import { useEffect, useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase/provider';
import { Download, Eye, Loader2, X } from 'lucide-react';

interface QuotePreviewSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    quote: any;
    organisation: any;
    financials: any;
}

export function QuotePreviewSheet({ open, onOpenChange, quote, organisation, financials }: QuotePreviewSheetProps) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [isRendering, setIsRendering] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Render on open. Revoke the objectURL on close / unmount / re-render
    // so we don't leak blobs across multiple opens.
    useEffect(() => {
        if (!open) return;
        if (!quote || !financials) return;

        let cancelled = false;
        let createdUrl: string | null = null;

        (async () => {
            setIsRendering(true);
            setError(null);
            try {
                const { renderQuotePdf } = await import('@/lib/render-quote-pdf');
                const { blob } = await renderQuotePdf({ firestore, quote, organisation, financials });
                if (cancelled) return;
                createdUrl = URL.createObjectURL(blob);
                setBlobUrl(createdUrl);
            } catch (err: any) {
                if (cancelled) return;
                console.error('[QuotePreviewSheet] render failed', err);
                setError(err?.message ?? 'PDF preview failed.');
                toast({
                    variant: 'destructive',
                    title: 'Preview failed',
                    description: 'Could not generate the PDF preview. See console for details.',
                });
            } finally {
                if (!cancelled) setIsRendering(false);
            }
        })();

        return () => {
            cancelled = true;
            if (createdUrl) URL.revokeObjectURL(createdUrl);
            setBlobUrl(null);
        };
    }, [open, quote, organisation, financials, firestore, toast]);

    const handleDownload = () => {
        if (!blobUrl) return;
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `Quote-${quote?.quoteNumber ?? 'preview'}-${quote?.modelName ?? 'Proposal'}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-[min(95vw,1100px)] p-0 flex flex-col gap-0"
            >
                {/* Header strip — title + Download + Close. Mirrors the
                    dark-banded header treatment used on other detail sheets
                    in this app (e.g. version-history drawer). */}
                <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-900 text-white">
                    <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 text-slate-300" />
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Quote preview</p>
                            <p className="text-xs font-semibold">
                                {quote?.quoteNumber ? `${quote.quoteNumber} · ` : ''}{quote?.modelName ?? 'Proposal'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleDownload}
                            disabled={!blobUrl || isRendering}
                            className="h-8 px-3 rounded-lg font-black uppercase tracking-widest text-[9px] border-slate-700 bg-slate-800 hover:bg-slate-700 text-white gap-1.5"
                        >
                            <Download className="h-3.5 w-3.5" />
                            Download
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            className="h-8 w-8 p-0 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white"
                            aria-label="Close preview"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Body — iframe (or loading / error). Fills available space
                    inside the flex-col SheetContent. */}
                <div className="flex-1 min-h-0 bg-slate-100">
                    {isRendering && (
                        <div className="h-full flex items-center justify-center text-slate-500 gap-2">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-xs font-semibold uppercase tracking-widest">Rendering preview…</span>
                        </div>
                    )}
                    {!isRendering && error && (
                        <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
                            <p className="text-xs font-black uppercase tracking-widest text-rose-700">Preview failed</p>
                            <p className="text-xs text-slate-500 max-w-md">{error}</p>
                        </div>
                    )}
                    {!isRendering && !error && blobUrl && (
                        <iframe
                            src={blobUrl}
                            title="Quote PDF preview"
                            className="w-full h-full border-0"
                        />
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
