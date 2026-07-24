'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Tables } from '@/types_db'

// ---------------------------------------------------------------------------
// Tipos de retorno
// ---------------------------------------------------------------------------

// Todas as actions retornam um discriminated union { ok, data?, error? }
// para que o Client Component consiga tratar sucesso e erro de forma
// segura em TypeScript, sem depender de try/catch no lado do cliente.

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export type RestaurantTable = Tables<'restaurant_tables'>

// ---------------------------------------------------------------------------
// Helper interno: resolve o restaurant_id do usuário logado.
// Centralizar aqui evita repetir a lógica nas três actions abaixo.
// ---------------------------------------------------------------------------

async function resolveRestaurantId(): Promise<
  | { ok: true; restaurantId: string; supabase: Awaited<ReturnType<typeof createServerSupabaseClient>> }
  | { ok: false; error: string }
> {
  const supabase = await createServerSupabaseClient()

  // 1. Sessão — getUser() valida o JWT no servidor (mais seguro que getSession)
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { ok: false, error: 'Usuário não autenticado.' }
  }

  // 2. Restaurante vinculado ao owner_id — o RLS garante que só o dono acessa
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
// 1. getTables — busca todas as mesas do restaurante do usuário logado
// ---------------------------------------------------------------------------
//
// Ordenação: mesas ativas antes das inativas, depois por criação.
// O cruzamento owner_id → restaurant_id já é feito no resolveRestaurantId,
// então o filtro .eq('restaurant_id', ...) abaixo é suficiente para garantir
// isolamento entre restaurantes (além do RLS da tabela).

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
// 2. createTable — cria uma nova mesa com QR code token seguro e único
// ---------------------------------------------------------------------------
//
// Validações:
//   - name não pode ser vazio nem ultrapassar 50 caracteres
//   - table_number deve ser único por restaurante (a constraint já existe no
//     banco, mas validamos antes para entregar mensagem amigável ao usuário)
//
// O qr_code_token usa crypto.randomUUID() — disponível no runtime do Node.js
// 18+ e no Edge Runtime do Next.js. Esse token é o que vai na URL pública
// do QR Code/NFC: /m/[restaurantSlug]/[tableNumber]?token=[qr_code_token]
// (o token permite invalidar o QR sem mudar o número da mesa).

export async function createTable(
  name: string
): Promise<ActionResult<RestaurantTable>> {
  try {
    // --- Validação do input ---
    const trimmedName = name?.trim()

    if (!trimmedName) {
      return { ok: false, error: 'O nome/número da mesa não pode ser vazio.' }
    }

    if (trimmedName.length > 50) {
      return {
        ok: false,
        error: 'O nome da mesa deve ter no máximo 50 caracteres.',
      }
    }

    // --- Autenticação e restaurante ---
    const resolved = await resolveRestaurantId()
    if (!resolved.ok) return resolved

    const { restaurantId, supabase } = resolved

    // --- Verifica duplicata antes do insert para mensagem amigável ---
    const { data: existing } = await supabase
      .from('restaurant_tables')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('table_number', trimmedName)
      .maybeSingle()

    if (existing) {
      return {
        ok: false,
        error: `Já existe uma mesa com o nome "${trimmedName}".`,
      }
    }

    // --- Token único para o QR Code / NFC ---
    const qrCodeToken = crypto.randomUUID()

    // --- Insert ---
    const { data, error } = await supabase
      .from('restaurant_tables')
      .insert({
        restaurant_id: restaurantId,
        table_number: trimmedName,
        qr_code_token: qrCodeToken,
        is_active: true,
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
// 3. deleteTable — remove uma mesa pelo id
// ---------------------------------------------------------------------------
//
// Segurança: o .eq('restaurant_id', restaurantId) garante que um dono
// não consiga deletar a mesa de outro restaurante mesmo que descubra o UUID.
// O ON DELETE RESTRICT nas orders impede remover mesas com pedidos vinculados
// — o banco retorna erro e a action entrega mensagem amigável.

export async function deleteTable(id: string): Promise<ActionResult> {
  try {
    // --- Validação básica do id ---
    if (!id?.trim()) {
      return { ok: false, error: 'ID da mesa inválido.' }
    }

    // --- Autenticação e restaurante ---
    const resolved = await resolveRestaurantId()
    if (!resolved.ok) return resolved

    const { restaurantId, supabase } = resolved

    // --- Delete com filtro duplo (id + restaurant_id) ---
    const { error } = await supabase
      .from('restaurant_tables')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', restaurantId)

    if (error) {
      console.error('[deleteTable]', error)

      // FK violation: a mesa tem pedidos vinculados (ON DELETE RESTRICT)
      const hasFkViolation =
        error.code === '23503' ||
        error.message?.toLowerCase().includes('foreign key')

      if (hasFkViolation) {
        return {
          ok: false,
          error:
            'Esta mesa possui pedidos registrados e não pode ser excluída. Desative-a em vez de excluir.',
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
// 4. toggleTableActive — ativa ou desativa uma mesa sem excluí-la
// ---------------------------------------------------------------------------
//
// Útil quando a mesa tem pedidos (não pode ser deletada) mas você quer
// tirá-la do cardápio público temporariamente.

export async function toggleTableActive(
  id: string,
  isActive: boolean
): Promise<ActionResult<RestaurantTable>> {
  try {
    if (!id?.trim()) {
      return { ok: false, error: 'ID da mesa inválido.' }
    }

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