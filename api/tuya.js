// Tuya API Endpoint for Vercel Serverless Functions
import crypto from 'crypto';

// Configuration
const TUYA_CONFIG = {
  clientId: 'nwqkpdpm4a7yga445fsm',
  clientSecret: '8c50b1ece0fb47acb06be00f2a731059',
  deviceId: 'bf64bef5qnf76lbz'
};

// Tuya API regions
const REGIONS = [
  { name: 'EU-Central', url: 'https://openapi.tuyaeu.com' },
  { name: 'US', url: 'https://openapi.tuyaus.com' },
  { name: 'India', url: 'https://openapi.tuyain.com' },
  { name: 'China', url: 'https://openapi.tuyacn.com' }
];

// Generate Tuya signature using Node.js crypto
function generateSign(method, path, body, timestamp, accessToken = '') {
  // SHA256 hash of body (empty string hex for GET requests)
  const bodyHash = body
    ? crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')
    : crypto.createHash('sha256').update('').digest('hex');

  // Content to sign
  const contentToSign = method + '\n' + bodyHash + '\n' + path + '\n' + timestamp + '\n' + accessToken;

  // HMAC-SHA256 with clientSecret, then hex
  const hmac = crypto.createHmac('sha256', TUYA_CONFIG.clientSecret);
  hmac.update(contentToSign);
  const sign = hmac.digest('hex').toUpperCase();

  return sign;
}

// Try to get token from a specific region
async function tryGetToken(baseUrl) {
  const timestamp = Date.now();
  const method = 'GET';
  const path = '/v1.0/token?grant_type=1';
  const sign = generateSign(method, path, null, timestamp, '');

  const url = `${baseUrl}${path}`;
  console.log(`Trying ${baseUrl}...`);
  console.log('Sign:', sign);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'client_id': TUYA_CONFIG.clientId,
      'sign': sign,
      't': timestamp.toString(),
      'sign_method': 'HMAC-SHA256'
    }
  });

  const data = await response.json();
  console.log(`Response from ${baseUrl}:`, JSON.stringify(data));

  return { baseUrl, data };
}

// Get access token - try all regions
async function getAccessToken() {
  let lastError = null;

  for (const region of REGIONS) {
    try {
      const result = await tryGetToken(region.url);

      if (result.data.success) {
        console.log(`Success with region: ${region.name}`);
        return {
          accessToken: result.data.result.access_token,
          baseUrl: region.url
        };
      } else {
        lastError = result.data.msg;
      }
    } catch (error) {
      lastError = error.message;
      console.error(`Error with ${region.name}:`, error.message);
    }
  }

  throw new Error(`All regions failed. Last error: ${lastError}`);
}

// Get device status
async function getDeviceStatus(accessToken, baseUrl) {
  const timestamp = Date.now();
  const method = 'GET';
  const path = `/v1.0/devices/${TUYA_CONFIG.deviceId}/status`;
  const sign = generateSign(method, path, null, timestamp, accessToken);

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: {
      'client_id': TUYA_CONFIG.clientId,
      'sign': sign,
      't': timestamp.toString(),
      'sign_method': 'HMAC-SHA256',
      'access_token': accessToken
    }
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(`Device error: ${data.msg}`);
  }

  return data.result;
}

// Main handler
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const tokenData = await getAccessToken();
    const status = await getDeviceStatus(tokenData.accessToken, tokenData.baseUrl);

    let temperature = null;
    for (const item of status) {
      console.log('Property:', item.code, '=', item.value);
      if (item.code === 'temp_current' ||
          item.code === 'temp_current_f' ||
          item.code === 'temperature' ||
          item.code === 'temp') {
        const value = parseFloat(item.value);
        if (!isNaN(value)) {
          temperature = value > 200 ? value / 10 : value;
        }
      }
    }

    return res.status(200).json({
      success: true,
      temperature,
      raw: status,
      timestamp: new Date().toISOString(),
      region: tokenData.baseUrl
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
