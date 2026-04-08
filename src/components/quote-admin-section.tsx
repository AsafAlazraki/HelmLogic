'use client';

import { useState, useEffect, useCallback } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Car,
  Shield,
  Landmark,
  Truck,
} from 'lucide-react';


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuoteAdminData {
  tradeIn: {
    hasTradeIn: boolean;
    vehicleDescription: string;
    estimatedValue: number;
    notes: string;
  };
  insurance: {
    wantsInsuranceQuote: boolean;
    notes: string;
  };
  finance: {
    wantsFinanceQuote: boolean;
    notes: string;
  };
  delivery: {
    preferredDate: string;
    productSlot: string;
    notes: string;
  };
}

export interface QuoteAdminSectionProps {
  quoteId?: string;
  organisationId: string;
  onUpdate?: (data: QuoteAdminData) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuoteAdminSection({
  quoteId,
  organisationId,
  onUpdate,
}: QuoteAdminSectionProps) {
  // -- Trade-In state -------------------------------------------------------
  const [hasTradeIn, setHasTradeIn] = useState(false);
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [estimatedValue, setEstimatedValue] = useState<number>(0);
  const [tradeInNotes, setTradeInNotes] = useState('');

  // -- Insurance state ------------------------------------------------------
  const [wantsInsuranceQuote, setWantsInsuranceQuote] = useState(false);
  const [insuranceNotes, setInsuranceNotes] = useState('');

  // -- Finance state --------------------------------------------------------
  const [wantsFinanceQuote, setWantsFinanceQuote] = useState(false);
  const [financeNotes, setFinanceNotes] = useState('');

  // -- Delivery state -------------------------------------------------------
  const [preferredDate, setPreferredDate] = useState('');
  const [productSlot, setProductSlot] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // -- Push updates ---------------------------------------------------------
  const buildData = useCallback((): QuoteAdminData => ({
    tradeIn: {
      hasTradeIn,
      vehicleDescription,
      estimatedValue,
      notes: tradeInNotes,
    },
    insurance: {
      wantsInsuranceQuote,
      notes: insuranceNotes,
    },
    finance: {
      wantsFinanceQuote,
      notes: financeNotes,
    },
    delivery: {
      preferredDate,
      productSlot,
      notes: deliveryNotes,
    },
  }), [
    hasTradeIn, vehicleDescription, estimatedValue, tradeInNotes,
    wantsInsuranceQuote, insuranceNotes,
    wantsFinanceQuote, financeNotes,
    preferredDate, productSlot, deliveryNotes,
  ]);

  useEffect(() => {
    onUpdate?.(buildData());
  }, [buildData, onUpdate]);

  // -- Render ---------------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* Section header */}
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        Deal Administration
      </p>

      {/* ── Trade In ─────────────────────────────────────────────── */}
      <div className="border-2 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-orange-50 flex items-center justify-center text-orange-500">
            <Car className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center gap-2 flex-1">
            <Checkbox
              id="trade-in-toggle"
              checked={hasTradeIn}
              onCheckedChange={(v) => setHasTradeIn(v === true)}
              className="rounded border-2"
            />
            <Label htmlFor="trade-in-toggle" className="text-xs font-bold cursor-pointer select-none">
              I have a trade-in vehicle
            </Label>
          </div>
        </div>

        {hasTradeIn && (
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Vehicle Description
              </Label>
              <Input
                value={vehicleDescription}
                onChange={(e) => setVehicleDescription(e.target.value)}
                placeholder="e.g. 2019 Quintrex 530 Renegade"
                className="rounded-xl border-2 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Estimated Value
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <Input
                  type="number"
                  min={0}
                  value={estimatedValue || ''}
                  onChange={(e) => setEstimatedValue(Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className="rounded-xl border-2 text-xs pl-7"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Notes
              </Label>
              <Textarea
                value={tradeInNotes}
                onChange={(e) => setTradeInNotes(e.target.value)}
                placeholder="Condition, service history, accessories included..."
                className="rounded-xl border-2 text-xs min-h-[60px]"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Insurance ────────────────────────────────────────────── */}
      <div className="border-2 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500">
            <Shield className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center gap-2 flex-1">
            <Checkbox
              id="insurance-toggle"
              checked={wantsInsuranceQuote}
              onCheckedChange={(v) => setWantsInsuranceQuote(v === true)}
              className="rounded border-2"
            />
            <Label htmlFor="insurance-toggle" className="text-xs font-bold cursor-pointer select-none">
              I would like an Insurance Quote
            </Label>
          </div>
        </div>

        {wantsInsuranceQuote && (
          <div className="space-y-1 pt-1">
            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              Notes
            </Label>
            <Textarea
              value={insuranceNotes}
              onChange={(e) => setInsuranceNotes(e.target.value)}
              placeholder="Coverage preferences, existing policies..."
              className="rounded-xl border-2 text-xs min-h-[60px]"
            />
          </div>
        )}
      </div>

      {/* ── Finance ──────────────────────────────────────────────── */}
      <div className="border-2 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-500">
            <Landmark className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center gap-2 flex-1">
            <Checkbox
              id="finance-toggle"
              checked={wantsFinanceQuote}
              onCheckedChange={(v) => setWantsFinanceQuote(v === true)}
              className="rounded border-2"
            />
            <Label htmlFor="finance-toggle" className="text-xs font-bold cursor-pointer select-none">
              I would like a Finance Quote
            </Label>
          </div>
        </div>

        {wantsFinanceQuote && (
          <div className="space-y-1 pt-1">
            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              Notes
            </Label>
            <Textarea
              value={financeNotes}
              onChange={(e) => setFinanceNotes(e.target.value)}
              placeholder="Budget range, deposit amount, preferred terms..."
              className="rounded-xl border-2 text-xs min-h-[60px]"
            />
          </div>
        )}
      </div>

      {/* ── Delivery ─────────────────────────────────────────────── */}
      <div className="border-2 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-violet-50 flex items-center justify-center text-violet-500">
            <Truck className="h-3.5 w-3.5" />
          </div>
          <p className="text-xs font-bold">Delivery</p>
        </div>

        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              Preferred Delivery Date
            </Label>
            <Input
              type="date"
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              className="rounded-xl border-2 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              Product Slot
            </Label>
            <Input
              value={productSlot}
              onChange={(e) => setProductSlot(e.target.value)}
              placeholder="Available production/delivery slot"
              className="rounded-xl border-2 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
              Notes
            </Label>
            <Textarea
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder="Delivery address, pickup preferences..."
              className="rounded-xl border-2 text-xs min-h-[60px]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
