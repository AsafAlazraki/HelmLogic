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
    Tag,
    Truck,
    Box,
    Activity,
    Trash2,
    Zap,
    DollarSign,
    ExternalLink,
    Plus,
    FilePlus2,
    AlertTriangle,
    CopyCheck,
    Gauge,
    Gift,
    Calendar,
    Percent,
    Car,
    Shield,
    Banknote,
    Clock,
    MessageSquare,
    Paperclip
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
    DialogFooter,
    DialogClose
} from "@/components/ui/dialog";
import { FinalizeQuoteDialog } from '@/components/finalize-quote-dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableRow,
    TableHead,
    TableHeader
} from "@/components/ui/table";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

/** Normalize spacing, strip internal model-code suffixes, and extract first color from parenthetical */
function formatOptionDisplayLabel(name: string): { base: string; color: string | null } {
    // Remove internal model-code suffixes like "FOR SUS750", "FOR SP560", "FOR AL310 etc."
    const stripped = name.replace(/\s+FOR\s+[A-Z]{2,3}\d{3,}/gi, '').trim();
    const normalized = stripped.replace(/\s*&\s*/g, ' & ').replace(/\s+/g, ' ').trim();
    const parenMatch = normalized.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (!parenMatch) return { base: normalized, color: null };
    const base = parenMatch[1].trim();
    const firstColor = parenMatch[2].split('/')[0].trim();
    const color = firstColor
        ? firstColor.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        : null;
    return { base, color };
}

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

