# Admin Task — Wire Firebase Trigger Email via Microsoft 365 SMTP for v1.8

> **Pre-flight task for v1.8 story 1.2.4 Send Quote.** Must be complete
> BEFORE 1.2.4 build begins (week 3 of v1.8).
>
> **Collaborative**: NSM admin drives Microsoft 365 admin centre + app
> password generation; agent guides through each step + verifies smoke-
> test result.
>
> **Why M365 SMTP** (vs SendGrid): NSM already pays for Microsoft 365.
> DKIM/SPF/DMARC are already configured on the verified domain. Customer
> replies land in real NSM mailboxes (not a generic noreply@). Zero new
> SaaS account to manage. Free within existing licence.

---

## Goal

When the application writes a doc into Firestore at `mail/{anyId}` with
shape `{ to, message: { subject, html, attachments? } }`, the Firebase
Trigger Email extension authenticates against `smtp.office365.com:587`
using a chosen NSM mailbox's app password and delivers the email
through Microsoft 365 within 60 seconds.

---

## Pre-requisites

- [ ] **Microsoft 365 admin access** for the NSM tenant (Global Admin or
      Exchange Admin role)
- [ ] **A chosen sender mailbox** — e.g. `noreply@northsidemarine.com.au`,
      `quotes@northsidemarine.com.au`, or a personal salesperson mailbox.
      Whatever you pick is what customers see in their inbox as the
      `From:` address.
- [ ] **MFA enabled** on that mailbox (required to generate app passwords;
      standard hygiene anyway)
- [ ] **Firebase Console access** for the HelmLogic project

---

## Step-by-step

### 1. Verify DKIM + SPF + DMARC are configured in M365

These are almost certainly already on (any NSM tenant that's been on
M365 for >12 months will have them). Quick verify:

1. Microsoft 365 Defender → Email & collaboration → **Policies & rules**
   → **Threat policies** → **Email authentication settings** → **DKIM**
2. Should see `northsidemarine.com.au` listed with DKIM **enabled** ✅
3. If NOT enabled: click the domain → "Enable" → wait for the two
   CNAME records to populate, add them to NSM's DNS, return and click
   "Rotate DKIM keys"
4. SPF check: open a terminal and run
   `dig TXT northsidemarine.com.au +short` → should include
   `v=spf1 ... include:spf.protection.outlook.com -all` (or `~all`)
5. DMARC: same dig, but on `_dmarc.northsidemarine.com.au` → should
   show a `v=DMARC1; p=quarantine` (or `none`/`reject`) record. If
   missing, add a basic one: `v=DMARC1; p=none; rua=mailto:dmarc@northsidemarine.com.au`

Don't proceed until DKIM = enabled. Otherwise emails will land in
spam folders or get rejected outright.

### 2. Confirm SMTP AUTH is enabled on the chosen sender mailbox

Microsoft started disabling SMTP AUTH org-wide for security in 2022.
Need to check tenant + per-mailbox settings.

**Tenant-level check:**
1. Microsoft 365 admin centre → **Settings** → **Org settings** →
   **Modern authentication** → confirm "Authenticated SMTP" is
   **enabled** ✅

**Mailbox-level check:**
1. Microsoft 365 admin → **Users** → **Active users** → select the
   sender mailbox
2. Click **Mail** tab → **Manage email apps** →
3. Verify **Authenticated SMTP** is checked ✅
4. If not, check it and Save

(If your tenant's modern security baseline blocks this, contact
NSM IT for an exception. Worst case: switch to Microsoft Graph API
path — see "Fallback" at the bottom.)

### 3. Generate an app password for the sender mailbox

1. Sign in to https://mysignins.microsoft.com/security-info as the
   sender mailbox (or have the user holding that mailbox sign in)
2. **Add sign-in method** → **App password**
3. Name it: `HelmLogic Trigger Email`
4. Microsoft generates a 16-char password — **COPY IT NOW**, it's
   shown once
5. Store it temporarily in a password manager — we'll paste it into
   Firebase Console in step 5

If you don't see the App Password option, MFA isn't enabled — go
back to pre-reqs.

### 4. Install the Firebase Trigger Email extension

1. Firebase Console → HelmLogic project → **Extensions**
2. Search **"Trigger Email"** → install the official one (publisher: Firebase)
3. Configuration page:
   - **SMTP connection URI** — leave blank for now, fill in step 5
   - **Email documents collection** — set to `mail` (matches `firestore.rules:164` permission)
   - **Default FROM address** — set to the sender mailbox you chose
     (e.g. `noreply@northsidemarine.com.au`)
   - **Default REPLY-TO address** — set to a monitored mailbox (e.g.
     `sales@northsidemarine.com.au`) so customer replies land where
     someone reads them
   - **Users collection** — leave blank
   - **TLS options** — default
