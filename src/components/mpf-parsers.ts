/**
 * Master Price File – Excel Sheet Parsers
 * ========================================
 * Parses all 3 workbooks (Motor Module, Parts Module, Rigging Module) into
 * typed records ready for Firestore import.
 */
import * as XLSX from 'xlsx';

// ─── Shared Helpers ─────────────────────────────────────────────

export function safeFloat(val: any): number | null {
    if (val == null || val === '' || val === '.') return null;
    const cleaned = String(val).replace(/[$,%]/g, '').trim();
    if (cleaned === '' || cleaned === '.') return null;
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

export function safeStr(val: any): string {
    if (val == null) return '';
    const s = String(val).trim();
    return s === '.' ? '' : s;
}

function cellVal(ws: XLSX.WorkSheet, r: number, c: number): any {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr];
    return cell ? cell.v : undefined;
}

function wsRange(ws: XLSX.WorkSheet) {
    return XLSX.utils.decode_range(ws['!ref'] || 'A1');
}

// ─── Types ──────────────────────────────────────────────────────

export interface MotorRecord {
    id: string;
    modelFull: string;
    model: string;
    hpRating: string;
    shaftLength: string;
    cylinders: string;
    engineColour: string;
    imageLink: string;
    control: string;
    starting: string;
    tiltTrim: string;
    fuelTank: string;
    propType: string;
    salesInstall: string;
    supplier: string;
    retailPricing: Record<string, any>;
    sellPricing: Record<string, any>;
    tradePricing: Record<string, any>;
    commercialPricing: Record<string, any>;
    installation: Record<string, any>;
    riggingOptions: string[];
    propOptions: string[];
    additionalFactoryOptions: string[];
    [key: string]: any;
}

export interface RiggingKitRecord {
    id: string;
    description: string;
    partNumber: string;
    category: string; // 'tiller-conversion' | 'mechanical-rigging' | 'standard' | 'other'
    build: string;
    dealer: number | null;
    factory: number | null;
    kitCtd: number | null;
    kitMu: number | null;
    kitGp: number | null;
    kitSellPrice: number | null;
    tradePrice: number | null;
    subDealerPrice: number | null;
    labourHrs: number | null;
    labourCost: number | null;
    additionalParts: number | null;
    sundry: number | null;
    totalInstallCtd: number | null;
    installMu: number | null;
    installGp: number | null;
    installRetailSell: number | null;
    installTradeSell: number | null;
    installSubDealerSell: number | null;
    totalCtd: number | null;
    totalMu: number | null;
    totalGp: number | null;
    totalSellPrice: number | null;
    totalTradePrice: number | null;
    totalSubDealerPrice: number | null;
    partsBreakdown: { name: string; ctd: number | null }[];
    fuelFilter: string;
    cableLengths: string[];
}

export interface DealerFitRecord {
    id: string;
    description: string;
    code: string;
    ctd: number | null;
    inflation: number | null;
    adjCtd: number | null;
    totalPartsCTD: number | null;
    partsSell: number | null;
    totalLabourHrs: number | null;
    labourCtd: number | null;
    labourRetail: number | null;
    sundry: number | null;
    sublet: number | null;
    actualCtd: number | null;
    mu: number | null;
    gp: number | null;
    actualSell: number | null;
    accessories: {
        name: string;
        code: string;
        ctd: number | null;
        sell: number | null;
        labourDesc: string;
        labourHrs: number | null;
        sundry: number | null;
        sublet: number | null;
    }[];
}

export interface PartRecord {
    id: string;
    franchise: string;
    partNumber: string;
    description: string;
    stockOnHand: number | null;
    bin: string;
    dailyCost: number | null;
    markupPct: number | null;
    grossProfit: number | null;
    listPrice: number | null;
    retailIncGst: number | null;
}

export interface VendorPriceRecord {
    id: string;
    partNumber: string;
    description: string;
    cost: number | null;
    markupPct: number | null;
    grossProfit: number | null;
    listPrice: number | null;
    rrpIncGst: number | null;
    [key: string]: any;
}

