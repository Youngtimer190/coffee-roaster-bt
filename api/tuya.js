// Tuya API Endpoint for Vercel Serverless Functions
// Handles authentication and device status requests

import CryptoJS from 'crypto-js';

// Configuration
const TUYA_CONFIG = {
  clientId: 'nwqkpdpm4a7yga445fsm',
  clientSecret: '8c50b1ece0fb47acb06be00f2a731059',
  deviceId: 'bf64bef5qnf76lbz',
  baseUrl: 'https://openapi.tuyaeu.com' // Europa - zmień na tuyaus.com dla USA
};

// Generate Tuya signature
function generateSign(method, path, body, timestamp, accessToken = '') {
  const contentToSign = method + '\n' +
    (body ? JSON.stringify(body) : '') + '\n' +
    path + '\n' +
    timestamp + '\n' +
    accessToken;

  const sign = CryptoJS.HmacSHA256(contentToSign, TUYA_CONFIG.clientSecret);
  return CryptoJS.enc.Base64.stringify(sign);
}

// Get access token from Tuya
async function getAccessToken() {
  const timestamp = Date.now();
  const method = 'GET';
  const path = '/v1.0/token?grant_type=1';
  const sign = generateSign(method, path, null, timestamp);

  const response = await fetch(`${TUYA_CONFIG.baseUrl}${path}`, {
    method: 'GET',
    headers: {
      'client_id': TUYA_CONFIG.clientId,
      'sign': sign,
      't': timestamp.toString(),
      'sign_method': 'HMAC-SHA256'
    }
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(`Tuya token error: ${data.msg}`);
  }

  return data.result;
}

// Get device status
async function getDeviceStatus(accessToken) {
  const timestamp = Date.now();
  const method = 'GET';
  const path = `/v1.0/devices/${TUYA_CONFIG.deviceId}/status`;
  const sign = generateSign(method, path, null, timestamp, accessToken);

  const response = await fetch(`${TUYA_CONFIG.baseUrl}${path}`, {
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
    throw new Error(`Tuya device error: ${data.msg}`);
  }

  return data.result;
}

// Main handler
export default async function handler(req, res) {
  // Enable CORS
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
    // Get access token
    const tokenData = await getAccessToken();
    const accessToken = tokenData.access_token;

    // Get device status
    const status = await getDeviceStatus(accessToken);

    // Find temperature value
    // KT210 typically reports temperature in 'temp_current' or 'temp_current_f'
    let temperature = null;

    for (const item of status) {
      // Common temperature property codes for Tuya temp sensors
      if (item.code === 'temp_current' ||
          item.code === 'temp_current_f' ||
          item.code === 'temperature' ||
          item.code === 'temp' ||
          item.code === 'current_temperature') {
        // Temperature is usually in 0.1°C units or direct value
        const value = parseFloat(item.value);
        if (!isNaN(value)) {
          // Check if value needs conversion (0.1°C units)
          temperature = value > 200 ? value / 10 : value;
        }
      }
    }

    return res.status(200).json({
      success: true,
      temperature: temperature,
      raw: status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Tuya API error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
