'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
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

type Restaurant = Tables<'restaurants'>
type Category = Tables<'categories'>
type Product = Tables<'products'>
type RestaurantTable = Tables<'restaurant_tables'>

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

type CartLine = {
  product: Product
  quantity: number
}

export default function CardapioPublicoPage() {
  const params = useParams<{ restaurantSlug: string; tableNumber: string }>()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<
    'restaurante' | 'mesa' | null
  >(null)

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [table, setTable] = useState<RestaurantTable | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])

  const [activeCategoryId, setActiveCategoryId] = useState<string | 'all'>(
    'all'
  )
  const [videoPreview, setVideoPreview] = useState<Product | null>(null)

  const [cart, setCart] = useState<Record<string, CartLine>>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [orderSent, setOrderSent] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)

  useEffect(() => {
    loadMenu()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadMenu() {
    setLoading(true)
    setLoadError(null)

    const { data: restaurantData } = await supabase
      .from('restaurants')
      .select('*')
      .eq('slug', params.restaurantSlug)
      .eq('is_active', true)
      .single()

    if (!restaurantData) {
      setLoadError('restaurante')
      setLoading(false)
      return
    }
    setRestaurant(restaurantData)

    const { data: tableData } = await supabase
      .from('restaurant_tables')
      .select('*')
      .eq('restaurant_id', restaurantData.id)
      .eq('table_number', params.tableNumber)
      .eq('is_active', true)
      .single()

    if (!tableData) {
      setLoadError('mesa')
      setLoading(false)
      return
    }
    setTable(tableData)

    const [{ data: categoriesData }, { data: productsData }] =
      await Promise.all([
        supabase
          .from('categories')
          .select('*')
          .eq('restaurant_id', restaurantData.id)
          .eq('is_active', true)
          .order('display_order'),
        supabase
          .from('products')
          .select('*')
          .eq('restaurant_id', restaurantData.id)
          .eq('is_available', true)
          .order('display_order'),
      ])

    setCategories(categoriesData ?? [])
    setProducts(productsData ?? [])
    setLoading(false)
  }

  const productsByCategory = useMemo(() => {
    const map = new Map<string, Product[]>()
    for (const product of products) {
      const key = product.category_id ?? 'sem-categoria'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(product)
    }
    return map
  }, [products])

  const visibleCategories = useMemo(() => {
    if (activeCategoryId === 'all') return categories
    return categories.filter((c) => c.id === activeCategoryId)
  }, [categories, activeCategoryId])

  const cartLines = Object.values(cart)
  const cartCount = cartLines.reduce((sum, l) => sum + l.quantity, 0)
  const cartTotal = cartLines.reduce(
    (sum, l) => sum + l.quantity * l.product.price,
    0
  )

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev[product.id]
      return {
        ...prev,
        [product.id]: {
          product,
          quantity: (existing?.quantity ?? 0) + 1,
        },
      }
    })
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((prev) => {
      const existing = prev[productId]
      if (!existing) return prev

      const nextQty = existing.quantity + delta
      if (nextQty <= 0) {
        const { [productId]: _removed, ...rest } = prev
        return rest
      }

      return {
        ...prev,
        [productId]: { ...existing, quantity: nextQty },
      }
    })
  }

  async function handleSendOrder() {
    if (!restaurant || !table || cartLines.length === 0) return

    setSending(true)
    setOrderError(null)

    try {
      const { data: order, error: orderInsertError } = await supabase
        .from('orders')
        .insert({
          restaurant_id: restaurant.id,
          table_id: table.id,
          customer_name: customerName.trim() || null,
          notes: orderNotes.trim() || null,
          total: cartTotal,
        })
        .select()
        .single()

      if (orderInsertError || !order) throw orderInsertError

      const { error: itemsInsertError } = await supabase
        .from('order_items')
        .insert(
          cartLines.map((line) => ({
            order_id: order.id,
            product_id: line.product.id,
            quantity: line.quantity,
            unit_price: line.product.price,
          }))
        )

      if (itemsInsertError) throw itemsInsertError

      setOrderSent(true)
      setCart({})
      setCartOpen(false)
    } catch (err) {
      console.error(err)
      setOrderError('Não foi possível enviar o pedido. Tente novamente.')
    } finally {
      setSending(false)
    }
  }

  // ---------- Estados de carregamento e erro ----------

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F4EF] text-sm text-[#8A8375]">
        Carregando cardápio…
      </div>
    )
  }

  if (loadError === 'restaurante') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F6F4EF] text-center px-6">
        <p className="font-[family-name:var(--font-display)] text-xl mb-2">
          Cardápio não encontrado
        </p>
        <p className="text-sm text-[#8A8375]">
          Verifique o link ou peça ajuda a um atendente.
        </p>
      </div>
    )
  }

  if (loadError === 'mesa') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F6F4EF] text-center px-6">
        <p className="font-[family-name:var(--font-display)] text-xl mb-2">
          Mesa não identificada
        </p>
        <p className="text-sm text-[#8A8375]">
          Chame um atendente para confirmar o número da sua mesa.
        </p>
      </div>
    )
  }

  if (orderSent) {
    return (
      <div
        className={`${fraunces.variable} ${inter.variable} min-h-screen flex flex-col items-center justify-center bg-[#F6F4EF] text-center px-6 font-[family-name:var(--font-body)]`}
      >
        <span className="w-12 h-12 rounded-full bg-[#3F6B4F]/[0.1] border border-[#3F6B4F]/30 flex items-center justify-center text-2xl mb-4">
          ✓
        </span>
        <p className="font-[family-name:var(--font-display)] text-2xl font-medium mb-2">
          Pedido enviado!
        </p>
        <p className="text-sm text-[#8A8375] max-w-xs">
          A cozinha já recebeu o seu pedido para a mesa {table?.table_number}.
          Fique à vontade para pedir mais alguma coisa.
        </p>
        <button
          onClick={() => setOrderSent(false)}
          className="mt-6 bg-[#2B2622] text-[#F6F4EF] text-sm font-medium rounded-sm px-5 py-2.5 hover:bg-[#3F6B4F] transition"
        >
          Voltar ao cardápio
        </button>
      </div>
    )
  }

  // ---------- Cardápio ----------

  return (
    <div
      className={`${fraunces.variable} ${inter.variable} min-h-screen bg-[#F6F4EF] text-[#2B2622] font-[family-name:var(--font-body)] pb-28`}
    >
      {/* Cabeçalho */}
      <header className="bg-[#3F6B4F] text-[#F6F4EF] px-6 pt-8 pb-6">
        <p className="text-[11px] tracking-[0.2em] uppercase text-[#CFE0D3]">
          Mesa {table?.table_number}
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium mt-1">
          {restaurant?.name}
        </h1>
        {restaurant?.description && (
          <p className="text-sm text-[#CFE0D3] mt-1.5 max-w-md">
            {restaurant.description}
          </p>
        )}
      </header>

      {/* Navegação por categoria */}
      {categories.length > 0 && (
        <div className="sticky top-0 z-10 bg-[#F6F4EF]/95 backdrop-blur border-b border-[#DAD5C9] px-6 py-3 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveCategoryId('all')}
            className={`shrink-0 text-xs font-medium rounded-full px-3.5 py-1.5 border transition ${
              activeCategoryId === 'all'
                ? 'bg-[#2B2622] text-[#F6F4EF] border-[#2B2622]'
                : 'border-[#DAD5C9] text-[#8A8375]'
            }`}
          >
            Tudo
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryId(cat.id)}
              className={`shrink-0 text-xs font-medium rounded-full px-3.5 py-1.5 border transition ${
                activeCategoryId === cat.id
                  ? 'bg-[#2B2622] text-[#F6F4EF] border-[#2B2622]'
                  : 'border-[#DAD5C9] text-[#8A8375]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Lista de produtos, agrupados por categoria */}
      <main className="px-6 py-6 space-y-8 max-w-xl mx-auto">
        {products.length === 0 && (
          <p className="text-sm text-[#8A8375] text-center py-16">
            Nenhum prato disponível no momento.
          </p>
        )}

        {visibleCategories.map((cat) => {
          const items = productsByCategory.get(cat.id) ?? []
          if (items.length === 0) return null

          return (
            <section key={cat.id}>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-medium mb-3">
                {cat.name}
              </h2>
              <div className="space-y-3">
                {items.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    quantity={cart[product.id]?.quantity ?? 0}
                    onAdd={() => addToCart(product)}
                    onChangeQuantity={(delta) =>
                      changeQuantity(product.id, delta)
                    }
                    onPlayVideo={() => setVideoPreview(product)}
                  />
                ))}
              </div>
            </section>
          )
        })}

        {/* Itens sem categoria */}
        {activeCategoryId === 'all' &&
          (productsByCategory.get('sem-categoria')?.length ?? 0) > 0 && (
            <section>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-medium mb-3">
                Outros
              </h2>
              <div className="space-y-3">
                {productsByCategory.get('sem-categoria')!.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    quantity={cart[product.id]?.quantity ?? 0}
                    onAdd={() => addToCart(product)}
                    onChangeQuantity={(delta) =>
                      changeQuantity(product.id, delta)
                    }
                    onPlayVideo={() => setVideoPreview(product)}
                  />
                ))}
              </div>
            </section>
          )}
      </main>

      {/* Barra de carrinho flutuante */}
      {cartCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-4 right-4 max-w-xl mx-auto bg-[#2B2622] text-[#F6F4EF] rounded-sm px-5 py-4 flex items-center justify-between shadow-lg"
        >
          <span className="text-sm font-medium">
            {cartCount} {cartCount === 1 ? 'item' : 'itens'}
          </span>
          <span className="text-sm font-mono">
            {currencyFormatter.format(cartTotal)}
          </span>
        </button>
      )}

      {/* Modal do carrinho / checkout */}
      {cartOpen && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-[#2B2622]/40">
          <div className="w-full max-w-xl bg-[#F6F4EF] rounded-t-lg max-h-[85vh] flex flex-col">
            <div className="border-b border-dashed border-[#DAD5C9] px-6 py-3 flex items-center justify-between shrink-0">
              <span className="text-[11px] tracking-[0.15em] uppercase text-[#8A8375]">
                Seu pedido — Mesa {table?.table_number}
              </span>
              <button
                onClick={() => setCartOpen(false)}
                className="text-sm text-[#8A8375]"
              >
                Fechar
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-4 space-y-3 flex-1">
              {cartLines.length === 0 && (
                <p className="text-sm text-[#8A8375] text-center py-8">
                  Seu carrinho está vazio.
                </p>
              )}

              {cartLines.map((line) => (
                <div
                  key={line.product.id}
                  className="flex items-center gap-3 bg-white border border-[#DAD5C9] rounded-sm px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {line.product.name}
                    </p>
                    <p className="text-xs font-mono text-[#8A8375]">
                      {currencyFormatter.format(line.product.price)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => changeQuantity(line.product.id, -1)}
                      className="w-7 h-7 rounded-full border border-[#DAD5C9] text-sm"
                    >
                      −
                    </button>
                    <span className="text-sm font-mono w-4 text-center">
                      {line.quantity}
                    </span>
                    <button
                      onClick={() => changeQuantity(line.product.id, 1)}
                      className="w-7 h-7 rounded-full border border-[#DAD5C9] text-sm"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}

              {cartLines.length > 0 && (
                <>
                  <div>
                    <label
                      htmlFor="customerName"
                      className="block text-xs font-medium text-[#8A8375] mb-1.5"
                    >
                      Seu nome (opcional)
                    </label>
                    <input
                      id="customerName"
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Para identificar o pedido"
                      className="w-full rounded-sm border border-[#DAD5C9] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3F6B4F] focus:ring-2 focus:ring-[#3F6B4F]/20 transition"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="orderNotes"
                      className="block text-xs font-medium text-[#8A8375] mb-1.5"
                    >
                      Alguma observação? (opcional)
                    </label>
                    <textarea
                      id="orderNotes"
                      rows={2}
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      placeholder="Ex.: sem cebola, ponto da carne, etc."
                      className="w-full rounded-sm border border-[#DAD5C9] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3F6B4F] focus:ring-2 focus:ring-[#3F6B4F]/20 transition resize-none"
                    />
                  </div>
                </>
              )}

              {orderError && (
                <p
                  role="alert"
                  className="text-sm text-[#C1502E] bg-[#C1502E]/[0.08] border border-[#C1502E]/20 rounded-sm px-3 py-2"
                >
                  {orderError}
                </p>
              )}
            </div>

            {cartLines.length > 0 && (
              <div className="border-t border-[#DAD5C9] px-6 py-4 shrink-0">
                <div className="flex items-center justify-between text-sm mb-3">
                  <span className="text-[#8A8375]">Total</span>
                  <span className="font-mono font-medium">
                    {currencyFormatter.format(cartTotal)}
                  </span>
                </div>
                <button
                  onClick={handleSendOrder}
                  disabled={sending}
                  className="w-full bg-[#2B2622] text-[#F6F4EF] text-sm font-medium rounded-sm py-3 hover:bg-[#3F6B4F] transition disabled:opacity-50"
                >
                  {sending ? 'Enviando…' : 'Enviar pedido'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox de vídeo */}
      {videoPreview?.video_url && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-[#2B2622]/80 px-6"
          onClick={() => setVideoPreview(null)}
        >
          <div
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={videoPreview.video_url}
              controls
              autoPlay
              className="w-full rounded-sm"
            />
            <p className="text-center text-[#F6F4EF] text-sm mt-3">
              {videoPreview.name}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------- Cartão de produto ----------

function ProductCard({
  product,
  quantity,
  onAdd,
  onChangeQuantity,
  onPlayVideo,
}: {
  product: Product
  quantity: number
  onAdd: () => void
  onChangeQuantity: (delta: number) => void
  onPlayVideo: () => void
}) {
  return (
    <div className="bg-white border border-[#DAD5C9] rounded-sm p-3 flex gap-3">
      <div className="relative w-20 h-20 rounded-sm border border-[#DAD5C9] bg-[#FBFAF7] overflow-hidden shrink-0">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-[10px] text-[#B8B2A2] text-center px-1">
            Sem foto
          </span>
        )}
        {product.video_url && (
          <button
            onClick={onPlayVideo}
            aria-label="Ver vídeo do prato"
            className="absolute inset-0 flex items-center justify-center bg-[#2B2622]/30"
          >
            <span className="w-7 h-7 rounded-full bg-[#F6F4EF] flex items-center justify-center text-xs">
              ▶
            </span>
          </button>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <h3 className="text-sm font-medium">{product.name}</h3>
        {product.description && (
          <p className="text-xs text-[#8A8375] mt-0.5 line-clamp-2">
            {product.description}
          </p>
        )}
        <div className="mt-auto pt-2 flex items-center justify-between">
          <span className="text-sm font-mono">
            {currencyFormatter.format(product.price)}
          </span>

          {quantity === 0 ? (
            <button
              onClick={onAdd}
              className="text-xs font-medium rounded-sm bg-[#2B2622] text-[#F6F4EF] px-3 py-1.5 hover:bg-[#3F6B4F] transition"
            >
              Adicionar
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onChangeQuantity(-1)}
                className="w-6 h-6 rounded-full border border-[#DAD5C9] text-xs"
              >
                −
              </button>
              <span className="text-sm font-mono w-4 text-center">
                {quantity}
              </span>
              <button
                onClick={() => onChangeQuantity(1)}
                className="w-6 h-6 rounded-full border border-[#DAD5C9] text-xs"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
