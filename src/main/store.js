// SQLite storage for properties (built-in node:sqlite, file in the app's userData folder).
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_VERSION = 17;
// Describe the house itself; stored once in `properties`.
const PROPERTY_FIELDS = ['address', 'city', 'state', 'zip', 'bedrooms', 'bathrooms', 'sqft', 'purchaseDate'];
// House fields as of schema v5 (used by the v5 migration, before purchaseDate existed).
const V5_PROPERTY_FIELDS = PROPERTY_FIELDS.filter((f) => f !== 'purchaseDate');
// Vary by year; stored per year in `property_years`.
const YEAR_FIELDS = ['monthlyRent', 'propertyTax', 'hoaFee', 'mortgage', 'insurance', 'mortgageInterest'];

// Joined view of one yearly record: `id` is the property_years id, `propertyId` the house.
const SELECT_RECORD = `
  SELECT y.id, y.propertyId, y.year, ${PROPERTY_FIELDS.map((f) => 'p.' + f).join(', ')},
         ${YEAR_FIELDS.map((f) => 'y.' + f).join(', ')},
         (SELECT SUM(r.amount) FROM repair_items r WHERE r.propertyYearId = y.id) AS repairCost
  FROM property_years y JOIN properties p ON p.id = y.propertyId`;

let db = null;

const isValidDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const dt = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Boolean(dt) && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3];
};

// Normalize and check the itemized repair list. Date and amount are required per item.
function cleanRepairItems(items) {
  if (items === undefined || items === null) {
    return [];
  }
  if (!Array.isArray(items)) {
    throw new Error('Repair items must be a list.');
  }
  return items.map((item, i) => {
    const n = i + 1;
    const it = item || {};
    const clean = {
      date: typeof it.date === 'string' ? it.date.trim() : '',
      amount: it.amount === '' || it.amount === null || it.amount === undefined ? NaN : Number(it.amount),
      contractor: typeof it.contractor === 'string' ? it.contractor.trim() : '',
      description: typeof it.description === 'string' ? it.description.trim() : ''
    };
    if (!isValidDate(clean.date)) {
      throw new Error(`Repair item ${n}: date must be a valid date.`);
    }
    if (!Number.isFinite(clean.amount) || clean.amount < 0) {
      throw new Error(`Repair item ${n}: amount must be a number, 0 or greater.`);
    }
    return clean;
  });
}

// Normalize and check a property's leasing contracts. Start/end dates and rent are required;
// move-in/move-out dates and tenant names are optional.
function cleanLeases(leases) {
  if (leases === undefined || leases === null) {
    return [];
  }
  if (!Array.isArray(leases)) {
    throw new Error('Leases must be a list.');
  }
  return leases.map((item, i) => {
    const n = i + 1;
    const it = item || {};
    const text = (v) => (typeof v === 'string' ? v.trim() : '');
    const clean = {
      startDate: text(it.startDate),
      endDate: text(it.endDate),
      monthlyRent: it.monthlyRent === '' || it.monthlyRent === null || it.monthlyRent === undefined
        ? NaN : Number(it.monthlyRent),
      moveInDate: text(it.moveInDate) || null,
      moveOutDate: text(it.moveOutDate) || null,
      // Tenants linked to this lease; `occupying` says whether they live in the house under it.
      tenants: []
    };
    const seen = new Set();
    for (const t of Array.isArray(it.tenants) ? it.tenants : []) {
      const tenantId = Number((t || {}).tenantId);
      if (!Number.isInteger(tenantId) || tenantId <= 0) {
        throw new Error(`Lease ${n}: invalid tenant.`);
      }
      if (!seen.has(tenantId)) {
        seen.add(tenantId);
        clean.tenants.push({ tenantId, occupying: Boolean(t.occupying) });
      }
    }
    if (!isValidDate(clean.startDate)) {
      throw new Error(`Lease ${n}: start date must be a valid date.`);
    }
    if (!isValidDate(clean.endDate)) {
      throw new Error(`Lease ${n}: end date must be a valid date.`);
    }
    if (clean.endDate < clean.startDate) {
      throw new Error(`Lease ${n}: end date cannot be before the start date.`);
    }
    if (!Number.isFinite(clean.monthlyRent) || clean.monthlyRent < 0) {
      throw new Error(`Lease ${n}: monthly rent must be a number, 0 or greater.`);
    }
    if (clean.moveInDate !== null && !isValidDate(clean.moveInDate)) {
      throw new Error(`Lease ${n}: move-in date must be a valid date (or left blank).`);
    }
    if (clean.moveOutDate !== null && !isValidDate(clean.moveOutDate)) {
      throw new Error(`Lease ${n}: move-out date must be a valid date (or left blank).`);
    }
    if (clean.moveInDate && clean.moveOutDate && clean.moveOutDate < clean.moveInDate) {
      throw new Error(`Lease ${n}: move-out date cannot be before the move-in date.`);
    }
    return clean;
  });
}

function validate(data) {
  const d = data || {};
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
  // Optional number: blank means "not provided" (null); otherwise it must be valid.
  const optNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

  const clean = {
    address: text(d.address),
    city: text(d.city),
    state: text(d.state),
    zip: text(d.zip),
    bedrooms: num(d.bedrooms),
    bathrooms: num(d.bathrooms),
    sqft: num(d.sqft),
    purchaseDate: text(d.purchaseDate) || null,   // YYYY-MM-DD (optional)
    monthlyRent: num(d.monthlyRent),
    propertyTax: num(d.propertyTax),    // per year (required)
    hoaFee: num(d.hoaFee),              // per month (required)
    mortgage: num(d.mortgage),          // per month (required)
    insurance: optNum(d.insurance),     // per year (optional)
    repairItems: cleanRepairItems(d.repairItems),   // itemized repairs (optional; total is derived)
    mortgageInterest: optNum(d.mortgageInterest) // per year (optional)
  };

  if (!clean.address) {
    throw new Error('Address is required.');
  }
  if (!clean.city) {
    throw new Error('City is required.');
  }
  if (clean.purchaseDate !== null) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean.purchaseDate);
    const dt = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (!dt || dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) {
      throw new Error('Purchase date must be a valid date (or left blank).');
    }
  }
  for (const [field, label] of [
    ['bedrooms', 'Bedrooms'],
    ['bathrooms', 'Bathrooms'],
    ['sqft', 'Square feet'],
    ['monthlyRent', 'Monthly rent'],
    ['propertyTax', 'Property tax'],
    ['hoaFee', 'HOA fee'],
    ['mortgage', 'Monthly mortgage']
  ]) {
    if (!Number.isFinite(clean[field]) || clean[field] < 0) {
      throw new Error(`${label} must be a number, 0 or greater.`);
    }
  }
  for (const [field, label] of [
    ['insurance', 'Insurance'],
    ['mortgageInterest', 'Mortgage interest']
  ]) {
    if (clean[field] !== null && (!Number.isFinite(clean[field]) || clean[field] < 0)) {
      throw new Error(`${label} must be a number, 0 or greater (or left blank).`);
    }
  }
  return clean;
}

