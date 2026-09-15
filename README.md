# APEX DMS — web edition

A React + Vite + TypeScript port of the legacy WinForms app (`LegacyDMS`, .NET Framework,
~2,600 lines of C#). Same business — customers, parts inventory, invoicing, users — with the
behaviour in `BUSINESS_RULES.md` as the specification.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 41 golden tests over the business rules
npm run build   # typecheck + production bundle
```

Sign in with **ADMIN / admin**. Other seeded accounts: `MARGE / marge2006` (MANAGER),
`COUNTER1 / counter1` (CLERK), `COUNTER2 / 1234` (CLERK). `RICK` is deactivated and cannot
sign in. Passwords are case-sensitive.

Data lives in this browser's `localStorage`. **Dashboard → Reset to seed data** is the
equivalent of deleting the legacy `Data` folder; **Export CSV files** writes the five legacy
files (plus `audit.csv`).

---

## How it maps to the legacy app

| Legacy | Here |
|---|---|
| `frmLogin.cs` | `pages/LoginPage.tsx` + `domain/auth.ts` |
| `frmMain.cs` | `pages/DashboardPage.tsx` |
| `frmCustomers.cs` | `pages/CustomersPage.tsx` |
| `frmInventory.cs` | `pages/InventoryPage.tsx` |
| `frmInvoice.cs` | `pages/NewInvoicePage.tsx` |
| `frmInvoiceList.cs` | `pages/InvoiceHistoryPage.tsx` |
| `frmUsers.cs` | `pages/UsersPage.tsx` |
| — | `pages/AuditPage.tsx` (new — §9 requires late fees be traceable) |
| `DataManager.cs` (`ArrayList` of `string[]`) | `domain/types.ts` + `data/repository.ts` |
| `Globals.cs` (`TAX_RATE`, mutable statics) | `domain/pricing.ts` constants + `state/store.tsx` |
| pricing inline in button handlers | `domain/pricing.ts`, `domain/invoiceService.ts` |
| `if (role == "CLERK")` scattered over 4 forms | `domain/permissions.ts` — one matrix |

### Architecture

- **`src/domain/`** — the business. Pure functions, no React, no I/O. `pricing.ts` owns every
  rate and every rounding step; `invoiceService.ts` owns the invoice lifecycle;
  `masterData.ts` owns customer/part/user maintenance; `permissions.ts` owns §10.
- **`src/data/`** — seed data and persistence, including CSV export.
- **`src/state/store.tsx`** — one context holding the whole `AppData` document plus the
  session. Screens call a service, get a new `AppData` back, and commit it.
- **`src/pages/`, `src/components/`** — presentation only.

Every service is `(AppData, Session, input) → Result`, so an operation either lands whole or
does not happen. The legacy save cut stock, then adjusted the balance, then appended the
invoice, with early `return`s in between — a failed credit check after the stock update left
inventory wrong.

---

## What the legacy code got wrong

`BUSINESS_RULES.md` says "where the code and this document disagree, one of them is wrong —
deciding which is part of your job." These are the disagreements found while porting. In every
case the document was treated as correct; each one is pinned by a test.

### Money

1. **The 10% volume discount was dead code.** `frmInvoice.cs:296` tested `sub > 500` before
   `sub > 1000`, so a $1,200 order got 5%, never 10%. Every order over $1,000 was undercharged.
2. **Save and display disagreed about WHOLESALE.** `RecalcTotals` skipped the volume discount
   for wholesale customers (correct, §6.1), but `btnSave_Click:372` re-derived the discount
   *without* the customer-type check. The screen showed one total and the invoice stored another.
3. **The customer balance was missing the fuel surcharge.** `btnSave_Click:438` posted
   `sub - disc + tax`. §4.1 says the full total. Every FLUIDS ticket under-billed the account by
   3%, which is why balances drifted from the invoice book.
4. **Reprint invented its own numbers.** `frmInvoiceList.cs:197` recomputed the total from the
   lines at **8.5%** tax — a rate that exists nowhere else — and ignored the discount, the
   surcharge and the tax exemption. A reprint is a copy (§4.4), so this version renders the
   stored amounts and never recalculates.
5. **FLEET's floor was cost, not cost + 10%.** `frmInvoice.cs:218` used `p[4]` (cost) as the
   floor. §5.3 says cost × 1.10, so thin-margin parts were being sold at zero margin.
6. **Mark Paid could be applied repeatedly.** No status guard, so each click subtracted the
   total from the balance again and charged another late fee. Now it is refused once PAID.

### Data integrity

7. **Deleting an invoice left the damage behind.** `btnDeleteInv_Click` removed the invoice row
   only — `// TODO: should probably also remove the lines?? seems to work fine without - DH 2015`.
   The lines, the balance and the consumed stock all stayed. Deletion now reverses all of it.
8. **IDs were reused.** Both `C-` and `INV-` numbers came from `max(existing) + 1`, so deleting
   the newest record handed its ID to the next one — exactly what §2 says must never happen.
   Replaced with monotonic counters that never go backwards.
9. **Stock could go negative.** Nothing checked on-hand before selling. Now refused, and
   repeated lines for one part are checked against a single on-hand figure.
10. **Duplicate part numbers were allowed** —
    `// no duplicate check needed, guys know not to reuse part numbers - TW`.
11. **The inventory search hid most matches.** `frmInventory.cs:195` read
    `partNo.IndexOf(f) < 0 || desc.IndexOf(f) < 0 && cat.IndexOf(f) < 0`. With C#'s `&&`/`||`
    precedence, searching a description only worked if the part number matched too. §3 wants
    any of the three.
12. **CSV was corrupted by its own data.** Values were comma-joined with no quoting, and
    `Utils.Clean` stripped commas out of names to compensate — so "Miller, Sons" silently
    became "Miller  Sons", and any un-cleaned field shifted every column after it. Reads
    swallowed all exceptions and carried on with whatever loaded. Now: validated JSON as the
    store of record, RFC-4180 quoting on export, and bad stored data is quarantined rather than
    half-loaded.
13. **The balance was a free-text box.** Customers could be given any balance by typing in it.
    §2 makes it derived, so it is now read-only, and the dashboard runs the §2 integrity check
    (balance == open invoice totals + late fees) and reports any account that drifts.

### Security and permissions

14. **A hardcoded vendor backdoor** — `SUPPORT` / `apex!` granted ADMIN
    (`// DO NOT REMOVE!! - RK 2007`). Removed.
15. **Passwords were compared case-insensitively.** `usr[1].ToUpper() == p.ToUpper()`, so
    `MARGE2006` opened Marge's account. §10 says case-sensitive.
16. **Deactivated accounts could still log in** —
    `// TODO: check the active flag here??`. `RICK` (inactive ADMIN) was a live account.
17. **Passwords were displayed in a grid column** and written to `users.csv` in the clear. Now
    write-only: not shown, not read back into the form, not exported. (This is still plaintext
    in storage — a real fix needs server-side hashing, which is out of scope for a local app;
    it is the one item here that is mitigated rather than solved.)
18. **Clerks could delete invoices, managers could too.** `frmInvoiceList` had no role check at
    all. §10 makes invoice deletion ADMIN-only.
19. **Managers could reach user maintenance.** `frmMain.cs:83` hid the Users button only from
    `CLERK`. §10 says ADMIN only — and the form itself had no check, so hiding the button was
    the whole defence.
20. **Credit overrides were never recorded** —
    `// TODO: actually log the override somewhere - DH`. §8 requires it. Overrides, permission
    refusals, stock movements, price changes, balance changes and auth events now all land in
    an append-only audit log.
21. **Permission checks were inconsistent per screen.** Customers hid the Delete button;
    Inventory showed its buttons and refused on click; Invoice History did not check at all.
    §10 wants consistency, so everything reads one matrix, and the service layer refuses
    independently of what the UI shows.

### Crashes

22. `int.Parse(txtQty.Text)` in `frmInvoice.cs:198` and `frmInventory.cs:347` threw an unhandled
    exception on empty or non-numeric input.
23. **Prices were not re-derived when the customer changed.** §5 locks prices to the customer on
    the invoice; the legacy screen priced each line as it was added and left it alone. Here the
    lines are derived from the draft, so changing the customer re-prices the whole ticket.

### Deliberately kept

- The 8% tax rate, the $10 electrical core charge, the 3% fuel surcharge and the 1.5%/month
  late fee are all as documented — including `Globals.TAX_RATE`'s
  `// check with accounting, might be 8.5 now??`, which the document settles at 8% (§7).
- Late-fee months are whole 30-day periods (`days / 30`), matching both the legacy code and §9.
- Tax-exempt customers are data, not code: Hendricks Farm Supply and Vandermeer Dairy carry the
  flag, as in the legacy seed.

### One intentional format change

`users.csv` no longer has a `Password` column. `DataManager.cs` opens with *"DO NOT CHANGE THE
FILE FORMATS!!! the nightly export job on APEXSRV02 parses these files by column position"*,
and this breaks that contract — exporting every password in the clear is not worth preserving.
`invoices.csv` also gained `Discount`, `Surcharge` and `LateFee` columns (appended after the
existing ones, so position-based parsers reading the first seven fields still work), because
without them a reprint cannot be a faithful copy.
#   e p i c - d m s  
 