'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Tables } from '@/types_db'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export type OrderStatus = Tables<'orders'>['status']

export type OrderItem = Tables<'order_items'> & {
  products: Pick<Tables<'products'>, 'name'> | null
}

export type Order = Tables<'orders'> & {
  restaurant_tables: Pick<Tables<'restaurant_tables'>, 'table_number'> | null
  order_items: OrderItem[]
}

// Transições de status permitidas — a cozinha só avança, nunca volta
// (exceto cancelar, que pode acontecer de qualquer estado ativo)
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready',     'cancelled'],
  ready:     ['delivered', 'cancelled'],
  delivered: [],   // terminal
  cancelled: [],   // terminal
}

// ---------------------------------------------------------------------------
// Helper interno
// ---------------------------------------------------------------------------

async function resolveRestaurantId(): Promise<
  | { ok: true; restaurantId: string; supabase: Awaited<ReturnType<typeof createServerSupabaseClient>> }
  | { ok: false; error: string }
> {
  const supabase = await createServerSupabaseClient()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { ok: false, error: 'Usuário não autenticado.' }

  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (restaurantError || !restaurant) {
    return { ok: false, error: 'Restaurante não encontrado.' }
  }

  return { ok: true, restaurantId: restaurant.id, supabase }
}

// ---------------------------------------------------------------------------
// 1. getTodayOrders
//    Busca pedidos do dia + pedidos ativos de dias anteriores.
//    Chamada pelo Server Component para o fetch inicial.
// ---------------------------------------------------------------------------

export async function getTodayOrders(): Promise<ActionResult<Order[]>> {
  try {
    const resolved = await resolveRestaurantId()
    if (!resolved.ok) return resolved

    const { restaurantId, supabase } = resolved

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        restaurant_tables ( table_number ),
        order_items (
          *,
          products ( name )
        )
      `)
      .eq('restaurant_id', restaurantId)
      .or(
        `status.in.(pending,confirmed,preparing,ready),created_at.gte.${todayStart.toISOString()}`
      )
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[getTodayOrders]', error)
      return { ok: false, error: 'Não foi possível carregar os pedidos.' }
    }

    return { ok: true, data: (data as Order[]) ?? [] }
  } catch (err) {
    console.error('[getTodayOrders] unexpected', err)
    return { ok: false, error: 'Erro inesperado ao carregar os pedidos.' }
  }
}

// ---------------------------------------------------------------------------
// 2. updateOrderStatus
//    Avança (ou cancela) o status de um pedido.
//    Valida a transição antes de persistir.
// ---------------------------------------------------------------------------

export async function updateOrderStatus(
  orderId: string,
  nextStatus: OrderStatus
): Promise<ActionResult<Tables<'orders'>>> {
  try {
    if (!orderId?.trim()) return { ok: false, error: 'ID do pedido inválido.' }

    const resolved = await resolveRestaurantId()
    if (!resolved.ok) return resolved

    const { restaurantId, supabase } = resolved

    // Busca o status atual para validar a transição
    const { data: current, error: fetchError } = await supabase
      .from('orders')
      .select('id, status')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId) // garante que o pedido é deste restaurante
      .single()

    if (fetchError || !current) {
      return { ok: false, error: 'Pedido não encontrado.' }
    }

    const allowed = ALLOWED_TRANSITIONS[current.status as OrderStatus]
    if (!allowed.includes(nextStatus)) {
      return {
        ok: false,
        error: `Não é possível mover de "${current.status}" para "${nextStatus}".`,
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({ status: nextStatus })
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .select()
      .single()

    if (updateError || !updated) {
      console.error('[updateOrderStatus]', updateError)
      return { ok: false, error: 'Não foi possível atualizar o pedido.' }
    }

    revalidatePath('/dashboard/pedidos')
    return { ok: true, data: updated }
  } catch (err) {
    console.error('[updateOrderStatus] unexpected', err)
    return { ok: false, error: 'Erro inesperado ao atualizar o pedido.' }
  }
}