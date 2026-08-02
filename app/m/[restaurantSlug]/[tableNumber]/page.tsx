'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { Fraunces, Inter } from 'next/font/google'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types_db'
import type { RealtimeChannel } from '@supabase/supabase-js'

const fraunces = Fraunces({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-display' })
const inter    = Inter({    subsets: ['latin'],                          variable: '--font-body'    })

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Restaurant      = Tables<'restaurants'>
type Category        = Tables<'categories'>
type Product         = Tables<'products'>
type RestaurantTable = Tables<'restaurant_tables'>
type OrderStatus     = Tables<'orders'>['status']

type OrderItem = Tables<'order_items'> & {
  products: Pick<Tables<'products'>, 'name' | 'image_url'> | null
}
type Order = Tables<'orders'> & { order_items: OrderItem[] }
type CartLine = { product: Product; quantity: number }

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const LS_NAME_KEY = 'vibe_customer_name'

const STATUS_CONFIG: Record<OrderStatus, { label: string; badge: string; dot: string; pulse: boolean }> = {
  pending:   { label: 'Aguardando',  badge: 'bg-[#E3A72E]/10 text-[#A87209] border-[#E3A72E]/40', dot: 'bg-[#E3A72E]', pulse: true  },
  confirmed: { label: 'Confirmado',  badge: 'bg-[#3F6B4F]/10 text-[#3F6B4F] border-[#3F6B4F]/40', dot: 'bg-[#3F6B4F]', pulse: false },
  preparing: { label: 'Preparando',  badge: 'bg-[#4A72A6]/10 text-[#4A72A6] border-[#4A72A6]/40', dot: 'bg-[#4A72A6]', pulse: true  },
  ready:     { label: '✓ Pronto!',   badge: 'bg-[#7B5EA7]/10 text-[#7B5EA7] border-[#7B5EA7]/40', dot: 'bg-[#7B5EA7]', pulse: true  },
  delivered: { label: 'Entregue',    badge: 'bg-[#DAD5C9] text-[#8A8375] border-[#DAD5C9]',        dot: 'bg-[#B8B2A2]', pulse: false },
  cancelled: { label: 'Cancelado',   badge: 'bg-[#C1502E]/10 text-[#C1502E] border-[#C1502E]/40', dot: 'bg-[#C1502E]', pulse: false },
}

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function CardapioPublicoPage() {
  const params   = useParams<{ restaurantSlug: string; tableNumber: string }>()

  // decodeURIComponent converte "mesa%202" → "mesa 2", "caf%C3%A9" → "café" etc.
  // O Next.js pode entregar o param ainda encodado dependendo de como a URL foi gerada.
  const restaurantSlug = decodeURIComponent(params.restaurantSlug)
  const tableNumber    = decodeURIComponent(params.tableNumber)
  const supabase = useRef(createClient()).current

  // ── Tab ativa ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'cardapio' | 'comanda'>('cardapio')

  // ── Dados do restaurante ──────────────────────────────────────────────────
  const [loading,    setLoading]    = useState(true)
  const [loadError,  setLoadError]  = useState<'restaurante' | 'mesa' | null>(null)
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [table,      setTable]      = useState<RestaurantTable | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [products,   setProducts]   = useState<Product[]>([])

  // ── Navegação cardápio ────────────────────────────────────────────────────
  const [activeCategoryId, setActiveCategoryId] = useState<string | 'all'>('all')
  const [videoPreview,     setVideoPreview]      = useState<Product | null>(null)

  // ── Carrinho ──────────────────────────────────────────────────────────────
  const [cart,       setCart]       = useState<Record<string, CartLine>>({})
  const [cartOpen,   setCartOpen]   = useState(false)
  const [orderNotes, setOrderNotes] = useState('')
  const [sending,    setSending]    = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)

  // ── Identificação — nome obrigatório, salvo no localStorage ───────────────
  const [customerName,   setCustomerName]   = useState('')
  const [nameError,      setNameError]      = useState('')

  // ── Comanda da mesa ───────────────────────────────────────────────────────
  const [tableOrders,     setTableOrders]     = useState<Order[]>([])
  const [comandaLoading,  setComandaLoading]  = useState(false)
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)

  // ── Mount: lê nome do localStorage ───────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(LS_NAME_KEY)
    if (saved) setCustomerName(saved)
  }, [])

  // ── Carrega cardápio ──────────────────────────────────────────────────────
  useEffect(() => { loadMenu() }, []) // eslint-disable-line

  async function loadMenu() {
    setLoading(true)
    setLoadError(null)

    const { data: rest } = await supabase
      .from('restaurants').select('*')
      .eq('slug', restaurantSlug).eq('is_active', true).single()
    if (!rest) { setLoadError('restaurante'); setLoading(false); return }
    setRestaurant(rest)

    const { data: tbl } = await supabase
      .from('restaurant_tables').select('*')
      .eq('restaurant_id', rest.id)
      .eq('table_slug', tableNumber)      // busca pelo slug limpo, não pelo nome bruto
      .eq('is_active', true).single()
    if (!tbl) { setLoadError('mesa'); setLoading(false); return }
    setTable(tbl)

    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase.from('categories').select('*')
        .eq('restaurant_id', rest.id).eq('is_active', true).order('display_order'),
      supabase.from('products').select('*')
        .eq('restaurant_id', rest.id).eq('is_available', true).order('display_order'),
    ])
    setCategories(cats ?? [])
    setProducts(prods ?? [])
    setLoading(false)
  }

  // ── Hydration + Realtime da mesa (liga quando restaurant + table prontos) ─
  useEffect(() => {
    if (!restaurant || !table) return

    // Fetch inicial — restaura comanda após F5
    loadTableOrders(restaurant.id, table.id)

    // Canal Realtime permanente filtrado por restaurant_id
    const channel = supabase
      .channel(`comanda-mesa:${restaurant.id}:${table.id}`)
      // Novo pedido na mesa
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'orders',
        filter: `restaurant_id=eq.${restaurant.id}`,
      }, async (payload) => {
        const inserted = payload.new as Tables<'orders'>
        if (inserted.table_id !== table.id) return
        const { data: items } = await supabase
          .from('order_items').select('*, products(name, image_url)')
          .eq('order_id', inserted.id)
        setTableOrders(prev => [{ ...inserted, order_items: (items ?? []) as OrderItem[] }, ...prev])
      })
      // Status atualizado pelo dono
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orders',
        filter: `restaurant_id=eq.${restaurant.id}`,
      }, (payload) => {
        const updated = payload.new as Tables<'orders'>
        if (updated.table_id !== table.id) return
        setTableOrders(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o))
      })
      .subscribe()

    realtimeChannelRef.current = channel
    return () => { supabase.removeChannel(channel); realtimeChannelRef.current = null }
  }, [restaurant?.id, table?.id]) // eslint-disable-line

  async function loadTableOrders(restaurantId: string, tableId: string) {
    setComandaLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*, products(name, image_url))')
      .eq('restaurant_id', restaurantId)
      .eq('table_id', tableId)
      .order('created_at', { ascending: false })
    if (error) console.error('[loadTableOrders]', error)
    setTableOrders((data as Order[]) ?? [])
    setComandaLoading(false)
  }

  // ── Carrinho ──────────────────────────────────────────────────────────────
  const cartLines = Object.values(cart)
  const cartCount = cartLines.reduce((s, l) => s + l.quantity, 0)
  const cartTotal = cartLines.reduce((s, l) => s + l.quantity * l.product.price, 0)

  function addToCart(product: Product) {
    setCart(prev => ({
      ...prev,
      [product.id]: { product, quantity: (prev[product.id]?.quantity ?? 0) + 1 },
    }))
  }
  function changeQuantity(productId: string, delta: number) {
    setCart(prev => {
      const existing = prev[productId]
      if (!existing) return prev
      const next = existing.quantity + delta
      if (next <= 0) { const { [productId]: _, ...rest } = prev; return rest }
      return { ...prev, [productId]: { ...existing, quantity: next } }
    })
  }

  // ── Envio do pedido ───────────────────────────────────────────────────────
  async function handleSendOrder() {
    // Valida nome — obrigatório
    const name = customerName.trim()
    if (!name) { setNameError('Digite seu nome para identificar o pedido.'); return }
    setNameError('')

    if (!restaurant || !table || cartLines.length === 0) return
    setSending(true)
    setOrderError(null)

    try {
      // Persiste nome para próximas visitas
      localStorage.setItem(LS_NAME_KEY, name)

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          restaurant_id: restaurant.id,
          table_id:      table.id,
          customer_name: name,
          notes:         orderNotes.trim() || null,
          total:         cartTotal,
        })
        .select().single()

      if (orderErr || !order) throw orderErr

      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(cartLines.map(l => ({
          order_id:   order.id,
          product_id: l.product.id,
          quantity:   l.quantity,
          unit_price: l.product.price,
        })))
      if (itemsErr) throw itemsErr

      setCart({})
      setOrderNotes('')
      setCartOpen(false)
      // Muda para a aba da comanda para o cliente ver o pedido
      setActiveTab('comanda')
    } catch (err) {
      console.error('[handleSendOrder]', err)
      setOrderError('Não foi possível enviar o pedido. Tente novamente.')
    } finally {
      setSending(false)
    }
  }

  // ── Agrupamento de produtos ───────────────────────────────────────────────
  const productsByCategory = useMemo(() => {
    const map = new Map<string, Product[]>()
    for (const p of products) {
      const key = p.category_id ?? 'sem-categoria'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return map
  }, [products])

  const visibleCategories = useMemo(() =>
    activeCategoryId === 'all' ? categories : categories.filter(c => c.id === activeCategoryId),
    [categories, activeCategoryId]
  )

  // ── Badge da comanda (pedidos ativos na mesa) ─────────────────────────────
  const activeOrderCount = tableOrders.filter(o =>
    ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)
  ).length

  // ── Tela de erro / loading ────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F6F4EF] text-sm text-[#8A8375]">
      Carregando cardápio…
    </div>
  )
  if (loadError === 'restaurante') return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F6F4EF] text-center px-6">
      <p className="font-[family-name:var(--font-display)] text-xl mb-2">Cardápio não encontrado</p>
      <p className="text-sm text-[#8A8375]">Verifique o link ou peça ajuda a um atendente.</p>
    </div>
  )
  if (loadError === 'mesa') return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F6F4EF] text-center px-6">
      <p className="font-[family-name:var(--font-display)] text-xl mb-2">Mesa não identificada</p>
      <p className="text-sm text-[#8A8375]">Chame um atendente para confirmar o número da sua mesa.</p>
    </div>
  )

  const menuStyle     = restaurant?.menu_style ?? 'alta_gastronomia'
  const isGastronomia = menuStyle !== 'conversao_rapida'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`${fraunces.variable} ${inter.variable} min-h-screen bg-[#F6F4EF] text-[#2B2622] font-[family-name:var(--font-body)] flex flex-col`}>

      {/* ════════════════════════════════════════════════════════
          CONTEÚDO PRINCIPAL (cresce para preencher; tab bar fica no rodapé)
      ════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto pb-20">

        {/* ── ABA: CARDÁPIO ─────────────────────────────────────────────── */}
        <div className={activeTab === 'cardapio' ? 'block' : 'hidden'}>

          {/* Header */}
          <header className="bg-[#3F6B4F] text-[#F6F4EF]">
            {restaurant?.cover_image_url && (
              <div className="relative w-full h-48 md:h-64 lg:h-80 overflow-hidden">
                <Image src={restaurant.cover_image_url} alt="Capa" fill className="object-cover opacity-60" priority />
              </div>
            )}
            <div className="max-w-5xl mx-auto px-4 md:px-8 pt-8 pb-6">
              <div className="flex justify-center mb-5 md:justify-start">
                <Image src="/logo.svg" alt="Logo" width={160} height={50}
                  className="w-32 md:w-40 object-contain" style={{ height: 'auto' }} priority />
              </div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-[#CFE0D3]">
                Mesa {table?.table_number}
              </p>
              <h1 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl lg:text-4xl font-medium mt-1">
                {restaurant?.name}
              </h1>
              {restaurant?.description && (
                <p className="text-sm md:text-base text-[#CFE0D3] mt-2 max-w-lg">{restaurant.description}</p>
              )}
            </div>
          </header>

          {/* Nav categorias */}
          {categories.length > 0 && (
            <div className="sticky top-0 z-10 bg-[#F6F4EF]/95 backdrop-blur border-b border-[#DAD5C9]">
              <div className="max-w-5xl mx-auto px-4 md:px-8">
                <div className="flex gap-2 py-3 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {['all', ...categories.map(c => c.id)].map(id => {
                    const cat    = categories.find(c => c.id === id)
                    const active = activeCategoryId === id
                    return (
                      <button key={id} onClick={() => setActiveCategoryId(id)}
                        className={`shrink-0 text-xs md:text-sm font-medium rounded-full px-3.5 py-1.5 border transition ${
                          active ? 'bg-[#2B2622] text-[#F6F4EF] border-[#2B2622]'
                                 : 'border-[#DAD5C9] text-[#8A8375] hover:border-[#8A8375]'
                        }`}>
                        {id === 'all' ? 'Tudo' : cat?.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Produtos */}
          <main className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-10">
            {products.length === 0 && (
              <p className="text-sm text-[#8A8375] text-center py-16">Nenhum prato disponível no momento.</p>
            )}
            {visibleCategories.map(cat => {
              const items = productsByCategory.get(cat.id) ?? []
              if (!items.length) return null
              return (
                <CategorySection key={cat.id} title={cat.name} items={items}
                  isGastronomia={isGastronomia} cart={cart}
                  addToCart={addToCart} changeQuantity={changeQuantity}
                  setVideoPreview={setVideoPreview} />
              )
            })}
            {activeCategoryId === 'all' && (productsByCategory.get('sem-categoria')?.length ?? 0) > 0 && (
              <CategorySection title="Outros" items={productsByCategory.get('sem-categoria')!}
                isGastronomia={isGastronomia} cart={cart}
                addToCart={addToCart} changeQuantity={changeQuantity}
                setVideoPreview={setVideoPreview} />
            )}
          </main>
        </div>

        {/* ── ABA: COMANDA ──────────────────────────────────────────────── */}
        <div className={activeTab === 'comanda' ? 'block' : 'hidden'}>

          {/* Cabeçalho da comanda */}
          <div className="bg-[#2B2622] text-[#F6F4EF] px-4 md:px-8 pt-8 pb-5 max-w-5xl mx-auto">
            <p className="text-[10px] tracking-[0.2em] uppercase text-[#9FBFA9]">
              Mesa {table?.table_number}
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-medium mt-0.5">
              Comanda da Mesa
            </h2>
            <div className="flex items-center gap-1.5 mt-3 text-[11px] text-[#9FBFA9]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3F6B4F] animate-pulse" />
              Atualização em tempo real
            </div>
          </div>

          {/* Lista de pedidos da mesa */}
          <div className="max-w-5xl mx-auto px-4 md:px-8 py-4 space-y-4">
            {comandaLoading && (
              <p className="text-sm text-[#8A8375] text-center py-12">Carregando comanda…</p>
            )}

            {!comandaLoading && tableOrders.length === 0 && (
              <div className="text-center py-16">
                <p className="text-4xl mb-3">🍽️</p>
                <p className="text-sm font-medium text-[#2B2622]">Nenhum pedido ainda</p>
                <p className="text-xs text-[#8A8375] mt-1">Adicione itens no cardápio e envie seu primeiro pedido.</p>
                <button
                  onClick={() => setActiveTab('cardapio')}
                  className="mt-4 text-sm font-medium bg-[#2B2622] text-[#F6F4EF] rounded-sm px-5 py-2.5 hover:bg-[#3F6B4F] transition"
                >
                  Ver cardápio
                </button>
              </div>
            )}

            {tableOrders.map(order => {
              const cfg     = STATUS_CONFIG[order.status]
              const isReady = order.status === 'ready'
              return (
                <div key={order.id}
                  className={`bg-white rounded-xl border overflow-hidden ${
                    isReady ? 'border-[#7B5EA7]/40 shadow-md shadow-[#7B5EA7]/10' : 'border-[#DAD5C9]'
                  }`}>
                  {/* Faixa de cor */}
                  <div className={`h-1 w-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />

                  <div className="px-4 py-3 space-y-3">
                    {/* Status + quem pediu + horário */}
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-3 py-1 border ${cfg.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
                          {cfg.label}
                        </span>
                        {order.customer_name && (
                          <span className="text-xs text-[#8A8375]">
                            pedido por <span className="font-medium text-[#2B2622]">{order.customer_name}</span>
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#B8B2A2] shrink-0">
                        {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Aviso de pronto */}
                    {isReady && (
                      <div className="bg-[#7B5EA7]/[0.06] border border-[#7B5EA7]/20 rounded-lg px-3 py-2 text-xs text-[#7B5EA7] font-medium">
                        🎉 Pronto! O atendente está a caminho.
                      </div>
                    )}

                    {/* Itens */}
                    <ul className="border-t border-dashed border-[#DAD5C9] pt-3 space-y-1.5">
                      {order.order_items.map(item => (
                        <li key={item.id} className="flex items-center justify-between text-sm gap-2">
                          <span className="text-[#2B2622] min-w-0">
                            <span className="font-mono text-xs text-[#B8B2A2] mr-1.5">×{item.quantity}</span>
                            <span className="truncate">{item.products?.name ?? 'Item'}</span>
                          </span>
                          <span className="font-mono text-xs text-[#8A8375] shrink-0">
                            {fmt.format(item.unit_price * item.quantity)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* Total + observação */}
                    <div className="flex justify-between items-center border-t border-[#DAD5C9] pt-2">
                      <span className="text-xs text-[#8A8375]">Total</span>
                      <span className="text-sm font-semibold font-mono">{fmt.format(order.total)}</span>
                    </div>
                    {order.notes && (
                      <div className="bg-[#FBFAF7] border border-[#DAD5C9] rounded-sm px-3 py-1.5 text-xs text-[#8A8375]">
                        <span className="font-medium">Obs.:</span> {order.notes}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          TAB BAR — fixa no rodapé
      ════════════════════════════════════════════════════════ */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#DAD5C9] safe-b">
        <div className="max-w-5xl mx-auto grid grid-cols-2">

          {/* Tab: Cardápio */}
          <button
            onClick={() => setActiveTab('cardapio')}
            className={`flex flex-col items-center justify-center py-3 gap-0.5 transition ${
              activeTab === 'cardapio' ? 'text-[#2B2622]' : 'text-[#B8B2A2]'
            }`}
          >
            <span className="text-xl">🍜</span>
            <span className="text-[11px] font-medium">Cardápio</span>
            {activeTab === 'cardapio' && (
              <span className="absolute bottom-0 w-16 h-0.5 bg-[#2B2622] rounded-full" />
            )}
          </button>

          {/* Tab: Comanda */}
          <button
            onClick={() => setActiveTab('comanda')}
            className={`relative flex flex-col items-center justify-center py-3 gap-0.5 transition ${
              activeTab === 'comanda' ? 'text-[#2B2622]' : 'text-[#B8B2A2]'
            }`}
          >
            <span className="relative text-xl">
              🧾
              {/* Badge de pedidos ativos */}
              {activeOrderCount > 0 && (
                <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-[#E3A72E] text-white text-[9px] font-bold flex items-center justify-center">
                  {activeOrderCount}
                </span>
              )}
            </span>
            <span className="text-[11px] font-medium">Comanda</span>
            {activeTab === 'comanda' && (
              <span className="absolute bottom-0 w-16 h-0.5 bg-[#2B2622] rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          MODAL CARRINHO
      ════════════════════════════════════════════════════════ */}
      {cartCount > 0 && activeTab === 'cardapio' && !cartOpen && (
        <div className="fixed bottom-16 left-4 right-4 z-20 flex justify-center">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full max-w-lg bg-[#2B2622] text-[#F6F4EF] rounded-sm px-5 py-3.5 flex items-center justify-between shadow-lg hover:bg-[#3F6B4F] transition"
          >
            <span className="text-sm font-medium">{cartCount} {cartCount === 1 ? 'item' : 'itens'}</span>
            <span className="text-sm font-medium">Ver carrinho</span>
            <span className="text-sm font-mono">{fmt.format(cartTotal)}</span>
          </button>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#2B2622]/40 md:items-center">
          <div className="w-full max-w-lg bg-[#F6F4EF] rounded-t-2xl md:rounded-xl max-h-[90vh] flex flex-col shadow-2xl">

            {/* Header do carrinho */}
            <div className="border-b border-dashed border-[#DAD5C9] px-6 py-3 flex items-center justify-between shrink-0">
              <span className="text-[11px] tracking-[0.15em] uppercase text-[#8A8375]">
                Carrinho — Mesa {table?.table_number}
              </span>
              <button onClick={() => setCartOpen(false)} className="text-sm text-[#8A8375] hover:text-[#2B2622] transition">
                Fechar
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-4 space-y-3 flex-1">
              {/* Itens */}
              {cartLines.map(line => (
                <div key={line.product.id} className="flex items-center gap-3 bg-white border border-[#DAD5C9] rounded-sm px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{line.product.name}</p>
                    <p className="text-xs font-mono text-[#8A8375]">{fmt.format(line.product.price)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => changeQuantity(line.product.id, -1)} className="w-7 h-7 rounded-full border border-[#DAD5C9] text-sm hover:bg-[#F6F4EF] transition">−</button>
                    <span className="text-sm font-mono w-4 text-center">{line.quantity}</span>
                    <button onClick={() => changeQuantity(line.product.id,  1)} className="w-7 h-7 rounded-full border border-[#DAD5C9] text-sm hover:bg-[#F6F4EF] transition">+</button>
                  </div>
                </div>
              ))}

              {/* Nome — obrigatório, pré-preenchido do localStorage */}
              <div>
                <label htmlFor="customerNameInput" className="block text-xs font-medium text-[#8A8375] mb-1.5">
                  Seu nome <span className="text-[#C1502E]">*</span>
                </label>
                <input
                  id="customerNameInput"
                  type="text"
                  value={customerName}
                  onChange={e => { setCustomerName(e.target.value); setNameError('') }}
                  placeholder="Como devemos chamar você?"
                  className={`w-full rounded-sm border px-3 py-2.5 text-sm outline-none focus:ring-2 transition bg-white ${
                    nameError
                      ? 'border-[#C1502E] focus:border-[#C1502E] focus:ring-[#C1502E]/20'
                      : 'border-[#DAD5C9] focus:border-[#3F6B4F] focus:ring-[#3F6B4F]/20'
                  }`}
                />
                {nameError
                  ? <p className="text-xs text-[#C1502E] mt-1">{nameError}</p>
                  : <p className="text-[11px] text-[#B8B2A2] mt-1">Aparece na comanda da mesa para identificar quem pediu.</p>
                }
              </div>

              {/* Observação */}
              <div>
                <label htmlFor="orderNotes" className="block text-xs font-medium text-[#8A8375] mb-1.5">
                  Observação <span className="text-[#B8B2A2] font-normal">(opcional)</span>
                </label>
                <textarea id="orderNotes" rows={2} value={orderNotes}
                  onChange={e => setOrderNotes(e.target.value)}
                  placeholder="Ex.: sem cebola, ponto da carne…"
                  className="w-full rounded-sm border border-[#DAD5C9] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3F6B4F] focus:ring-2 focus:ring-[#3F6B4F]/20 transition resize-none"
                />
              </div>

              {orderError && (
                <p role="alert" className="text-sm text-[#C1502E] bg-[#C1502E]/[0.08] border border-[#C1502E]/20 rounded-sm px-3 py-2">
                  {orderError}
                </p>
              )}
            </div>

            {/* Rodapé */}
            <div className="border-t border-[#DAD5C9] px-6 py-4 shrink-0">
              <div className="flex items-center justify-between text-sm mb-3">
                <span className="text-[#8A8375]">Total</span>
                <span className="font-mono font-semibold">{fmt.format(cartTotal)}</span>
              </div>
              <button
                onClick={handleSendOrder}
                disabled={sending}
                className="w-full bg-[#2B2622] text-[#F6F4EF] text-sm font-medium rounded-sm py-3 hover:bg-[#3F6B4F] transition disabled:opacity-50"
              >
                {sending ? 'Enviando…' : 'Enviar pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LIGHTBOX DE VÍDEO ─────────────────────────────────────────────── */}
      {videoPreview?.video_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2622]/80 px-4 md:px-8"
          onClick={() => setVideoPreview(null)}>
          <div className="w-full max-w-xl" onClick={e => e.stopPropagation()}>
            <video src={videoPreview.video_url} controls autoPlay className="w-full rounded-xl shadow-2xl" />
            <p className="text-center text-[#F6F4EF] text-sm mt-3">{videoPreview.name}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CategorySection
// ---------------------------------------------------------------------------

function CategorySection({ title, items, isGastronomia, cart, addToCart, changeQuantity, setVideoPreview }: {
  title: string; items: Product[]; isGastronomia: boolean
  cart: Record<string, CartLine>
  addToCart: (p: Product) => void
  changeQuantity: (id: string, delta: number) => void
  setVideoPreview: (p: Product) => void
}) {
  return (
    <section>
      <h2 className="font-[family-name:var(--font-display)] text-xl md:text-2xl font-medium mb-4 md:mb-5">{title}</h2>
      {isGastronomia ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {items.map(p => (
            <ProductCardGastronomia key={p.id} product={p}
              quantity={cart[p.id]?.quantity ?? 0}
              onAdd={() => addToCart(p)}
              onChangeQuantity={d => changeQuantity(p.id, d)}
              onPlayVideo={() => setVideoPreview(p)} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-x-6 divide-y divide-[#F0EBE3] md:divide-y-0">
          {items.map(p => (
            <ProductCardConversao key={p.id} product={p}
              quantity={cart[p.id]?.quantity ?? 0}
              onAdd={() => addToCart(p)}
              onChangeQuantity={d => changeQuantity(p.id, d)}
              onPlayVideo={() => setVideoPreview(p)} />
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Props compartilhadas
// ---------------------------------------------------------------------------

type ProductCardProps = {
  product: Product; quantity: number
  onAdd: () => void; onChangeQuantity: (d: number) => void; onPlayVideo: () => void
}

// ---------------------------------------------------------------------------
// Card Alta Gastronomia
// ---------------------------------------------------------------------------

function ProductCardGastronomia({ product, quantity, onAdd, onChangeQuantity, onPlayVideo }: ProductCardProps) {
  const hasPromo = product.promo_price != null && product.promo_price < product.price
  return (
    <div className="bg-white rounded-3xl overflow-hidden border border-[#EEE9E0] shadow-sm flex flex-col">
      <div className="relative w-full aspect-square bg-[#F6F4EF]">
        {product.image_url
          ? <Image src={product.image_url} alt={product.name} fill loading="eager"
              sizes="(max-width:640px) 100vw,(max-width:1024px) 50vw,33vw" className="object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-xs text-[#B8B2A2]">Sem foto</div>
        }
        {product.video_url && (
          <button onClick={onPlayVideo} aria-label="Ver vídeo"
            className="absolute inset-0 flex items-center justify-center bg-[#2B2622]/20 hover:bg-[#2B2622]/30 transition">
            <span className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center text-sm shadow">▶</span>
          </button>
        )}
      </div>
      <div className="p-4 md:p-5 flex flex-col flex-1">
        <h3 className="text-base md:text-lg font-medium text-[#2B2622] leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          {product.name}
        </h3>
        {product.description && (
          <p className="mt-1 text-xs md:text-sm text-[#8A8375] leading-relaxed line-clamp-3 flex-1">{product.description}</p>
        )}
        <div className="mt-3 md:mt-4 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">
            {hasPromo
              ? <><span className="text-[#3F6B4F]">{fmt.format(product.promo_price!)}</span>
                  <span className="ml-1.5 text-xs text-[#B8B2A2] line-through font-normal">{fmt.format(product.price)}</span></>
              : fmt.format(product.price)
            }
          </span>
          {quantity === 0
            ? <button onClick={onAdd} className="text-xs font-medium rounded-full bg-[#2B2622] text-[#F6F4EF] px-4 py-1.5 hover:bg-[#3F6B4F] transition">Adicionar</button>
            : <div className="flex items-center gap-2">
                <button onClick={() => onChangeQuantity(-1)} className="w-7 h-7 rounded-full border border-[#DAD5C9] text-sm font-medium hover:bg-[#F6F4EF] transition">−</button>
                <span className="text-sm font-mono w-4 text-center">{quantity}</span>
                <button onClick={() => onChangeQuantity( 1)} className="w-7 h-7 rounded-full bg-[#2B2622] text-[#F6F4EF] text-sm font-medium hover:bg-[#3F6B4F] transition">+</button>
              </div>
          }
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card Conversão Rápida
// ---------------------------------------------------------------------------

function ProductCardConversao({ product, quantity, onAdd, onChangeQuantity, onPlayVideo }: ProductCardProps) {
  const hasPromo = product.promo_price != null && product.promo_price < product.price
  return (
    <div className="bg-white md:border md:border-[#EEE9E0] md:rounded-xl py-3 md:p-4 flex gap-3 items-start border-b border-[#F0EBE3] md:border-b-0 last:border-b-0">
      <div className="flex-1 min-w-0">
        <h3 className="text-sm md:text-base font-bold text-[#2B2622] leading-snug">{product.name}</h3>
        {product.description && (
          <p className="mt-0.5 text-xs md:text-sm text-[#8A8375] line-clamp-2 leading-relaxed">{product.description}</p>
        )}
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-bold">
            {hasPromo
              ? <><span className="text-[#3F6B4F]">{fmt.format(product.promo_price!)}</span>
                  <span className="ml-1 text-xs text-[#B8B2A2] line-through font-normal">{fmt.format(product.price)}</span></>
              : fmt.format(product.price)
            }
          </span>
          {quantity > 0 && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => onChangeQuantity(-1)} className="w-6 h-6 rounded-full border border-[#DAD5C9] text-xs font-bold hover:bg-[#F6F4EF] transition">−</button>
              <span className="text-xs font-mono w-4 text-center">{quantity}</span>
              <button onClick={() => onChangeQuantity( 1)} className="w-6 h-6 rounded-full bg-[#3F6B4F] text-white text-xs font-bold hover:bg-[#2B2622] transition">+</button>
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 relative">
        <div className="w-24 h-24 md:w-28 md:h-28 rounded-xl overflow-hidden bg-[#F6F4EF] border border-[#EEE9E0]">
          {product.image_url
            ? <Image src={product.image_url} alt={product.name} width={112} height={112} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-[10px] text-[#B8B2A2] text-center px-1">Sem foto</div>
          }
          {product.video_url && (
            <button onClick={onPlayVideo} aria-label="Ver vídeo"
              className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl">
              <span className="text-white text-xs">▶</span>
            </button>
          )}
        </div>
        {quantity === 0 && (
          <button onClick={onAdd} aria-label={`Adicionar ${product.name}`}
            className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-[#3F6B4F] text-white text-xl font-bold shadow-md flex items-center justify-center hover:bg-[#2B2622] transition leading-none">
            +
          </button>
        )}
      </div>
    </div>
  )
}
