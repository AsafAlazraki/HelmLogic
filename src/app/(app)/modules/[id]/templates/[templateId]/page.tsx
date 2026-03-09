'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo, useEffect } from 'react';
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
    FileText,
    ArrowUp,
    ArrowDown,
    Palette,
    Layers,
    Waves,
    Zap,
    CircleDashed,
    BoxSelect
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

interface TemplateBlock {
    id: string;
    type: 'text' | 'image' | 'table' | 'variable';
    content: any;
    style?: any;
    order: number;
    dataSource?: string; // e.g. 'module.coverImage', 'quote.totalPrice'
}

interface TemplatePage {
    id: string;
    blocks: TemplateBlock[];
    order: number;
}

export default function TemplateEditorPage() {
    const params = useParams();
    const router = useRouter();
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const moduleId = params.id as string;
    const templateId = params.templateId as string;

    const templateRef = useMemoFirebase(() => 
        user ? doc(firestore, `users/${user.uid}/templates`, templateId) : null,
    [firestore, user, templateId]);
    const { data: template, loading: templateLoading } = useDoc<any>(templateRef);

    const [pages, setPages] = useState<TemplatePage[]>([
        { id: 'page-1', blocks: [], order: 1 }
    ]);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

    const handleSave = async () => {
        if (!user || !template) return;
        setIsSaving(true);
        try {
            const contentRef = doc(firestore, `users/${user.uid}/templates/${templateId}/documentTemplateContent/document`);
            await setDoc(contentRef, {
                id: 'document',
                templateId,
                pages,
                lastUpdated: serverTimestamp()
            });
            
            await setDoc(templateRef!, { updatedAt: serverTimestamp() }, { merge: true });
            
            toast({ title: "Blueprint Saved", description: "Universal document architecture persisted." });
        } catch (e) {
            toast({ variant: 'destructive', title: "Save Failed" });
        } finally {
            setIsSaving(false);
        }
    };

    const addBlock = (pageId: string, type: TemplateBlock['type']) => {
        setPages(prev => prev.map(p => {
            if (p.id !== pageId) return p;
            const newBlock: TemplateBlock = {
                id: `block-${Date.now()}`,
                type,
                order: p.blocks.length + 1,
                content: type === 'text' ? 'Double click to edit text...' : 
                         type === 'image' ? { source: 'user', url: null } :
                         type === 'variable' ? { source: 'quote', field: '' } :
                         { rows: 3, cols: 3, data: [] }
            };
            return { ...p, blocks: [...p.blocks, newBlock] };
        }));
    };

    const updateBlock = (blockId: string, updates: Partial<TemplateBlock>) => {
        setPages(prev => prev.map(p => ({
            ...p,
            blocks: p.blocks.map(b => b.id === blockId ? { ...b, ...updates } : b)
        })));
    };

    const removeBlock = (pageId: string, blockId: string) => {
        setPages(prev => prev.map(p => {
            if (p.id !== pageId) return p;
            return { ...p, blocks: p.blocks.filter(b => b.id !== blockId) };
        }));
    };

    const selectedBlock = useMemo(() => {
        for (const p of pages) {
            const b = p.blocks.find(block => block.id === selectedBlockId);
            if (b) return { block: b, pageId: p.id };
        }
        return null;
    }, [pages, selectedBlockId]);

    if (templateLoading) {
        return <div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }

    if (!template) {
        return <div className="p-12 text-center font-bold">Template Context Lost.</div>;
    }

    const dataSources = [
        { id: 'quote.coverImage', label: 'Quote: Main Cover Render' },
        { id: 'quote.totalPrice', label: 'Quote: Total Price (Excl. GST)' },
        { id: 'quote.modelName', label: 'Quote: Model Series Name' },
        { id: 'quote.specs', label: 'Quote: Full Spec Table' },
        { id: 'org.logo', label: 'Dealer: Primary Logo' },
        { id: 'org.name', label: 'Dealer: Company Name' }
    ];

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-slate-900 text-slate-100">
            {/* Precision Header */}
            <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl px-8 flex items-center justify-between shrink-0 z-50">
                <div className="flex items-center gap-6">
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-400 hover:text-white" onClick={() => router.back()}>
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <div className="h-8 w-px bg-slate-800" />
                    <div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="h-5 text-[8px] font-black uppercase border-primary/20 text-primary bg-primary/10">{template.type}</Badge>
                            <h1 className="font-black uppercase tracking-tight text-sm italic">{template.name}</h1>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">BLUEPRINT ARCHITECTURE</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <Button 
                        onClick={handleSave} 
                        disabled={isSaving}
                        className="h-10 px-8 rounded-xl font-black uppercase tracking-[0.2em] text-[10px] shadow-2xl bg-primary text-white hover:scale-[1.03] transition-all"
                    >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        Persist Blueprint
                    </Button>
                </div>
            </header>

            <div className="flex-1 flex overflow-hidden">
                {/* Component Factory Sidebar */}
                <aside className="w-72 border-r border-slate-800 bg-slate-900 flex flex-col shrink-0">
                    <div className="p-6 border-b border-slate-800 bg-slate-900/50">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Component Factory</h3>
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-6 space-y-8">
                            <div className="space-y-3">
                                <Label className="text-[9px] font-black uppercase text-slate-600 tracking-widest">Structural Elements</Label>
                                <div className="grid grid-cols-2 gap-3">
                                    <ToolButton icon={Type} label="Text" onClick={() => addBlock('page-1', 'text')} />
                                    <ToolButton icon={ImageIcon} label="Image" onClick={() => addBlock('page-1', 'image')} />
                                    <ToolButton icon={TableIcon} label="Table" onClick={() => addBlock('page-1', 'table')} />
                                    <ToolButton icon={Variable} label="Variable" onClick={() => addBlock('page-1', 'variable')} />
                                </div>
                            </div>

                            <Separator className="bg-slate-800" />

                            <div className="space-y-3">
                                <Label className="text-[9px] font-black uppercase text-slate-600 tracking-widest">Document Navigation</Label>
                                <div className="space-y-2">
                                    {pages.map((p, idx) => (
                                        <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-primary/50 transition-all cursor-pointer group">
                                            <span className="text-[10px] font-black uppercase text-slate-400">Page {idx + 1}</span>
                                            <Badge className="h-4 px-1.5 text-[8px] font-black">{p.blocks.length} Blocks</Badge>
                                        </div>
                                    ))}
                                    <Button variant="ghost" className="w-full h-10 border-2 border-dashed border-slate-800 text-slate-500 hover:text-primary hover:border-primary transition-all text-[10px] font-black uppercase tracking-widest">
                                        <Plus className="h-3.5 w-3.5 mr-2" /> Add Page
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                </aside>

                {/* Main A4 Workspace */}
                <main className="flex-1 bg-slate-950 p-12 overflow-auto scrollbar-thin">
                    <div className="flex flex-col items-center gap-12 pb-32">
                        {pages.map((page) => (
                            <div 
                                key={page.id} 
                                className="relative bg-white w-[210mm] min-h-[297mm] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] flex flex-col p-[20mm] text-slate-900"
                            >
                                <div className="absolute -left-12 top-0 flex flex-col gap-2">
                                    <Badge variant="secondary" className="bg-slate-800 text-white border-none font-black h-8 w-8 rounded-full flex items-center justify-center p-0">{page.order}</Badge>
                                </div>

                                <div className="flex-1 flex flex-col gap-6">
                                    {page.blocks.length === 0 ? (
                                        <div className="flex-1 border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center justify-center text-center gap-4 opacity-30">
                                            <Layout className="h-12 w-12" />
                                            <p className="text-[10px] font-black uppercase tracking-widest">Construct your blueprint here</p>
                                        </div>
                                    ) : (
                                        page.blocks.sort((a,b) => a.order - b.order).map((block) => (
                                            <CanvasBlock 
                                                key={block.id} 
                                                block={block} 
                                                isSelected={selectedBlockId === block.id}
                                                onSelect={() => setSelectedBlockId(block.id)}
                                                onDelete={() => removeBlock(page.id, block.id)}
                                            />
                                        ))
                                    )}
                                </div>

                                <div className="mt-auto pt-8 border-t border-slate-100 flex items-center justify-between text-[8px] font-black uppercase text-slate-300 tracking-[0.3em]">
                                    <span>HELM LOGIC BLUEPRINT SYSTEMS</span>
                                    <span>PAGE {page.order}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </main>

                {/* Property Matrix Inspector */}
                <aside className="w-80 border-l border-slate-800 bg-slate-900 flex flex-col shrink-0">
                    <div className="p-6 border-b border-slate-800 bg-slate-900/50">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Property Matrix</h3>
                    </div>
                    <div className="flex-1 flex flex-col p-6">
                        {!selectedBlockId ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-20 gap-4">
                                <BoxSelect className="h-12 w-12 mx-auto" />
                                <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">Select a blueprint component to adjust parameters</p>
                            </div>
                        ) : (
                            <div className="w-full space-y-8">
                                <div className="space-y-4">
                                    <h4 className="text-[11px] font-black uppercase tracking-widest text-primary border-l-4 border-primary pl-3">Source Configuration</h4>
                                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-[9px] font-black uppercase text-slate-400">Data Binding</Label>
                                            <Select 
                                                value={selectedBlock?.block.dataSource || ''} 
                                                onValueChange={(v) => updateBlock(selectedBlockId, { dataSource: v })}
                                            >
                                                <SelectTrigger className="h-10 bg-slate-900 border-slate-700 text-[10px] font-bold uppercase">
                                                    <SelectValue placeholder="Manual Entry Only" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-slate-700 text-white">
                                                    <SelectItem value="manual" className="text-[10px] font-bold uppercase">Manual Entry Only</SelectItem>
                                                    {dataSources.map(ds => (
                                                        <SelectItem key={ds.id} value={ds.id} className="text-[10px] font-bold uppercase">{ds.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>

                                <Separator className="bg-slate-800" />

                                <div className="space-y-4">
                                    <h4 className="text-[11px] font-black uppercase tracking-widest text-primary border-l-4 border-primary pl-3">Positional Meta</h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-[9px] font-black uppercase text-slate-500">Order</Label>
                                            <Input 
                                                type="number" 
                                                value={selectedBlock?.block.order} 
                                                onChange={(e) => updateBlock(selectedBlockId, { order: parseInt(e.target.value) })}
                                                className="h-9 bg-slate-800 border-slate-700 font-bold" 
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}

function ToolButton({ icon: Icon, label, onClick }: any) {
    return (
        <button 
            onClick={onClick}
            className="flex flex-col items-center justify-center gap-3 p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50 hover:bg-primary/10 hover:border-primary/50 transition-all group"
        >
            <Icon className="h-5 w-5 text-slate-400 group-hover:text-primary" />
            <span className="text-[9px] font-black uppercase tracking-tighter text-slate-500 group-hover:text-primary-foreground">{label}</span>
        </button>
    );
}

function CanvasBlock({ block, isSelected, onSelect, onDelete }: { block: TemplateBlock, isSelected: boolean, onSelect: () => void, onDelete: () => void }) {
    const isBound = !!block.dataSource && block.dataSource !== 'manual';

    return (
        <div 
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className={cn(
                "group relative p-4 rounded-xl transition-all cursor-pointer border-2 border-transparent",
                isSelected ? "ring-2 ring-primary bg-primary/5 shadow-lg border-primary/20" : "hover:bg-slate-50"
            )}
        >
            <div className="absolute -left-8 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-6 w-6 bg-white shadow-md border text-slate-400"><GripVertical className="h-3 w-3" /></Button>
            </div>

            {isSelected && (
                <div className="absolute -right-2 -top-2 flex items-center gap-1">
                    <Button variant="destructive" size="icon" className="h-6 w-6 rounded-full shadow-lg" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
                </div>
            )}

            <div className="min-h-[20px]">
                {isBound && (
                    <div className="mb-2 flex items-center gap-1.5">
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-[7px] font-black uppercase tracking-widest px-1.5 h-4">
                            <Zap className="h-2 w-2 mr-1" /> Bound to {block.dataSource}
                        </Badge>
                    </div>
                )}

                {block.type === 'text' && (
                    <div className="text-base text-slate-900 leading-relaxed font-medium">
                        {block.content}
                    </div>
                )}
                {block.type === 'image' && (
                    <div className="aspect-video w-full bg-slate-50 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-slate-200 overflow-hidden relative">
                        {isBound ? (
                            <div className="flex flex-col items-center justify-center gap-2">
                                <Ship className="h-8 w-8 text-primary opacity-20" />
                                <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest">Module Asset Placeholder</p>
                            </div>
                        ) : (
                            <>
                                <ImageIcon className="h-8 w-8 text-slate-200 mb-2" />
                                <p className="text-[9px] font-black uppercase text-slate-300">Visual Component Placeholder</p>
                            </>
                        )}
                    </div>
                )}
                {block.type === 'variable' && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary">
                        <Variable className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-black uppercase tracking-widest">{isBound ? `{${block.dataSource.toUpperCase()}}` : '{UNMAPPED_VARIABLE}'}</span>
                    </div>
                )}
                {block.type === 'table' && (
                    <div className="grid grid-cols-3 gap-px bg-slate-100 border rounded-lg overflow-hidden">
                        {[1,2,3,4,5,6,7,8,9].map(i => (
                            <div key={i} className="h-8 bg-white" />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}