export interface VendorPriceList {
    vendorName: string;
    effectiveDate: string;
    items: VendorPriceRecord[];
}

export interface RebateProgram {
    id: string;
    name: string;
    validUntil: string;
    rawText: string;
}

export interface CostConstants {
    labourRatePerHour: number | null;
    oil4StrokePerLitre: number | null;
    fuel95PremiumPerLitre: number | null;
}

export interface PartsMaintRecord {
    id: string;
    description: string;
    supplier: string;
    code: string;
    supplierDescription: string;
    paCode: string;
    mu: number | null;
    ctd: number | null;
    gp: number | null;
    sell: number | null;
    baseList: number | null;
    installType: string;
    ttf: number | null;
    labourCost: number | null;
    partsCtd: number | null;
    sundryCtd: number | null;
    totalCtd: number | null;
    sellIncInstall: number | null;
    sellExcInstall: number | null;
}

export interface ImportResult {
    motors: MotorRecord[];
    riggingKits: RiggingKitRecord[];
    dealerFitOptions: DealerFitRecord[];
    partsInventory: PartRecord[];
    vendorPriceLists: VendorPriceList[];
    rebatePrograms: RebateProgram[];
    costConstants: CostConstants;
    partsMaintenance: PartsMaintRecord[];
}

// ─── Motor Library Parser ───────────────────────────────────────

export function parseMotorLibrary(ws: XLSX.WorkSheet): MotorRecord[] {
    const range = wsRange(ws);
    const motors: MotorRecord[] = [];
    const headerRow = 3;

    const riggingCols: number[] = [];
    const propCols: number[] = [];
    const additionalFoCols: number[] = [];

    for (let c = 0; c <= range.e.c; c++) {
        const h = safeStr(cellVal(ws, headerRow, c));
        if (h.startsWith('Rigging Option')) riggingCols.push(c);
        else if (h.startsWith('Prop Option')) propCols.push(c);
        else if (h.startsWith('Additional FO')) additionalFoCols.push(c);
    }

    for (let r = 4; r <= range.e.r; r++) {
        const modelFull = safeStr(cellVal(ws, r, 0));
        if (!modelFull || !modelFull.startsWith('Yamaha - ')) continue;

        const col = (c: number) => cellVal(ws, r, c);

        const motor: MotorRecord = {
            id: '',
            modelFull,
            model: safeStr(col(1)),
            hpRating: safeStr(col(2)),
            shaftLength: safeStr(col(3)),
            cylinders: safeStr(col(4)),
            engineColour: safeStr(col(5)),
            imageLink: safeStr(col(6)),
            control: safeStr(col(7)),
            starting: safeStr(col(8)),
            tiltTrim: safeStr(col(9)),
            fuelTank: safeStr(col(11)),
            propType: safeStr(col(12)),
            salesInstall: safeStr(col(13)),
            supplier: safeStr(col(14)),
            retailPricing: {
                dealerListPrice: safeFloat(col(15)),
                holdback: safeFloat(col(16)),
                storePrice: safeFloat(col(17)),
                digs: safeFloat(col(18)),
                dealerBuy: safeFloat(col(19)),
                freightExcGst: safeFloat(col(20)),
                landedCtd: safeFloat(col(21)),
                rebateProgram: safeStr(col(22)),
                rebateDiscount: safeFloat(col(23)),
                nettCtd: safeFloat(col(24)),
            },
            sellPricing: {
                rrpFreightIncGst: safeFloat(col(51)),
                nsmRetail: safeFloat(col(52)),
                factoryRebate: safeFloat(col(53)),
                dealerDiscount: safeFloat(col(54)),
                sellPrice: safeFloat(col(55)),
            },
            tradePricing: {
                tradeMu: safeFloat(col(57)),
                tradeGp: safeFloat(col(58)),
                tradeFactoryRebate: safeFloat(col(59)),
                tradeDiscount: safeFloat(col(60)),
                tradePrice: safeFloat(col(61)),
            },
            commercialPricing: {
                commercial: safeFloat(col(64)),
                commercialGp: safeFloat(col(65)),
                commercialRebate: safeFloat(col(66)),
                commercialDiscount: safeFloat(col(67)),
                commercialPrice: safeFloat(col(68)),
            },
            installation: {
                opCode: safeStr(col(85)),
                ttf: safeFloat(col(86)),
                labour: safeFloat(col(87)),
                sundry1: safeFloat(col(88)),
                sundry2: safeFloat(col(89)),
                sundry3: safeFloat(col(90)),
                sublet: safeFloat(col(91)),
                installCtd: safeFloat(col(92)),
                installSell: safeFloat(col(93)),
            },
            riggingOptions: [],
            propOptions: [],
            additionalFactoryOptions: [],
        };

        for (const ri of riggingCols) {
            const val = safeStr(cellVal(ws, r, ri));
            if (val && val !== '.') motor.riggingOptions.push(val);
        }
        for (const pi of propCols) {
            const val = safeStr(cellVal(ws, r, pi));
            if (val && val !== '.') motor.propOptions.push(val);
        }
        for (const fi of additionalFoCols) {
            const val = safeStr(cellVal(ws, r, fi));
            if (val && val !== '0' && val !== '.') motor.additionalFactoryOptions.push(val);
        }

        motors.push(motor);
    }

    return motors;
}

