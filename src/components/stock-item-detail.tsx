'use client';

import React, { useRef, useState } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Plus, FileText, Download, X, Loader2, Image as ImageIcon, Lock, AlertTriangle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFirestore, useStorage } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';
import { pdf } from '@react-pdf/renderer';
import { ProposalPDFDocument } from '@/components/proposal-pdf';
import { buildQuoteFinancials } from '@/lib/quote-financials';
import { toast } from '@/hooks/use-toast';

interface InventoryItem {
  id: string;
  name: string;
  stockNumber: string;
  label: string;
  organisationId: string;
  moduleId: string;
  status: string;
  location: string;
  soldBy: string;
  model: string;
  colour: string;
  serialNumber: string;
  material: string;
  notes: string;
  dateIntoStock: any;
  photoUrls: string[];
  pdfAttachments: { name: string; url: string; uploadedAt: any }[];
  coverImageUrl?: string;   // From matched model
  variantImageUrl?: string; // From matched variant
  isFromQuote?: boolean;
  isLocked?: boolean;
  quotePayload?: any;        // Full nested quote config
  proposalPdfUrl?: string;   // Stored PDF URL
  quoteId?: string;
}

interface StockItemDetailProps {
  item: InventoryItem | null;
  onClose: () => void;
  readOnly?: boolean;
}

