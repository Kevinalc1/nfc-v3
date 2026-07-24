'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Fraunces, Inter } from 'next/font/google'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types_db'
import type { RealtimeChannel } from '@supabase/supabase-js'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-display',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
})

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type OrderStatus = Tables<'orders'>['status']

type OrderItem = Tables<'order_items'> & {
  products: Pick<Tables<'products'>, 'name'> | null
}

type Order = Tables<'orders'> & {
  restaurant_tables: Pick<Tables<'restaurant_tables'>, 'table_number'> | null
  order_items: OrderItem[]
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const STATUS_FLOW: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'delivered',
]

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Aguardando',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

const STATUS_COLORS: Record<
  OrderStatus,
  { badge: string; card: string; dot: string }
> = {
  pending: {
    badge: 'bg-[#E3A72E]/10 text-[#A87209] border-[#E3A72E]/30',
    card: 'border-l-[#E3A72E]',
    dot: 'bg-[#E3A72E]',
  },
  confirmed: {
    badge: 'bg-[#3F6B4F]/10 text-[#3F6B4F] border-[#3F6B4F]/30',
    card: 'border-l-[#3F6B4F]',
    dot: 'bg-[#3F6B4F]',
  },
  preparing: {
    badge: 'bg-[#4A72A6]/10 text-[#4A72A6] border-[#4A72A6]/30',
    card: 'border-l-[#4A72A6]',
    dot: 'bg-[#4A72A6]',
  },
  ready: {
    badge: 'bg-[#7B5EA7]/10 text-[#7B5EA7] border-[#7B5EA7]/30',
    card: 'border-l-[#7B5EA7]',
    dot: 'bg-[#7B5EA7] animate-pulse',
  },
  delivered: {
    badge: 'bg-[#DAD5C9] text-[#8A8375] border-[#DAD5C9]',
    card: 'border-l-[#DAD5C9]',
    dot: 'bg-[#B8B2A2]',
  },
  cancelled: {
    badge: 'bg-[#C1502E]/10 text-[#C1502E] border-[#C1502E]/30',
    card: 'border-l-[#C1502E]',
    dot: 'bg-[#C1502E]',
  },
}

const NEXT_ACTION_LABEL: Record<string, string> = {
  pending: 'Confirmar',
  confirmed: 'Iniciar preparo',
  preparing: 'Marcar como pronto',
  ready: 'Marcar entregue',
}

