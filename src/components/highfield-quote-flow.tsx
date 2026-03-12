'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useCollection, useFirestore, useMemoFirebase, useDoc } from '@/firebase';
import { collection, query, orderBy, doc, where, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
    Loader2, 
    ChevronRight, 
    ChevronLeft, 
    Ship, 
    CheckCircle2, 
    PlusCircle, 
    Package, 
    X, 
    Wrench,
    ListChecks,
    ClipboardList,
    FileText,
    ArrowRight,
    Layers,
    Check,
    Waves,
    Star,
    Maximize2,
    Info,
    Anchor,
    CircleDashed,
    ExternalLink,
    ChevronDown,
    Activity,
    CreditCard,
    Truck,
    Box,
    Monitor,
    Speaker,
    Trash2,
    Zap
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase/auth/use-user';
import {
    type CarouselApi,
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "@/components/ui/carousel";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogClose
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableRow,
    TableHead,
    TableHeader
} from "@/components/ui/table";

interface Variant {
    id: string;
    sku: string | null;
    name: string;
    colorName?: string;
    colorCode?: string;
    material?: string;
    cost?: number;
    sellPriceExclGst?: number;
    imageUrl?: string;
}

interface Step {
    id: number;
    label: string;
}

const STEPS: Step[] = [
    { id: 1, label: 'Boat Base' },
    { id: 2, label: 'Factory Options' },
    { id: 3, label: 'Motor' },
    { id: 4, label: 'Trailer' },
    { id: 5, label: 'Dealer Fit' },
    { id: 6, label: 'Summary' },
];

export function HighfieldQuoteFlow({ 
    module, 
    model, 
    vendor,
    range,
    rangeId 
}: { 
    module: any, 
    model: any, 
    vendor: any,
    range?: any,
    rangeId: string 
}) {
    const firestore = useFirestore();
    const router = useRouter();
    const { user } = useUser();
    const [currentStep, setCurrentStep] = useState(1);
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const colorSectionRef = useRef<HTMLDivElement>(null);
    const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
    
    // Selection State
    const [selectedMaterial, setSelectedMaterial] = useState<'PVC' | 'HYP' | null>(null);
    const [selectedColor, setSelectedColor] = useState<string | null>(null);
    const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
    const [selectedMotor, setSelectedMotor] = useState<any | null>(null);
    const [selectedMotorAccessoryIds, setSelectedMotorAccessoryIds] = useState<string[]>([]);
    const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(null);
    const [selectedTrailerOptionIds, setSelectedTrailerOptionIds] = useState<string[]>([]);
    const [selectedDealerFitIds, setSelectedDealerFitIds] = useState<string[]>([]);

    // Carousel State
    const [api, setApi] = useState<CarouselApi>();
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    // Change detection refs for smart carousel scrolling
    const prevSelectedColor = useRef(selectedColor);
    const prevSelectedOptions = useRef(selectedOptionIds);
    const prevSelectedMotor = useRef(selectedMotor?.id);
    const prevSelectedTrailer = useRef(selectedTrailerId);
    const prevSelectedDealerFit = useRef(selectedDealerFitIds);

    // Modal State
    const [showFeatures, setShowFeatures] = useState(false);
    const [showSpecs, setShowSpecs] = useState(false);
    const [showDocs, setShowDocs] = useState(false);

    // Context Data
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile } = useDoc<any>(userProfileRef);
    const orgId = userProfile?.organisationId;

    const variantsQuery = useMemoFirebase(() => 
        query(collection(firestore, `data-warehouse/${vendor.id}/ranges/${rangeId}/models/${model.id}/variants`), orderBy('order')),
    [firestore, vendor.id, rangeId, model.id]);
    const { data: variants, isLoading: variantsLoading } = useCollection<Variant>(variantsQuery);

    const dealerFitQuery = useMemoFirebase(() => 
        orgId ? collection(firestore, `organisations/${orgId}/dealerFitSelections`) : null,
    [firestore, orgId]);
    const { data: dealerFitSelections, isLoading: dealerFitLoading } = useCollection<any>(dealerFitQuery);

    const [motors, setMotors] = useState<any[]>([]);
    const [motorsLoading, setMotorsLoading] = useState(false);

    const boatSeriesIdentity = model?.name || 'Boat';

    const availableMaterials = useMemo(() => {
        if (!variants) return [];
        return Array.from(new Set(variants.map(v => v.material).filter(Boolean) as string[]));
    }, [variants]);

    const availableColors = useMemo(() => {
        if (!variants || !selectedMaterial) return [];
        return variants.filter(v => v.material === selectedMaterial);
    }, [variants, selectedMaterial]);

    const hasConsoleSelected = useMemo(() => {
        const consoleOptions = model.optionalFeatures?.filter((f: any) => f.category === 'Consoles') || [];
        return selectedOptionIds.some(id => consoleOptions.some(f => f.id === id));
    }, [selectedOptionIds, model.optionalFeatures]);

    // Navigation logic
    const nextStep = () => {
        if (currentStep < STEPS.length) {
            setCurrentStep(currentStep + 1);
        }
    };

    const prevStep = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
        }
    };

    // Intelligent Selection Reconciliation
    const handleMaterialChange = (mat: 'PVC' | 'HYP') => {
        if (selectedMaterial === mat) return;
        
        const currentVariant = variants?.find(v => v.id === selectedColor);
        const prevColorName = currentVariant?.colorName;
        
        setSelectedMaterial(mat);
        
        // Strategy: Try to find the SAME color name in the new material
        if (variants && prevColorName) {
            const matchingVariant = variants.find(v => v.material === mat && v.colorName === prevColorName);
            if (matchingVariant) {
                setSelectedColor(matchingVariant.id);
                return;
            }
        }
        
        // Reset if no direct color match
        setSelectedColor(null);
    };

    // Smart Option Relinking
    useEffect(() => {
        if (!selectedColor || !variants || !model.optionalFeatures) return;
        
        const newVariant = variants.find(v => v.id === selectedColor);
        if (!newVariant) return;

        setSelectedOptionIds(prevIds => {
            let changed = false;
            const nextIds = [...prevIds].map(id => {
                const currentOption = model.optionalFeatures.find((f: any) => f.id === id);
                if (!currentOption) return id;

                const isCompatible = !currentOption.applicableVariantIds?.length || 
                                    currentOption.applicableVariantIds.includes(newVariant.id);

                if (!isCompatible) {
                    const baseName = currentOption.name.split(' - ')[0];
                    const sibling = model.optionalFeatures.find((f: any) => 
                        f.id !== id &&
                        f.name.startsWith(baseName) &&
                        (!f.applicableVariantIds?.length || f.applicableVariantIds.includes(newVariant.id)) &&
                        (f.category === currentOption.category)
                    );

                    if (sibling) {
                        changed = true;
                        return sibling.id;
                    } else {
                        changed = true;
                        return null;
                    }
                }
                return id;
            }).filter(Boolean) as string[];

            return changed ? nextIds : prevIds;
        });
    }, [selectedColor, variants, model.optionalFeatures]);

    // Motor Logic
    useEffect(() => {
        const fetchMotors = async () => {
            if (currentStep !== 3) return;
            setMotorsLoading(true);
            try {
                const vendorsSnap = await getDocs(collection(firestore, 'data-warehouse'));
                const allVendors = vendorsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
                const allModuleVendorIds = [...(module.associatedVendorIds || []), module.mainVendorId].filter(Boolean);
                const motorVendor = allVendors.find(v => allModuleVendorIds.includes(v.id) && v.vendorType === 'Motor Brand');

                if (motorVendor) {
                    const dsSnap = await getDocs(collection(firestore, 'data-warehouse', motorVendor.id, 'dataSets'));
                    const datasets = dsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
                    const targetDS = datasets.find(s => s.name.toLowerCase().includes('outboard') || s.name.toLowerCase().includes('motor')) || datasets[0];
                    
                    if (targetDS) {
                        const rowsSnap = await getDocs(collection(firestore, `data-warehouse/${motorVendor.id}/dataSets/${targetDS.id}/rows`));
                        const allRows = rowsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
                        
                        const maxHp = model.specifications?.motorConfigurations?.[0]?.engines?.[0]?.maxHp || 999;
                        const minHp = model.specifications?.motorConfigurations?.[0]?.engines?.[0]?.minHp || 0;
                        const requiredSteering = hasConsoleSelected ? 'Forward Control' : 'Tiller';

                        setMotors(allRows.filter(r => {
                            const hp = parseInt(r['HP Rating'] || r.hp || '0') || 0;
                            return hp >= minHp && hp <= maxHp && r.steeringType === requiredSteering;
                        }).map(m => ({ ...m, vendorName: motorVendor.name })));
                    }
                }
            } catch (e) { console.error(e); } finally { setMotorsLoading(false); }
        };
        fetchMotors();
    }, [currentStep, firestore, module, model, hasConsoleSelected]);

    // Motor Accessory Logic
    useEffect(() => {
        if (selectedMotor) {
            const allStandard = (selectedMotor.masterAccessories || []).filter((a: any) => a.isStandard);
            const finalStandardIds: string[] = [];
            const processedCats = new Set<string>();

            allStandard.forEach((a: any) => {
                const cat = a.category || 'Other';
                if (cat === 'Propeller' || cat === 'Rigging') {
                    if (!processedCats.has(cat)) {
                        finalStandardIds.push(a.id);
                        processedCats.add(cat);
                    }
                } else {
                    finalStandardIds.push(a.id);
                }
            });
            setSelectedMotorAccessoryIds(finalStandardIds);
        } else {
            setSelectedMotorAccessoryIds([]);
        }
    }, [selectedMotor]);

    const activeVariant = useMemo(() => {
        if (!selectedColor || !variants) return null;
        return variants.find(v => v.id === selectedColor);
    }, [selectedColor, variants]);

    const selectedOptionsData = useMemo(() => {
        return model.optionalFeatures?.filter((f: any) => selectedOptionIds.includes(f.id)) || [];
    }, [selectedOptionIds, model.optionalFeatures]);

    const selectedMotorAccessories = useMemo(() => {
        if (!selectedMotor) return [];
        return (selectedMotor.masterAccessories || []).filter((a: any) => selectedMotorAccessoryIds.includes(a.id));
    }, [selectedMotor, selectedMotorAccessoryIds]);

    const selectedTrailerOptionsData = useMemo(() => {
        return model.trailerConfig?.options?.filter((o: any) => selectedTrailerOptionIds.includes(o.id)) || [];
    }, [selectedTrailerOptionIds, model.trailerConfig]);

    const selectedDealerFitData = useMemo(() => {
        return dealerFitSelections?.filter(s => selectedDealerFitIds.includes(s.id)) || [];
    }, [selectedDealerFitIds, dealerFitSelections]);

    const totalPrice = useMemo(() => {
        let total = activeVariant?.sellPriceExclGst || 0;
        selectedOptionsData.forEach(opt => { total += (opt.sellPriceExclGst || 0); });
        if (selectedMotor) {
            total += (selectedMotor.sellPriceExclGst || 0);
            selectedMotorAccessories.forEach((a: any) => { total += (a.sellPriceExclGst || 0); });
        }
        if (selectedTrailerId && model.trailerConfig) {
            total += (model.trailerConfig.sellPriceExclGst || 0);
            selectedTrailerOptionsData.forEach((o: any) => { total += (o.sellPriceExclGst || 0); });
        }
        selectedDealerFitData.forEach(s => {
            s.items?.forEach((i: any) => { total += (i.data?.sellPriceExclGst || 0); });
        });
        return total;
    }, [activeVariant, selectedOptionsData, selectedMotor, selectedMotorAccessories, selectedTrailerId, model.trailerConfig, selectedTrailerOptionsData, selectedDealerFitData]);

    const resolveImageUrl = (item: any) => {
        const path = item?.imageUrl || item?.SummaryImage || item?.url || item?.image;
        if (!path || typeof path !== 'string') return null;
        if (path.startsWith('http') || path.startsWith('data:image')) return path;
        if (path.includes('images/products') || path.includes('images/accessories')) {
            return `https://www.yamaha-motor.com.au${path.startsWith('/') ? '' : '/'}${path.trim().replace(/\\/g, '/')}`;
        }
        return path.trim().replace(/\\/g, '/');
    };

    const buildPreviewSlide = useMemo(() => {
        const imagedOptions = selectedOptionsData.filter(f => f.imageUrl && f.imageUrl !== "");
        const consoleOpt = imagedOptions.find((f: any) => f.category === 'Consoles');
        const seatOpt = imagedOptions.find((f: any) => f.category === 'Seats');
        const itemsToShow = [consoleOpt, seatOpt].filter(Boolean);
        if (itemsToShow.length === 0) return null;

        return (
            <div className={cn("h-full w-full grid bg-white", itemsToShow.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
                {itemsToShow.map((item: any, i) => (
                    <div key={item.id} className={cn("relative flex items-center justify-center hover:bg-slate-50", i === 0 && itemsToShow.length === 2 && "border-r")}>
                        {item.imageUrl && <Image src={item.imageUrl} alt={item.name} fill className="object-contain p-8 mix-blend-multiply" unoptimized />}
                        <div className="absolute bottom-8 left-8 px-3 py-1 bg-slate-900/5 rounded-full text-[8px] font-black uppercase tracking-widest text-slate-400">{item.name}</div>
                    </div>
                ))}
            </div>
        );
    }, [selectedOptionsData]);

    const carouselSlides = useMemo(() => {
        const slides: { type: string; url?: string; content?: React.ReactNode }[] = [];
        slides.push({ type: 'boat', url: model.coverImageUrl || '' });
        if (activeVariant?.imageUrl) slides.push({ type: 'variant', url: activeVariant.imageUrl });
        if (buildPreviewSlide) slides.push({ type: 'build', content: buildPreviewSlide });
        if (selectedMotor) { const mUrl = resolveImageUrl(selectedMotor); if (mUrl) slides.push({ type: 'motor', url: mUrl }); }
        selectedMotorAccessories.forEach((acc: any) => { const url = resolveImageUrl(acc); if (url) slides.push({ type: 'accessory', url }); });
        if (selectedTrailerId && model.trailerConfig?.imageUrl) slides.push({ type: 'trailer', url: model.trailerConfig.imageUrl });
        selectedDealerFitData.forEach(s => { s.items?.forEach((i: any) => { const url = resolveImageUrl(i.data); if (url) slides.push({ type: 'dealerfit', url }); }); });
        if (model.galleryImageUrls) model.galleryImageUrls.forEach((url: string) => { if (url !== model.coverImageUrl) slides.push({ type: 'gallery', url }); });
        return slides;
    }, [activeVariant, model, buildPreviewSlide, selectedMotor, selectedMotorAccessories, selectedTrailerId, selectedDealerFitData]);

    useEffect(() => {
        if (!api) return;
        api.reInit();
        const colorChanged = prevSelectedColor.current !== selectedColor;
        const optionsChanged = JSON.stringify(prevSelectedOptions.current) !== JSON.stringify(selectedOptionIds);
        const motorChanged = prevSelectedMotor.current !== selectedMotor?.id;
        const trailerChanged = prevSelectedTrailer.current !== selectedTrailerId;
        const dealerFitChanged = JSON.stringify(prevSelectedDealerFit.current) !== JSON.stringify(selectedDealerFitIds);

        prevSelectedColor.current = selectedColor;
        prevSelectedOptions.current = selectedOptionIds;
        prevSelectedMotor.current = selectedMotor?.id;
        prevSelectedTrailer.current = selectedTrailerId;
        prevSelectedDealerFit.current = selectedDealerFitIds;

        if (motorChanged && selectedMotor) {
            const mUrl = resolveImageUrl(selectedMotor);
            const idx = carouselSlides.findIndex(s => s.type === 'motor' && s.url === mUrl);
            if (idx !== -1) { setTimeout(() => api.scrollTo(idx), 500); return; }
        }
        if (trailerChanged && selectedTrailerId && model.trailerConfig?.imageUrl) {
            const idx = carouselSlides.findIndex(s => s.type === 'trailer' && s.url === model.trailerConfig.imageUrl);
            if (idx !== -1) { setTimeout(() => api.scrollTo(idx), 500); return; }
        }
        if (dealerFitChanged && selectedDealerFitIds.length > 0) {
            const lastId = selectedDealerFitIds[selectedDealerFitIds.length - 1];
            const imgUrl = resolveImageUrl(selectedDealerFitData.find(s => s.id === lastId)?.items?.[0]?.data);
            if (imgUrl) {
                const idx = carouselSlides.findIndex(s => (s.type === 'dealerfit' || s.type === 'accessory') && (s.url?.includes(imgUrl) || s.url === imgUrl));
                if (idx !== -1) { setTimeout(() => api.scrollTo(idx), 500); return; }
            }
        }
        if (optionsChanged && selectedOptionIds.length > 0) {
            const buildIdx = carouselSlides.findIndex(s => s.type === 'build');
            if (buildIdx !== -1) { setTimeout(() => api.scrollTo(buildIdx), 500); return; }
        }
        if (colorChanged && activeVariant?.imageUrl) {
            const variantIdx = carouselSlides.findIndex(s => s.type === 'variant' && s.url === activeVariant.imageUrl);
            if (variantIdx !== -1) { setTimeout(() => api.scrollTo(variantIdx), 500); return; }
        }
    }, [selectedColor, selectedOptionIds, selectedMotor, selectedTrailerId, selectedDealerFitIds, api, carouselSlides, activeVariant, currentStep, selectedDealerFitData, model.trailerConfig]);

    useEffect(() => {
        if (selectedMaterial && currentStep === 1) setTimeout(() => colorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 800);
    }, [selectedMaterial, currentStep]);

    useEffect(() => {
        if (scrollAreaRef.current) {
            const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport) viewport.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [currentStep]);

    const relevantFeatures = useMemo(() => {
        const features = model.optionalFeatures || [];
        if (!activeVariant) return features;
        return features.filter((f: any) => {
            if (f.applicableVariantIds?.length && !f.applicableVariantIds.includes(activeVariant.id)) return false;
            const name = String(f.name).toUpperCase();
            if (selectedMaterial === 'PVC' && name.includes('HYP')) return false;
            if (selectedMaterial === 'HYP' && name.includes('PVC')) return false;
            return true;
        });
    }, [model.optionalFeatures, activeVariant, selectedMaterial]);

    const groupedOptions = useMemo(() => {
        const features = [...relevantFeatures];
        const availableConsoles = features.filter((f: any) => f.category === 'Consoles');
        const selectedConsole = availableConsoles.find(f => selectedOptionIds.includes(f.id));
        const groups = features.reduce((acc: any, opt: any) => {
            const cat = opt.category || 'General Options';
            if (cat === 'Seats' && (!selectedConsole || opt.id !== selectedConsole.associatedSeatId)) return acc;
            if (cat === 'Rigging' && !hasConsoleSelected) return acc;
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(opt);
            return acc;
        }, {});
        return Object.entries(groups).filter(([_, opts]: [string, any]) => opts.length > 0).sort(([a], [b]) => {
            if (a === 'Consoles') return -1; if (b === 'Consoles') return 1;
            if (a === 'Seats') return -1; if (b === 'Seats') return 1;
            if (a === 'Rigging') return -1; if (b === 'Rigging') return 1;
            return a.localeCompare(b);
        }) as [string, any][];
    }, [relevantFeatures, selectedOptionIds, hasConsoleSelected]);

    const toggleOption = (id: string) => {
        const feature = relevantFeatures.find((f: any) => f.id === id);
        if (!feature) return;
        const currentCat = feature.category || 'General Options';
        const isCurrentlySelected = selectedOptionIds.includes(id);
        let nextSelectedIds = [...selectedOptionIds];

        if (isCurrentlySelected) {
            nextSelectedIds = nextSelectedIds.filter(i => i !== id);
            if (currentCat === 'Consoles') {
                const riggingItem = relevantFeatures.find(f => f.category === 'Rigging');
                if (riggingItem) nextSelectedIds = nextSelectedIds.filter(i => i !== riggingItem.id);
                const seatIds = relevantFeatures.filter(f => f.category === 'Seats').map(f => f.id);
                nextSelectedIds = nextSelectedIds.filter(i => !seatIds.includes(i));
            }
        } else {
            if (currentCat === 'Consoles') {
                const consoleIds = relevantFeatures.filter(f => f.category === 'Consoles').map(f => f.id);
                const seatIds = relevantFeatures.filter(f => f.category === 'Seats').map(f => f.id);
                nextSelectedIds = nextSelectedIds.filter(i => !consoleIds.includes(i) && !seatIds.includes(i));
            }
            nextSelectedIds.push(id);
            if (currentCat === 'Consoles') {
                if (feature.associatedSeatId) nextSelectedIds.push(feature.associatedSeatId);
                const riggingItem = relevantFeatures.find(f => f.category === 'Rigging');
                if (riggingItem) nextSelectedIds.push(riggingItem.id);
            }
        }
        setSelectedOptionIds(nextSelectedIds);
        if (!isCurrentlySelected) {
            const nextCat = groupedOptions[groupedOptions.findIndex(([name]) => name === currentCat) + 1]?.[0];
            if (nextCat) setTimeout(() => categoryRefs.current[nextCat]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 1200);
        }
    };

    const toggleMotorAccessory = (id: string) => {
        const accessory = selectedMotor?.masterAccessories?.find((a: any) => a.id === id);
        if (!accessory) return;
        const isSelected = selectedMotorAccessoryIds.includes(id);
        const cat = accessory.category || 'Other Hardware';
        const isSingleSelect = cat === 'Propeller' || cat === 'Rigging';
        
        let next = isSelected ? selectedMotorAccessoryIds.filter(i => i !== id) : [...selectedMotorAccessoryIds];
        
        if (!isSelected) {
            if (isSingleSelect) {
                next = next.filter(i => selectedMotor.masterAccessories.find((a: any) => a.id === i)?.category !== cat);
            }
            next.push(id);
        }
        
        setSelectedMotorAccessoryIds(next);
        if (!isSelected) {
            const motorCats = ['Propeller', 'Rigging', 'Other Hardware'];
            const nextCat = motorCats[motorCats.indexOf(cat) + 1];
            if (nextCat) setTimeout(() => categoryRefs.current[nextCat]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 1200);
        }
    };

    const toggleTrailerOption = (id: string) => {
        const isSelected = selectedTrailerOptionIds.includes(id);
        setSelectedTrailerOptionIds(isSelected 
            ? selectedTrailerOptionIds.filter(i => i !== id) 
            : [...selectedTrailerOptionIds, id]
        );
    };

    const toggleDealerFitSelection = (id: string) => {
        const isSelected = selectedDealerFitIds.includes(id);
        const sel = dealerFitSelections?.find(s => s.id === id);
        if (!sel) return;
        setSelectedDealerFitIds(isSelected ? selectedDealerFitIds.filter(i => i !== id) : [...selectedDealerFitIds, id]);
        if (!isSelected) {
            const dealerCats = groupedDealerFit.map(([name]) => name);
            const nextCat = dealerCats[dealerCats.indexOf(sel.category || 'Other Gear') + 1];
            if (nextCat) setTimeout(() => categoryRefs.current[nextCat]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 1200);
        }
    };

    const groupedMotorAccessories = useMemo(() => {
        if (!selectedMotor) return [];
        const groups = (selectedMotor.masterAccessories || []).reduce((acc: any, opt: any) => {
            const cat = opt.category || 'Other Hardware';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(opt);
            return acc;
        }, {});
        return Object.entries(groups).sort(([a], [b]) => (a === 'Propeller' ? -1 : b === 'Propeller' ? 1 : a === 'Rigging' ? -1 : b === 'Rigging' ? 1 : a.localeCompare(b))) as [string, any][];
    }, [selectedMotor]);

    const groupedDealerFit = useMemo(() => {
        if (!dealerFitSelections) return [];
        const groups = dealerFitSelections.reduce((acc: any, sel: any) => {
            const cat = sel.category || 'Other Gear';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(sel);
            return acc;
        }, {});
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)) as [string, any][];
    }, [dealerFitSelections]);

    const getMotorDisplayName = (m: any) => `${m?.vendorName || 'YAMAHA'} - ${m?.['Model Name'] || m?.ModelName || m?.name || m?.Description || m?.model || 'Unnamed'}`;

    return (
        <div className="fixed inset-0 z-[40] bg-background flex flex-col overflow-hidden text-left">
            <div className="sticky top-0 z-[100] px-12 h-20 border-b bg-card/90 backdrop-blur-xl shrink-0 flex items-center shadow-sm">
                <div className="w-full flex items-center justify-between">
                    <div className="flex-1 flex items-center justify-between mr-24">
                        {STEPS.map((step) => (
                            <div key={step.id} className="flex items-center gap-2">
                                <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[9px] font-black transition-all border-2", currentStep === step.id ? "bg-primary border-primary text-white scale-110 shadow-md" : currentStep > step.id ? "bg-green-500 border-green-500 text-white" : "bg-muted border-transparent text-muted-foreground")}>{currentStep > step.id ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.id}</div>
                                <span className={cn("text-[8px] font-black uppercase tracking-[0.2em] hidden sm:block whitespace-nowrap", currentStep === step.id ? "text-foreground" : "text-muted-foreground")}>{step.label}</span>
                            </div>
                        ))}
                    </div>
                    <button type="button" className="font-black text-destructive uppercase tracking-widest text-[9px] hover:opacity-70 transition-opacity" onClick={() => router.push(`/modules/${module.slug || module.id}`)}>Exit Build</button>
                </div>
            </div>

            <div className="relative z-10 flex-1 flex flex-col lg:flex-row overflow-hidden">
                <div className="w-full lg:w-7/12 relative flex flex-col p-4 bg-slate-50/50 overflow-hidden">
                    <div className="relative flex-1 w-full bg-white rounded-[2rem] border-2 border-slate-100 shadow-xl overflow-hidden group">
                        <Carousel className="w-full h-full" opts={{ loop: true }} setApi={setApi}>
                            <CarouselContent className="h-full">
                                {carouselSlides.map((slide, idx) => (
                                    <CarouselItem key={idx} className="h-full w-full relative group/img bg-white">
                                        {slide.type === 'build' ? slide.content : (
                                            <>
                                                {slide.url && <Image src={slide.url} alt="Build Preview" fill className={cn("transition-all", (slide.type === 'boat' || slide.type === 'variant' || slide.type === 'gallery') ? "object-cover" : "object-contain p-12")} unoptimized />}
                                                <Button variant="ghost" size="icon" className="absolute top-6 right-6 h-10 w-10 rounded-full bg-white/20 backdrop-blur-md opacity-0 group-hover/img:opacity-100 transition-opacity text-white border-none shadow-none z-20 focus:ring-0 focus:outline-none" onClick={() => setLightboxUrl(slide.url || null)}><Maximize2 className="h-5 w-5" /></Button>
                                            </>
                                        )}
                                    </CarouselItem>
                                ))}
                            </CarouselContent>
                            <CarouselPrevious className="left-6 h-10 w-10 bg-white/90 border-2 border-slate-200 shadow-xl hover:bg-white hover:border-primary hover:text-primary hover:scale-110 z-[110]" />
                            <CarouselNext className="right-6 h-10 w-10 bg-white/90 border-2 border-slate-200 shadow-xl hover:bg-white hover:border-primary hover:text-primary hover:scale-110 z-[110]" />
                        </Carousel>
                    </div>
                    <div className="bg-white/95 backdrop-blur-xl border-2 border-white shadow-xl p-6 rounded-[2rem] mt-4 shrink-0">
                        <div className="flex flex-col items-start px-1">
                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">Package Pricing (Excl. GST)</span>
                            <div className="text-4xl font-black text-slate-950 tracking-tighter leading-none flex items-baseline"><span className="text-primary text-xl mr-1">$</span><span>{totalPrice.toLocaleString()}</span></div>
                        </div>
                    </div>
                    <div className="flex items-center justify-start gap-3 mt-4 px-4 shrink-0">
                        <Button variant="ghost" size="sm" className="h-8 px-4 font-black uppercase text-[9px] tracking-widest text-slate-400 hover:text-primary rounded-xl border-2 border-transparent hover:border-primary/10 transition-all" onClick={() => setShowFeatures(true)}><ListChecks className="h-3.5 w-3.5 mr-1.5" /> Features</Button>
                        <Button variant="ghost" size="sm" className="h-8 px-4 font-black uppercase text-[9px] tracking-widest text-slate-400 hover:text-primary rounded-xl border-2 border-transparent hover:border-primary/10 transition-all" onClick={() => setShowSpecs(true)}><ClipboardList className="h-3.5 w-3.5 mr-1.5" /> Specs</Button>
                        <Button variant="ghost" size="sm" className="h-8 px-4 font-black uppercase text-[9px] tracking-widest text-slate-400 hover:text-primary rounded-xl border-2 border-transparent hover:border-primary/10 transition-all" onClick={() => setShowDocs(true)}><FileText className="h-3.5 w-3.5 mr-1.5" /> Docs</Button>
                    </div>
                </div>

                <div className="w-full lg:w-5/12 h-full flex flex-col overflow-hidden bg-slate-50/20">
                    <div className="pt-4 px-8 pb-3 shrink-0 border-b bg-white/50 backdrop-blur-sm">
                        <h2 className="text-xl font-black uppercase tracking-tighter italic text-slate-900 leading-none">{STEPS[currentStep - 1].label.toUpperCase()}<span className="text-primary"> - {range?.name?.toUpperCase()} {boatSeriesIdentity.toUpperCase()}</span></h2>
                    </div>
                    <ScrollArea ref={scrollAreaRef} className="flex-1">
                        <div className="px-8 pb-12 space-y-6 mt-4">
                            {currentStep === 1 && (
                                <div className="space-y-8 animate-in fade-in duration-1000">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                                            <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Tube Material</h3>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            {availableMaterials.map((mat) => (
                                                <button key={mat} onClick={() => handleMaterialChange(mat as any)} className={cn("group flex flex-col items-center justify-center p-1 rounded-[2rem] transition-all bg-white shadow-xl border-2 border-transparent h-32", selectedMaterial === mat ? "border-primary ring-2 ring-primary/20 scale-[1.02]" : "hover:border-primary/20")}>
                                                    <span className={cn("text-xs font-black uppercase tracking-widest transition-colors", selectedMaterial === mat ? "text-primary" : "text-slate-600")}>{mat}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {selectedMaterial && (
                                        <div ref={colorSectionRef} className="mt-12 space-y-6 animate-in slide-in-from-bottom-4 duration-1000 scroll-mt-10">
                                            <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                                                <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Hull & Tube Color</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                {availableColors.map((color) => (
                                                    <button key={color.id} onClick={() => setSelectedColor(color.id)} className={cn("flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-lg border-transparent p-1", selectedColor === color.id ? "border-primary ring-2 ring-primary/20 scale-[1.02]" : "hover:border-primary/20")}>
                                                        <div className="relative aspect-video w-full bg-white">{color.imageUrl && <Image src={color.imageUrl} alt="Color" fill className="object-contain mix-blend-multiply p-1" unoptimized />}</div>
                                                        <div className={cn("p-2 text-center border-t transition-colors", selectedColor === color.id ? "bg-blue-50/50 border-primary/10" : "bg-white border-slate-50")}><p className={cn("text-[9px] font-black uppercase tracking-widest", selectedColor === color.id ? "text-primary" : "text-slate-600")}>{color.name}</p></div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {currentStep === 2 && (
                                <div className="space-y-12 animate-in fade-in duration-1000 mt-4">
                                    {groupedOptions.map(([cat, opts]) => (
                                        <div key={cat} ref={el => { categoryRefs.current[cat] = el; }} className="space-y-6 scroll-mt-10">
                                            <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                                                <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">{cat}</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                {opts.map((opt: any) => {
                                                    const hasImage = !!opt.imageUrl;
                                                    return (
                                                        <button key={opt.id} onClick={() => toggleOption(opt.id)} className={cn("flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-lg border-transparent h-full p-1", selectedOptionIds.includes(opt.id) ? "bg-primary/5 border-primary shadow-md ring-2 ring-primary/20" : "hover:border-primary/20")}>
                                                            <div className={cn("relative aspect-video w-full bg-white overflow-hidden shrink-0", !hasImage && "hidden")}>{opt.imageUrl && <Image src={opt.imageUrl} alt={opt.name} fill className="object-contain mix-blend-multiply transition-transform group-hover:scale-105" unoptimized />}</div>
                                                            <div className="p-3 flex flex-col items-center justify-center text-center gap-1 flex-grow">
                                                                <p className={cn("text-[10px] font-black uppercase tracking-widest leading-tight", selectedOptionIds.includes(opt.id) ? "text-primary" : "text-slate-700")}>{opt.name}</p>
                                                                <p className={cn("text-[9px] font-black", selectedOptionIds.includes(opt.id) ? "text-primary" : "text-slate-400")}>${(opt.sellPriceExclGst || 0).toLocaleString()}</p>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {currentStep === 3 && (
                                <div className="space-y-12 animate-in fade-in duration-1000 mt-4">
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                                            <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Motor Selection</h3>
                                        </div>
                                        {motorsLoading ? <div className="flex flex-col items-center py-16 gap-3"><Loader2 className="animate-spin h-8 w-8 text-primary" /><p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Scanning Factory Datasets...</p></div> : (
                                            <div className="grid grid-cols-2 gap-4">
                                                {motors.map(m => {
                                                    const mUrl = resolveImageUrl(m);
                                                    const displayName = getMotorDisplayName(m);
                                                    const isSelected = selectedMotor?.id === m.id;
                                                    return (
                                                        <button key={m.id} onClick={() => { setSelectedMotor(isSelected ? null : m); if (!isSelected) setTimeout(() => categoryRefs.current['Propeller']?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 800); }} className={cn("flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-lg border-transparent h-full p-1", isSelected ? "bg-primary/5 border-primary shadow-md ring-2 ring-primary/20" : "hover:border-primary/20")}>
                                                            <div className="relative aspect-video w-full bg-white overflow-hidden shrink-0">{mUrl && <Image src={mUrl} alt="Motor" fill className="object-contain p-1 mix-blend-multiply" unoptimized />}</div>
                                                            <div className="p-3 flex flex-col items-center justify-center text-center gap-1 flex-grow border-t border-slate-50">
                                                                <p className={cn("text-[10px] font-black uppercase tracking-tight leading-tight", isSelected ? "text-primary" : "text-slate-900")}>{displayName}</p>
                                                                <p className={cn("text-[8px] font-black uppercase tracking-widest", isSelected ? "text-primary/70" : "text-primary")}>{m['HP Rating']} HP • ${(m.sellPriceExclGst || 0).toLocaleString()}</p>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    {selectedMotor && groupedMotorAccessories.map(([cat, opts]) => (
                                        <div key={cat} ref={el => { categoryRefs.current[cat] = el; }} className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 scroll-mt-10">
                                            <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                                                <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">{cat}</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                {opts.map((opt: any) => {
                                                    const isSelected = selectedMotorAccessoryIds.includes(opt.id);
                                                    const imgUrl = resolveImageUrl(opt);
                                                    return (
                                                        <button key={opt.id} onClick={() => toggleMotorAccessory(opt.id)} className={cn("flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-md border-transparent h-full p-1 group", isSelected ? "bg-primary/5 border-primary shadow-sm ring-2 ring-primary/20" : "hover:border-primary/20")}>
                                                            <div className={cn("relative aspect-video w-full bg-white overflow-hidden shrink-0", !imgUrl && "hidden")}>{imgUrl && <Image src={imgUrl} alt={opt.name} fill className="object-contain p-2 mix-blend-multiply transition-transform group-hover:scale-105" unoptimized />}</div>
                                                            <div className="p-3 flex flex-col items-center justify-center text-center gap-1 flex-grow">
                                                                {opt.isStandard && <Badge className="mb-1.5 bg-emerald-500 text-white border-none font-black text-[6px] uppercase h-3.5 px-1">STANDARD</Badge>}
                                                                <p className={cn("text-[10px] font-black uppercase tracking-widest leading-tight", isSelected ? "text-primary" : "text-slate-700")}>{opt.name}</p>
                                                                <p className={cn("text-[9px] font-black", isSelected ? "text-primary" : "text-slate-400")}>+${(opt.sellPriceExclGst || 0).toLocaleString()}</p>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {currentStep === 4 && (
                                <div className="space-y-12 animate-in fade-in duration-1000 mt-4">
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                                            <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Trailer Base</h3>
                                        </div>
                                        {model.trailerConfig ? (
                                            <div className="grid grid-cols-2 gap-4">
                                                <button onClick={() => { const isSelected = selectedTrailerId === 'primary-trailer'; setSelectedTrailerId(isSelected ? null : 'primary-trailer'); setSelectedTrailerOptionIds(isSelected ? [] : (model.trailerConfig?.options || []).filter((o: any) => o.isStandard).map((o: any) => o.id)); if (!isSelected) setTimeout(() => categoryRefs.current['Trailer Hardware']?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 800); }} className={cn("flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-xl border-transparent p-1 h-full", selectedTrailerId === 'primary-trailer' ? "bg-primary/5 border-primary shadow-md ring-2 ring-primary/20" : "hover:border-primary/20")}>
                                                    <div className={cn("relative aspect-video w-full bg-white shrink-0", !model.trailerConfig.imageUrl && "hidden")}>{model.trailerConfig.imageUrl && <Image src={model.trailerConfig.imageUrl} alt="Trailer" fill className="object-contain mix-blend-multiply p-4" unoptimized />}</div>
                                                    <div className="p-3 flex flex-col items-center justify-center text-center gap-1 flex-grow border-t border-slate-50">
                                                        <p className={cn("text-[10px] font-black uppercase tracking-tight leading-tight", selectedTrailerId === 'primary-trailer' ? "text-primary" : "text-slate-900")}>{model.trailerConfig.name}</p>
                                                        <p className={cn("text-[9px] font-black uppercase tracking-widest", selectedTrailerId === 'primary-trailer' ? "text-primary/70" : "text-slate-400")}>${(model.trailerConfig.sellPriceExclGst || 0).toLocaleString()}</p>
                                                    </div>
                                                </button>
                                            </div>
                                        ) : <div className="py-16 text-center border-2 border-dashed rounded-xl opacity-20"><Truck className="h-10 w-10 mx-auto mb-3" /><p className="text-[9px] font-black uppercase tracking-widest">No primary trailer defined.</p></div>}
                                    </div>
                                    {selectedTrailerId && model.trailerConfig?.options?.length > 0 && (
                                        <div ref={el => { categoryRefs.current['Trailer Hardware'] = el; }} className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 scroll-mt-10">
                                            <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                                                <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Trailer Hardware</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                {model.trailerConfig.options.map((opt: any) => {
                                                    const isSelected = selectedTrailerOptionIds.includes(opt.id);
                                                    return (
                                                        <button key={opt.id} onClick={() => toggleTrailerOption(opt.id)} className={cn("flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-md border-transparent h-full p-1", isSelected ? "bg-primary/5 border-primary shadow-sm ring-2 ring-primary/20" : "hover:border-primary/20")}>
                                                            <div className="p-4 flex flex-col items-center justify-center text-center gap-1 flex-grow">
                                                                {opt.isStandard && <Badge className="mb-1.5 bg-emerald-500 text-white border-none font-black text-[6px] uppercase h-3.5 px-1">STANDARD</Badge>}
                                                                <p className={cn("text-[10px] font-black uppercase tracking-widest leading-tight", isSelected ? "text-primary" : "text-slate-700")}>{opt.name}</p>
                                                                <p className={cn("text-[9px] font-black", isSelected ? "text-primary" : "text-slate-400")}>+${(opt.sellPriceExclGst || 0).toLocaleString()}</p>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {currentStep === 5 && (
                                <div className="space-y-12 animate-in fade-in duration-1000 mt-4">
                                    {dealerFitLoading ? <div className="flex justify-center py-16"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div> : groupedDealerFit.length > 0 ? (
                                        groupedDealerFit.map(([cat, opts]) => (
                                            <div key={cat} ref={el => { categoryRefs.current[cat] = el; }} className="space-y-6 scroll-mt-10">
                                                <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">{cat}</h3>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    {opts.map((sel: any) => {
                                                        const isSelected = selectedDealerFitIds.includes(sel.id);
                                                        const imgUrl = resolveImageUrl(sel.items?.[0]?.data);
                                                        return (
                                                            <button key={sel.id} onClick={() => toggleDealerFitSelection(sel.id)} className={cn("flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-lg border-transparent h-full p-1", isSelected ? "bg-primary/5 border-primary shadow-md ring-2 ring-primary/20" : "hover:border-primary/20")}>
                                                                <div className={cn("relative aspect-video w-full bg-white overflow-hidden shrink-0", !imgUrl && "hidden")}>{imgUrl && <Image src={imgUrl} alt={sel.name} fill className="object-contain p-3 mix-blend-multiply transition-transform group-hover:scale-105" unoptimized />}</div>
                                                                <div className="p-4 flex flex-col items-center justify-center text-center gap-1 flex-grow">
                                                                    <p className={cn("text-[10px] font-black uppercase tracking-tight leading-tight", isSelected ? "text-primary" : "text-slate-900")}>{sel.name}</p>
                                                                    <p className={cn("text-[8px] font-black uppercase tracking-widest", isSelected ? "text-primary/70" : "text-slate-400")}>{sel.type === 'package' ? `${sel.items.length} COMPONENTS • ` : ''}${(sel.items.reduce((acc: number, i: any) => acc + (i.data?.sellPriceExclGst || 0), 0)).toLocaleString()}</p>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))
                                    ) : <div className="py-16 text-center border-2 border-dashed rounded-xl opacity-20"><Box className="h-10 w-10 mx-auto mb-3" /><p className="text-[9px] font-black uppercase tracking-widest">No dealer fit options configured.</p></div>}
                                </div>
                            )}
                            {currentStep === 6 && (
                                <div className="space-y-8 animate-in fade-in duration-1000 mt-4">
                                    <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full"><div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /><h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Project Build Summary</h3></div>
                                    <div className="space-y-4">
                                        <Card className="rounded-[1.5rem] border-2 shadow-lg overflow-hidden"><CardHeader className="bg-muted/30 border-b p-4"><div className="flex items-center gap-2"><Ship className="h-4 w-4 text-primary" /><CardTitle className="text-xs font-black uppercase tracking-widest">Base Vessel</CardTitle></div></CardHeader><CardContent className="p-4"><div className="flex items-center justify-between"><div className="space-y-0.5"><p className="font-black text-sm uppercase tracking-tight text-slate-900">{range?.name} {boatSeriesIdentity}</p><p className="text-[9px] font-bold text-muted-foreground uppercase">{selectedMaterial} • {activeVariant?.name || 'Standard Color'}</p></div><p className="font-black text-primary italic text-sm">${(activeVariant?.sellPriceExclGst || 0).toLocaleString()}</p></div></CardContent></Card>
                                        {selectedOptionsData.length > 0 && <Card className="rounded-[1.5rem] border-2 shadow-lg overflow-hidden"><CardHeader className="bg-muted/30 border-b p-4"><div className="flex items-center gap-2"><Package className="h-4 w-4 text-primary" /><CardTitle className="text-xs font-black uppercase tracking-widest">Factory Options</CardTitle></div></CardHeader><CardContent className="p-0"><div className="divide-y">{selectedOptionsData.map((opt: any) => (<div key={opt.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"><div className="flex items-center gap-3"><div className="h-6 w-6 rounded-lg bg-slate-100 flex items-center justify-center"><Check className="h-3 w-3 text-emerald-500" /></div><div><p className="text-[10px] font-black uppercase tracking-tight">{opt.name}</p><Badge variant="outline" className="text-[7px] font-black h-3.5 px-1">{opt.category || 'Standard'}</Badge></div></div><p className="text-[10px] font-bold text-slate-600">${(opt.sellPriceExclGst || 0).toLocaleString()}</p></div>))}</div></CardContent></Card>}
                                        {selectedMotor && <Card className="rounded-[1.5rem] border-2 shadow-lg overflow-hidden"><CardHeader className="bg-muted/30 border-b p-4"><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /><CardTitle className="text-xs font-black uppercase tracking-widest">Powertrain</CardTitle></div></CardHeader><CardContent className="p-0"><div className="p-4 border-b flex items-center justify-between"><div className="space-y-0.5"><p className="font-black text-sm uppercase tracking-tight text-slate-900">{getMotorDisplayName(selectedMotor)}</p><p className="text-[9px] font-bold text-muted-foreground uppercase">{selectedMotor['HP Rating']} HP Performance</p></div><p className="font-black text-primary italic text-sm">${(selectedMotor.sellPriceExclGst || 0).toLocaleString()}</p></div>{selectedMotorAccessories.length > 0 && <div className="divide-y bg-slate-50/50">{selectedMotorAccessories.map((acc: any) => (<div key={acc.id} className="p-4 flex items-center justify-between"><div className="flex items-center gap-3"><div className="h-6 w-6 rounded-lg bg-white border flex items-center justify-center"><Wrench className="h-3 w-3 text-primary/40" /></div><div><p className="text-[10px] font-black uppercase tracking-tight">{acc.name}</p><Badge variant="outline" className="text-[7px] font-black h-3.5 px-1 border-primary/10 text-primary/60">{acc.category || 'Standard'}</Badge></div></div><p className="text-[10px] font-bold text-slate-600">+${(acc.sellPriceExclGst || 0).toLocaleString()}</p></div>))}</div>}</CardContent></Card>}
                                        {selectedTrailerId && model.trailerConfig && <Card className="rounded-[1.5rem] border-2 shadow-lg overflow-hidden"><CardHeader className="bg-muted/30 border-b p-4"><div className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /><CardTitle className="text-xs font-black uppercase tracking-widest">Towing Solution</CardTitle></div></CardHeader><CardContent className="p-0"><div className="p-4 border-b flex items-center justify-between"><div className="space-y-0.5"><p className="font-black text-sm uppercase tracking-tight text-slate-900">{model.trailerConfig.name}</p><p className="text-[9px] font-bold text-muted-foreground uppercase">Precision Chassis</p></div><p className="font-black text-primary italic text-sm">${(model.trailerConfig.sellPriceExclGst || 0).toLocaleString()}</p></div>{selectedTrailerOptionsData.length > 0 && <div className="divide-y bg-slate-50/50">{selectedTrailerOptionsData.map((opt: any) => (<div key={opt.id} className="p-4 flex items-center justify-between"><div className="flex items-center gap-3"><div className="h-6 w-6 rounded-lg bg-white border flex items-center justify-center"><Layers className="h-3 w-3 text-primary/40" /></div><p className="text-[10px] font-black uppercase tracking-tight">{opt.name}</p></div><p className="text-[10px] font-bold text-slate-600">+${(opt.sellPriceExclGst || 0).toLocaleString()}</p></div>))}</div>}</CardContent></Card>}
                                        {selectedDealerFitData.length > 0 && <Card className="rounded-[1.5rem] border-2 shadow-lg overflow-hidden"><CardHeader className="bg-muted/30 border-b p-4"><div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-primary" /><CardTitle className="text-xs font-black uppercase tracking-widest">Dealer Fitments</CardTitle></div></CardHeader><CardContent className="p-0"><div className="divide-y">{selectedDealerFitData.map((sel: any) => (<div key={sel.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"><div className="flex items-center gap-3"><div className="h-6 w-6 rounded-lg bg-slate-100 flex items-center justify-center"><Check className="h-3 w-3 text-emerald-500" /></div><div><p className="text-[10px] font-black uppercase tracking-tight">{sel.name}</p><Badge variant="outline" className="text-[7px] font-black h-3.5 px-1">{sel.category || 'Gear'}</Badge></div></div><p className="text-[10px] font-bold text-slate-600">${(sel.items.reduce((acc: number, i: any) => acc + (i.data?.sellPriceExclGst || 0), 0)).toLocaleString()}</p></div>))}</div></CardContent></Card>}
                                    </div>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                    <div className="p-8 pt-4 bg-slate-50/80 backdrop-blur-xl border-t shrink-0 flex gap-3">
                        {currentStep > 1 && <Button variant="outline" className="h-12 w-20 rounded-xl border-2 border-slate-200 hover:bg-slate-100 shadow-sm" onClick={prevStep}><ChevronLeft className="h-5 w-5" /></Button>}
                        <Button size="lg" className="flex-1 h-12 rounded-xl font-black uppercase text-xs shadow-xl bg-primary text-white hover:scale-[1.02] active:scale-95" onClick={nextStep}>{currentStep === STEPS.length ? 'Finalize Project' : `Next Step: ${STEPS[currentStep].label.toUpperCase()}`}</Button>
                    </div>
                </div>
            </div>

            <Dialog open={!!lightboxUrl} onOpenChange={(open) => !open && setLightboxUrl(null)}>
                <DialogContent className="max-w-[95vw] h-[90vh] p-0 overflow-hidden bg-black/95 border-none shadow-none rounded-none [&>button]:text-white [&>button]:h-12 [&>button]:w-12 [&>button]:bg-transparent [&>button]:right-6 [&>button]:top-6 [&>button]:focus:ring-0 [&>button]:focus:outline-none">
                    <DialogHeader className="sr-only"><DialogTitle>Immersive Inspection</DialogTitle></DialogHeader>
                    <div className="relative w-full h-full flex items-center justify-center">{lightboxUrl && <Image src={lightboxUrl} alt="Inspection" fill className="object-contain p-4" unoptimized />}</div>
                </DialogContent>
            </Dialog>

            <Dialog open={showFeatures} onOpenChange={setShowFeatures}>
                <DialogContent className="sm:max-w-2xl rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 border-b bg-muted/5"><DialogTitle className="text-xl font-black uppercase tracking-tight italic text-primary">Standard Features</DialogTitle></DialogHeader>
                    <ScrollArea className="max-h-[60vh]"><div className="p-0"><Table><TableBody>{model?.standardFeatures?.map((f: string, i: number) => (<TableRow key={i} className="hover:bg-primary/5 border-b"><TableCell className="w-10 pl-6"><Check className="h-4 w-4 text-emerald-500" /></TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-6 py-3">{f}</TableCell></TableRow>))}</TableBody></Table></div></ScrollArea>
                </DialogContent>
            </Dialog>

            <Dialog open={showSpecs} onOpenChange={setShowSpecs}>
                <DialogContent className="sm:max-w-2xl rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 border-b bg-muted/5"><DialogTitle className="text-xl font-black uppercase tracking-tight italic text-primary">Specifications</DialogTitle></DialogHeader>
                    <ScrollArea className="max-h-[60vh]"><div className="p-0"><Table><TableBody>{model?.specifications?.otherSpecs?.map((s: any, i: number) => (<TableRow key={i} className="hover:bg-primary/5 border-b"><TableCell className="font-black uppercase text-[10px] text-muted-foreground w-1/2 pl-6 py-3">{s.label}</TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-6 py-3">{s.value}</TableCell></TableRow>))}</TableBody></Table></div></ScrollArea>
                </DialogContent>
            </Dialog>

            <Dialog open={showDocs} onOpenChange={setShowDocs}>
                <DialogContent className="sm:max-w-md rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 border-b bg-muted/5"><DialogTitle className="text-xl font-black uppercase tracking-tight italic text-primary">Technical Assets</DialogTitle></DialogHeader>
                    <div className="p-6 space-y-3">{model?.documents?.length > 0 ? model.documents.map((doc: any, i: number) => (
                        <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 rounded-xl border-2 hover:border-primary/40 hover:bg-primary/5 group"><div className="flex items-center gap-3"><FileText className="h-4 w-4 text-primary/40 group-hover:text-primary" /><span className="text-[10px] font-black uppercase tracking-tight">{doc.name}</span></div><ExternalLink className="h-3.5 w-3.5 opacity-20 group-hover:opacity-100" /></a>
                    )) : <div className="py-12 text-center opacity-20 flex flex-col items-center gap-2"><FileText className="h-10 w-10" /><p className="text-[9px] font-black uppercase tracking-widest">No Documents Linked</p></div>}</div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
