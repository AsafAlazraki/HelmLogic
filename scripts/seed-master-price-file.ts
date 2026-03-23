/**
 * Seed Script: Master Price File Vendor
 * ======================================
 * Creates the "Master Price File" vendor in the data-warehouse collection
 * and associates it with the northsidemarine organisation.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/seed-master-price-file.ts
 *
 * Or run from the browser console / a Next.js API route.
 *
 * This script is idempotent - running it multiple times will update rather than duplicate.
 */

import { initializeApp } from 'firebase/app';
import {
    getFirestore,
    doc,
    setDoc,
    collection,
    getDocs,
    query,
    where,
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

const VENDOR_ID = 'master-price-file';

async function main() {
    console.log('Initializing Firebase...');
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    // 1. Create the Master Price File vendor
    console.log('\n1. Creating Master Price File vendor...');
    const vendorRef = doc(db, 'data-warehouse', VENDOR_ID);
    await setDoc(vendorRef, {
        name: 'Master Price File',
        slug: 'master-price-file',
        vendorType: 'Master Price File',
        dataSource: 'Document Upload',
        currency: 'AUD',
        address: '',
        abn: '',
        primaryContact: '',
        website: '',
        notes: 'Master price file containing motors, rigging, props, and dealer fit options. Source of truth for organisation pricing.',
        logoUrl: null,
        createdAt: serverTimestamp(),
    }, { merge: true });
    console.log('   Vendor created/updated: data-warehouse/master-price-file');

    // 2. Find the northsidemarine organisation
    console.log('\n2. Looking for northsidemarine organisation...');
    const orgsRef = collection(db, 'organisations');
    const orgsSnapshot = await getDocs(orgsRef);

    let northsideOrgId: string | null = null;
    orgsSnapshot.forEach((orgDoc) => {
        const data = orgDoc.data();
        const name = (data.name || '').toLowerCase();
        const slug = (data.slug || '').toLowerCase();
        if (name.includes('northside') || slug.includes('northside')) {
            northsideOrgId = orgDoc.id;
            console.log(`   Found: ${data.name} (ID: ${orgDoc.id})`);
        }
    });

    if (!northsideOrgId) {
        console.log('   Northside Marine organisation not found.');
        console.log('   Listing all organisations:');
        orgsSnapshot.forEach((orgDoc) => {
            const data = orgDoc.data();
            console.log(`     - ${data.name || 'Unnamed'} (ID: ${orgDoc.id}, slug: ${data.slug || 'none'})`);
        });
        console.log('\n   You can manually associate the vendor by adding the vendor ID');
        console.log('   to the organisation\'s dataWarehouseSubscriptions array.');
    } else {
        // 3. Associate vendor with organisation
        console.log('\n3. Associating vendor with northsidemarine organisation...');
        const orgRef = doc(db, 'organisations', northsideOrgId);
        await updateDoc(orgRef, {
            dataWarehouseSubscriptions: arrayUnion(VENDOR_ID),
        });
        console.log('   Added Master Price File to dataWarehouseSubscriptions');
    }

    // 4. Check for existing modules and suggest association
    console.log('\n4. Checking existing modules...');
    const modulesRef = collection(db, 'modules');
    const modulesSnapshot = await getDocs(modulesRef);

    if (modulesSnapshot.empty) {
        console.log('   No modules found.');
    } else {
        console.log('   Existing modules:');
        modulesSnapshot.forEach((modDoc) => {
            const data = modDoc.data();
            console.log(`     - ${data.name} (ID: ${modDoc.id}, mainVendor: ${data.mainVendorId})`);
        });
        console.log('\n   To use Master Price File as a module\'s main vendor or associate it,');
        console.log('   update the module\'s mainVendorId or associatedVendorIds in the admin UI.');
    }

    console.log('\n✓ Seed complete!');
    console.log('\nNext steps:');
    console.log('  1. Go to Data Warehouse > Master Price File');
    console.log('  2. Upload the Motor Module .xlsx to import motors');
    console.log('  3. Create or update a Module to use Master Price File as the main vendor');
    console.log('  4. Grant the organisation access in Organisation > Module Subscriptions');

    process.exit(0);
}

main().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
