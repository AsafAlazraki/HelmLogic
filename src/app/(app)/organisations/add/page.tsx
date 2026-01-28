'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase/provider';
import { addDoc, collection } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import AdminGuard from '@/components/admin-guard';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const formSchema = z.object({
  name: z.string().min(1, {
    message: 'Organisation name is required.',
  }),
  description: z.string().optional(),
});

export default function AddOrganisationPage() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      const orgsCollection = collection(firestore, 'organisations');
      await addDoc(orgsCollection, values)
        .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
                path: orgsCollection.path,
                operation: 'create',
                requestResourceData: values,
            });
            errorEmitter.emit('permission-error', permissionError);
            throw serverError;
        });

      toast({
        title: 'Organisation created',
        description: `${values.name} has been added successfully.`,
      });
      router.push('/organisations');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to create organisation',
        description: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AdminGuard>
        <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold">Add New Organisation</h1>
              <BreadcrumbNav />
            </div>
            <Card className="max-w-2xl">
                <CardHeader>
                    <CardTitle>Organisation Details</CardTitle>
                    <CardDescription>Enter the details for the new organisation.</CardDescription>
                </CardHeader>
                <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Organisation Name</FormLabel>
                            <FormControl>
                            <Input placeholder="e.g., Global Shipping Inc." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Description (Optional)</FormLabel>
                            <FormControl>
                            <Textarea placeholder="A brief description of the organisation." {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Organisation
                        </Button>
                    </div>
                    </form>
                </Form>
                </CardContent>
            </Card>
        </div>
    </AdminGuard>
  );
}
