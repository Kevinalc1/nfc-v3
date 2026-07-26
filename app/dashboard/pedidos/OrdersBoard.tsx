'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { updateOrderStatus, type Order, type OrderStatus } from '@/app/actions/orders'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Constantes e mapeamentos
// ---------------------------------------------------------------------------

// As três colunas do Kanban e quais status do banco cada uma agrupa
const COLUMNS = [
  {
    id: 'new' as const,
    label: 'Novos',
    statuses: ['pending', 'confirmed'] as OrderStatus[],
    accent: '#E3A72E',
    emptyMsg: 'Nenhum pedido novo.',
  },
  {
    id: 'preparing' as const,
    label: 'Preparando',
    statuses: ['preparing', 'ready'] as OrderStatus[],
    accent: '#4A72A6',
    emptyMsg: 'Nenhum pedido em preparo.',
  },
  {
    id: 'done' as const,
    label: 'Concluídos',
    statuses: ['delivered', 'cancelled'] as OrderStatus[],
    accent: '#3F6B4F',
    emptyMsg: 'Nenhum pedido concluído hoje.',
  },
] as const

type ColumnId = (typeof COLUMNS)[number]['id']

// Rótulo amigável para cada status do banco
const STATUS_LABEL: Record<OrderStatus, string> = {
  pending:   'Aguardando',
  confirmed: 'Confirmado',
  preparing: 'Preparando',
  ready:     'Pronto ✓',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
}

