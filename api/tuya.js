// Tuya API - oficjalny format podpisu
import crypto from 'crypto';

const CLIENT_ID = 'nwqkpdpm4a7yga445fsm';
const CLIENT_SECRET = '8c50b1ece0fb47acb06be00f2a731059';
const DEVICE_ID = 'bf64bef5qnf76lbz';

const ENDPOINTS = [
  'https://openapi.tuyaeu.com',
  'https://openapi.tuyaus.com'
];

// Oficjalny podpis Tuya (Base64)
function createSignature(method, path, body, timestamp, accessToken = '') {
  // SHA256 hash body (pusty string dla GET)
  const bodyHash = crypto.createHash('sha256').update(body || '').digest('hex');

  // String do podpisu
  const stringToSign = `${method}\n${bodyHash}\n${path}\n${timestamp}\n${accessToken}`;

  // HMAC-SHA256 i Base64
  const signature = crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(stringToSign)
    .digest('base64');

  return signature;
}

async function getToken(baseUrl) {
  const t = Date.now().toString();
  const method = 'GET';
  const path = '/v1.0/token?grant_type=1';
  const sign = createSignature(method, path, null, t, '');

  console.log(`\n=== ${baseUrl} ===`);
  console.log('String to sign:', `GET\n${crypto.createHash('sha256').update('').digest('hex')}\n${path}\n${t}\n`);
  console.log('Sign:', sign);

  const response = await fetch(`${baseUrl}${path}`, {
    method: method,
    headers: {
      'client_id': CLIENT_ID,
      'sign': sign,
      't': t,
      'sign_method': 'HMAC-SHA256'
    }
  });

  const data = await response.json();
  console.log('Response:', JSON.stringify(data));
  return data;
}

async function getDeviceStatus(baseUrl, token) {
  const t = Date.now().toString();
  const method = 'GET';
  const path = `/v1.0/devices/${DEVICE_ID}/status`;
  const sign = createSignature(method, path, null, t, token);

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: {
      'client_id': CLIENT_ID,
      'sign': sign,
      't': t,
      'sign_method': 'HMAC-SHA256',
      'access_token': token
    }
  });

  return response.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  for (const baseUrl of ENDPOINTS) {
    try {
      const tokenResp = await getToken(baseUrl);

      if (tokenResp.success && tokenResp.result?.access_token) {
        const token = tokenResp.result.access_token;
        console.log('Token OK!');

        const deviceResp = await getDeviceStatus(baseUrl, token);

        if (deviceResp.success) {
          let temp = null;
          for (const item of (deviceResp.result || [])) {
            console.log('Property:', item.code, '=', item.value);
            if (['temp_current', 'temperature', 'temp'].includes(item.code)) {
              temp = parseFloat(item.value);
              if (temp > 200) temp = temp / 10;
            }
          }

          return res.status(200).json({
            success: true,
            temperature: temp,
            raw: deviceResp.result,
            endpoint: baseUrl
          });
        } else {
          console.log('Device error:', deviceResp.msg);
        }
      } else {
        console.log('Token error:', tokenResp.msg);
      }
    } catch (e) {
      console.error('Exception:', e.message);
    }
  }

  res.status(500).json({ success: false, error: 'Nie udało się połączyć' });
}
