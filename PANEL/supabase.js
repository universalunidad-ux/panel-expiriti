import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'AQUI_TU_URL'
const supabaseKey = 'AQUI_TU_ANON_KEY'

// ⚠️ pega tus valores reales desde Settings → API
export const supabase = createClient(supabaseUrl, supabaseKey)
