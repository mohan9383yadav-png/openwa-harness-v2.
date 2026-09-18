require('dotenv').config();
const axios = require('axios');

const BASE_URL = (process.env.OPENWA_BASE_URL || '').replace(/\/$/, '');
const API_KEY = process.env.OPENWA_API_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

const publicUrl = process.argv[2];
if (!publicUrl) {
  console.error('Usage: node register-webhook.js <public-url-to-this-service>');
  console.error('Example: node register-webhook.js https://openwa-harness-production.up.railway.app');
  process.exit(1);
}
if (!WEBHOOK_SECRET) {
  console.error('WEBHOOK_SECRET is not set.');
  process.exit(1);
}

const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
  timeout: 15000
});

const fullWebhookUrl = `${publicUrl.replace(/\/$/, '')}/webhook/openwa`;

(async () => {
  try {
    const existing = await client.get('/api/webhooks');
    console.log(`Existing webhooks (${existing.data.length}):`, JSON.stringify(existing.data, null, 2));

    const created = await client.post('/api/webhooks', {
      url: fullWebhookUrl,
      secret: WEBHOOK_SECRET,
      events: ['message.received', 'message.ack', 'message.failed']
    });
    console.log('\n✅ Webhook registered:');
    console.log(JSON.stringify(created.data, null, 2));
  } catch (err) {
    console.error('❌ Failed:', err.response ? JSON.stringify(err.response.data) : err.message);
  }
})();
