'use client';

import { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { collection, query, where, addDoc, Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Loader2, X, Plus, UserCircle } from 'lucide-react';

interface CustomerPickerProps {
  organisationId: string;
  selectedCustomerId?: string | null;
  onSelect: (customer: { id: string; name: string }) => void;
}

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  organisationId: string;
}

export function CustomerPicker({ organisationId, selectedCustomerId, onSelect }: CustomerPickerProps) {
  const firestore = useFirestore();
  const [search, setSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '', company: '' });

  const customersQuery = useMemoFirebase(() => {
    if (!organisationId) return null;
    return query(
      collection(firestore, 'customers'),
      where('organisationId', '==', organisationId)
    );
  }, [firestore, organisationId]);

  const { data: customers, loading } = useCollection<Customer>(customersQuery);

  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId || !customers) return null;
    return customers.find(c => c.id === selectedCustomerId) ?? null;
  }, [selectedCustomerId, customers]);

  const filteredCustomers = useMemo(() => {
    if (!customers || !search.trim()) return [];
    const term = search.toLowerCase();
    return customers
      .filter(c => c.name.toLowerCase().includes(term))
      .slice(0, 5);
  }, [customers, search]);

  const handleCreate = async () => {
    if (!newCustomer.name.trim()) return;
    setCreating(true);
    try {
      const docRef = await addDoc(collection(firestore, 'customers'), {
        name: newCustomer.name.trim(),
        email: newCustomer.email.trim() || null,
        phone: newCustomer.phone.trim() || null,
        company: newCustomer.company.trim() || null,
        organisationId,
        createdAt: Timestamp.now(),
      });
      onSelect({ id: docRef.id, name: newCustomer.name.trim() });
      setNewCustomer({ name: '', email: '', phone: '', company: '' });
      setShowCreateForm(false);
      setSearch('');
      toast({ title: 'Customer created' });
    } catch (err) {
      console.error('Failed to create customer:', err);
      toast({ title: 'Failed to create customer', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleClear = () => {
    onSelect({ id: '', name: '' });
    setSearch('');
  };

  if (selectedCustomer) {
    return (
      <div className="border-2 rounded-2xl p-4">
        <Label className="text-[9px] uppercase tracking-widest font-black text-slate-400">Customer</Label>
        <div className="mt-2 flex items-center justify-between bg-primary/10 border-2 border-primary/20 text-primary rounded-xl px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <UserCircle className="h-4 w-4 shrink-0" />
            <span className="text-xs font-bold truncate">{selectedCustomer.name}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleClear}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 rounded-2xl p-4 space-y-3">
      <Label className="text-[9px] uppercase tracking-widest font-black text-slate-400">Customer</Label>

      <Input
        placeholder="Search customers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="rounded-xl border-2 text-xs"
      />

      {loading && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && search.trim() && filteredCustomers.length > 0 && (
        <div className="space-y-1">
          {filteredCustomers.map(customer => (
            <div
              key={customer.id}
              className="p-2 rounded-xl hover:bg-slate-50 cursor-pointer flex items-center justify-between"
              onClick={() => {
                onSelect({ id: customer.id, name: customer.name });
                setSearch('');
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <UserCircle className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-xs font-medium truncate">{customer.name}</span>
              </div>
              {customer.company && (
                <span className="text-[10px] text-slate-400 truncate ml-2">{customer.company}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && search.trim() && filteredCustomers.length === 0 && (
        <p className="text-[10px] text-slate-400 text-center py-2">No customers found</p>
      )}

      {!showCreateForm ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full rounded-xl border-2 text-xs"
          onClick={() => setShowCreateForm(true)}
        >
          <Plus className="h-3 w-3 mr-1.5" />
          Create New Customer
        </Button>
      ) : (
        <div className="space-y-3 border-2 rounded-xl p-3">
          <Label className="text-[9px] uppercase tracking-widest font-black text-slate-400">New Customer</Label>
          <div className="space-y-2">
            <Input
              placeholder="Name *"
              value={newCustomer.name}
              onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
              className="rounded-xl border-2 text-xs"
            />
            <Input
              placeholder="Email"
              type="email"
              value={newCustomer.email}
              onChange={(e) => setNewCustomer(prev => ({ ...prev, email: e.target.value }))}
              className="rounded-xl border-2 text-xs"
            />
            <Input
              placeholder="Phone"
              value={newCustomer.phone}
              onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
              className="rounded-xl border-2 text-xs"
            />
            <Input
              placeholder="Company"
              value={newCustomer.company}
              onChange={(e) => setNewCustomer(prev => ({ ...prev, company: e.target.value }))}
              className="rounded-xl border-2 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 rounded-xl border-2 text-xs"
              onClick={() => {
                setShowCreateForm(false);
                setNewCustomer({ name: '', email: '', phone: '', company: '' });
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1 rounded-xl text-xs"
              onClick={handleCreate}
              disabled={creating || !newCustomer.name.trim()}
            >
              {creating && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
