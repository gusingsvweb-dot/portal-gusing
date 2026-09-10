import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://hmvznxwwaoassdiqlaax.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '...';
// Wait, I can't hardcode the key.
