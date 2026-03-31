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

interface StockExportProps {
  inventory: any[];
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

function buildRows(inventory: any[]) {
  return inventory.map((item) => ({
    'Date into Stock': formatDate(item.dateIntoStock),
    'Days in Stock': daysInStock(item.dateIntoStock),
    'Status': item.status || '',
    'Location': item.location || '',
    'Sold By': item.soldBy || '',
    'Stock Number': item.stockNumber || '',
    'Label': item.label || '',
    'Model': item.model || '',
    'Colour': item.colour || '',
    'Serial Number': item.serialNumber || '',
    'Material': item.material || '',
    'Notes': item.notes || '',
    'Name': item.name || '',
  }));
}

const STOCK_HEADERS = [
  'Date into Stock', 'Days in Stock', 'Status', 'Location', 'Sold By',
  'Stock Number', 'Label', 'Model', 'Colour', 'Serial Number', 'Material', 'Notes', 'Name',
];

function exportToExcel(inventory: any[], fileName: string) {
  const rows = buildRows(inventory);
  const ws = rows.length > 0
    ? XLSX.utils.json_to_sheet(rows)
    : XLSX.utils.aoa_to_sheet([STOCK_HEADERS]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock');

  ws['!cols'] = STOCK_HEADERS.map((h) => ({
    wch: Math.max(h.length, ...rows.map((r) => String((r as Record<string, any>)[h] || '').length).slice(0, 100)) + 2,
  }));

  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

function exportToCSV(inventory: any[], fileName: string) {
  const rows = buildRows(inventory);
  const ws = rows.length > 0
    ? XLSX.utils.json_to_sheet(rows)
    : XLSX.utils.aoa_to_sheet([STOCK_HEADERS]);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function StockExport({
  inventory,
  fileName = 'stock-export',
}: StockExportProps) {
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
          onClick={() => exportToExcel(inventory, fileName)}
          className="text-xs font-bold gap-2 cursor-pointer"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Export as Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => exportToCSV(inventory, fileName)}
          className="text-xs font-bold gap-2 cursor-pointer"
        >
          <FileText className="h-4 w-4" />
          Export as CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
