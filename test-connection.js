require('dotenv').config();
const axios = require('axios');

const BASE_URL = (process.env.OPENWA_BASE_URL || '').replace(/\/$/, '');
const API_KEY = process.env.OPENWA_API_KEY;
const SESSION_ID = process.env.OPENWA_SESSION_ID;

if (!BASE_URL || !API_KEY || !SESSION_ID) {
  console.error('Missing OPENWA_BASE_URL / OPENWA_API_KEY / OPENWA_SESSION_ID env vars.');
  process.exit(1);
}

const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
  timeout: 15000
});

(async () => {
  try {
    console.log(`Checking session "${SESSION_ID}" at ${BASE_URL}...`);
    const res = await client.get(`/api/sessions/${SESSION_ID}`);
    console.log('✅ Connected. Session info:');
    console.log(JSON.stringify(res.data, null, 2));
    if (res.data.status !== 'ready') {
      console.log(`\n⚠️  Status is "${res.data.status}", not "ready" — scan the QR if needed.`);
    }
  } catch (err) {
    console.error('❌ Connection failed:', err.response ? JSON.stringify(err.response.data) : err.message);
    process.exit(1);
  }
})();
