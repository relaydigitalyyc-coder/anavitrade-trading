import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

const page = await browser.newPage();
const apiRequests = [];
const apiResponses = {};

// Intercept all requests
await page.setRequestInterception(true);
page.on('request', req => {
  if (req.url().includes('api.coinlegs.com')) {
    apiRequests.push({
      url: req.url(),
      method: req.method(),
      postData: req.postData()
    });
  }
  req.continue();
});

page.on('response', async resp => {
  if (resp.url().includes('api.coinlegs.com')) {
    try {
      const json = await resp.json();
      apiResponses[resp.url()] = json;
    } catch(e) {}
  }
});

console.log('Navigating to coinlegs...');
await page.goto('https://www.coinlegs.com/detections', { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 5000));

console.log('\nAPI requests made:');
apiRequests.forEach(r => {
  console.log(`${r.method} ${r.url}`);
  if (r.postData) console.log('  Body:', r.postData.substring(0, 400));
});

console.log('\nAPI responses:');
for (const [url, data] of Object.entries(apiResponses)) {
  if (url.includes('SelectDetections')) {
    console.log(`\n${url}:`);
    console.log(JSON.stringify(data, null, 2).substring(0, 2000));
  }
}

await browser.close();