function formatDate(timestamp: any): string {
  if (!timestamp) return '-';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function daysInStock(timestamp: any): number {
  if (!timestamp) return 0;
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function statusBadgeClass(status: string): string {
  const s = status?.toLowerCase();
  if (s === 'in stock') return 'bg-green-100 text-green-800 border-green-200';
  if (s === 'on order') return 'bg-blue-100 text-blue-800 border-blue-200';
  return 'bg-slate-100 text-slate-800 border-slate-200';
}

function materialBadgeClass(material: string): string {
  const m = material?.toUpperCase();
  if (m === 'PVC') return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-slate-100 text-slate-800 border-slate-200';
}

function MiniProposalView({ quote }: { quote: any }) {
    if (!quote) return null;
    return (
        <div className="space-y-4">
            <div>
                <p className="text-[9px] uppercase tracking-widest font-black text-primary mb-1">{quote.vendorName} · {quote.rangeName}</p>
                <h3 className="text-lg font-black uppercase tracking-tight">{quote.modelName}</h3>
            </div>
            {quote.coverImageUrl && (
                <div className="rounded-xl border-2 overflow-hidden">
                    <img src={quote.coverImageUrl} alt="" className="w-full h-32 object-contain bg-slate-50 p-2" />
                </div>
            )}
            {quote.variant && (
                <div className="border-2 rounded-xl p-3 space-y-1">
                    <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Variant</p>
                    <p className="text-xs font-bold">{quote.variant.name || quote.variant.sku}</p>
                    {quote.variant.imageUrl && <img src={quote.variant.imageUrl} alt="" className="w-full h-20 object-contain bg-slate-50 rounded-lg mt-1" />}
                    <p className="text-xs font-bold text-primary">${(quote.variant.sellPriceExclGst || 0).toLocaleString()}</p>
                </div>
            )}
            {quote.selectedOptions?.length > 0 && (
                <div className="border-2 rounded-xl p-3 space-y-1">
                    <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Factory Options</p>
                    {quote.selectedOptions.map((opt: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 py-1 border-b border-slate-100 last:border-0">
                            {opt.imageUrl && <img src={opt.imageUrl} alt="" className="w-6 h-6 object-contain rounded" />}
                            <span className="text-xs flex-1 truncate">{opt.name}</span>
                            <span className="text-xs font-mono">${(opt.sellPriceExclGst || 0).toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            )}
            {quote.motor && (
                <div className="border-2 rounded-xl p-3 space-y-1">
                    <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Motor</p>
                    {quote.motor.imageUrl && <img src={quote.motor.imageUrl} alt="" className="w-full h-16 object-contain" />}
                    <p className="text-xs font-bold">{quote.motor.name}</p>
                    <p className="text-xs font-bold text-primary">${(quote.motor.sellPriceExclGst || 0).toLocaleString()}</p>
                </div>
            )}
            {quote.trailer && (
                <div className="border-2 rounded-xl p-3 space-y-1">
                    <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Trailer</p>
                    <p className="text-xs font-bold">{quote.trailer.name}</p>
                    <p className="text-xs font-bold text-primary">${(quote.trailer.sellPriceExclGst || 0).toLocaleString()}</p>
                </div>
            )}
            <div className="border-2 rounded-xl p-3 bg-primary/5 border-primary/20">
                <div className="flex justify-between text-sm font-black">
                    <span>Total</span>
                    <span className="text-primary">${(quote.totalPriceExclGst || 0).toLocaleString()}</span>
                </div>
            </div>
        </div>
    );
}

export function StockItemDetail({ item, onClose, readOnly = false }: StockItemDetailProps) {
  const firestore = useFirestore();
  const storage = useStorage();

  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);
  const [regeneratingPdf, setRegeneratingPdf] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const photos = item?.photoUrls ?? [];
  const pdfs = item?.pdfAttachments ?? [];

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || !item) return;
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploadingPhotos(true);
    try {
      for (const file of files) {
        const path = `inventory/${item.id}/photos/${Date.now()}-${file.name}`;
        const url = await uploadFileToStorage(storage, file, path);
        await updateDoc(doc(firestore, 'inventory', item.id), {
          photoUrls: arrayUnion(url),
        });
      }
      toast({ title: 'Photos uploaded', description: `${files.length} photo(s) added.` });
    } catch (error) {
      console.error('Photo upload failed:', error);
      toast({ title: 'Upload failed', description: 'Could not upload photos.', variant: 'destructive' });
    } finally {
      setUploadingPhotos(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }

  async function handleRemovePhoto(url: string) {
    if (!item) return;
    try {
      await updateDoc(doc(firestore, 'inventory', item.id), {
        photoUrls: arrayRemove(url),
      });
      toast({ title: 'Photo removed' });
    } catch (error) {
      console.error('Remove photo failed:', error);
      toast({ title: 'Remove failed', description: 'Could not remove photo.', variant: 'destructive' });
    }
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || !item) return;
    const file = e.target.files[0];
    if (!file) return;

    setUploadingPdf(true);
    try {
      const path = `inventory/${item.id}/pdfs/${Date.now()}-${file.name}`;
      const url = await uploadFileToStorage(storage, file, path);
      await updateDoc(doc(firestore, 'inventory', item.id), {
        pdfAttachments: arrayUnion({ name: file.name, url, uploadedAt: new Date().toISOString() }),
      });
      toast({ title: 'PDF attached', description: file.name });
    } catch (error) {
      console.error('PDF upload failed:', error);
      toast({ title: 'Upload failed', description: 'Could not upload PDF.', variant: 'destructive' });
    } finally {
      setUploadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  }

  async function handleRemovePdf(pdfEntry: { name: string; url: string; uploadedAt: any }) {
    if (!item) return;
    try {
      await updateDoc(doc(firestore, 'inventory', item.id), {
        pdfAttachments: arrayRemove(pdfEntry),
      });
      toast({ title: 'PDF removed' });
    } catch (error) {
      console.error('Remove PDF failed:', error);
      toast({ title: 'Remove failed', description: 'Could not remove PDF.', variant: 'destructive' });
    }
  }

  async function handleRegeneratePdf() {
    if (!item || !item.quotePayload) return;
    setRegeneratingPdf(true);
    try {
      const financials = buildQuoteFinancials(item.quotePayload, item.quotePayload.discountExclGst || 0);
      const pdfBlob = await pdf(
        <ProposalPDFDocument quote={item.quotePayload} organisation={null} financials={financials} />
      ).toBlob();
      if (!pdfBlob || pdfBlob.size === 0) {
        throw new Error('PDF generation returned an empty blob');
      }
      const pdfFile = new File(
        [pdfBlob],
        `${item.stockNumber}-proposal.pdf`,
        { type: 'application/pdf' }
      );
      const pdfUrl = await uploadFileToStorage(
        storage,
        pdfFile,
        `inventory/${item.id}/proposal-${item.stockNumber}.pdf`
      );
      if (!pdfUrl || typeof pdfUrl !== 'string') {
        throw new Error('PDF upload returned an invalid URL');
      }
      await updateDoc(doc(firestore, 'inventory', item.id), {
        proposalPdfUrl: pdfUrl,
      });
      toast({ title: 'PDF Generated', description: 'Proposal PDF has been created and attached.' });
    } catch (error) {
      console.error('Failed to regenerate proposal PDF:', error);
      toast({
        variant: 'destructive',
        title: 'PDF Generation Failed',
        description: 'Could not generate the proposal PDF. Please try again.',
      });
    } finally {
      setRegeneratingPdf(false);
    }
  }

  const detailFields: { label: string; value: string }[] = item
    ? [
        { label: 'Model', value: item.model || '-' },
        { label: 'Colour', value: item.colour || '-' },
        { label: 'Serial Number', value: item.serialNumber || '-' },
        { label: 'Material', value: item.material || '-' },
        { label: 'Location', value: item.location || '-' },
        { label: 'Status', value: item.status || '-' },
        { label: 'Sold By', value: item.soldBy || '-' },
        { label: 'Date into Stock', value: formatDate(item.dateIntoStock) },
        { label: 'Days in Stock', value: String(daysInStock(item.dateIntoStock)) },
      ]
    : [];

  return (
    <>
      <Sheet open={item !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent side="right" className={`overflow-y-auto ${item?.isFromQuote ? 'w-[900px] sm:max-w-4xl' : 'w-[480px] sm:max-w-lg'}`}>
          {item && (
            <>
              <SheetHeader className="pb-4">
                <SheetTitle className="text-xl font-bold">{item.name}</SheetTitle>
                <SheetDescription className="sr-only">Stock item details for {item.name}</SheetDescription>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge variant="outline" className="font-mono text-xs border-2">
                    {item.stockNumber}
                  </Badge>
                  <Badge variant="outline" className={`border-2 ${statusBadgeClass(item.status)}`}>
                    {item.status}
                  </Badge>
                  <Badge variant="outline" className={`border-2 ${materialBadgeClass(item.material)}`}>
                    {item.material}
                  </Badge>
                </div>
              </SheetHeader>

              {item.isFromQuote ? (
                <div className="flex gap-4 h-full mt-4">
                  {/* Left column: photos, details, PDFs */}
                  <div className="w-1/2 overflow-y-auto pr-3 border-r">
                    {/* Photo Gallery */}
                    <div>
                      <p className="text-[9px] uppercase tracking-widest font-black text-slate-400 mb-2">Photos</p>
                      {photos.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2 relative">
                          {uploadingPhotos && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 rounded-xl">
                              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                            </div>
                          )}
                          {photos.map((url, i) => (
                            <div
                              key={i}
                              className="aspect-square rounded-xl border-2 overflow-hidden relative group cursor-pointer"
                              onClick={() => setEnlargedPhoto(url)}
                            >
                              <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                              {!readOnly && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRemovePhoto(url); }}
                                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          {!readOnly && (
                            <button
                              onClick={() => photoInputRef.current?.click()}
                              className="aspect-square rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors"
                            >
                              <Plus className="h-5 w-5" />
                              <span className="text-[10px] font-semibold">Add Photos</span>
                            </button>
                          )}
                        </div>
                      ) : (item?.coverImageUrl || item?.variantImageUrl) ? (
                        <div className="space-y-2">
                          <div className="relative aspect-video rounded-xl border-2 overflow-hidden bg-slate-50">
                            <img
                              src={item.variantImageUrl || item.coverImageUrl}
                              alt={item.model || item.name}
                              className="w-full h-full object-contain p-2"
                            />
                            <Badge variant="outline" className="absolute top-2 left-2 text-[8px] font-black uppercase bg-white/90 border-slate-200">
                              From Catalog
                            </Badge>
                          </div>
                          {!readOnly && (
                            <button
                              onClick={() => photoInputRef.current?.click()}
                              className="w-full rounded-xl border-2 border-dashed border-slate-300 px-3 py-2 flex items-center justify-center gap-1 text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors"
                            >
                              <Plus className="h-4 w-4" />
                              <span className="text-[10px] font-semibold">Add Photos</span>
                            </button>
                          )}
                        </div>
                      ) : readOnly ? (
                        <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
                          No photos yet
                        </div>
                      ) : (
                        <button
                          onClick={() => photoInputRef.current?.click()}
                          className="w-full rounded-xl border-2 border-dashed border-slate-300 p-8 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors"
                        >
                          <ImageIcon className="h-6 w-6" />
                          <span className="text-[10px] font-semibold">No photos yet — click to add</span>
                        </button>
                      )}
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handlePhotoUpload}
                      />
                    </div>

                    {/* Item Details */}
                    <div className="mt-6">
                      <p className="text-[9px] uppercase tracking-widest font-black text-slate-400 mb-2">Details</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        {detailFields.map((field) => (
                          <div key={field.label}>
                            <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">{field.label}</p>
                            <p className="text-xs font-semibold">{field.value}</p>
                          </div>
                        ))}
                      </div>
                      {item.notes && (
                        <div className="mt-3">
                          <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Notes</p>
                          <p className="text-xs font-semibold whitespace-pre-wrap">{item.notes}</p>
                        </div>
                      )}
                    </div>

                    {/* PDF Attachments */}
                    <div className="mt-6 pb-6">
                      <p className="text-[9px] uppercase tracking-widest font-black text-slate-400 mb-2">PDF Attachments</p>
                      {pdfs.length === 0 && (
                        <p className="text-xs text-slate-400">No PDFs attached</p>
                      )}
                      <div className="flex flex-col gap-2">
                        {pdfs.map((pdf, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 border-2 group"
                          >
                            <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            <span className="text-xs font-semibold truncate flex-1">{pdf.name}</span>
                            <a
                              href={pdf.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline flex items-center gap-1 flex-shrink-0"
                            >
                              <Download className="h-3 w-3" />
                              Download
                            </a>
                            {!readOnly && (
                              <button
                                onClick={() => handleRemovePdf(pdf)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 flex-shrink-0"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {!readOnly && (
                        <button
                          onClick={() => pdfInputRef.current?.click()}
                          disabled={uploadingPdf}
                          className="mt-2 flex items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-3 py-2 text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors text-xs font-semibold disabled:opacity-50"
                        >
                          {uploadingPdf ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          Attach PDF
                        </button>
                      )}
                      <input
                        ref={pdfInputRef}
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={handlePdfUpload}
                      />
                    </div>

                    {/* Proposal Actions */}
                    {(item.isFromQuote || item.proposalPdfUrl || item.quoteId) && (
                      <div className="mt-4 pb-6 flex flex-wrap gap-2">
                        {item.proposalPdfUrl && typeof item.proposalPdfUrl === 'string' && item.proposalPdfUrl.startsWith('http') ? (
                          <a href={item.proposalPdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-xs font-bold hover:bg-slate-50 transition-colors">
                            <Download className="h-4 w-4" />
                            Download PDF
                          </a>
                        ) : item.isFromQuote && item.quotePayload ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRegeneratePdf}
                            disabled={regeneratingPdf}
                            className="rounded-xl border-2 text-xs font-bold"
                          >
                            {regeneratingPdf ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />
                            )}
                            {regeneratingPdf ? 'Generating...' : 'Generate PDF'}
                          </Button>
                        ) : null}
                        {item.quoteId && item.quotePayload?.createdByUid && (
                          <a href={`/modules/${item.moduleId}/proposals/${item.quoteId}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-xs font-bold hover:bg-primary/5 hover:border-primary/30 transition-colors text-primary">
                            <FileText className="h-4 w-4" />
                            View Proposal
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right column: MiniProposalView + Dealer Audit */}
                  <div className="w-1/2 overflow-y-auto pl-3">
                    <MiniProposalView quote={item.quotePayload} />
                    {item.quotePayload && (
                      <div className="mt-4 border-2 rounded-xl p-3 space-y-2 bg-slate-50">
                        <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Dealer Audit</p>
                        <div className="space-y-1 text-xs">
                          {item.quotePayload.priceLevelUsed && (
                            <div className="flex justify-between"><span className="text-slate-500">Price Level</span><span className="font-bold uppercase">{item.quotePayload.priceLevelUsed.replace('hull_', '').replace(/_/g, ' ')}</span></div>
                          )}
                          {item.quotePayload.quoteNumber && (
                            <div className="flex justify-between"><span className="text-slate-500">Quote #</span><span className="font-bold">{item.quotePayload.quoteNumber}</span></div>
                          )}
                          {item.quotePayload.createdByName && (
                            <div className="flex justify-between"><span className="text-slate-500">Created By</span><span className="font-bold">{item.quotePayload.createdByName}</span></div>
                          )}
                          {item.quotePayload.discountExclGst > 0 && (
                            <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="font-bold text-red-500">-${item.quotePayload.discountExclGst.toLocaleString()}</span></div>
                          )}
                          <div className="border-t pt-1 mt-1 space-y-1">
                            <div className="flex justify-between"><span className="text-slate-500">Total Ex GST</span><span className="font-bold">${(item.quotePayload.totalPriceExclGst || 0).toLocaleString()}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">GST</span><span className="font-bold">${Math.ceil((item.quotePayload.totalPriceExclGst || 0) * 0.1).toLocaleString()}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Total Inc GST</span><span className="font-bold text-primary">${Math.ceil((item.quotePayload.totalPriceExclGst || 0) * 1.1).toLocaleString()}</span></div>
                          </div>
                          {item.quotePayload.motor?.costPrice > 0 && (
                            <div className="border-t pt-1 mt-1 space-y-1">
                              <p className="text-[8px] uppercase tracking-widest font-black text-slate-400">Cost Breakdown</p>
                              {item.quotePayload.variant?.cost > 0 && (
                                <div className="flex justify-between"><span className="text-slate-500">Boat Cost</span><span className="font-bold">${item.quotePayload.variant.cost.toLocaleString()}</span></div>
                              )}
                              <div className="flex justify-between"><span className="text-slate-500">Motor Cost</span><span className="font-bold">${item.quotePayload.motor.costPrice.toLocaleString()}</span></div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Photo Gallery */}
                  <div className="mt-6">
                    <p className="text-[9px] uppercase tracking-widest font-black text-slate-400 mb-2">Photos</p>
                    {photos.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 relative">
                        {uploadingPhotos && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 rounded-xl">
                            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                          </div>
                        )}
                        {photos.map((url, i) => (
                          <div
                            key={i}
                            className="aspect-square rounded-xl border-2 overflow-hidden relative group cursor-pointer"
                            onClick={() => setEnlargedPhoto(url)}
                          >
                            <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                            {!readOnly && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRemovePhoto(url); }}
                                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        {!readOnly && (
                          <button
                            onClick={() => photoInputRef.current?.click()}
                            className="aspect-square rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors"
                          >
                            <Plus className="h-5 w-5" />
                            <span className="text-[10px] font-semibold">Add Photos</span>
                          </button>
                        )}
                      </div>
                    ) : (item?.coverImageUrl || item?.variantImageUrl) ? (
                      <div className="space-y-2">
                        <div className="relative aspect-video rounded-xl border-2 overflow-hidden bg-slate-50">
                          <img
                            src={item.variantImageUrl || item.coverImageUrl}
                            alt={item.model || item.name}
                            className="w-full h-full object-contain p-2"
                          />
                          <Badge variant="outline" className="absolute top-2 left-2 text-[8px] font-black uppercase bg-white/90 border-slate-200">
                            From Catalog
                          </Badge>
                        </div>
                        {!readOnly && (
                          <button
                            onClick={() => photoInputRef.current?.click()}
                            className="w-full rounded-xl border-2 border-dashed border-slate-300 px-3 py-2 flex items-center justify-center gap-1 text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                            <span className="text-[10px] font-semibold">Add Photos</span>
                          </button>
                        )}
                      </div>
                    ) : readOnly ? (
                      <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
                        No photos yet
                      </div>
                    ) : (
                      <button
                        onClick={() => photoInputRef.current?.click()}
                        className="w-full rounded-xl border-2 border-dashed border-slate-300 p-8 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors"
                      >
                        <ImageIcon className="h-6 w-6" />
                        <span className="text-[10px] font-semibold">No photos yet — click to add</span>
                      </button>
                    )}
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                  </div>

                  {/* Item Details */}
                  <div className="mt-6">
                    <p className="text-[9px] uppercase tracking-widest font-black text-slate-400 mb-2">Details</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {detailFields.map((field) => (
                        <div key={field.label}>
                          <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">{field.label}</p>
                          <p className="text-xs font-semibold">{field.value}</p>
                        </div>
                      ))}
                    </div>
                    {item.notes && (
                      <div className="mt-3">
                        <p className="text-[9px] uppercase tracking-widest font-black text-slate-400">Notes</p>
                        <p className="text-xs font-semibold whitespace-pre-wrap">{item.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* PDF Attachments */}
                  <div className="mt-6 pb-6">
                    <p className="text-[9px] uppercase tracking-widest font-black text-slate-400 mb-2">PDF Attachments</p>
                    {pdfs.length === 0 && (
                      <p className="text-xs text-slate-400">No PDFs attached</p>
                    )}
                    <div className="flex flex-col gap-2">
                      {pdfs.map((pdf, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 border-2 group"
                        >
                          <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                          <span className="text-xs font-semibold truncate flex-1">{pdf.name}</span>
                          <a
                            href={pdf.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1 flex-shrink-0"
                          >
                            <Download className="h-3 w-3" />
                            Download
                          </a>
                          {!readOnly && (
                            <button
                              onClick={() => handleRemovePdf(pdf)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 flex-shrink-0"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {!readOnly && (
                      <button
                        onClick={() => pdfInputRef.current?.click()}
                        disabled={uploadingPdf}
                        className="mt-2 flex items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-3 py-2 text-slate-400 hover:border-slate-400 hover:text-slate-500 transition-colors text-xs font-semibold disabled:opacity-50"
                      >
                        {uploadingPdf ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        Attach PDF
                      </button>
                    )}
                    <input
                      ref={pdfInputRef}
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={handlePdfUpload}
                    />
                  </div>

                  {/* Proposal Actions */}
                  {(item.isFromQuote || item.proposalPdfUrl || item.quoteId) && (
                    <div className="mt-4 pb-6 flex flex-wrap gap-2">
                      {item.proposalPdfUrl && typeof item.proposalPdfUrl === 'string' && item.proposalPdfUrl.startsWith('http') ? (
                        <a href={item.proposalPdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-xs font-bold hover:bg-slate-50 transition-colors">
                          <Download className="h-4 w-4" />
                          Download PDF
                        </a>
                      ) : item.isFromQuote && item.quotePayload ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRegeneratePdf}
                          disabled={regeneratingPdf}
                          className="rounded-xl border-2 text-xs font-bold"
                        >
                          {regeneratingPdf ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />
                          )}
                          {regeneratingPdf ? 'Generating...' : 'Generate PDF'}
                        </Button>
                      ) : null}
                      {item.quoteId && item.quotePayload?.createdByUid && (
                        <a href={`/modules/${item.moduleId}/proposals/${item.quoteId}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-xs font-bold hover:bg-primary/5 hover:border-primary/30 transition-colors text-primary">
                          <FileText className="h-4 w-4" />
                          View Proposal
                        </a>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Enlarged Photo Modal */}
      <Dialog open={enlargedPhoto !== null} onOpenChange={(open) => { if (!open) setEnlargedPhoto(null); }}>
        <DialogContent className="max-w-3xl p-2">
          {enlargedPhoto && (
            <img src={enlargedPhoto} alt="Enlarged photo" className="w-full h-auto rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
