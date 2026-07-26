'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fraunces, Inter } from 'next/font/google'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types_db'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-display',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
})

type Product = Tables<'products'> & {
  categories: Pick<Tables<'categories'>, 'id' | 'name'> | null
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export default function ProdutosPage() {
  const router = useRouter()

  // FIX 1: createClient() dentro de useRef para garantir que a instância é
  // criada uma única vez e não muda entre re-renders ou remontagens do
  // StrictMode — evita Promises em flight sendo abandonadas silenciosamente.
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    loadProducts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadProducts() {
    setLoading(true)
    setError(null)

    // FIX 2: try/catch cobrindo TODO o fluxo de fetch.
    // Antes, qualquer exceção (timeout, erro de rede, resposta inesperada do
    // Supabase) fazia a função parar sem chamar setLoading(false), deixando
    // a tela travada em "Carregando pratos…" eternamente sem log nenhum.
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      // FIX 3: trata o erro de autenticação explicitamente em vez de
      // confiar que `user` será null — alguns erros de rede retornam
      // error != null com user == null ao mesmo tempo.
      if (userError) {
        console.error('[produtos] auth.getUser error:', userError)
        setError('Falha ao verificar sessão. Tente recarregar a página.')
        setLoading(false)
        return
      }

      if (!user) {
        router.push('/login')
        return
      }

      const { data: restaurant, error: restaurantError } = await supabase
        .from('restaurants')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (restaurantError) {
        console.error('[produtos] restaurants query error:', restaurantError)
        setError('Não foi possível identificar o seu restaurante.')
        setLoading(false)
        return
      }

      if (!restaurant) {
        setError('Nenhum restaurante encontrado para este usuário.')
        setLoading(false)
        return
      }

      setRestaurantId(restaurant.id)

      const { data, error: fetchError } = await supabase
        .from('products')
        .select('*, categories(id, name)')
        .eq('restaurant_id', restaurant.id)
        .order('display_order')

      if (fetchError) {
        // FIX 4: loga o erro real do Supabase no console para facilitar debug
        // (ex: violação de RLS, coluna inexistente, timeout).
        console.error('[produtos] products query error:', fetchError)
        setError(`Não foi possível carregar os pratos. (${fetchError.message})`)
        setLoading(false)
        return
      }

      setProducts((data as Product[]) ?? [])
    } catch (err) {
      // FIX 5: captura exceções não tratadas (ex: fetch abortado, erro de rede)
      // que antes deixavam setLoading(false) nunca sendo chamado.
      console.error('[produtos] unexpected error:', err)
      setError('Erro inesperado ao carregar os pratos. Tente recarregar a página.')
    } finally {
      // FIX 6: finally garante que loading SEMPRE é desligado,
      // independente de qual caminho de código foi executado acima.
      setLoading(false)
    }
  }

  async function toggleAvailability(product: Product) {
    setPendingId(product.id)

    try {
      const { error: updateError } = await supabase
        .from('products')
        .update({ is_available: !product.is_available })
        .eq('id', product.id)

      if (updateError) {
        console.error('[produtos] toggleAvailability error:', updateError)
        return
      }

      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, is_available: !p.is_available } : p
        )
      )
    } catch (err) {
      console.error('[produtos] toggleAvailability unexpected:', err)
    } finally {
      setPendingId(null)
    }
  }

  async function handleDelete(product: Product) {
    const confirmed = window.confirm(
      `Remover "${product.name}" do cardápio? Essa ação não pode ser desfeita.`
    )
    if (!confirmed) return

    setPendingId(product.id)

    try {
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .eq('id', product.id)

      if (deleteError) {
        console.error('[produtos] handleDelete error:', deleteError)
        return
      }

      setProducts((prev) => prev.filter((p) => p.id !== product.id))
    } catch (err) {
      console.error('[produtos] handleDelete unexpected:', err)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div
      className={`${fraunces.variable} ${inter.variable} min-h-screen bg-[#F6F4EF] text-[#2B2622] font-[family-name:var(--font-body)] py-10 px-6`}
    >
      <div className="max-w-3xl mx-auto">

        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="hidden lg:block">
            <span className="text-xs tracking-[0.15em] uppercase text-[#8A8375]">
              Cardápio
            </span>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium mt-1">
              Pratos
            </h1>
          </div>
          <Link
            href="/dashboard/produtos/novo"
            className="shrink-0 bg-[#2B2622] text-[#F6F4EF] text-sm font-medium rounded-sm px-4 py-2.5 hover:bg-[#3F6B4F] transition"
          >
            + Novo prato
          </Link>
        </div>

        {/* Estado: carregando */}
        {loading && (
          <div className="text-sm text-[#8A8375] py-16 text-center">
            Carregando pratos…
          </div>
        )}

        {/* Estado: erro */}
        {!loading && error && (
          <div className="space-y-3">
            <p
              role="alert"
              className="text-sm text-[#C1502E] bg-[#C1502E]/[0.08] border border-[#C1502E]/20 rounded-sm px-4 py-3"
            >
              {error}
            </p>
            <button
              onClick={loadProducts}
              className="text-sm font-medium text-[#8A8375] underline underline-offset-2"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Estado: vazio */}
        {!loading && !error && products.length === 0 && (
          <div className="border border-dashed border-[#DAD5C9] rounded-sm py-16 px-6 text-center">
            <p className="font-[family-name:var(--font-display)] text-xl mb-2">
              Nenhum prato ainda
            </p>
            <p className="text-sm text-[#8A8375] mb-6">
              Cadastre o primeiro prato para ele aparecer no cardápio digital.
            </p>
            <Link
              href="/dashboard/produtos/novo"
              className="inline-block bg-[#2B2622] text-[#F6F4EF] text-sm font-medium rounded-sm px-4 py-2.5 hover:bg-[#3F6B4F] transition"
            >
              + Novo prato
            </Link>
          </div>
        )}

        {/* Lista de pratos */}
        {!loading && !error && products.length > 0 && (
          <ul className="space-y-3">
            {products.map((product) => (
              <li
                key={product.id}
                className="bg-white border border-[#DAD5C9] rounded-sm px-5 py-4 flex items-center gap-4"
              >
                {/* Miniatura */}
                <div className="w-16 h-16 rounded-sm border border-[#DAD5C9] bg-[#FBFAF7] overflow-hidden flex items-center justify-center shrink-0">
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] text-[#B8B2A2] text-center px-1">
                      Sem foto
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium text-sm truncate">
                      {product.name}
                    </h2>
                    {product.video_url && (
                      <span className="text-[10px] uppercase tracking-wide text-[#3F6B4F] bg-[#3F6B4F]/[0.08] border border-[#3F6B4F]/20 rounded-sm px-1.5 py-0.5 shrink-0">
                        Vídeo
                      </span>
                    )}
                  </div>
                  {product.categories?.name && (
                    <p className="text-xs text-[#8A8375] mt-0.5">
                      {product.categories.name}
                    </p>
                  )}
                  <p className="text-sm font-mono mt-1">
                    {currencyFormatter.format(product.price)}
                  </p>
                </div>

                {/* Disponibilidade */}
                <button
                  onClick={() => toggleAvailability(product)}
                  disabled={pendingId === product.id}
                  className={`shrink-0 text-xs font-medium rounded-sm px-3 py-1.5 border transition disabled:opacity-50 ${
                    product.is_available
                      ? 'border-[#3F6B4F]/30 bg-[#3F6B4F]/[0.08] text-[#3F6B4F]'
                      : 'border-[#DAD5C9] bg-[#F6F4EF] text-[#8A8375]'
                  }`}
                >
                  {product.is_available ? 'Disponível' : 'Pausado'}
                </button>

                {/* Ações */}
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/dashboard/produtos/${product.id}/editar`}
                    className="text-xs font-medium rounded-sm border border-[#DAD5C9] px-3 py-1.5 hover:bg-[#F6F4EF] transition"
                  >
                    Editar
                  </Link>
                  <button
                    onClick={() => handleDelete(product)}
                    disabled={pendingId === product.id}
                    className="text-xs font-medium rounded-sm border border-[#C1502E]/30 text-[#C1502E] px-3 py-1.5 hover:bg-[#C1502E]/[0.08] transition disabled:opacity-50"
                  >
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