const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready']
const ALL_FILTER_STATUSES = [...ACTIVE_STATUSES, 'delivered', 'cancelled'] as const

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(isoString: string) {
  return new Date(isoString).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function nextStatus(current: OrderStatus): OrderStatus | null {
  const idx = STATUS_FLOW.indexOf(current)
  if (idx === -1 || idx === STATUS_FLOW.length - 1) return null
  return STATUS_FLOW[idx + 1]
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function PedidosPage() {
  const router = useRouter()
  const supabase = createClient()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const audioRef = useRef<AudioContext | null>(null)

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'error'>('connecting')
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'active'>('active')
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Toca um bip discreto quando chega novo pedido
  function playNewOrderSound() {
    try {
      const ctx = audioRef.current ?? new AudioContext()
      audioRef.current = ctx
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.frequency.setValueAtTime(880, ctx.currentTime)
      oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.4)
    } catch {
      // AudioContext pode ser bloqueado antes de interação — ignora silenciosamente
    }
  }

  // Busca os itens de um pedido e enriquece com o nome do produto
  const fetchOrderItems = useCallback(
    async (orderId: string): Promise<OrderItem[]> => {
      const { data } = await supabase
        .from('order_items')
        .select('*, products(name)')
        .eq('order_id', orderId)
      return (data as OrderItem[]) ?? []
    },
    [supabase]
  )

  // Carrega pedidos iniciais e inicia o canal Realtime
  useEffect(() => {
    async function bootstrap() {
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
        setLoading(false)
        return
      }

      setRestaurantId(restaurant.id)

      // Busca os pedidos de hoje + ativos de outros dias
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data: rawOrders } = await supabase
        .from('orders')
        .select('*, restaurant_tables(table_number)')
        .eq('restaurant_id', restaurant.id)
        .or(
          `status.in.(pending,confirmed,preparing,ready),created_at.gte.${todayStart.toISOString()}`
        )
        .order('created_at', { ascending: false })

      if (rawOrders) {
        const enriched = await Promise.all(
          rawOrders.map(async (o) => ({
            ...(o as Omit<Order, 'order_items'>),
            order_items: await fetchOrderItems(o.id),
          }))
        )
        setOrders(enriched)
      }

      setLoading(false)

      // ---------- Canal Realtime ----------
      const channel = supabase
        .channel(`orders:restaurant:${restaurant.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'orders',
            filter: `restaurant_id=eq.${restaurant.id}`,
          },
          async (payload) => {
            const raw = payload.new as Omit<Order, 'order_items' | 'restaurant_tables'>

            // Busca mesa e itens do novo pedido
            const [{ data: tableData }, items] = await Promise.all([
              supabase
                .from('restaurant_tables')
                .select('table_number')
                .eq('id', raw.table_id)
                .single(),
              fetchOrderItems(raw.id),
            ])

            const newOrder: Order = {
              ...raw,
              restaurant_tables: tableData,
              order_items: items,
            }

            setOrders((prev) => [newOrder, ...prev])
            playNewOrderSound()
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `restaurant_id=eq.${restaurant.id}`,
          },
          (payload) => {
            const updated = payload.new as Omit<Order, 'order_items' | 'restaurant_tables'>
            setOrders((prev) =>
              prev.map((o) =>
                o.id === updated.id
                  ? { ...o, ...updated }
                  : o
              )
            )
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') setLiveStatus('live')
          if (status === 'CLOSED' || status === 'CHANNEL_ERROR')
            setLiveStatus('error')
        })

      channelRef.current = channel
    }

    bootstrap()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function advanceStatus(order: Order) {
    const next = nextStatus(order.status)
    if (!next) return

    setPendingStatusId(order.id)

    const { error } = await supabase
      .from('orders')
      .update({ status: next })
      .eq('id', order.id)

    if (error) console.error(error)

    setPendingStatusId(null)
  }

  async function cancelOrder(order: Order) {
    if (!window.confirm(`Cancelar o pedido da mesa ${order.restaurant_tables?.table_number}?`)) return

    setPendingStatusId(order.id)

    await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', order.id)

    setPendingStatusId(null)
  }

  const filteredOrders = orders.filter((o) => {
    if (filterStatus === 'active') return ACTIVE_STATUSES.includes(o.status)
    return o.status === filterStatus
  })

  const activeCount = orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className={`${fraunces.variable} ${inter.variable} min-h-screen bg-[#F6F4EF] text-[#2B2622] font-[family-name:var(--font-body)]`}
    >
      {/* Topbar de pedidos — título visível só no desktop (mobile usa o do layout) */}
      <header className="sticky top-0 z-10 bg-[#F6F4EF]/95 backdrop-blur border-b border-[#DAD5C9] px-6 py-4 flex items-center justify-between gap-4">
        <div className="hidden lg:block">
          <span className="text-xs tracking-[0.15em] uppercase text-[#8A8375]">
            Dashboard
          </span>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-medium leading-tight">
            Pedidos
          </h1>
        </div>

        {/* Indicador de conexão Realtime — visível em todas as telas */}
        <div className="flex items-center gap-2 text-xs text-[#8A8375] lg:ml-auto">
          <span
            className={`w-2 h-2 rounded-full ${
              liveStatus === 'live'
                ? 'bg-[#3F6B4F] animate-pulse'
                : liveStatus === 'error'
                ? 'bg-[#C1502E]'
                : 'bg-[#E3A72E] animate-pulse'
            }`}
          />
          {liveStatus === 'live'
            ? 'Ao vivo'
            : liveStatus === 'error'
            ? 'Desconectado'
            : 'Conectando…'}
        </div>
      </header>

      {/* Filtros */}
      <div className="px-6 py-3 flex gap-2 overflow-x-auto border-b border-[#DAD5C9] bg-white">
        <FilterChip
          active={filterStatus === 'active'}
          onClick={() => setFilterStatus('active')}
          label="Ativos"
          count={activeCount}
        />
        {ALL_FILTER_STATUSES.map((s) => (
          <FilterChip
            key={s}
            active={filterStatus === s}
            onClick={() => setFilterStatus(s)}
            label={STATUS_LABEL[s]}
          />
        ))}
      </div>

      {/* Conteúdo */}
      <main className="max-w-3xl mx-auto px-6 py-6">
        {loading && (
          <p className="text-sm text-[#8A8375] text-center py-16">
            Carregando pedidos…
          </p>
        )}

        {!loading && filteredOrders.length === 0 && (
          <div className="border border-dashed border-[#DAD5C9] rounded-sm py-16 px-6 text-center">
            <p className="font-[family-name:var(--font-display)] text-xl mb-1">
              Nenhum pedido aqui
            </p>
            <p className="text-sm text-[#8A8375]">
              {filterStatus === 'active'
                ? 'Quando um cliente fizer um pedido pela mesa, ele aparece aqui em tempo real.'
                : `Nenhum pedido com status "${STATUS_LABEL[filterStatus as OrderStatus]}".`}
            </p>
          </div>
        )}

        <ul className="space-y-3">
          {filteredOrders.map((order) => {
            const colors = STATUS_COLORS[order.status]
            const isExpanded = expandedId === order.id
            const isPending = pendingStatusId === order.id
            const next = nextStatus(order.status)

            return (
              <li
                key={order.id}
                className={`bg-white border border-[#DAD5C9] border-l-4 rounded-sm overflow-hidden ${colors.card}`}
              >
                {/* Linha principal */}
                <button
                  className="w-full text-left px-5 py-4 flex items-start gap-3"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : order.id)
                  }
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        Mesa {order.restaurant_tables?.table_number ?? '—'}
                      </span>
                      {order.customer_name && (
                        <span className="text-xs text-[#8A8375]">
                          · {order.customer_name}
                        </span>
                      )}
                      <span
                        className={`ml-auto text-[11px] font-medium rounded-full px-2.5 py-0.5 border ${colors.badge}`}
                      >
                        {STATUS_LABEL[order.status]}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-xs text-[#8A8375]">
                      <span>{formatTime(order.created_at)}</span>
                      <span>·</span>
                      <span>
                        {order.order_items.length}{' '}
                        {order.order_items.length === 1 ? 'item' : 'itens'}
                      </span>
                      <span>·</span>
                      <span className="font-mono">
                        {currencyFormatter.format(order.total)}
                      </span>
                    </div>
                  </div>

                  <span className="text-[#8A8375] text-xs mt-0.5">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {/* Detalhe expandido */}
                {isExpanded && (
                  <div className="border-t border-dashed border-[#DAD5C9] px-5 pb-4 pt-3 space-y-3">
                    {/* Itens */}
                    <ul className="space-y-1.5">
                      {order.order_items.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-baseline justify-between text-sm"
                        >
                          <span>
                            <span className="font-mono text-xs text-[#8A8375] mr-2">
                              ×{item.quantity}
                            </span>
                            {item.products?.name ?? 'Produto removido'}
                          </span>
                          <span className="font-mono text-xs text-[#8A8375] ml-3 shrink-0">
                            {currencyFormatter.format(
                              item.unit_price * item.quantity
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* Observação */}
                    {order.notes && (
                      <div className="bg-[#FBFAF7] border border-[#DAD5C9] rounded-sm px-3 py-2 text-xs text-[#2B2622]">
                        <span className="font-medium text-[#8A8375] uppercase tracking-wide text-[10px]">
                          Obs.{' '}
                        </span>
                        {order.notes}
                      </div>
                    )}

                    {/* Barra de progresso do status */}
                    <div className="flex items-center gap-1 pt-1">
                      {STATUS_FLOW.map((s, i) => (
                        <div key={s} className="flex items-center gap-1 flex-1">
                          <div
                            className={`h-1 flex-1 rounded-full transition-all ${
                              STATUS_FLOW.indexOf(order.status) >= i
                                ? STATUS_COLORS[order.status].dot
                                : 'bg-[#DAD5C9]'
                            }`}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-[#B8B2A2]">
                      {STATUS_FLOW.map((s) => (
                        <span key={s}>{STATUS_LABEL[s]}</span>
                      ))}
                    </div>

                    {/* Ações */}
                    {order.status !== 'delivered' &&
                      order.status !== 'cancelled' && (
                        <div className="flex gap-2 pt-1">
                          {next && NEXT_ACTION_LABEL[order.status] && (
                            <button
                              onClick={() => advanceStatus(order)}
                              disabled={isPending}
                              className="flex-1 bg-[#2B2622] text-[#F6F4EF] text-xs font-medium rounded-sm py-2.5 hover:bg-[#3F6B4F] transition disabled:opacity-50"
                            >
                              {isPending
                                ? 'Aguarde…'
                                : NEXT_ACTION_LABEL[order.status]}
                            </button>
                          )}
                          <button
                            onClick={() => cancelOrder(order)}
                            disabled={isPending}
                            className="px-4 text-xs font-medium rounded-sm border border-[#C1502E]/30 text-[#C1502E] hover:bg-[#C1502E]/[0.08] transition disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FilterChip
// ---------------------------------------------------------------------------

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 text-xs font-medium rounded-full px-3.5 py-1.5 border transition flex items-center gap-1.5 ${
        active
          ? 'bg-[#2B2622] text-[#F6F4EF] border-[#2B2622]'
          : 'border-[#DAD5C9] text-[#8A8375]'
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`rounded-full text-[10px] px-1.5 py-0.5 ${
            active ? 'bg-white/20 text-white' : 'bg-[#E3A72E]/20 text-[#A87209]'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}
