import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { randomUUID } from 'crypto';

// read .env
const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if(k && k.trim()) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const users = [
  { usuario: 'usuario.gerencia', correo: 'gerentegral.gusing@hotmail.com', areadetrabajo: 'Gerencia' },
  { usuario: 'usuario.microbiologia', correo: 'jefemb.gusing@hotmail.com', areadetrabajo: 'Microbiología' },
  { usuario: 'usuario.mercadeo', correo: 'comercialymercadeogusing@hotmail.com', areadetrabajo: 'Mercadeo' },
  { usuario: 'usuario.direccion', correo: 'direcciontecnicagusing@gmail.com', areadetrabajo: 'Dirección Técnica' },
  { usuario: 'usuario.sgsst', correo: 'sgsst.gusing@hotmail.com', areadetrabajo: 'SG-SST' },
  { usuario: 'usuario.produccion', correo: 'jefeproduccion.gusing@hotmail.com', areadetrabajo: 'Producción' },
  { usuario: 'usuario.asegcalidad', correo: 'jefeasegcalidad.gusing@hotmail.com', areadetrabajo: 'Aseguramiento de Calidad' },
  { usuario: 'usuario.validaciones', correo: 'validaciones.gusing@hotmail.com', areadetrabajo: 'Validaciones' },
  { usuario: 'usuario.ambiental', correo: 'jsgambiental.gusing@hotmail.com', areadetrabajo: 'Gestión Ambiental' },
  { usuario: 'usuario.controlcalidad', correo: 'jefeccfq.gusing@hotmail.com', areadetrabajo: 'Control de Calidad' },
  { usuario: 'usuario.garantiacalidad', correo: 'garantiacalidad.gusing@hotmail.com', areadetrabajo: 'Garantía de Calidad' },
  { usuario: 'usuario.bodega', correo: 'bodega@gusing.com', areadetrabajo: 'Bodega' },
  { usuario: 'usuario.sst', correo: 'sst@gusing.com', areadetrabajo: 'SST' }
];

async function run() {
  const toInsert = users.map(u => ({
    id: randomUUID(),
    usuario: u.usuario,
    contrasena: 'Gusing2026*',
    rol: 'usuario',
    correo: u.correo,
    areadetrabajo: u.areadetrabajo
  }));

  const { data, error } = await supabase.from('NO_usuarios').insert(toInsert);
  
  if (error) {
    console.error('Error inserting:', error);
  } else {
    console.log('Inserted correctly!');
  }
}
run();
