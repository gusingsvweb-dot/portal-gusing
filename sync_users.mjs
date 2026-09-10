import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && k.trim()) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function syncUsers() {
  const { data: noUsers, error: noErr } = await supabase.from('NO_usuarios').select('*');
  if (noErr) {
    console.error('Error fetching NO_usuarios:', noErr);
    return;
  }

  const { data: ofUsers, error: ofErr } = await supabase.from('usuarios').select('usuario');
  if (ofErr) {
    console.error('Error fetching usuarios:', ofErr);
    return;
  }
  
  const ofUsernames = new Set(ofUsers.map(u => u.usuario));
  const usersToInsert = [];
  
  for (const user of noUsers) {
    if (!ofUsernames.has(user.usuario)) {
      // Keep the same ID!
      usersToInsert.push(user);
    }
  }

  if (usersToInsert.length > 0) {
    console.log(`Inserting ${usersToInsert.length} missing users into oficial db...`);
    const { data, error } = await supabase
      .from('usuarios')
      .insert(usersToInsert)
      .select();
      
    if (error) {
      console.error('Error inserting users:', error);
    } else {
      console.log('Successfully inserted users into oficial db!');
    }
  } else {
    console.log('All users from NO_usuarios already exist in oficial db.');
  }
}

syncUsers();
