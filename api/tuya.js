// Tuya API z nowymi kluczami
import crypto from 'crypto';

const CLIENT_ID = 'ytqmtsavtqt34prahhkc';
const CLIENT_SECRET = 'd055e6e7a4f04c08be67b00811ba6dc6';
const DEVICE_ID = 'bf64bef5qnf76lbz';
const BASE_URL = 'https://openapi.tuyaeu.com';

// Podpis wg dokumentacji Tuya v1.0
function createSign(t) {
  const str = CLIENT_ID + t;
  const hmac = crypto.createHmac('sha256', CLIENT_SECRET);
  hmac.update(str);
  return hmac.digest('hex').toUpperCase();
}

function createSignWithToken(t, token) {
  const str = CLIENT_ID + token + t;
  const hmac = crypto.createHmac('sha256', CLIENT_SECRET);
  hmac.update(str);
  return hmac.digest('hex').toUpperCase();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Krok 1: Pobierz token
    const t = Date.now().toString();
    const sign = createSign(t);

    console.log('=== Token Request ===');
    console.log('clientId:', CLIENT_ID);
    console.log('t:', t);
    console.log('stringToSign:', CLIENT_ID + t);
    console.log('sign:', sign);

    const tokenResp = await fetch(`${BASE_URL}/v1.0/token?grant_type=1`, {
      method: 'GET',
      headers: {
        'client_id': CLIENT_ID,
        'sign': sign,
        't': t,
        'sign_method': 'HMAC-SHA256'
      }
    });

    const tokenData = await tokenResp.json();
    console.log('Token response:', JSON.stringify(tokenData));

    if (!tokenData.success) {
      return res.status(500).json({
        success: false,
        error: `Token: ${tokenData.msg}`,
        debug: { clientId: CLIENT_ID, t, sign }
      });
    }

    const accessToken = tokenData.result.access_token;

    // Krok 2: Pobierz status urządzenia
    const t2 = Date.now().toString();
    const sign2 = createSignWithToken(t2, accessToken);

    console.log('=== Device Request ===');
    console.log('access_token:', accessToken);
    console.log('t2:', t2);
    console.log('sign2:', sign2);

    const deviceResp = await fetch(`${BASE_URL}/v1.0/devices/${DEVICE_ID}/status`, {
      method: 'GET',
      headers: {
        'client_id': CLIENT_ID,
        'sign': sign2,
        't': t2,
        'sign_method': 'HMAC-SHA256',
        'access_token': accessToken
      }
    });

    const deviceData = await deviceResp.json();
    console.log('Device response:', JSON.stringify(deviceData));

    if (!deviceData.success) {
      return res.status(500).json({
        success: false,
        error: `Device: ${deviceData.msg}`
      });
    }

    // Znajdź temperaturę
    let temperature = null;
    const raw = deviceData.result || [];

    for (const item of raw) {
      console.log('Property:', item.code, '=', item.value);
      if (['temp_current', 'temperature', 'temp', 'va_temperature', 'temp_current_f'].includes(item.code)) {
        let val = parseFloat(item.value);
        if (!isNaN(val)) {
          temperature = val > 200 ? val / 10 : val;
        }
      }
    }

    return res.status(200).json({
      success: true,
      temperature,
      raw,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
