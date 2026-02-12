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

export function JsonDataVisualizer({ data, columns, onRowClick }: { data: any, columns?: {key: string, label: string}[], onRowClick?: (row: any) => void }) {
    if (!data || (Array.isArray(data) && data.length === 0)) {
        return <p className="text-muted-foreground p-4 text-center">No data to display.</p>;
    }

    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
        const headers = columns ? columns.map(c => c.label) : Object.keys(data[0]);
        const keys = columns ? columns.map(c => c.key) : headers;

        return (
            <div className="overflow-auto">
                <Table>
                    <TableHeader className="sticky top-0 bg-secondary z-10">
                        <TableRow>
                            {headers.map((header, idx) => <TableHead key={`${header}-${idx}`} className="whitespace-nowrap">{header}</TableHead>)}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((row, rowIndex) => (
                            <TableRow key={rowIndex} className={cn("odd:bg-muted/50", onRowClick && "cursor-pointer hover:bg-muted")} onClick={() => onRowClick?.(row)}>
                                {keys.map((key, colIndex) => (
                                    <TableCell key={`${rowIndex}-${colIndex}`} className="align-top text-sm">
                                        {typeof row[key] === 'object' && row[key] !== null ? (
                                            <pre className="text-xs bg-background p-2 rounded-md overflow-x-auto"><code>{JSON.stringify(row[key], null, 2)}</code></pre>
                                        ) : (
                                            <span className="truncate">{String(row[key] ?? '')}</span>
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

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        return (
             <div className="max-h-[600px] overflow-auto rounded-md border p-4 space-y-3 bg-secondary/30">
                {Object.entries(data).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm items-start">
                        <div className="font-semibold text-muted-foreground md:text-right md:pr-4">{key}</div>
                        <div className="md:col-span-3">
                            {typeof value === 'object' && value !== null ? (
                                <pre className="text-xs bg-background p-2 rounded-md overflow-x-auto"><code>{JSON.stringify(value, null, 2)}</code></pre>
                            ) : (
                                <span className="text-foreground break-words">{String(value)}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    }
    
    return <pre className="mt-2 max-h-[600px] overflow-auto rounded-md bg-secondary p-4 text-sm"><code>{typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)}</code></pre>;
}
