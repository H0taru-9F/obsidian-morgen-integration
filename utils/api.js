const axios = require('axios');

const MORGEN_BASE_URL = 'https://api.morgen.so/v3';

async function morgenRequest(method, path, data = null) {
  const url = `${MORGEN_BASE_URL}${path}`;
  console.log(`[MORGEN REQ] ${method} ${path}`);
  try {
    const response = await axios({
      method,
      url,
      headers: {
        'Authorization': `ApiKey ${process.env.MORGEN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      data,
      timeout: 10000
    });
    return response.data;
  } catch (err) {
    console.error(`[MORGEN ERR] ${method} ${path}:`, JSON.stringify(err.response?.data ?? err.message, null, 2));
    return null;
  }
}

module.exports = { morgenRequest };
