const fs = require('fs');
async function run() {
  const fileContent = fs.readFileSync('package.json');
  const blob = new Blob([fileContent], { type: 'application/json' });
  const formData = new FormData();
  formData.append('file', blob, 'package.json');
  try {
    const res = await fetch('http://localhost:2785/api/wa/advertisements/1/media', {
      method: 'POST',
      body: formData
    });
    console.log(res.status, await res.text());
  } catch (e) {
    console.error(e);
  }
}
run();
