'use client';

import { useState, useMemo } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { useFirestore } from '@/firebase/provider';
import { collection, doc, setDoc, query, where } from 'firebase/firestore';
import { useRouter, useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BreadcrumbNav, type BreadcrumbPart } from '@/components/breadcrumb-nav';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Separator } from '@/components/ui/separator';
import { RoleHierarchyChart } from '@/components/role-hierarchy-chart';
import { fileToDataUri } from '@/firebase/storage-utils';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useDoc } from '@/firebase/firestore/use-doc';


const hexColorValidation = z.string().refine(val => !val || /^#[0-9A-F]{6}$/i.test(val), {
    message: "Must be a valid hex color code (e.g., #RRGGBB)",
}).optional().or(z.literal(''));

const roleSchema = z.object({
  id: z.string(),
  name: z.string().min(1, { message: "Role name is required." }),
  parent: z.preprocess((val) => val ?? '', z.string()),
});

const formSchema = z.object({
  name: z.string().min(1, {
    message: 'Organisation name is required.',
  }),
  slug: z.string().nullable().optional(),
  address: z.string().optional(),
  phoneNumber: z.string().optional(),
  abn: z.string().optional(),
  primaryColor: hexColorValidation,
  accentColor: hexColorValidation,
  secondaryColor: hexColorValidation,
  roles: z.array(roleSchema).optional(),
  primaryLogo: z.any().optional(),
  secondaryLogo: z.any().optional(),
  subDealersEnabled: z.boolean().optional(),
});

const createSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '');


export default function AddSubDealerPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [primaryLogoPreview, setPrimaryLogoPreview] = useState<string | null>(null);
  const [secondaryLogoPreview, setSecondaryLogoPreview] = useState<string | null>(null);
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();
  const params = useParams();
  const parentOrgSlugOrId = params.id as string;

  const orgQueryBySlug = useMemo(() => {
    if (!parentOrgSlugOrId) return null;
    return query(collection(firestore, 'organisations'), where('slug', '==', parentOrgSlugOrId));
  }, [firestore, parentOrgSlugOrId]);

  const { data: orgsBySlug, loading: slugLoading } = useCollection<{id: string, name: string, slug?: string}>(orgQueryBySlug);
  const { data: orgById, loading: idLoading } = useDoc<{id: string, name: string, slug?: string}>(parentOrgSlugOrId ? `/organisations/${parentOrgSlugOrId}` : null);

  const parentOrganisation = useMemo(() => orgsBySlug?.[0] || orgById, [orgsBySlug, orgById]);
  const parentOrgLoading = slugLoading || idLoading;

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
      subDealersEnabled: false,
    },
  });

  const breadcrumbParts = useMemo((): BreadcrumbPart[] => {
    if (!parentOrganisation) return [];
    return [
        { href: '/admin', label: 'Admin' },
        { href: '/organisations', label: 'Organisations' },
        { href: `/organisations/${parentOrganisation.slug || parentOrganisation.id}`, label: parentOrganisation.name },
        { href: `/organisations/${parentOrganisation.slug || parentOrganisation.id}/add-sub-dealer`, label: 'Add Sub Dealer' },
    ];
  }, [parentOrganisation]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);

    if (!parentOrganisation) {
        toast({
            variant: 'destructive',
            title: 'Parent organisation not found',
            description: 'Please ensure the parent organisation exists before adding a sub-dealer.',
        });
        setIsLoading(false);
        return;
    }
    
    try {
      const orgsCollection = collection(firestore, 'organisations');
      const newOrgRef = doc(orgsCollection);

      const dataToCreate: { [key: string]: any } = {
          name: values.name,
          slug: createSlug(values.name),
          address: values.address || '',
          phoneNumber: values.phoneNumber || '',
          abn: values.abn || '',
          primaryColor: values.primaryColor || '',
          accentColor: values.accentColor || '',
          secondaryColor: values.secondaryColor || '',
          roles: values.roles || [],
          primaryLogoUrl: null,
          secondaryLogoUrl: null,
          subDealersEnabled: values.subDealersEnabled || false,
          parentOrganisationId: parentOrganisation.id,
      };

      if (values.primaryLogo instanceof File) {
          dataToCreate.primaryLogoUrl = await fileToDataUri(values.primaryLogo);
      }

      if (values.secondaryLogo instanceof File) {
          dataToCreate.secondaryLogoUrl = await fileToDataUri(values.secondaryLogo);
      }

      await setDoc(newOrgRef, dataToCreate)
        .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
                path: newOrgRef.path,
                operation: 'create',
                requestResourceData: dataToCreate,
            });
            errorEmitter.emit('permission-error', permissionError);
            throw serverError; // Re-throw to be caught by the outer catch
        });

      toast({
        title: 'Sub Dealer created',
        description: `${values.name} has been added successfully.`,
      });
      router.push(`/organisations/${parentOrganisation.slug || parentOrganisation.id}`);

    } catch (error: any) {
      console.error("Failed to create sub dealer:", error);
      toast({
        variant: 'destructive',
        title: 'Failed to create sub dealer',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
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
    <div className="space-y-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-semibold">Add New Sub Dealer {parentOrganisation ? `to ${parentOrganisation.name}` : ''}</h1>
                  <BreadcrumbNav parts={breadcrumbParts} />
                </div>
                <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>Cancel</Button>
                    <Button type="submit" disabled={isLoading || parentOrgLoading}>
                        {(isLoading || parentOrgLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Create Sub Dealer
                    </Button>
                </div>
            </div>
            
            <div className="grid gap-8 lg:grid-cols-3 pt-4">
                <div className="lg:col-span-2 space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Sub Dealer Details</CardTitle>
                            <CardDescription>Enter the primary details for the new sub dealer.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                             <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Sub Dealer Name</FormLabel>
                                    <FormControl>
                                    <Input placeholder="e.g., Regional Marine" {...field} />
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
                                    <Input placeholder="456 Branch Rd, Smalltown, ST 54321" {...field} />
                                    </FormControl>
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
                                      <Input placeholder="(+1) 555-987-6543" {...field} />
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
                                      <Input placeholder="e.g., 98 765 432 109" {...field} />
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
                            <CardDescription>Build the sub dealer's role structure. Double-click a role to rename it. Drag from the bottom of one role to the top of another to create a reporting line.</CardDescription>
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
                            <CardTitle>Sub Dealer Branding</CardTitle>
                            <CardDescription>Customize the look and feel for this sub dealer.</CardDescription>
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
    </div>
  );
}
