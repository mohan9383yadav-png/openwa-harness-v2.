require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const BASE_URL = (process.env.OPENWA_BASE_URL || '').replace(/\/$/, '');
const API_KEY = process.env.OPENWA_API_KEY;
const SESSION_ID = process.env.OPENWA_SESSION_ID;
const DELAY_MS = parseInt(process.env.RATE_LIMIT_DELAY_MS || '8000', 10);
const DEFAULT_COUNTRY_CODE = '91';

const CONTACTS_FILE = process.argv[2] || path.join(__dirname, 'contacts-sample.csv');
const TEMPLATES_FILE = path.join(__dirname, 'templates.json');
const LOG_FILE = path.join(__dirname, 'sent-log.csv');

const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
  timeout: 15000
});

async function sendText(chatId, text) {
  return client.post(`/api/sessions/${SESSION_ID}/messages/send-text`, { chatId, text });
}

function normalizePhone(raw) {
  let digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.substring(1);
  if (digits.length === 10) return `${DEFAULT_COUNTRY_CODE}${digits}@c.us`;
  if (digits.length >= 10 && digits.length <= 15) return `${digits}@c.us`;
  return null;
}
function mergeTemplate(body, row) {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => (row[key] !== undefined ? row[key] : ''));
}
function loadSentLog() {
  if (!fs.existsSync(LOG_FILE)) return new Set();
  const raw = fs.readFileSync(LOG_FILE, 'utf8').trim();
  if (!raw) return new Set();
  return new Set(parse(raw, { columns: true }).filter(r => r.status === 'sent').map(r => r.phone));
}
function appendToLog(entry) {
  const exists = fs.existsSync(LOG_FILE);
  fs.appendFileSync(LOG_FILE, stringify([entry], { header: !exists }));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  if (!BASE_URL || !API_KEY || !SESSION_ID) {
    console.error('Missing OPENWA_BASE_URL / OPENWA_API_KEY / OPENWA_SESSION_ID env vars.');
    process.exit(1);
  }
  if (!fs.existsSync(CONTACTS_FILE)) { console.error(`Not found: ${CONTACTS_FILE}`); process.exit(1); }
  if (!fs.existsSync(TEMPLATES_FILE)) { console.error(`Not found: ${TEMPLATES_FILE}`); process.exit(1); }

  const templates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
  const rows = parse(fs.readFileSync(CONTACTS_FILE, 'utf8'), { columns: true, skip_empty_lines: true });
  const alreadySent = loadSentLog();

  console.log(`Loaded ${rows.length} contact(s). ${alreadySent.size} already sent — skipping those. Delay: ${DELAY_MS}ms\n`);

  let sent = 0, skipped = 0, failed = 0, invalid = 0;

  for (const row of rows) {
    const name = (row.name || '').trim();
    const phone = normalizePhone((row.phone || '').trim());
    const templateName = (row.template || '').trim();

    if (!phone) { console.log(`⚠️  Invalid phone for "${name}"`); invalid++; continue; }
    if (alreadySent.has(phone)) { console.log(`↷ Already sent: ${name} (${phone})`); skipped++; continue; }

    const body = templates[templateName];
    if (!body) { console.log(`⚠️  Unknown template "${templateName}" for "${name}"`); invalid++; continue; }

    const message = mergeTemplate(body, row);
    try {
      await sendText(phone, message);
      console.log(`✅ Sent to ${name} (${phone})`);
      appendToLog({ name, phone, template: templateName, status: 'sent', timestamp: new Date().toISOString(), error: '' });
      sent++;
    } catch (err) {
      const msg = err.response ? JSON.stringify(err.response.data) : err.message;
      console.log(`❌ Failed for ${name} (${phone}): ${msg}`);
      appendToLog({ name, phone, template: templateName, status: 'failed', timestamp: new Date().toISOString(), error: msg });
      failed++;
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n--- Summary ---\nSent: ${sent} | Skipped: ${skipped} | Failed: ${failed} | Invalid: ${invalid}`);
})();
