'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Tables } from '@/types_db'
import { SLUG_RULES } from '@/lib/validations/restaurant'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export type Restaurant = Tables<'restaurants'>

export type RestaurantSettingsPayload = {
  name: string
  slug: string
  description: string
}

// ---------------------------------------------------------------------------
// Helper interno
// ---------------------------------------------------------------------------

async function resolveRestaurant(): Promise<
  | {
      ok: true
      restaurant: Restaurant
      supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
    }
  | { ok: false; error: string }
> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { ok: false, error: 'Usuário não autenticado.' }
  }

  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (restaurantError || !restaurant) {
    return {
      ok: false,
      error: 'Restaurante não encontrado para este usuário.',
    }
  }

  return { ok: true, restaurant, supabase }
}

// ---------------------------------------------------------------------------
// 1. getRestaurantSettings
// ---------------------------------------------------------------------------

export async function getRestaurantSettings(): Promise<
  ActionResult<Restaurant>
> {
  try {
    const resolved = await resolveRestaurant()
    if (!resolved.ok) return resolved

    return { ok: true, data: resolved.restaurant }
  } catch (err) {
    console.error('[getRestaurantSettings] unexpected', err)
    return { ok: false, error: 'Erro inesperado ao carregar as configurações.' }
  }
}

// ---------------------------------------------------------------------------
// 2. updateRestaurantSettings
// ---------------------------------------------------------------------------

export async function updateRestaurantSettings(
  input: FormData | RestaurantSettingsPayload
): Promise<ActionResult<Restaurant>> {
  try {
    let rawName: string
    let rawSlug: string
    let rawDescription: string

    if (input instanceof FormData) {
      rawName = (input.get('name') as string) ?? ''
      rawSlug = (input.get('slug') as string) ?? ''
      rawDescription = (input.get('description') as string) ?? ''
    } else {
      rawName = input.name
      rawSlug = input.slug
      rawDescription = input.description
    }

    const name = rawName.trim()
    const slug = rawSlug.trim().toLowerCase().replace(/\s+/g, '-')
    const description = rawDescription.trim()

    if (!name) {
      return { ok: false, error: 'O nome do restaurante não pode ser vazio.' }
    }
    if (name.length > 100) {
      return { ok: false, error: 'O nome deve ter no máximo 100 caracteres.' }
    }

    if (!slug) {
      return { ok: false, error: 'O slug não pode ser vazio.' }
    }
    if (slug.length < SLUG_RULES.minLength) {
      return {
        ok: false,
        error: `O slug deve ter pelo menos ${SLUG_RULES.minLength} caracteres.`,
      }
    }
    if (slug.length > SLUG_RULES.maxLength) {
      return {
        ok: false,
        error: `O slug deve ter no máximo ${SLUG_RULES.maxLength} caracteres.`,
      }
    }
    if (!SLUG_RULES.pattern.test(slug)) {
      return { ok: false, error: SLUG_RULES.patternHint }
    }

    if (description.length > 500) {
      return {
        ok: false,
        error: 'A descrição deve ter no máximo 500 caracteres.',
      }
    }

    const resolved = await resolveRestaurant()
    if (!resolved.ok) return resolved

    const { restaurant, supabase } = resolved

    if (slug !== restaurant.slug) {
      const { data: existing } = await supabase
        .from('restaurants')
        .select('id')
        .eq('slug', slug)
        .neq('id', restaurant.id)
        .maybeSingle()

      if (existing) {
        return {
          ok: false,
          error: `O slug "${slug}" já está em uso por outro restaurante. Escolha um diferente.`,
        }
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('restaurants')
      .update({
        name,
        slug,
        description: description || null,
      })
      .eq('id', restaurant.id)
      .eq('owner_id', restaurant.owner_id)
      .select()
      .single()

    if (updateError || !updated) {
      console.error('[updateRestaurantSettings]', updateError)
      return {
        ok: false,
        error: 'Não foi possível salvar as configurações. Tente novamente.',
      }
    }

    revalidatePath('/dashboard/configuracoes')
    revalidatePath(`/m/${updated.slug}`)
    if (restaurant.slug !== updated.slug) {
      revalidatePath(`/m/${restaurant.slug}`)
    }

    return { ok: true, data: updated }
  } catch (err) {
    console.error('[updateRestaurantSettings] unexpected', err)
    return {
      ok: false,
      error: 'Erro inesperado ao salvar as configurações.',
    }
  }
}

// ---------------------------------------------------------------------------
// 3. checkSlugAvailability
// ---------------------------------------------------------------------------

export async function checkSlugAvailability(
  slug: string
): Promise<ActionResult<boolean>> {
  try {
    const trimmed = slug.trim().toLowerCase()

    if (!trimmed || trimmed.length < SLUG_RULES.minLength) {
      return { ok: true, data: false }
    }

    const resolved = await resolveRestaurant()
    if (!resolved.ok) return resolved

    const { restaurant, supabase } = resolved

    const { data: existing } = await supabase
      .from('restaurants')
      .select('id')
      .eq('slug', trimmed)
      .neq('id', restaurant.id)
      .maybeSingle()

    return { ok: true, data: existing === null }
  } catch (err) {
    console.error('[checkSlugAvailability] unexpected', err)
    return { ok: true, data: true }
  }
}