'use client';

import { useParams } from 'next/navigation';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { Loader2, PlusCircle } from 'lucide-react';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { useMemo, useState } from 'react';
import { useFirestore } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { collection, doc, setDoc, query, where } from 'firebase/firestore';
import { createSlug } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface Range {
    id: string;
    name: string;
    slug?: string;
}

interface Vendor {
    id: string;
    name: string;
    slug?: string;
}

interface Model {
    id: string;
    name: string;
    slug?: string;
}

export default function RangeDetailsPage() {
  const params = useParams();
  const firestore = useFirestore();
  const { toast } = useToast();

  const vendorSlugOrId = params.id as string;
  const rangeSlugOrId = params.rangeId as string;

  const [newModelName, setNewModelName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Fetch Vendor
  const vendorQueryBySlug = useMemo(() => {
    if (!vendorSlugOrId) return null;
    return query(collection(firestore, 'data-warehouse'), where('slug', '==', vendorSlugOrId));
  }, [firestore, vendorSlugOrId]);
  
  const { data: vendorsBySlug, loading: vendorSlugLoading } = useCollection<Vendor>(vendorQueryBySlug);
  const { data: vendorById, loading: vendorIdLoading } = useDoc<Vendor>(vendorSlugOrId ? `/data-warehouse/${vendorSlugOrId}`: null);
  const vendor = useMemo(() => vendorsBySlug?.[0] || vendorById, [vendorsBySlug, vendorById]);
  const vendorLoading = vendorSlugLoading || vendorIdLoading;

  // Fetch Range
  const rangeQueryBySlug = useMemo(() => {
    if (!vendor?.id || !rangeSlugOrId) return null;
    return query(collection(firestore, `data-warehouse/${vendor.id}/ranges`), where('slug', '==', rangeSlugOrId));
  }, [firestore, vendor, rangeSlugOrId]);

  const { data: rangesBySlug, loading: rangeSlugLoading } = useCollection<Range>(rangeQueryBySlug);
  const { data: rangeById, loading: rangeIdLoading } = useDoc<Range>(vendor?.id && rangeSlugOrId ? `/data-warehouse/${vendor.id}/ranges/${rangeSlugOrId}` : null);
  const range = useMemo(() => rangesBySlug?.[0] || rangeById, [rangesBySlug, rangeById]);
  const rangeLoading = rangeSlugLoading || rangeIdLoading;


  const { data: models, loading: modelsLoading } = useCollection<Model>(vendor?.id && range?.id ? `/data-warehouse/${vendor.id}/ranges/${range.id}/models` : null);
  
  const loading = vendorLoading || rangeLoading;

  const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
    if (!vendor || !range) return [];
    return [
      { href: "/admin", label: "Admin" },
      { href: "/data-warehouse", label: "Data Warehouse" },
      { href: `/data-warehouse/${vendor.slug || vendor.id}`, label: vendor.name },
      { href: `/data-warehouse/${vendor.slug || vendor.id}/ranges/${range.slug || range.id}`, label: range.name },
    ];
  }, [vendor, range]);

  const handleAddModel = async () => {
      if (!newModelName.trim() || !range || !vendor?.id) return;
      setIsAdding(true);
      try {
          const modelsCollection = collection(firestore, `data-warehouse/${vendor.id}/ranges/${range.id}/models`);
          const newModelRef = doc(modelsCollection);
          await setDoc(newModelRef, {
              name: newModelName,
              slug: createSlug(newModelName),
              rangeId: range.id,
              vendorId: vendor.id,
          });
          setNewModelName('');
          toast({ title: 'Model Added', description: `${newModelName} was added to the ${range.name} range.` });
      } catch (error) {
          console.error('Error adding model:', error);
          toast({ variant: 'destructive', title: 'Error', description: 'Could not add model.' });
      } finally {
          setIsAdding(false);
      }
  };

  if (loading) {
      return (
        <div className="flex h-[400px] w-full items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
      );
  }

  if (!vendor || !range) {
      return (
          <Card>
              <CardHeader>
                  <CardTitle>Not Found</CardTitle>
              </CardHeader>
              <CardContent>
                  <p>The requested vendor or range could not be found.</p>
              </CardContent>
          </Card>
      );
  }

  return (
    <div className="space-y-4">
        <div>
            <h1 className="text-2xl font-semibold">{vendor.name} - {range.name}</h1>
            <BreadcrumbNav parts={breadcrumbParts} />
        </div>
        <Card>
            <CardHeader>
                <CardTitle>Models in {range.name}</CardTitle>
                <CardDescription>Manage the models available in this product range.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-2 mb-6">
                    <Input 
                        placeholder="New model name (e.g., Sport 300)"
                        value={newModelName}
                        onChange={(e) => setNewModelName(e.target.value)}
                        disabled={isAdding}
                    />
                    <Button onClick={handleAddModel} disabled={isAdding || !newModelName.trim()}>
                        {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <PlusCircle className="mr-2 h-4 w-4" />}
                        Add Model
                    </Button>
                </div>

                {modelsLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Loading models...</span>
                    </div>
                ) : models && models.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                       {models.map(model => (
                           <Link href={`/data-warehouse/${vendor.slug || vendor.id}/ranges/${range.slug || range.id}/models/${model.slug || model.id}`} key={model.id} className="group">
                               <Card className="h-full transition-all hover:border-primary hover:-translate-y-1 hover:shadow-md">
                                   <CardHeader>
                                       <CardTitle className="text-base">{model.name}</CardTitle>
                                   </CardHeader>
                               </Card>
                           </Link>
                       ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-lg">
                        <p className="text-muted-foreground">No models in this range yet.</p>
                        <p className="text-sm text-muted-foreground mt-1">Use the input above to add the first one.</p>
                    </div>
                )}
            </CardContent>
        </Card>
    </div>
  );
}
