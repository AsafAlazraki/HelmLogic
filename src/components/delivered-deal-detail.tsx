'use client';

import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';

interface DeliveredDealDetailProps {
  deal: any | null;
  onClose: () => void;
}

function formatDate(timestamp: any): string {
  if (!timestamp) return '-';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function formatCurrency(value: any): string {
  if (value == null || value === '') return '-';
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(num)) return '-';
  return `$${num.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusBadgeClass(status: string): string {
  const s = status?.toLowerCase();
  if (s === 'delivered') return 'bg-green-100 text-green-800 border-green-200';
  if (s === 'pending delivery') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (s === 'sold') return 'bg-orange-100 text-orange-800 border-orange-200';
  return 'bg-slate-100 text-slate-800 border-slate-200';
}

function materialBadgeClass(material: string): string {
  const m = material?.toUpperCase();
  if (m === 'PVC') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-slate-100 text-slate-800 border-slate-200';
}

function BooleanBadge({ value }: { value: any }) {
  const isYes = value === true || value === 'Yes' || value === 'yes';
  return (
    <Badge
      variant="outline"
      className={`border-2 ${isYes ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-800 border-slate-200'}`}
    >
      {isYes ? 'Yes' : 'No'}
    </Badge>
  );
}

export function DeliveredDealDetail({ deal, onClose }: DeliveredDealDetailProps) {
  const boatFields: { label: string; value: string }[] = deal
    ? [
        { label: 'Model', value: deal.model || '-' },
        { label: 'Colour', value: deal.colour || '-' },
        { label: 'Serial Number', value: deal.serialNumber || '-' },
        { label: 'Material', value: deal.material || '-' },
        { label: 'Location', value: deal.location || '-' },
        { label: 'Sold By', value: deal.soldBy || '-' },
      ]
    : [];

  const dealFields: { label: string; value: string }[] = deal
    ? [
        { label: 'Status', value: deal.status || '-' },
        { label: 'On Consignment With', value: deal.onConsignmentWith || '-' },
        { label: 'P/O or Deal #', value: deal.poOrDealNumber || '-' },
      ]
    : [];

  const motorFields: { label: string; value: string }[] = deal
    ? [
        { label: 'Motor', value: deal.motor || '-' },
        { label: 'Motor S/N', value: deal.motorSerialNumber || '-' },
        { label: 'Trailer', value: deal.trailer || '-' },
      ]
    : [];

  return (
    <Sheet open={deal !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-[480px] sm:max-w-lg overflow-y-auto">
        {deal && (
          <>
            {/* Header */}
            <SheetHeader className="pb-4">
              <SheetTitle className="text-xl font-bold">{deal.name || '-'}</SheetTitle>
              <SheetDescription className="sr-only">Delivered deal details for {deal.name}</SheetDescription>
              <div className="flex flex-wrap gap-2 pt-1">
                {deal.stockNumber && (
                  <Badge variant="outline" className="font-mono text-xs border-2">
                    {deal.stockNumber}
                  </Badge>
                )}
                <Badge variant="outline" className={`border-2 ${statusBadgeClass(deal.status)}`}>
                  {deal.status || '-'}
                </Badge>
                {deal.material && (
                  <Badge variant="outline" className={`border-2 ${materialBadgeClass(deal.material)}`}>
                    {deal.material}
                  </Badge>
                )}
              </div>
            </SheetHeader>

            {/* Boat Details */}
            <div className="mt-6">
              <p className="text-[9px] uppercase tracking-widest font-black text-slate-400 mb-2">Boat Details</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {boatFields.map((field) => (
                  <div key={field.label}>
                    <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">{field.label}</p>
                    <p className="text-xs font-semibold">{field.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Deal Details */}
            <div className="mt-6">
              <p className="text-[9px] uppercase tracking-widest font-black text-slate-400 mb-2">Deal Details</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {dealFields.map((field) => (
                  <div key={field.label}>
                    <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">{field.label}</p>
                    <p className="text-xs font-semibold">{field.value}</p>
                  </div>
                ))}
              </div>
              {deal.customerName && (
                <div className="mt-3">
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Customer Name</p>
                  <p className="text-xs font-semibold whitespace-pre-wrap">{deal.customerName}</p>
                </div>
              )}
              {deal.notes && (
                <div className="mt-3">
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Notes</p>
                  <p className="text-xs font-semibold whitespace-pre-wrap">{deal.notes}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-3">
                <div>
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Delivery Date</p>
                  <p className="text-xs font-semibold">{formatDate(deal.deliveryDate)}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">ETA / Sold Date</p>
                  <p className="text-xs font-semibold">{formatDate(deal.etaOrSoldDate)}</p>
                </div>
              </div>
            </div>

            {/* Motor & Trailer */}
            <div className="mt-6">
              <p className="text-[9px] uppercase tracking-widest font-black text-slate-400 mb-2">Motor & Trailer</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {motorFields.map((field) => (
                  <div key={field.label}>
                    <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">{field.label}</p>
                    <p className="text-xs font-semibold">{field.value}</p>
                  </div>
                ))}
              </div>
              {deal.packageDetails && (
                <div className="mt-3">
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Package Details</p>
                  <p className="text-xs font-semibold whitespace-pre-wrap">{deal.packageDetails}</p>
                </div>
              )}
            </div>

            {/* Financial */}
            <div className="mt-6 pb-6">
              <p className="text-[9px] uppercase tracking-widest font-black text-slate-400 mb-2">Financial</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Invoiced Amount</p>
                  <p className="text-xs font-semibold">{formatCurrency(deal.invoicedAmount)}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Invoiced</p>
                  <BooleanBadge value={deal.invoiced} />
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Deposit Paid</p>
                  <BooleanBadge value={deal.depositPaid} />
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Paid in Full</p>
                  <BooleanBadge value={deal.paidInFull} />
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Is Hull Only</p>
                  <BooleanBadge value={deal.isHullOnly} />
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Warranty Registered</p>
                  <BooleanBadge value={deal.warrantyRegistered} />
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
