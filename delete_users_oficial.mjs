import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && k.trim()) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function checkDelete() {
  const usersToDelete = [
    'usuario.bodega',
    'usuario.controlcalidad',
    'usuario.produccion',
    'usuario.microbiologia',
    'usuario.gerencia'
  ];

  const { data: users, error: checkError } = await supabase
    .from('usuarios')
    .select('usuario')
    .in('usuario', usersToDelete);
    
  if (checkError) {
    console.error('Error checking users:', checkError);
    return;
  }
  
  if (users.length > 0) {
    console.log('Found in oficial db, deleting...');
    const { data, error } = await supabase
      .from('usuarios')
      .delete()
      .in('usuario', usersToDelete)
      .select();

    if (error) {
      console.error('Error deleting users:', error);
    } else {
      console.log('Deleted users from OFICIAL db:', data.map(d => d.usuario));
    }
  } else {
    console.log('Users not found in OFICIAL db, no action needed.');
  }
}

checkDelete();
