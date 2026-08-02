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

export type RestaurantTable = Tables<'restaurant_tables'>

import { generateTableSlug } from '@/lib/validations/tables'

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
    return { ok: false, error: 'Restaurante não encontrado para este usuário.' }
  }

  return { ok: true, restaurantId: restaurant.id, supabase }
}

// ---------------------------------------------------------------------------
// 1. getTables
// ---------------------------------------------------------------------------

export async function getTables(): Promise<ActionResult<RestaurantTable[]>> {
  try {
    const resolved = await resolveRestaurantId()
    if (!resolved.ok) return resolved

    const { restaurantId, supabase } = resolved

    const { data, error } = await supabase
      .from('restaurant_tables')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[getTables]', error)
      return { ok: false, error: 'Não foi possível carregar as mesas.' }
    }

    return { ok: true, data: data ?? [] }
  } catch (err) {
    console.error('[getTables] unexpected', err)
    return { ok: false, error: 'Erro inesperado ao carregar as mesas.' }
  }
}

// ---------------------------------------------------------------------------
// 2. createTable
//    Gera table_slug automaticamente a partir do nome digitado pelo dono.
//    O dono digita "Mesa 2" → exibe "Mesa 2" → URL usa "mesa-2".
// ---------------------------------------------------------------------------

export async function createTable(
  name: string
): Promise<ActionResult<RestaurantTable>> {
  try {
    const trimmedName = name?.trim()

    if (!trimmedName) {
      return { ok: false, error: 'O nome/número da mesa não pode ser vazio.' }
    }
    if (trimmedName.length > 50) {
      return { ok: false, error: 'O nome da mesa deve ter no máximo 50 caracteres.' }
    }

    const tableSlug = generateTableSlug(trimmedName)

    if (!tableSlug) {
      return { ok: false, error: 'Nome inválido. Use letras, números ou espaços.' }
    }

    const resolved = await resolveRestaurantId()
    if (!resolved.ok) return resolved

    const { restaurantId, supabase } = resolved

    // Verifica duplicata pelo slug (não pelo nome bruto — "Mesa 2" e "mesa 2" são iguais)
    const { data: existingSlug } = await supabase
      .from('restaurant_tables')
      .select('id, table_number')
      .eq('restaurant_id', restaurantId)
      .eq('table_slug', tableSlug)
      .maybeSingle()

    if (existingSlug) {
      return {
        ok: false,
        error: `Já existe uma mesa com esse nome ("${existingSlug.table_number}"). Escolha um nome diferente.`,
      }
    }

    const qrCodeToken = crypto.randomUUID()

    const { data, error } = await supabase
      .from('restaurant_tables')
      .insert({
        restaurant_id: restaurantId,
        table_number:  trimmedName,   // nome original para exibição
        table_slug:    tableSlug,     // slug normalizado para URL
        qr_code_token: qrCodeToken,
        is_active:     true,
      })
      .select()
      .single()

    if (error || !data) {
      console.error('[createTable]', error)
      return { ok: false, error: 'Não foi possível criar a mesa.' }
    }

    revalidatePath('/dashboard/mesas')
    return { ok: true, data }
  } catch (err) {
    console.error('[createTable] unexpected', err)
    return { ok: false, error: 'Erro inesperado ao criar a mesa.' }
  }
}

// ---------------------------------------------------------------------------
// 3. deleteTable
// ---------------------------------------------------------------------------

export async function deleteTable(id: string): Promise<ActionResult> {
  try {
    if (!id?.trim()) return { ok: false, error: 'ID da mesa inválido.' }

    const resolved = await resolveRestaurantId()
    if (!resolved.ok) return resolved

    const { restaurantId, supabase } = resolved

    const { error } = await supabase
      .from('restaurant_tables')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', restaurantId)

    if (error) {
      console.error('[deleteTable]', error)

      const hasFkViolation =
        error.code === '23503' ||
        error.message?.toLowerCase().includes('foreign key')

      if (hasFkViolation) {
        return {
          ok: false,
          error: 'Esta mesa possui pedidos registrados e não pode ser excluída. Desative-a em vez de excluir.',
        }
      }

      return { ok: false, error: 'Não foi possível excluir a mesa.' }
    }

    revalidatePath('/dashboard/mesas')
    return { ok: true, data: undefined }
  } catch (err) {
    console.error('[deleteTable] unexpected', err)
    return { ok: false, error: 'Erro inesperado ao excluir a mesa.' }
  }
}

// ---------------------------------------------------------------------------
// 4. toggleTableActive
// ---------------------------------------------------------------------------

export async function toggleTableActive(
  id: string,
  isActive: boolean
): Promise<ActionResult<RestaurantTable>> {
  try {
    if (!id?.trim()) return { ok: false, error: 'ID da mesa inválido.' }

    const resolved = await resolveRestaurantId()
    if (!resolved.ok) return resolved

    const { restaurantId, supabase } = resolved

    const { data, error } = await supabase
      .from('restaurant_tables')
      .update({ is_active: isActive })
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single()

    if (error || !data) {
      console.error('[toggleTableActive]', error)
      return { ok: false, error: 'Não foi possível atualizar a mesa.' }
    }

    revalidatePath('/dashboard/mesas')
    return { ok: true, data }
  } catch (err) {
    console.error('[toggleTableActive] unexpected', err)
    return { ok: false, error: 'Erro inesperado ao atualizar a mesa.' }
  }
}