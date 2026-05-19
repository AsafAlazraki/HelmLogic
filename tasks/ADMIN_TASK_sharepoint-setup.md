# Admin Task — Wire Microsoft SharePoint for v1.9 (story 1.3.3)

> **Pre-flight task for v1.9 story 1.3.3 SharePoint Quote Storage.**
>
> **Collaborative**: operator drives Azure Portal + SharePoint Admin
> Center, agent guides through each step + verifies smoke-test result.
>
> **Status**: blocking for SharePoint sync to actually upload files.
> The v1.9 code ships with `NEXT_PUBLIC_SHAREPOINT_ENABLED=false` by
> default — sync hooks no-op silently until the flag flips, so v1.9
> can roll to prod safely without this admin task being complete.
> Mirrors the v1.8 email-flag pattern (`ADMIN_TASK_email-trigger-setup.md`).

---

## Goal

When a quote is **finalized, sent, scenario-spawned, fork-on-edited,
or transitions to a terminal lifecycle state** (Accepted / Rejected /
Lost / Expired), the corresponding PDF lands in a SharePoint folder
that mirrors HelmLogic's structure:

```
{configured root}/
  HelmLogic — {Organisation Name}/
    {Salesperson Display Name}/
      {Customer Name} — {Root Quote Number}/
        Original/
          Quote.pdf
        Trade-in option/                  (= scenario sibling)
          Quote.pdf
        v2/                               (= fork-on-edit child)
          Quote.pdf
```

The mirror is one-way (HL source of truth). Edits in SharePoint don't
sync back.

---

## Architecture

- **One Azure app** ("HelmLogic SharePoint Sync"), multi-tenant.
- Each org admin grants this app access to **their** SharePoint site.
- HelmLogic stores per-org config (`tenantId`, `siteId`, `clientId`,
  `folderPath`) in Firestore at
  `organisations/{orgId}/sharePointConfig`.
- The Azure app's client secret lives ONCE in Firebase App Hosting
  env (`SHAREPOINT_CLIENT_SECRET`) — never in Firestore, never in the
  client bundle.
- HelmLogic Next.js API route (`/api/sharepoint-sync`) does
  client-credentials OAuth → uploads PDF to Graph API.

---

## Pre-requisites

- [ ] Azure Portal access — global admin or app-registration role on
      the HelmLogic Azure tenant (one tenant for the HelmLogic app
      itself; orgs that consume the integration have their own tenants
      separately)
- [ ] SharePoint site URL + site admin access for each org that wants
      to onboard (e.g. `https://nsmarine.sharepoint.com/sites/HelmLogic`)
- [ ] Firebase App Hosting access to set deploy-env variables

---

## Step-by-step

### 1. Register the HelmLogic Azure app (one time, ever)

1. Azure Portal → **Azure Active Directory** → **App registrations**
2. **New registration**:
   - Name: `HelmLogic SharePoint Sync`
   - Supported account types: **Accounts in any organizational
     directory (multitenant)**
   - Redirect URI: leave blank (we use client-credentials, not
     interactive)
3. After creation, on the app's Overview page, **copy** these two
   values — they're the same across every org:
   - **Application (client) ID** — looks like
     `5f3a8c9d-1234-5678-90ab-cdef12345678`. This is the org's
     `clientId` in `sharePointConfig`.
   - **Directory (tenant) ID** for HelmLogic itself (we won't use
     this — each onboarding org uses ITS OWN tenantId, see step 5)

### 2. Configure Graph API permissions

1. App → **API permissions** → **Add a permission**
2. **Microsoft Graph** → **Application permissions** (NOT delegated)
3. Search + tick:
   - `Files.ReadWrite.All`
   - `Sites.ReadWrite.All`
4. **Add permissions** → returns to the API permissions list
5. **Grant admin consent for HelmLogic** — sets the "Status" column
   to a green check on both permissions

### 3. Create a client secret

1. App → **Certificates & secrets** → **New client secret**
2. Description: `helmlogic-sync-{YYYY-MM}` (rotate annually)
3. Expires: **24 months** (set a calendar reminder for renewal)
4. **Copy the secret VALUE immediately** — only shown once
5. Format: `Wp_8q~xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 4. Store the secret in Firebase App Hosting

1. Firebase Console → **App Hosting** → HelmLogic backend → **Edit
   environment variables**
2. Add a variable:
   - Name: `SHAREPOINT_CLIENT_SECRET`
   - Value: the secret string copied in step 3
   - Visibility: **Backend only** (must NOT be exposed to the client)
3. Save → redeploys backend (~3 min)

> ⚠️ Never put this in `.env.local` committed to git, never in
> Firestore, never in a `NEXT_PUBLIC_*` variable. Backend secrets only.

### 5. Onboard the first org (Northside Marine)

This step is repeated PER ORG that wants the integration.

#### 5a. Grant the HelmLogic app access to the org's SharePoint site

The org admin grants the multi-tenant HelmLogic app permission to
write to their site via SharePoint's app-only consent flow.

1. Navigate (in a browser logged in as the org's M365 admin):
   ```
   https://login.microsoftonline.com/{ORG_TENANT_ID}/adminconsent
     ?client_id={HELMLOGIC_CLIENT_ID}
     &redirect_uri=https://helmlogic.com
   ```
   - Replace `{ORG_TENANT_ID}` with the org's Azure tenant ID
     (Microsoft 365 admin center → Settings → Org settings → Org
     profile shows it)
   - Replace `{HELMLOGIC_CLIENT_ID}` with the value from step 1
2. Org admin sees the consent prompt listing the two Graph permissions
   from step 2 → clicks **Accept**
3. Redirect lands on `helmlogic.com` — that's fine; consent is now
   recorded against the org's tenant

#### 5b. Find the org's SharePoint site ID

We need the Graph `siteId` — a long composite key, NOT just the URL.

1. Browse to the org's site (e.g.
   `https://nsmarine.sharepoint.com/sites/HelmLogic`)
