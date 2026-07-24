import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types_db'

// Client Supabase para uso exclusivo em:
//   - Server Components
//   - Server Actions ('use server')
//   - Route Handlers (app/api/*)
//
// NÃO use este client em Client Components ('use client') —
// para isso existe lib/supabase/client.ts (createBrowserClient).
//
// O @supabase/ssr exige acesso ao cookie store do Next.js para
// ler/escrever a sessão do usuário sem expô-la ao browser.

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Em Server Components (read-only) o set é ignorado silenciosamente.
            // Em Server Actions e Route Handlers o set funciona normalmente.
          }
        },
      },
    }
  )
}