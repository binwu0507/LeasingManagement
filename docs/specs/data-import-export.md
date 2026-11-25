# Spec: Download and upload of properties, tenants and admin lists

Status: **Draft 2026-11-25.** Nothing is implemented. Section 2 states the intent as given by the owner;
sections 3 to 8 are proposed and open to change; section 9 lists the questions to settle before coding.

## 1. Problem

Entering houses and tenants one dialog at a time is tedious, and a customer who already keeps this
information elsewhere (or just prefers a spreadsheet) has no way to bring it in or to edit many records at
once. The only existing file output is the yearly Excel report (`excel.js`), which is read-only.

## 2. Intent (from the owner)

1. The user can **download** these entity types as **Excel (.xlsx) or JSON**:
   - **properties** (the houses);
   - **tenants**;
   - **admin entities** (the admin-managed lists, see 3.1).
2. The customer edits the file (assets and configuration) in a spreadsheet or text editor.
3. The user **uploads** the file and the application **populates** those records from it.
4. **Uploaded data carries no relationships.** A file never says which tenant is on which lease or which lease
   belongs to which house. The user sets those up in the application afterwards; that is the user's
   responsibility, and the import neither guesses nor creates links.

## 3. Scope

### 3.1 In scope

| Entity | Table | Fields in the file |
|---|---|---|
| Properties | `properties` | `address`, `city`, `state`, `zip`, `bedrooms`, `bathrooms`, `sqft`, `purchaseDate` (the house fields, `PROPERTY_FIELDS` in store.js) |
| Tenants | `tenants` | `firstName`, `lastName`, `gender`, `ssn`, `dateOfBirth`, `phone`, `email`, `licenseNumber`, `licenseState`, `licenseIssueDate`, `licenseExpireDate` (`TENANT_FIELDS`) |
| Document types | `document_types` | `name` |
| Receiving banks | `receiving_banks` | `name` |
| Payment methods | `payment_methods` | `name` |
| Special income categories | `special_categories` | `name` |

The four admin lists are the lists on the Admin screens (`documentTypes` and `lookups` in the preload).

### 3.2 Out of scope

- **Leases, lease-tenant links (`lease_tenants`, `occupying`), payments, deposits, special income items,
  lease documents and the files stored in them.** All are relationships or BLOBs; per 2.4 they are never
  exported or imported.
- **Yearly figures** (`property_years`: rent, tax, HOA, mortgage, insurance, interest) and **repair items.**
  They hang off a house and a year, which is a relationship. See open question 9.1.
- **Email settings** (`mail-settings.json`). They hold an encrypted app password that is tied to the Windows
  user account and must not appear in a file.
- Deleting anything through a file (see 5.4), importing a whole database, scheduled or automatic sync.

## 4. File formats

### 4.1 Excel (.xlsx)

One workbook, one sheet per entity: `Properties`, `Tenants`, `Document Types`, `Receiving Banks`,
`Payment Methods`, `Special Categories`.

- Row 1 is the header, using the **field names above in English** whatever the UI language, so a file edited
  by a customer works on any install. Each following row is one record.
- A first sheet `Read me` explains the columns, which are required, the allowed values (for example gender)
  and the date format. The importer ignores it.