4. Click **Install** — provisions a Cloud Function watching `mail/{id}`

### 5. Configure the SMTP URI

The format for Microsoft 365 SMTP via the extension:

```
smtps://<email-encoded>:<APP_PASSWORD>@smtp.office365.com:465
```

OR (more common, on port 587 with STARTTLS):

```
smtp://<email-encoded>:<APP_PASSWORD>@smtp.office365.com:587
```

Notes:
- `<email-encoded>` is the sender mailbox with `@` URL-encoded as `%40`
  (e.g. `noreply%40northsidemarine.com.au`)
- `<APP_PASSWORD>` is the 16-char password from step 3 (URL-encode any
  special characters if Microsoft generated any — usually it's just
  letters)
- Port **587** is the standard for SMTP submission with STARTTLS;
  Microsoft 365 supports it. Use this unless you specifically need
  implicit TLS on 465.

Example (with placeholder):
```
smtp://noreply%40northsidemarine.com.au:abcdEFGHijklMNOP@smtp.office365.com:587
```

Then:
1. Firebase Console → Extensions → Trigger Email → **Reconfigure**
2. Paste the SMTP URI in **SMTP connection URI**
3. Save → extension redeploys (~1 min)

### 6. Smoke-test from Firebase Console

1. Firebase Console → Firestore → `mail` collection → **Add document**
2. Doc ID: leave auto-generated
3. Fields:
   ```
   to: <your-personal-email>@gmail.com (or any inbox you can check)
   message:
     subject: "v1.8 smoke-test from HelmLogic"
     html: "<p>If you can read this, M365 SMTP via Trigger Email is wired correctly.</p>"
   ```
4. Save the doc
5. Wait ≤60 seconds. Check the inbox.
6. **Pass condition**: email arrives, `from:` shows your chosen sender
   mailbox (e.g. `noreply@northsidemarine.com.au`), message body
   renders the HTML, headers show DKIM=pass + SPF=pass.

### 7. Confirm extension status

1. Firebase Console → Extensions → Trigger Email → **Logs**
2. Recent log: `Email sent to <recipient>`
3. The `mail/{id}` doc gets a `delivery` field auto-added by the
   extension showing `state: 'SUCCESS'` + `info.messageId`

If the doc shows `state: 'ERROR'`, common Microsoft 365 SMTP errors:
- `535 5.7.139 Authentication unsuccessful` — SMTP AUTH disabled
  (revisit step 2) OR app password wrong
- `554 5.4.1 Recipient address rejected` — Tenant policy blocking
  external send (contact IT)
- `550 5.7.708 Service unavailable` — Hit per-mailbox rate limit
  (30/min, 10,000/day). Unlikely at v1.8 volumes.
- `421 4.4.62 Mail sent to the wrong Office 365 region` — Use
  `smtp.office365.com` (not the regional variant)

### 8. Optional — verify deliverability with MXToolbox

1. After the smoke-test arrives, open the email's "View original" /
   "Show source" in the recipient's mail client
2. Look for these headers:
   - `Authentication-Results: ... dkim=pass`
   - `Authentication-Results: ... spf=pass`
   - `Authentication-Results: ... dmarc=pass` (if DMARC configured)
3. All three pass = great deliverability, customers will reliably
   receive quotes in their inbox (not spam)

---

## What to share back to me

After the smoke-test passes, paste back the `delivery` field from the
Firestore doc (with the API key/password REDACTED if visible):

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

Plus a one-line confirmation:
- `from:` value seen in the recipient inbox: ___________
- DKIM/SPF/DMARC status from the email headers: ___________

Once I see that, 1.2.4 build is unblocked.

---

## Out of scope for v1.8

- ❌ Multi-mailbox sending (each salesperson appears as themselves) —
  needs Microsoft Graph API (OAuth + Application permissions). Defer
  to v1.9.
- ❌ Email open / click tracking — Microsoft 365 SMTP doesn't expose
  webhooks. Defer.
- ❌ Reply-tracking (customer replies → quote thread) — defer.
- ❌ High-volume scenarios beyond 10,000/day per mailbox — switch to
  Azure Communication Services Email or High Volume Email (HVE) when
  needed.

---

## Fallback if SMTP AUTH is blocked at the org level

If NSM's security policy hard-blocks SMTP AUTH (some financial /
healthcare tenants do this), we have two options:

1. **Microsoft Graph API + custom Cloud Function** — adds ~1-2 days
   of v1.8 scope. OAuth-based. NSM IT approves a Mail.Send permission
   on an Azure AD app registration.
2. **SendGrid free tier** — original plan. Independent of NSM stack.
   Less ideal (replies don't land in NSM inboxes naturally) but works
   regardless of M365 settings.

We'd switch via a config change in the Trigger Email extension's SMTP
URI; the v1.8 application code doesn't change either way.
