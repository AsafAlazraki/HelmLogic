# Shopify exploration in the HelmLogic context

**Phase**: v1.18 spike. Research deliverable, no production code shipped.
**Status**: Notes + architecture sketch + v1.21+ story slate proposal. No live API calls (no dev-store credentials in this env). Code stubs are in `src/lib/shopify/` ready for a real key.

---

## Why Shopify

NSM and most marine dealers already run a Shopify storefront for parts, accessories, and (sometimes) used inventory. Today the storefront and HelmLogic are completely siloed: a sale on Shopify doesn't decrement stock in HL, a model added to HL's catalog isn't surfaced on Shopify. The exploration goal is to understand what a bidirectional integration would look like so when it lands on the Roadmap proper (target v1.21+), we're not learning Shopify auth and pagination from scratch.

This is exploratory only. No story is in build yet.

---

## Auth options

Two paths the Shopify Admin API supports. Pick one for the per-dealer install model.

### Option A — Custom app per store

- Dealer creates a custom app inside their Shopify admin. App owner is the dealer.
- App generates an Admin API access token (one token per app per store).
- Token goes into the dealer's HL org config: `organisations/{orgId}/integrations/shopify.adminToken`.
- Token has the scopes the dealer ticks on creation.

Pros: simplest. No public-app review process. Per-dealer secret.
Cons: every dealer manually creates the app. Brittle if HL scope requirements expand.

### Option B — Public app + OAuth

- HL publishes a Shopify public app. Dealer installs via OAuth, HL stores the access token returned.
- Standard OAuth flow, redirect URI on HL's backend.
- Token persists per dealer.

Pros: install in two clicks. Scope expansions roll out cleanly.
Cons: needs the app reviewed + listed (Shopify Partners account, build review). Bigger commitment.

**Recommendation for v1.21 first cut**: Option A (custom app). Simpler proof of value. Migrate to OAuth when more than 2-3 dealers want it.

---

## API surface (Admin API, GraphQL)

Shopify split Admin API into REST and GraphQL. GraphQL is where the platform is investing; REST is in maintenance. Pick GraphQL for new integrations.

Endpoints we'd actually use:

- `Product`, `ProductVariant` — catalog rows. Each variant has SKU, price, compareAtPrice, inventoryItem reference.
- `InventoryLevel`, `Location` — per-location stock. A boat dealer with multiple branches maps each to a Shopify Location.
- `Order`, `LineItem` — sales. When a boat or accessory sells via Shopify, we'd pull the order in and reconcile against HL inventory.
- `Customer` — customer records. Match by email to HL's customer collection.
- `Webhook` — push-based updates. `inventory_levels/update`, `orders/create`, `products/update` are the critical three.

Rate limits: GraphQL uses query-cost throttling. ~50 cost-points/second steady-state, bucket of 1000. Most queries we'd issue are under 50 points. Pagination via cursor.

---

## Integration shape

Three directions of data flow. Each maps to a v1.21+ story.

### 1. HL → Shopify (catalog push)

When an admin adds a new model + variant to the HL catalog (via Catalog Manager), HL pushes it to Shopify as a Product + ProductVariant. Updates flow on `updatedAt` change.

- Trigger: writeBuiltin on `data-warehouse/{vendorId}/ranges/{rangeId}/models/{modelId}` or model variant.
- Fields mapped:
  - `Product.title` ← model.name
  - `Product.bodyHtml` ← model.marketingDescription
  - `Product.images` ← model.coverImageUrl + model.galleryUrls
  - `ProductVariant.sku` ← variant.sku
  - `ProductVariant.price` ← variant.sellPriceExclGst × GST_MULTIPLIER
  - `ProductVariant.compareAtPrice` ← v1.18 priceLevels.hull_cash if present
- Edge cases: Highfield variants have a "(Black / Carbon)" colourway in the name. Strip the parenthetical when pushing? Or push as separate variants? Discuss with operator.

### 2. Shopify → HL (stock pull)

Inventory levels flow Shopify → HL. When stock decrements on Shopify (sale via storefront), HL's inventory collection updates.

- Subscribe to `inventory_levels/update` webhook.
- Endpoint on HL: `app/api/shopify/webhooks/inventory-levels`.
- Verify HMAC signature on every request.
- Match Shopify InventoryItem.sku → HL inventory.stockNumber → write the delta.

### 3. Shopify → HL (order intake)

