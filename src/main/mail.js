// Notification emails for rent-payment changes.
//
// Sending uses the user's Gmail account over SMTP with an app password. Settings live in
// `mail-settings.json` in Electron's userData folder (never in the database or the repo); the
// password is encrypted with Electron's safeStorage, which is tied to the Windows user account.
// Before anything is sent the user is shown the message and must confirm. With no account set up
// the same confirmation offers to open a draft in the default mail app instead.
const { app, dialog, safeStorage, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const DEFAULT_TO = '88mary@gmail.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const settingsFile = () => path.join(app.getPath('userData'), 'mail-settings.json');

function readFile() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return {};
  }
}

// Settings for the renderer: never includes the password, only whether one is saved.
function getSettings() {
  const s = readFile();
  return { user: s.user || '', to: s.to || DEFAULT_TO, hasPassword: !!s.pass };
}

// `password` blank keeps the saved one. App passwords are shown by Google with spaces; strip them.
function saveSettings(data) {
  const d = data || {};
  const user = typeof d.user === 'string' ? d.user.trim() : '';
  // One or more recipients, separated by commas, semicolons or spaces; stored as "a@x.com, b@y.com".
  const recipients = typeof d.to === 'string' ? d.to.split(/[\s,;]+/).filter(Boolean) : [];
  const bad = recipients.find((r) => !EMAIL_RE.test(r));
  if (recipients.length === 0 || bad) {
    throw new Error(bad ? `"${bad}" is not a valid email address.` : 'Enter at least one address to send the notifications to.');
  }
  const to = [...new Set(recipients)].join(', ');
  const password = typeof d.password === 'string' ? d.password.replace(/\s+/g, '') : '';
  const old = readFile();
  if (user && !EMAIL_RE.test(user)) {
    throw new Error('Enter a valid Gmail address to send from.');
  }
  let pass = user ? old.pass : undefined;
  if (user && password) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available on this computer, so the password cannot be saved.');
    }
    pass = safeStorage.encryptString(password).toString('base64');
  }
  if (user && !pass) {
    throw new Error('Enter the Gmail app password.');
  }
  fs.writeFileSync(settingsFile(), JSON.stringify({ user: user || undefined, to, pass }), { mode: 0o600 });
  return getSettings();
}

function credentials() {
  const s = readFile();
  if (!s.user || !s.pass) {
    return null;
  }
  return { user: s.user, pass: safeStorage.decryptString(Buffer.from(s.pass, 'base64')), to: s.to || DEFAULT_TO };
}

async function send({ subject, body, to }) {
  const c = credentials();
  if (!c) {
    throw new Error('No sending account is set up.');
  }
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: c.user, pass: c.pass }
  });
  await transport.sendMail({ from: c.user, to: to || c.to, subject, text: body });
}

// Sends a short message so the user can check the account works.
async function sendTest() {
  const c = credentials();
  if (!c) {
    throw new Error('Save a Gmail address and app password first.');
  }
  await send({ subject: 'Leasing Management test email', body: 'Your notification emails are set up correctly.' });
}

const usd = (n) => `$${Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const us = (d) => d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2/$3/$1');

// Subject and body describing a payment change (see paymentChange in store.js).
function paymentMail(c) {
  const line = (p) => `${p.rentKind} rent ${usd(p.amount)} on ${us(p.paymentDate)} (${p.paymentMethod || 'no method'})`;
  const house = `${c.address}, ${c.city}${c.state ? `, ${c.state}` : ''}`;
  const verb = { added: 'added', updated: 'updated', deleted: 'deleted' }[c.action];
  const latest = c.after || c.before;
  const lines = [`A rent payment was ${verb} for ${house}.`, ''];
  if (c.action === 'updated') {
    lines.push(`Before: ${line(c.before)}`, `After:  ${line(c.after)}`);
  } else {
    lines.push(`${c.action === 'added' ? 'Added' : 'Deleted'}: ${line(latest)}`);
  }
  lines.push('',
    `Tenants: ${c.tenantNames.length ? c.tenantNames.join(', ') : 'none listed'}`,
    `Lease: ${us(c.leaseStart)} - ${us(c.leaseEnd)}`);
  if (c.yearlyRent !== null) {
    lines.push(`Rent received in ${c.year} so far: ${usd(c.yearlyRent)}`);
  }
  const subject = `Rent payment ${verb}: ${c.address} - ${usd(latest.amount)} (${us(latest.paymentDate)})`;
  return { subject, body: lines.join('\r\n') };
}

/**
 * Shows the email for a payment change and, if the user confirms, sends it (or opens a draft when
 * no account is set up). Resolves to { status: 'sent' | 'draft' | 'skipped' | 'failed', error? }.
 * Never throws: the payment itself is already saved.
 */
async function confirmAndSend(change, win) {
  if (!change) {
    return { status: 'skipped' };
  }
  try {
    const { subject, body } = paymentMail(change);
    const configured = !!credentials();
    const to = getSettings().to;
    const choice = await dialog.showMessageBox(win, {
      type: 'question',
      title: configured ? 'Send email?' : 'Open email draft?',
      message: configured ? `Send this email to ${to}?` : `Open this email to ${to} as a draft in your mail app?`,
      detail: `Subject: ${subject}\n\n${body.replace(/\r\n/g, '\n')}`
        + (configured ? '' : '\n\n(No sending account is set up. Add one under Email notifications to send automatically.)'),
      buttons: [configured ? 'Send' : 'Open draft', "Don't send"],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
    if (choice.response !== 0) {
      return { status: 'skipped' };
    }
    if (configured) {
      await send({ subject, body, to });
      return { status: 'sent' };
    }
    await shell.openExternal(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    return { status: 'draft' };
  } catch (err) {
    console.error('Payment email failed:', err.message);
    return { status: 'failed', error: err.message };
  }
}

module.exports = { getSettings, saveSettings, sendTest, confirmAndSend };
