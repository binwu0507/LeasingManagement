# Spec: Early lease termination

Status: **Implemented 2026-11-24** (schema v27; backend and unit tests done, UI built but not yet checked by hand in the running app)

This is the guideline for handling early termination when the code is written. Only section 2 is agreed (termination model 2.13 and 2.14, special income 2.15).
Section 3 is proposed and open to change. Do not treat section 3 as decided, and resolve section 4 with the
owner before implementing.

## 1. Problem

Rent, late-rent detection, proration, vacancy status and the lease-overlap rule all use the lease
`startDate` / `endDate` (`store.js`: `assertMonthInLease`, `latePayments`, `listProperties`, overlap checks).
`moveInDate` / `moveOutDate` exist on `leases` but are display-only (the lease dialog prefills them from the
lease dates).

When a tenant leaves early this causes:

- false late-rent flags and reminder emails for months after the tenant has gone;
- the house showing as occupied (not Vacant) until the original end date;
- the next tenant's lease being blocked by the overlap rule (the only workaround is to edit the old lease's
  end date, which falsifies the contract record);
- wrong proration.

Move-out date alone cannot simply become the payment baseline, because a tenant who leaves early may still owe
money (see 2.1).

## 2. Agreed

1. Early termination has two cases:
   - **Unconditional agreement:** the landlord agrees to end the lease early; **no charge**. That is all it
     means; no reason or other detail needs to be recorded.
   - **Charged:** the tenant pays an **early termination charge** (typically 2 months' rent). The **amount is
     entered by the user**, not calculated by the app.
2. In both cases, the lease **end date is no longer the criterion for checking overlap**; the **move-out date**
   is.
3. Rent stops at the move-out date. This is the **actual** move-out date. There is no separate "agreed
   move-out date" or "termination effective date"; the one move-out date field is sufficient.
4. The original lease end date stays on the record; it is not overwritten.
5. The early termination charge has **no due date**, only a **payment date** (when it is received). Because it
   has no due date it can never be late or outstanding, and the late-payment check ignores it.
6. The charge is categorized as **special income**, not rent.
7. Late move-in is not an issue and needs no handling: from the lease start date the house is under the
   tenant's control, so rent and overlap start at the lease **start date** regardless of the move-in date. The
   move-in date stays informational.
8. Date validation: add a check that the move-in date must be **on or later than the lease start date** (not
   enforced by the code today). This is an addition; it does not replace other date validation. The existing
   check that move-out is not before move-in stays, and the **move-out date cannot be later than the lease
   end date** (holdover is out of scope).
9. The charge belongs to the **property-year** of its **payment date** (the property of the lease, the year
   of the date it is received), regardless of the month or year the lease ends.
10. **Special income** is a lease-level concept. Its items are **associated with a lease**, recorded like the
    security deposit receive and return are. These items are **income only** (no cost direction; repair costs
    stay in repairs) and **sum up to the special income** of the property-year (by payment date, see 9). The
    early termination charge is one such item. Others are possible, for example a one-time pet charge for the
    lease, or a late fee. Recurring charges are not special items.
11. Special income is **separate from the existing incomes and costs** (rent, repairs, tax, HOA, mortgage,
    insurance, interest). Those have nothing to do with special income: they never feed into it, and special
    items are never counted as rent or as a repair.
12. Special income **includes the security deposit: deposit received minus deposit returned**. The received
    amount counts in the property-year of its payment date, the returned amount reduces special income in the
    property-year of its returned date (the same dating the payments list already uses for deposits), so the
    figure of a single year can be negative when a deposit received in an earlier year is returned in it.
13. **Termination model (agreed 2026-11-24, replaces the earlier terminationType/terminationCharge proposal).**
    The lease stores only an explicit **early termination flag** (yes/no) besides `moveOutDate`. There is no
    termination type and no charge field on the lease.
    - The flag is **set automatically** when a move-out date before the lease end date is saved, and cleared when
      the move-out date is changed back to the end date or later (or removed).
    - The migration leaves every existing lease **unflagged**, so old display-only move-out dates change nothing
      until the user edits them.
    - Effective end date = `moveOutDate` if the flag is on, else `endDate`.
    - The charge is recorded **only as a special item in the payments dialog** (category "Early Termination
      Charge", payment date, user-entered amount). "Agreed" vs "Charged" is derived: Charged if such an item
      exists, otherwise Agreed.
    - **One charge, only on an early-terminated lease.** A lease has at most one Early Termination Charge, and
      it can only be recorded while the lease is flagged.
    - **Removing the early move-out** (move-out set back to the end date or cleared) while a charge exists: the
      lease dialog asks to confirm deleting the charge; if declined, the save is refused. store.js refuses the
      change unless the caller confirms (`deleteTerminationCharge`). Other special items are kept.
14. **Prompting for the charge:** (shown only when the lease has no charge yet)
    - On saving a lease whose flag has just turned on: "Lease ends early on <date>. Was an early termination
      charge paid?" with **Record charge** (opens the payments dialog on a new special item: category Early
      Termination Charge, payment date defaulting to the move-out date, amount blank) and **No charge / later**.
    - The payments dialog shows a banner "Early termination, no charge recorded" with an **Add charge** button
      while the lease is flagged and has no such item.
    - The lease list shows a badge: "Early termination, no charge" or "Early termination, charge $X"; clicking
      it opens the payments dialog.
    - "No charge" and "not entered yet" are not distinguished (no stored "no charge" value).

15. **Special income decisions (agreed 2026-11-24):**
    - **Derived, not stored:** special income of a property-year is a sum over lease payments of the new type
      `Special` by payment date (plus the deposit figure in 2.12); no column on `property_years`.
    - **Income only:** special items are positive income. No Income/Cost direction. The only reduction is the
      deposit return (2.12).
    - **Late fee:** special income includes late fees, but the app does not calculate them. The user enters
      one by hand as a special item with the category Late Fee.
    - **Net income:** special income is its own line in `finance.js`, the reports and the Excel export, added to
      net income, never counted as rent or repairs (2.11).
    - **Categories:** an admin-managed list like document types and payment methods, seeded with Early
      Termination Charge, Pet Charge, Late Fee and Other.
    - **Payment date in a year the house has not been added to:** save with a warning; it is counted once the
      house is added to that year.
    - **Tenant owes more than the charge:** no special handling; record separate special items or deduct from
      the deposit manually.

## 3. Proposed (not yet agreed)

Starting point for the design. Each item may change.

### 3.1 Data model

New migration step on `leases` (bump `SCHEMA_VERSION`, never edit earlier steps):

| Field | Type | Notes |
|---|---|---|
| `earlyTermination` | INTEGER NOT NULL DEFAULT 0 | Agreed in 2.13. CHECK in (0,1). Existing rows stay 0. Set by store.js on save. |

"Effective end date" = `moveOutDate` if `earlyTermination` = 1, else `endDate` (agreed in 2.13).

Special items (agreed in 2.10: tied to a lease, like the deposit) are recorded with their payment date. Because
the early termination charge is only one of several possible items, prefer one general kind of lease payment
over a fixed `'Early Termination Fee'` type:

- add payment type `'Special'` to `lease_payments` (the CHECK on `paymentType` needs a table rebuild like
  migration step 23);
- a category on each special item (early termination charge, pet charge, ...), probably an admin-managed list
  like `document_types` and `payment_methods`, with "Early Termination Charge" present by default;
- no `forMonth`, not rent; `amount` is a positive income (2.15).

The charge is recorded only from the payments dialog (agreed, 2.13); the lease dialog has no charge field.

### 3.2 Validation

- store.js derives `earlyTermination` on every lease save: 1 if `moveOutDate` < `endDate`, else 0 (agreed, 2.13).
  The renderer cannot set it directly.
- Existing checks stay: move-out not before move-in, move-out not after the end date, move-in not before the
  start date (2.8).

### 3.3 Behaviour

- Overlap checks (property leases and tenant leases) use the effective end date, so a new lease can start the
  day after move-out.
- Vacancy, rent due, proration and late detection stop at the effective end date.
- Recording rent outside the effective window warns instead of blocking.
- A terminated lease never shows "Expiring"; Renew uses the effective end date.
- Special income of a property-year = special items by payment date + deposits received (by payment date)
  - deposits returned (by returned date) (agreed, 2.10 and 2.12). It is not added to yearly rent
  (`syncYearRent` sums only `Rent` payments).
- Deducting the charge from the security deposit stays manual.

### 3.4 UI

- Lease dialog: no termination section; a move-out date before the end date turns the flag on at save, then the
  prompt in 2.14 appears.
- Lease list badge and payments dialog banner as in 2.14.
- New text in English with Chinese translations (`i18n.jsx`).

### 3.5 Code layers

`store.js` (migration, validation, one effective-date helper used by overlap, vacancy, late detection and
proration), `index.js` and `preload/index.js` only if a new channel is needed, renderer (`LeaseDialog`,
`ManageLeaseDialog`, `PaymentsDialog`, `YearSelect`), `report.js`, `excel.js`, `i18n.jsx`.

### 3.6 Tests (`test/*.test.mjs`, made-up data)

Migration keeps existing leases unchanged; each validation rule; a new lease starting the day after move-out is
accepted and one on or before it is rejected (property and tenant overlap); no late flag after the effective
end; special items (charge, one-time pet charge, late fee) sum to the property-year's special income by payment date, are not rent, and are never flagged late; proration in the move-out month; vacancy after early move-out.

## 4. Open questions

None. All earlier open questions are settled in 2.13 to 2.15. Remaining detail (exact line names in reports and
Excel, seeded category wording) is decided while implementing.

## 5. Implementation guidance

When asked to implement: re-confirm section 2 is still current, settle the section 4 questions with the owner,
update this file first, then change code and add the tests in 3.6. Keep to the migration rules in CLAUDE.md.
