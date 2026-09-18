require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const axios = require('axios');

const BASE_URL = (process.env.OPENWA_BASE_URL || '').replace(/\/$/, '');
const API_KEY = process.env.OPENWA_API_KEY;
const SESSION_ID = process.env.OPENWA_SESSION_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const PORT = process.env.PORT || 3000;

const EVENTS_LOG = path.join(__dirname, 'incoming-events.log');
const OPTED_OUT_FILE = path.join(__dirname, 'opted-out.json');

const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
  timeout: 15000
});

async function sendText(chatId, text) {
  return client.post(`/api/sessions/${SESSION_ID}/messages/send-text`, { chatId, text });
}

const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

function verifySignature(req) {
  if (!WEBHOOK_SECRET) return true;
  const header = req.headers['x-openwa-signature'] || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(req.rawBody).digest('hex');
  return header === expected;
}

function loadOptedOut() {
  if (!fs.existsSync(OPTED_OUT_FILE)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(OPTED_OUT_FILE, 'utf8')));
}
function saveOptedOut(set) {
  fs.writeFileSync(OPTED_OUT_FILE, JSON.stringify([...set], null, 2));
}
function logEvent(payload) {
  fs.appendFileSync(EVENTS_LOG, JSON.stringify(payload) + '\n');
}

async function handleIncomingMessage(data) {
  const chatId = data.chatId || data.from;
  const text = (data.text || data.body || '').trim().toLowerCase();
  if (!chatId || !text) return;

  const optedOut = loadOptedOut();

  if (['stop', 'unsubscribe'].includes(text)) {
    optedOut.add(chatId);
    saveOptedOut(optedOut);
    await sendText(chatId, "You've been unsubscribed. Reply START to opt back in anytime.");
    console.log(`🚫 Opted out: ${chatId}`);
    return;
  }
  if (text === 'start' && optedOut.has(chatId)) {
    optedOut.delete(chatId);
    saveOptedOut(optedOut);
    await sendText(chatId, "You're opted back in — welcome back!");
    console.log(`✅ Opted back in: ${chatId}`);
    return;
  }
  if (optedOut.has(chatId)) {
    console.log(`(Ignored — opted out): ${chatId}`);
    return;
  }
  if (['info', 'details', 'more info'].includes(text)) {
    await sendText(chatId, "Sure! A team member will follow up shortly with full details.");
    console.log(`ℹ️  Auto-info reply sent to: ${chatId}`);
    return;
  }
  console.log(`(No rule matched) "${text}" from ${chatId}`);
}

app.post('/webhook/openwa', async (req, res) => {
  if (!verifySignature(req)) {
    console.log('❌ Invalid signature — rejected.');
    return res.status(401).json({ error: 'invalid signature' });
  }
  const { event, data } = req.body || {};
  logEvent(req.body);
  console.log(`\n📩 Event: ${event}`);
  try {
    if (event === 'message.received') await handleIncomingMessage(data || {});
    else if (event === 'message.ack' || event === 'message.failed') console.log('   ', JSON.stringify(data));
  } catch (err) {
    console.error('   Error:', err.message);
  }
  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
  console.log(`Endpoint: /webhook/openwa`);
});
