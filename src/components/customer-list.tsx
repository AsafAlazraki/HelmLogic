'use client';

import { useState, useMemo } from 'react';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { collection, query, where, addDoc, doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Loader2, Plus, Pencil, Trash2, Search, Users } from 'lucide-react';

interface CustomerListProps {
  organisationId: string;
  subDealerOrgIds?: string[];
  readOnly?: boolean;
}

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  organisationId: string;
  createdAt?: { seconds: number; nanoseconds: number };
}

interface Organisation {
  id: string;
  name: string;
}

const emptyForm = { name: '', email: '', phone: '', company: '' };

export function CustomerList({ organisationId, subDealerOrgIds, readOnly = false }: CustomerListProps) {
  const firestore = useFirestore();
  const [search, setSearch] = useState('');
  const [dialogMode, setDialogMode] = useState<'add' | 'edit' | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const orgIds = useMemo(() => {
    const ids = [organisationId];
    if (subDealerOrgIds?.length) ids.push(...subDealerOrgIds);
    return ids;
  }, [organisationId, subDealerOrgIds]);

  const customersQuery = useMemoFirebase(() => {
    if (!organisationId) return null;
    return query(
      collection(firestore, 'customers'),
      where('organisationId', 'in', orgIds)
    );
  }, [firestore, organisationId, orgIds]);

  const { data: customers, loading } = useCollection<Customer>(customersQuery);

  // For sub-dealer badge labels, fetch org names
  const subDealerOrgsQuery = useMemoFirebase(() => {
    if (!subDealerOrgIds?.length) return null;
    return query(
      collection(firestore, 'organisations'),
      where('__name__', 'in', subDealerOrgIds)
    );
  }, [firestore, subDealerOrgIds]);

  const { data: subDealerOrgs } = useCollection<Organisation>(subDealerOrgsQuery);

  const orgNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    subDealerOrgs?.forEach(org => { map[org.id] = org.name; });
    return map;
  }, [subDealerOrgs]);

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    if (!search.trim()) return customers;
    const term = search.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(term));
  }, [customers, search]);

  const openAdd = () => {
    setForm(emptyForm);
    setDialogMode('add');
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      company: customer.company || '',
    });
    setDialogMode('edit');
  };

  const closeDialog = () => {
    setDialogMode(null);
    setEditingCustomer(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (dialogMode === 'add') {
        await addDoc(collection(firestore, 'customers'), {
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          company: form.company.trim() || null,
          organisationId,
          createdAt: Timestamp.now(),
        });
        toast({ title: 'Customer added' });
      } else if (dialogMode === 'edit' && editingCustomer) {
        await updateDoc(doc(firestore, 'customers', editingCustomer.id), {
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          company: form.company.trim() || null,
        });
        toast({ title: 'Customer updated' });
      }
      closeDialog();
    } catch (err) {
      console.error('Failed to save customer:', err);
      toast({ title: 'Failed to save customer', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(firestore, 'customers', deleteTarget.id));
      toast({ title: 'Customer deleted' });
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete customer:', err);
      toast({ title: 'Failed to delete customer', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (ts?: { seconds: number; nanoseconds: number }) => {
    if (!ts) return '-';
    return new Date(ts.seconds * 1000).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl border-2 text-xs"
          />
        </div>
        {!readOnly && (
          <Button size="sm" className="rounded-xl text-xs font-bold" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Customer
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border-2 border-slate-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50">
              <th className="text-left px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Name</th>
              <th className="text-left px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Email</th>
              <th className="text-left px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Phone</th>
              <th className="text-left px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Company</th>
              <th className="text-left px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Created</th>
              {!readOnly && (
                <th className="text-right px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 5 : 6} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="h-6 w-6 text-muted-foreground/20" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">No customers yet</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredCustomers.map(customer => (
                <tr key={customer.id} className="group text-xs hover:bg-slate-50/50 border-b border-slate-100">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <span>{customer.name}</span>
                      {subDealerOrgIds?.length && customer.organisationId !== organisationId && (
                        <Badge variant="outline" className="text-[8px] font-bold py-0 h-4 border-2">
                          {orgNameMap[customer.organisationId] || 'Sub-dealer'}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{customer.email || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{customer.phone || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{customer.company || '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(customer.createdAt)}</td>
                  {!readOnly && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => openEdit(customer)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget(customer)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="p-8 bg-muted/5 border-b">
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">
              {dialogMode === 'add' ? 'Add Customer' : 'Edit Customer'}
            </DialogTitle>
            <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-primary mt-1">
              {dialogMode === 'add' ? 'Create a new customer record' : 'Update customer details'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-8 space-y-4">
            <div className="space-y-2">
              <Label className="text-[9px] uppercase tracking-widest font-black text-slate-400">Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                className="rounded-xl border-2 text-xs"
                placeholder="Customer name"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[9px] uppercase tracking-widest font-black text-slate-400">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                className="rounded-xl border-2 text-xs"
                placeholder="Email address"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[9px] uppercase tracking-widest font-black text-slate-400">Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                className="rounded-xl border-2 text-xs"
                placeholder="Phone number"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[9px] uppercase tracking-widest font-black text-slate-400">Company</Label>
              <Input
                value={form.company}
                onChange={(e) => setForm(prev => ({ ...prev, company: e.target.value }))}
                className="rounded-xl border-2 text-xs"
                placeholder="Company name"
              />
            </div>
          </div>
          <DialogFooter className="p-8 border-t bg-muted/5 gap-3">
            <DialogClose asChild>
              <Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-[10px]">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
              className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {dialogMode === 'add' ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="p-8 bg-muted/5 border-b">
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Delete Customer</DialogTitle>
            <DialogDescription className="text-[10px] font-black uppercase tracking-widest text-destructive mt-1">
              This action cannot be undone
            </DialogDescription>
          </DialogHeader>
          <div className="p-8">
            <p className="text-sm text-slate-600">
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
            </p>
          </div>
          <DialogFooter className="p-8 border-t bg-muted/5 gap-3">
            <DialogClose asChild>
              <Button variant="outline" className="h-12 px-8 rounded-xl font-black uppercase text-[10px]">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="h-12 px-10 rounded-xl font-black uppercase text-[10px] shadow-xl"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
