
const http = require('http');

const data = JSON.stringify({
  topic: 'NotebookLM para empresas',
  platform: 'article',
  length: 'short',
  tone: 'conversational'
});

const options = {
  hostname: 'localhost',
  port: 3001,
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
      console.log(json.contenido);
      console.log('--- CONTENT END ---');
      
      const hasButtons = json.contenido.includes('data-type="subscribe-widget"');
      const hasWhatsApp = json.contenido.includes('WhatsApp');
      
      console.log('\nHas Subscribe Buttons:', hasButtons);
      console.log('Has WhatsApp Closing:', hasWhatsApp);
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
