'use client';

import React, { useRef, useState } from 'react';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Plus, FileText, Download, X, Loader2, Image as ImageIcon, Lock } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useFirestore, useStorage } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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

export function StockItemDetail({ item, onClose, readOnly = false }: StockItemDetailProps) {
  const firestore = useFirestore();
  const storage = useStorage();

  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);

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
        <SheetContent side="right" className={cn(
          "overflow-y-auto",
          item?.isFromQuote ? "w-[900px] sm:max-w-4xl" : "w-[480px] sm:max-w-lg"
        )}>
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
                <div className="flex gap-6 h-full">
                  {/* Left — existing detail content */}
                  <div className="w-1/2 overflow-y-auto pr-3 border-r">
                    <DetailContent
                      item={item}
                      photos={photos}
                      pdfs={pdfs}
                      readOnly={readOnly}
                      uploadingPhotos={uploadingPhotos}
                      uploadingPdf={uploadingPdf}
                      photoInputRef={photoInputRef}
                      pdfInputRef={pdfInputRef}
                      onEnlargePhoto={setEnlargedPhoto}
                      onRemovePhoto={handleRemovePhoto}
                      onRemovePdf={handleRemovePdf}
                      onPhotoUpload={handlePhotoUpload}
                      onPdfUpload={handlePdfUpload}
                      detailFields={detailFields}
                    />
                  </div>

                  {/* Right — Mini Proposal View */}
                  <div className="w-1/2 overflow-y-auto pl-3">
                    <MiniProposalView quote={item.quotePayload} />
                  </div>
                </div>
              ) : (
                <DetailContent
                  item={item}
                  photos={photos}
                  pdfs={pdfs}
                  readOnly={readOnly}
                  uploadingPhotos={uploadingPhotos}
                  uploadingPdf={uploadingPdf}
                  photoInputRef={photoInputRef}
                  pdfInputRef={pdfInputRef}
                  onEnlargePhoto={setEnlargedPhoto}
                  onRemovePhoto={handleRemovePhoto}
                  onRemovePdf={handleRemovePdf}
                  onPhotoUpload={handlePhotoUpload}
                  onPdfUpload={handlePdfUpload}
                  detailFields={detailFields}
                />
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