// ─── Rigging Kits Parser ────────────────────────────────────────

export function parseRiggingKits(ws: XLSX.WorkSheet): RiggingKitRecord[] {
    const range = wsRange(ws);
    const kits: RiggingKitRecord[] = [];
    let currentCategory = 'other';

    for (let r = 3; r <= range.e.r; r++) {
        const desc = safeStr(cellVal(ws, r, 2));
        if (!desc) continue;

        // Detect category headers
        const kitCtdRaw = safeStr(cellVal(ws, r, 7));
        if (kitCtdRaw === 'CTD') {
            // Section header row
            if (desc.toUpperCase().includes('TILLER')) currentCategory = 'tiller-conversion';
            else if (desc.toUpperCase().includes('MECHANICAL')) currentCategory = 'mechanical-rigging';
            else currentCategory = 'other';
            continue;
        }

        // Detect inline category changes
        if (desc.toUpperCase().includes('TILLER CONVERSION')) currentCategory = 'tiller-conversion';
        else if (desc.toUpperCase().includes('MECHANICAL RIGGING')) currentCategory = 'mechanical-rigging';
        else if (desc.startsWith('NR -') || desc.startsWith('SUP -') || desc.startsWith('NB:') || desc.startsWith('HAINES') || desc.startsWith('Tiller Handle Standard')) currentCategory = 'standard';

        const col = (c: number) => cellVal(ws, r, c);

        // Parts breakdown (cols 32-39, paired)
        const parts: { name: string; ctd: number | null }[] = [];
        for (let pc = 32; pc <= 39; pc += 2) {
            const pName = safeStr(col(pc));
            const pCtd = safeFloat(col(pc + 1));
            if (pName) parts.push({ name: pName, ctd: pCtd });
        }

        // Cable lengths (cols 45-54)
        const cables: string[] = [];
        for (let cc = 45; cc <= 54; cc++) {
            const cv = safeStr(col(cc));
            if (cv) cables.push(cv);
        }

        const slug = (safeStr(col(3)) || desc)
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

        kits.push({
            id: slug,
            description: desc,
            partNumber: safeStr(col(3)),
            category: currentCategory,
            build: safeStr(col(4)),
            dealer: safeFloat(col(5)),
            factory: safeFloat(col(6)),
            kitCtd: safeFloat(col(7)),
            kitMu: safeFloat(col(8)),
            kitGp: safeFloat(col(9)),
            kitSellPrice: safeFloat(col(10)),
            tradePrice: safeFloat(col(11)),
            subDealerPrice: safeFloat(col(12)),
            labourHrs: safeFloat(col(14)),
            labourCost: safeFloat(col(15)),
            additionalParts: safeFloat(col(16)),
            sundry: safeFloat(col(17)),
            totalInstallCtd: safeFloat(col(18)),
            installMu: safeFloat(col(19)),
            installGp: safeFloat(col(20)),
            installRetailSell: safeFloat(col(21)),
            installTradeSell: safeFloat(col(22)),
            installSubDealerSell: safeFloat(col(23)),
            totalCtd: safeFloat(col(25)),
            totalMu: safeFloat(col(26)),
            totalGp: safeFloat(col(27)),
            totalSellPrice: safeFloat(col(28)),
            totalTradePrice: safeFloat(col(29)),
            totalSubDealerPrice: safeFloat(col(30)),
            partsBreakdown: parts,
            fuelFilter: safeStr(col(41)),
            cableLengths: cables,
        });
    }

    return kits;
}

