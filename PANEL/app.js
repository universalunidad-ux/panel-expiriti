import { supabase } from './supabase.js'

// 🔐 Validar sesión en cada página protegida
export async function requireAuth() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    window.location.href = 'index.html'
  }
  return data.session
}

// 🧾 Bitácora
export async function logAccion({ accion, documento_id = null, cliente_id = null, detalle = {} }) {
  const { data } = await supabase.auth.getUser()
  const user = data.user

  if (!user) return

  await supabase.from('bitacora').insert({
    usuario_id: user.id,
    accion,
    documento_id,
    cliente_id,
    detalle
  })
}
