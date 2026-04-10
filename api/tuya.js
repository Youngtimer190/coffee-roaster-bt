// Tuya API - uproszczony podpis
import crypto from 'crypto';

const CLIENT_ID = 'nwqkpdpm4a7yga445fsm';
const CLIENT_SECRET = '8c50b1ece0fb47acb06be00f2a731059';
const DEVICE_ID = 'bf64bef5qnf76lbz';

const ENDPOINTS = [
  'https://openapi.tuyaeu.com',
  'https://openapi.tuyaus.com'
];

// Prosty podpis Tuya (hex uppercase)
function sign(clientId, secret, t, token = '') {
  // String: clientId + token + t
  const str = token ? `${clientId}${token}${t}` : `${clientId}${t}`;
  return crypto.createHmac('sha256', secret).update(str).digest('hex').toUpperCase();
}

async function getToken(baseUrl) {
  const t = Date.now().toString();
  const s = sign(CLIENT_ID, CLIENT_SECRET, t);

  console.log(`\n=== ${baseUrl} ===`);
  console.log('t:', t);
  console.log('sign string:', CLIENT_ID + t);
  console.log('sign:', s);

  const url = `${baseUrl}/v1.0/token?grant_type=1`;
  const resp = await fetch(url, {
    headers: {
      'client_id': CLIENT_ID,
      'sign': s,
      't': t,
      'sign_method': 'HMAC-SHA256'
    }
  });

  const data = await resp.json();
  console.log('Response:', JSON.stringify(data));
  return data;
}

async function getDevice(baseUrl, token) {
  const t = Date.now().toString();
  const s = sign(CLIENT_ID, CLIENT_SECRET, t, token);

  const url = `${baseUrl}/v1.0/devices/${DEVICE_ID}/status`;
  const resp = await fetch(url, {
    headers: {
      'client_id': CLIENT_ID,
      'sign': s,
      't': t,
      'sign_method': 'HMAC-SHA256',
      'access_token': token
    }
  });

  return resp.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let lastError = 'Brak połączenia';

  for (const ep of ENDPOINTS) {
    try {
      const tr = await getToken(ep);

      if (tr.success && tr.result?.access_token) {
        console.log('Token OK!');
        const dr = await getDevice(ep, tr.result.access_token);

        if (dr.success) {
          let temp = null;
          (dr.result || []).forEach(i => {
            console.log('Prop:', i.code, '=', i.value);
            if (['temp_current', 'temperature', 'temp', 'va_temperature'].includes(i.code)) {
              temp = parseFloat(i.value);
              if (temp > 200) temp = temp / 10;
            }
          });

          return res.json({
            success: true,
            temperature: temp,
            raw: dr.result,
            endpoint: ep
          });
        }
        lastError = dr.msg || 'Device error';
      } else {
        lastError = tr.msg || 'Token error';
      }
    } catch (e) {
      lastError = e.message;
      console.error('Error:', e);
    }
  }

  res.status(500).json({ success: false, error: lastError });
}