- Text-like values are written as **text cells**, never numbers: `zip`, `ssn`, `phone`, `licenseNumber`
  (leading zeros and formats must survive Excel's auto-conversion). Dates are written as `YYYY-MM-DD` text.
- The importer also accepts what Excel produces when the customer saves the file: shared strings, inline
  strings, numeric cells and **Excel date serial numbers** in date columns (converted to `YYYY-MM-DD`), and a
  number in a text column such as `zip` (converted back to text; leading zeros that Excel already dropped
  cannot be recovered, so the `zip` column is exported as text to prevent it).
- Sheets that are missing are skipped (the customer may keep only `Tenants`). Extra sheets are ignored.
  Unknown columns are ignored with a warning; a missing **required** column is an error for that sheet.
- Only the first row is the header; completely blank rows are skipped. Formulas are read as their cached
  value.

### 4.2 JSON

```json
{
  "format": "leasing-management-export",
  "version": 1,
  "exportedAt": "2026-11-25T10:00:00.000Z",
  "properties": [
    { "address": "12 Oak St", "city": "Springfield", "state": "IL", "zip": "62701",
      "bedrooms": 3, "bathrooms": 2, "sqft": 1450, "purchaseDate": "2020-06-15" }
  ],
  "tenants": [ { "firstName": "Pat", "lastName": "Sample", "ssn": "123-45-6789", "...": "..." } ],
  "documentTypes": ["Residential Lease Agreement", "Addendum"],
  "receivingBanks": ["First Example Bank"],
  "paymentMethods": ["Check", "Zelle"],
  "specialCategories": ["Late Fee"]
}
```

- Any subset of the entity keys may be present. `format` and `version` are required; an unknown `version` is
  refused with a clear message. Unknown keys are ignored with a warning.
- Missing optional fields are the same as blank. Numbers may be JSON numbers or numeric strings.
- The four lists are plain arrays of names.
- There are **no ids and no cross-references** anywhere in the file (2.4).

### 4.3 Shared value rules

- Empty string, `null` and a missing key all mean "blank".
- Leading and trailing spaces are trimmed (the existing validators already do this).
- The importer accepts the formats the validators accept (an SSN with or without dashes, a phone with
  punctuation) and **stores the normalized form**, exactly like entering it in the dialog.

## 5. Behaviour

### 5.1 Download

- Admin screen gets an **Import / Export** card (Properties, Tenants and each admin list are checkboxes, plus
  a format choice Excel or JSON, plus **Download**). The native save dialog is opened by the main process.
- **Download blank template** writes the same workbook (or JSON) with headers, the `Read me` sheet and no
  rows, for a customer who is starting from nothing.
- The exported tenant file contains SSNs, license numbers, dates of birth, phones and emails in plain text.
  The save dialog is preceded by a confirmation: "This file contains tenant SSNs and driver's license
  numbers. Keep it somewhere safe and delete it when you are done." The app never writes it anywhere except
  the location the user picks, and never logs its content (CLAUDE.md data-safety rule).
- Rows are sorted the way the screens sort them (houses and tenants by name, lists by name).

### 5.2 Upload

Two steps, so nothing changes before the user has seen the result:

1. **Choose file** (open dialog; .xlsx or .json). The main process parses it and validates **every row**
   with the same functions the dialogs use (`validateHouse`, `validateTenant`, `cleanLookupName`), so no rule
   is duplicated. It returns a **preview**: per entity, counts of *new*, *will update*, *unchanged* and
   *errors*, the first rows of each, and every error as "Sheet, row N: message".
2. **Import** applies the previewed file. **Cancel** discards it. The parsed file is held by the main process
   between the two steps (the renderer holds no data), is dropped after Import or Cancel, and is re-checked
   against the database when applied.

### 5.3 Matching: new or existing

A row is matched to an existing record by its natural key, never by an id:

| Entity | Key | Same as the existing rules |
|---|---|---|
| Property | `address` + `city` + `zip`, case-insensitive, blank zip = "" | `houseClash` / unique index on `properties` |
| Tenant | `ssn` after normalization | `tenants.ssn UNIQUE` |
| Admin lists | `name`, case-insensitive | `UNIQUE COLLATE NOCASE` |

- **No match -> add.**
- **Match -> update** the existing record with the non-blank cells of the row; **blank cells never erase** an
  existing value (a customer who leaves a column empty has not asked to clear it). A row identical to the
  stored record counts as *unchanged*. The preview lists updates separately so the user sees which existing
  records will change, and the dialog offers **Add only (skip existing)** as an alternative to **Add and
  update**.
- Admin lists have only a name, so a match is always *unchanged*.
- Two rows in the same file with the same key are an error on the later row (it says which row it repeats).
- Tenants: the dialog's softer match on phone or email (`findTenantMatches`) is **not** used; only the SSN
  decides, and rows that only share a phone or email are added. The preview shows a warning for them.

### 5.4 Nothing is ever deleted

Records missing from the file are left alone, and the file cannot remove or rename anything. Because the key
includes the address (or SSN), **editing the address of a house in the file creates a new house** rather than
renaming the old one. Renaming stays in the app. The `Read me` sheet and the import preview both say this.

### 5.5 Errors and atomicity

- Import is **all or nothing**: it runs in one transaction, and if the preview shows any error the Import
  button is disabled until the file is fixed and chosen again. The error list can be copied. (Open question
  9.2 asks whether skipping bad rows should be allowed instead.)
- An unreadable file, a wrong format or a file over the size limit (10 MB; a customer's list is far smaller)
  fails at step 1 with a message and changes nothing.
- The result after Import is a summary ("12 properties added, 2 updated; 5 tenants added") shown as a toast,
  and the lists reload as after any other change (`refresh` in `App.jsx`).

### 5.6 After the import: setting up relationships

The imported houses and tenants simply appear in the existing screens. The user then creates leases and
adds tenants to them as today (`PickTenantDialog`). The import summary ends with a pointer ("Add leases to
connect tenants to houses") and nothing else is created. Houses are not added to any year by an import;
that stays the job of **Add to year** (CLAUDE.md rule: houses can only be added to years on or after their
purchase date, which the import therefore does not need to check).

## 6. Code layers

No schema change, so no migration and no `SCHEMA_VERSION` bump.

1. **`src/main/store.js`** (the only module that touches data):
   - `previewImport(entities)` -> per-row classification (add / update / unchanged / error) using the
     existing validators and key lookups;
   - `applyImport(entities, { updateExisting })` -> one transaction that re-runs the classification and
     writes. Reuses `addProperty`/`updateProperty` internals, `addTenant`/`updateTenant` internals and
     `addLookup` logic so there is a single source of validation. A blank-keeps-existing merge helper is new.
   - `exportEntities(kinds)` -> plain objects for the chosen kinds.
2. **`src/main/transfer.js`** (new, no database access): builds the JSON and workbook from `exportEntities`
   output, and parses an uploaded .json or .xlsx into the neutral shape `previewImport` takes.
   - Writing xlsx reuses `buildXlsx` and `buildZip` from `excel.js` / `zip.js`.
   - **Reading xlsx** needs an unzip step and an XML reader. The app has no dependency for this today
     (`excel.js` writes the xlsx by hand). Proposal: a small reader (`xlsxRead.js`) using Node's built-in
     `zlib` for the zip entries and a minimal parser for `workbook.xml`, `sharedStrings.xml` and the sheet
     XML, in keeping with the "no native or extra module" approach. Open question 9.3 asks whether to add a
     library instead.
3. **`src/main/index.js`**: channels `transfer:export` (kinds, format; opens the save dialog),
   `transfer:template`, `transfer:chooseFile` (opens the dialog, parses, returns the preview) and
   `transfer:apply` / `transfer:cancel`, each wrapped in `respond()`.
4. **`src/preload/index.js`**: a new `window.api.transfer` group with the same methods. Every new channel is
   added in both `index.js` and the preload.
5. **Renderer**: an `ImportExport` card in the Admin area and an `ImportPreviewDialog`. Text in English with
   Chinese translations in `i18n.jsx`.

## 7. Security and data safety

- Real tenant SSNs and license numbers are in the exported file; see 5.1 for the warning. The importer never
  prints rows to the console or a log; error messages name the sheet, row and field but **not the value** of
  an SSN or license number.
- Imports from an untrusted file must not be able to do more than create or update rows of the six entities:
  the parser reads only the sheets and keys listed in 4, never evaluates formulas or macros, ignores
  `.xlsm` content, and caps the size and the row count (50,000 rows per sheet).
- The automatic backup exists only for migrations; this feature adds none. The import is one transaction, so
  a failure leaves the data untouched, and the confirmation dialog suggests backing up the database first.

## 8. Tests (`test/transfer.test.mjs`, made-up data, `store.init(':memory:')`)

- Export: each entity round-trips (export -> parse -> preview shows all rows *unchanged*), in JSON and in
  xlsx; leading-zero zip, dashed SSN and phone formatting survive.
- Preview and apply: new rows added; matching house (case-insensitive, blank zip) and matching SSN updated;
  blank cell keeps the stored value; admin list duplicates ignored case-insensitively.
- Validation: each existing rule (missing address, bad SSN, bad phone, bad date, license expiry before issue,
  negative bedrooms) is reported with sheet and row; a duplicate key inside the file is an error; any error
  blocks apply and leaves the database unchanged (all or nothing).
- Add only vs add and update.
- No relationships: importing creates no lease, `lease_tenants`, year or payment rows; a tenant on a lease
  can still be updated by SSN but is never deleted; records absent from the file survive.
- Parser: Excel-saved workbook with shared strings and date serials; missing sheet; missing required column;
  unknown column warning; unknown JSON `version`; oversized or corrupt file.

## 9. Open questions

1. **Yearly figures.** Should a `Property Years` sheet (address + year -> rent, tax, HOA, mortgage,
   insurance, interest) be included? It is the most tedious data to type, but it is a house-to-year
   relationship and 2.4 says relationships are the user's job. Proposed: leave it out of version 1.
2. **Bad rows.** Reject the whole file on any error (proposed, simplest and predictable), or import the valid
   rows and report the rest?
3. **xlsx reading.** Hand-written reader on `zlib` (proposed, consistent with `excel.js`, no dependency) or add
   a library such as `exceljs` or `xlsx`?
4. **Renaming.** Matching by address and SSN means a changed address creates a second house. Acceptable, or
   should the export carry an `id` column that the importer uses first (the file would then only be valid for
   the database it came from)?
5. **Update semantics.** Is "blank keeps the existing value" right, or should a blank cell clear an optional
   field?
6. **Tenant matching.** Match by SSN only (proposed), or also treat a phone or email match as the same person?
