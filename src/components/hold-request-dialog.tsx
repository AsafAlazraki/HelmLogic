'use client';

import { useState, useMemo } from 'react';
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Shield, Search, UserPlus, Check, Loader2, X, User } from 'lucide-react';

interface HoldRequestDialogProps {
  item: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organisation: any;
  parentOrganisationId: string;
  moduleId: string;
  user: any;
  brandCaptainUserId?: string | null;
}

interface CustomerResult {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
}

export function HoldRequestDialog({
  item,
  open,
  onOpenChange,
  organisation,
  parentOrganisationId,
  moduleId,
  user,
  brandCaptainUserId,
}: HoldRequestDialogProps) {
  const firestore = useFirestore();

  const [customerSearch, setCustomerSearch] = useState('');
  const [searchResults, setSearchResults] = useState<CustomerResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);

  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search customers
  const handleSearchCustomers = async (searchTerm: string) => {
    setCustomerSearch(searchTerm);
    if (searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const customersRef = collection(firestore, 'customers');
      const q = query(customersRef, where('organisationId', '==', organisation.id));
      const snapshot = await getDocs(q);

      const term = searchTerm.toLowerCase();
      const matches: CustomerResult[] = [];
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const name = (data.name || '').toLowerCase();
        const email = (data.email || '').toLowerCase();
        const company = (data.company || '').toLowerCase();
        if (name.includes(term) || email.includes(term) || company.includes(term)) {
          matches.push({
            id: doc.id,
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            company: data.company || '',
          });
        }
        if (matches.length >= 5) break;
      }
      setSearchResults(matches);
    } catch (err) {
      console.error('Error searching customers:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Create new customer
  const handleCreateCustomer = async () => {
    if (!newName.trim()) return;

    setIsSavingCustomer(true);
    try {
      const docRef = await addDoc(collection(firestore, 'customers'), {
        name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
        company: newCompany.trim(),
        organisationId: organisation.id,
        createdAt: serverTimestamp(),
      });

      const created: CustomerResult = {
        id: docRef.id,
        name: newName.trim(),
        email: newEmail.trim(),
        phone: newPhone.trim(),
        company: newCompany.trim(),
      };
      setSelectedCustomer(created);
      setShowNewCustomerForm(false);
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewCompany('');
    } catch (err) {
      console.error('Error creating customer:', err);
      toast({ title: 'Error', description: 'Failed to create customer' });
    } finally {
      setIsSavingCustomer(false);
    }
  };

  // Submit hold request
  const handleSubmit = async () => {
    if (!item || !selectedCustomer) return;

    setIsSubmitting(true);
    try {
      // 1. Create hold request
      await addDoc(collection(firestore, 'holdRequests'), {
        inventoryItemId: item.id,
        moduleId,
        inventorySnapshot: {
          name: item.name || '',
          stockNumber: item.stockNumber || '',
          model: item.model || '',
          colour: item.colour || '',
          material: item.material || '',
          status: item.status || '',
        },
        requestingOrganisationId: organisation.id,
        requestingOrganisationName: organisation.name || '',
        requestedByUserId: user?.uid || '',
        requestedByUserName: user?.displayName || user?.email || '',
        parentOrganisationId,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2. Send notification to Brand Captain (if set)
      if (brandCaptainUserId) {
        await addDoc(collection(firestore, `users/${brandCaptainUserId}/notifications`), {
          message: `${organisation.name} has requested a hold on ${item.model || item.name} (${item.stockNumber}) for customer ${selectedCustomer.name}`,
          isRead: false,
          createdAt: serverTimestamp(),
          type: 'hold-request',
          inventoryItemId: item.id,
        });
      }

      toast({
        title: 'Hold Requested',
        description: `Hold request sent for ${item.model || item.name}`,
      });

      // Reset state and close
      setSelectedCustomer(null);
      setCustomerSearch('');
      setSearchResults([]);
      onOpenChange(false);
    } catch (err) {
      console.error('Error submitting hold request:', err);
      toast({ title: 'Error', description: 'Failed to submit hold request' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetState = () => {
    setSelectedCustomer(null);
    setCustomerSearch('');
    setSearchResults([]);
    setShowNewCustomerForm(false);
    setNewName('');
    setNewEmail('');
    setNewPhone('');
    setNewCompany('');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) resetState();
        onOpenChange(val);
      }}
    >
      <DialogContent className="rounded-3xl border-4 shadow-2xl p-0 overflow-hidden max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 bg-muted/5 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <DialogTitle className="text-xl font-black uppercase tracking-tight">
              Request Hold
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Request this stock item be placed on hold for a customer
          </DialogDescription>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Stock Item Details */}
          {item && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Stock Item
              </p>
              <div className="flex flex-wrap gap-2">
                {item.model && (
                  <Badge variant="secondary" className="border-2 rounded-xl text-xs">
                    {item.model}
                  </Badge>
                )}
                {item.stockNumber && (
                  <Badge variant="outline" className="border-2 rounded-xl text-xs">
                    #{item.stockNumber}
                  </Badge>
                )}
                {item.status && (
                  <Badge variant="outline" className="border-2 rounded-xl text-xs">
                    {item.status}
                  </Badge>
                )}
                {item.colour && (
                  <Badge variant="outline" className="border-2 rounded-xl text-xs">
                    {item.colour}
                  </Badge>
                )}
                {item.material && (
                  <Badge variant="outline" className="border-2 rounded-xl text-xs">
                    {item.material}
                  </Badge>
                )}
              </div>
              {item.name && (
                <p className="text-sm font-medium">{item.name}</p>
              )}
            </div>
          )}

          {/* Customer Section */}
          <div className="border-2 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Customer
            </p>

            {/* Selected Customer */}
            {selectedCustomer ? (
              <div className="bg-green-50 border-green-200 border-2 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-sm font-semibold">{selectedCustomer.name}</p>
                    {selectedCustomer.email && (
                      <p className="text-xs text-muted-foreground">{selectedCustomer.email}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCustomer(null)}
                  className="h-7 w-7 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <>
                {/* Search */}
                {!showNewCustomerForm && (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search existing customers..."
                        value={customerSearch}
                        onChange={(e) => handleSearchCustomers(e.target.value)}
                        className="rounded-xl border-2 text-xs pl-9"
                      />
                    </div>

                    {/* Search Results */}
                    {isSearching && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Searching...
                      </div>
                    )}
                    {searchResults.length > 0 && (
                      <div className="space-y-1">
                        {searchResults.map((c) => (
                          <div
                            key={c.id}
                            onClick={() => {
                              setSelectedCustomer(c);
                              setSearchResults([]);
                              setCustomerSearch('');
                            }}
                            className="p-2 rounded-xl hover:bg-slate-50 cursor-pointer border-2 border-transparent hover:border-slate-200 transition-colors"
                          >
                            <p className="text-xs font-semibold">{c.name}</p>
                            {c.email && (
                              <p className="text-[10px] text-muted-foreground">{c.email}</p>
                            )}
                            {c.company && (
                              <p className="text-[10px] text-muted-foreground">{c.company}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {customerSearch.length >= 2 && !isSearching && searchResults.length === 0 && (
                      <p className="text-xs text-muted-foreground p-2">No customers found</p>
                    )}

                    {/* Toggle new customer form */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNewCustomerForm(true)}
                      className="rounded-xl border-2 text-xs w-full"
                    >
                      <UserPlus className="h-3.5 w-3.5 mr-2" />
                      Create New Customer
                    </Button>
                  </div>
                )}

                {/* New Customer Form */}
                {showNewCustomerForm && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs font-semibold">Name *</Label>
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Customer name"
                        className="rounded-xl border-2 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Email</Label>
                      <Input
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="email@example.com"
                        className="rounded-xl border-2 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Phone</Label>
                      <Input
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="Phone number"
                        className="rounded-xl border-2 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Company</Label>
                      <Input
                        value={newCompany}
                        onChange={(e) => setNewCompany(e.target.value)}
                        placeholder="Company name"
                        className="rounded-xl border-2 text-xs mt-1"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowNewCustomerForm(false)}
                        className="rounded-xl border-2 text-xs flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleCreateCustomer}
                        disabled={!newName.trim() || isSavingCustomer}
                        className="rounded-xl border-2 text-xs flex-1"
                      >
                        {isSavingCustomer ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Check className="h-3 w-3 mr-1" />
                        )}
                        Save Customer
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-muted/5 shrink-0 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              resetState();
              onOpenChange(false);
            }}
            className="rounded-xl border-2 font-black uppercase text-[10px] h-12"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedCustomer || isSubmitting}
            className="h-12 rounded-xl font-black uppercase text-[10px]"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Shield className="h-4 w-4 mr-2" />
            )}
            Submit Hold Request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
