const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
async function run() {
  const formData = new FormData();
  formData.append('file', fs.createReadStream('package.json'));
  try {
    const res = await axios.post('http://localhost:2886/api/wa/advertisements/1/media', formData, {
      headers: { ...formData.getHeaders(), 'X-API-Key': 'dev-admin-key' }
    });
    console.log(res.status, res.data);
  } catch (e) {
    if (e.response) {
      console.log(e.response.status, e.response.data);
    } else {
      console.error(e.message);
    }
  }
}
run();