interface CustomOption {
    id: string;
    name: string;
    sellPriceExclGst: number;
    description?: string;
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

const HARDWARE_BLOCKLIST = ['MOTOR', 'ENGINE', 'FUEL', 'TRAILER', 'OUTBOARD', 'RAM SUPPORT', 'PROP'];

interface DuplicateInitialState {
    material: 'PVC' | 'HYP' | null;
    colorVariantId: string | null;
    selectedOptionIds: string[];
    customOptions: CustomOption[];
    motorId: string | null;
    selectedMotorObj: any | null;
    selectedMotorAccessoryIds: string[];
    selectedTrailerId: string | null;
    selectedTrailerOptionIds: string[];
    customTrailerOptions?: CustomOption[];
    selectedDealerFitIds: string[];
    isRegoSelected: boolean;
    isStickerSelected: boolean;
    isTenderToSelected: boolean;
    isTrailerRegoSelected: boolean;
}

export function HighfieldQuoteFlow({
    module,
    model,
    vendor,
    range,
    rangeId,
    initialState,
    defaultPriceLevel,
}: {
    module: any,
    model: any,
    vendor: any,
    range?: any,
    rangeId: string,
    initialState?: DuplicateInitialState,
    defaultPriceLevel?: string,
}) {
    const firestore = useFirestore();
    const router = useRouter();
    const { user } = useUser();
    
    // Price Level State
    const [priceLevel, setPriceLevel] = useState<string>('hull_cash');

    // Auto-set price level from prop (e.g. for sub-dealers)
    useEffect(() => {
        if (defaultPriceLevel) setPriceLevel(defaultPriceLevel);
    }, [defaultPriceLevel]);

    /** Get the price for a given item based on the selected price level.
     *  Falls back to sellPriceExclGst when no priceLevels exist (backward compat). */
    function getMotorLabel(motor: any): string {
        return motor?.['MODEL'] || motor?.['Model Name'] || motor?.['MODEL CODE'] || motor?.['Model'] || motor?.name || 'Selected Motor';
    }

    function getPriceForLevel(item: any, level: string): number {
        const fallbackPrice = item?.sellPriceExclGst || item?.['Act Sell'] || item?.['Sell Price'] || item?.['Store Price'] || item?.['NSM Retail'] || item?.PARTS || item?.RRP || item?.Price || item?.Retail || item?.Trade || 0;
        if (!level || level === 'default' || !item?.priceLevels) {
            return typeof fallbackPrice === 'number' ? fallbackPrice : parseFloat(fallbackPrice) || 0;
        }
        const levelPrice = item?.priceLevels?.[level];
        return levelPrice ? (typeof levelPrice === 'number' ? levelPrice : parseFloat(levelPrice) || 0) : (typeof fallbackPrice === 'number' ? fallbackPrice : parseFloat(fallbackPrice) || 0);
    }

    // 1. Core State — seeded from initialState when duplicating an existing quote
    const [currentStep, setCurrentStep] = useState(initialState ? 6 : 1);
    const [selectedMaterial, setSelectedMaterial] = useState<'PVC' | 'HYP' | null>(initialState?.material ?? null);
    const [selectedColor, setSelectedColor] = useState<string | null>(initialState?.colorVariantId ?? null);
    const [isRegoSelected, setIsRegoSelected] = useState(initialState?.isRegoSelected ?? false);
    const [isStickerSelected, setIsStickerSelected] = useState(initialState?.isStickerSelected ?? false);
    const [isTenderToSelected, setIsTenderToSelected] = useState(initialState?.isTenderToSelected ?? false);
    const [isTrailerRegoSelected, setIsTrailerRegoSelected] = useState(initialState?.isTrailerRegoSelected ?? false);

    const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(initialState?.selectedOptionIds ?? []);
    const [customOptions, setCustomOptions] = useState<CustomOption[]>(initialState?.customOptions ?? []);
    const [selectedMotor, setSelectedMotor] = useState<any | null>(initialState?.selectedMotorObj ?? null);
    const [selectedMotorAccessoryIds, setSelectedMotorAccessoryIds] = useState<string[]>(initialState?.selectedMotorAccessoryIds ?? []);
    const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(initialState?.selectedTrailerId ?? null);
    const [selectedTrailerOptionIds, setSelectedTrailerOptionIds] = useState<string[]>(initialState?.selectedTrailerOptionIds ?? []);
    const [selectedDealerFitIds, setSelectedDealerFitIds] = useState<string[]>(initialState?.selectedDealerFitIds ?? []);

    // Custom Option Form State (Boat)
    const [newCustomName, setNewCustomName] = useState('');
    const [newCustomPrice, setNewCustomPrice] = useState('');
    const [newCustomDesc, setNewCustomDesc] = useState('');

    // Custom Trailer Option State
    const [customTrailerOptions, setCustomTrailerOptions] = useState<CustomOption[]>(initialState?.customTrailerOptions ?? []);
    const [newCustomTrailerName, setNewCustomTrailerName] = useState('');
    const [newCustomTrailerPrice, setNewCustomTrailerPrice] = useState('');
    const [newCustomTrailerDesc, setNewCustomTrailerDesc] = useState('');

    // Modal & Carousel State
    const [showFeatures, setShowFeatures] = useState(false);
    const [showSpecs, setShowSpecs] = useState(false);
    const [showDocs, setShowDocs] = useState(false);
    const [showEngineSpecs, setShowEngineSpecs] = useState(false);
    const [showTrailerSpecs, setShowTrailerSpecs] = useState(false);
    const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
    const [api, setApi] = useState<CarouselApi>();
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    // Promotions State
    const [availablePromotions, setAvailablePromotions] = useState<any[]>([]);
    const [appliedPromotionIds, setAppliedPromotionIds] = useState<string[]>([]);

    // Admin & Trade-In State
    const [tradeInDescription, setTradeInDescription] = useState('');
    const [tradeInValue, setTradeInValue] = useState('');
    const [wantsInsurance, setWantsInsurance] = useState(false);
    const [insuranceNotes, setInsuranceNotes] = useState('');
    const [wantsFinance, setWantsFinance] = useState(false);
    const [financeNotes, setFinanceNotes] = useState('');
    const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState('');
    const [timingNotes, setTimingNotes] = useState('');

    // Refs for Auto-Scroll
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const materialSectionRef = useRef<HTMLDivElement>(null);
    const colorSectionRef = useRef<HTMLDivElement>(null);
    const registrationSectionRef = useRef<HTMLDivElement>(null);
    const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});

    // 2. Data Resolvers
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile } = useDoc<any>(userProfileRef);
    const orgId = userProfile?.organisationId;

    const variantsQuery = useMemoFirebase(() =>
        collection(firestore, `data-warehouse/${vendor.id}/ranges/${rangeId}/models/${model.id}/variants`),
    [firestore, vendor.id, rangeId, model.id]);
    const { data: variants } = useCollection<Variant>(variantsQuery);

    const dealerFitQuery = useMemoFirebase(() => 
        orgId ? collection(firestore, `organisations/${orgId}/dealerFitSelections`) : null,
    [firestore, orgId]);
    const { data: dealerFitSelections, isLoading: dealerFitLoading } = useCollection<any>(dealerFitQuery);

    const [motors, setMotors] = useState<any[]>([]);
    const [motorsLoading, setMotorsLoading] = useState(false);
    const motorModuleCategories = useMemo(() => module?.motorDealerFitCategories || [], [module?.motorDealerFitCategories]);
    const trailerModuleCategories = useMemo(() => module?.trailerDealerFitCategories || [], [module?.trailerDealerFitCategories]);
    const [propComesStandard, setPropComesStandard] = useState(false);
    const [extendedWarranty, setExtendedWarranty] = useState(false);
    const [servicePlan, setServicePlan] = useState(false);

    // Section PDF attachments (supplier quotes)
    const [sectionPdfs, setSectionPdfs] = useState<Record<string, File | null>>({ boat: null, motor: null, trailer: null, dealerFit: null });
    const boatPdfRef = useRef<HTMLInputElement>(null);
    const motorPdfRef = useRef<HTMLInputElement>(null);
    const trailerPdfRef = useRef<HTMLInputElement>(null);
    const dealerFitPdfRef = useRef<HTMLInputElement>(null);
    const motorDetailRef = useRef<HTMLDivElement>(null);

    // 3. Derived Memos (CRITICAL: Order of initialization to prevent ReferenceErrors)
    const availableMaterials = useMemo(() => {
        if (!variants) return [];
        return Array.from(new Set(variants.map(v => v.material).filter(Boolean)));
    }, [variants]);

    const availableColors = useMemo(() => {
        if (!variants || !selectedMaterial) return [];
        return variants.filter(v => v.material === selectedMaterial);
    }, [variants, selectedMaterial]);

    const activeVariant = useMemo(() => {
        if (!selectedColor || !variants) return null;
        return variants.find(v => v.id === selectedColor);
    }, [selectedColor, variants]);

    const buildPreviewSlide = useMemo(() => {
        const imagedOptions = model.optionalFeatures?.filter((f: any) => selectedOptionIds.includes(f.id) && f.imageUrl && f.imageUrl !== "") || [];
        const consoleOpt = imagedOptions.find((f: any) => f.category === 'Consoles');
        const seatOpt = imagedOptions.find((f: any) => f.category === 'Seats');
        const itemsToShow = [consoleOpt, seatOpt].filter(Boolean);
        if (itemsToShow.length === 0) return null;
        return (
            <div className={cn("h-full w-full grid bg-white", itemsToShow.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
                {itemsToShow.map((item: any, i) => (
                    <div key={item.id} className={cn("relative flex items-center justify-center hover:bg-slate-50", i === 0 && itemsToShow.length === 2 && "border-r")}>
                        {item.imageUrl && <Image src={item.imageUrl} alt={item.name} fill className="object-contain p-8 mix-blend-multiply" />}
                        <div className="absolute bottom-8 left-8 px-3 py-1 bg-slate-900/5 rounded-full text-[8px] font-black uppercase tracking-widest text-slate-400">{item.name}</div>
                    </div>
                ))}
            </div>
        );
    }, [selectedOptionIds, model.optionalFeatures]);

    const resolveImageUrl = (item: any) => {
        const path = item?.imageUrl || item?.imageLink || item?.['Image Link'] || item?.SummaryImage || item?.url || item?.image;
        if (!path || typeof path !== 'string') return null;
        if (path.startsWith('http') || path.startsWith('data:image')) return path;
        if (path.includes('images/products') || path.includes('images/accessories')) {
            return `https://www.yamaha-motor.com.au${path.startsWith('/') ? '' : '/'}${path.trim().replace(/\\/g, '/')}`;
        }
        return path.trim().replace(/\\/g, '/');
    };

    const carouselSlides = useMemo(() => {
        const slides: { type: string; url?: string; content?: React.ReactNode }[] = [];
        slides.push({ type: 'boat', url: model.coverImageUrl || '' });
        if (activeVariant?.imageUrl) slides.push({ type: 'variant', url: activeVariant.imageUrl });
        if (buildPreviewSlide) slides.push({ type: 'build', content: buildPreviewSlide });
        if (selectedMotor) { 
            const mUrl = resolveImageUrl(selectedMotor); 
            if (mUrl) slides.push({ type: 'motor', url: mUrl }); 
        }
        if (selectedTrailerId && model.trailerConfig?.imageUrl) slides.push({ type: 'trailer', url: model.trailerConfig.imageUrl });
        if (model.galleryImageUrls) model.galleryImageUrls.forEach((url: string) => { if (url !== model.coverImageUrl) slides.push({ type: 'gallery', url }); });
        return slides;
    }, [activeVariant, model, buildPreviewSlide, selectedMotor, selectedTrailerId]);

    const selectedOptionsData = useMemo(() => {
        return model.optionalFeatures?.filter((f: any) => selectedOptionIds.includes(f.id)) || [];
    }, [selectedOptionIds, model.optionalFeatures]);

    const relevantFeatures = useMemo(() => {
        const features = model.optionalFeatures || [];
        if (!activeVariant) return features;
        return features.filter((f: any) => {
            const name = String(f.name).toUpperCase();
            if (HARDWARE_BLOCKLIST.some(keyword => name.includes(keyword))) return false;
            if (f.applicableVariantIds?.length && !f.applicableVariantIds.includes(activeVariant.id)) return false;
            if (f.associatedSkus?.length && activeVariant.sku && !f.associatedSkus.includes(activeVariant.sku)) return false;
            if (selectedMaterial === 'PVC' && name.includes('HYP')) return false;
            if (selectedMaterial === 'HYP' && name.includes('PVC')) return false;
            return true;
        });
    }, [model.optionalFeatures, activeVariant, selectedMaterial]);

    const groupedOptions = useMemo(() => {
        const groups = relevantFeatures.reduce((acc: any, opt: any) => {
            const cat = opt.category || 'General Options';
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
    }, [relevantFeatures]);

    // Determine which seat is auto-locked via console pairing
    const activeConsoleFeature = useMemo(() => {
        return relevantFeatures.find((f: any) => f.category === 'Consoles' && selectedOptionIds.includes(f.id)) || null;
    }, [relevantFeatures, selectedOptionIds]);

    const lockedSeatId = useMemo(() => {
        return activeConsoleFeature?.associatedSeatId || null;
    }, [activeConsoleFeature]);

    const selectedMotorAccessories = useMemo(() => {
        if (!selectedMotor) return [];
        return (selectedMotor.masterAccessories || []).filter((a: any) => selectedMotorAccessoryIds.includes(a.id));
    }, [selectedMotor, selectedMotorAccessoryIds]);

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

    const selectedTrailerOptionsData = useMemo(() => {
        return model.trailerConfig?.options?.filter((o: any) => selectedTrailerOptionIds.includes(o.id)) || [];
    }, [selectedTrailerOptionIds, model.trailerConfig]);

    const selectedDealerFitData = useMemo(() => {
        return dealerFitSelections?.filter(s => selectedDealerFitIds.includes(s.id)) || [];
    }, [selectedDealerFitIds, dealerFitSelections]);

    // Collect all rowIds from currently-selected dealer fit to detect cross-category duplicates
    const selectedDealerRowIds = useMemo(() => {
        const ids = new Set<string>();
        selectedDealerFitData.forEach(s => {
            s.items?.forEach((i: any) => { if (i.rowId) ids.add(i.rowId); });
        });
        return ids;
    }, [selectedDealerFitData]);

    const groupedDealerFit = useMemo(() => {
        if (!dealerFitSelections) return [];
        const motorCats = new Set(motorModuleCategories.map(c => c.toLowerCase()));
        const trailerCats = new Set(trailerModuleCategories.map(c => c.toLowerCase()));
        const groups = dealerFitSelections.reduce((acc: any, sel: any) => {
            const cat = sel.category || 'Gear';
            // Skip motor and trailer categories — they're shown separately
            if (motorCats.has(cat.toLowerCase())) return acc;
            if (trailerCats.has(cat.toLowerCase())) return acc;
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(sel);
            return acc;
        }, {});
        return Object.entries(groups) as [string, any][];
    }, [dealerFitSelections, motorModuleCategories, trailerModuleCategories]);

    const groupedMotorDealerFit = useMemo(() => {
        if (!dealerFitSelections || motorModuleCategories.length === 0) return [];
        const motorCatsLower = motorModuleCategories.map(c => c.toLowerCase());
        const groups: Record<string, any[]> = {};
        dealerFitSelections.forEach((sel: any) => {
            const cat = sel.category || '';
            if (!motorCatsLower.includes(cat.toLowerCase())) return;
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(sel);
        });
        // Return in the order defined in motorModuleCategories
        return motorModuleCategories
            .filter(cat => groups[cat] || Object.keys(groups).some(k => k.toLowerCase() === cat.toLowerCase()))
            .map(cat => {
                const key = Object.keys(groups).find(k => k.toLowerCase() === cat.toLowerCase()) || cat;
                return [key, groups[key] || []] as [string, any[]];
            })
            .filter(([, items]) => items.length > 0);
    }, [dealerFitSelections, motorModuleCategories]);

    const groupedTrailerDealerFit = useMemo(() => {
        if (!dealerFitSelections || trailerModuleCategories.length === 0) return [];
        const trailerCatsLower = trailerModuleCategories.map(c => c.toLowerCase());
        const groups: Record<string, any[]> = {};
        dealerFitSelections.forEach((sel: any) => {
            const cat = sel.category || '';
            if (!trailerCatsLower.includes(cat.toLowerCase())) return;
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(sel);
        });
        return trailerModuleCategories
            .filter(cat => groups[cat] || Object.keys(groups).some(k => k.toLowerCase() === cat.toLowerCase()))
            .map(cat => {
                const key = Object.keys(groups).find(k => k.toLowerCase() === cat.toLowerCase()) || cat;
                return [key, groups[key] || []] as [string, any[]];
            })
            .filter(([, items]) => items.length > 0);
    }, [dealerFitSelections, trailerModuleCategories]);

    const totalPrice = useMemo(() => {
        let total = getPriceForLevel(activeVariant, priceLevel);
        selectedOptionsData.forEach(opt => { total += getPriceForLevel(opt, priceLevel); });
        customOptions.forEach(opt => { total += (opt.sellPriceExclGst || 0); });
        if (isRegoSelected) {
            total += (model.registration?.price12Months || 0);
            if (isStickerSelected) total += (model.registration?.stickerPrice || 0);
            if (isTenderToSelected) total += (model.registration?.tenderToStickerPrice || 0);
        }
        if (selectedMotor) {
            total += getPriceForLevel(selectedMotor, priceLevel);
            selectedMotorAccessories.forEach((a: any) => { total += getPriceForLevel(a, priceLevel); });
        }
        if (selectedTrailerId && model.trailerConfig) {
            total += getPriceForLevel(model.trailerConfig, priceLevel);
            selectedTrailerOptionsData.forEach((o: any) => { total += getPriceForLevel(o, priceLevel); });
            customTrailerOptions.forEach(opt => { total += (opt.sellPriceExclGst || 0); });
            if (isTrailerRegoSelected) total += (model.registration?.trailerPrice12Months || 0);
        }
        selectedDealerFitData.forEach(s => {
            s.items?.forEach((i: any) => { total += getPriceForLevel(i.data, priceLevel); });
        });
        return total;
    }, [activeVariant, selectedOptionsData, customOptions, customTrailerOptions, selectedMotor, selectedMotorAccessories, selectedTrailerId, model.trailerConfig, selectedTrailerOptionsData, selectedDealerFitData, isRegoSelected, isStickerSelected, isTenderToSelected, isTrailerRegoSelected, model.registration, priceLevel]);

    // Promotions Derived Memos
    const appliedPromotions = useMemo(() => {
        return availablePromotions.filter(p => appliedPromotionIds.includes(p.id));
    }, [availablePromotions, appliedPromotionIds]);

    const promotionDiscount = useMemo(() => {
        let discount = 0;
        const motorHp = selectedMotor ? (parseFloat(String(selectedMotor['HP Rating'] || '0').replace(/[^\d.]/g, '')) || 0) : 0;

        // Build subtotals for percentage-based promos
        const motorSubtotal = selectedMotor ? getPriceForLevel(selectedMotor, priceLevel) : 0;
        const riggingSubtotal = selectedMotorAccessories.filter((a: any) => (a.category || '').toLowerCase() === 'rigging').reduce((acc: number, a: any) => acc + getPriceForLevel(a, priceLevel), 0);
        const propellerSubtotal = selectedMotorAccessories.filter((a: any) => (a.category || '').toLowerCase() === 'propeller').reduce((acc: number, a: any) => acc + getPriceForLevel(a, priceLevel), 0);
        const accessoriesSubtotal = selectedMotorAccessories.reduce((acc: number, a: any) => acc + getPriceForLevel(a, priceLevel), 0);

        appliedPromotions.forEach(promo => {
            switch (promo.type) {
                case 'fixed-amount':
                    discount += (promo.fixedAmount || 0);
                    break;
                case 'per-hp':
                    discount += (promo.perHpAmount || 0) * motorHp;
                    break;
                case 'percentage': {
                    const pct = (promo.percentage || 0) / 100;
                    switch (promo.appliesTo) {
                        case 'motor': discount += pct * motorSubtotal; break;
                        case 'rigging': discount += pct * riggingSubtotal; break;
                        case 'propeller': discount += pct * propellerSubtotal; break;
                        case 'all-accessories': discount += pct * accessoriesSubtotal; break;
                        case 'total': discount += pct * totalPrice; break;
                        default: discount += pct * totalPrice; break;
                    }
                    break;
                }
                case 'category-discount': {
                    const catPct = (promo.percentage || 0) / 100;
                    switch (promo.appliesTo) {
                        case 'motor': discount += catPct * motorSubtotal; break;
                        case 'rigging': discount += catPct * riggingSubtotal; break;
                        case 'propeller': discount += catPct * propellerSubtotal; break;
                        case 'all-accessories': discount += catPct * accessoriesSubtotal; break;
                        default: discount += catPct * totalPrice; break;
                    }
                    break;
                }
            }
        });
        return Math.round(discount);
    }, [appliedPromotions, selectedMotor, selectedMotorAccessories, totalPrice, priceLevel]);

    const finalPrice = useMemo(() => {
        return Math.max(0, totalPrice - promotionDiscount);
    }, [totalPrice, promotionDiscount]);

    const togglePromotion = (id: string) => {
        setAppliedPromotionIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    // 4. Selection Handlers
    const handleMaterialChange = (mat: 'PVC' | 'HYP') => {
        if (selectedMaterial === mat) return;
        const currentVariant = variants?.find(v => v.id === selectedColor);
        const prevColorName = currentVariant?.colorName;
        setSelectedMaterial(mat);
        if (variants && prevColorName) {
            const matchingVariant = variants.find(v => v.material === mat && v.colorName === prevColorName);
            if (matchingVariant) {
                setSelectedColor(matchingVariant.id);
                return;
            }
        }
        setSelectedColor(null);
        setTimeout(() => colorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 800);
    };

    const handleColorChange = (id: string) => {
        setSelectedColor(id);
        setTimeout(() => registrationSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 800);
    };

    const handleRegoToggle = () => {
        const newVal = !isRegoSelected;
        setIsRegoSelected(newVal);
        if (!newVal) {
            setIsStickerSelected(false);
            setIsTenderToSelected(false);
        } else {
            setTimeout(() => registrationSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 500);
        }
    };

    const handleStickerToggle = () => {
        const newVal = !isStickerSelected;
        setIsStickerSelected(newVal);
        if (newVal) setIsTenderToSelected(false);
    };

    const handleTenderToToggle = () => {
        const newVal = !isTenderToSelected;
        setIsTenderToSelected(newVal);
        if (newVal) setIsStickerSelected(false);
    };

    const toggleOption = (id: string) => {
        const feature = relevantFeatures.find((f: any) => f.id === id);
        if (!feature) return;
        const currentCat = feature.category || 'General Options';

        // Prevent toggling off a seat that is locked via console pairing
        if (currentCat === 'Seats' && selectedOptionIds.includes(id) && lockedSeatId === id) return;

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

    const handleAddCustomOption = () => {
        if (!newCustomName.trim() || !newCustomPrice) return;
        const newOpt: CustomOption = {
            id: `custom-${Date.now()}`,
            name: newCustomName.trim(),
            sellPriceExclGst: parseFloat(newCustomPrice) || 0,
            description: newCustomDesc.trim() || undefined
        };
        setCustomOptions(prev => [...prev, newOpt]);
        setNewCustomName('');
        setNewCustomPrice('');
        setNewCustomDesc('');
    };

    const handleRemoveCustomOption = (id: string) => {
        setCustomOptions(prev => prev.filter(o => o.id !== id));
    };

    const handleAddCustomTrailerOption = () => {
        if (!newCustomTrailerName.trim() || !newCustomTrailerPrice) return;
        const newOpt: CustomOption = {
            id: `custom-trailer-${Date.now()}`,
            name: newCustomTrailerName.trim(),
            sellPriceExclGst: parseFloat(newCustomTrailerPrice) || 0,
            description: newCustomTrailerDesc.trim() || undefined
        };
        setCustomTrailerOptions(prev => [...prev, newOpt]);
        setNewCustomTrailerName('');
        setNewCustomTrailerPrice('');
        setNewCustomTrailerDesc('');
    };

    const handleRemoveCustomTrailerOption = (id: string) => {
        setCustomTrailerOptions(prev => prev.filter(o => o.id !== id));
    };

    const toggleMotorAccessory = (id: string) => {
        const accessory = selectedMotor?.masterAccessories?.find((a: any) => a.id === id);
        if (!accessory) return;
        const isSelected = selectedMotorAccessoryIds.includes(id);
        const cat = accessory.category || 'Other Hardware';
        const isSingleSelect = cat === 'Propeller' || cat === 'Rigging';
        let next = isSelected ? selectedMotorAccessoryIds.filter(i => i !== id) : [...selectedMotorAccessoryIds];
        if (!isSelected) {
            if (isSingleSelect) next = next.filter(i => selectedMotor.masterAccessories.find((a: any) => a.id === i)?.category !== cat);
            next.push(id);
        }
        setSelectedMotorAccessoryIds(next);
    };

    const toggleTrailerOption = (id: string) => {
        const isSelected = selectedTrailerOptionIds.includes(id);
        setSelectedTrailerOptionIds(isSelected ? selectedTrailerOptionIds.filter(i => i !== id) : [...selectedTrailerOptionIds, id]);
    };

    const toggleDealerFitSelection = (id: string) => {
        const isSelected = selectedDealerFitIds.includes(id);
        setSelectedDealerFitIds(isSelected ? selectedDealerFitIds.filter(i => i !== id) : [...selectedDealerFitIds, id]);
    };

    const scrollPanelToTop = () => {
        setTimeout(() => {
            const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
            if (viewport) viewport.scrollTop = 0;
        }, 50);
    };
    const hasTrailer = !!model.trailerConfig;
    const nextStep = () => {
        if (currentStep < STEPS.length) {
            // Skip trailer step (4) if this model has no trailer configured
            const next = currentStep === 3 && !hasTrailer ? 5 : currentStep + 1;
            setCurrentStep(next);
            scrollPanelToTop();
        }
    };
    const prevStep = () => {
        if (currentStep > 1) {
            // Skip trailer step (4) going backwards too
            const prev = currentStep === 5 && !hasTrailer ? 3 : currentStep - 1;
            setCurrentStep(prev);
            scrollPanelToTop();
        }
    };

    // 5. Effects (Carousel Sync & Motor Fetch)
    useEffect(() => {
        if (!api || !activeVariant) return;
        const scroll = () => {
            const variantIdx = carouselSlides.findIndex(s => s.type === 'variant');
            if (variantIdx !== -1) api.scrollTo(variantIdx);
        };
        const timer = setTimeout(scroll, 150);
        api.on('reInit', scroll);
        return () => { clearTimeout(timer); api.off('reInit', scroll); };
    }, [activeVariant, api, carouselSlides]);

    useEffect(() => {
        if (!api || !selectedMotor) return;
        const scroll = () => {
            const motorIdx = carouselSlides.findIndex(s => s.type === 'motor');
            if (motorIdx !== -1) api.scrollTo(motorIdx);
        };
        const timer = setTimeout(scroll, 150);
        api.on('reInit', scroll);
        return () => { clearTimeout(timer); api.off('reInit', scroll); };
    }, [selectedMotor, api, carouselSlides]);

    useEffect(() => {
        if (!api || !selectedTrailerId) return;
        const scroll = () => {
            const trailerIdx = carouselSlides.findIndex(s => s.type === 'trailer');
            if (trailerIdx !== -1) api.scrollTo(trailerIdx);
        };
        const timer = setTimeout(scroll, 150);
        api.on('reInit', scroll);
        return () => { clearTimeout(timer); api.off('reInit', scroll); };
    }, [selectedTrailerId, api, carouselSlides]);

    useEffect(() => {
        const parseHpRating = (rating?: any): { count: number, hp: number } | null => {
            if (!rating) return null;
            const str = String(rating).toLowerCase().trim();
            const twinMatch = str.match(/^(\d+)\s*x\s*(\d+)/);
            if (twinMatch) return { count: parseInt(twinMatch[1]), hp: parseInt(twinMatch[2]) };
            const singleMatch = str.match(/^(\d+)/);
            if (singleMatch) return { count: 1, hp: parseInt(singleMatch[1]) };
            return null;
        };

        const fetchMotors = async () => {
            if (currentStep < 3) return;
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
                        const allRows = rowsSnap.docs.map(d => {
                            const row = { id: d.id, ...d.data() as any };
                            // Build priceLevels from Yamaha pricing columns
                            const parsePrice = (v: any) => typeof v === 'number' ? v : parseFloat(v) || 0;
                            const nsmRetail = parsePrice(row['NSM Retail']);
                            const sellPrice = parsePrice(row['Sell Price']);
                            const storePrice = parsePrice(row['Store Price']);
                            const tradePrice = parsePrice(row['Trade Price']);
                            const commercialPrice = parsePrice(row['Commercial Price']);
                            const boatingAlliancePrice = parsePrice(row['Boating Alliance Price']);
                            const dealerBuy = parsePrice(row['Dealer Buy']);
                            // Set sellPriceExclGst to the primary sell price (Store Price → NSM Retail → Sell Price)
                            row.sellPriceExclGst = storePrice || nsmRetail || sellPrice || 0;
                            row.costPrice = dealerBuy || 0;
                            row.priceLevels = {
                                hull_cash: nsmRetail || storePrice || sellPrice || 0,
                                hull_trade: tradePrice || 0,
                                hull_subdealer: tradePrice || 0,
                                hull_subdealer_excl: tradePrice || 0,
                                hull_commercial: commercialPrice || 0,
                                hull_boating_alliance: boatingAlliancePrice || 0,
                            };
                            // Build priceLevels on accessories (dealer fit items from MPF)
                            if (row.masterAccessories) {
                                row.masterAccessories = row.masterAccessories.map((acc: any) => {
                                    const accSell = parsePrice(acc['Act Sell'] || acc.sellPriceExclGst || acc['Store Price'] || acc['Sell Price'] || acc.price);
                                    const accTrade = parsePrice(acc['Trade Price'] || acc.tradePrice || acc['Trade']);
                                    const accCost = parsePrice(acc['Act CTD'] || acc.cost || acc['Dealer Buy']);
                                    return {
                                        ...acc,
                                        sellPriceExclGst: accSell || 0,
                                        costPrice: accCost || 0,
                                        priceLevels: {
                                            hull_cash: accSell || 0,
                                            hull_trade: accTrade || accSell || 0,
                                            hull_subdealer: accTrade || accSell || 0,
                                            hull_subdealer_excl: accTrade || accSell || 0,
                                        },
                                    };
                                });
                            }
                            return row;
                        });

                        const motorConfigs = model.specifications?.motorConfigurations || [];
                        if (motorConfigs.length === 0) { setMotors([]); setMotorsLoading(false); return; }

                        const config = motorConfigs[0];
                        const spec = config.engines?.[0];
                        const minHp = Number(spec?.minHp || 0);
                        const maxHp = Number(spec?.maxHp || 0);
                        const configType = config.type || 'Single';
                        const engineCountMap: Record<string, number> = { 'Single': 1, 'Twin': 2, 'Triple': 3, 'Quad': 4 };
                        const targetEngineCount = engineCountMap[configType] || 1;

                        const overrides = model.motorOverrides?.[configType] || { hiddenIds: [], manualIds: [] };
                        const hasConsole = model.optionalFeatures?.filter((f: any) => f.category === 'Consoles').some((f: any) => selectedOptionIds.includes(f.id));

                        const manualMotors = allRows.filter(r => overrides.manualIds?.includes(r.id));
                        
                        const filtered = allRows.filter(r => {
                            if (overrides.hiddenIds?.includes(r.id)) return false;
                            const parsed = parseHpRating(r['HP Rating']);
                            if (!parsed) return false;
                            
                            if (parsed.count !== targetEngineCount) {
                                return false;
                            }
                            
                            if (maxHp > 0) {
                                if (parsed.hp < minHp || parsed.hp > maxHp) return false;
                            } else {
                                if (parsed.hp < minHp) return false;
                            }
                            
                            return true;
                        });

                        const allPossible = [...new Map([...filtered, ...manualMotors].map(m => [m.id, m])).values()];
                        setMotors(allPossible.map(m => ({ ...m, vendorName: motorVendor.name, vendorLogoUrl: motorVendor.logoUrl || null })));
                    }
                }
            } catch (e) { console.error(e); } finally { setMotorsLoading(false); }
        };
        fetchMotors();
    }, [currentStep, firestore, module, model, selectedOptionIds]);

    // Auto-select the motor closest to maxHp when motors first load
    useEffect(() => {
        if (motors.length === 0 || selectedMotor) return;
        const maxHp = Number(model.specifications?.motorConfigurations?.[0]?.engines?.[0]?.maxHp || 0);
        const parseHp = (rating?: any): number => {
            if (!rating) return 0;
            const m = String(rating).match(/(\d+(?:\.\d+)?)\s*hp/i);
            return m ? parseFloat(m[1]) : 0;
        };
        const best = motors.reduce<{ motor: any; diff: number } | null>((acc, m) => {
            const hp = parseHp(m['HP Rating']);
            const diff = Math.abs(hp - maxHp);
            return !acc || diff < acc.diff ? { motor: m, diff } : acc;
        }, null);
        if (best) {
            setSelectedMotor(best.motor);
            // Auto-select standard accessories (propeller, rigging included with motor)
            const standardIds = (best.motor.masterAccessories || [])
                .filter((a: any) => a.isStandard)
                .map((a: any) => a.id);
            if (standardIds.length > 0) setSelectedMotorAccessoryIds(standardIds);
        }
    }, [motors]);

    // When duplicating: once fresh motors load, swap in the matching motor with current price
    useEffect(() => {
        if (!initialState?.motorId || motors.length === 0) return;
        const fresh = motors.find(m => m.id === initialState.motorId);
        if (fresh) setSelectedMotor(fresh);
    }, [motors]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch promotions from boat module and motor vendor module
    useEffect(() => {
        const fetchPromotions = async () => {
            if (currentStep < 3) return;
            try {
                const allPromos: any[] = [];
                const now = new Date();

                // 1. Check boat module promotions
                if (module?.id) {
                    const boatPromoSnap = await getDocs(collection(firestore, `modules/${module.id}/promotions`));
                    boatPromoSnap.docs.forEach(d => {
                        allPromos.push({ id: d.id, source: 'boat', ...d.data() as any });
                    });
                }

                // 2. Find motor vendor module and check its promotions
                const allModuleVendorIds = [...(module?.associatedVendorIds || []), module?.mainVendorId].filter(Boolean);
                if (allModuleVendorIds.length > 0) {
                    const vendorsSnap = await getDocs(collection(firestore, 'data-warehouse'));
                    const motorVendor = vendorsSnap.docs.map(d => ({ id: d.id, ...d.data() as any })).find(v => allModuleVendorIds.includes(v.id) && v.vendorType === 'Motor Brand');
                    if (motorVendor) {
                        const motorModulesSnap = await getDocs(query(collection(firestore, 'modules'), where('mainVendorId', '==', motorVendor.id)));
                        for (const mDoc of motorModulesSnap.docs) {
                            const motorPromoSnap = await getDocs(collection(firestore, `modules/${mDoc.id}/promotions`));
                            motorPromoSnap.docs.forEach(d => {
                                allPromos.push({ id: d.id, source: 'motor', ...d.data() as any });
                            });
                        }
                    }
                }

                // Filter: isActive and within date range
                const activePromos = allPromos.filter(p => {
                    if (!p.isActive) return false;
                    if (p.startDate) {
                        const start = p.startDate.toDate ? p.startDate.toDate() : new Date(p.startDate);
                        if (now < start) return false;
                    }
                    if (p.endDate) {
                        const end = p.endDate.toDate ? p.endDate.toDate() : new Date(p.endDate);
                        if (now > end) return false;
                    }
                    return true;
                });

                setAvailablePromotions(activePromos);
                // Auto-tick all active promotions
                setAppliedPromotionIds(activePromos.map(p => p.id));
            } catch (e) { console.error('Failed to fetch promotions:', e); }
        };
        fetchPromotions();
    }, [currentStep, firestore, module]);

    const getMotorDisplayName = (m: any) => {
        const vendor = (m?.vendorName || 'YAMAHA').toUpperCase();
        // Normalize-and-match approach: handles any field name casing/spacing variation
        const allKeys = Object.keys(m || {});
        const normalize = (s: string) => String(s || '').toLowerCase().replace(/[\s_-]/g, '');
        const nameKey = allKeys.find(k => ['modelname', 'model', 'description', 'name'].includes(normalize(k)));
        let name = (nameKey ? m[nameKey] : null) || 'Unnamed';
        if (!name || name === 'Unnamed') {
            // Last-resort: try any key that looks like it holds a model string
            const fallbackKey = allKeys.find(k => normalize(k).includes('model') || normalize(k).includes('name'));
            name = (fallbackKey ? m[fallbackKey] : null) || 'Unnamed';
        }
        if (name.toUpperCase().startsWith(vendor)) {
            name = name.substring(vendor.length).trim();
            if (name.startsWith('-')) name = name.substring(1).trim();
        }
        return `${vendor} - ${name}`;
    };

    return (
        <div className="fixed inset-0 z-[40] bg-background flex flex-col overflow-hidden text-left">
            <div className="sticky top-0 z-[100] px-12 h-20 bg-card border-b border-slate-100 shrink-0 flex items-center">
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
                {/* Left Side: Render Area */}
                <div className="w-full lg:w-7/12 relative flex flex-col bg-slate-50/50 overflow-hidden">
                    <div className="flex-1 px-8 pt-8 pb-0 flex flex-col">
                        <div className="relative flex-1 w-full bg-white rounded-[2rem] border-2 border-slate-100 shadow-xl overflow-hidden group">
                            <Carousel className="w-full h-full" opts={{ loop: true }} setApi={setApi}>
                                <CarouselContent className="h-full">
                                    {carouselSlides.map((slide, idx) => (
                                        <CarouselItem key={idx} className="h-full w-full relative group/img bg-white">
                                            {slide.type === 'build' ? slide.content : (
                                                <>
                                                    {slide.url && <Image src={slide.url} alt="Build Preview" fill className={cn("transition-all", (slide.type === 'motor' || slide.type === 'trailer') ? "object-contain p-6" : "object-cover")} priority={idx === 0} loading={idx === 0 ? undefined : 'lazy'} />}
                                                    <Button variant="ghost" size="icon" className="absolute top-6 right-6 h-10 w-10 rounded-full bg-white/20 backdrop-blur-md opacity-0 group-hover/img:opacity-100 transition-opacity text-white border-none shadow-none z-20" onClick={() => setLightboxUrl(slide.url || null)}><Maximize2 className="h-5 w-5" /></Button>
                                                </>
                                            )}
                                        </CarouselItem>
                                    ))}
                                </CarouselContent>
                                <CarouselPrevious className="left-6 h-10 w-10 bg-white/90 border-2 border-slate-200 shadow-xl hover:bg-white hover:border-primary hover:text-primary hover:scale-110 z-[110]" />
                                <CarouselNext className="right-6 h-10 w-10 bg-white/90 border-2 border-slate-200 shadow-xl hover:bg-white hover:border-primary hover:text-primary hover:scale-110 z-[110]" />
                            </Carousel>
                        </div>
                    </div>
                    <div className="px-8 pt-4 pb-8 shrink-0">
                        <div className="bg-white border-2 border-white shadow-xl p-6 rounded-[2rem] flex items-center justify-between min-h-[92px]">
                            <div className="flex flex-col items-start px-1 gap-3">
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em] leading-none">Technical Utilities</span>
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="sm" className="h-9 px-4 font-black uppercase text-[9px] tracking-widest text-slate-950 bg-slate-50 hover:bg-primary/10 hover:text-primary rounded-full transition-all border-none shadow-sm group" onClick={() => setShowFeatures(true)}><ListChecks className="h-3.5 w-3.5 mr-2 text-primary" /> Features</Button>
                                    <Button variant="ghost" size="sm" className="h-9 px-4 font-black uppercase text-[9px] tracking-widest text-slate-950 bg-slate-50 hover:bg-primary/10 hover:text-primary rounded-full transition-all border-none shadow-sm group" onClick={() => setShowSpecs(true)}><ClipboardList className="h-3.5 w-3.5 mr-2 text-primary" /> Specs</Button>
                                    <Button variant="ghost" size="sm" className="h-9 px-4 font-black uppercase text-[9px] tracking-widest text-slate-950 bg-slate-50 hover:bg-primary/10 hover:text-primary rounded-full transition-all border-none shadow-sm group" onClick={() => setShowDocs(true)}><FileText className="h-3.5 w-3.5 mr-2 text-primary" /> Docs</Button>
                                    {selectedMotor && <Button variant="ghost" size="sm" className="h-9 px-4 font-black uppercase text-[9px] tracking-widest text-slate-950 bg-slate-50 hover:bg-primary/10 hover:text-primary rounded-full transition-all border-none shadow-sm group" onClick={() => setShowEngineSpecs(true)}><Gauge className="h-3.5 w-3.5 mr-2 text-primary" /> Engine Specs</Button>}
                                    {selectedTrailerId && <Button variant="ghost" size="sm" className="h-9 px-4 font-black uppercase text-[9px] tracking-widest text-slate-950 bg-slate-50 hover:bg-primary/10 hover:text-primary rounded-full transition-all border-none shadow-sm group" onClick={() => setShowTrailerSpecs(true)}><Truck className="h-3.5 w-3.5 mr-2 text-primary" /> Trailer Specs</Button>}
                                </div>
                            </div>
                            <div className="flex flex-col items-end px-1 gap-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[9px] uppercase tracking-widest font-black text-slate-400">Price Level</span>
                                    <select
                                        value={priceLevel}
                                        onChange={(e) => setPriceLevel(e.target.value)}
                                        className="text-xs rounded-xl border-2 px-2 py-1 font-bold bg-white"
                                    >
                                        <option value="default">Published Price</option>
                                        <option value="hull_cash">Cash Price</option>
                                        <option value="hull_trade">Trade Price</option>
                                        <option value="hull_subdealer">Sub-Dealer Price</option>
                                        <option value="hull_subdealer_excl">Sub-Dealer Excl</option>
                                        <option value="hull_aus_sailing">AUS Sailing</option>
                                    </select>
                                </div>
                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-[0.2em]">Package Pricing (Excl. GST)</span>
                                {promotionDiscount > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-black text-slate-400 line-through">${totalPrice.toLocaleString()}</span>
                                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">SAVE ${promotionDiscount.toLocaleString()}</span>
                                    </div>
                                )}
                                <div className="text-4xl font-black text-slate-950 tracking-tighter leading-none flex items-baseline"><span className="text-primary text-xl mr-1">$</span><span>{finalPrice.toLocaleString()}</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side: Configuration Panel */}
                <div className="w-full lg:w-5/12 h-full flex flex-col overflow-hidden bg-slate-50/20">
                    <div className="pt-8 px-8 pb-4 shrink-0 bg-transparent min-h-[80px] flex flex-col justify-start">
                        <h2 className="text-xl font-black uppercase tracking-tighter italic text-slate-900 leading-tight">{STEPS[currentStep - 1].label.toUpperCase()}<span className="text-primary"> - {range?.name?.toUpperCase()} {model?.name?.toUpperCase()}</span></h2>
                    </div>
                    <ScrollArea ref={scrollAreaRef} className="flex-1">
                        <div className="px-8 pb-48 space-y-6 mt-4">
                            {currentStep === 1 && (
                                <div className="space-y-8 animate-in fade-in duration-1000">
                                    <div ref={materialSectionRef} className="space-y-4 scroll-mt-10">
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
                                                    <button key={color.id} onClick={() => handleColorChange(color.id)} className={cn("flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-lg border-transparent p-1", selectedColor === color.id ? "border-primary ring-2 ring-primary/20 scale-[1.02]" : "hover:border-primary/20")}>
                                                        <div className="relative aspect-video w-full bg-white">{color.imageUrl && <Image src={color.imageUrl} alt="Color" fill className="object-contain mix-blend-multiply p-1" />}</div>
                                                        <div className={cn("p-2 text-center border-t transition-colors", selectedColor === color.id ? "bg-blue-50/50 border-primary/10" : "bg-white border-slate-50")}><p className={cn("text-[9px] font-black uppercase tracking-widest", selectedColor === color.id ? "text-primary" : "text-slate-600")}>{color.name}</p></div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {selectedColor && (
                                        <div ref={registrationSectionRef} className="mt-12 space-y-6 animate-in slide-in-from-bottom-4 duration-1000 scroll-mt-24">
                                            <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                                                <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Registration</h3>
                                            </div>
                                            <Card className="rounded-[2rem] border-2 shadow-xl p-6 bg-white space-y-6">
                                                <div className={cn("flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer", isRegoSelected ? "bg-primary/5 border-primary ring-2 ring-primary/20 shadow-md" : "bg-slate-50 border-slate-100 hover:border-primary/20")} onClick={handleRegoToggle}>
                                                    <div className="flex items-center gap-4">
                                                        <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center border-2", isRegoSelected ? "bg-primary border-primary text-white shadow-lg" : "bg-white border-slate-200 text-slate-300")}><Check className="h-4 w-4" /></div>
                                                        <div><p className={cn("text-[10px] font-black uppercase tracking-widest", isRegoSelected ? "text-primary" : "text-slate-600")}>12 Months Registration</p><p className="text-[9px] font-bold text-muted-foreground mt-0.5">Maritime Safety Compliance</p></div>
                                                    </div>
                                                    <p className={cn("font-black text-xs", isRegoSelected ? "text-primary" : "text-slate-400")}>${(model.registration?.price12Months || 0).toLocaleString()}</p>
                                                </div>
                                                {isRegoSelected && (
                                                    <div className="grid grid-cols-2 gap-3 pt-2 animate-in slide-in-from-top-2 duration-500">
                                                        {/* Registration Stickers */}
                                                        <div className={cn("flex flex-col gap-3 p-4 rounded-2xl border-2 transition-all cursor-pointer", isStickerSelected ? "bg-primary/5 border-primary ring-2 ring-primary/20 shadow-md" : "bg-slate-50 border-slate-100 hover:border-primary/20")} onClick={handleStickerToggle}>
                                                            <div className="flex items-center gap-3">
                                                                <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center border-2 shrink-0", isStickerSelected ? "bg-primary border-primary text-white shadow-lg" : "bg-white border-slate-200 text-slate-300")}><Tag className="h-4 w-4" /></div>
                                                                <div><p className={cn("text-[10px] font-black uppercase tracking-widest", isStickerSelected ? "text-primary" : "text-slate-600")}>Rego Stickers</p><p className="text-[9px] font-bold text-muted-foreground mt-0.5">Custom Cut · Supply & Fit</p></div>
                                                            </div>
                                                            <p className={cn("font-black text-xs pl-11", isStickerSelected ? "text-primary" : "text-slate-400")}>+${(model.registration?.stickerPrice || 0).toLocaleString()}</p>
                                                        </div>
                                                        {/* Tender To Decal */}
                                                        <div className={cn("flex flex-col gap-3 p-4 rounded-2xl border-2 transition-all cursor-pointer", isTenderToSelected ? "bg-primary/5 border-primary ring-2 ring-primary/20 shadow-md" : "bg-slate-50 border-slate-100 hover:border-primary/20")} onClick={handleTenderToToggle}>
                                                            <div className="flex items-center gap-3">
                                                                <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center border-2 shrink-0", isTenderToSelected ? "bg-primary border-primary text-white shadow-lg" : "bg-white border-slate-200 text-slate-300")}><Anchor className="h-4 w-4" /></div>
                                                                <div><p className={cn("text-[10px] font-black uppercase tracking-widest", isTenderToSelected ? "text-primary" : "text-slate-600")}>"Tender To" Decal</p><p className="text-[9px] font-bold text-muted-foreground mt-0.5">Yacht Association</p></div>
                                                            </div>
                                                            <p className={cn("font-black text-xs pl-11", isTenderToSelected ? "text-primary" : "text-slate-400")}>+${(model.registration?.tenderToStickerPrice || 0).toLocaleString()}</p>
                                                        </div>
                                                    </div>
                                                )}
                                            </Card>
                                        </div>
                                    )}
                                </div>
                            )}
                            {currentStep === 2 && (
                                <div className="space-y-12 animate-in fade-in duration-1000 mt-4">
                                    {groupedOptions.map(([cat, opts]) => {
                                        /* Seat category visibility rules:
                                         * - If a console is selected with a paired seat → show only that seat, locked
                                         * - If a console is selected with NO paired seat → hide seats entirely
                                         * - If no console is selected → hide seat category (seats are console-dependent) */
                                        if (cat === 'Seats') {
                                            const hasSelectedConsole = relevantFeatures.some((f: any) => f.category === 'Consoles' && selectedOptionIds.includes(f.id));
                                            if (!hasSelectedConsole) return null;
                                            if (!lockedSeatId) {
                                                return (
                                                    <div key={cat} ref={el => { categoryRefs.current[cat] = el; }} className="space-y-6 scroll-mt-10">
                                                        <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                                                            <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">{cat}</h3>
                                                        </div>
                                                        <div className="px-6 py-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-center">
                                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">No paired seat for this console</p>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                        }

                                        /* For seat category with a locked seat, show only the paired seat */
                                        const displayOpts = (cat === 'Seats' && lockedSeatId)
                                            ? opts.filter((o: any) => o.id === lockedSeatId)
                                            : opts;

                                        return (
                                        <div key={cat} ref={el => { categoryRefs.current[cat] = el; }} className="space-y-6 scroll-mt-10">
                                            <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                                                <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">{cat}</h3>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                {displayOpts.map((opt: any) => {
                                                    const isLocked = lockedSeatId === opt.id;
                                                    const isSelected = selectedOptionIds.includes(opt.id);
                                                    return (
                                                    <button key={opt.id} onClick={() => toggleOption(opt.id)} disabled={isLocked} className={cn("flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-lg border-transparent h-full p-1", isSelected ? "bg-primary/5 border-primary shadow-md ring-2 ring-primary/20" : "hover:border-primary/20", isLocked && "cursor-default opacity-90")}>
                                                        <div className={cn("relative aspect-video w-full bg-white overflow-hidden shrink-0", !opt.imageUrl && "hidden")}>{opt.imageUrl && <Image src={opt.imageUrl} alt={opt.name} fill className="object-contain mix-blend-multiply transition-transform group-hover:scale-105" />}</div>
                                                        <div className="p-3 flex flex-col items-center justify-center text-center gap-1 flex-grow">
                                                            {(() => { const { base, color } = formatOptionDisplayLabel(opt.name); return (<><p className={cn("text-[10px] font-black uppercase tracking-widest leading-tight", isSelected ? "text-primary" : "text-slate-700")}>{base}</p>{color && <p className={cn("text-[9px] font-black uppercase tracking-widest", isSelected ? "text-primary/70" : "text-slate-400")}>{color}</p>}</>); })()}
                                                            <p className={cn("text-[9px] font-black", isSelected ? "text-primary" : "text-slate-400")}>${(opt.sellPriceExclGst || 0).toLocaleString()}</p>
                                                            {isLocked && (
                                                                <div className="flex items-center gap-1 mt-1">
                                                                    <CheckCircle2 className="h-3 w-3 text-primary/60" />
                                                                    <span className="text-[8px] font-bold text-primary/60 uppercase tracking-wide">Paired with {(() => { const { base } = formatOptionDisplayLabel(activeConsoleFeature?.name || 'Console'); return base; })()}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        );
                                    })}

                                    <div className="space-y-6 scroll-mt-10">
                                        <div className="flex items-center gap-3 bg-slate-900 px-6 py-3 rounded-2xl shadow-xl w-full">
                                            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Additional Factory Boat Notes/Options</h3>
                                        </div>
                                        <Card className="rounded-[2rem] border-2 shadow-xl p-6 bg-white space-y-6">
                                            <div className="grid gap-4">
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Addition Label</Label>
                                                    <Input placeholder="e.g. Custom Hull Wrap" value={newCustomName} onChange={e => setNewCustomName(e.target.value)} className="h-11 font-bold border-2 rounded-xl" />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Sell Price (Excl.)</Label>
                                                        <div className="relative">
                                                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                                                            <Input type="number" placeholder="0.00" value={newCustomPrice} onChange={e => setNewCustomPrice(e.target.value)} className="h-11 pl-9 font-black border-2 rounded-xl" />
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col justify-end">
                                                        <Button onClick={handleAddCustomOption} disabled={!newCustomName.trim() || !newCustomPrice} className="h-11 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg bg-primary">
                                                            <Plus className="h-4 w-4 mr-2" /> Add to Build
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Description (Optional)</Label>
                                                    <Input placeholder="Technical notes or specific requirements..." value={newCustomDesc} onChange={e => setNewCustomDesc(e.target.value)} className="h-11 font-bold border-2 rounded-xl" />
                                                </div>
                                            </div>

                                            {customOptions.length > 0 && (
                                                <div className="pt-6 border-t space-y-3">
                                                    {customOptions.map(opt => (
                                                        <div key={opt.id} className="flex items-center justify-between p-4 rounded-2xl border-2 bg-slate-50 group/custom">
                                                            <div className="min-w-0">
                                                                <p className="font-black text-xs uppercase tracking-tight text-slate-900">{opt.name}</p>
                                                                {opt.description && <p className="text-[9px] font-bold text-muted-foreground uppercase mt-0.5 truncate">{opt.description}</p>}
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                <p className="font-black text-xs text-primary">${opt.sellPriceExclGst.toLocaleString()}</p>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-full" onClick={() => handleRemoveCustomOption(opt.id)}><Trash2 className="h-4 w-4" /></Button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </Card>
                                    </div>
                                </div>
                            )}
                            {currentStep === 3 && (
                                <div className="space-y-12 animate-in fade-in duration-1000 mt-4">
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                                            <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Motor Selection</h3>
                                        </div>
                                        {!motorsLoading && motors.length > 0 && motors.every(m => !m.sellPriceExclGst) && (
                                            <div className="flex items-start gap-3 px-5 py-4 bg-amber-50 border-2 border-amber-200 rounded-2xl text-amber-800">
                                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                                <p className="text-[10px] font-black uppercase tracking-wide leading-relaxed">Pricing not yet configured for this module — motors will show $0. Contact your admin to set up a pricing strategy.</p>
                                            </div>
                                        )}
                                        {motorsLoading ? <div className="flex flex-col items-center py-16 gap-3"><Loader2 className="animate-spin h-8 w-8 text-primary" /><p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Scanning Factory Datasets...</p></div> : selectedMotor ? (
                                            /* --- SELECTED MOTOR HERO --- */
                                            <div ref={motorDetailRef} className="animate-in fade-in duration-700">
                                                <div className="relative border-4 border-primary rounded-[2rem] overflow-hidden bg-white shadow-2xl ring-8 ring-primary/10">
                                                    <div className="relative aspect-[21/9] w-full bg-slate-50 border-b flex items-center justify-center">
                                                        {resolveImageUrl(selectedMotor) ? (
                                                            <Image src={resolveImageUrl(selectedMotor)!} alt="Motor" fill className="object-contain p-8 mix-blend-multiply" />
                                                        ) : (
                                                            <Ship className="h-16 w-16 text-slate-200" />
                                                        )}
                                                        <div className="absolute top-4 right-4">
                                                            <div className="h-10 w-10 rounded-full bg-primary text-white flex items-center justify-center shadow-lg"><Check className="h-5 w-5" /></div>
                                                        </div>
                                                        <Badge className="absolute bottom-4 left-4 bg-primary text-white font-black text-[10px] uppercase px-3 py-1 rounded-full shadow-lg">
                                                            {selectedMotor['HP Rating']} HP PERFORMANCE
                                                        </Badge>
                                                    </div>
                                                    <div className="p-6 flex items-center justify-between bg-white">
                                                        <div className="space-y-1">
                                                            <p className="text-lg font-black uppercase tracking-tight text-primary leading-tight">{getMotorDisplayName(selectedMotor)}</p>
                                                            <div className="flex items-center gap-3">
                                                                {selectedMotor['Shaft Length'] && <Badge variant="secondary" className="text-[8px] font-black uppercase">{selectedMotor['Shaft Length']}</Badge>}
                                                                {selectedMotor['Control'] && <Badge variant="secondary" className="text-[8px] font-black uppercase">{selectedMotor['Control']}</Badge>}
                                                                {selectedMotor['Starting'] && <Badge variant="secondary" className="text-[8px] font-black uppercase">{selectedMotor['Starting']}</Badge>}
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="font-black text-primary italic text-2xl">${getPriceForLevel(selectedMotor, priceLevel).toLocaleString()}</p>
                                                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Excl. GST</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex justify-center mt-4">
                                                    <Button variant="outline" className="rounded-xl border-2 text-[10px] font-black uppercase tracking-widest h-10 px-6" onClick={() => { setSelectedMotor(null); setSelectedMotorAccessoryIds([]); setPropComesStandard(false); }}>
                                                        <ArrowRight className="h-3 w-3 mr-2 rotate-180" /> Choose Another Motor
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            /* --- MOTOR GRID --- */
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                {motors.map(m => {
                                                    const mUrl = resolveImageUrl(m);
                                                    const displayName = getMotorDisplayName(m);
                                                    return (
                                                        <button key={m.id} onClick={() => { setSelectedMotor(m); setPropComesStandard(false); const standardIds = (m.masterAccessories || []).filter((a: any) => a.isStandard).map((a: any) => a.id); if (standardIds.length > 0) setSelectedMotorAccessoryIds(standardIds); setTimeout(() => motorDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400); }} className="group relative flex flex-col border-4 rounded-[2rem] overflow-hidden transition-all bg-white shadow-2xl h-full border-transparent hover:border-primary/20">
                                                            <div className="relative aspect-video w-full bg-slate-50 border-b flex items-center justify-center">
                                                                {mUrl ? (
                                                                    <Image src={mUrl} alt="Motor" fill className="object-contain p-6 mix-blend-multiply transition-transform group-hover:scale-110" />
                                                                ) : (
                                                                    <Ship className="h-12 w-12 text-slate-200" />
                                                                )}
                                                                <Badge className="absolute bottom-4 left-4 bg-primary text-white font-black text-[10px] uppercase px-3 py-1 rounded-full shadow-lg">
                                                                    {m['HP Rating']} HP PERFORMANCE
                                                                </Badge>
                                                            </div>
                                                            <div className="p-6 flex flex-col items-start text-left gap-2 flex-grow bg-white">
                                                                <p className="text-sm font-black uppercase tracking-tight leading-tight text-slate-900">{displayName}</p>
                                                                <div className="flex items-center gap-2 mt-auto">
                                                                    <p className="font-black text-primary italic text-xl">${getPriceForLevel(m, priceLevel).toLocaleString()}</p>
                                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Excl. GST</span>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* --- MOTOR ACCESSORIES (Propeller, Rigging, etc.) --- */}
                                    {selectedMotor && (
                                        <>
                                            {/* Pre-Rig Information */}
                                            {(() => {
                                                const installationText = selectedMotor['Installation'] || selectedMotor['installation']?.opCode;
                                                const standardRiggingAccessories = (selectedMotor.masterAccessories || []).filter(
                                                    (a: any) => a.isStandard && (a.category || '').toLowerCase() === 'rigging'
                                                );
                                                if (!installationText && standardRiggingAccessories.length === 0) return null;
                                                return (
                                                    <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-700">
                                                        <div className="flex items-center gap-3 bg-slate-500 px-6 py-3 rounded-2xl shadow-xl w-full">
                                                            <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Pre-Rig Information</h3>
                                                        </div>
                                                        <div className="rounded-[2rem] border-2 border-slate-200 bg-slate-50 p-6 shadow-sm">
                                                            <div className="flex items-start gap-4">
                                                                <div className="h-10 w-10 rounded-2xl flex items-center justify-center bg-slate-200 text-slate-600 shrink-0">
                                                                    <Info className="h-5 w-5" />
                                                                </div>
                                                                <div className="space-y-3 min-w-0">
                                                                    {installationText && (
                                                                        <div>
                                                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Installation Type</p>
                                                                            <p className="text-sm font-bold text-slate-800">{installationText}</p>
                                                                        </div>
                                                                    )}
                                                                    {standardRiggingAccessories.length > 0 && (
                                                                        <div>
                                                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Included Rigging</p>
                                                                            <div className="space-y-1.5">
                                                                                {standardRiggingAccessories.map((acc: any) => (
                                                                                    <div key={acc.id} className="flex items-center gap-2">
                                                                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                                                                        <span className="text-xs font-bold text-slate-700">{acc.name || acc.description || acc.id}</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* Prop Comes Standard toggle */}
                                            <div ref={el => { categoryRefs.current['PropStandard'] = el; }} className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 scroll-mt-10">
                                                <div className="flex items-center gap-3 bg-emerald-500 px-6 py-3 rounded-2xl shadow-xl w-full">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Standard Propeller</h3>
                                                </div>
                                                <div className={cn("flex items-center justify-between p-6 rounded-[2rem] border-2 transition-all cursor-pointer bg-white shadow-xl", propComesStandard ? "bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-md" : "border-transparent hover:border-emerald-500/20")} onClick={() => setPropComesStandard(!propComesStandard)}>
                                                    <div className="flex items-center gap-4">
                                                        <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center border-2 shadow-inner", propComesStandard ? "bg-emerald-500 border-emerald-500 text-white" : "bg-slate-50 border-slate-100 text-slate-300")}><Anchor className="h-5 w-5" /></div>
                                                        <div>
                                                            <p className={cn("text-[11px] font-black uppercase tracking-widest", propComesStandard ? "text-emerald-700" : "text-slate-600")}>Prop Comes Standard</p>
                                                            <p className="text-[9px] font-bold text-muted-foreground mt-0.5">{selectedMotor['Prop'] ? `${selectedMotor['Prop']}` : 'Standard propeller included with motor'}</p>
                                                        </div>
                                                    </div>
                                                    <div className={cn("h-8 w-8 rounded-full flex items-center justify-center", propComesStandard ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-300")}>
                                                        <Check className="h-4 w-4" />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* NSM Extended Warranty & Service Plan toggles */}
                                            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 scroll-mt-10">
                                                <div className="flex items-center gap-3 bg-blue-500 px-6 py-3 rounded-2xl shadow-xl w-full">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Dealer Services</h3>
                                                </div>
                                                <div className={cn("flex items-center justify-between p-6 rounded-[2rem] border-2 transition-all cursor-pointer bg-white shadow-xl", extendedWarranty ? "bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 shadow-md" : "border-transparent hover:border-blue-500/20")} onClick={() => setExtendedWarranty(!extendedWarranty)}>
                                                    <div className="flex items-center gap-4">
                                                        <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center border-2 shadow-inner", extendedWarranty ? "bg-blue-500 border-blue-500 text-white" : "bg-slate-50 border-slate-100 text-slate-300")}><Star className="h-5 w-5" /></div>
                                                        <div>
                                                            <p className={cn("text-[11px] font-black uppercase tracking-widest", extendedWarranty ? "text-blue-700" : "text-slate-600")}>NSM 6 Year Extended Warranty</p>
                                                            <p className="text-[9px] font-bold text-muted-foreground mt-0.5">Extend factory warranty to 6 years with NSM coverage</p>
                                                        </div>
                                                    </div>
                                                    <div className={cn("h-8 w-8 rounded-full flex items-center justify-center", extendedWarranty ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-300")}>
                                                        <Check className="h-4 w-4" />
                                                    </div>
                                                </div>
                                                <div className={cn("flex items-center justify-between p-6 rounded-[2rem] border-2 transition-all cursor-pointer bg-white shadow-xl", servicePlan ? "bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 shadow-md" : "border-transparent hover:border-blue-500/20")} onClick={() => setServicePlan(!servicePlan)}>
                                                    <div className="flex items-center gap-4">
                                                        <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center border-2 shadow-inner", servicePlan ? "bg-blue-500 border-blue-500 text-white" : "bg-slate-50 border-slate-100 text-slate-300")}><Wrench className="h-5 w-5" /></div>
                                                        <div>
                                                            <p className={cn("text-[11px] font-black uppercase tracking-widest", servicePlan ? "text-blue-700" : "text-slate-600")}>Direct Debit Service Plan</p>
                                                            <p className="text-[9px] font-bold text-muted-foreground mt-0.5">Scheduled servicing via convenient direct debit payments</p>
                                                        </div>
                                                    </div>
                                                    <div className={cn("h-8 w-8 rounded-full flex items-center justify-center", servicePlan ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-300")}>
                                                        <Check className="h-4 w-4" />
                                                    </div>
                                                </div>
                                            </div>

                                            {groupedMotorAccessories.map(([cat, opts]) => (
                                                <div key={cat} ref={el => { categoryRefs.current[cat] = el; }} className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 scroll-mt-10">
                                                    <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                                                        <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">{cat}</h3>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        {opts.map((opt: any) => (
                                                            <button key={opt.id} onClick={() => { toggleMotorAccessory(opt.id); if ((opt.category || '').toLowerCase() === 'propeller' && !selectedMotorAccessoryIds.includes(opt.id)) setPropComesStandard(false); }} className={cn("flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-md border-transparent h-full p-1 group", selectedMotorAccessoryIds.includes(opt.id) ? "bg-primary/5 border-primary shadow-sm ring-2 ring-primary/20" : "hover:border-primary/20")}>
                                                                <div className={cn("relative aspect-video w-full bg-white overflow-hidden shrink-0", !resolveImageUrl(opt) && "hidden")}>{resolveImageUrl(opt) && <Image src={resolveImageUrl(opt)!} alt={opt.name} fill className="object-contain p-2 mix-blend-multiply transition-transform group-hover:scale-105" />}</div>
                                                                <div className="p-3 flex flex-col items-center justify-center text-center gap-1 flex-grow">
                                                                    {opt.isStandard && <Badge className="mb-1.5 bg-emerald-500 text-white border-none font-black text-[6px] uppercase h-3.5 px-1">STANDARD</Badge>}
                                                                    <p className={cn("text-[10px] font-black uppercase tracking-widest leading-tight", selectedMotorAccessoryIds.includes(opt.id) ? "text-primary" : "text-slate-700")}>{opt.name}</p>
                                                                    <p className={cn("text-[9px] font-black", selectedMotorAccessoryIds.includes(opt.id) ? "text-primary" : "text-slate-400")}>+${getPriceForLevel(opt, priceLevel).toLocaleString()}</p>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}

                                            {/* --- MOTOR DEALER FIT --- */}
                                            {groupedMotorDealerFit.length > 0 && (
                                                <>
                                                    <div className="flex items-center gap-4 py-2">
                                                        <div className="flex-1 border-t-2 border-dashed border-slate-200" />
                                                        <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-300">Motor Dealer Fit</span>
                                                        <div className="flex-1 border-t-2 border-dashed border-slate-200" />
                                                    </div>
                                                    {groupedMotorDealerFit.map(([cat, opts]) => (
                                                        <div key={`mdf-${cat}`} ref={el => { categoryRefs.current[`mdf-${cat}`] = el; }} className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 scroll-mt-10">
                                                            <div className="flex items-center gap-3 bg-blue-500 px-6 py-3 rounded-2xl shadow-xl w-full">
                                                                <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">{cat}</h3>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-4">
                                                                {opts.map((sel: any) => {
                                                                    const isSelected = selectedDealerFitIds.includes(sel.id);
                                                                    const hasOverlap = !isSelected && sel.items?.some((i: any) => i.rowId && selectedDealerRowIds.has(i.rowId));
                                                                    const isPropCategory = (sel.category || '').toLowerCase() === 'propeller';
                                                                    return (
                                                                    <button key={sel.id} onClick={() => { toggleDealerFitSelection(sel.id); if (isPropCategory && !isSelected) setPropComesStandard(false); }} className={cn("flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-lg border-transparent h-full p-1 relative", isSelected ? "bg-blue-50 border-blue-500 shadow-md ring-2 ring-blue-500/20" : hasOverlap ? "border-amber-300 opacity-70" : "hover:border-blue-500/20")}>
                                                                        {hasOverlap && <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5"><CopyCheck className="h-3 w-3 text-amber-600" /><span className="text-[7px] font-black uppercase tracking-wide text-amber-700">Already Included</span></div>}
                                                                        <div className={cn("relative aspect-video w-full bg-white overflow-hidden shrink-0", !resolveImageUrl(sel.items?.[0]?.data) && "hidden")}>{resolveImageUrl(sel.items?.[0]?.data) && <Image src={resolveImageUrl(sel.items?.[0]?.data)!} alt={sel.name} fill className="object-contain p-3 mix-blend-multiply transition-transform group-hover:scale-105" />}</div>
                                                                        <div className="p-4 flex flex-col items-center justify-center text-center gap-1 flex-grow">
                                                                            <p className={cn("text-[10px] font-black uppercase tracking-tight leading-tight", isSelected ? "text-blue-600" : "text-slate-900")}>{sel.name}</p>
                                                                            <p className={cn("text-[8px] font-black uppercase tracking-widest", isSelected ? "text-blue-500/70" : "text-slate-400")}>{sel.type === 'package' ? `${sel.items.length} COMPONENTS • ` : ''}${(sel.items.reduce((acc: number, i: any) => acc + (i.data?.['Act Sell'] || i.data?.sellPriceExclGst || i.data?.['Store Price'] || i.data?.PARTS || i.data?.RRP || i.data?.Price || i.data?.Retail || i.data?.Trade || 0), 0)).toLocaleString()}</p>
                                                                        </div>
                                                                    </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </>
                                            )}
                                        </>
                                    )}

                                    {/* --- PROMOTIONS & OFFERS --- */}
                                    {availablePromotions.length > 0 && (
                                        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
                                            <div className="flex items-center gap-3 bg-emerald-600 px-6 py-3 rounded-2xl shadow-xl w-full">
                                                <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                <Gift className="h-4 w-4 text-white" />
                                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Promotions & Offers</h3>
                                            </div>
                                            <div className="space-y-4">
                                                {availablePromotions.map(promo => {
                                                    const isApplied = appliedPromotionIds.includes(promo.id);
                                                    const startDate = promo.startDate ? (promo.startDate.toDate ? promo.startDate.toDate() : new Date(promo.startDate)) : null;
                                                    const endDate = promo.endDate ? (promo.endDate.toDate ? promo.endDate.toDate() : new Date(promo.endDate)) : null;
                                                    const discountLabel = promo.type === 'fixed-amount' ? `$${(promo.fixedAmount || 0).toLocaleString()} OFF`
                                                        : promo.type === 'per-hp' ? `$${(promo.perHpAmount || 0)} / HP`
                                                        : promo.type === 'percentage' || promo.type === 'category-discount' ? `${promo.percentage || 0}% OFF`
                                                        : 'OFFER';
                                                    return (
                                                        <div key={promo.id} onClick={() => togglePromotion(promo.id)} className={cn("rounded-[2rem] border-2 overflow-hidden transition-all cursor-pointer bg-white shadow-xl", isApplied ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-transparent hover:border-emerald-500/20")}>
                                                            {promo.showImageOnQuote && promo.imageUrl && (
                                                                <div className="relative w-full aspect-[21/9] bg-emerald-50/30">
                                                                    <img src={promo.imageUrl} alt={promo.name} className="w-full h-full object-cover" />
                                                                </div>
                                                            )}
                                                            <div className="p-6 flex items-start gap-4">
                                                                <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center border-2 shadow-inner shrink-0 mt-0.5", isApplied ? "bg-emerald-500 border-emerald-500 text-white" : "bg-slate-50 border-slate-100 text-slate-300")}>
                                                                    <Check className="h-5 w-5" />
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <p className={cn("text-[11px] font-black uppercase tracking-widest", isApplied ? "text-emerald-700" : "text-slate-600")}>{promo.name}</p>
                                                                        <Badge className="bg-emerald-500 text-white border-none font-black text-[8px] uppercase h-5 px-2">{discountLabel}</Badge>
                                                                    </div>
                                                                    {promo.description && <p className="text-[9px] font-bold text-muted-foreground mt-1.5 leading-relaxed">{promo.description}</p>}
                                                                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                                                                        {(startDate || endDate) && (
                                                                            <Badge variant="outline" className="text-[7px] font-black h-5 px-2 gap-1 border-emerald-200 text-emerald-600 bg-emerald-50">
                                                                                <Calendar className="h-2.5 w-2.5" />
                                                                                {startDate && endDate ? `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}` : startDate ? `From ${startDate.toLocaleDateString()}` : `Until ${endDate!.toLocaleDateString()}`}
                                                                            </Badge>
                                                                        )}
                                                                        {promo.appliesTo && promo.appliesTo !== 'total' && (
                                                                            <Badge variant="outline" className="text-[7px] font-black h-5 px-2 border-slate-200 text-slate-500">
                                                                                Applies to: {promo.appliesTo}
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                    {promo.showPdfOnQuote && promo.pdfUrl && (
                                                                        <a href={promo.pdfUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1.5 mt-2 text-[9px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 transition-colors">
                                                                            <FileText className="h-3 w-3" /> View Promotion Details
                                                                            <ExternalLink className="h-2.5 w-2.5" />
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {promotionDiscount > 0 && (
                                                <div className="flex items-center justify-between p-5 rounded-2xl bg-emerald-50 border-2 border-emerald-200">
                                                    <div className="flex items-center gap-3">
                                                        <Percent className="h-5 w-5 text-emerald-600" />
                                                        <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700">Total Savings</span>
                                                    </div>
                                                    <span className="text-lg font-black text-emerald-600 italic">-${promotionDiscount.toLocaleString()}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
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
                                                <button onClick={() => { const isSelected = selectedTrailerId === 'primary-trailer'; setSelectedTrailerId(isSelected ? null : 'primary-trailer'); if (!isSelected) setSelectedTrailerOptionIds((model.trailerConfig?.options || []).filter((o: any) => o.isStandard).map((o: any) => o.id)); }} className={cn("flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-xl border-transparent p-1 h-full", selectedTrailerId === 'primary-trailer' ? "bg-primary/5 border-primary shadow-md ring-2 ring-primary/20" : "hover:border-primary/20")}>
                                                    <div className={cn("relative aspect-video w-full bg-white shrink-0", !model.trailerConfig.imageUrl && "hidden")}>{model.trailerConfig.imageUrl && <Image src={model.trailerConfig.imageUrl} alt="Trailer" fill className="object-contain mix-blend-multiply p-4" />}</div>
                                                    <div className="p-3 flex flex-col items-center justify-center text-center gap-1 flex-grow border-t border-slate-50">
                                                        <p className={cn("text-[10px] font-black uppercase tracking-tight leading-tight", selectedTrailerId === 'primary-trailer' ? "text-primary" : "text-slate-900")}>{model.trailerConfig.name}</p>
                                                        <p className={cn("text-[9px] font-black uppercase tracking-widest", selectedTrailerId === 'primary-trailer' ? "text-primary/70" : "text-slate-400")}>${(model.trailerConfig.sellPriceExclGst || 0).toLocaleString()}</p>
                                                    </div>
                                                </button>
                                            </div>
                                        ) : <div className="py-16 text-center border-2 border-dashed rounded-xl opacity-20"><Truck className="h-10 w-10 mx-auto mb-3" /><p className="text-[9px] font-black uppercase tracking-widest">No primary trailer defined.</p></div>}
                                    </div>
                                    {selectedTrailerId && (
                                        <>
                                            {model.trailerConfig?.options?.length > 0 && (
                                                <div ref={el => { categoryRefs.current['Trailer Hardware'] = el; }} className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 scroll-mt-10">
                                                    <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                                                        <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Trailer Hardware</h3>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        {model.trailerConfig.options.map((opt: any) => (
                                                            <button key={opt.id} onClick={() => toggleTrailerOption(opt.id)} className={cn("flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-md border-transparent h-full p-1", selectedTrailerOptionIds.includes(opt.id) ? "bg-primary/5 border-primary shadow-sm ring-2 ring-primary/20" : "hover:border-primary/20")}>
                                                                <div className="p-4 flex flex-col items-center justify-center text-center gap-1 flex-grow">
                                                                    {opt.isStandard && <Badge className="mb-1.5 bg-emerald-500 text-white border-none font-black text-[6px] uppercase h-3.5 px-1">STANDARD</Badge>}
                                                                    <p className={cn("text-[10px] font-black uppercase tracking-widest leading-tight", selectedTrailerOptionIds.includes(opt.id) ? "text-primary" : "text-slate-700")}>{opt.name}</p>
                                                                    <p className={cn("text-[9px] font-black", selectedTrailerOptionIds.includes(opt.id) ? "text-primary" : "text-slate-400")}>+${(opt.sellPriceExclGst || 0).toLocaleString()}</p>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* --- ADDITIONAL FACTORY TRAILER NOTES/OPTIONS --- */}
                                            <div className="space-y-6 scroll-mt-10">
                                                <div className="flex items-center gap-3 bg-slate-900 px-6 py-3 rounded-2xl shadow-xl w-full">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Additional Factory Trailer Notes/Options</h3>
                                                </div>
                                                <Card className="rounded-[2rem] border-2 shadow-xl p-6 bg-white space-y-6">
                                                    <div className="grid gap-4">
                                                        <div className="space-y-2">
                                                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Addition Label</Label>
                                                            <Input placeholder="e.g. Spare Wheel Mount" value={newCustomTrailerName} onChange={e => setNewCustomTrailerName(e.target.value)} className="h-11 font-bold border-2 rounded-xl" />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Sell Price (Excl.)</Label>
                                                                <div className="relative">
                                                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                                                                    <Input type="number" placeholder="0.00" value={newCustomTrailerPrice} onChange={e => setNewCustomTrailerPrice(e.target.value)} className="h-11 pl-9 font-black border-2 rounded-xl" />
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col justify-end">
                                                                <Button onClick={handleAddCustomTrailerOption} disabled={!newCustomTrailerName.trim() || !newCustomTrailerPrice} className="h-11 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg bg-primary">
                                                                    <Plus className="h-4 w-4 mr-2" /> Add to Build
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Description (Optional)</Label>
                                                            <Input placeholder="Technical notes or specific requirements..." value={newCustomTrailerDesc} onChange={e => setNewCustomTrailerDesc(e.target.value)} className="h-11 font-bold border-2 rounded-xl" />
                                                        </div>
                                                    </div>

                                                    {customTrailerOptions.length > 0 && (
                                                        <div className="pt-6 border-t space-y-3">
                                                            {customTrailerOptions.map(opt => (
                                                                <div key={opt.id} className="flex items-center justify-between p-4 rounded-2xl border-2 bg-slate-50 group/custom">
                                                                    <div className="min-w-0">
                                                                        <p className="font-black text-xs uppercase tracking-tight text-slate-900">{opt.name}</p>
                                                                        {opt.description && <p className="text-[9px] font-bold text-muted-foreground uppercase mt-0.5 truncate">{opt.description}</p>}
                                                                    </div>
                                                                    <div className="flex items-center gap-4">
                                                                        <p className="font-black text-xs text-primary">${opt.sellPriceExclGst.toLocaleString()}</p>
                                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-full" onClick={() => handleRemoveCustomTrailerOption(opt.id)}><Trash2 className="h-4 w-4" /></Button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </Card>
                                            </div>

                                            {/* --- TRAILER DEALER FIT --- */}
                                            {groupedTrailerDealerFit.length > 0 && (
                                                <>
                                                    <div className="flex items-center gap-4 py-2">
                                                        <div className="flex-1 border-t-2 border-dashed border-slate-200" />
                                                        <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-300">Trailer Dealer Fit</span>
                                                        <div className="flex-1 border-t-2 border-dashed border-slate-200" />
                                                    </div>
                                                    {groupedTrailerDealerFit.map(([cat, opts]) => (
                                                        <div key={`tdf-${cat}`} ref={el => { categoryRefs.current[`tdf-${cat}`] = el; }} className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 scroll-mt-10">
                                                            <div className="flex items-center gap-3 bg-amber-600 px-6 py-3 rounded-2xl shadow-xl w-full">
                                                                <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">{cat}</h3>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-4">
                                                                {opts.map((sel: any) => {
                                                                    const isSelected = selectedDealerFitIds.includes(sel.id);
                                                                    const hasOverlap = !isSelected && sel.items?.some((i: any) => i.rowId && selectedDealerRowIds.has(i.rowId));
                                                                    return (
                                                                    <button key={sel.id} onClick={() => toggleDealerFitSelection(sel.id)} className={cn("flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-lg border-transparent h-full p-1 relative", isSelected ? "bg-amber-50 border-amber-600 shadow-md ring-2 ring-amber-600/20" : hasOverlap ? "border-amber-300 opacity-70" : "hover:border-amber-600/20")}>
                                                                        {hasOverlap && <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5"><CopyCheck className="h-3 w-3 text-amber-600" /><span className="text-[7px] font-black uppercase tracking-wide text-amber-700">Already Included</span></div>}
                                                                        <div className={cn("relative aspect-video w-full bg-white overflow-hidden shrink-0", !resolveImageUrl(sel.items?.[0]?.data) && "hidden")}>{resolveImageUrl(sel.items?.[0]?.data) && <Image src={resolveImageUrl(sel.items?.[0]?.data)!} alt={sel.name} fill className="object-contain p-3 mix-blend-multiply transition-transform group-hover:scale-105" />}</div>
                                                                        <div className="p-4 flex flex-col items-center justify-center text-center gap-1 flex-grow">
                                                                            <p className={cn("text-[10px] font-black uppercase tracking-tight leading-tight", isSelected ? "text-amber-700" : "text-slate-900")}>{sel.name}</p>
                                                                            <p className={cn("text-[8px] font-black uppercase tracking-widest", isSelected ? "text-amber-600/70" : "text-slate-400")}>{sel.type === 'package' ? `${sel.items.length} COMPONENTS • ` : ''}${(sel.items.reduce((acc: number, i: any) => acc + (i.data?.['Act Sell'] || i.data?.sellPriceExclGst || i.data?.['Store Price'] || i.data?.PARTS || i.data?.RRP || i.data?.Price || i.data?.Retail || i.data?.Trade || 0), 0)).toLocaleString()}</p>
                                                                        </div>
                                                                    </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </>
                                            )}
                                            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700 scroll-mt-24">
                                                <div className="flex items-center gap-3 bg-primary px-6 py-3 rounded-2xl shadow-xl w-full">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Trailer Registration</h3>
                                                </div>
                                                <div className={cn("flex items-center justify-between p-6 rounded-[2rem] border-2 transition-all cursor-pointer bg-white shadow-xl", isTrailerRegoSelected ? "bg-primary/5 border-primary ring-2 ring-primary/20 shadow-md" : "border-transparent hover:border-primary/20")} onClick={() => setIsTrailerRegoSelected(!isTrailerRegoSelected)}>
                                                    <div className="flex items-center gap-4">
                                                        <div className={cn("h-10 w-10 rounded-2xl flex items-center justify-center border-2 shadow-inner", isTrailerRegoSelected ? "bg-primary border-primary text-white" : "bg-slate-50 border-slate-100 text-slate-300")}><Truck className="h-5 w-5" /></div>
                                                        <div><p className={cn("text-[11px] font-black uppercase tracking-widest", isTrailerRegoSelected ? "text-primary" : "text-slate-600")}>12 Months Trailer Rego</p><p className="text-[9px] font-bold text-muted-foreground mt-0.5">Government Compliance</p></div>
                                                    </div>
                                                    <p className={cn("font-black text-sm", isTrailerRegoSelected ? "text-primary" : "text-slate-400")}>${(model.registration?.trailerPrice12Months || 0).toLocaleString()}</p>
                                                </div>
                                            </div>
                                        </>
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
                                                        // Detect if items in this (unselected) selection are already included via another category
                                                        const hasOverlap = !isSelected && sel.items?.some((i: any) => i.rowId && selectedDealerRowIds.has(i.rowId));
                                                        return (
                                                        <button key={sel.id} onClick={() => toggleDealerFitSelection(sel.id)} className={cn("flex flex-col border-2 rounded-[1.5rem] overflow-hidden transition-all bg-white shadow-lg border-transparent h-full p-1 relative", isSelected ? "bg-primary/5 border-primary shadow-md ring-2 ring-primary/20" : hasOverlap ? "border-amber-300 opacity-70" : "hover:border-primary/20")}>
                                                            {hasOverlap && <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5"><CopyCheck className="h-3 w-3 text-amber-600" /><span className="text-[7px] font-black uppercase tracking-wide text-amber-700">Already Included</span></div>}
                                                            <div className={cn("relative aspect-video w-full bg-white overflow-hidden shrink-0", !resolveImageUrl(sel.items?.[0]?.data) && "hidden")}>{resolveImageUrl(sel.items?.[0]?.data) && <Image src={resolveImageUrl(sel.items?.[0]?.data)!} alt={sel.name} fill className="object-contain p-3 mix-blend-multiply transition-transform group-hover:scale-105" />}</div>
                                                            <div className="p-4 flex flex-col items-center justify-center text-center gap-1 flex-grow">
                                                                <p className={cn("text-[10px] font-black uppercase tracking-tight leading-tight", isSelected ? "text-primary" : "text-slate-900")}>{sel.name}</p>
                                                                <p className={cn("text-[8px] font-black uppercase tracking-widest", isSelected ? "text-primary/70" : "text-slate-400")}>{sel.type === 'package' ? `${sel.items.length} COMPONENTS • ` : ''}${(sel.items.reduce((acc: number, i: any) => acc + (i.data?.['Act Sell'] || i.data?.sellPriceExclGst || i.data?.['Store Price'] || i.data?.PARTS || i.data?.RRP || i.data?.Price || i.data?.Retail || i.data?.Trade || 0), 0)).toLocaleString()}</p>
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
                                        <Card className="rounded-[1.5rem] border-2 shadow-lg overflow-hidden"><CardHeader className="bg-muted/30 border-b p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Ship className="h-4 w-4 text-primary" /><CardTitle className="text-xs font-black uppercase tracking-widest">Base Vessel</CardTitle></div><div className="flex items-center gap-1.5"><input ref={boatPdfRef} type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0] || null; setSectionPdfs(prev => ({ ...prev, boat: f })); }} />{sectionPdfs.boat ? (<span className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><Paperclip className="h-2.5 w-2.5" />{sectionPdfs.boat.name.length > 18 ? sectionPdfs.boat.name.slice(0, 15) + '...' : sectionPdfs.boat.name}<button type="button" className="ml-0.5 hover:text-destructive" onClick={() => { setSectionPdfs(prev => ({ ...prev, boat: null })); if (boatPdfRef.current) boatPdfRef.current.value = ''; }}><X className="h-2.5 w-2.5" /></button></span>) : (<button type="button" onClick={() => boatPdfRef.current?.click()} className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground hover:text-primary transition-colors"><Paperclip className="h-2.5 w-2.5" />Attach PDF</button>)}</div></div></CardHeader><CardContent className="p-4">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-0.5">
                                                    <p className="font-black text-sm uppercase tracking-tight text-slate-900">{range?.name} {model?.name}</p>
                                                    <p className="text-[9px] font-bold text-muted-foreground uppercase">{selectedMaterial} • {activeVariant?.name || 'Standard Color'}</p>
                                                </div>
                                                <p className="font-black text-primary italic text-sm">${(activeVariant?.sellPriceExclGst || 0).toLocaleString()}</p>
                                            </div>
                                            {isRegoSelected && (
                                                <div className="mt-4 pt-4 border-t border-dashed space-y-2">
                                                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                                                        <div className="flex items-center gap-2">
                                                            <div className="group/remove h-5 w-5 rounded bg-slate-100 flex items-center justify-center relative transition-all hover:bg-destructive/10">
                                                                <Check className="h-3 w-3 text-emerald-500 group-hover/remove:opacity-0 transition-opacity" />
                                                                <Button variant="ghost" size="icon" className="absolute inset-0 h-full w-full p-0 opacity-0 group-hover/remove:opacity-100 text-destructive" onClick={handleRegoToggle}><X className="h-3 w-3" /></Button>
                                                            </div>
                                                            <span className="uppercase">12 MONTHS REGISTRATION</span>
                                                        </div>
                                                        <span>${(model.registration?.price12Months || 0).toLocaleString()}</span>
                                                    </div>
                                                    {isStickerSelected && (
                                                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 pl-7">
                                                            <div className="flex items-center gap-2">
                                                                <div className="group/remove h-5 w-5 rounded bg-slate-100 flex items-center justify-center relative transition-all hover:bg-destructive/10">
                                                                    <Check className="h-3 w-3 text-emerald-500 group-hover/remove:opacity-0 transition-opacity" />
                                                                    <Button variant="ghost" size="icon" className="absolute inset-0 h-full w-full p-0 opacity-0 group-hover/remove:opacity-100 text-destructive" onClick={handleStickerToggle}><X className="h-3 w-3" /></Button>
                                                                </div>
                                                                <span className="uppercase">REGISTRATION STICKERS</span>
                                                            </div>
                                                            <span>${(model.registration?.stickerPrice || 0).toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                    {isTenderToSelected && (
                                                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 pl-14">
                                                            <div className="flex items-center gap-2">
                                                                <div className="group/remove h-5 w-5 rounded bg-slate-100 flex items-center justify-center relative transition-all hover:bg-destructive/10">
                                                                    <Check className="h-3 w-3 text-emerald-500 group-hover/remove:opacity-0 transition-opacity" />
                                                                    <Button variant="ghost" size="icon" className="absolute inset-0 h-full w-full p-0 opacity-0 group-hover/remove:opacity-100 text-destructive" onClick={() => setIsTenderToSelected(false)}><X className="h-3 w-3" /></Button>
                                                                </div>
                                                                <span className="uppercase">"TENDER TO" DECAL</span>
                                                            </div>
                                                            <span>${(model.registration?.tenderToStickerPrice || 0).toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </CardContent></Card>
                                        
                                        {(selectedOptionsData.length > 0 || customOptions.length > 0) && (
                                            <Card className="rounded-[1.5rem] border-2 shadow-lg overflow-hidden">
                                                <CardHeader className="bg-muted/30 border-b p-4"><div className="flex items-center gap-2"><Package className="h-4 w-4 text-primary" /><CardTitle className="text-xs font-black uppercase tracking-widest">Factory & Custom Options</CardTitle></div></CardHeader>
                                                <CardContent className="p-0">
                                                    <div className="divide-y">
                                                        {selectedOptionsData.map((opt: any) => (
                                                            <div key={opt.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="group/remove h-6 w-6 rounded-lg bg-slate-100 flex items-center justify-center relative transition-all hover:bg-destructive/10">
                                                                        <Check className="h-3 w-3 text-emerald-500 group-hover/remove:opacity-0 transition-opacity" />
                                                                        <Button variant="ghost" size="icon" className="absolute inset-0 h-full w-full p-0 opacity-0 group-hover/remove:opacity-100 text-destructive" onClick={() => toggleOption(opt.id)}><X className="h-3 w-3" /></Button>
                                                                    </div>
                                                                    <div>{(() => { const { base, color } = formatOptionDisplayLabel(opt.name); return (<><p className="text-[10px] font-black uppercase tracking-tight">{base}{color && <span className="text-primary ml-1">({color})</span>}</p><Badge variant="outline" className="text-[7px] font-black h-3.5 px-1">{opt.category || 'Standard'}</Badge></>); })()}</div>
                                                                </div>
                                                                <p className="text-[10px] font-bold text-slate-600">${(opt.sellPriceExclGst || 0).toLocaleString()}</p>
                                                            </div>
                                                        ))}
                                                        {customOptions.map((opt) => (
                                                            <div key={opt.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="group/remove h-6 w-6 rounded-lg bg-slate-100 flex items-center justify-center relative transition-all hover:bg-destructive/10">
                                                                        <FilePlus2 className="h-3 w-3 text-primary group-hover/remove:opacity-0 transition-opacity" />
                                                                        <Button variant="ghost" size="icon" className="absolute inset-0 h-full w-full p-0 opacity-0 group-hover/remove:opacity-100 text-destructive" onClick={() => handleRemoveCustomOption(opt.id)}><X className="h-3 w-3" /></Button>
                                                                    </div>
                                                                    <div><p className="text-[10px] font-black uppercase tracking-tight">{opt.name}</p><Badge variant="outline" className="text-[7px] font-black h-3.5 px-1 border-primary/20 text-primary bg-primary/5">Custom Addition</Badge></div>
                                                                </div>
                                                                <p className="text-[10px] font-bold text-slate-600">${(opt.sellPriceExclGst || 0).toLocaleString()}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}

                                        {selectedMotor && (
                                            <Card className="rounded-[1.5rem] border-2 shadow-lg overflow-hidden">
                                                <CardHeader className="bg-muted/30 border-b p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /><CardTitle className="text-xs font-black uppercase tracking-widest">Powertrain</CardTitle></div><div className="flex items-center gap-1.5"><input ref={motorPdfRef} type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0] || null; setSectionPdfs(prev => ({ ...prev, motor: f })); }} />{sectionPdfs.motor ? (<span className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><Paperclip className="h-2.5 w-2.5" />{sectionPdfs.motor.name.length > 18 ? sectionPdfs.motor.name.slice(0, 15) + '...' : sectionPdfs.motor.name}<button type="button" className="ml-0.5 hover:text-destructive" onClick={() => { setSectionPdfs(prev => ({ ...prev, motor: null })); if (motorPdfRef.current) motorPdfRef.current.value = ''; }}><X className="h-2.5 w-2.5" /></button></span>) : (<button type="button" onClick={() => motorPdfRef.current?.click()} className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground hover:text-primary transition-colors"><Paperclip className="h-2.5 w-2.5" />Attach PDF</button>)}</div></div></CardHeader>
                                                <CardContent className="p-0">
                                                    <div className="p-4 border-b flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="group/remove h-6 w-6 rounded-lg bg-slate-100 flex items-center justify-center relative transition-all hover:bg-destructive/10">
                                                                <Check className="h-3 w-3 text-emerald-500 group-hover/remove:opacity-0 transition-opacity" />
                                                                <Button variant="ghost" size="icon" className="absolute inset-0 h-full w-full p-0 opacity-0 group-hover/remove:opacity-100 text-destructive" onClick={() => setSelectedMotor(null)}><X className="h-3 w-3" /></Button>
                                                            </div>
                                                            <div className="space-y-0.5"><p className="font-black text-sm uppercase tracking-tight text-slate-900">{getMotorDisplayName(selectedMotor)}</p><p className="text-[9px] font-bold text-muted-foreground uppercase">{selectedMotor['HP Rating']} HP Performance</p></div>
                                                        </div>
                                                        <p className="font-black text-primary italic text-sm">${(selectedMotor.sellPriceExclGst || 0).toLocaleString()}</p>
                                                    </div>
                                                    {selectedMotorAccessories.length > 0 && (
                                                        <div className="divide-y bg-slate-50/50">
                                                            {selectedMotorAccessories.map((acc: any) => (
                                                                <div key={acc.id} className="p-4 flex items-center justify-between">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="group/remove h-6 w-6 rounded-lg bg-white border flex items-center justify-center relative transition-all hover:bg-destructive/10">
                                                                            <Wrench className="h-3 w-3 text-primary/40 group-hover/remove:opacity-0 transition-opacity" />
                                                                            <Button variant="ghost" size="icon" className="absolute inset-0 h-full w-full p-0 opacity-0 group-hover/remove:opacity-100 text-destructive" onClick={() => toggleMotorAccessory(acc.id)}><X className="h-3 w-3" /></Button>
                                                                        </div>
                                                                        <div><p className="text-[10px] font-black uppercase tracking-tight">{acc.name}</p><Badge variant="outline" className="text-[7px] font-black h-3.5 px-1 border-primary/10 text-primary/60">{acc.category || 'Standard'}</Badge></div>
                                                                    </div>
                                                                    <p className="text-[10px] font-bold text-slate-600">+${(acc.sellPriceExclGst || 0).toLocaleString()}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        )}

                                        {(extendedWarranty || servicePlan) && (
                                            <Card className="rounded-[1.5rem] border-2 border-blue-200 shadow-lg overflow-hidden bg-blue-50/30">
                                                <CardHeader className="bg-blue-500 border-b p-4"><div className="flex items-center gap-2"><Star className="h-4 w-4 text-white" /><CardTitle className="text-xs font-black uppercase tracking-widest text-white">Dealer Services</CardTitle></div></CardHeader>
                                                <CardContent className="p-0">
                                                    <div className="divide-y divide-blue-100">
                                                        {extendedWarranty && (
                                                            <div className="p-4 flex items-center justify-between hover:bg-blue-50 transition-colors">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="group/remove h-6 w-6 rounded-lg bg-blue-100 flex items-center justify-center relative transition-all hover:bg-destructive/10">
                                                                        <Check className="h-3 w-3 text-blue-600 group-hover/remove:opacity-0 transition-opacity" />
                                                                        <Button variant="ghost" size="icon" className="absolute inset-0 h-full w-full p-0 opacity-0 group-hover/remove:opacity-100 text-destructive" onClick={() => setExtendedWarranty(false)}><X className="h-3 w-3" /></Button>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-black uppercase tracking-tight text-blue-800">NSM 6 Year Extended Warranty</p>
                                                                        <Badge className="text-[7px] font-black h-3.5 px-1 bg-blue-100 text-blue-600 border-blue-200">Extended Coverage</Badge>
                                                                    </div>
                                                                </div>
                                                                <p className="text-[10px] font-bold text-blue-600">Included</p>
                                                            </div>
                                                        )}
                                                        {servicePlan && (
                                                            <div className="p-4 flex items-center justify-between hover:bg-blue-50 transition-colors">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="group/remove h-6 w-6 rounded-lg bg-blue-100 flex items-center justify-center relative transition-all hover:bg-destructive/10">
                                                                        <Check className="h-3 w-3 text-blue-600 group-hover/remove:opacity-0 transition-opacity" />
                                                                        <Button variant="ghost" size="icon" className="absolute inset-0 h-full w-full p-0 opacity-0 group-hover/remove:opacity-100 text-destructive" onClick={() => setServicePlan(false)}><X className="h-3 w-3" /></Button>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-black uppercase tracking-tight text-blue-800">Direct Debit Service Plan</p>
                                                                        <Badge className="text-[7px] font-black h-3.5 px-1 bg-blue-100 text-blue-600 border-blue-200">Service Plan</Badge>
                                                                    </div>
                                                                </div>
                                                                <p className="text-[10px] font-bold text-blue-600">Included</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}

                                        {selectedTrailerId && model.trailerConfig && (
                                            <Card className="rounded-[1.5rem] border-2 shadow-lg overflow-hidden">
                                                <CardHeader className="bg-muted/30 border-b p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /><CardTitle className="text-xs font-black uppercase tracking-widest">Towing Solution</CardTitle></div><div className="flex items-center gap-1.5"><input ref={trailerPdfRef} type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0] || null; setSectionPdfs(prev => ({ ...prev, trailer: f })); }} />{sectionPdfs.trailer ? (<span className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><Paperclip className="h-2.5 w-2.5" />{sectionPdfs.trailer.name.length > 18 ? sectionPdfs.trailer.name.slice(0, 15) + '...' : sectionPdfs.trailer.name}<button type="button" className="ml-0.5 hover:text-destructive" onClick={() => { setSectionPdfs(prev => ({ ...prev, trailer: null })); if (trailerPdfRef.current) trailerPdfRef.current.value = ''; }}><X className="h-2.5 w-2.5" /></button></span>) : (<button type="button" onClick={() => trailerPdfRef.current?.click()} className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground hover:text-primary transition-colors"><Paperclip className="h-2.5 w-2.5" />Attach PDF</button>)}</div></div></CardHeader>
                                                <CardContent className="p-0">
                                                    <div className="p-4 border-b flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="group/remove h-6 w-6 rounded-lg bg-slate-100 flex items-center justify-center relative transition-all hover:bg-destructive/10">
                                                                <Check className="h-3 w-3 text-emerald-500 group-hover/remove:opacity-0 transition-opacity" />
                                                                <Button variant="ghost" size="icon" className="absolute inset-0 h-full w-full p-0 opacity-0 group-hover/remove:opacity-100 text-destructive" onClick={() => setSelectedTrailerId(null)}><X className="h-3 w-3" /></Button>
                                                            </div>
                                                            <div className="space-y-0.5"><p className="font-black text-sm uppercase tracking-tight text-slate-900">{model.trailerConfig.name}</p><p className="text-[9px] font-bold text-muted-foreground uppercase">Precision Chassis</p></div>
                                                        </div>
                                                        <p className="font-black text-primary italic text-sm">${(model.trailerConfig.sellPriceExclGst || 0).toLocaleString()}</p>
                                                    </div>
                                                    {isTrailerRegoSelected && (
                                                        <div className="p-4 border-b flex items-center justify-between bg-slate-50/50">
                                                            <div className="flex items-center gap-3">
                                                                <div className="group/remove h-6 w-6 rounded-lg bg-white border flex items-center justify-center relative transition-all hover:bg-destructive/10">
                                                                    <Check className="h-3 w-3 text-emerald-500 group-hover/remove:opacity-0 transition-opacity" />
                                                                    <Button variant="ghost" size="icon" className="absolute inset-0 h-full w-full p-0 opacity-0 group-hover/remove:opacity-100 text-destructive" onClick={() => setIsTrailerRegoSelected(false)}><X className="h-3 w-3" /></Button>
                                                                </div>
                                                                <span className="text-[10px] font-bold text-slate-600 uppercase">12 MONTHS TRAILER REGISTRATION</span>
                                                            </div>
                                                            <p className="text-[10px] font-bold text-slate-600">${(model.registration?.trailerPrice12Months || 0).toLocaleString()}</p>
                                                        </div>
                                                    )}
                                                    {selectedTrailerOptionsData.length > 0 && (
                                                        <div className="divide-y bg-slate-50/50">
                                                            {selectedTrailerOptionsData.map((opt: any) => (
                                                                <div key={opt.id} className="p-4 flex items-center justify-between">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="group/remove h-6 w-6 rounded-lg bg-white border flex items-center justify-center relative transition-all hover:bg-destructive/10">
                                                                            <Layers className="h-3 w-3 text-primary/40 group-hover/remove:opacity-0 transition-opacity" />
                                                                            <Button variant="ghost" size="icon" className="absolute inset-0 h-full w-full p-0 opacity-0 group-hover/remove:opacity-100 text-destructive" onClick={() => toggleTrailerOption(opt.id)}><X className="h-3 w-3" /></Button>
                                                                        </div>
                                                                        <p className="text-[10px] font-black uppercase tracking-tight">{opt.name}</p>
                                                                    </div>
                                                                    <p className="text-[10px] font-bold text-slate-600">+${(opt.sellPriceExclGst || 0).toLocaleString()}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {customTrailerOptions.length > 0 && (
                                                        <div className="divide-y bg-slate-50/50">
                                                            {customTrailerOptions.map((opt) => (
                                                                <div key={opt.id} className="p-4 flex items-center justify-between">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="group/remove h-6 w-6 rounded-lg bg-white border flex items-center justify-center relative transition-all hover:bg-destructive/10">
                                                                            <FilePlus2 className="h-3 w-3 text-primary group-hover/remove:opacity-0 transition-opacity" />
                                                                            <Button variant="ghost" size="icon" className="absolute inset-0 h-full w-full p-0 opacity-0 group-hover/remove:opacity-100 text-destructive" onClick={() => handleRemoveCustomTrailerOption(opt.id)}><X className="h-3 w-3" /></Button>
                                                                        </div>
                                                                        <div><p className="text-[10px] font-black uppercase tracking-tight">{opt.name}</p><Badge variant="outline" className="text-[7px] font-black h-3.5 px-1 border-primary/20 text-primary bg-primary/5">Custom Trailer Addition</Badge></div>
                                                                    </div>
                                                                    <p className="text-[10px] font-bold text-slate-600">+${opt.sellPriceExclGst.toLocaleString()}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        )}

                                        {selectedDealerFitData.length > 0 && (
                                            <Card className="rounded-[1.5rem] border-2 shadow-lg overflow-hidden">
                                                <CardHeader className="bg-muted/30 border-b p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-primary" /><CardTitle className="text-xs font-black uppercase tracking-widest">Dealer Fitments</CardTitle></div><div className="flex items-center gap-1.5"><input ref={dealerFitPdfRef} type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0] || null; setSectionPdfs(prev => ({ ...prev, dealerFit: f })); }} />{sectionPdfs.dealerFit ? (<span className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><Paperclip className="h-2.5 w-2.5" />{sectionPdfs.dealerFit.name.length > 18 ? sectionPdfs.dealerFit.name.slice(0, 15) + '...' : sectionPdfs.dealerFit.name}<button type="button" className="ml-0.5 hover:text-destructive" onClick={() => { setSectionPdfs(prev => ({ ...prev, dealerFit: null })); if (dealerFitPdfRef.current) dealerFitPdfRef.current.value = ''; }}><X className="h-2.5 w-2.5" /></button></span>) : (<button type="button" onClick={() => dealerFitPdfRef.current?.click()} className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground hover:text-primary transition-colors"><Paperclip className="h-2.5 w-2.5" />Attach PDF</button>)}</div></div></CardHeader>
                                                <CardContent className="p-0">
                                                    <div className="divide-y">
                                                        {selectedDealerFitData.map((sel: any) => (
                                                            <div key={sel.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="group/remove h-6 w-6 rounded-lg bg-slate-100 flex items-center justify-center relative transition-all hover:bg-destructive/10">
                                                                        <Check className="h-3 w-3 text-emerald-500 group-hover/remove:opacity-0 transition-opacity" />
                                                                        <Button variant="ghost" size="icon" className="absolute inset-0 h-full w-full p-0 opacity-0 group-hover/remove:opacity-100 text-destructive" onClick={() => toggleDealerFitSelection(sel.id)}><X className="h-3 w-3" /></Button>
                                                                    </div>
                                                                    <div><p className="text-[10px] font-black uppercase tracking-tight">{sel.name}</p><Badge variant="outline" className="text-[7px] font-black h-3.5 px-1">{sel.category || 'Gear'}</Badge></div>
                                                                </div>
                                                                <p className="text-[10px] font-bold text-slate-600">${(sel.items.reduce((acc: number, i: any) => acc + (i.data?.['Act Sell'] || i.data?.sellPriceExclGst || i.data?.['Store Price'] || i.data?.PARTS || i.data?.RRP || i.data?.Price || i.data?.Retail || i.data?.Trade || 0), 0)).toLocaleString()}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        )}

                                        {appliedPromotions.length > 0 && (
                                            <Card className="rounded-[1.5rem] border-2 border-emerald-200 shadow-lg overflow-hidden bg-emerald-50/30">
                                                <CardHeader className="bg-emerald-600 border-b p-4"><div className="flex items-center gap-2"><Gift className="h-4 w-4 text-white" /><CardTitle className="text-xs font-black uppercase tracking-widest text-white">Applied Promotions</CardTitle></div></CardHeader>
                                                <CardContent className="p-0">
                                                    <div className="divide-y divide-emerald-100">
                                                        {appliedPromotions.map(promo => (
                                                            <div key={promo.id} className="p-4 flex items-center justify-between hover:bg-emerald-50 transition-colors">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="h-6 w-6 rounded-lg bg-emerald-100 flex items-center justify-center">
                                                                        <Check className="h-3 w-3 text-emerald-600" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-black uppercase tracking-tight text-emerald-800">{promo.name}</p>
                                                                        <Badge className="text-[7px] font-black h-3.5 px-1 bg-emerald-100 text-emerald-600 border-emerald-200">
                                                                            {promo.type === 'fixed-amount' ? 'Fixed Discount' : promo.type === 'per-hp' ? 'Per HP' : promo.type === 'percentage' ? 'Percentage' : 'Category Discount'}
                                                                        </Badge>
                                                                    </div>
                                                                </div>
                                                                <p className="text-[10px] font-bold text-emerald-600">
                                                                    {promo.type === 'fixed-amount' ? `-$${(promo.fixedAmount || 0).toLocaleString()}` : promo.type === 'per-hp' ? `$${promo.perHpAmount}/HP` : `${promo.percentage}% OFF`}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {promotionDiscount > 0 && (
                                                        <div className="p-4 border-t-2 border-emerald-200 bg-emerald-100/50 flex items-center justify-between">
                                                            <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700">Total Savings</span>
                                                            <span className="font-black text-emerald-600 italic text-lg">-${promotionDiscount.toLocaleString()}</span>
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        )}

                                        {/* Admin & Trade-In Section */}
                                        <Card className="rounded-[1.5rem] border-2 shadow-lg overflow-hidden">
                                            <CardHeader className="bg-muted/30 border-b p-4">
                                                <div className="flex items-center gap-2">
                                                    <ClipboardList className="h-4 w-4 text-primary" />
                                                    <CardTitle className="text-xs font-black uppercase tracking-widest">Admin & Trade-In</CardTitle>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="p-5 space-y-6">

                                                {/* Trade-In */}
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-2">
                                                        <Car className="h-3.5 w-3.5 text-primary" />
                                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Trade-In Vehicle</Label>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Textarea
                                                            placeholder="Description (make, model, year, condition...)"
                                                            value={tradeInDescription}
                                                            onChange={(e) => setTradeInDescription(e.target.value)}
                                                            className="min-h-[72px] rounded-xl border-2 text-sm font-bold resize-none"
                                                        />
                                                        <div className="space-y-1.5">
                                                            <Label htmlFor="trade-in-value" className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5">
                                                                <DollarSign className="h-3 w-3" /> Agreed Trade-In Value
                                                            </Label>
                                                            <Input
                                                                id="trade-in-value"
                                                                type="number"
                                                                placeholder="0"
                                                                value={tradeInValue}
                                                                onChange={(e) => setTradeInValue(e.target.value)}
                                                                className="h-11 rounded-xl border-2 font-bold text-sm"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <Separator />

                                                {/* Insurance Quote */}
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-3">
                                                        <Checkbox
                                                            id="wants-insurance"
                                                            checked={wantsInsurance}
                                                            onCheckedChange={(checked) => setWantsInsurance(checked === true)}
                                                            className="h-5 w-5 rounded border-2"
                                                        />
                                                        <Label htmlFor="wants-insurance" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 cursor-pointer">
                                                            <Shield className="h-3.5 w-3.5 text-primary" /> I would like an Insurance Quote
                                                        </Label>
                                                    </div>
                                                    {wantsInsurance && (
                                                        <Textarea
                                                            placeholder="Insurance notes (coverage preferences, existing policies...)"
                                                            value={insuranceNotes}
                                                            onChange={(e) => setInsuranceNotes(e.target.value)}
                                                            className="min-h-[60px] rounded-xl border-2 text-sm font-bold resize-none animate-in fade-in slide-in-from-top-1 duration-200"
                                                        />
                                                    )}
                                                </div>

                                                <Separator />

                                                {/* Finance Quote */}
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-3">
                                                        <Checkbox
                                                            id="wants-finance"
                                                            checked={wantsFinance}
                                                            onCheckedChange={(checked) => setWantsFinance(checked === true)}
                                                            className="h-5 w-5 rounded border-2"
                                                        />
                                                        <Label htmlFor="wants-finance" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 cursor-pointer">
                                                            <Banknote className="h-3.5 w-3.5 text-primary" /> I would like a Finance Quote
                                                        </Label>
                                                    </div>
                                                    {wantsFinance && (
                                                        <Textarea
                                                            placeholder="Finance notes (deposit amount, term preference, trade equity...)"
                                                            value={financeNotes}
                                                            onChange={(e) => setFinanceNotes(e.target.value)}
                                                            className="min-h-[60px] rounded-xl border-2 text-sm font-bold resize-none animate-in fade-in slide-in-from-top-1 duration-200"
                                                        />
                                                    )}
                                                </div>

                                                <Separator />

                                                {/* Timing / Delivery */}
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="h-3.5 w-3.5 text-primary" />
                                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Timing & Delivery</Label>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <div className="space-y-1.5">
                                                            <Label htmlFor="delivery-date" className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5">
                                                                <Calendar className="h-3 w-3" /> Estimated Delivery Date
                                                            </Label>
                                                            <Input
                                                                id="delivery-date"
                                                                type="date"
                                                                value={estimatedDeliveryDate}
                                                                onChange={(e) => setEstimatedDeliveryDate(e.target.value)}
                                                                className="h-11 rounded-xl border-2 font-bold text-sm"
                                                            />
                                                        </div>
                                                        <Textarea
                                                            placeholder="Timing notes (slot availability, special delivery instructions...)"
                                                            value={timingNotes}
                                                            onChange={(e) => setTimingNotes(e.target.value)}
                                                            className="min-h-[60px] rounded-xl border-2 text-sm font-bold resize-none"
                                                        />
                                                    </div>
                                                </div>

                                            </CardContent>
                                        </Card>
                                    </div>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                    <div className="p-8 pt-4 bg-slate-50/80 backdrop-blur-xl shrink-0 flex gap-3">
                        {currentStep > 1 && <Button variant="outline" className="h-12 w-20 rounded-xl border-2 border-slate-200 hover:bg-slate-100 shadow-sm" onClick={prevStep}><ChevronLeft className="h-5 w-5" /></Button>}
                        <Button size="lg" className="flex-1 h-12 rounded-xl font-black uppercase text-xs shadow-xl bg-primary text-white hover:scale-[1.02] active:scale-95" onClick={currentStep === STEPS.length ? () => setShowFinalizeDialog(true) : nextStep}>{currentStep === STEPS.length ? 'Finalize Project' : `Next Step: ${STEPS[currentStep].label.toUpperCase()}`}</Button>
                    </div>
                </div>
            </div>

            <Dialog open={!!lightboxUrl} onOpenChange={(open) => !open && setLightboxUrl(null)}>
                <DialogContent className="max-w-[95vw] h-[90vh] p-0 overflow-hidden bg-black/95 border-none shadow-none rounded-none [&>button]:text-white [&>button]:h-12 [&>button]:w-12 [&>button]:bg-transparent [&>button]:right-6 [&>button]:top-6 [&>button]:focus:ring-0 [&>button]:focus:outline-none">
                    <DialogHeader className="sr-only"><DialogTitle>Immersive Inspection</DialogTitle></DialogHeader>
                    <div className="relative w-full h-full flex items-center justify-center">{lightboxUrl && <Image src={lightboxUrl} alt="Inspection" fill className="object-contain p-4" />}</div>
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

            <Dialog open={showEngineSpecs} onOpenChange={setShowEngineSpecs}>
                <DialogContent className="sm:max-w-lg rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 border-b bg-muted/5"><DialogTitle className="text-xl font-black uppercase tracking-tight italic text-primary">Engine Specs</DialogTitle></DialogHeader>
                    <ScrollArea className="max-h-[60vh]"><div className="p-0"><Table><TableBody>
                        {selectedMotor?.['HP Rating'] && <TableRow className="hover:bg-primary/5 border-b"><TableCell className="font-black uppercase text-[10px] text-muted-foreground w-1/2 pl-6 py-3">HP Rating</TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-6 py-3">{selectedMotor['HP Rating']}</TableCell></TableRow>}
                        {selectedMotor?.['Shaft Length'] && <TableRow className="hover:bg-primary/5 border-b"><TableCell className="font-black uppercase text-[10px] text-muted-foreground w-1/2 pl-6 py-3">Shaft Length</TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-6 py-3">{selectedMotor['Shaft Length']}</TableCell></TableRow>}
                        {selectedMotor?.['Control'] && <TableRow className="hover:bg-primary/5 border-b"><TableCell className="font-black uppercase text-[10px] text-muted-foreground w-1/2 pl-6 py-3">Control</TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-6 py-3">{selectedMotor['Control']}</TableCell></TableRow>}
                        {selectedMotor?.['Starting'] && <TableRow className="hover:bg-primary/5 border-b"><TableCell className="font-black uppercase text-[10px] text-muted-foreground w-1/2 pl-6 py-3">Starting</TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-6 py-3">{selectedMotor['Starting']}</TableCell></TableRow>}
                        {selectedMotor?.['Tilt & Trim'] && <TableRow className="hover:bg-primary/5 border-b"><TableCell className="font-black uppercase text-[10px] text-muted-foreground w-1/2 pl-6 py-3">Tilt & Trim</TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-6 py-3">{selectedMotor['Tilt & Trim']}</TableCell></TableRow>}
                        {selectedMotor?.['Fuel Tank'] && <TableRow className="hover:bg-primary/5 border-b"><TableCell className="font-black uppercase text-[10px] text-muted-foreground w-1/2 pl-6 py-3">Fuel Tank</TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-6 py-3">{selectedMotor['Fuel Tank']}</TableCell></TableRow>}
                        {selectedMotor?.['Prop'] && <TableRow className="hover:bg-primary/5 border-b"><TableCell className="font-black uppercase text-[10px] text-muted-foreground w-1/2 pl-6 py-3">Prop</TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-6 py-3">{selectedMotor['Prop']}</TableCell></TableRow>}
                        {selectedMotor?.['Warranty'] && <TableRow className="hover:bg-primary/5 border-b"><TableCell className="font-black uppercase text-[10px] text-muted-foreground w-1/2 pl-6 py-3">Warranty</TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-6 py-3">{selectedMotor['Warranty']}</TableCell></TableRow>}
                        {(selectedMotor?.['Cylinders'] || selectedMotor?.['Displacement']) && <TableRow className="hover:bg-primary/5 border-b"><TableCell className="font-black uppercase text-[10px] text-muted-foreground w-1/2 pl-6 py-3">Cylinders / Displacement</TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-6 py-3">{[selectedMotor['Cylinders'], selectedMotor['Displacement']].filter(Boolean).join(' / ')}</TableCell></TableRow>}
                        {selectedMotor?.['Engine Colour'] && <TableRow className="hover:bg-primary/5 border-b"><TableCell className="font-black uppercase text-[10px] text-muted-foreground w-1/2 pl-6 py-3">Engine Colour</TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-6 py-3">{selectedMotor['Engine Colour']}</TableCell></TableRow>}
                    </TableBody></Table></div></ScrollArea>
                </DialogContent>
            </Dialog>

            <Dialog open={showTrailerSpecs} onOpenChange={setShowTrailerSpecs}>
                <DialogContent className="sm:max-w-lg rounded-3xl border-4 shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 border-b bg-muted/5"><DialogTitle className="text-xl font-black uppercase tracking-tight italic text-primary">Trailer Specs</DialogTitle></DialogHeader>
                    <ScrollArea className="max-h-[60vh]">
                        <div className="p-6 space-y-4">
                            {model.trailerConfig?.imageUrl && (
                                <div className="relative aspect-video w-full bg-white rounded-2xl overflow-hidden border-2">
                                    <img src={model.trailerConfig.imageUrl} alt={model.trailerConfig?.name || 'Trailer'} className="w-full h-full object-contain p-4 mix-blend-multiply" />
                                </div>
                            )}
                            <Table><TableBody>
                                {model.trailerConfig?.name && <TableRow className="hover:bg-primary/5 border-b"><TableCell className="font-black uppercase text-[10px] text-muted-foreground w-1/2 pl-6 py-3">Name</TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-6 py-3">{model.trailerConfig.name}</TableCell></TableRow>}
                                {model.trailerConfig?.sellPriceExclGst != null && <TableRow className="hover:bg-primary/5 border-b"><TableCell className="font-black uppercase text-[10px] text-muted-foreground w-1/2 pl-6 py-3">Price (Excl. GST)</TableCell><TableCell className="font-black uppercase text-[10px] text-slate-900 pr-6 py-3">${model.trailerConfig.sellPriceExclGst.toLocaleString()}</TableCell></TableRow>}
                            </TableBody></Table>
                            {model.trailerConfig?.options?.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 px-2">Available Options</p>
                                    <Table><TableBody>
                                        {model.trailerConfig.options.map((opt: any) => (
                                            <TableRow key={opt.id} className="hover:bg-primary/5 border-b">
                                                <TableCell className="font-black uppercase text-[10px] text-slate-900 pl-6 py-3">{opt.name}</TableCell>
                                                <TableCell className="font-black uppercase text-[10px] text-primary pr-6 py-3 text-right">${(opt.sellPriceExclGst || 0).toLocaleString()}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody></Table>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            <FinalizeQuoteDialog
                isOpen={showFinalizeDialog}
                onOpenChange={setShowFinalizeDialog}
                quoteData={{
                    model,
                    vendor,
                    range,
                    module,
                    rangeId,
                    activeVariant,
                    selectedOptionsData,
                    customOptions,
                    selectedMotor,
                    selectedMotorAccessories,
                    selectedTrailerOptionsData,
                    customTrailerOptions,
                    selectedDealerFitData,
                    totalPrice,
                    isRegoSelected,
                    isStickerSelected,
                    isTenderToSelected,
                    isTrailerRegoSelected,
                    selectedTrailerId,
                    priceLevelUsed: priceLevel,
                    appliedPromotions,
                    promotionDiscount,
                    dealerServices: { extendedWarranty, servicePlan },
                    adminDetails: {
                        tradeIn: {
                            description: tradeInDescription,
                            value: tradeInValue ? parseFloat(tradeInValue) : 0,
                        },
                        insurance: {
                            requested: wantsInsurance,
                            notes: insuranceNotes,
                        },
                        finance: {
                            requested: wantsFinance,
                            notes: financeNotes,
                        },
                        timing: {
                            estimatedDeliveryDate: estimatedDeliveryDate || null,
                            notes: timingNotes,
                        },
                    },
                    sectionPdfs,
                }}
                organisationId={orgId || null}
                userProfile={userProfile}
                locations={module?.stockLocations || []}
                onStockCreated={() => {
                    setShowFinalizeDialog(false);
                    router.push(`/modules/${module?.id}?tab=stock`);
                }}
            />
        </div>
    );
}