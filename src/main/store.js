// In-memory storage for properties. Swap this module for a database later.

let nextId = 1;
const properties = [];

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

function list() {
  return properties.map((p) => ({ ...p }));
}

function add(data) {
  const property = { id: nextId++, ...validate(data) };
  properties.push(property);
  return { ...property };
}

function update(id, data) {
  const property = properties.find((p) => p.id === id);
  if (!property) throw new Error('Property not found.');
  Object.assign(property, validate(data));
  return { ...property };
}

function remove(id) {
  const index = properties.findIndex((p) => p.id === id);
  if (index === -1) throw new Error('Property not found.');
  properties.splice(index, 1);
}

// Sample data
add({ address: '12 Maple Street', city: 'Springfield', state: 'IL', zip: '62701', bedrooms: 3, bathrooms: 2, sqft: 1600, monthlyRent: 1850, propertyTax: 3600, hoaFee: 45, insurance: 1200, mortgage: 1100, repairCost: 850 });
add({ address: '48 Oak Avenue', city: 'Springfield', state: 'IL', zip: '62704', bedrooms: 4, bathrooms: 3, sqft: 2200, monthlyRent: 2400, propertyTax: 5200, hoaFee: 120, insurance: 1500, mortgage: 1650 });
add({ address: '7 Birch Lane', city: 'Riverton', state: 'IL', zip: '62561', bedrooms: 2, bathrooms: 1, sqft: 1100, monthlyRent: 1300, propertyTax: 2400, hoaFee: 30, mortgage: 800 });

module.exports = { list, add, update, remove };