// Open the database and create/migrate the schema.
function init() {
  if (db) {
    return;
  }
  db = new DatabaseSync(path.join(app.getPath('userData'), 'leasing.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  if (version >= 1 && version < SCHEMA_VERSION) {
    // Existing data is about to be migrated: keep a copy of the database as it was.
    const backup = path.join(app.getPath('userData'), `leasing.db.bak-v${version}`);
    if (!fs.existsSync(backup)) {
      db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
    }
  }
  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS properties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        state TEXT,
        zip TEXT,
        bedrooms REAL NOT NULL,
        bathrooms REAL NOT NULL,
        sqft REAL NOT NULL,
        monthlyRent REAL NOT NULL,
        propertyTax REAL NOT NULL,
        hoaFee REAL NOT NULL,
        mortgage REAL NOT NULL,
        insurance REAL,
        repairCost REAL
      );
    `);
  }
  if (version < 2) {
    // Records are organized by year. Existing rows move into the current year.
    const currentYear = new Date().getFullYear();
    db.exec(`
      CREATE TABLE IF NOT EXISTS years (year INTEGER PRIMARY KEY);
      ALTER TABLE properties ADD COLUMN year INTEGER NOT NULL DEFAULT ${currentYear};
      CREATE INDEX IF NOT EXISTS idx_properties_year ON properties (year);
      INSERT OR IGNORE INTO years (year) SELECT DISTINCT year FROM properties;
    `);
  }
  if (version < 3) {
    // propertyId ties together the yearly records of the same house.
    // Backfill: existing rows with the same address/city/zip share one propertyId.
    db.exec(`
      ALTER TABLE properties ADD COLUMN propertyId INTEGER;
      UPDATE properties SET propertyId = (
        SELECT MIN(p2.id) FROM properties p2
        WHERE lower(p2.address) = lower(properties.address)
          AND lower(p2.city) = lower(properties.city)
          AND lower(COALESCE(p2.zip, '')) = lower(COALESCE(properties.zip, ''))
      );
      CREATE INDEX IF NOT EXISTS idx_properties_propertyId ON properties (propertyId);
    `);
  }
  if (version < 4) {
    // Split the flat table: `properties` holds each house once, `property_years` holds its
    // yearly figures. Ids are preserved: properties.id = old propertyId, property_years.id = old id.
    // A house's descriptive fields come from its most recent year.
    db.exec('BEGIN');
    try {
      db.exec(`
        ALTER TABLE properties RENAME TO properties_old;
        CREATE TABLE properties (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          address TEXT NOT NULL,
          city TEXT NOT NULL,
          state TEXT,
          zip TEXT,
          bedrooms REAL NOT NULL,
          bathrooms REAL NOT NULL,
          sqft REAL NOT NULL
        );
        CREATE TABLE property_years (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          propertyId INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
          year INTEGER NOT NULL REFERENCES years(year),
          monthlyRent REAL NOT NULL,
          propertyTax REAL NOT NULL,
          hoaFee REAL NOT NULL,
          mortgage REAL NOT NULL,
          insurance REAL,
          repairCost REAL
        );
        INSERT INTO properties (id, address, city, state, zip, bedrooms, bathrooms, sqft)
          SELECT o.propertyId, o.address, o.city, o.state, o.zip, o.bedrooms, o.bathrooms, o.sqft
          FROM properties_old o
          WHERE o.id = (
            SELECT o2.id FROM properties_old o2
            WHERE o2.propertyId = o.propertyId ORDER BY o2.year DESC, o2.id DESC LIMIT 1
          );
        INSERT INTO property_years (id, propertyId, year, monthlyRent, propertyTax, hoaFee, mortgage, insurance, repairCost)
          SELECT id, propertyId, year, monthlyRent, propertyTax, hoaFee, mortgage, insurance, repairCost
          FROM properties_old;
        DROP TABLE properties_old;
        CREATE INDEX idx_property_years_year ON property_years (year);
        CREATE INDEX idx_property_years_property ON property_years (propertyId);
        CREATE INDEX idx_properties_address ON properties (lower(address), lower(city));
      `);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  if (version < 5) {
    migrateToV5();
  }
  if (version < 6) {
    db.exec('ALTER TABLE properties ADD COLUMN purchaseDate TEXT');
  }
  if (version < 7) {
    db.exec(`ALTER TABLE property_years ADD COLUMN mortgageInterest REAL
             CHECK (mortgageInterest IS NULL OR mortgageInterest >= 0)`);
  }
  if (version < 8) {
    migrateToV8();
  }
  if (version < 9) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS leases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        propertyId INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        monthlyRent REAL NOT NULL CHECK (monthlyRent >= 0),
        moveInDate TEXT,
        moveOutDate TEXT,
        tenantNames TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_leases_property ON leases (propertyId);
    `);
  }
  if (version < 10) {
    // Tenants are people (unique by SSN) linked to leases. The old free-text
    // leases.tenantNames column is left in place but no longer used.
    db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT NOT NULL CHECK (length(trim(firstName)) > 0),
        lastName TEXT NOT NULL CHECK (length(trim(lastName)) > 0),
        gender TEXT,
        ssn TEXT NOT NULL UNIQUE,
        dateOfBirth TEXT,
        phone TEXT,
        email TEXT
      );
      CREATE TABLE IF NOT EXISTS lease_tenants (
        leaseId INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
        tenantId INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        PRIMARY KEY (leaseId, tenantId)
      );
      CREATE INDEX IF NOT EXISTS idx_lease_tenants_tenant ON lease_tenants (tenantId);
    `);
  }
  if (version < 11) {
    // A tenant stays linked to the lease; `occupying` marks whether they live in the house under it.
    db.exec(`ALTER TABLE lease_tenants ADD COLUMN occupying INTEGER NOT NULL DEFAULT 1
             CHECK (occupying IN (0, 1))`);
  }
  if (version < 12) {
    // The signed residential lease agreement (one file per lease), stored inside the database.
    db.exec(`
      CREATE TABLE IF NOT EXISTS lease_agreements (
        leaseId INTEGER PRIMARY KEY REFERENCES leases(id) ON DELETE CASCADE,
        fileName TEXT NOT NULL,
        data BLOB NOT NULL
      );
    `);
  }
  if (version < 13) {
    // Any number of supporting documents per lease, stored inside the database.
    db.exec(`
      CREATE TABLE IF NOT EXISTS lease_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        leaseId INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
        fileName TEXT NOT NULL,
        data BLOB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lease_documents_lease ON lease_documents (leaseId);
    `);
  }
  if (version < 14) {
    // Previously uploaded lease agreements become ordinary leasing documents.
    db.exec(`
      INSERT INTO lease_documents (leaseId, fileName, data)
        SELECT leaseId, fileName, data FROM lease_agreements;
      DELETE FROM lease_agreements;
    `);
  }
  if (version < 15) {
    // Admin-managed list of leasing document types.
    db.exec(`
      CREATE TABLE IF NOT EXISTS document_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE
      );
      INSERT OR IGNORE INTO document_types (name) VALUES
        ('Residential Lease Agreement'), ('Addendum'), ('Move-in Inspection'), ('Other');
    `);
  }
  if (version < 16) {
    // Each leasing document has a type (kept as NULL if the type is later deleted).
    db.exec(`
      ALTER TABLE lease_documents ADD COLUMN typeId INTEGER REFERENCES document_types(id) ON DELETE SET NULL;
      UPDATE lease_documents SET typeId = (SELECT id FROM document_types WHERE name = 'Residential Lease Agreement');
    `);
  }
  if (version < 17) {
    // Driver's license details (all optional).
    db.exec(`
      ALTER TABLE tenants ADD COLUMN licenseNumber TEXT;
      ALTER TABLE tenants ADD COLUMN licenseState TEXT;
      ALTER TABLE tenants ADD COLUMN licenseIssueDate TEXT;
      ALTER TABLE tenants ADD COLUMN licenseExpireDate TEXT;
    `);
  }
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

const TENANT_FIELDS = ['firstName', 'lastName', 'gender', 'ssn', 'dateOfBirth', 'phone', 'email',
  'licenseNumber', 'licenseState', 'licenseIssueDate', 'licenseExpireDate'];
const GENDERS = ['Male', 'Female', 'Other'];

function validateTenant(data) {
  const d = data || {};
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const clean = {
    firstName: text(d.firstName),
    lastName: text(d.lastName),
    gender: text(d.gender) || null,
    ssn: text(d.ssn),
    dateOfBirth: text(d.dateOfBirth) || null,
    phone: text(d.phone) || null,
    email: text(d.email) || null,
    licenseNumber: text(d.licenseNumber) || null,
    licenseState: text(d.licenseState).toUpperCase() || null,
    licenseIssueDate: text(d.licenseIssueDate) || null,
    licenseExpireDate: text(d.licenseExpireDate) || null
  };
  if (!clean.firstName) {
    throw new Error('First name is required.');
  }
  if (!clean.lastName) {
    throw new Error('Last name is required.');
  }
  if (clean.gender !== null && !GENDERS.includes(clean.gender)) {
    throw new Error('Gender must be Male, Female or Other.');
  }
  const digits = clean.ssn.replace(/[\s-]/g, '');
  if (!/^\d{9}$/.test(digits)) {
    throw new Error('SSN must be 9 digits (e.g. 123-45-6789).');
  }
  clean.ssn = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  if (clean.phone !== null) {
    const p = clean.phone.replace(/\D/g, '');
    if (!/^\d{10}$/.test(p)) {
      throw new Error('Phone must be 10 digits (e.g. (555) 123-4567), or left blank.');
    }
    clean.phone = `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`;
  }
  if (clean.dateOfBirth !== null && !isValidDate(clean.dateOfBirth)) {
    throw new Error('Date of birth must be a valid date (or left blank).');
  }
  if (clean.email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) {
    throw new Error('Email must be a valid address (or left blank).');
  }
  if (clean.licenseNumber !== null && clean.licenseNumber.length > 30) {
    throw new Error("Driver's license number is too long (30 characters maximum).");
  }
  if (clean.licenseState !== null && !/^[A-Z]{2}$/.test(clean.licenseState)) {
    throw new Error("Driver's license state must be a 2-letter state code (or left blank).");
  }
  for (const [key, label] of [['licenseIssueDate', 'issue date'], ['licenseExpireDate', 'expiration date']]) {
    if (clean[key] !== null && !isValidDate(clean[key])) {
      throw new Error(`Driver's license ${label} must be a valid date (or left blank).`);
    }
  }
  if (clean.licenseIssueDate && clean.licenseExpireDate && clean.licenseExpireDate < clean.licenseIssueDate) {
    throw new Error("Driver's license expiration date cannot be before the issue date.");
  }
  return clean;
}

