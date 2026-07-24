'use client'

import { useEffect, useState } from 'react'
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
  const supabase = createClient()

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

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!restaurant) {
      setError('Não foi possível identificar o seu restaurante.')
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
      setError('Não foi possível carregar os pratos.')
    } else {
      setProducts((data as Product[]) ?? [])
    }

    setLoading(false)
  }

  async function toggleAvailability(product: Product) {
    setPendingId(product.id)

    const { error: updateError } = await supabase
      .from('products')
      .update({ is_available: !product.is_available })
      .eq('id', product.id)

    if (!updateError) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id ? { ...p, is_available: !p.is_available } : p
        )
      )
    }

    setPendingId(null)
  }

  async function handleDelete(product: Product) {
    const confirmed = window.confirm(
      `Remover "${product.name}" do cardápio? Essa ação não pode ser desfeita.`
    )
    if (!confirmed) return

    setPendingId(product.id)

    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('id', product.id)

    if (!deleteError) {
      setProducts((prev) => prev.filter((p) => p.id !== product.id))
    }

    setPendingId(null)
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
          <p
            role="alert"
            className="text-sm text-[#C1502E] bg-[#C1502E]/[0.08] border border-[#C1502E]/20 rounded-sm px-4 py-3"
          >
            {error}
          </p>
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
