
/**
 * Shopify sync directions — DRY-run helpers (v1.18 spike).
 *
 * Each function takes HL data + Shopify data and returns what would be
 * pushed or pulled WITHOUT actually mutating anything. v1.21 stories
 * wrap these with real client calls; v1.18 is just shape exploration.
 *
 * Three directions, mapping to the v1.21+ story slate in
 * tasks/shopify-exploration-notes.md:
 *
 *   buildCatalogPush      — HL model → Shopify product diff (10.1.2)
 *   reconcileStockPull    — Shopify InventoryLevel → HL inventory delta (10.1.3)
 *   shopifyOrderToQuote   — Shopify Order → HL quote draft (10.1.4)
 */

import type { ShopifyProduct, ShopifyInventoryLevel, ShopifyOrder, ShopifyCustomer } from './types';
import { GST_MULTIPLIER } from '@/lib/catalog/derive-pricing';

interface HlModel {
    id: string;
    modelCode?: string;
    name?: string;
    marketingDescription?: string;
    coverImageUrl?: string;
    galleryUrls?: string[];
    sellPriceExclGst?: number | null;
    priceLevels?: Record<string, number | null>;
    updatedAt?: any;
}

interface HlInventory {
    id: string;
    stockNumber?: string;
    location?: string;
    quantity?: number;
    status?: string;
}

interface ProductPushPlan {
    title: string;
    bodyHtml: string;
    variantUpdates: Array<{
        sku: string;
        price: string;
        compareAtPrice: string | null;
    }>;
    images: Array<{ url: string; altText: string }>;
}

/**
 * v1.21/10.1.2 — Catalog push. HL model → Shopify product fields.
 * Returns the payload that would be sent. Does NOT call Shopify.
 */
export function buildCatalogPush(model: HlModel, existing: ShopifyProduct | null = null): ProductPushPlan {
    const sellEx = model.sellPriceExclGst ?? 0;
    const sellInc = Math.ceil(sellEx * GST_MULTIPLIER);
    const cashLevel = model.priceLevels?.hull_cash;
    const compareAt = cashLevel && cashLevel > sellEx ? Math.ceil(cashLevel * GST_MULTIPLIER) : null;
    const images: ProductPushPlan['images'] = [];
    if (model.coverImageUrl) images.push({ url: model.coverImageUrl, altText: model.name ?? '' });
    for (const url of model.galleryUrls ?? []) images.push({ url, altText: model.name ?? '' });
    return {
        title: model.name ?? model.modelCode ?? model.id,
        bodyHtml: model.marketingDescription ?? '',
        variantUpdates: [
            {
                sku: model.modelCode ?? model.id,
                price: String(sellInc),
                compareAtPrice: compareAt != null ? String(compareAt) : null,
            },
        ],
        images,
    };
}

/**
 * v1.21/10.1.3 — Stock pull. Shopify InventoryLevel → HL inventory delta.
 * Returns the patches that would be applied. Does NOT call Firestore.
 */
export function reconcileStockPull(
    shopifyLevels: ShopifyInventoryLevel[],
    skuToHlInventoryId: Map<string, string>,
    currentHlInventory: Map<string, HlInventory>,
): Array<{ hlInventoryId: string; setQuantity: number }> {
    const patches: Array<{ hlInventoryId: string; setQuantity: number }> = [];
    for (const level of shopifyLevels) {
        const hlId = skuToHlInventoryId.get(level.inventoryItemId);
        if (!hlId) continue;
        const current = currentHlInventory.get(hlId)?.quantity ?? 0;
        if (current === level.available) continue;
        patches.push({ hlInventoryId: hlId, setQuantity: level.available });
    }
    return patches;
}

interface QuoteDraft {
    customerName: string;
    customerEmail: string | null;
    customerPhone: string | null;
    items: Array<{ sku: string; quantity: number; price: number }>;
    totalIncGst: number;
    lifecycleState: 'accepted';
    sourceTag: string;
}

/**
 * v1.21/10.1.4 — Order intake. Shopify Order → HL quote draft (status 'accepted').
 * Scope for v1.21 first cut: parts + accessories only (no boats). Caller
 * is responsible for excluding line items that map to a Boat Brand SKU.
 */
export function shopifyOrderToQuote(order: ShopifyOrder): QuoteDraft {
    const c: ShopifyCustomer | undefined | null = order.customer;
    return {
        customerName: c ? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'Shopify customer' : 'Shopify customer',
        customerEmail: c?.email ?? null,
        customerPhone: c?.phone ?? null,
        items: order.lineItems.map(li => ({
            sku: li.sku ?? '',
            quantity: li.quantity,
            price: parseFloat(li.price) || 0,
        })),
        totalIncGst: parseFloat(order.totalPrice) || 0,
        lifecycleState: 'accepted',
        sourceTag: `shopify:${order.name}`,
    };
}