// Botão de avanço: qual texto mostrar e para qual status vai
const ADVANCE_ACTION: Partial<Record<OrderStatus, { label: string; next: OrderStatus }>> = {
  pending:   { label: 'Confirmar',        next: 'confirmed' },
  confirmed: { label: 'Iniciar preparo',  next: 'preparing' },
  preparing: { label: 'Marcar pronto',    next: 'ready' },
  ready:     { label: 'Entregar',         next: 'delivered' },
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Sub-componente: Card de pedido
// ---------------------------------------------------------------------------

function OrderCard({
  order,
  onAdvance,
  onCancel,
  pending,
}: {
  order: Order
  onAdvance: () => void
  onCancel: () => void
  pending: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const action = ADVANCE_ACTION[order.status]
  const isDone = order.status === 'delivered' || order.status === 'cancelled'

  return (
    <div
      className={`bg-white rounded-sm border border-[#DAD5C9] overflow-hidden transition-shadow ${
        order.status === 'pending' ? 'shadow-md ring-1 ring-[#E3A72E]/30' : 'shadow-sm'
      }`}
    >
      {/* Faixa de cor por status */}
      <div
        className="h-1 w-full"
        style={{
          background:
            order.status === 'pending' || order.status === 'confirmed'
              ? '#E3A72E'
              : order.status === 'preparing' || order.status === 'ready'
              ? '#4A72A6'
              : order.status === 'delivered'
              ? '#3F6B4F'
              : '#C1502E',
        }}
      />

      {/* Cabeçalho do card */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-start justify-between gap-2"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-[#2B2622]">
              Mesa {order.restaurant_tables?.table_number ?? '—'}
            </span>
            {order.customer_name && (
              <span className="text-xs text-[#8A8375]">· {order.customer_name}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-[#8A8375]">
            <span>{formatTime(order.created_at)}</span>
            <span>·</span>
            <span>{order.order_items.length} {order.order_items.length === 1 ? 'item' : 'itens'}</span>
            <span>·</span>
            <span className="font-mono">{currencyFormatter.format(order.total)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-medium tracking-wide uppercase text-[#8A8375] bg-[#F6F4EF] border border-[#DAD5C9] rounded-full px-2 py-0.5">
            {STATUS_LABEL[order.status]}
          </span>
          <span className="text-[#B8B2A2] text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Detalhe expandido */}
      {expanded && (
        <div className="border-t border-dashed border-[#DAD5C9] px-4 pb-4 pt-3 space-y-3">
          {/* Itens */}
          <ul className="space-y-1.5">
            {order.order_items.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between text-sm">
                <span>
                  <span className="font-mono text-xs text-[#8A8375] mr-2">×{item.quantity}</span>
                  {item.products?.name ?? 'Produto removido'}
                </span>
                <span className="font-mono text-xs text-[#8A8375] ml-3 shrink-0">
                  {currencyFormatter.format(item.unit_price * item.quantity)}
                </span>
              </li>
            ))}
          </ul>

          {/* Observação */}
          {order.notes && (
            <div className="bg-[#FBFAF7] border border-[#DAD5C9] rounded-sm px-3 py-2">
              <span className="text-[10px] font-semibold tracking-widest uppercase text-[#8A8375]">Obs. </span>
              <span className="text-xs text-[#2B2622]">{order.notes}</span>
            </div>
          )}

          {/* Ações */}
          {!isDone && (
            <div className="flex gap-2 pt-1">
              {action && (
                <button
                  onClick={onAdvance}
                  disabled={pending}
                  className="flex-1 bg-[#2B2622] text-[#F6F4EF] text-xs font-semibold rounded-sm py-2.5 hover:bg-[#3F6B4F] transition disabled:opacity-50"
                >
                  {pending ? 'Aguarde…' : action.label}
                </button>
              )}
              <button
                onClick={onCancel}
                disabled={pending}
                className="px-3 text-xs font-medium rounded-sm border border-[#C1502E]/30 text-[#C1502E] hover:bg-[#C1502E]/[0.08] transition disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-componente: Coluna do Kanban
// ---------------------------------------------------------------------------

function KanbanColumn({
  column,
  orders,
  onAdvance,
  onCancel,
  pendingId,
}: {
  column: (typeof COLUMNS)[number]
  orders: Order[]
  onAdvance: (order: Order) => void
  onCancel: (order: Order) => void
  pendingId: string | null
}) {
  return (
    <div className="flex flex-col min-h-0">
      {/* Cabeçalho da coluna */}
      <div
        className="flex items-center gap-2 px-1 mb-3 pb-2 border-b-2"
        style={{ borderColor: column.accent }}
      >
        <h2 className="text-sm font-semibold text-[#2B2622]">{column.label}</h2>
        {orders.length > 0 && (
          <span
            className="text-[11px] font-semibold rounded-full w-5 h-5 flex items-center justify-center text-white"
            style={{ background: column.accent }}
          >
            {orders.length}
          </span>
        )}
      </div>

      {/* Cards */}
      <div className="space-y-3 overflow-y-auto flex-1 pr-0.5">
        {orders.length === 0 ? (
          <p className="text-xs text-[#B8B2A2] text-center py-8">{column.emptyMsg}</p>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onAdvance={() => onAdvance(order)}
              onCancel={() => onCancel(order)}
              pending={pendingId === order.id}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal: OrdersBoard
// ---------------------------------------------------------------------------

export default function OrdersBoard({
  initialOrders,
  restaurantId,
}: {
  initialOrders: Order[]
  restaurantId: string
}) {
  const supabase = createClient()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const audioRef = useRef<AudioContext | null>(null)

  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [liveStatus, setLiveStatus] = useState<'connecting' | 'live' | 'error'>('connecting')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ── Bip sonoro para novos pedidos ──────────────────────────────────────────
  function playBip() {
    try {
      const ctx = audioRef.current ?? new AudioContext()
      audioRef.current = ctx
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12)
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.45)
    } catch { /* AudioContext bloqueado antes de interação — ignora */ }
  }

  // ── Canal Realtime ─────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`orders-board:${restaurantId}`)

      // INSERT — novo pedido chegou
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        async (payload) => {
          const raw = payload.new as Tables<'orders'>

          // Busca mesa e itens em paralelo para popular o card completo
          const [{ data: tableData }, { data: itemsData }] = await Promise.all([
            supabase
              .from('restaurant_tables')
              .select('table_number')
              .eq('id', raw.table_id)
              .single(),
            supabase
              .from('order_items')
              .select('*, products(name)')
              .eq('order_id', raw.id),
          ])

          const newOrder: Order = {
            ...raw,
            restaurant_tables: tableData,
            order_items: (itemsData ?? []) as Order['order_items'],
          }

          setOrders((prev) => [newOrder, ...prev])
          playBip()
        }
      )

      // UPDATE — status mudou (incluindo mudanças feitas por esta própria aba)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const updated = payload.new as Tables<'orders'>
          setOrders((prev) =>
            prev.map((o) =>
              o.id === updated.id ? { ...o, ...updated } : o
            )
          )
        }
      )

      .subscribe((status) => {
        if (status === 'SUBSCRIBED')    setLiveStatus('live')
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setLiveStatus('error')
      })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId])

  // ── Ações ──────────────────────────────────────────────────────────────────
  function handleAdvance(order: Order) {
    const action = ADVANCE_ACTION[order.status]
    if (!action) return

    setPendingId(order.id)
    startTransition(async () => {
      const result = await updateOrderStatus(order.id, action.next)
      if (!result.ok) console.error(result.error)
      setPendingId(null)
    })
  }

  function handleCancel(order: Order) {
    if (!window.confirm(`Cancelar pedido da Mesa ${order.restaurant_tables?.table_number ?? ''}?`)) return

    setPendingId(order.id)
    startTransition(async () => {
      const result = await updateOrderStatus(order.id, 'cancelled')
      if (!result.ok) console.error(result.error)
      setPendingId(null)
    })
  }

  // ── Distribui pedidos nas colunas ──────────────────────────────────────────
  function ordersForColumn(col: (typeof COLUMNS)[number]) {
    return orders.filter((o) => (col.statuses as readonly string[]).includes(o.status))
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Barra superior: título + indicador Realtime */}
      <div className="shrink-0 px-6 py-4 border-b border-[#DAD5C9] bg-[#F6F4EF]/95 backdrop-blur sticky top-0 z-10 flex items-center justify-between gap-4">
        <div className="hidden lg:block">
          <span className="text-xs tracking-[0.15em] uppercase text-[#8A8375]">Dashboard</span>
          <h1 className="text-2xl font-semibold text-[#2B2622] leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
            Pedidos
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#8A8375] lg:ml-auto">
          <span
            className={`w-2 h-2 rounded-full ${
              liveStatus === 'live'  ? 'bg-[#3F6B4F] animate-pulse' :
              liveStatus === 'error' ? 'bg-[#C1502E]' :
                                       'bg-[#E3A72E] animate-pulse'
            }`}
          />
          {liveStatus === 'live' ? 'Ao vivo' : liveStatus === 'error' ? 'Desconectado' : 'Conectando…'}
        </div>
      </div>

      {/* Grade Kanban — 3 colunas no desktop, scroll horizontal no mobile */}
      <div className="flex-1 overflow-x-auto">
        <div
          className="grid h-full min-h-[calc(100vh-8rem)] p-6 gap-5"
          style={{ gridTemplateColumns: 'repeat(3, minmax(280px, 1fr))' }}
        >
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              column={col}
              orders={ordersForColumn(col)}
              onAdvance={handleAdvance}
              onCancel={handleCancel}
              pendingId={isPending ? pendingId : null}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// Importação inline para o tipo Tables usado no Realtime handler
import type { Tables } from '@/types_db'