Boat or accessory sold on the storefront becomes an HL quote in `accepted` lifecycle state.

- Subscribe to `orders/create` webhook.
- Map LineItems to inventory items by SKU.
- Create a quote with status `accepted`, prefilled from Shopify customer + line items.
- Drop the salesperson into HL to convert the accepted quote into the next contract step.

---

## Risk + open questions

- **Variant pricing model mismatch**: HL has `priceLevels` (cash / trade / commercial / boating-alliance), Shopify has flat `price` + `compareAtPrice`. We need to decide which level pushes to Shopify (probably `priceLevels.hull_cash` = retail, with `compareAtPrice` for any RRP markdown). Document the rule before any data flows.

- **Currency**: Shopify shops are single-currency per store. HL handles AUD with USD-cost conversion via exchange rates. If a dealer's Shopify is AUD, the push is straightforward. If multi-currency Shopify Plus, we need the conversion to bake in correctly (see v1.17 `derive-pricing.ts` `resolvePriceLevel`).

- **Inventory location mapping**: HL `inventory.location` is a free-text string today. Shopify wants a `Location.gid`. We'd need an admin-side mapping table per org: HL location → Shopify Location.

- **Customer dedup**: Both HL and Shopify can independently create a customer record. Match by email is the obvious starter but breaks when two family members buy from the same email. Punt to a "merge customers" UI in v1.22+.

- **Order direction**: Today the storefront only sells parts + accessories. Selling a boat through Shopify is a different operator workflow (deposit + paperwork + lead time). For v1.21, scope the order intake to parts + accessories only. Boat orders stay in HL.

- **Auth scope creep**: a single Shopify access token can read AND write orders, products, customers, inventory. Per the principle of least privilege we'd want different tokens per direction. Shopify supports scoped access tokens but they're cumbersome. Defer.

---

## Proposed v1.21+ story slate (HL Roadmap)

When this work formally lands, the story breakdown is:

- **10.1.1 Shopify connector — auth setup** (custom-app token storage, per-org integration config doc).
- **10.1.2 Shopify catalog push** (HL Boat Brand → Shopify product / variant pairs, on-write trigger).
- **10.1.3 Shopify stock pull** (inventory_levels webhook → HL inventory delta).
- **10.1.4 Shopify order intake** (orders/create webhook → HL accepted quote, parts + accessories only).
- **10.1.5 Shopify integration health dashboard** (last sync, last error, manual resync button).

Five stories. Probably v1.22 cycle if we kick off in v1.21 planning.

---

## Code stubs ready for a real key

Three files under `src/lib/shopify/` set up the contract. No live API calls until a token is in env.

- `src/lib/shopify/client.ts` — fetch wrapper. Takes `{ shopDomain, adminToken }`, executes GraphQL queries with retry-on-throttle.
- `src/lib/shopify/types.ts` — partial type declarations for Product, ProductVariant, InventoryLevel, Order, Customer. Enough to make v1.21 build work without dragging in `@shopify/admin-api-client`.
- `src/lib/shopify/sync-direction.ts` — DRY-run helpers for each of the three integration directions. Take HL data, return what would be pushed/pulled. No mutations.

Nothing wired into production paths. To test against a real dev store, set `SHOPIFY_DEV_STORE_DOMAIN` + `SHOPIFY_DEV_STORE_ADMIN_TOKEN` env vars and run the stubs from a Node script.

---

## What to discuss with operators before v1.21 kickoff

1. Which integration direction is highest value first? (My guess: stock pull > order intake > catalog push.)
2. Which Shopify SKU naming convention matches HL's stock numbers? Today HL stock numbers and Shopify SKUs are independent. We need them to converge or we map at sync time.
3. Are there any dealer stores running Shopify Plus with multi-currency? Affects the catalog push pricing logic.
4. Who owns the integration credentials? Dealer admin? HL platform team? (Custom-app model means dealer admin, OAuth means HL.)
5. Boat orders on Shopify — yes/no? If yes, that becomes its own story (different from parts/accessories order intake).

---

## TL;DR

- Pick custom-app auth for the first cut, OAuth later when more dealers want it.
- Use GraphQL Admin API, not REST.
- Three flows: catalog push, stock pull, order intake. Five stories total. v1.21 kickoff target.
- Open questions documented for the operator conversation: variant pricing, currency, location mapping, customer dedup, order scope.
- Code stubs landed in `src/lib/shopify/` so v1.21 can drop credentials and go.
