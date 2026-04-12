
const http = require('http');

const data = JSON.stringify({
  topic: 'IA para freelancers: Cómo cobrar más usando automatización',
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
    'Content-Length': Buffer.byteLength(data)
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
      console.log('--- RESPONSE METADATA ---');
      console.log('Title:', json.titulo);
      console.log('Image URL:', json.imageUrl);
      console.log('Image Prompt:', json.image_prompt);
      
      const hasImageInContent = json.contenido.includes('<img src=');
      console.log('Image Tag in Content:', hasImageInContent);
      
      if (json.imageUrl && hasImageInContent) {
        console.log('\nSUCCESS: Nano Banana image generated and prepended to article.');
      } else {
        console.log('\nFAILURE: Image not found in response.');
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
