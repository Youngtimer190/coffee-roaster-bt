// Tuya API - poprawny podpis wg oficjalnej dokumentacji
import crypto from 'crypto';

const CLIENT_ID = 'ytqmtsavtqt34prahhkc';
const CLIENT_SECRET = 'd055e6e7a4f04c08be67b00811ba6dc6';
const DEVICE_ID = 'bf64bef5qnf76lbz';
const BASE_URL = 'https://openapi.tuyaeu.com';

// Poprawny podpis Tuya (Base64)
function createSign(method, path, body, t, token = '') {
  // SHA256 hash body (pusty dla GET)
  const bodySha256 = crypto.createHash('sha256').update(body || '').digest('hex');

  // String do podpisu
  const stringToSign = `${method}\n${bodySha256}\n${path}\n${t}\n${token}`;

  console.log('String to sign:', JSON.stringify(stringToSign));

  // HMAC-SHA256 -> Base64
  const hmac = crypto.createHmac('sha256', CLIENT_SECRET);
  hmac.update(stringToSign);
  return hmac.digest('base64');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Pobierz token
    const t = Date.now().toString();
    const path = '/v1.0/token?grant_type=1';
    const sign = createSign('GET', path, '', t);

    console.log('=== Token Request ===');
    console.log('client_id:', CLIENT_ID);
    console.log('t:', t);
    console.log('path:', path);
    console.log('sign:', sign);

    const tokenResp = await fetch(`${BASE_URL}${path}`, {
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
        error: `Token: ${tokenData.msg} (${tokenData.code})`,
        debug: { t, sign }
      });
    }

    const accessToken = tokenData.result.access_token;

    // Pobierz status urządzenia
    const t2 = Date.now().toString();
    const devicePath = `/v1.0/devices/${DEVICE_ID}/status`;
    const sign2 = createSign('GET', devicePath, '', t2, accessToken);

    console.log('=== Device Request ===');
    console.log('access_token:', accessToken);
    console.log('sign2:', sign2);

    const deviceResp = await fetch(`${BASE_URL}${devicePath}`, {
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
    for (const item of (deviceData.result || [])) {
      console.log('Property:', item.code, '=', item.value);
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
      raw: deviceData.result
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
