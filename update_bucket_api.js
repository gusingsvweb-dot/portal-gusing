import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data, error } = await supabase.storage.updateBucket('compras_adjuntos', {
    public: true,
    allowedMimeTypes: null,
    fileSizeLimit: null
  });
  console.log("Update Bucket Result:", data, error);
}
run();
