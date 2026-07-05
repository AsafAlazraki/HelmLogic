
/**
 * Shopify Admin API client wrapper (v1.18 spike).
 *
 * Minimal GraphQL fetch wrapper with retry-on-throttle. Not used by
 * any production path yet. v1.21 integration stories will replace
 * this with the official @shopify/admin-api-client or whatever the
 * platform team picks; the SHAPE is the contract.
 *
 * Configuration:
 *   {
 *     shopDomain: 'northside.myshopify.com',
 *     adminToken: 'shpat_xxx',
 *     apiVersion: '2025-04',
 *   }
 *
 * The adminToken comes from a per-org custom-app install (Option A in
 * tasks/shopify-exploration-notes.md). Never log or expose the token.
 */

export interface ShopifyClientConfig {
    shopDomain: string;        // e.g. northside.myshopify.com
    adminToken: string;        // shpat_... from the dealer's custom app
    apiVersion?: string;       // default 2025-04
}

export class ShopifyThrottled extends Error {
    constructor(public retryAfterMs: number) {
        super(`Shopify throttled, retry after ${retryAfterMs}ms`);
    }
}

export class ShopifyApiError extends Error {
    constructor(message: string, public status: number, public body: any) {
        super(message);
    }
}

/**
 * Execute a GraphQL query against the Shopify Admin API.
 * Retries up to 3 times on THROTTLED responses with exponential backoff.
 * Throws ShopifyApiError on any other failure.
 *
 * @example
 *   const data = await shopifyGraphql(config, `
 *     query { shop { name } }
 *   `);
 */
export async function shopifyGraphql<T = any>(
    config: ShopifyClientConfig,
    query: string,
    variables: Record<string, any> = {},
    attempt = 1,
): Promise<T> {
    const apiVersion = config.apiVersion ?? '2025-04';
    const url = `https://${config.shopDomain}/admin/api/${apiVersion}/graphql.json`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': config.adminToken,
        },
        body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
        throw new ShopifyApiError(`HTTP ${response.status}`, response.status, await response.text().catch(() => null));
    }
    const json = await response.json();
    if (json.errors) {
        const throttled = json.errors.find((e: any) => e?.extensions?.code === 'THROTTLED');
        if (throttled && attempt <= 3) {
            const wait = 1000 * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, wait));
            return shopifyGraphql(config, query, variables, attempt + 1);
        }
        throw new ShopifyApiError(json.errors[0]?.message ?? 'GraphQL error', 200, json.errors);
    }
    return json.data as T;
}