// Each tenant, with `activeLease` ({ address, city, startDate, endDate } or null): the lease
// linked to them whose term (inclusive) contains today.
// Every lease a tenant is linked to (newest first), with the property address and the names
// of all tenants on each lease.
function tenantLeaseHistory(tenantId) {
  const names = db.prepare(`
    SELECT t.firstName, t.lastName FROM lease_tenants lt JOIN tenants t ON t.id = lt.tenantId
    WHERE lt.leaseId = ? ORDER BY lower(t.lastName), lower(t.firstName), t.id
  `);
  return db.prepare(`
    SELECT l.id, l.startDate, l.endDate, l.monthlyRent, p.address, p.city
    FROM lease_tenants lt
    JOIN leases l ON l.id = lt.leaseId
    JOIN properties p ON p.id = l.propertyId
    WHERE lt.tenantId = ?
    ORDER BY l.startDate DESC, l.id DESC
  `).all(tenantId).map((l) => ({
    ...toPlain(l),
    tenantNames: names.all(l.id).map((n) => `${n.firstName} ${n.lastName}`)
  }));
}

function listTenants() {
  const t = new Date();
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const active = db.prepare(`
    SELECT p.address, p.city, p.purchaseDate, l.startDate, l.endDate
    FROM lease_tenants lt
    JOIN leases l ON l.id = lt.leaseId
    JOIN properties p ON p.id = l.propertyId
    WHERE lt.tenantId = ? AND l.startDate <= ? AND l.endDate >= ?
    ORDER BY l.startDate DESC LIMIT 1
  `);
  // `hasLease`: linked to any lease (past, current or future), so the record is real data worth keeping.
  return db.prepare(`SELECT id, ${TENANT_FIELDS.join(', ')},
      EXISTS (SELECT 1 FROM lease_tenants lt WHERE lt.tenantId = tenants.id) AS hasLease
    FROM tenants ORDER BY lower(lastName), lower(firstName), id`)
    .all().map((r) => {
      const lease = active.get(r.id, today, today);
      return { ...toPlain(r), hasLease: !!r.hasLease, activeLease: lease ? toPlain(lease) : null };
    });
}

