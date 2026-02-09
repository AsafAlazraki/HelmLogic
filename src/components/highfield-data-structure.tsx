'use client';

import { useState } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore } from '@/firebase/provider';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { createSlug } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';

interface Range {
    id: string;
    name: string;
    slug?: string;
    vendorId: string;
}

const initialRanges = ['Sport', 'Classic', 'Roll-Up', 'Adventure', 'Patrol'];

export function HighfieldDataStructure({ vendorId }: { vendorId: string }) {
    const firestore = useFirestore();
    const { data: ranges, loading: rangesLoading } = useCollection<Range>(`data-warehouse/${vendorId}/ranges`);
    const [isSeeding, setIsSeeding] = useState(false);
    const { toast } = useToast();

    const handleSeedData = async () => {
        setIsSeeding(true);
        try {
            const batch = writeBatch(firestore);
            const rangesCollection = collection(firestore, `data-warehouse/${vendorId}/ranges`);

            initialRanges.forEach(rangeName => {
                const newRangeRef = doc(rangesCollection);
                batch.set(newRangeRef, {
                    name: rangeName,
                    slug: createSlug(rangeName),
                    vendorId: vendorId,
                });
            });

            await batch.commit();
            toast({ title: 'Success', description: 'Initial Highfield data structure has been created.' });
        } catch (error) {
            console.error("Error seeding data: ", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not seed initial data.' });
        } finally {
            setIsSeeding(false);
        }
    };

    if (rangesLoading) {
        return <div className="flex justify-center items-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Highfield Data Structure</CardTitle>
                <CardDescription>Manage product ranges and models for Highfield boats.</CardDescription>
            </CardHeader>
            <CardContent>
                {ranges && ranges.length > 0 ? (
                     <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {ranges.map(range => (
                            <Link href={`/data-warehouse/${vendorId}/ranges/${range.slug || range.id}`} key={range.id} className="group">
                                <Card className="h-full transition-all hover:border-primary hover:-translate-y-1 hover:shadow-md">
                                    <CardHeader>
                                        <CardTitle className="text-lg">{range.name}</CardTitle>
                                    </CardHeader>
                                </Card>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg">
                        <p className="text-muted-foreground">No data structure found for Highfield.</p>
                        <Button onClick={handleSeedData} disabled={isSeeding} className="mt-4">
                            {isSeeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                            Build Initial Data Structure
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
