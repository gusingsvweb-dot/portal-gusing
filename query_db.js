import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://hmvznxwwaoassdiqlaax.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || '...'; // Need the anon key. It is in .env of the project.
