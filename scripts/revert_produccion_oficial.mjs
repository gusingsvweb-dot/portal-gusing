import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import readline from 'readline';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && k.trim()) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const backupPath = 'backups/gusingsvweb-dot_s_Project_2026-10-12_21-22_datos.sql';

// Function to parse original IDs from COPY blocks in the backup file
async function extractOriginalIds() {
  const fileStream = fs.createReadStream(backupPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const originalIds = {
    pedidos_produccion: new Set(),
    pedido_etapas: new Set(),
    observaciones_pedido: new Set(),
    pedidos_bodega_items: new Set(),
    pedido_etapas_liberaciones: new Set(),
    tareas_produccion: new Set(),
  };

  let currentTable = null;

  for await (const line of rl) {
    if (line.startsWith('COPY public.')) {
      const match = line.match(/^COPY public\.([a-zA-Z0-9_]+) \(([^)]+)\) FROM stdin;/);
      if (match) {
        const tableName = match[1];
        if (originalIds[tableName] !== undefined) {
          currentTable = tableName;
        } else {
          currentTable = null;
        }
      }
      continue;
    }

    if (currentTable && line === '\\.') {
      currentTable = null;
      continue;
    }

    if (currentTable) {
      // First column in all these tables is id
      const parts = line.split('\t');
      const id = parseInt(parts[0], 10);
      if (!isNaN(id)) {
        originalIds[currentTable].add(id);
      }
    }
  }

  return originalIds;
}

async function main() {
  console.log('1. Extracting original IDs from backup...');
  const originalIds = await extractOriginalIds();
  for (const [table, ids] of Object.entries(originalIds)) {
    console.log(`   - Original ${table}: ${ids.size} rows`);
  }

  // Check current counts in official tables
  console.log('\n2. Fetching current rows from Supabase official tables...');
  
  const tablesInOrder = [
    'pedido_etapas_liberaciones',
    'pedidos_bodega_items',
    'observaciones_pedido',
    'tareas_produccion',
    'pedido_etapas',
    'pedidos_produccion',
  ];

  for (const table of tablesInOrder) {
    // PostgREST max range can be 1000, so fetch all ids
    let allCurrentIds = [];
    let from = 0;
    const step = 1000;
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select('id')
        .range(from, from + step - 1);
      
      if (error) {
        console.error(`Error fetching ${table}:`, error);
        process.exit(1);
      }
      if (!data || data.length === 0) break;
      allCurrentIds.push(...data.map(r => r.id));
      if (data.length < step) break;
      from += step;
    }

    const origSet = originalIds[table];
    const idsToDelete = allCurrentIds.filter(id => !origSet.has(id));

    console.log(`   Table ${table}:`);
    console.log(`     Total in DB now: ${allCurrentIds.length}`);
    console.log(`     Legitimate (in backup): ${allCurrentIds.filter(id => origSet.has(id)).length}`);
    console.log(`     Migrated / To delete: ${idsToDelete.length}`);

    if (idsToDelete.length > 0) {
      console.log(`     Deleting ${idsToDelete.length} rows from ${table}...`);
      // Delete in chunks of 100
      for (let i = 0; i < idsToDelete.length; i += 100) {
        const chunk = idsToDelete.slice(i, i + 100);
        const { error: delError } = await supabase
          .from(table)
          .delete()
          .in('id', chunk);

        if (delError) {
          console.error(`     Error deleting chunk from ${table}:`, delError);
          process.exit(1);
        }
      }
      console.log(`     ✓ Deleted ${idsToDelete.length} rows from ${table}`);
    }
  }

  console.log('\n3. Verifying final counts in Supabase official tables...');
  for (const table of tablesInOrder) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error(`Error counting ${table}:`, error);
    } else {
      console.log(`   - ${table}: ${count} rows (expected: ${originalIds[table].size})`);
    }
  }

  console.log('\n4. Verifying NO_ tables were NOT touched...');
  const { count: noCount } = await supabase
    .from('NO_pedidos_produccion')
    .select('*', { count: 'exact', head: true });
  console.log(`   - NO_pedidos_produccion count: ${noCount} (intact)`);

  console.log('\nDone!');
}

main().catch(console.error);
