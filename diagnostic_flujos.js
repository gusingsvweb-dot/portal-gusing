
const supabaseUrl = 'https://hmvznxwwaoassdiqlaax.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdnpueHd3YW9hc3NkaXFsYWF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzQyNjYzNCwiZXhwIjoyMDc5MDAyNjM0fQ.Cbu2aSH3Gk6T_poLxEUkhH3vBEf5BPqrD6CPybOrn5c';

async function sbQuery(table, select = '*', filter = '') {
    const url = `${supabaseUrl}/rest/v1/${table}?select=${select}${filter}`;
    const res = await fetch(url, {
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
        }
    });
    return res.json();
}

async function diagnostic() {
    console.log("--- DIAGNÓSTICO DE FLUJOS (REST) ---");
    try {
        const flujos = await sbQuery('flujos_forma', '*', '&activo=eq.true');
        console.log("Flujos activos found:", flujos.length);
        
        for (const f of flujos) {
            console.log(`\nFlujo: ${f.forma_farmaceutica} (ID: ${f.id})`);
            const etapas = await sbQuery('flujos_forma_etapas', '*', `&flujo_id=eq.${f.id}&order=orden.asc`);
            console.log(`  Etapas: ${etapas.length}`);
            etapas.forEach(e => {
                console.log(`    [${e.orden}] ${e.nombre} (Libera: ${e.rol_liberador || 'Nadie'})`);
            });
        }

        console.log("\n--- REVISANDO PEDIDO #1 ---");
        const pedidos = await sbQuery('pedidos_produccion', '*,productos(*)', '&id=eq.1');
        const p = pedidos[0];
        if (!p) {
            console.error("Pedido #1 no encontrado.");
        } else {
            console.log(`Pedido #1: ${p.productos?.articulo} | Forma: ${p.productos?.forma_farmaceutica}`);
            const pe = await sbQuery('pedido_etapas', '*', `&pedido_id=eq.1&order=orden.asc`);
            console.log(`Etapas creadas para pedido #1: ${pe?.length || 0}`);
            pe?.forEach(e => {
                console.log(`  [${e.orden}] ${e.nombre} | Estado: ${e.estado}`);
            });
        }
    } catch (e) {
        console.error("Error en diagnóstico:", e);
    }
}

diagnostic();
