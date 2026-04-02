/**
 * Seed Script: Placeholder Modules & Master Price File Vendor
 * ============================================================
 * Creates:
 *   1. "Master Price File" vendor in data-warehouse collection
 *   2. "Used Boats" module in modules collection
 *   3. "Website Listings" module in modules collection
 *   4. Assigns both modules to Northside Marine organisation
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/seed-placeholder-modules.ts
 */

import { initializeApp } from 'firebase/app';
import {
    getFirestore,
    doc,
    setDoc,
    addDoc,
    collection,
    updateDoc,
    arrayUnion,
    serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
    projectId: 'studio-2290360004-3b963',
    appId: '1:611154837797:web:ad53f3118b9dfa4770dacc',
    apiKey: 'AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY',
    authDomain: 'studio-2290360004-3b963.firebaseapp.com',
    storageBucket: 'studio-2290360004-3b963.firebasestorage.app',
};

const NORTHSIDE_MARINE_ORG_ID = 'AcFZVEFA5UDJG2hyetWT';

async function main() {
    console.log('Initializing Firebase...');
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    // 1. Create the Master Price File vendor
    console.log('\n1. Creating "Master Price File" vendor in data-warehouse...');
    const vendorRef = doc(db, 'data-warehouse', 'master-price-file');
    await setDoc(vendorRef, {
        name: 'Master Price File',
        slug: 'master-price-file',
        vendorType: 'Internal',
        currency: 'AUD',
        description: 'Internal master price file for all products and pricing',
        createdAt: serverTimestamp(),
    }, { merge: true });
    console.log('   Created vendor: data-warehouse/master-price-file');

    // 2. Create "Used Boats" module
    console.log('\n2. Creating "Used Boats" module...');
    const usedBoatsRef = await addDoc(collection(db, 'modules'), {
        name: 'Used Boats',
        slug: 'used-boats',
        mainVendorId: null,
        moduleType: 'used-boats',
        description: 'Pre-owned vessel listings and management',
        stockLocations: [],
        stockVisibleToSubDealers: false,
        createdAt: serverTimestamp(),
    });
    console.log(`   Created module: modules/${usedBoatsRef.id}`);

    // 3. Create "Website Listings" module
    console.log('\n3. Creating "Website Listings" module...');
    const websiteListingsRef = await addDoc(collection(db, 'modules'), {
        name: 'Website Listings',
        slug: 'website-listings',
        mainVendorId: null,
        moduleType: 'website-listings',
        description: 'Manage listings for website publication',
        stockLocations: [],
        stockVisibleToSubDealers: false,
        createdAt: serverTimestamp(),
    });
    console.log(`   Created module: modules/${websiteListingsRef.id}`);

    // 4. Assign both modules to Northside Marine
    console.log(`\n4. Assigning modules to Northside Marine (${NORTHSIDE_MARINE_ORG_ID})...`);
    const orgRef = doc(db, 'organisations', NORTHSIDE_MARINE_ORG_ID);
    await updateDoc(orgRef, {
        enabledModuleSubscriptions: arrayUnion(usedBoatsRef.id, websiteListingsRef.id),
    });
    console.log('   Added Used Boats and Website Listings to enabledModuleSubscriptions');

    console.log('\n--- Seed complete! ---');
    console.log('\nSummary:');
    console.log(`  Vendor:  data-warehouse/master-price-file`);
    console.log(`  Module:  modules/${usedBoatsRef.id} (Used Boats)`);
    console.log(`  Module:  modules/${websiteListingsRef.id} (Website Listings)`);
    console.log(`  Org:     organisations/${NORTHSIDE_MARINE_ORG_ID} (Northside Marine) — modules assigned`);

    process.exit(0);
}

main().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
