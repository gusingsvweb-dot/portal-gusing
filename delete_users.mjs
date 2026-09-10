import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && k.trim()) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function deleteUsers() {
  const usersToDelete = [
    'usuario.bodega',
    'usuario.controlcalidad',
    'usuario.produccion',
    'usuario.microbiologia',
    'usuario.gerencia',
    // also the others created in that batch just in case? 
    // the user said "eliminemos los usuarios tipo usuarios normales de esas areas" 
    // The image showed:
    // usuario.ambiental
    // usuario.asegcalidad
    // usuario.direccion
    // usuario.garantiacalidad
    // usuario.mercadeo
    // usuario.sgsst
    // usuario.sst
    // usuario.validaciones
    // If we only delete the 5 mentioned, let's just delete the 5 mentioned. Or maybe all of them? 
    // "eliminemos los usuarios tipo usuarios normales de esas areas". The image shows many.
    // Let's delete the specific ones from the prompt: "los de la imagen y microbiologia y gerencia"
    // The image has: Bodega, Jefe control de calidad, Jefe de Producción Gusing.
    // Let's just delete them all since they can all access it if I add it to their menus? 
    // Wait, I only added the menu to 5 roles. Let me delete only those 5 for now.
  ];

  const { data, error } = await supabase
    .from('NO_usuarios')
    .delete()
    .in('usuario', usersToDelete)
    .select();

  if (error) {
    console.error('Error deleting users:', error);
  } else {
    console.log('Deleted users:', data.map(d => d.usuario));
  }
}

deleteUsers();
