# HelmLogic — CLAUDE.md

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update tasks/lessons.md with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Explain changes: high-level summary at each step
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

## Task Management

- **Plan First**: Write plan to tasks/todo.md with checkable items
- **Plan Check**: In before starting implementation
- **Track Progress**: Mark items complete as you go
- **Verify Plan**: High-level summary at each step
- **Document Results**: Add review section to tasks/todo.md
- **Capture Lessons**: Update tasks/lessons.md after corrections

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Only touch what's necessary. No side effects with new bugs.

---

## HelmLogic-Specific Context

### Tech Stack
- Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- Firebase (Firestore, Auth, Storage) via custom hooks
- Deployed via Firebase App Hosting

### Firestore Data Hierarchy
```
data-warehouse/{vendorId}/
  ranges/{rangeId}/
    models/{modelId}/
      variants/{variantId}     ← SKU-level (material + color + price)
modules/{moduleId}             ← Org access point to a vendor
organisations/{orgId}/
  modelOverrides/{modelId}     ← Org-specific pricing overrides
  dealerFitSelections/
  exchangeRates/{currencyCode}
users/{userId}/quotes/{quoteId}
```

### Highfield Boat Structure
- **Vendor ID**: `LafOLpLb6QIFE856TiD4` (slug: `highfield`, vendorType: `Boat Brand`, currency: `USD`)
- **Range IDs** (under vendor `LafOLpLb6QIFE856TiD4`):
  - Classic: `qo7IePnRzJxjrYyLWhTn` | Roll-Up: `EqcKQ51svI1I2Q5poFdl` | Ultra-Light: `QsGZuVwutEr5yyMkp97j`
  - Sport: `nQ2LE50z9Tbf2uss0Ote` | Adventure: `sEzdrM2fZsrOKA3ACrJp` | Patrol: `vfXxDuMpChteKncb7LnG` | Coaster: `coaster`
- **Module ID**: `M1Yf3R9igpJDxJnOVr6f` (Highfield Boats module, linked to vendor `LafOLpLb6QIFE856TiD4`)
- **Northside Marine org**: `AcFZVEFA5UDJG2hyetWT`
- **Range** = model series/code prefix (e.g., `CL` = Classic, `SP` = Sport, `RU` = Roll-Up, `AL` = Adventure, `PA` = Patrol)
- **Model** = specific boat (e.g., `CL260`) — holds specs, optional features, trailer config, registration costs
- **Variant** = SKU (e.g., CL260-GREY-HYP) — one per material × color combo, each has `sellPriceExclGst`
- Optional features with `applicableVariantIds` restrict which SKUs can use a given feature
- Motor compatibility driven by `specifications.motorConfigurations[0].engines[0].minHp/maxHp` + `steeringType`
- Model documents do NOT have an `order` field — do NOT use `orderBy('order')` on model/variant queries; use `collection()` without ordering instead

### Seed Scripts
- `scripts/seed-highfield.py` — original script (writes to wrong vendor path `data-warehouse/highfield`, do not use)
- `scripts/reseed-correct-vendor.py` — correct script targeting vendor `LafOLpLb6QIFE856TiD4`
- Data files: `/tmp/highfield_structured.json`, `/tmp/highfield_equipment_map.json`

### Pricing Rules
- All prices stored as `sellPriceExclGst` (exclusive of GST)
- Highfield factory prices are in USD — use org exchange rate (`/organisations/{orgId}/exchangeRates/USD`) to convert to AUD sell price
- GST (10%) applied at finalization only
- `cost` field stores buy price for margin tracking

### Key Branch
- Development branch: `claude/app-overview-wKiZ1`
- Always push to this branch

### Known Lessons
- **Verify data is actually visible before telling user it's there** — always query Firestore to confirm docs exist at the correct path
- **`orderBy('field')` in Firestore silently excludes docs without that field** — seeded docs often don't have `order`; use unordered collection queries
- **Vendor ID matters**: app reads from `data-warehouse/LafOLpLb6QIFE856TiD4`, not `data-warehouse/highfield`
- **Module page passes vendorId + rangeId to model editors** — always pass both props to `HighfieldModelEditor` (and others)
