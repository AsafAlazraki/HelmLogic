
/**
 * Shopify Admin API — partial type declarations (v1.18 spike).
 *
 * Enough to make v1.21 builds compile against the GraphQL Admin API
 * without dragging in @shopify/admin-api-client. Production
 * integration will replace these with the official generated types.
 */

export interface ShopifyMoney {
    amount: string;            // GraphQL returns decimal strings, not numbers
    currencyCode: string;
}

export interface ShopifyImage {
    id: string;
    url: string;
    altText?: string | null;
}

export interface ShopifyProductVariant {
    id: string;                // gid://shopify/ProductVariant/{n}
    sku: string;
    title: string;
    price: string;
    compareAtPrice?: string | null;
    inventoryItem: { id: string };
    inventoryQuantity: number;
}

export interface ShopifyProduct {
    id: string;                // gid://shopify/Product/{n}
    title: string;
    bodyHtml?: string | null;
    handle: string;
    images: ShopifyImage[];
    variants: ShopifyProductVariant[];
    updatedAt: string;         // ISO timestamp
}

export interface ShopifyLocation {
    id: string;                // gid://shopify/Location/{n}
    name: string;
    address?: { city?: string; province?: string };
}

export interface ShopifyInventoryLevel {
    id: string;
    available: number;
    locationId: string;
    inventoryItemId: string;
    updatedAt: string;
}

export interface ShopifyCustomer {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
}

export interface ShopifyOrderLineItem {
    id: string;
    sku: string | null;
    quantity: number;
    price: string;
    variantId?: string | null;
}

export interface ShopifyOrder {
    id: string;                // gid://shopify/Order/{n}
    name: string;              // human label like "#1003"
    createdAt: string;
    customer?: ShopifyCustomer | null;
    lineItems: ShopifyOrderLineItem[];
    totalPrice: string;
    financialStatus: string;   // 'paid' | 'pending' | 'authorized' | ...
    fulfillmentStatus?: string | null;
}
