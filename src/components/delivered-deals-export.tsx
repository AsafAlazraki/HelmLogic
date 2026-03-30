'use client';

import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';

interface DeliveredDealsExportProps {
  deals: any[];
  fileName?: string;
}

function formatDate(ts: any): string {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function daysInStock(ts: any): number | string {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function boolToYesNo(val: any): string {
  return val ? 'Yes' : 'No';
}

function buildRows(deals: any[]) {
  return deals.map((deal) => ({
    'Days in Stock': daysInStock(deal.dateIntoStock),
    'Status': deal.status || '',
    'On Consignment With': deal.onConsignmentWith || '',
    'Sold By': deal.soldBy || '',
    'Stock Number': deal.stockNumber || '',
    'Label': deal.label || '',
    'Model': deal.model || '',
    'Colour': deal.colour || '',
    'Serial Number': deal.serialNumber || '',
    'Material': deal.material || '',
    'Location': deal.location || '',
    'P/O or Deal #': deal.dealNumber || '',
    'Customer Name/Notes': deal.customerNotes || '',
    'Delivery Date': formatDate(deal.deliveryDate),
    'ETA/Sold Date': formatDate(deal.etaSoldDate),
    'Motor': deal.motor || '',
    'Motor S/N': deal.motorSN || '',
    'Trailer': deal.trailer || '',
    'Invoiced': boolToYesNo(deal.invoiced),
    'Deposit Paid': boolToYesNo(deal.depositPaid),
    'Paid in Full': boolToYesNo(deal.paidInFull),
    'Package Details': deal.packageDetails || '',
    'Invoiced Amount': deal.invoicedAmount != null ? deal.invoicedAmount : '',
    'Is Hull Only': boolToYesNo(deal.isHullOnly),
    'Warranty Registered': boolToYesNo(deal.warrantyRegistered),
  }));
}

function exportToExcel(deals: any[], fileName: string) {
  const rows = buildRows(deals);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Delivered Deals');

  // Auto-size columns
  const colWidths = Object.keys(rows[0] || {}).map((key) => ({
    wch:
      Math.max(
        key.length,
        ...rows
          .map((r) => String((r as Record<string, any>)[key] || '').length)
          .slice(0, 100)
      ) + 2,
  }));
  ws['!cols'] = colWidths;

  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

function exportToCSV(deals: any[], fileName: string) {
  const rows = buildRows(deals);
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function DeliveredDealsExport({
  deals,
  fileName = 'delivered-deals-export',
}: DeliveredDealsExportProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="rounded-xl border-2 text-[10px] font-black uppercase tracking-widest h-10 px-5 gap-2"
        >
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="rounded-xl border-2">
        <DropdownMenuItem
          onClick={() => exportToExcel(deals, fileName)}
          className="text-xs font-bold gap-2 cursor-pointer"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Export as Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => exportToCSV(deals, fileName)}
          className="text-xs font-bold gap-2 cursor-pointer"
        >
          <FileText className="h-4 w-4" />
          Export as CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
