'use client';

/**
 * MarginThresholdCard (v1.22 — Story 2.7.1).
 *
 * Admin UI for the margin threshold the v1.19/2.2.1 finalize gate reads.
 * Before this card, `organisation.marginThresholdPct` could only be set by
 * editing Firestore by hand. Now an org admin sets it here.
 *
 * Persists `organisation.marginThresholdPct` (number, default 15).
 */

import { useEffect, useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Percent } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_MARGIN_THRESHOLD_PCT } from '@/lib/catalog/margin-gate';

export function MarginThresholdCard({ organisationId, organisation }: { organisationId: string; organisation: any }) {
    const firestore = useFirestore();
    const { toast } = useToast();
    const [value, setValue] = useState<string>('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const v = organisation?.marginThresholdPct;
        setValue(v != null ? String(v) : String(DEFAULT_MARGIN_THRESHOLD_PCT));
    }, [organisation?.marginThresholdPct]);

    const handleSave = async () => {
        const pct = parseFloat(value);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
            toast({ variant: 'destructive', title: 'Invalid threshold', description: 'Enter a percentage between 0 and 100.' });
            return;
        }
        setSaving(true);
        try {
            await updateDoc(doc(firestore, 'organisations', organisationId), {
                marginThresholdPct: pct,
                updatedAt: serverTimestamp(),
            });
            toast({ title: 'Margin threshold saved', description: `Quotes below ${pct}% now require a GM override to finalize.` });
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Save failed', description: err?.message ?? String(err) });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="rounded-2xl border-2" data-testid="margin-threshold-card">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                    <Percent className="h-4 w-4" /> Margin threshold
                </CardTitle>
                <CardDescription className="text-xs">
                    Quotes finalizing below this gross-margin % require a GM override (anyone with the
                    "Override margin threshold" permission). Default {DEFAULT_MARGIN_THRESHOLD_PCT}%.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="max-w-[200px]">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Threshold %</Label>
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            step="0.5"
                            min="0"
                            max="100"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            data-testid="margin-threshold-input"
                        />
                        <span className="text-sm font-bold text-muted-foreground">%</span>
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                <Button onClick={handleSave} disabled={saving} data-testid="margin-threshold-save">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                    Save threshold
                </Button>
            </CardFooter>
        </Card>
    );
}
