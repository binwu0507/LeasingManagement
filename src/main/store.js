// SQLite storage for properties (built-in node:sqlite, file in the app's userData folder).
const path = require('path');
const { app } = require('electron');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_VERSION = 2;
const FIELDS = [
  'address', 'city', 'state', 'zip', 'bedrooms', 'bathrooms', 'sqft',
  'monthlyRent', 'propertyTax', 'hoaFee', 'mortgage', 'insurance', 'repairCost'
];

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

  if (!clean.address) throw new Error('Address is required.');
  if (!clean.city) throw new Error('City is required.');
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
  if (db) return;
  db = new DatabaseSync(path.join(app.getPath('userData'), 'leasing.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const { user_version: version } = db.prepare('PRAGMA user_version').get();
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
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

function close() {
  if (db) db.close();
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

function list(yearValue) {
  const year = validYear(yearValue);
  return db.prepare('SELECT * FROM properties WHERE year = ? ORDER BY id').all(year).map(toPlain);
}

function get(id) {
  return toPlain(db.prepare('SELECT * FROM properties WHERE id = ?').get(id));
}

function add(yearValue, data) {
  const year = validYear(yearValue);
  const clean = validate(data);
  addYear(year);
  const cols = ['year', ...FIELDS].join(', ');
  const params = ['year', ...FIELDS].map((f) => '@' + f).join(', ');
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO properties (${cols}) VALUES (${params})`)
    .run({ ...clean, year });
  return get(Number(lastInsertRowid));
}

// The year of an existing record never changes.
function update(id, data) {
  const clean = validate(data);
  const sets = FIELDS.map((f) => `${f} = @${f}`).join(', ');
  const { changes } = db
    .prepare(`UPDATE properties SET ${sets} WHERE id = @id`)
    .run({ ...clean, id });
  if (changes === 0) throw new Error('Property not found.');
  return get(id);
}

function remove(id) {
  const { changes } = db.prepare('DELETE FROM properties WHERE id = ?').run(id);
  if (changes === 0) throw new Error('Property not found.');
}

module.exports = { init, close, listYears, addYear, list, add, update, remove };
