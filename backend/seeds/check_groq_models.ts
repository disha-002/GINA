import 'dotenv/config';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env['GROQ_API_KEY_1'] });
const { data: models } = await groq.models.list();
console.log('All available models:');
models.forEach((m) => console.log(' ', m.id));
