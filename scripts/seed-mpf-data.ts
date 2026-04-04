/**
 * Seed Master Price File data from extracted text files into Firestore.
 *
 * Run from the project root:
 *   npx ts-node --project tsconfig.json scripts/seed-mpf-data.ts
 *
 * Or if ts-node has issues:
 *   npx tsx scripts/seed-mpf-data.ts
 *
 * Prerequisites:
 *   - Run extract_xlsx.py first to generate the .txt files in data-import/extracted/
 *   - The Master Price File vendor must exist in Firestore (create via Add Module page
 *     with type "master-price-file" and select the Master Price File vendor)
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs, query, where, writeBatch, deleteDoc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const firebaseConfig = {
    apiKey: "AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY",
    authDomain: "studio-2290360004-3b963.firebaseapp.com",
    projectId: "studio-2290360004-3b963",
    storageBucket: "studio-2290360004-3b963.firebasestorage.app",
    messagingSenderId: "908992306421",
    appId: "1:908992306421:web:34a5f3aba4ddac8ad2c6e0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const EXTRACTED_DIR = path.join(__dirname, '..', 'data-import', 'extracted');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTSV(filePath: string, headerRow = 0): Record<string, string>[] {
    if (!fs.existsSync(filePath)) {
        console.log(`  SKIP (not found): ${filePath}`);
        return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length <= headerRow + 1) return [];

    const headers = lines[headerRow].split('\t').map(h => h.trim()).filter(Boolean);
    const rows: Record<string, string>[] = [];

    for (let i = headerRow + 1; i < lines.length; i++) {
        const values = lines[i].split('\t');
        const row: Record<string, string> = {};
        let hasData = false;
        headers.forEach((h, idx) => {
            const val = (values[idx] || '').trim();
            if (val) {
                row[h] = val;
                hasData = true;
            }
        });
        if (hasData) rows.push(row);
    }
    return rows;
}

async function clearDataSet(vendorId: string, dataSetName: string) {
    const snap = await getDocs(collection(db, `data-warehouse/${vendorId}/dataSets/${dataSetName}/rows`));
    if (snap.size === 0) return;

    console.log(`  Clearing ${snap.size} existing rows from ${dataSetName}...`);
    // Delete in batches of 500
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 500) {
        const batch = writeBatch(db);
        docs.slice(i, i + 500).forEach(d => batch.delete(d.ref));
        await batch.commit();
    }
}

async function writeRows(vendorId: string, dataSetName: string, displayName: string, rows: Record<string, string>[]) {
    if (rows.length === 0) {
        console.log(`  SKIP ${displayName}: no rows`);
        return;
    }

    console.log(`  Writing ${displayName}: ${rows.length} rows...`);

    // Create/update dataset doc
    await setDoc(doc(db, `data-warehouse/${vendorId}/dataSets`, dataSetName), {
        name: displayName,
        rowCount: rows.length,
        createdAt: new Date(),
    });

    // Clear existing
    await clearDataSet(vendorId, dataSetName);

    // Write in batches of 500
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const batch = writeBatch(db);
        for (const row of chunk) {
            const ref = doc(collection(db, `data-warehouse/${vendorId}/dataSets/${dataSetName}/rows`));
            batch.set(ref, row);
        }
        await batch.commit();
        written += chunk.length;
        if (written % 1000 === 0) console.log(`    ...${written} written`);
    }
    console.log(`  ✓ ${displayName}: ${written} rows written`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
    console.log('=== Master Price File Data Seeder ===\n');

    // 1. Find the Master Price File vendor
    const vendorsSnap = await getDocs(collection(db, 'data-warehouse'));
    const mpfVendor = vendorsSnap.docs.find(d => {
        const data = d.data();
        return data.slug === 'master-price-file' || data.name === 'Master Price File';
    });

    if (!mpfVendor) {
        console.error('ERROR: Master Price File vendor not found in data-warehouse!');
        console.error('Create it first via Admin > Modules > Add New Module > Master Price File type');
        process.exit(1);
    }

    const vendorId = mpfVendor.id;
    console.log(`Found vendor: ${mpfVendor.data().name} (${vendorId})\n`);

    // 2. Dealer Fit Packages
    console.log('--- Dealer Fit Packages ---');
    const packages = parseTSV(path.join(EXTRACTED_DIR, 'Dealer_Fit_Module__Packages.txt'), 0);
    await writeRows(vendorId, 'dealer-fit-packages', 'Dealer Fit Packages', packages);

    // 3. Dealer Fit Components
    console.log('\n--- Dealer Fit Components ---');
    const components = parseTSV(path.join(EXTRACTED_DIR, 'Dealer_Fit_Module__Components.txt'), 0);
    await writeRows(vendorId, 'dealer-fit-components', 'Dealer Fit Components', components);

    // 4. Supplier Price Lists
    const supplierFiles = [
        { file: 'Parts_Module_(2)__BLA_Price_List.txt', name: 'bla-price-list', display: 'BLA Price List', headerRow: 9 },
        { file: 'Parts_Module_(2)__Garmin_Price_List.txt', name: 'garmin-price-list', display: 'Garmin Price List', headerRow: 4 },
        { file: 'Parts_Module_(2)__GME_Marine_Price_List.txt', name: 'gme-price-list', display: 'GME Marine Price List', headerRow: 4 },
        { file: 'Parts_Module_(2)__Hella_Price_List.txt', name: 'hella-price-list', display: 'Hella Price List', headerRow: 4 },
        { file: 'Parts_Module_(2)__Lowrance_Price_List.txt', name: 'lowrance-price-list', display: 'Lowrance Price List', headerRow: 4 },
        { file: 'Parts_Module_(2)__Minn_Kota_Price_List.txt', name: 'minn-kota-price-list', display: 'Minn Kota Price List', headerRow: 4 },
        { file: 'Parts_Module_(2)__Oceansouth_Price_List.txt', name: 'oceansouth-price-list', display: 'Oceansouth Price List', headerRow: 4 },
        { file: 'Parts_Module_(2)__Simrad_Price_List.txt', name: 'simrad-price-list', display: 'Simrad Price List', headerRow: 4 },
        { file: 'Parts_Module_(2)__Frank_Marine_Price_List.txt', name: 'frank-marine-price-list', display: 'Frank Marine Price List', headerRow: 4 },
        { file: 'Parts_Module_(2)__Camec_Price_List.txt', name: 'camec-price-list', display: 'Camec Price List', headerRow: 4 },
        { file: 'Parts_Module_(2)__RWB_Marine_Price_List.txt', name: 'rwb-marine-price-list', display: 'RWB Marine Price List', headerRow: 4 },
        { file: 'Parts_Module_(2)__SAW_Price_List.txt', name: 'saw-price-list', display: 'SAW Price List', headerRow: 4 },
        { file: 'Parts_Module_(2)__Viking_Price_List.txt', name: 'viking-price-list', display: 'Viking Price List', headerRow: 4 },
    ];

    for (const supplier of supplierFiles) {
        console.log(`\n--- ${supplier.display} ---`);
        const rows = parseTSV(path.join(EXTRACTED_DIR, supplier.file), supplier.headerRow);
        await writeRows(vendorId, supplier.name, supplier.display, rows);
    }

    // 5. Parts Data Drop (inventory)
    console.log('\n--- Parts Inventory (Data Drop) ---');
    const inventory = parseTSV(path.join(EXTRACTED_DIR, 'Parts_Module_(2)__Parts_Data_Drop.txt'), 0);
    await writeRows(vendorId, 'parts-inventory', 'Parts Inventory', inventory);

    // 6. Dealer Fit Module (from Parts Module — wide format with accessories inline)
    console.log('\n--- Dealer Fit Module (Parts) ---');
    const dealerFitParts = parseTSV(path.join(EXTRACTED_DIR, 'Parts_Module_(2)__Dealer_Fit_Module.txt'), 10);
    await writeRows(vendorId, 'dealer-fit-module', 'Dealer Fit Module', dealerFitParts);

    console.log('\n=== Done! All data seeded successfully. ===');
    process.exit(0);
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
