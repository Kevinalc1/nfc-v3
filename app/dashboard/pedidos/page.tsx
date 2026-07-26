// app/dashboard/pedidos/page.tsx
// Server Component — fetch inicial + entrega ao Client Component

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getTodayOrders } from '@/app/actions/orders'
import OrdersBoard from './OrdersBoard'

export const dynamic = 'force-dynamic' // garante que a página nunca é servida do cache

export default async function PedidosPage() {
  const supabase = await createServerSupabaseClient()

  // ── Autenticação ──────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Restaurante do dono ───────────────────────────────────────────────────
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('id, name')
    .eq('owner_id', user.id)
    .single()

  if (!restaurant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F4EF] px-6">
        <p className="text-sm text-[#C1502E] bg-[#C1502E]/[0.08] border border-[#C1502E]/20 rounded-sm px-4 py-3">
          Nenhum restaurante encontrado para este usuário.
        </p>
      </div>
    )
  }

  // ── Pedidos do dia (fetch inicial) ────────────────────────────────────────
  // O Client Component assume esse estado inicial e mantém tudo atualizado
  // via Realtime a partir daí — sem polling, sem refresh.
  const result = await getTodayOrders()
  const initialOrders = result.ok ? result.data : []

  return (
    <div className="min-h-screen bg-[#F6F4EF]">
      <OrdersBoard
        initialOrders={initialOrders}
        restaurantId={restaurant.id}
      />
    </div>
  )
}
