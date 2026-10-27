// Ligação ao Supabase, partilhada pelo site público e pela área reservada.
// Sem VITE_SUPABASE_URL o site usa o backend Express deste projeto e não há área reservada.
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const sb = URL ? createClient(URL, KEY) : null;
