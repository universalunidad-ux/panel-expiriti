import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://ovfmqqqwezfdtgrtkjhf.supabase.co'
const supabaseKey = 'sb_publishable_2ftu336Kc06w2I2iTwoIpQ_usfSTNG9'

// ⚠️ pega tus valores reales desde Settings → API
export const supabase = createClient(supabaseUrl, supabaseKey)
