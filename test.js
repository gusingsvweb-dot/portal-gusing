import 'dotenv/config';
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
fetch(`${url}/rest/v1/NO_areas?select=*`, {
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`
  }
}).then(r => r.json()).then(console.log).catch(console.error);
