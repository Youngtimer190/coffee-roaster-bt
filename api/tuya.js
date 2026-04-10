// Tuya API Endpoint - wersja z poprawnym podpisem
import crypto from 'crypto';

const CLIENT_ID = 'nwqkpdpm4a7yga445fsm';
const CLIENT_SECRET = '8c50b1ece0fb47acb06be00f2a731059';
const DEVICE_ID = 'bf64bef5qnf76lbz';

// Regiony do przetestowania
const ENDPOINTS = [
  'https://openapi.tuyaeu.com',
  'https://openapi.tuyaus.com',
  'https://openapi.tuyain.com',
  'https://openapi.tuyacn.com'
];

// Poprawny podpis Tuya
function createSign(clientId, clientSecret, t, accessToken = '') {
  // String do podpisu: clientId + t + accessToken
  const stringToSign = clientId + t;
  if (accessToken) {
    // Dla requestów z tokenem
    const stringToSign2 = clientId + accessToken + t;
    const hmac = crypto.createHmac('sha256', clientSecret);
    hmac.update(stringToSign2);
    return hmac.digest('hex').toUpperCase();
  } else {
    // Dla requestu o token (bez access_token)
    const hmac = crypto.createHmac('sha256', clientSecret);
    hmac.update(stringToSign);
    return hmac.digest('hex').toUpperCase();
  }
}

// Pobierz token
async function getToken(baseUrl) {
  const t = Date.now().toString();
  const sign = createSign(CLIENT_ID, CLIENT_SECRET, t);

  console.log(`\n=== Próba: ${baseUrl} ===`);
  console.log('t:', t);
  console.log('sign:', sign);

  const response = await fetch(`${baseUrl}/v1.0/token?grant_type=1`, {
    method: 'GET',
    headers: {
      'client_id': CLIENT_ID,
      'sign': sign,
      't': t,
      'sign_method': 'HMAC-SHA256'
    }
  });

  const data = await response.json();
  console.log('Odpowiedź:', JSON.stringify(data, null, 2));

  return data;
}

// Pobierz status urządzenia
async function getDeviceStatus(baseUrl, accessToken) {
  const t = Date.now().toString();
  const sign = createSign(CLIENT_ID, CLIENT_SECRET, t, accessToken);

  const url = `${baseUrl}/v1.0/devices/${DEVICE_ID}/status`;
  console.log('\nDevice status URL:', url);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'client_id': CLIENT_ID,
      'sign': sign,
      't': t,
      'sign_method': 'HMAC-SHA256',
      'access_token': accessToken
    }
  });

  return response.json();
}

// Handler
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Próbuj każdy region
  for (const baseUrl of ENDPOINTS) {
    try {
      const tokenData = await getToken(baseUrl);

      if (tokenData.success && tokenData.result?.access_token) {
        const accessToken = tokenData.result.access_token;
        console.log('Token OK:', accessToken.substring(0, 10) + '...');

        // Pobierz status urządzenia
        const deviceData = await getDeviceStatus(baseUrl, accessToken);

        if (deviceData.success) {
          // Znajdź temperaturę
          let temperature = null;
          const raw = deviceData.result || [];

          for (const item of raw) {
            console.log('Property:', item.code, '=', item.value);
            if (['temp_current', 'temperature', 'temp', 'temp_current_f'].includes(item.code)) {
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
            region: baseUrl,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('Błąd:', error.message);
    }
  }

  return res.status(500).json({
    success: false,
    error: 'Nie udało się połączyć z żadnym regionem Tuya'
  });
}