// Only a tenant not linked to any lease can be deleted.
function deleteTenant(id) {
  if (!db.prepare('SELECT 1 FROM tenants WHERE id = ?').get(id)) {
    throw new Error('Tenant not found.');
  }
  if (db.prepare('SELECT 1 FROM lease_tenants WHERE tenantId = ?').get(id)) {
    throw new Error('This tenant is on a lease and cannot be deleted.');
  }
  db.prepare('DELETE FROM tenants WHERE id = ?').run(id);
}

// Existing tenants sharing the given SSN, phone or email (formatting ignored), each with the
// list of fields that matched. Used to ask whether a new tenant is really an existing person.
function findTenantMatches(data) {
  const d = data || {};
  const digits = (v) => (typeof v === 'string' ? v.replace(/\D/g, '') : '');
  const ssn = digits(d.ssn);
  const phone = digits(d.phone);
  const email = typeof d.email === 'string' ? d.email.trim().toLowerCase() : '';
  const matches = [];
  for (const t of listTenants()) {
    const matchedOn = [];
    if (ssn.length === 9 && digits(t.ssn) === ssn) {
      matchedOn.push('SSN');
    }
    if (phone.length === 10 && digits(t.phone) === phone) {
      matchedOn.push('phone');
    }
    if (email && t.email && t.email.toLowerCase() === email) {
      matchedOn.push('email');
    }
    if (matchedOn.length) {
      matches.push({ ...t, matchedOn });
    }
  }
  return matches;
}

function addTenant(data) {
  const clean = validateTenant(data);
  if (db.prepare('SELECT 1 FROM tenants WHERE ssn = ?').get(clean.ssn)) {
    throw new Error('A tenant with that SSN already exists.');
  }
  const cols = TENANT_FIELDS.join(', ');
  const params = TENANT_FIELDS.map((f) => '@' + f).join(', ');
  const { lastInsertRowid } = db.prepare(`INSERT INTO tenants (${cols}) VALUES (${params})`).run(clean);
  return toPlain(db.prepare(`SELECT id, ${cols} FROM tenants WHERE id = ?`).get(Number(lastInsertRowid)));
}

function updateTenant(id, data) {
  const clean = validateTenant(data);
  if (!db.prepare('SELECT 1 FROM tenants WHERE id = ?').get(id)) {
    throw new Error('Tenant not found.');
  }
  if (db.prepare('SELECT 1 FROM tenants WHERE ssn = ? AND id <> ?').get(clean.ssn, id)) {
    throw new Error('A tenant with that SSN already exists.');
  }
  const sets = TENANT_FIELDS.map((f) => `${f} = @${f}`).join(', ');
  db.prepare(`UPDATE tenants SET ${sets} WHERE id = @id`).run({ ...clean, id });
  return toPlain(db.prepare(`SELECT id, ${TENANT_FIELDS.join(', ')} FROM tenants WHERE id = ?`).get(id));
}

