
const http = require('https');

const data = JSON.stringify({
  topic: 'IA para freelancers',
  platform: 'article',
  length: 'short',
  tone: 'conversational'
});

const options = {
  hostname: '10x-studio-production.up.railway.app',
  path: '/api/generate/substack',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let responseData = '';
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  res.on('end', () => {
    try {
      const json = JSON.parse(responseData);
      console.log('--- CONTENT START ---');
      // console.log(json.contenido); // Optional: verbose output
      console.log('--- CONTENT END ---');
      
      const hasButtons = json.contenido.includes('data-type="subscribe-widget"');
      const hasWhatsApp = json.contenido.includes('WhatsApp');
      
      const widgetCount = (json.contenido.match(/data-type="subscribe-widget"/g) || []).length;
      
      console.log('\nHas Subscribe Buttons:', hasButtons);
      console.log('Widget Count:', widgetCount);
      console.log('Has WhatsApp Closing:', hasWhatsApp);
      
      if (hasButtons && widgetCount === 3 && hasWhatsApp) {
        console.log('\nSUCCESS: Production backend is updated and working correctly.');
      } else {
        console.log('\nFAILURE: Production backend still missing elements.');
      }
    } catch (e) {
      console.error('Error parsing JSON:', responseData);
    }
  });
});

req.on('error', (error) => {
  console.error('Request Error:', error.message);
});

req.write(data);
req.end();
