// Tuya API - dokładnie wg dokumentacji
import crypto from 'crypto';

const CLIENT_ID = 'ytqmtsavtqt34prahhkc';
const CLIENT_SECRET = 'd055e6e7a4f04c08be67b00811ba6dc6';
const DEVICE_ID = 'bf64bef5qnf76lbz';
const BASE_URL = 'https://openapi.tuyaeu.com';

// SHA256 pustego stringa
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const t = Date.now().toString();
    const nonce = crypto.randomUUID(); // UUID
    const path = '/v1.0/token?grant_type=1';

    // stringToSign = Method + "\n" + SHA256(body) + "\n" + headers + "\n" + URL
    // Dla GET bez custom headers:
    const stringToSign = `GET\n${EMPTY_SHA256}\n\n${path}`;

    // str = client_id + t + nonce + stringToSign
    const str = CLIENT_ID + t + nonce + stringToSign;

    // sign = HMAC-SHA256(str, secret).toUpperCase()
    const sign = crypto.createHmac('sha256', CLIENT_SECRET).update(str).digest('hex').toUpperCase();

    console.log('=== Token Request ===');
    console.log('t:', t);
    console.log('nonce:', nonce);
    console.log('path:', path);
    console.log('stringToSign:', JSON.stringify(stringToSign));
    console.log('str:', str);
    console.log('sign:', sign);

    const tokenResp = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers: {
        'client_id': CLIENT_ID,
        'sign': sign,
        't': t,
        'nonce': nonce,
        'sign_method': 'HMAC-SHA256'
      }
    });

    const tokenData = await tokenResp.json();
    console.log('Response:', JSON.stringify(tokenData));

    if (!tokenData.success) {
      return res.status(500).json({
        success: false,
        error: `Token ${tokenData.code}: ${tokenData.msg}`,
        debug: { t, nonce, str, sign }
      });
    }

    const accessToken = tokenData.result.access_token;
    console.log('Token OK');

    // Device request
    const t2 = Date.now().toString();
    const nonce2 = crypto.randomUUID();
    const devicePath = `/v1.0/devices/${DEVICE_ID}/status`;

    // stringToSign dla general API
    const stringToSign2 = `GET\n${EMPTY_SHA256}\n\n${devicePath}`;

    // str = client_id + access_token + t + nonce + stringToSign
    const str2 = CLIENT_ID + accessToken + t2 + nonce2 + stringToSign2;
    const sign2 = crypto.createHmac('sha256', CLIENT_SECRET).update(str2).digest('hex').toUpperCase();

    console.log('=== Device Request ===');
    console.log('stringToSign2:', JSON.stringify(stringToSign2));
    console.log('str2:', str2);
    console.log('sign2:', sign2);

    const deviceResp = await fetch(`${BASE_URL}${devicePath}`, {
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

    const deviceData = await deviceResp.json();
    console.log('Device response:', JSON.stringify(deviceData));

    if (!deviceData.success) {
      return res.status(500).json({ success: false, error: `Device: ${deviceData.msg}` });
    }

    // Find temperature
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
    return res.status(500).json({ success: false, error: error.message });
  }
}