// v5: make the database enforce what the app only checked before.
//  - one `properties` row per address/city/zip (case-insensitive)
//  - one `property_years` row per house per year
//  - CHECK constraints mirroring validate()
// Existing duplicates are merged first, keeping the lowest id:
//  - duplicate houses: their year records move to the survivor, which takes the
//    descriptive fields of the most recently added duplicate
//  - duplicate (house, year) records: the extras are deleted and logged
function migrateToV5() {
  // Foreign keys must be off while tables are rebuilt (and the pragma is a no-op inside a transaction).
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    const houseKey = `lower(address), lower(city), lower(COALESCE(zip, ''))`;
    const dupHouses = db.prepare(`
      SELECT group_concat(id) AS ids FROM properties GROUP BY ${houseKey} HAVING COUNT(*) > 1
    `).all();
    for (const { ids } of dupHouses) {
      const all = ids.split(',').map(Number).sort((a, b) => a - b);
      const keep = all[0];
      const newest = db.prepare('SELECT * FROM properties WHERE id = ?').get(all[all.length - 1]);
      setPropertyFields(keep, newest, V5_PROPERTY_FIELDS);
      for (const id of all.slice(1)) {
        db.prepare('UPDATE property_years SET propertyId = ? WHERE propertyId = ?').run(keep, id);
        db.prepare('DELETE FROM properties WHERE id = ?').run(id);
      }
    }

    const dupYears = db.prepare(`
      SELECT group_concat(id) AS ids FROM property_years GROUP BY propertyId, year HAVING COUNT(*) > 1
    `).all();
    for (const { ids } of dupYears) {
      for (const id of ids.split(',').map(Number).sort((a, b) => a - b).slice(1)) {
        const row = db.prepare('SELECT * FROM property_years WHERE id = ?').get(id);
        console.warn('Migration v5: removed duplicate yearly record', JSON.stringify(row));
        db.prepare('DELETE FROM property_years WHERE id = ?').run(id);
      }
    }

    db.exec(`
      CREATE TABLE properties_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL CHECK (length(trim(address)) > 0),
        city TEXT NOT NULL CHECK (length(trim(city)) > 0),
        state TEXT,
        zip TEXT,
        bedrooms REAL NOT NULL CHECK (bedrooms >= 0),
        bathrooms REAL NOT NULL CHECK (bathrooms >= 0),
        sqft REAL NOT NULL CHECK (sqft >= 0)
      );
      CREATE TABLE property_years_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        propertyId INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        year INTEGER NOT NULL REFERENCES years(year) CHECK (year BETWEEN 1900 AND 2200),
        monthlyRent REAL NOT NULL CHECK (monthlyRent >= 0),
        propertyTax REAL NOT NULL CHECK (propertyTax >= 0),
        hoaFee REAL NOT NULL CHECK (hoaFee >= 0),
        mortgage REAL NOT NULL CHECK (mortgage >= 0),
        insurance REAL CHECK (insurance IS NULL OR insurance >= 0),
        repairCost REAL CHECK (repairCost IS NULL OR repairCost >= 0)
      );
      INSERT INTO properties_new SELECT id, address, city, state, zip, bedrooms, bathrooms, sqft FROM properties;
      INSERT INTO property_years_new
        SELECT id, propertyId, year, monthlyRent, propertyTax, hoaFee, mortgage, insurance, repairCost
        FROM property_years;
      DROP TABLE property_years;
      DROP TABLE properties;
      ALTER TABLE properties_new RENAME TO properties;
      ALTER TABLE property_years_new RENAME TO property_years;
      CREATE UNIQUE INDEX idx_properties_identity
        ON properties (lower(address), lower(city), lower(COALESCE(zip, '')));
      CREATE UNIQUE INDEX idx_property_years_unique ON property_years (propertyId, year);
      CREATE INDEX idx_property_years_year ON property_years (year);
    `);
    if (db.prepare('PRAGMA foreign_key_check').all().length > 0) {
      throw new Error('Migration v5 left foreign key violations.');
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

// v8: repair cost becomes a list of items (`repair_items`); the yearly repair cost is their
// sum, so the stored `repairCost` column is dropped. An existing non-zero repairCost becomes
// one item dated Jan 1 of its year.
function migrateToV8() {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE property_years_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        propertyId INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        year INTEGER NOT NULL REFERENCES years(year) CHECK (year BETWEEN 1900 AND 2200),
        monthlyRent REAL NOT NULL CHECK (monthlyRent >= 0),
        propertyTax REAL NOT NULL CHECK (propertyTax >= 0),
        hoaFee REAL NOT NULL CHECK (hoaFee >= 0),
        mortgage REAL NOT NULL CHECK (mortgage >= 0),
        insurance REAL CHECK (insurance IS NULL OR insurance >= 0),
        mortgageInterest REAL CHECK (mortgageInterest IS NULL OR mortgageInterest >= 0)
      );
      INSERT INTO property_years_new
        SELECT id, propertyId, year, monthlyRent, propertyTax, hoaFee, mortgage, insurance, mortgageInterest
        FROM property_years;
      CREATE TABLE repair_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        propertyYearId INTEGER NOT NULL REFERENCES property_years_new(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        amount REAL NOT NULL CHECK (amount >= 0),
        contractor TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO repair_items (propertyYearId, date, amount, contractor, description)
        SELECT id, printf('%04d-01-01', year), repairCost, '', 'Migrated repair cost'
        FROM property_years WHERE repairCost IS NOT NULL AND repairCost > 0;
      DROP TABLE property_years;
      ALTER TABLE property_years_new RENAME TO property_years;
      CREATE UNIQUE INDEX idx_property_years_unique ON property_years (propertyId, year);
      CREATE INDEX idx_property_years_year ON property_years (year);
      CREATE INDEX idx_property_years_property ON property_years (propertyId);
      CREATE INDEX idx_repair_items_year ON repair_items (propertyYearId);
    `);
    if (db.prepare('PRAGMA foreign_key_check').all().length > 0) {
      throw new Error('Migration v8 left foreign key violations.');
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

function close() {
  if (db) {
    db.close();
  }
  db = null;
}

function validYear(v) {
  const year = Number(v);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new Error('Year must be a whole number between 1900 and 2200.');
  }
  return year;
}

const toPlain = (row) => ({ ...row });

function listYears() {
  return db.prepare('SELECT year FROM years ORDER BY year DESC').all().map((r) => r.year);
}

function addYear(value) {
  const year = validYear(value);
  db.prepare('INSERT OR IGNORE INTO years (year) VALUES (?)').run(year);
  return year;
}

const SELECT_HOUSE = `SELECT id, ${PROPERTY_FIELDS.join(', ')} FROM properties`;

// `agreementName` is the uploaded lease agreement's file name, or null when there is none.
// `fileCount` is the number of downloadable files (agreement + documents).
const SELECT_LEASE = `SELECT id, startDate, endDate, monthlyRent, moveInDate, moveOutDate,
  (SELECT fileName FROM lease_agreements a WHERE a.leaseId = leases.id) AS agreementName,
  (SELECT COUNT(*) FROM lease_agreements a WHERE a.leaseId = leases.id)
    + (SELECT COUNT(*) FROM lease_documents d WHERE d.leaseId = leases.id) AS fileCount FROM leases`;

// A lease row plus its linked tenants.
function withTenants(l) {
  return {
    ...toPlain(l),
    tenants: db.prepare('SELECT tenantId, occupying FROM lease_tenants WHERE leaseId = ? ORDER BY tenantId')
      .all(l.id).map((r) => ({ tenantId: r.tenantId, occupying: r.occupying === 1 }))
  };
}

// A property's leasing contracts (oldest first), each with its tenants.
function listLeases(propertyId) {
  return db.prepare(`${SELECT_LEASE} WHERE propertyId = ? ORDER BY startDate, id`).all(propertyId).map(withTenants);
}

// Replace a lease's tenant links with the given (already validated) list.
function setLeaseTenants(leaseId, tenants) {
  const { startDate, endDate } = db.prepare('SELECT startDate, endDate FROM leases WHERE id = ?').get(leaseId);
  // A person cannot be on two leases whose terms overlap (dates are inclusive).
  const clash = db.prepare(`
    SELECT l.startDate, l.endDate, p.address, p.city
    FROM lease_tenants lt
    JOIN leases l ON l.id = lt.leaseId
    JOIN properties p ON p.id = l.propertyId
    WHERE lt.tenantId = ? AND l.id <> ? AND l.startDate <= ? AND l.endDate >= ?
    ORDER BY l.startDate LIMIT 1
  `);
  const nameOf = db.prepare('SELECT firstName, lastName FROM tenants WHERE id = ?');
  for (const t of tenants) {
    const c = clash.get(t.tenantId, leaseId, endDate, startDate);
    if (c) {
      const n = nameOf.get(t.tenantId);
      throw new Error(`${n.firstName} ${n.lastName} is already on a lease at ${c.address}, ${c.city} `
        + `(${c.startDate} to ${c.endDate}) that overlaps this lease term (${startDate} to ${endDate}).`);
    }
  }
  db.prepare('DELETE FROM lease_tenants WHERE leaseId = ?').run(leaseId);
  const link = db.prepare('INSERT INTO lease_tenants (leaseId, tenantId, occupying) VALUES (?, ?, ?)');
  const exists = db.prepare('SELECT 1 FROM tenants WHERE id = ?');
  for (const t of tenants) {
    if (!exists.get(t.tenantId)) {
      throw new Error('A selected tenant no longer exists.');
    }
    link.run(leaseId, t.tenantId, t.occupying ? 1 : 0);
  }
}

// A property cannot have two leases whose terms overlap (dates inclusive).
function assertNoPropertyOverlap(propertyId, excludeLeaseId, startDate, endDate) {
  const c = db.prepare(`
    SELECT startDate, endDate FROM leases
    WHERE propertyId = ? AND id <> ? AND startDate <= ? AND endDate >= ?
    ORDER BY startDate LIMIT 1
  `).get(propertyId, excludeLeaseId, endDate, startDate);
  if (c) {
    throw new Error(`This lease term (${startDate} to ${endDate}) overlaps an existing lease of this property `
      + `(${c.startDate} to ${c.endDate}).`);
  }
}

// Leases are saved on their own, independent of the property's own details.
function addLease(propertyId, data) {
  const [clean] = cleanLeases([data]);
  if (!db.prepare('SELECT 1 FROM properties WHERE id = ?').get(propertyId)) {
    throw new Error('Property not found.');
  }
  assertNoPropertyOverlap(propertyId, -1, clean.startDate, clean.endDate);
  db.exec('BEGIN');
  try {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO leases (propertyId, startDate, endDate, monthlyRent, moveInDate, moveOutDate)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(propertyId, clean.startDate, clean.endDate, clean.monthlyRent, clean.moveInDate, clean.moveOutDate);
    setLeaseTenants(Number(lastInsertRowid), clean.tenants);
    db.exec('COMMIT');
    return withTenants(db.prepare(`${SELECT_LEASE} WHERE id = ?`).get(Number(lastInsertRowid)));
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function updateLease(id, data) {
  const [clean] = cleanLeases([data]);
  const existing = db.prepare('SELECT propertyId FROM leases WHERE id = ?').get(id);
  if (!existing) {
    throw new Error('Lease not found.');
  }
  assertNoPropertyOverlap(existing.propertyId, id, clean.startDate, clean.endDate);
  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE leases SET startDate = ?, endDate = ?, monthlyRent = ?, moveInDate = ?, moveOutDate = ? WHERE id = ?
    `).run(clean.startDate, clean.endDate, clean.monthlyRent, clean.moveInDate, clean.moveOutDate, id);
    setLeaseTenants(id, clean.tenants);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return withTenants(db.prepare(`${SELECT_LEASE} WHERE id = ?`).get(id));
}

function deleteLease(id) {
  if (db.prepare('DELETE FROM leases WHERE id = ?').run(id).changes === 0) {
    throw new Error('Lease not found.');
  }
}

const MAX_AGREEMENT_BYTES = 25 * 1024 * 1024;

function setLeaseAgreement(leaseId, fileName, data) {
  if (!db.prepare('SELECT 1 FROM leases WHERE id = ?').get(leaseId)) {
    throw new Error('Lease not found.');
  }
  if (data.length === 0) {
    throw new Error('That file is empty.');
  }
  if (data.length > MAX_AGREEMENT_BYTES) {
    throw new Error('The file is too large (25 MB maximum).');
  }
  db.prepare(`INSERT INTO lease_agreements (leaseId, fileName, data) VALUES (?, ?, ?)
              ON CONFLICT(leaseId) DO UPDATE SET fileName = excluded.fileName, data = excluded.data`)
    .run(leaseId, fileName, data);
  return withTenants(db.prepare(`${SELECT_LEASE} WHERE id = ?`).get(leaseId));
}

// { fileName, data: Buffer } or null
function getLeaseAgreement(leaseId) {
  const row = db.prepare('SELECT fileName, data FROM lease_agreements WHERE leaseId = ?').get(leaseId);
  return row ? { fileName: row.fileName, data: Buffer.from(row.data) } : null;
}

function removeLeaseAgreement(leaseId) {
  db.prepare('DELETE FROM lease_agreements WHERE leaseId = ?').run(leaseId);
}

// Leasing documents: several files per lease. Lists never include the file bytes.
function listLeaseDocuments(leaseId) {
  return db.prepare(`SELECT d.id, d.fileName, d.typeId, t.name AS typeName FROM lease_documents d
    LEFT JOIN document_types t ON t.id = d.typeId WHERE d.leaseId = ? ORDER BY d.id`).all(leaseId).map(toPlain);
}

function addLeaseDocument(leaseId, typeId, fileName, data) {
  if (!db.prepare('SELECT 1 FROM document_types WHERE id = ?').get(typeId)) {
    throw new Error('Choose a document type.');
  }
  if (!db.prepare('SELECT 1 FROM leases WHERE id = ?').get(leaseId)) {
    throw new Error('Lease not found.');
  }
  if (data.length === 0) {
    throw new Error('That file is empty.');
  }
  if (data.length > MAX_AGREEMENT_BYTES) {
    throw new Error('The file is too large (25 MB maximum).');
  }
  db.prepare('INSERT INTO lease_documents (leaseId, typeId, fileName, data) VALUES (?, ?, ?, ?)').run(leaseId, typeId, fileName, data);
  return listLeaseDocuments(leaseId);
}

// Replaces the file behind an existing document.
function replaceLeaseDocument(docId, fileName, data) {
  const row = db.prepare('SELECT leaseId FROM lease_documents WHERE id = ?').get(docId);
  if (!row) {
    throw new Error('Document not found.');
  }
  if (data.length === 0) {
    throw new Error('That file is empty.');
  }
  if (data.length > MAX_AGREEMENT_BYTES) {
    throw new Error('The file is too large (25 MB maximum).');
  }
  db.prepare('UPDATE lease_documents SET fileName = ?, data = ? WHERE id = ?').run(fileName, data, docId);
  return listLeaseDocuments(row.leaseId);
}

// { fileName, data: Buffer } or null
function getLeaseDocument(docId) {
  const row = db.prepare('SELECT fileName, data FROM lease_documents WHERE id = ?').get(docId);
  return row ? { fileName: row.fileName, data: Buffer.from(row.data) } : null;
}

function removeLeaseDocument(docId) {
  const row = db.prepare('SELECT leaseId FROM lease_documents WHERE id = ?').get(docId);
  db.prepare('DELETE FROM lease_documents WHERE id = ?').run(docId);
  return row ? listLeaseDocuments(row.leaseId) : [];
}

// Every file of a lease (the agreement first, then the documents) for the "download all" zip.
function getLeaseFiles(leaseId) {
  const lease = db.prepare('SELECT startDate, endDate FROM leases WHERE id = ?').get(leaseId);
  if (!lease) {
    throw new Error('Lease not found.');
  }
  const files = [];
  const agreement = getLeaseAgreement(leaseId);
  if (agreement) {
    files.push(agreement);
  }
  for (const row of db.prepare('SELECT fileName, data FROM lease_documents WHERE leaseId = ? ORDER BY id').all(leaseId)) {
    files.push({ fileName: row.fileName, data: Buffer.from(row.data) });
  }
  return { startDate: lease.startDate, endDate: lease.endDate, files };
}

// Leasing document types (Admin screen).
function cleanTypeName(name) {
  const n = typeof name === 'string' ? name.trim() : '';
  if (!n) {
    throw new Error('Enter a document type name.');
  }
  if (n.length > 60) {
    throw new Error('The name is too long (60 characters maximum).');
  }
  return n;
}
function listDocumentTypes() {
  return db.prepare('SELECT id, name FROM document_types ORDER BY name COLLATE NOCASE').all().map(toPlain);
}
function addDocumentType(name) {
  try {
    db.prepare('INSERT INTO document_types (name) VALUES (?)').run(cleanTypeName(name));
  } catch (err) {
    throw new Error(/UNIQUE/.test(err.message) ? 'That document type already exists.' : err.message);
  }
  return listDocumentTypes();
}
function updateDocumentType(id, name) {
  try {
    if (db.prepare('UPDATE document_types SET name = ? WHERE id = ?').run(cleanTypeName(name), id).changes === 0) {
      throw new Error('Document type not found.');
    }
  } catch (err) {
    throw new Error(/UNIQUE/.test(err.message) ? 'That document type already exists.' : err.message);
  }
  return listDocumentTypes();
}
function deleteDocumentType(id) {
  db.prepare('DELETE FROM document_types WHERE id = ?').run(id);
  return listDocumentTypes();
}

// Houses (no yearly figures, no leases).
// `currentLeaseEnd` is the end date of the lease covering today (latest end if several), or null = vacant.
function listProperties() {
  const t = new Date();
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  const current = db.prepare(
    'SELECT MAX(endDate) AS endDate FROM leases WHERE propertyId = ? AND startDate <= ? AND endDate >= ?');
  return db.prepare(`${SELECT_HOUSE} ORDER BY lower(address), id`).all()
    .map((r) => ({ ...toPlain(r), currentLeaseEnd: current.get(r.id, today, today).endDate || null }));
}

// Validate only the house fields; any yearly data in `data` is ignored (placeholders
// stand in so the shared validator doesn't reject the missing/blank yearly values).
function validateHouse(data) {
  const placeholders = { monthlyRent: 0, propertyTax: 0, hoaFee: 0, mortgage: 0 };
  return pick(validate({ ...pick(data || {}, PROPERTY_FIELDS), ...placeholders }), PROPERTY_FIELDS);
}

function houseClash(clean, exceptId) {
  return db.prepare(`
    SELECT 1 FROM properties
    WHERE id != ? AND lower(address) = lower(?) AND lower(city) = lower(?) AND lower(COALESCE(zip, '')) = lower(?)
  `).get(exceptId, clean.address, clean.city, clean.zip);
}

function addProperty(data) {
  const clean = validateHouse(data);
  if (houseClash(clean, -1)) {
    throw new Error('A property with that address, city and zip already exists.');
  }
  const cols = PROPERTY_FIELDS.join(', ');
  const params = PROPERTY_FIELDS.map((f) => '@' + f).join(', ');
  const { lastInsertRowid } = db.prepare(`INSERT INTO properties (${cols}) VALUES (${params})`).run(clean);
  return toPlain(db.prepare(`${SELECT_HOUSE} WHERE id = ?`).get(Number(lastInsertRowid)));
}

function updateProperty(id, data) {
  const clean = validateHouse(data);
  if (!db.prepare('SELECT 1 FROM properties WHERE id = ?').get(id)) {
    throw new Error('Property not found.');
  }
  if (houseClash(clean, id)) {
    throw new Error('Another property already has that address, city and zip.');
  }
  setPropertyFields(id, clean);
  return toPlain(db.prepare(`${SELECT_HOUSE} WHERE id = ?`).get(id));
}

function list(yearValue) {
  const year = validYear(yearValue);
  return db.prepare(`${SELECT_RECORD} WHERE y.year = ? ORDER BY y.id`).all(year).map(withItems);
}

function get(id) {
  return withItems(db.prepare(`${SELECT_RECORD} WHERE y.id = ?`).get(id));
}

// A yearly record plus its itemized repairs (oldest first).
function withItems(row) {
  const repairItems = db.prepare(`
    SELECT id, date, amount, contractor, description FROM repair_items
    WHERE propertyYearId = ? ORDER BY date, id
  `).all(row.id).map(toPlain);
  return { ...row, repairItems };
}

// Replace a record's repair items with the given (already validated) list.
function setRepairItems(yearRecordId, items) {
  db.prepare('DELETE FROM repair_items WHERE propertyYearId = ?').run(yearRecordId);
  const insert = db.prepare(`
    INSERT INTO repair_items (propertyYearId, date, amount, contractor, description)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const it of items) {
    insert.run(yearRecordId, it.date, it.amount, it.contractor, it.description);
  }
}

function pick(obj, fields) {
  return Object.fromEntries(fields.map((f) => [f, obj[f]]));
}

function setPropertyFields(propertyId, clean, fields = PROPERTY_FIELDS) {
  const sets = fields.map((f) => `${f} = @${f}`).join(', ');
  db.prepare(`UPDATE properties SET ${sets} WHERE id = @id`).run({ ...pick(clean, fields), id: propertyId });
}

function add(yearValue, data) {
  const year = validYear(yearValue);
  const clean = validate(data);
  addYear(year);

  // Same address/city/zip as an existing house -> same property; otherwise a new one.
  const match = db.prepare(`
    SELECT id FROM properties
    WHERE lower(address) = lower(?) AND lower(city) = lower(?) AND lower(COALESCE(zip, '')) = lower(?)
    ORDER BY id LIMIT 1
  `).get(clean.address, clean.city, clean.zip);

  db.exec('BEGIN');
  try {
    let propertyId;
    if (match) {
      propertyId = match.id;
      if (db.prepare('SELECT 1 FROM property_years WHERE propertyId = ? AND year = ?').get(propertyId, year)) {
        throw new Error(`This property already has a record for ${year}.`);
      }
      setPropertyFields(propertyId, clean);
    } else {
      const cols = PROPERTY_FIELDS.join(', ');
      const params = PROPERTY_FIELDS.map((f) => '@' + f).join(', ');
      propertyId = Number(db.prepare(`INSERT INTO properties (${cols}) VALUES (${params})`)
        .run(pick(clean, PROPERTY_FIELDS)).lastInsertRowid);
    }
    const cols = ['propertyId', 'year', ...YEAR_FIELDS].join(', ');
    const params = ['propertyId', 'year', ...YEAR_FIELDS].map((f) => '@' + f).join(', ');
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO property_years (${cols}) VALUES (${params})`)
      .run({ ...pick(clean, YEAR_FIELDS), propertyId, year });
    setRepairItems(Number(lastInsertRowid), clean.repairItems);
    db.exec('COMMIT');
    return get(Number(lastInsertRowid));
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Updates only the yearly figures of a record; the year and the house itself never change
// here (house details are edited from the home page).
function update(id, data) {
  // Placeholders stand in for the house fields so the shared validator checks the yearly ones.
  const house = { address: 'x', city: 'x', bedrooms: 0, bathrooms: 0, sqft: 0 };
  const valid = validate({ ...house, ...pick(data || {}, [...YEAR_FIELDS, 'repairItems']) });
  const clean = pick(valid, YEAR_FIELDS);
  if (!db.prepare('SELECT 1 FROM property_years WHERE id = ?').get(id)) {
    throw new Error('Property not found.');
  }
  const sets = YEAR_FIELDS.map((f) => `${f} = @${f}`).join(', ');
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE property_years SET ${sets} WHERE id = @id`).run({ ...clean, id });
    setRepairItems(id, valid.repairItems);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return get(id);
}

// Deletes one year's record; the house itself goes once it has no records left.
function remove(id) {
  const record = db.prepare('SELECT propertyId FROM property_years WHERE id = ?').get(id);
  if (!record) {
    throw new Error('Property not found.');
  }
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM property_years WHERE id = ?').run(id);
    db.prepare(`DELETE FROM properties WHERE id = ?
                AND NOT EXISTS (SELECT 1 FROM property_years WHERE propertyId = ?)`)
      .run(record.propertyId, record.propertyId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Add selected houses to another year. The house is shared, so only a new yearly record is
// created, with monetary fields reset (required ones to 0, optional ones to null).
// Houses already in the target year (same propertyId) are skipped.
function copyFromYear(targetValue, sourceValue, ids) {
  const target = validYear(targetValue);
  const source = validYear(sourceValue);
  if (target === source) {
    throw new Error('Choose a different year to copy from.');
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('Select at least one house.');
  }

  // A house is "already there" if the target year has a record of the same propertyId.
  const existing = new Set(list(target).map((p) => p.propertyId));
  const insert = db.prepare(`
    INSERT INTO property_years (propertyId, year, monthlyRent, propertyTax, hoaFee, mortgage, insurance)
    VALUES (@propertyId, @year, 0, 0, 0, 0, NULL)
  `);
  const wanted = new Set(ids.map(Number));
  let copied = 0;
  db.exec('BEGIN');
  try {
    addYear(target);
    for (const p of list(source)) {
      // Skip houses already there, without a purchase date, or bought after the target year
      if (!wanted.has(p.id) || existing.has(p.propertyId)
          || !p.purchaseDate || Number(p.purchaseDate.slice(0, 4)) > target) {
        continue;
      }
      insert.run({ year: target, propertyId: p.propertyId });
      existing.add(p.propertyId);
      copied++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return copied;
}

// Add existing houses (by property id) to a year with a zeroed yearly record each.
// Houses already in that year are skipped.
function addHousesToYear(yearValue, propertyIds) {
  const year = validYear(yearValue);
  if (!Array.isArray(propertyIds) || propertyIds.length === 0) {
    throw new Error('Select at least one property.');
  }
  const exists = db.prepare('SELECT purchaseDate FROM properties WHERE id = ?');
  const has = db.prepare('SELECT 1 FROM property_years WHERE propertyId = ? AND year = ?');
  const insert = db.prepare(`
    INSERT INTO property_years (propertyId, year, monthlyRent, propertyTax, hoaFee, mortgage, insurance)
    VALUES (?, ?, 0, 0, 0, 0, NULL)
  `);
  let added = 0;
  db.exec('BEGIN');
  try {
    addYear(year);
    for (const id of new Set(propertyIds.map(Number))) {
      const house = exists.get(id);
      // Skip unknown houses, ones without a purchase date or bought after this year, and ones already in it
      if (!house || !house.purchaseDate || Number(house.purchaseDate.slice(0, 4)) > year || has.get(id, year)) {
        continue;
      }
      insert.run(id, year);
      added++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return added;
}

module.exports = { init, close, addHousesToYear,listLeases, addLease, updateLease, deleteLease, setLeaseAgreement, getLeaseAgreement, removeLeaseAgreement, listLeaseDocuments, addLeaseDocument, replaceLeaseDocument, getLeaseDocument, removeLeaseDocument, getLeaseFiles, listDocumentTypes, addDocumentType, updateDocumentType, deleteDocumentType, listTenants, tenantLeaseHistory, findTenantMatches, addTenant, updateTenant, deleteTenant, listYears, addYear, listProperties, addProperty, updateProperty, list, add, update, remove, copyFromYear };
