
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useFirestore, useMemoFirebase } from '@/firebase/provider';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { 
    Loader2, 
    Save, 
    ChevronLeft, 
    Plus, 
    Type, 
    ImageIcon, 
    Table as TableIcon, 
    Variable, 
    Trash2, 
    Layout, 
    GripVertical, 
    Maximize2,
    Settings2,
    ArrowUp,
    ArrowDown,
    Layers,
    Zap,
    Ship,
    ZoomIn,
    ZoomOut,
    PanelBottom,
    PanelTop,
    X,
    Anchor,
    BoxSelect,
    Columns,
    LayoutGrid,
    List,
    CheckCircle2,
    Package
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Image from 'next/image';

interface TemplateBlock {
    id: string;
    type: 'text' | 'image' | 'table' | 'variable' | 'grid' | 'quoteItems';
    content: any;
    style?: any;
    order: number;
    dataSource?: string; 
    zone?: 'header' | 'body' | 'footer';
    layoutConfig?: {
        columns?: number;
        spacing?: number;
        displayStyle?: 'list' | 'grid' | 'table';
        showImages?: boolean;
        showSku?: boolean;
        showDescription?: boolean;
        showPrice?: boolean;
    };
}

interface TemplatePage {
    id: string;
    blocks: TemplateBlock[];
    headerHeight: number; // in mm
    footerHeight: number; // in mm
    order: number;
}

function CanvasBlock({ block, isSelected, onSelect, onDelete }: { block: TemplateBlock, isSelected: boolean, onSelect: () => void, onDelete: () => void }) {
    const isBound = !!block.dataSource && block.dataSource !== 'manual';

    return (
        <div 
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className={cn(
                "group relative p-6 rounded-2xl transition-all cursor-pointer border-2 border-transparent",
                isSelected ? "ring-4 ring-primary/40 bg-primary/5 shadow-2xl border-primary/20 scale-[1.01]" : "hover:bg-slate-50 hover:border-slate-100"
            )}
        >
            <div className="absolute -left-10 top-1/2 -translate-y-1/2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all">
                <Button variant="ghost" size="icon" className="h-8 w-8 bg-white shadow-xl border-2 text-slate-400 hover:text-primary rounded-xl"><GripVertical className="h-4 w-4" /></Button>
            </div>

            {isSelected && (
                <div className="absolute -right-3 -top-3 flex items-center gap-2 animate-in zoom-in-95 z-20">
                    <Button variant="destructive" size="icon" className="h-8 w-8 rounded-full shadow-2xl border-2 border-white" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
            )}

            <div className="min-h-[32px]">
                {isBound && (
                    <div className="mb-4 flex items-center gap-2">
                        <Badge className="bg-primary text-white border-none text-[8px] font-black uppercase tracking-[0.2em] px-2.5 h-5 shadow-lg">
                            <Zap className="h-2.5 w-2.5 mr-1.5 fill-current" /> Bound: {block.dataSource?.replace('.', ' • ').toUpperCase()}
                        </Badge>
                    </div>
                )}

                {block.type === 'text' && (
                    <div className="text-base text-slate-900 leading-relaxed font-medium">
                        {block.content}
                    </div>
                )}
                {block.type === 'image' && (
                    <div className="aspect-video w-full bg-slate-100 rounded-3xl flex flex-col items-center justify-center border-2 border-dashed border-slate-200 overflow-hidden relative group/asset">
                        {isBound ? (
                            <div className="flex flex-col items-center justify-center gap-4 text-primary">
                                <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center animate-pulse">
                                    <Ship className="h-8 w-8" />
                                </div>
                                <div className="text-center">
                                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-primary">Dynamic Asset Proxy</p>
                                    <p className="text-[9px] font-bold text-primary/40 uppercase mt-1">Resolution confirmed at runtime</p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-3">
                                <ImageIcon className="h-10 w-10 text-slate-300" />
                                <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Static Image Component</p>
                            </div>
                        )}
                    </div>
                )}
                {block.type === 'variable' && (
                    <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-primary/5 border-2 border-primary/20 text-primary shadow-sm">
                        <Variable className="h-4 w-4" />
                        <span className="text-[11px] font-black uppercase tracking-[0.1em] italic">{isBound ? `{${block.dataSource?.toUpperCase()}}` : '{UNMAPPED_VARIABLE}'}</span>
                    </div>
                )}
                {block.type === 'grid' && (
                    <div className={cn("grid gap-6", `grid-cols-${block.layoutConfig?.columns || 2}`)}>
                        {Array.from({ length: block.layoutConfig?.columns || 2 }).map((_, i) => (
                            <div key={i} className="min-h-[80px] border-2 border-dashed border-slate-100 rounded-2xl flex items-center justify-center">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-200">Column {i + 1}</span>
                            </div>
                        ))}
                    </div>
                )}
                {block.type === 'quoteItems' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between border-b-2 border-slate-100 pb-4">
                            <h4 className="font-black uppercase text-sm italic text-primary flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                Dynamic Quote Product List
                            </h4>
                            <Badge variant="outline" className="text-[8px] font-black uppercase">{block.layoutConfig?.displayStyle || 'list'} Layout</Badge>
                        </div>
                        {block.layoutConfig?.displayStyle === 'grid' ? (
                            <div className={cn("grid gap-4", `grid-cols-${block.layoutConfig?.columns || 2}`)}>
                                {[1, 2, 3, 4].slice(0, block.layoutConfig?.columns || 2).map(i => (
                                    <div key={i} className="border-2 rounded-2xl p-4 space-y-3 bg-slate-50/50">
                                        {block.layoutConfig?.showImages && <div className="aspect-square bg-slate-200 rounded-xl animate-pulse" />}
                                        <div className="space-y-1">
                                            <div className="h-3 w-3/4 bg-slate-300 rounded" />
                                            {block.layoutConfig?.showSku && <div className="h-2 w-1/2 bg-slate-200 rounded" />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="flex items-center gap-4 p-4 border-2 rounded-xl bg-slate-50/50">
                                        {block.layoutConfig?.showImages && <div className="h-12 w-12 bg-slate-200 rounded-lg animate-pulse shrink-0" />}
                                        <div className="flex-1 space-y-1">
                                            <div className="h-3 w-1/3 bg-slate-300 rounded" />
                                            {block.layoutConfig?.showDescription && <div className="h-2 w-full bg-slate-200 rounded" />}
                                        </div>
                                        {block.layoutConfig?.showPrice && <div className="h-4 w-16 bg-primary/10 rounded animate-pulse" />}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {block.type === 'table' && (
                    <div className="grid grid-cols-3 gap-px bg-slate-200 border-2 rounded-2xl overflow-hidden shadow-inner">
                        {[1,2,3,4,5,6,7,8,9].map(i => (
                            <div key={i} className="h-10 bg-white" />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function TemplateEditorPage() {
    const params = useParams();
    const router = useRouter();
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const moduleId = params.id as string;
    const templateId = params.templateId as string;

    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile } = useDoc<any>(userProfileRef);
    const orgId = userProfile?.organisationId;

    const templateRef = useMemoFirebase(() => 
        orgId ? doc(firestore, `organisations/${orgId}/templates`, templateId) : null,
    [firestore, orgId, templateId]);
    const { data: template, loading: templateLoading } = useDoc<any>(templateRef);

    const [pages, setPages] = useState<TemplatePage[]>([]);
    const [zoom, setZoom] = useState(0.85);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
    const isInitialLoad = useRef(true);

    useEffect(() => {
        if (template?.pages && isInitialLoad.current) {
            setPages(template.pages);
            if (template.pages.length > 0) {
                setSelectedPageId(template.pages[0].id);
            }
            isInitialLoad.current = false;
        }
    }, [template]);

    const handleSave = async () => {
        if (!orgId || !template) return;
        setIsSaving(true);
        try {
            await setDoc(templateRef!, { 
                pages,
                updatedAt: serverTimestamp() 
            }, { merge: true });
            
            toast({ title: "Template Persisted", description: "All structural changes have been synchronized." });
        } catch (e) {
            toast({ variant: 'destructive', title: "Save Failed" });
        } finally {
            setIsSaving(false);
        }
    };

    const addPage = () => {
        const nextOrder = pages.length + 1;
        const newPageId = `page-${Date.now()}`;
        const newPage: TemplatePage = {
            id: newPageId,
            blocks: [],
            headerHeight: 20,
            footerHeight: 20,
            order: nextOrder
        };
        setPages(prev => [...prev, newPage]);
        setSelectedPageId(newPageId);
    };

    const removePage = (pageId: string) => {
        if (pages.length <= 1) {
            toast({ variant: 'destructive', title: "Action Blocked", description: "A template must have at least one page." });
            return;
        }
        setPages(prev => {
            const filtered = prev.filter(p => p.id !== pageId);
            return filtered.map((p, idx) => ({ ...p, order: idx + 1 }));
        });
        if (selectedPageId === pageId) {
            setSelectedPageId(pages.find(p => p.id !== pageId)?.id || null);
        }
        setSelectedBlockId(null);
    };

    const addBlock = (pageId: string, type: TemplateBlock['type'], zone: TemplateBlock['zone'] = 'body') => {
        const newBlockId = `block-${Date.now()}`;
        setPages(prev => prev.map(p => {
            if (p.id !== pageId) return p;
            const newBlock: TemplateBlock = {
                id: newBlockId,
                type,
                zone,
                order: p.blocks.length + 1,
                content: type === 'text' ? 'Double click to edit text...' : 
                         type === 'image' ? { source: 'user', url: null } :
                         type === 'variable' ? { source: 'quote', field: '' } :
                         type === 'grid' ? { columns: 2 } :
                         type === 'quoteItems' ? { items: [] } :
                         { rows: 3, cols: 3, data: [] },
                layoutConfig: type === 'grid' ? { columns: 2 } : 
                             type === 'quoteItems' ? { displayStyle: 'list', columns: 2, showImages: true, showSku: true, showDescription: true, showPrice: true } :
                             undefined
            };
            return { ...p, blocks: [...p.blocks, newBlock] };
        }));
        setSelectedBlockId(newBlockId);
    };

    const updateBlock = (blockId: string, updates: Partial<TemplateBlock>) => {
        setPages(prev => prev.map(p => ({
            ...p,
            blocks: p.blocks.map(b => {
                if (b.id !== blockId) return b;
                const next = { ...b, ...updates };
                if (updates.layoutConfig) {
                    next.layoutConfig = { ...(b.layoutConfig || {}), ...updates.layoutConfig };
                }
                return next;
            })
        })));
    };

    const updatePage = (pageId: string, updates: Partial<TemplatePage>) => {
        setPages(prev => prev.map(p => p.id === pageId ? { ...p, ...updates } : p));
    };

    const removeBlock = (pageId: string, blockId: string) => {
        setPages(prev => prev.map(p => {
            if (p.id !== pageId) return p;
            return { ...p, blocks: p.blocks.filter(b => b.id !== blockId) };
        }));
        if (selectedBlockId === blockId) setSelectedBlockId(null);
    };

    const selectedBlock = useMemo(() => {
        for (const p of pages) {
            const b = p.blocks.find(block => block.id === selectedBlockId);
            if (b) return { block: b, pageId: p.id };
        }
        return null;
    }, [pages, selectedBlockId]);

    const activePage = useMemo(() => pages.find(p => p.id === selectedPageId), [pages, selectedPageId]);

    if (templateLoading) {
        return <div className="flex h-screen w-full items-center justify-center bg-slate-950"><Loader2 className="h-16 w-16 animate-spin text-primary" /></div>;
    }

    if (!template) {
        return <div className="p-12 text-center font-bold text-white bg-slate-950 h-screen flex items-center justify-center">Template Context Lost or Access Denied.</div>;
    }

    const dataSources = [
        { id: 'quote.coverImage', label: 'Quote: Main Cover Render' },
        { id: 'quote.totalPrice', label: 'Quote: Total Price (Excl. GST)' },
        { id: 'quote.modelName', label: 'Quote: Model Series Name' },
        { id: 'quote.specs', label: 'Quote: Full Spec Table' },
        { id: 'org.logo', label: 'Dealer: Primary Logo' },
        { id: 'org.secondaryLogo', label: 'Dealer: Icon / Secondary Logo' },
        { id: 'org.name', label: 'Dealer: Company Name' },
        { id: 'org.abn', label: 'Dealer: ABN' },
        { id: 'module.brandLogo', label: 'Module: Primary Brand Logo' }
    ];

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-slate-900 text-slate-100">
            <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-xl px-8 flex items-center justify-between shrink-0 z-50 shadow-2xl">
                <div className="flex items-center gap-6">
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-400 hover:text-white transition-colors" onClick={() => router.back()}>
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <div className="h-8 w-px bg-slate-800" />
                    <div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="h-5 text-[8px] font-black uppercase border-primary/20 text-primary bg-primary/10 tracking-widest">{template.type}</Badge>
                            <h1 className="font-black uppercase tracking-tight text-sm italic">{template.name}</h1>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em] mt-0.5">TEMPLATE DESIGNER</p>
                    </div>
                </div>

                <div className="flex items-center gap-8">
                    <div className="flex items-center bg-slate-800/50 rounded-xl p-1 border border-slate-700 shadow-inner">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white" onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}><ZoomOut className="h-4 w-4" /></Button>
                        <span className="text-[10px] font-black w-14 text-center uppercase tracking-tighter text-slate-300">{Math.round(zoom * 100)}%</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white" onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}><ZoomIn className="h-4 w-4" /></Button>
                    </div>

                    <Button 
                        onClick={handleSave} 
                        disabled={isSaving}
                        className="h-10 px-8 rounded-xl font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl bg-primary text-white hover:scale-[1.03] transition-all"
                    >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        Persist Template
                    </Button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                <aside className="w-72 border-r border-slate-800 bg-slate-900 flex flex-col shrink-0">
                    <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Component Factory</h3>
                        <Zap className="h-3 w-3 text-primary animate-pulse" />
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-6 space-y-8">
                            <div className="space-y-3">
                                <Label className="text-[9px] font-black uppercase text-slate-600 tracking-widest">Layout Elements</Label>
                                <div className="grid grid-cols-2 gap-3">
                                    <ToolButton icon={Columns} label="Columns" onClick={() => selectedPageId && addBlock(selectedPageId, 'grid')} />
                                    <ToolButton icon={Package} label="Products" onClick={() => selectedPageId && addBlock(selectedPageId, 'quoteItems')} />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Label className="text-[9px] font-black uppercase text-slate-600 tracking-widest">Standard Elements</Label>
                                <div className="grid grid-cols-2 gap-3">
                                    <ToolButton icon={Type} label="Text" onClick={() => selectedPageId && addBlock(selectedPageId, 'text')} />
                                    <ToolButton icon={ImageIcon} label="Image" onClick={() => selectedPageId && addBlock(selectedPageId, 'image')} />
                                    <ToolButton icon={TableIcon} label="Table" onClick={() => selectedPageId && addBlock(selectedPageId, 'table')} />
                                    <ToolButton icon={Variable} label="Variable" onClick={() => selectedPageId && addBlock(selectedPageId, 'variable')} />
                                </div>
                            </div>

                            <Separator className="bg-slate-800" />

                            <div className="space-y-3">
                                <div className="flex items-center justify-between mb-1">
                                    <Label className="text-[9px] font-black uppercase text-slate-600 tracking-widest">Template Flow</Label>
                                    <Badge variant="outline" className="h-4 text-[7px] font-black border-slate-700 text-slate-500 uppercase">{pages.length} Pages</Badge>
                                </div>
                                <div className="space-y-2">
                                    {pages.map((p, idx) => (
                                        <div 
                                            key={p.id} 
                                            onClick={() => setSelectedPageId(p.id)}
                                            className={cn(
                                                "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group",
                                                selectedPageId === p.id ? "bg-primary/10 border-primary/50 shadow-lg" : "bg-slate-800/50 border-slate-700/50 hover:border-slate-600"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-black", selectedPageId === p.id ? "bg-primary text-white" : "bg-slate-700 text-slate-400")}>
                                                    {idx + 1}
                                                </div>
                                                <span className={cn("text-[10px] font-black uppercase", selectedPageId === p.id ? "text-primary" : "text-slate-400")}>Page {idx + 1}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge className="h-4 px-1.5 text-[8px] font-black opacity-50">{p.blocks.length} Items</Badge>
                                                {pages.length > 1 && (
                                                    <Button 
                                                        variant="ghost" 
                                                        size="icon" 
                                                        className="h-6 w-6 text-slate-500 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={(e) => { e.stopPropagation(); removePage(p.id); }}
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    <Button 
                                        variant="ghost" 
                                        onClick={addPage}
                                        className="w-full h-12 border-2 border-dashed border-slate-800 text-slate-500 hover:text-primary hover:border-primary transition-all text-[10px] font-black uppercase tracking-widest rounded-xl mt-4 bg-slate-800/20"
                                    >
                                        <Plus className="h-4 w-4 mr-2" /> Append New Page
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                </aside>

                <main className="flex-1 bg-slate-950 p-12 overflow-auto scrollbar-thin pattern-dots-dark">
                    <div 
                        className="flex flex-col items-center gap-16 pb-64 transition-transform origin-top duration-300"
                        style={{ transform: `scale(${zoom})` }}
                    >
                        {pages.map((page) => (
                            <div 
                                key={page.id} 
                                onClick={() => setSelectedPageId(page.id)}
                                className={cn(
                                    "relative bg-white w-[210mm] min-h-[297mm] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] border border-slate-200 flex flex-col transition-all",
                                    selectedPageId === page.id ? "ring-4 ring-primary ring-offset-8 ring-offset-slate-950" : ""
                                )}
                            >
                                <div className="absolute -left-16 top-0 flex flex-col gap-3">
                                    <Badge variant="secondary" className="bg-slate-800 text-white border-none font-black h-10 w-10 rounded-2xl flex items-center justify-center p-0 shadow-2xl text-lg">{page.order}</Badge>
                                    {pages.length > 1 && (
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="bg-slate-800 text-white hover:bg-destructive hover:text-white h-10 w-10 rounded-2xl shadow-2xl opacity-0 hover:opacity-100 transition-opacity"
                                            onClick={(e) => { e.stopPropagation(); removePage(page.id); }}
                                        >
                                            <Trash2 className="h-5 w-5" />
                                        </Button>
                                    )}
                                </div>

                                <div 
                                    className="w-full border-b border-slate-100 bg-slate-50/30 flex flex-col items-center justify-center relative group/header overflow-hidden px-[20mm]"
                                    style={{ height: `${page.headerHeight}mm` }}
                                >
                                    <div className="absolute inset-0 border-2 border-transparent group-hover/header:border-primary/20 transition-all pointer-events-none" />
                                    {page.blocks.filter(b => b.zone === 'header').length === 0 ? (
                                        <span className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-300 opacity-0 group-hover/header:opacity-100 transition-opacity">Header Zone ({page.headerHeight}mm)</span>
                                    ) : (
                                        <div className="w-full flex flex-col gap-4">
                                            {page.blocks.filter(b => b.zone === 'header').sort((a,b) => a.order - b.order).map((block) => (
                                                <CanvasBlock 
                                                    key={block.id} 
                                                    block={block} 
                                                    isSelected={selectedBlockId === block.id}
                                                    onSelect={() => { setSelectedBlockId(block.id); setSelectedPageId(page.id); }}
                                                    onDelete={() => removeBlock(page.id, block.id)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="absolute bottom-1 right-1 h-6 w-6 opacity-0 group-hover/header:opacity-100 transition-opacity bg-primary text-white"
                                        onClick={(e) => { e.stopPropagation(); addBlock(page.id, 'text', 'header'); }}
                                    >
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </div>

                                <div className="flex-1 flex flex-col gap-8 p-[20mm] text-slate-900">
                                    {page.blocks.filter(b => !b.zone || b.zone === 'body').length === 0 ? (
                                        <div className="flex-1 border-2 border-dashed border-slate-100 rounded-[3rem] flex flex-col items-center justify-center text-center gap-6 opacity-20 hover:opacity-40 transition-opacity">
                                            <Layout className="h-16 w-16" />
                                            <div className="space-y-1">
                                                <p className="text-xs font-black uppercase tracking-[0.3em]">Initialize Structure</p>
                                                <p className="text-[10px] font-bold uppercase text-slate-400">Drag components from the factory</p>
                                            </div>
                                        </div>
                                    ) : (
                                        page.blocks.filter(b => !b.zone || b.zone === 'body').sort((a,b) => a.order - b.order).map((block) => (
                                            <CanvasBlock 
                                                key={block.id} 
                                                block={block} 
                                                isSelected={selectedBlockId === block.id}
                                                onSelect={() => { setSelectedBlockId(block.id); setSelectedPageId(page.id); }}
                                                onDelete={() => removeBlock(page.id, block.id)}
                                            />
                                        ))
                                    )}
                                </div>

                                <div 
                                    className="mt-auto w-full border-t border-slate-100 bg-slate-50/30 flex flex-col items-center justify-center relative group/footer overflow-hidden px-[20mm]"
                                    style={{ height: `${page.footerHeight}mm` }}
                                >
                                    <div className="absolute inset-0 border-2 border-transparent group-hover/footer:border-primary/20 transition-all pointer-events-none" />
                                    {page.blocks.filter(b => b.zone === 'footer').length === 0 ? (
                                        <span className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-300 opacity-0 group-hover/footer:opacity-100 transition-opacity">Footer Zone ({page.footerHeight}mm)</span>
                                    ) : (
                                        <div className="w-full flex flex-col gap-4">
                                            {page.blocks.filter(b => b.zone === 'footer').sort((a,b) => a.order - b.order).map((block) => (
                                                <CanvasBlock 
                                                    key={block.id} 
                                                    block={block} 
                                                    isSelected={selectedBlockId === block.id}
                                                    onSelect={() => { setSelectedBlockId(block.id); setSelectedPageId(page.id); }}
                                                    onDelete={() => removeBlock(page.id, block.id)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover/footer:opacity-100 transition-opacity bg-primary text-white"
                                        onClick={(e) => { e.stopPropagation(); addBlock(page.id, 'text', 'footer'); }}
                                    >
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </main>

                <aside className="w-80 border-l border-slate-800 bg-slate-900 flex flex-col shrink-0 shadow-2xl">
                    <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Property Matrix</h3>
                        <Settings2 className="h-3 w-3 text-slate-600" />
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-6">
                            {!selectedBlockId && activePage ? (
                                <div className="w-full space-y-8 animate-in fade-in slide-in-from-right-2">
                                    <div className="space-y-4">
                                        <h4 className="text-[11px] font-black uppercase tracking-widest text-primary border-l-4 border-primary pl-3">Global Page Setup</h4>
                                        <div className="p-5 rounded-2xl bg-slate-800/50 border border-slate-700 space-y-6">
                                            <div className="space-y-3">
                                                <Label className="text-[9px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                                                    <PanelTop className="h-3 w-3" />
                                                    Header Height (mm)
                                                </Label>
                                                <Input 
                                                    type="number" 
                                                    value={activePage.headerHeight} 
                                                    onChange={(e) => updatePage(activePage.id, { headerHeight: parseInt(e.target.value) || 0 })}
                                                    className="h-11 bg-slate-900 border-slate-700 font-black text-primary text-center rounded-xl text-white" 
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <Label className="text-[9px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                                                    <PanelBottom className="h-3 w-3" />
                                                    Footer Height (mm)
                                                </Label>
                                                <Input 
                                                    type="number" 
                                                    value={activePage.footerHeight} 
                                                    onChange={(e) => updatePage(activePage.id, { footerHeight: parseInt(e.target.value) || 0 })}
                                                    className="h-11 bg-slate-900 border-slate-700 font-black text-primary text-center rounded-xl text-white" 
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : selectedBlock ? (
                                <div className="w-full space-y-8 animate-in fade-in slide-in-from-right-2">
                                    <div className="space-y-4">
                                        <h4 className="text-[11px] font-black uppercase tracking-widest text-primary border-l-4 border-primary pl-3">Component Settings</h4>
                                        
                                        {selectedBlock.block.type === 'grid' && (
                                            <div className="p-5 rounded-2xl bg-slate-800/50 border border-slate-700 space-y-4">
                                                <div className="space-y-2">
                                                    <Label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Column Density</Label>
                                                    <Select 
                                                        value={String(selectedBlock.block.layoutConfig?.columns || 2)} 
                                                        onValueChange={(v) => updateBlock(selectedBlockId!, { layoutConfig: { columns: parseInt(v) } })}
                                                    >
                                                        <SelectTrigger className="h-12 bg-slate-900 border-slate-700 text-[10px] font-black uppercase rounded-xl text-white">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-slate-900 border-slate-700 text-white rounded-xl">
                                                            <SelectItem value="1" className="text-[10px] font-black uppercase">1 Column (Full)</SelectItem>
                                                            <SelectItem value="2" className="text-[10px] font-black uppercase">2 Columns (Split)</SelectItem>
                                                            <SelectItem value="3" className="text-[10px] font-black uppercase">3 Columns (Dense)</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        )}

                                        {selectedBlock.block.type === 'quoteItems' && (
                                            <div className="p-5 rounded-2xl bg-slate-800/50 border border-slate-700 space-y-6">
                                                <div className="space-y-2">
                                                    <Label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Display Mode</Label>
                                                    <Tabs 
                                                        value={selectedBlock.block.layoutConfig?.displayStyle || 'list'} 
                                                        onValueChange={(v: any) => updateBlock(selectedBlockId!, { layoutConfig: { displayStyle: v } })}
                                                    >
                                                        <TabsList className="bg-slate-950 p-1 rounded-lg w-full h-10">
                                                            <TabsTrigger value="list" className="flex-1 text-[8px] font-black uppercase"><List className="h-3 w-3 mr-1" /> List</TabsTrigger>
                                                            <TabsTrigger value="grid" className="flex-1 text-[8px] font-black uppercase"><LayoutGrid className="h-3 w-3 mr-1" /> Grid</TabsTrigger>
                                                        </TabsList>
                                                    </Tabs>
                                                </div>

                                                {selectedBlock.block.layoutConfig?.displayStyle === 'grid' && (
                                                    <div className="space-y-2">
                                                        <Label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Grid Columns</Label>
                                                        <Select 
                                                            value={String(selectedBlock.block.layoutConfig?.columns || 2)} 
                                                            onValueChange={(v) => updateBlock(selectedBlockId!, { layoutConfig: { columns: parseInt(v) } })}
                                                        >
                                                            <SelectTrigger className="h-10 bg-slate-900 border-slate-700 text-[10px] font-black uppercase rounded-xl text-white">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent className="bg-slate-900 border-slate-700 text-white rounded-xl">
                                                                <SelectItem value="2" className="text-[10px] font-black uppercase">2 Columns</SelectItem>
                                                                <SelectItem value="3" className="text-[10px] font-black uppercase">3 Columns</SelectItem>
                                                                <SelectItem value="4" className="text-[10px] font-black uppercase">4 Columns</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}

                                                <div className="space-y-3">
                                                    <Label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Visible Data Fields</Label>
                                                    <div className="grid gap-2">
                                                        <ToggleOption 
                                                            label="Product Image" 
                                                            checked={selectedBlock.block.layoutConfig?.showImages} 
                                                            onChange={(v) => updateBlock(selectedBlockId!, { layoutConfig: { showImages: v } })}
                                                        />
                                                        <ToggleOption 
                                                            label="Part Code / SKU" 
                                                            checked={selectedBlock.block.layoutConfig?.showSku} 
                                                            onChange={(v) => updateBlock(selectedBlockId!, { layoutConfig: { showSku: v } })}
                                                        />
                                                        <ToggleOption 
                                                            label="Extended Description" 
                                                            checked={selectedBlock.block.layoutConfig?.showDescription} 
                                                            onChange={(v) => updateBlock(selectedBlockId!, { layoutConfig: { showDescription: v } })}
                                                        />
                                                        <ToggleOption 
                                                            label="Unit Price" 
                                                            checked={selectedBlock.block.layoutConfig?.showPrice} 
                                                            onChange={(v) => updateBlock(selectedBlockId!, { layoutConfig: { showPrice: v } })}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="p-5 rounded-2xl bg-slate-800/50 border border-slate-700 space-y-4">
                                            <div className="space-y-2">
                                                <Label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Dynamic Data Binding</Label>
                                                <Select 
                                                    value={selectedBlock.block.dataSource || 'manual'} 
                                                    onValueChange={(v) => updateBlock(selectedBlockId!, { dataSource: v })}
                                                >
                                                    <SelectTrigger className="h-12 bg-slate-900 border-slate-700 text-[10px] font-black uppercase tracking-tighter rounded-xl text-white">
                                                        <SelectValue placeholder="Manual Entry Only" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-slate-900 border-slate-700 text-white rounded-xl shadow-2xl">
                                                        <SelectItem value="manual" className="text-[10px] font-black uppercase py-3">Static / Manual Value</SelectItem>
                                                        {dataSources.map(ds => (
                                                            <SelectItem key={ds.id} value={ds.id} className="text-[10px] font-black uppercase py-3">{ds.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>

                                    <Separator className="bg-slate-800" />

                                    <div className="space-y-4">
                                        <h4 className="text-[11px] font-black uppercase tracking-widest text-primary border-l-4 border-primary pl-3">Positional Meta</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Display Order</Label>
                                                <Input 
                                                    type="number" 
                                                    value={selectedBlock.block.order} 
                                                    onChange={(e) => updateBlock(selectedBlockId!, { order: parseInt(e.target.value) || 0 })}
                                                    className="h-11 bg-slate-800 border-slate-700 font-black text-center rounded-xl text-white" 
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center text-center opacity-30 gap-4 py-12 border-2 border-dashed border-slate-800 rounded-3xl">
                                    <BoxSelect className="h-8 w-8 text-white" />
                                    <p className="text-[9px] font-black uppercase tracking-widest leading-relaxed px-8 text-white">Select a canvas element to modify positional meta</p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </aside>
            </div>
            
            <style jsx global>{`
                .pattern-dots-dark {
                    background-image: radial-gradient(rgba(255,255,255,0.1) 1.5px, transparent 1.5px);
                    background-size: 30px 30px;
                }
            `}</style>
        </div>
    );
}

function ToolButton({ icon: Icon, label, onClick }: any) {
    return (
        <button 
            type="button"
            onClick={onClick}
            className="flex flex-col items-center justify-center gap-3 p-5 rounded-3xl bg-slate-800/50 border-2 border-slate-700/50 hover:bg-primary/10 hover:border-primary/50 transition-all group active:scale-95"
        >
            <Icon className="h-6 w-6 text-slate-400 group-hover:text-primary transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-primary-foreground">{label}</span>
        </button>
    );
}

function ToggleOption({ label, checked, onChange }: { label: string, checked?: boolean, onChange: (v: boolean) => void }) {
    return (
        <div 
            onClick={() => onChange(!checked)}
            className={cn(
                "flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all",
                checked ? "bg-primary/10 border-primary/40" : "bg-slate-900 border-slate-800 hover:border-slate-700"
            )}
        >
            <span className={cn("text-[9px] font-black uppercase tracking-widest", checked ? "text-primary" : "text-slate-500")}>{label}</span>
            {checked ? <CheckCircle2 className="h-3 w-3 text-primary" /> : <div className="h-3 w-3 rounded-full border-2 border-slate-700" />}
        </div>
    );
}
