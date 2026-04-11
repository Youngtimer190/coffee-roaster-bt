// Tuya API z token cache i retry logic
import crypto from 'crypto';

const CLIENT_ID = 'ytqmtsavtqt34prahhkc';
const CLIENT_SECRET = 'd055e6e7a4f04c08be67b00811ba6dc6';
const DEVICE_ID = 'bf64bef5qnf76lbz';
const BASE_URL = 'https://openapi.tuyaeu.com';

// SHA256 pustego stringa
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// Token cache - pamięć między requestami
let tokenCache = {
  accessToken: null,
  expiresAt: 0 // Unix timestamp w ms
};

// Funkcja do generowania podpisu
function generateSign(clientId, secret, t, nonce, stringToSign, token = '') {
  const str = token ? clientId + token + t + nonce + stringToSign : clientId + t + nonce + stringToSign;
  return crypto.createHmac('sha256', secret).update(str).digest('hex').toUpperCase();
}

// Retry z exponential backoff
async function retryFetch(url, options, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(url, options);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.success) return data;
      lastError = new Error(`Tuya error: ${data.msg}`);
    } catch (e) {
      lastError = e;
      console.log(`Retry ${i + 1}/${maxRetries}:`, e.message);
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 100 * Math.pow(2, i))); // 100ms, 200ms, 400ms
      }
    }
  }
  throw lastError;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const now = Date.now();
    let accessToken;

    // Sprawdź czy mamy ważny token w cache (z marginesem 5 minut)
    if (tokenCache.accessToken && tokenCache.expiresAt > now + 5 * 60 * 1000) {
      console.log('Używam token z cache, wygasa za', Math.round((tokenCache.expiresAt - now) / 1000), 's');
      accessToken = tokenCache.accessToken;
    } else {
      // Pobierz nowy token
      console.log('Pobieram nowy token...');
      const t = now.toString();
      const nonce = crypto.randomUUID();
      const path = '/v1.0/token?grant_type=1';
      const stringToSign = `GET\n${EMPTY_SHA256}\n\n${path}`;
      const sign = generateSign(CLIENT_ID, CLIENT_SECRET, t, nonce, stringToSign);

      const tokenData = await retryFetch(`${BASE_URL}${path}`, {
        method: 'GET',
        headers: {
          'client_id': CLIENT_ID,
          'sign': sign,
          't': t,
          'nonce': nonce,
          'sign_method': 'HMAC-SHA256'
        }
      });

      accessToken = tokenData.result.access_token;
      const expireTime = tokenData.result.expire_time || 7200; // domyślnie 2h
      tokenCache = {
        accessToken,
        expiresAt: now + expireTime * 1000
      };
      console.log('Token zapisany, ważny przez', expireTime, 's');
    }
    // Device request z retry
    const t2 = Date.now().toString();
    const nonce2 = crypto.randomUUID();
    const devicePath = `/v1.0/devices/${DEVICE_ID}/status`;
    const stringToSign2 = `GET\n${EMPTY_SHA256}\n\n${devicePath}`;
    const sign2 = generateSign(CLIENT_ID, CLIENT_SECRET, t2, nonce2, stringToSign2, accessToken);

    const deviceData = await retryFetch(`${BASE_URL}${devicePath}`, {
      method: 'GET',
      headers: {
        'client_id': CLIENT_ID,
        'sign': sign2,
        't': t2,
        'nonce': nonce2,
        'sign_method': 'HMAC-SHA256',
        'access_token': accessToken
      }
    });

    // Find temperature
    let temperature = null;
    for (const item of (deviceData.result || [])) {
      if (['temp_current', 'temperature', 'temp', 'va_temperature'].includes(item.code)) {
        let val = parseFloat(item.value);
        if (!isNaN(val)) {
          temperature = val > 200 ? val / 10 : val;
        }
      }
    }

    return res.json({
      success: true,
      temperature,
      timestamp: Date.now(),
      tokenCached: tokenCache.expiresAt > Date.now()
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