// ─── Dealer Fit Options Parser ──────────────────────────────────

export function parseDealerFitModule(ws: XLSX.WorkSheet): DealerFitRecord[] {
    const range = wsRange(ws);
    const options: DealerFitRecord[] = [];

    // Data rows start at row 12 (0-indexed 11)
    for (let r = 11; r <= range.e.r; r++) {
        const desc = safeStr(cellVal(ws, r, 2));
        if (!desc) continue;

        const col = (c: number) => cellVal(ws, r, c);

        // Parse accessories - groups of 8 cols starting at col 19, with gap cols
        // Accessory 1: 19-26, Accessory 2: 28-35, Accessory 3: 37-44, etc.
        const accessories: DealerFitRecord['accessories'] = [];
        for (let accIdx = 0; accIdx < 30; accIdx++) {
            const baseCol = 19 + (accIdx * 9); // each group is 8 data + 1 gap
            if (baseCol > range.e.c) break;

            const accName = safeStr(col(baseCol));
            if (!accName) continue;

            accessories.push({
                name: accName,
                code: safeStr(col(baseCol + 1)),
                ctd: safeFloat(col(baseCol + 2)),
                sell: safeFloat(col(baseCol + 3)),
                labourDesc: safeStr(col(baseCol + 4)),
                labourHrs: safeFloat(col(baseCol + 5)),
                sundry: safeFloat(col(baseCol + 6)),
                sublet: safeFloat(col(baseCol + 7)),
            });
        }

        const code = safeStr(col(3));
        const slug = (code || desc)
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

        options.push({
            id: slug,
            description: desc,
            code,
            ctd: safeFloat(col(4)),
            inflation: safeFloat(col(5)),
            adjCtd: safeFloat(col(6)),
            totalPartsCTD: safeFloat(col(7)),
            partsSell: safeFloat(col(8)),
            totalLabourHrs: safeFloat(col(9)),
            labourCtd: safeFloat(col(10)),
            labourRetail: safeFloat(col(11)),
            sundry: safeFloat(col(12)),
            sublet: safeFloat(col(13)),
            actualCtd: safeFloat(col(14)),
            mu: safeFloat(col(15)),
            gp: safeFloat(col(16)),
            actualSell: safeFloat(col(17)),
            accessories,
        });
    }

    return options;
}

// ─── Parts Inventory Parser ─────────────────────────────────────