2. In a new tab, open:
   ```
   https://graph.microsoft.com/v1.0/sites/nsmarine.sharepoint.com:/sites/HelmLogic
   ```
   (logged in as the org admin in the same browser)
3. Copy the `id` field from the JSON response — looks like
   `nsmarine.sharepoint.com,abc12345-...,def67890-...`
4. That's the `siteId` for this org.

#### 5c. Choose a root folder

Pick where in the SharePoint site HelmLogic should write. Common
choice: `/Shared Documents/HelmLogic` (a top-level folder in the
default document library).

The full path you'll store as `folderPath` is `HelmLogic` (relative
to the site's drive root). HelmLogic creates the folder on first
sync if it doesn't exist yet.

#### 5d. Write the org's `sharePointConfig` doc

In Firebase Console → Firestore → `organisations/{orgId}` →
create subcollection `sharePointConfig` → create doc with id
`default` (one config per org for v1.9; multi-site is v1.10+):

```
{
  enabled: true,
  tenantId: "<org tenant id, e.g. 11111111-2222-3333-4444-555555555555>",
  clientId: "<HelmLogic Azure app client id from step 1>",
  siteId: "<from step 5b, e.g. nsmarine.sharepoint.com,...,...>",
  folderPath: "HelmLogic",
  configuredAt: <serverTimestamp>,
  configuredByName: "<admin name>"
}
```

> Alternatively use the in-app `/manage` → **Organisation** → **SharePoint
> integration** form which writes the same fields with validation. The
> Firestore-direct path above is for emergency / power-user setup.

### 6. Flip the env flag

Firebase App Hosting → env vars → add:

```
NEXT_PUBLIC_SHAREPOINT_ENABLED=true
```

Save → redeploys frontend (~3 min). After deploy completes, the sync
hooks in finalize / send / scenario / fork / lifecycle flows go live.

### 7. Smoke test

1. Sign in to HelmLogic as a salesperson at Northside Marine
2. Create a new quote → Finalize (status flips to `proposal`)
3. Within 10s, check the configured SharePoint folder
4. **Pass condition**: A new folder appears at
   ```
   /HelmLogic/HelmLogic — Northside Marine/{Salesperson Name}/
     {Customer Name} — {Quote Number}/Original/Quote.pdf
   ```
   and the PDF opens correctly.
5. On the HelmLogic side, the quote doc gets two new fields
   auto-written by the client after the API route returns success:
   - `sharePointSyncedAt: <Timestamp>`
   - `sharePointPath: <full path string>`

If the folder doesn't appear after 60s, check:
- API route logs in Firebase App Hosting console for
  `[sharepoint-sync]` lines
- Browser DevTools network tab for the `/api/sharepoint-sync` request
  — response body explains any 401 / 403 / 404 from Graph

---

## What to share back to me

After smoke-test passes, paste back:

```
sharePointConfig.enabled: true
sharePointConfig.siteId: <redacted but visible prefix, e.g. "nsmarine.sharepoint.com,...">
NEXT_PUBLIC_SHAREPOINT_ENABLED: true
First quote synced:
  quoteNumber: NSM-Q...
  sharePointPath: <path that appeared>
  sharePointSyncedAt: <timestamp>
```

Once I see that, 1.3.3 is verified live in prod.

---

## Out of scope for v1.9

- ❌ **Per-org Azure apps** — every onboarding org consumes the same
  multi-tenant HelmLogic app. v1.10+ if any org has compliance
  reasons to need their own app registration.
- ❌ **Two-way sync** — edits made directly in SharePoint don't flow
  back to HL. SharePoint is a read-only mirror for non-HL viewers.
- ❌ **SharePoint document versioning surfaced in HL** — Graph supports
  it but the HL Activity tab covers the equivalent.
- ❌ **OneDrive personal storage** — we sync to SharePoint *site*
  libraries, not individual OneDrives. Personal-drive sync deferred.
- ❌ **Per-customer permissions / sharing links** — if the customer
  needs the PDF, the v1.8 Send Quote pipeline emails them directly;
  SharePoint mirror is for internal stakeholders.
- ❌ **Storage quota / file lifecycle policies** — managed in
  SharePoint admin, not HL. Talk to the org IT team if quotas matter.
- ❌ **Multi-site / multi-library routing per org** — v1.9 supports
  one SharePoint site per org. Multi-site is v1.10+ if needed.
- ❌ **Retroactive sync of existing quotes** — only newly-finalized
  quotes (and their later events) sync. A one-shot backfill button is
  v1.10+ if anyone asks.
