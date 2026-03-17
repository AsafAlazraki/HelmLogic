# HelmLogic AI Evolution Context

This file serves as the persistent memory and reasoning log for the HelmLogic development agents. It is updated after every significant change to ensure continuity and logic transfer between sessions.

## Project DNA
- **Framework**: Next.js (App Router)
- **Database/Backend**: Firebase Firestore & Storage
- **UI Library**: Radix UI + Vanilla CSS (Premium, custom styling)
- **Core Entity**: "Data Warehouse" (Vendor-specific hardware, specs, and configurations)

## Architectural Logic & Philosophy

### 1. Data Integrity (The "Inconsistency Guard" Pattern)
The Data Warehouse often contains partial rows or missing fields (e.g., missing `motor.model`). 
**Rule**: Always implement robust fallbacks in `buildQuotePayload` and detail views. Never assume a field like `brand` or `hp` is present.
**Standard Fallbacks**:
- Name: `['Model Name'] || name || model || 'Unknown'`
- Model: `model || ['Model Name'] || 'Standard'`
- Price: `|| 0`

### 2. Highfield Quoting Flow Logic
- **SKU-Based Filtering**: Optional features (like consoles) use an `associatedSkus` array. If this array is populated, the feature ONLY appears if the boat's active variant SKU matches one of the entries.
- **Motor Filtering**: Motors are filtered based on the model's `specifications.motorConfigurations`.
    - Matches are based on engine count (Single/Twin) and HP range.
    - Also filters by `steeringType` (Forward Control vs Tiller) based on whether the selected console has an `associatedSeatId` or is a console category.

### 3. Routing & UX
- **Slugs Over IDs**: Use module slugs in URLs (e.g., `/modules/highfield`) instead of Firestore IDs wherever possible for SEO and readability.
- **Scroll Hijacking**: Always scroll the right-panel viewport to top on step transitions to avoid user confusion.

## Recent Evolution (Session: March 17, 2026)
1. **Fix**: Resolved critical crash on quote finalization by adding motor attribute fallbacks.
2. **Feature**: Implemented `associatedSkus` filtering in `highfield-quote-flow.tsx`.
3. **UX**: Created `/modules/[id]/proposals/page.tsx` to handle route index access and prevent 404s.
4. **UI**: Upgraded Motor cards to "Hyper-Premium" cards with improved hierarchy and badges.
5. **Context**: Initialized this `evolution.md` file per user request.

## How to Proceed (For Future Agents)
- **UI First**: If a component looks basic, it is a fail. Use vibrant colors, glassmorphism, and bold typography.
- **Log Verification**: Before claiming success, verify the 404s on listing pages are resolved.
- **Update this file**: Every time you modify logic or add a component, append the "Recent Evolution" and update "Architectural Logic" if patterns change.
