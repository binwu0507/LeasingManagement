// SQLite storage for properties (built-in node:sqlite, file in the app's userData folder).
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_VERSION = 5;
// Describe the house itself; stored once in `properties`.
const PROPERTY_FIELDS = ['address', 'city', 'state', 'zip', 'bedrooms', 'bathrooms', 'sqft'];
// Vary by year; stored per year in `property_years`.
const YEAR_FIELDS = ['monthlyRent', 'propertyTax', 'hoaFee', 'mortgage', 'insurance', 'repairCost'];

// Joined view of one yearly record: `id` is the property_years id, `propertyId` the house.
const SELECT_RECORD = `
  SELECT y.id, y.propertyId, y.year, ${PROPERTY_FIELDS.map((f) => 'p.' + f).join(', ')},
         ${YEAR_FIELDS.map((f) => 'y.' + f).join(', ')}
  FROM property_years y JOIN properties p ON p.id = y.propertyId`;

let db = null;

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
    monthlyRent: num(d.monthlyRent),
    propertyTax: num(d.propertyTax),    // per year (required)
    hoaFee: num(d.hoaFee),              // per month (required)
    mortgage: num(d.mortgage),          // per month (required)
    insurance: optNum(d.insurance),     // per year (optional)
    repairCost: optNum(d.repairCost)    // total repair spend (optional)
  };

  if (!clean.address) {
    throw new Error('Address is required.');
  }
  if (!clean.city) {
    throw new Error('City is required.');
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
    ['repairCost', 'Repair cost']
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
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
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
      setPropertyFields(keep, newest);
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

// Houses only (no yearly figures), with the years each one has a record for.
function listProperties() {
  return db.prepare(`
    SELECT p.id, ${PROPERTY_FIELDS.map((f) => 'p.' + f).join(', ')},
           (SELECT group_concat(year) FROM (
              SELECT year FROM property_years WHERE propertyId = p.id ORDER BY year DESC)) AS yearList
    FROM properties p ORDER BY lower(p.address), p.id
  `).all().map((r) => ({
    ...r,
    years: r.yearList ? r.yearList.split(',').map(Number) : []
  }));
}

function list(yearValue) {
  const year = validYear(yearValue);
  return db.prepare(`${SELECT_RECORD} WHERE y.year = ? ORDER BY y.id`).all(year).map(toPlain);
}

function get(id) {
  return toPlain(db.prepare(`${SELECT_RECORD} WHERE y.id = ?`).get(id));
}

function pick(obj, fields) {
  return Object.fromEntries(fields.map((f) => [f, obj[f]]));
}

function setPropertyFields(propertyId, clean) {
  const sets = PROPERTY_FIELDS.map((f) => `${f} = @${f}`).join(', ');
  db.prepare(`UPDATE properties SET ${sets} WHERE id = @id`).run({ ...pick(clean, PROPERTY_FIELDS), id: propertyId });
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
    db.exec('COMMIT');
    return get(Number(lastInsertRowid));
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// The year of an existing record never changes. House details apply to every year.
function update(id, data) {
  const clean = validate(data);
  const record = db.prepare('SELECT propertyId FROM property_years WHERE id = ?').get(id);
  if (!record) {
    throw new Error('Property not found.');
  }
  const sets = YEAR_FIELDS.map((f) => `${f} = @${f}`).join(', ');
  const clash = db.prepare(`
    SELECT 1 FROM properties
    WHERE id != ? AND lower(address) = lower(?) AND lower(city) = lower(?) AND lower(COALESCE(zip, '')) = lower(?)
  `).get(record.propertyId, clean.address, clean.city, clean.zip);
  if (clash) {
    throw new Error('Another property already has that address, city and zip.');
  }
  db.exec('BEGIN');
  try {
    setPropertyFields(record.propertyId, clean);
    db.prepare(`UPDATE property_years SET ${sets} WHERE id = @id`).run({ ...pick(clean, YEAR_FIELDS), id });
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
    INSERT INTO property_years (propertyId, year, monthlyRent, propertyTax, hoaFee, mortgage, insurance, repairCost)
    VALUES (@propertyId, @year, 0, 0, 0, 0, NULL, NULL)
  `);
  const wanted = new Set(ids.map(Number));
  let copied = 0;
  db.exec('BEGIN');
  try {
    addYear(target);
    for (const p of list(source)) {
      if (!wanted.has(p.id) || existing.has(p.propertyId)) {
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

module.exports = { init, close, listYears, addYear, listProperties, list, add, update, remove, copyFromYear };
