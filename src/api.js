const fetch = require('node-fetch');

const { CARD_API_URL, LANGFLOW_API_KEY } = process.env;

async function callCardApi({ userId, username, content, apiUrl }) {
  const url = apiUrl || CARD_API_URL;
  if (!url) throw new Error('API URL not configured');

  // Build headers similar to your Python example
  const headers = { 'Content-Type': 'application/json' };
  if (LANGFLOW_API_KEY) headers['x-api-key'] = LANGFLOW_API_KEY;

  // Build payload compatible with the LangFlow run API
  const payload = {
    output_type: 'chat',
    input_type: 'chat',
    // use the message content as the input value
    input_value: content,
    // include metadata so your flow can know who requested it
    metadata: { userId, username },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Card API returned ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

module.exports = { callCardApi };