export function parsePartsInventory(ws: XLSX.WorkSheet): PartRecord[] {
    const range = wsRange(ws);
    const parts: PartRecord[] = [];

    // Data starts at row 3 (0-indexed 2)
    for (let r = 2; r <= range.e.r; r++) {
        const franchise = safeStr(cellVal(ws, r, 2));
        const partNum = safeStr(cellVal(ws, r, 3));
        if (!franchise && !partNum) continue;

        const col = (c: number) => cellVal(ws, r, c);
        const slug = `${franchise}-${partNum}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');

        parts.push({
            id: slug,
            franchise,
            partNumber: partNum,
            description: safeStr(col(4)),
            stockOnHand: safeFloat(col(5)),
            bin: safeStr(col(6)),
            dailyCost: safeFloat(col(7)),
            markupPct: safeFloat(col(8)),
            grossProfit: safeFloat(col(9)),
            listPrice: safeFloat(col(10)),
            retailIncGst: safeFloat(col(11)),
        });
    }

    return parts;
}

// ─── Vendor Price List Parser (Generic) ─────────────────────────

interface VendorConfig {
    sheetName: string;
    vendorName: string;
}

const VENDOR_CONFIGS: Record<string, VendorConfig> = {
    'BLA Price List': { sheetName: 'BLA Price List', vendorName: 'BLA' },
    'BLA - 27.03.2026': { sheetName: 'BLA - 27.03.2026', vendorName: 'BLA (Mar 2026)' },
    'Garmin Price List': { sheetName: 'Garmin Price List', vendorName: 'Garmin' },
    'Lowrance Price List': { sheetName: 'Lowrance Price List', vendorName: 'Lowrance' },
    'SAW Price List': { sheetName: 'SAW Price List', vendorName: 'SAW (Sam Allen)' },
    'Camec Price List': { sheetName: 'Camec Price List', vendorName: 'Camec' },
    'Frank Marine Price List': { sheetName: 'Frank Marine Price List', vendorName: 'Frank Marine' },
    'GME Marine Price List': { sheetName: 'GME Marine Price List', vendorName: 'GME Marine' },
    'Hella Price List': { sheetName: 'Hella Price List', vendorName: 'Hella' },
    'Minn Kota Price List': { sheetName: 'Minn Kota Price List', vendorName: 'Minn Kota' },
    'Oceansouth Price List': { sheetName: 'Oceansouth Price List', vendorName: 'Oceansouth' },
    'RWB Marine Price List': { sheetName: 'RWB Marine Price List', vendorName: 'RWB Marine' },
    'Simrad Price List': { sheetName: 'Simrad Price List', vendorName: 'Simrad' },
    'Viking Price List': { sheetName: 'Viking Price List', vendorName: 'Viking' },
};

export function parseVendorPriceList(ws: XLSX.WorkSheet, vendorName: string): VendorPriceList {
    const range = wsRange(ws);
    const items: VendorPriceRecord[] = [];
    let effectiveDate = '';

    // Auto-detect: find the header row (first row with 3+ non-empty cells in cols 2-11)
    let headerRow = -1;
    const headers: string[] = [];

    for (let r = 0; r <= Math.min(10, range.e.r); r++) {
        let nonEmpty = 0;
        for (let c = 2; c <= Math.min(15, range.e.c); c++) {
            const v = safeStr(cellVal(ws, r, c));
            if (v) nonEmpty++;
        }
        // Check for effective date in early rows
        for (let c = 0; c <= Math.min(10, range.e.c); c++) {
            const v = safeStr(cellVal(ws, r, c)).toLowerCase();
            if (v.includes('as at') || v.includes('effective') || v.includes('price catalogue')) {
                effectiveDate = safeStr(cellVal(ws, r, c));
            }
        }
        if (nonEmpty >= 3 && headerRow === -1) {
            headerRow = r;
            for (let c = 0; c <= range.e.c; c++) {
                headers.push(safeStr(cellVal(ws, r, c)).toLowerCase());
            }
        }
    }

    if (headerRow === -1) return { vendorName, effectiveDate, items: [] };

    // Map common header names to our fields
    const findCol = (patterns: string[]): number => {
        for (const p of patterns) {
            const idx = headers.findIndex(h => h.includes(p));
            if (idx >= 0) return idx;
        }
        return -1;
    };

    const partCol = findCol(['part number', 'part', 'code', 'item code', 'sku']);
    const descCol = findCol(['description', 'desc', 'item', 'title', 'product']);
    const costCol = findCol(['dealer net', 'trade', 'cost', 'nett', 'daily', 'buy']);
    const muCol = findCol(['mu', 'gm', 'markup']);
    const gpCol = findCol(['gp', 'gross profit']);
    const listCol = findCol(['list', 'base list', 'rrp']);
    const rrpCol = findCol(['rrp (inc', 'retail', 'sell', 'rrp inc']);

    // Parse data rows
    for (let r = headerRow + 1; r <= range.e.r; r++) {
        const pn = partCol >= 0 ? safeStr(cellVal(ws, r, partCol)) : '';
        const desc = descCol >= 0 ? safeStr(cellVal(ws, r, descCol)) : '';
        if (!pn && !desc) continue;
        // Skip sub-header rows
        if (desc && !pn && safeFloat(cellVal(ws, r, costCol >= 0 ? costCol : 5)) === null) continue;

        const slug = (pn || desc).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').substring(0, 80);

        items.push({
            id: slug || `row-${r}`,
            partNumber: pn,
            description: desc,
            cost: costCol >= 0 ? safeFloat(cellVal(ws, r, costCol)) : null,
            markupPct: muCol >= 0 ? safeFloat(cellVal(ws, r, muCol)) : null,
            grossProfit: gpCol >= 0 ? safeFloat(cellVal(ws, r, gpCol)) : null,
            listPrice: listCol >= 0 ? safeFloat(cellVal(ws, r, listCol)) : null,
            rrpIncGst: rrpCol >= 0 ? safeFloat(cellVal(ws, r, rrpCol)) : null,
        });
    }

    return { vendorName, effectiveDate, items };
}

// ─── Rebate Programs Parser ─────────────────────────────────────

export function parseRebatePrograms(ws: XLSX.WorkSheet): RebateProgram[] {
    const range = wsRange(ws);
    const programs: RebateProgram[] = [];

    for (let r = 0; r <= range.e.r; r++) {
        const text = safeStr(cellVal(ws, r, 2));
        if (!text) continue;

        // Extract validity date from text like "Valid till 25.05.2025"
        const dateMatch = text.match(/[Vv]alid\s+till?\s+(\d{1,2}[\./]\d{1,2}[\./]\d{2,4})/);
        const validUntil = dateMatch ? dateMatch[1] : '';

        const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 60);

        programs.push({
            id: slug,
            name: text.replace(/\s*-\s*Valid.*$/, '').trim(),
            validUntil,
            rawText: text,
        });
    }

    return programs;
}

// ─── Cost Constants Parser ──────────────────────────────────────

export function parseCostConstants(ws: XLSX.WorkSheet): CostConstants {
    return {
        labourRatePerHour: safeFloat(cellVal(ws, 1, 3)),
        oil4StrokePerLitre: safeFloat(cellVal(ws, 2, 3)),
        fuel95PremiumPerLitre: safeFloat(cellVal(ws, 3, 3)),
    };
}

// ─── Parts Maintenance Parser ───────────────────────────────────

export function parsePartsMaintenance(ws: XLSX.WorkSheet): PartsMaintRecord[] {
    const range = wsRange(ws);
    const records: PartsMaintRecord[] = [];

    // Find header row
    let headerRow = -1;
    const headers: string[] = [];
    for (let r = 0; r <= Math.min(10, range.e.r); r++) {
        let nonEmpty = 0;
        for (let c = 0; c <= Math.min(20, range.e.c); c++) {
            if (safeStr(cellVal(ws, r, c))) nonEmpty++;
        }
        if (nonEmpty >= 5) {
            headerRow = r;
            for (let c = 0; c <= range.e.c; c++) {
                headers.push(safeStr(cellVal(ws, r, c)).toLowerCase());
            }
            break;
        }
    }

    if (headerRow === -1) return [];

    const findCol = (patterns: string[]): number => {
        for (const p of patterns) {
            const idx = headers.findIndex(h => h.includes(p));
            if (idx >= 0) return idx;
        }
        return -1;
    };

    const descCol = findCol(['description', 'parts & accessories']);
    const supplierCol = findCol(['supplier']);
    const codeCol = findCol(['code']);
    const muCol = findCol(['mu']);
    const ctdCol = findCol(['ctd']);
    const gpCol = findCol(['gp']);
    const sellCol = findCol(['sell']);
    const installCol = findCol(['install type']);
    const ttfCol = findCol(['ttf']);

    for (let r = headerRow + 1; r <= range.e.r; r++) {
        const desc = descCol >= 0 ? safeStr(cellVal(ws, r, descCol)) : safeStr(cellVal(ws, r, 2));
        if (!desc) continue;

        const col = (c: number) => cellVal(ws, r, c);
        const slug = desc.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 60);

        records.push({
            id: slug || `maint-${r}`,
            description: desc,
            supplier: supplierCol >= 0 ? safeStr(col(supplierCol)) : '',
            code: codeCol >= 0 ? safeStr(col(codeCol)) : '',
            supplierDescription: '',
            paCode: '',
            mu: muCol >= 0 ? safeFloat(col(muCol)) : null,
            ctd: ctdCol >= 0 ? safeFloat(col(ctdCol)) : null,
            gp: gpCol >= 0 ? safeFloat(col(gpCol)) : null,
            sell: sellCol >= 0 ? safeFloat(col(sellCol)) : null,
            baseList: null,
            installType: installCol >= 0 ? safeStr(col(installCol)) : '',
            ttf: ttfCol >= 0 ? safeFloat(col(ttfCol)) : null,
            labourCost: null,
            partsCtd: null,
            sundryCtd: null,
            totalCtd: null,
            sellIncInstall: null,
            sellExcInstall: null,
        });
    }

    return records;
}

// ─── Master Parse All ───────────────────────────────────────────

export function parseAllWorkbooks(workbooks: { name: string; workbook: XLSX.WorkBook }[]): ImportResult {
    const result: ImportResult = {
        motors: [],
        riggingKits: [],
        dealerFitOptions: [],
        partsInventory: [],
        vendorPriceLists: [],
        rebatePrograms: [],
        costConstants: { labourRatePerHour: null, oil4StrokePerLitre: null, fuel95PremiumPerLitre: null },
        partsMaintenance: [],
    };

    for (const { workbook } of workbooks) {
        for (const sheetName of workbook.SheetNames) {
            const ws = workbook.Sheets[sheetName];
            const nameLower = sheetName.toLowerCase();

            if (nameLower.includes('motor library') || nameLower.includes('motor_library')) {
                result.motors = parseMotorLibrary(ws);
            } else if (nameLower.includes('rigging kit') || nameLower.includes('rigging_kit')) {
                result.riggingKits = parseRiggingKits(ws);
            } else if (nameLower.includes('dealer fit') || nameLower.includes('dealer_fit')) {
                result.dealerFitOptions = parseDealerFitModule(ws);
            } else if (nameLower.includes('parts data drop') || nameLower.includes('parts_data_drop')) {
                result.partsInventory = parsePartsInventory(ws);
            } else if (nameLower.includes('rebate') || nameLower.includes('rebate_program')) {
                result.rebatePrograms = parseRebatePrograms(ws);
            } else if (nameLower === 'data drop' || nameLower === 'data_drop') {
                result.costConstants = parseCostConstants(ws);
            } else if (nameLower.includes('parts maintenance') || nameLower.includes('parts_maintenance')) {
                result.partsMaintenance = parsePartsMaintenance(ws);
            } else if (nameLower.includes('price list') || nameLower.includes('price_list')) {
                // Vendor price list - extract vendor name from sheet name
                const vendorName = sheetName
                    .replace(/price list/i, '')
                    .replace(/price_list/i, '')
                    .replace(/_/g, ' ')
                    .trim() || sheetName;
                const vpl = parseVendorPriceList(ws, vendorName);
                if (vpl.items.length > 0) {
                    result.vendorPriceLists.push(vpl);
                }
            }
            // Dropdowns and Yamaha_Dealer_Current are informational/config - skip for now
        }
    }

    return result;
}

export { VENDOR_CONFIGS };
