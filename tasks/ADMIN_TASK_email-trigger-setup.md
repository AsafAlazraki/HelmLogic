# Admin Task — Wire Firebase Trigger Email for v1.8

> **Pre-flight task for v1.8 story 1.2.4 Send Quote.** Must be complete
> BEFORE 1.2.4 build begins (week 3 of v1.8).
>
> **Collaborative**: operator drives Firebase Console + DNS + SendGrid
> account, agent guides through each step + verifies smoke-test result.

---

## Goal

When the application writes a doc into Firestore at `mail/{anyId}` with
shape `{ to, message: { subject, html, attachments? } }`, an actual
email is delivered to the recipient inbox within 60 seconds.

The Firebase **Trigger Email** extension (built by Firebase team) does
the work. We just need to install + configure it.

---

## Pre-requisites

- [ ] Firebase Console access for the HelmLogic project
- [ ] Sender domain we own (e.g. `northsidemarine.com.au`) and DNS
      management access for it
- [ ] Email provider account — we'll use **SendGrid free tier** for v1.8
      (100 emails/day, sufficient for verification + early customer sends)

---

## Step-by-step

### 1. Install the Firebase Trigger Email extension

1. Firebase Console → HelmLogic project → **Extensions**
2. Search "Trigger Email" → install the official one (publisher: Firebase)
3. Configuration page:
   - **SMTP connection URI** — leave blank for now, fill in step 3
   - **Email documents collection** — set to `mail` (matches `firestore.rules:164` permission)
   - **Default FROM address** — set to `noreply@northsidemarine.com.au`
     (this is the address we'll verify in step 4)
   - **Default REPLY-TO address** — set to operator email (e.g.
     `sales@northsidemarine.com.au`) so customer replies go to a
     monitored inbox
   - **Users collection** — leave blank (we drive recipients from the
     `to` field on the Firestore doc, not from a users collection)
   - **TLS options** — default
4. Click **Install** — provisions a Cloud Function that watches `mail/{id}`

### 2. Sign up for SendGrid free tier

1. https://signup.sendgrid.com/ → free tier (no credit card required)
2. Verify the signup email
3. Settings → **Sender Authentication** → **Authenticate Your Domain**
4. Pick the domain you'll send from (`northsidemarine.com.au`)
5. SendGrid generates 3 DNS records (CNAME entries) — copy them

### 3. Add DNS records for SendGrid

1. Domain registrar → DNS management for `northsidemarine.com.au`
2. Add the 3 CNAME records SendGrid generated
3. Wait 5–60 minutes for DNS propagation
4. Back in SendGrid → **Verify** → green checkmarks on all 3 records

### 4. Configure SendGrid SMTP credentials

1. SendGrid → Settings → **API Keys** → Create API Key
   - Name: "HelmLogic Trigger Email"
   - Permissions: **Restricted Access** → enable only **Mail Send**
   - Generate, COPY THE KEY (shown once — never again)
2. SMTP connection URI format:
   `smtps://apikey:<API_KEY>@smtp.sendgrid.net:465`
   - Username is literally the string `apikey`
   - Password is the SendGrid API key from step 1
3. Firebase Console → Extensions → Trigger Email → **Reconfigure**
   - Paste the SMTP URI in **SMTP connection URI**
   - Save → extension redeploys (~1 min)

### 5. Add SPF + DKIM DNS records (sender authentication)

SendGrid's domain authentication (step 3) covers most of this, but
verify these are present:

- [ ] **SPF**: `v=spf1 include:sendgrid.net ~all` on `northsidemarine.com.au`
      (or merged with existing SPF if any)
- [ ] **DKIM**: SendGrid's CNAME records from step 3 — these ARE the DKIM

If both green in SendGrid → ready.

### 6. Smoke-test from Firebase Console

1. Firebase Console → Firestore → `mail` collection → **Add document**
2. Doc ID: leave auto-generated
3. Fields:
   ```
   to: <your-personal-email>@gmail.com (or any inbox you can check)
   message:
     subject: "v1.8 smoke-test from HelmLogic"
     html: "<p>If you can read this, Trigger Email is wired correctly.</p>"
   ```
4. Save the doc
5. Wait ≤60 seconds. Check the inbox.
6. **Pass condition**: email arrives, `from:` shows
   `noreply@northsidemarine.com.au`, message body renders the HTML.

### 7. Confirm extension status

1. Firebase Console → Extensions → Trigger Email → **Logs**
2. Recent log line: `Email sent to <recipient>`
3. Firestore `mail/{id}` doc gets a `delivery` field auto-added by the
   extension showing `state: 'SUCCESS'` + `info.messageId`.

If the doc shows `state: 'ERROR'`, the `delivery.error` field has the
SMTP error text. Common ones:
- `unauthenticated` — API key wrong / missing SMTP URI
- `domain not verified` — SendGrid step 3 not green yet
- `mailbox bounced` — recipient address invalid

---

## What to share back to me

After the smoke-test passes, paste back the `delivery` field from the
Firestore doc (with the API key REDACTED):

```
delivery:
  state: SUCCESS
  attempts: 1
  startTime: <timestamp>
  endTime: <timestamp>
  info:
    messageId: <some id>
    accepted: [recipient]
    rejected: []
```

Once I see that, 1.2.4 build is unblocked.

---

## Out of scope for v1.8

- ❌ Email open / click tracking (SendGrid supports it, but needs
  webhook receiver + Cloud Functions). Deferred to v1.9.
- ❌ Reply-tracking (customer replies → quote thread). Deferred.
- ❌ Email template management in SendGrid (we author templates IN
  HelmLogic via the v1.8 1.2.4 surface, not in SendGrid).
- ❌ Bounce / suppression list management (SendGrid handles this
  automatically for v1.8 volumes; revisit if we hit free-tier limits).
- ❌ Migration to a higher-tier provider (Mailgun, Postmark) — defer
  until SendGrid free tier is insufficient.
