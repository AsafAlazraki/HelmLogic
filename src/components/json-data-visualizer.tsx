
'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import Image from 'next/image';

export function JsonDataVisualizer({ 
    data, 
    columns, 
    onRowClick 
}: { 
    data: any, 
    columns?: {key: string, label: string}[], 
    onRowClick?: (row: any) => void 
}) {
    if (!data || (Array.isArray(data) && data.length === 0)) {
        return <p className="text-muted-foreground p-4 text-center">No data to display.</p>;
    }

    const isImageValue = (key: string, value: any) => {
        if (typeof value !== 'string') return false;
        const k = key.toLowerCase();
        const isKnownKey = k.includes('image') || k.includes('logo') || k.includes('photo') || k === 'summaryimage';
        const isUrl = value.startsWith('http') || value.startsWith('/') || value.startsWith('\\') || value.startsWith('data:image');
        return isKnownKey && isUrl;
    };

    const getImageUrl = (value: string) => {
        if (!value) return '';
        // Handle backslashes first
        const path = value.trim().replace(/\\/g, '/');
        
        if (path.startsWith('http') || path.startsWith('data:image')) {
            return path;
        }
        
        // Handle Yamaha specifically
        if (path.includes('images/products') || path.includes('images/accessories')) {
            const cleanPath = path.startsWith('/') ? path : `/${path}`;
            return `https://www.yamaha-motor.com.au${cleanPath}`;
        }
        
        return path;
    };

    // Handle array of objects (standard table data)
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
        // If no columns provided, detect them from the first item
        const firstItem = data[0];
        let keys = columns 
            ? columns.map(c => c.key) 
            : Object.keys(firstItem).filter(k => k !== 'id' && k !== '_ref');
            
        // Always prioritize image fields to the front
        const imageKey = keys.find(k => isImageValue(k, firstItem[k]) || k.toLowerCase().includes('image') || k === 'SummaryImage');
        if (imageKey) {
            keys = [imageKey, ...keys.filter(k => k !== imageKey)];
        }

        const headers = columns 
            ? keys.map(k => columns.find(c => c.key === k)?.label || k)
            : keys;

        return (
            <div className="w-full min-w-0 max-w-full h-full overflow-hidden border rounded-md shadow-sm bg-card flex flex-col">
                <div className="w-full overflow-auto flex-1 scrollbar-thin scrollbar-thumb-muted-foreground/20">
                    <Table className="w-full border-collapse table-auto">
                        <TableHeader className="sticky top-0 bg-secondary z-10 shadow-sm">
                            <TableRow className="hover:bg-transparent">
                                {headers.map((header, idx) => (
                                    <TableHead 
                                        key={`${header}-${idx}`} 
                                        className="whitespace-nowrap font-black uppercase text-[10px] tracking-tighter py-3 px-4 text-muted-foreground/80 border-b"
                                    >
                                        {header.replace(/_/g, ' ')}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.map((row, rowIndex) => (
                                <TableRow 
                                    key={rowIndex} 
                                    className={cn(
                                        "transition-colors group",
                                        rowIndex % 2 === 0 ? "bg-background" : "bg-muted/5",
                                        onRowClick && "cursor-pointer hover:bg-primary/5"
                                    )}
                                    onClick={() => onRowClick?.(row)}
                                >
                                    {keys.map((key, colIndex) => {
                                        const val = row[key];
                                        const isImg = isImageValue(key, val);

                                        return (
                                            <TableCell key={`${rowIndex}-${colIndex}`} className="align-middle py-3 px-4 border-b/50">
                                                {isImg ? (
                                                    <div className="relative h-10 w-16 bg-muted rounded overflow-hidden shadow-sm border border-border/50 transition-transform group-hover:scale-105">
                                                        <img 
                                                            src={getImageUrl(val)} 
                                                            alt="Preview" 
                                                            className="h-full w-full object-contain p-1" 
                                                        />
                                                    </div>
                                                ) : typeof val === 'object' && val !== null ? (
                                                    <pre className="text-[10px] font-mono bg-muted/50 p-2 rounded-md overflow-x-auto max-w-[300px]">
                                                        <code>{JSON.stringify(val, null, 2)}</code>
                                                    </pre>
                                                ) : (
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className={cn(
                                                            "text-[11px] font-medium text-foreground whitespace-nowrap",
                                                            (key.toLowerCase().includes('code') || key.toLowerCase().includes('sku')) && "font-mono font-bold uppercase"
                                                        )}>
                                                            {String(val ?? '')}
                                                        </span>
                                                    </div>
                                                )}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        );
    }

    // Handle single object (detail view)
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        return (
             <div className="w-full overflow-hidden rounded-md border p-4 space-y-3 bg-card shadow-sm">
                {Object.entries(data).map(([key, value]) => key !== 'id' && key !== '_ref' && (
                    <div key={key} className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm items-start border-b pb-2 last:border-0 last:pb-0">
                        <div className="font-black text-[10px] uppercase tracking-widest text-muted-foreground/60 md:text-right md:pr-4">
                            {key.replace(/_/g, ' ')}
                        </div>
                        <div className="md:col-span-3 min-w-0">
                            {isImageValue(key, value) ? (
                                <div className="relative h-24 w-40 bg-muted rounded overflow-hidden border">
                                    <img src={getImageUrl(value as string)} alt="Value Preview" className="h-full w-full object-contain" />
                                </div>
                            ) : typeof value === 'object' && value !== null ? (
                                <pre className="text-xs bg-muted/30 p-3 rounded-md overflow-x-auto max-w-full font-mono">
                                    <code>{JSON.stringify(value, null, 2)}</code>
                                </pre>
                            ) : (
                                <span className="text-[12px] font-semibold text-foreground break-words">{String(value)}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    }
    
    // Fallback for simple data types
    return (
        <div className="w-full overflow-x-auto min-w-0">
            <pre className="mt-2 max-h-[600px] overflow-auto rounded-md bg-secondary p-4 text-xs font-mono">
                <code>{typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)}</code>
            </pre>
        </div>
    );
}
