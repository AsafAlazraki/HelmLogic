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

    // Handle array of objects (standard table data)
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
        // Use provided columns or extract keys from the first row to preserve original document order.
        const keys = columns ? columns.map(c => c.key) : Object.keys(data[0]);
        const headers = columns ? columns.map(c => c.label) : keys;

        return (
            <div className="w-full min-w-0 max-w-full overflow-hidden">
                <Table className="w-full border-collapse">
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
                                    rowIndex % 2 === 0 ? "bg-background" : "bg-muted/10",
                                    onRowClick && "cursor-pointer hover:bg-primary/5"
                                )}
                                onClick={() => onRowClick?.(row)}
                            >
                                {keys.map((key, colIndex) => (
                                    <TableCell key={`${rowIndex}-${colIndex}`} className="align-top py-3 px-4 border-b/50">
                                        {typeof row[key] === 'object' && row[key] !== null ? (
                                            <pre className="text-[10px] font-mono bg-muted/50 p-2 rounded-md overflow-x-auto max-w-[300px]">
                                                <code>{JSON.stringify(row[key], null, 2)}</code>
                                            </pre>
                                        ) : (
                                            <div className="flex flex-col gap-0.5">
                                                <span className={cn(
                                                    "text-[11px] font-medium text-foreground whitespace-nowrap",
                                                    (key.toLowerCase().includes('code') || key.toLowerCase().includes('sku')) && "font-mono font-bold uppercase"
                                                )}>
                                                    {String(row[key] ?? '')}
                                                </span>
                                            </div>
                                        )}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        );
    }

    // Handle single object (detail view)
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        return (
             <div className="w-full overflow-hidden rounded-md border p-4 space-y-3 bg-card shadow-sm">
                {Object.entries(data).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm items-start border-b pb-2 last:border-0 last:pb-0">
                        <div className="font-black text-[10px] uppercase tracking-widest text-muted-foreground/60 md:text-right md:pr-4">
                            {key.replace(/_/g, ' ')}
                        </div>
                        <div className="md:col-span-3 min-w-0">
                            {typeof value === 'object' && value !== null ? (
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