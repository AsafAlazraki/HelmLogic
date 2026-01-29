'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useStorage } from '@/firebase/provider';
import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BreadcrumbNav } from '@/components/breadcrumb-nav';
import AdminGuard from '@/components/admin-guard';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Separator } from '@/components/ui/separator';
import { RoleHierarchyChart } from '@/components/role-hierarchy-chart';
import { uploadFile } from '@/firebase/storage-utils';

const hexColorValidation = z.string().refine(val => /^#[0-9A-F]{6}$/i.test(val), {
    message: "Must be a valid hex color code (e.g., #RRGGBB)",
}).optional().or(z.literal(''));

const roleSchema = z.object({
  id: z.string(),
  name: z.string().min(1, { message: "Role name is required." }),
  parent: z.string(),
});

const formSchema = z.object({
  name: z.string().min(1, {
    message: 'Organisation name is required.',
  }),
  address: z.string().optional(),
  phoneNumber: z.string().optional(),
  abn: z.string().optional(),
  primaryColor: hexColorValidation,
  accentColor: hexColorValidation,
  secondaryColor: hexColorValidation,
  roles: z.array(roleSchema).optional(),
  primaryLogo: z.any().optional(),
  secondaryLogo: z.any().optional(),
});

const createSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '');


export default function AddOrganisationPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [primaryLogoPreview, setPrimaryLogoPreview] = useState<string | null>(null);
  const [secondaryLogoPreview, setSecondaryLogoPreview] = useState<string | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const storage = useStorage();
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      address: '',
      phoneNumber: '',
      abn: '',
      primaryColor: '#2563EB',
      accentColor: '#1E40AF',
      secondaryColor: '#F1F5F9',
      roles: [{ id: 'initial-admin-role', name: 'Admin', parent: '' }],
      primaryLogo: null,
      secondaryLogo: null,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    
    const { primaryLogo, secondaryLogo, ...orgData } = values;

    const slug = createSlug(orgData.name);
    const orgsCollection = collection(firestore, 'organisations');
    const newOrgRef = doc(orgsCollection);
    const orgId = newOrgRef.id;
    
    const orgDataForFirestore: any = {
        ...orgData,
        slug,
    };

    try {
      if (primaryLogo instanceof File) {
          const path = `organisations/${orgId}/logos/primary_${primaryLogo.name}`;
          orgDataForFirestore.primaryLogoUrl = await uploadFile(storage, primaryLogo, path);
      }
      if (secondaryLogo instanceof File) {
          const path = `organisations/${orgId}/logos/secondary_${secondaryLogo.name}`;
          orgDataForFirestore.secondaryLogoUrl = await uploadFile(storage, secondaryLogo, path);
      }

      setDoc(newOrgRef, orgDataForFirestore)
        .then(() => {
          toast({
            title: 'Organisation created',
            description: `${values.name} has been added successfully.`,
          });
          router.push('/organisations');
        })
        .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
                path: newOrgRef.path,
                operation: 'create',
                requestResourceData: orgDataForFirestore,
            });
            errorEmitter.emit('permission-error', permissionError);
            console.error(serverError);
            toast({
              variant: 'destructive',
              title: 'Failed to create organisation',
              description: serverError.message || 'An unexpected error occurred.',
            });
        })
        .finally(() => {
          setIsLoading(false);
        });

    } catch (error: any) {
      console.error("Failed to upload logos:", error);
      toast({
        variant: 'destructive',
        title: 'Failed to upload logos',
        description: 'Could not save images. Please try again.',
      });
       setIsLoading(false);
    }
  }

  const ColorFormField = ({ name, label, description }: { name: "primaryColor" | "accentColor" | "secondaryColor", label: string, description: string }) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <div className="flex items-center gap-2">
            <FormControl>
              <Input type="color" className="h-10 w-14 p-1" {...field} />
            </FormControl>
            <FormControl>
              <Input placeholder="#RRGGBB" {...field} />
            </FormControl>
          </div>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
  
  return (
    <AdminGuard>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-semibold">Add New Organisation</h1>
                  <BreadcrumbNav />
                </div>
                <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>Cancel</Button>
                    <Button type="submit" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create Organisation
                    </Button>
                </div>
            </div>
            
            <div className="grid gap-8 lg:grid-cols-3 pt-4">
                <div className="lg:col-span-2 space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Organisation Details</CardTitle>
                            <CardDescription>Enter the primary details for the new organisation.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
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
                                name="address"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Address</FormLabel>
                                    <FormControl>
                                    <Textarea placeholder="123 Ocean Ave, Suite 101&#10;Metropolis, NY 10001&#10;USA" {...field} rows={4}/>
                                    </FormControl>
                                    <FormDescription>An address search feature will be added later.</FormDescription>
                                    <FormMessage />
                                </FormItem>
                                )}
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <FormField
                                  control={form.control}
                                  name="phoneNumber"
                                  render={({ field }) => (
                                  <FormItem>
                                      <FormLabel>Phone Number</FormLabel>
                                      <FormControl>
                                      <Input placeholder="(+1) 555-123-4567" {...field} />
                                      </FormControl>
                                      <FormMessage />
                                  </FormItem>
                                  )}
                              />
                               <FormField
                                  control={form.control}
                                  name="abn"
                                  render={({ field }) => (
                                  <FormItem>
                                      <FormLabel>ABN (Australian Business Number)</FormLabel>
                                      <FormControl>
                                      <Input placeholder="e.g., 53 004 085 616" {...field} />
                                      </FormControl>
                                      <FormMessage />
                                  </FormItem>
                                  )}
                              />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Role Hierarchy</CardTitle>
                            <CardDescription>Build the organisation's role structure. Double-click a role to rename it. Drag from the bottom of one role to the top of another to create a reporting line.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <FormField
                                control={form.control}
                                name="roles"
                                render={({ field }) => (
                                    <RoleHierarchyChart value={field.value || []} onChange={field.onChange} />
                                )}
                            />
                        </CardContent>
                    </Card>
                </div>
                <div className="lg:col-span-1 space-y-8">
                     <Card>
                        <CardHeader>
                            <CardTitle>Organisation Branding</CardTitle>
                            <CardDescription>Customize the look and feel for this organisation.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <ColorFormField name="primaryColor" label="Primary Color" description="The main brand color."/>
                            <ColorFormField name="accentColor" label="Accent Color" description="Color for highlights and links."/>
                            <ColorFormField name="secondaryColor" label="Secondary Color" description="Used for backgrounds and panels."/>
                            
                            <Separator />
                            
                            <FormField
                              control={form.control}
                              name="primaryLogo"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Primary Logo</FormLabel>
                                  {primaryLogoPreview && (
                                    <div className="mt-2 w-32 h-32 relative">
                                      <Image 
                                        src={primaryLogoPreview} 
                                        alt="Primary Logo Preview" 
                                        fill
                                        className="rounded-md object-contain border p-1"
                                      />
                                    </div>
                                  )}
                                  <FormControl>
                                    <Input 
                                      type="file" 
                                      accept="image/*"
                                      onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        field.onChange(file);
                                        if (file) {
                                          setPrimaryLogoPreview(URL.createObjectURL(file));
                                        } else {
                                          setPrimaryLogoPreview(null);
                                        }
                                      }}
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    The main company logo. 
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="secondaryLogo"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Secondary Logo (e.g. icon)</FormLabel>
                                  {secondaryLogoPreview && (
                                    <div className="mt-2 w-32 h-32 relative">
                                      <Image 
                                        src={secondaryLogoPreview} 
                                        alt="Secondary Logo Preview" 
                                        fill
                                        className="rounded-md object-contain border p-1"
                                      />
                                    </div>
                                  )}
                                  <FormControl>
                                    <Input 
                                      type="file" 
                                      accept="image/*"
                                      onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        field.onChange(file);
                                        if (file) {
                                          setSecondaryLogoPreview(URL.createObjectURL(file));
                                        } else {
                                          setSecondaryLogoPreview(null);
                                        }
                                      }}
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    An icon or alternative brand mark.
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </form>
      </Form>
    </AdminGuard>
  );
}
