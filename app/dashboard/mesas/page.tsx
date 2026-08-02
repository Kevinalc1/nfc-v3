'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Fraunces, Inter } from 'next/font/google'
import {
  createTable,
  deleteTable,
  getTables,
  toggleTableActive,
  type RestaurantTable,
} from '@/app/actions/tables'
import { createClient } from '@/lib/supabase/client'

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
// Helpers
// ---------------------------------------------------------------------------

function buildMenuUrl(restaurantSlug: string, tableNumber: string): string {
  const base =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? ''
  return `${base}/m/${restaurantSlug}/${encodeURIComponent(tableNumber)}`
}

function buildQrImageUrl(text: string, size = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&bgcolor=FBFAF7&color=2B2622&margin=16`
}

// ---------------------------------------------------------------------------
// Sub-componente: cartão de mesa
// ---------------------------------------------------------------------------

function TableCard({
  table,
  restaurantSlug,
  onToggle,
  onDelete,
  onPrint,
  pending,
}: {
  table: RestaurantTable
  restaurantSlug: string
  onToggle: () => void
  onDelete: () => void
  onPrint: () => void
  pending: boolean
}) {
  const menuUrl = buildMenuUrl(restaurantSlug, table.table_slug ?? table.table_number)
  const qrUrl = buildQrImageUrl(menuUrl)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <li className="bg-white border border-[#DAD5C9] rounded-sm overflow-hidden">
      <div
        className={`h-1 w-full ${table.is_active ? 'bg-[#3F6B4F]' : 'bg-[#DAD5C9]'}`}
      />

      <div className="p-5 flex gap-5 flex-col sm:flex-row">
        {/* QR Code */}
        <div className="shrink-0 flex flex-col items-center gap-2">
          <div className="w-28 h-28 rounded-sm border border-[#DAD5C9] bg-[#FBFAF7] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt={`QR Code da mesa ${table.table_number}`}
              width={112}
              height={112}
              className="w-full h-full object-cover"
            />
          </div>
          <button
            onClick={onPrint}
            className="text-[10px] tracking-wide uppercase text-[#8A8375] hover:text-[#2B2622] transition"
          >
            Imprimir
          </button>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] tracking-[0.15em] uppercase text-[#8A8375]">
                Mesa
              </p>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-medium leading-tight">
                {table.table_number}
              </h2>
            </div>
            <button
              onClick={onToggle}
              disabled={pending}
              aria-label={table.is_active ? 'Desativar mesa' : 'Ativar mesa'}
              className={`shrink-0 text-[11px] font-medium rounded-full px-3 py-1 border transition disabled:opacity-50 ${
                table.is_active
                  ? 'border-[#3F6B4F]/30 bg-[#3F6B4F]/[0.08] text-[#3F6B4F]'
                  : 'border-[#DAD5C9] bg-[#F6F4EF] text-[#8A8375]'
              }`}
            >
              {table.is_active ? 'Ativa' : 'Inativa'}
            </button>
          </div>

          {/* URL */}
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 text-[11px] text-[#8A8375] bg-[#F6F4EF] border border-[#DAD5C9] rounded-sm px-2 py-1.5 truncate select-all">
              {menuUrl}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(menuUrl)}
              className="shrink-0 text-[11px] font-medium border border-[#DAD5C9] rounded-sm px-2.5 py-1.5 hover:bg-[#F6F4EF] transition"
              title="Copiar link"
            >
              Copiar
            </button>
          </div>

          {/* Token NFC */}
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[10px] tracking-[0.1em] uppercase text-[#B8B2A2]">
              Token NFC
            </span>
            <code className="text-[11px] text-[#B8B2A2] truncate">
              {table.qr_code_token}
            </code>
          </div>

          {/* Exclusão com confirmação inline */}
          <div className="mt-4 flex items-center gap-2">
            {confirmDelete ? (
              <>
                <span className="text-xs text-[#C1502E] mr-1">
                  Tem certeza?
                </span>
                <button
                  onClick={() => { setConfirmDelete(false); onDelete() }}
                  disabled={pending}
                  className="text-xs font-medium rounded-sm border border-[#C1502E]/40 text-[#C1502E] px-3 py-1.5 hover:bg-[#C1502E]/[0.08] transition disabled:opacity-50"
                >
                  Sim, excluir
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs font-medium rounded-sm border border-[#DAD5C9] px-3 py-1.5 hover:bg-[#F6F4EF] transition"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
                className="text-xs font-medium rounded-sm border border-[#DAD5C9] text-[#8A8375] px-3 py-1.5 hover:border-[#C1502E]/40 hover:text-[#C1502E] transition disabled:opacity-50"
              >
                Excluir mesa
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Modal de impressão do QR Code
// ---------------------------------------------------------------------------

function PrintModal({
  table,
  restaurantSlug,
  restaurantName,
  onClose,
}: {
  table: RestaurantTable
  restaurantSlug: string
  restaurantName: string
  onClose: () => void
}) {
  const menuUrl = buildMenuUrl(restaurantSlug, table.table_slug ?? table.table_number)
  const qrUrl = buildQrImageUrl(menuUrl, 300)
  const printRef = useRef<HTMLDivElement>(null)

  function handlePrint() {
    const content = printRef.current?.innerHTML
    if (!content) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <html>
        <head>
          <title>Mesa ${table.table_number} — ${restaurantName}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Georgia, serif; background: #fff; }
            .sheet { width: 9cm; margin: 1cm auto; text-align: center; padding: 1.5cm; border: 1px solid #ddd; border-radius: 4px; }
            .eyebrow { font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: #888; margin-bottom: 2px; }
            .rest-name { font-size: 13px; color: #444; margin-bottom: 20px; }
            .table-label { font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #888; margin-bottom: 2px; }
            .table-number { font-size: 40px; font-weight: 600; color: #2B2622; margin-bottom: 20px; line-height: 1; }
            img { width: 220px; height: 220px; display: block; margin: 0 auto; }
            .cta { margin-top: 16px; font-size: 10px; color: #888; line-height: 1.5; }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2622]/50 px-4">
      <div className="bg-white rounded-sm border border-[#DAD5C9] w-full max-w-sm">
        <div className="border-b border-dashed border-[#DAD5C9] px-6 py-3 flex items-center justify-between">
          <span className="text-[11px] tracking-[0.15em] uppercase text-[#8A8375]">
            Pré-visualização
          </span>
          <button onClick={onClose} className="text-sm text-[#8A8375]">
            Fechar
          </button>
        </div>

        <div className="px-6 py-6 flex justify-center bg-[#F6F4EF]">
          <div
            ref={printRef}
            className="bg-white border border-[#DAD5C9] rounded-sm text-center"
            style={{ width: '252px', padding: '28px 24px' }}
          >
            <div className="sheet">
              <p className="eyebrow">Cardápio Digital</p>
              <p className="rest-name">{restaurantName}</p>
              <p className="table-label">Mesa</p>
              <p className="table-number">{table.table_number}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt={`QR Code mesa ${table.table_number}`} />
              <p className="cta">
                Aponte a câmera do celular<br />para fazer seu pedido
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-[#DAD5C9] px-6 py-4 space-y-2">
          <button
            onClick={handlePrint}
            className="w-full bg-[#2B2622] text-[#F6F4EF] text-sm font-medium rounded-sm py-2.5 hover:bg-[#3F6B4F] transition"
          >
            Imprimir / Salvar PDF
          </button>
          <p className="text-[11px] text-[#B8B2A2] text-center">
            Escolha "Salvar como PDF" na janela de impressão para gerar o arquivo.
          </p>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function MesasPage() {
  const supabase = createClient()

  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [restaurantSlug, setRestaurantSlug] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [loading, setLoading] = useState(true)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const [newTableName, setNewTableName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  const [printTarget, setPrintTarget] = useState<RestaurantTable | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    async function load() {
      setLoading(true)

      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: restaurant } = await supabase
          .from('restaurants')
          .select('slug, name')
          .eq('owner_id', user.id)
          .single()

        if (restaurant) {
          setRestaurantSlug(restaurant.slug)
          setRestaurantName(restaurant.name)
        }
      }

      const result = await getTables()
      if (result.ok) {
        setTables(result.data)
      } else {
        setGlobalError(result.error)
      }

      setLoading(false)
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCreate() {
    setCreateError(null)
    const name = newTableName.trim()
    if (!name) { setCreateError('Digite o nome ou número da mesa.'); return }

    startTransition(async () => {
      const result = await createTable(name)
      if (result.ok) {
        setTables((prev) => [...prev, result.data])
        setNewTableName('')
      } else {
        setCreateError(result.error)
      }
    })
  }

  function handleToggle(table: RestaurantTable) {
    setPendingId(table.id)
    startTransition(async () => {
      const result = await toggleTableActive(table.id, !table.is_active)
      if (result.ok) setTables((prev) => prev.map((t) => t.id === table.id ? result.data : t))
      setPendingId(null)
    })
  }

  function handleDelete(table: RestaurantTable) {
    setPendingId(table.id)
    startTransition(async () => {
      const result = await deleteTable(table.id)
      if (result.ok) {
        setTables((prev) => prev.filter((t) => t.id !== table.id))
      } else {
        setGlobalError(result.error)
      }
      setPendingId(null)
    })
  }

  const activeTables = tables.filter((t) => t.is_active)
  const inactiveTables = tables.filter((t) => !t.is_active)

  return (
    <div
      className={`${fraunces.variable} ${inter.variable} min-h-screen bg-[#F6F4EF] text-[#2B2622] font-[family-name:var(--font-body)] py-8 px-6`}
    >
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Cabeçalho — oculto no mobile (o layout já exibe na topbar) */}
        <div className="hidden lg:block">
          <span className="text-xs tracking-[0.15em] uppercase text-[#8A8375]">Dashboard</span>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium mt-1">Mesas</h1>
        </div>

        {/* Formulário de criação */}
        <div className="bg-white border border-[#DAD5C9] rounded-sm">
          <div className="border-b border-dashed border-[#DAD5C9] px-6 py-3 flex items-center justify-between">
            <span className="text-[11px] tracking-[0.15em] uppercase text-[#8A8375]">Nova mesa</span>
            <span className="w-2 h-2 rounded-full bg-[#E3A72E]" />
          </div>
          <div className="px-6 py-5">
            <label htmlFor="tableName" className="block text-xs font-medium text-[#8A8375] mb-1.5">
              Nome ou número da mesa
            </label>
            <div className="flex gap-2">
              <input
                id="tableName"
                type="text"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder='Ex.: 12, "Varanda 3", "Balcão"'
                className="flex-1 rounded-sm border border-[#DAD5C9] bg-[#FBFAF7] px-3 py-2.5 text-sm outline-none focus:border-[#3F6B4F] focus:ring-2 focus:ring-[#3F6B4F]/20 transition"
              />
              <button
                onClick={handleCreate}
                disabled={isPending}
                className="shrink-0 bg-[#2B2622] text-[#F6F4EF] text-sm font-medium rounded-sm px-4 py-2.5 hover:bg-[#3F6B4F] transition disabled:opacity-50"
              >
                {isPending ? 'Criando…' : '+ Criar'}
              </button>
            </div>

            {createError && (
              <p role="alert" className="text-sm text-[#C1502E] bg-[#C1502E]/[0.08] border border-[#C1502E]/20 rounded-sm px-3 py-2 mt-3">
                {createError}
              </p>
            )}

            <p className="text-[11px] text-[#B8B2A2] mt-2">
              Cada mesa recebe um QR Code e um token NFC únicos, prontos para imprimir ou programar no adesivo.
            </p>
          </div>
        </div>

        {globalError && (
          <p role="alert" className="text-sm text-[#C1502E] bg-[#C1502E]/[0.08] border border-[#C1502E]/20 rounded-sm px-4 py-3">
            {globalError}
          </p>
        )}

        {loading && (
          <p className="text-sm text-[#8A8375] text-center py-12">Carregando mesas…</p>
        )}

        {!loading && tables.length === 0 && (
          <div className="border border-dashed border-[#DAD5C9] rounded-sm py-14 px-6 text-center">
            <p className="font-[family-name:var(--font-display)] text-xl mb-1">Nenhuma mesa cadastrada</p>
            <p className="text-sm text-[#8A8375]">Crie a primeira mesa acima para gerar o QR Code e o link NFC.</p>
          </div>
        )}

        {!loading && activeTables.length > 0 && (
          <section>
            <h2 className="text-xs tracking-[0.15em] uppercase text-[#8A8375] mb-3">
              Ativas · {activeTables.length}
            </h2>
            <ul className="space-y-3">
              {activeTables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  restaurantSlug={restaurantSlug}
                  onToggle={() => handleToggle(table)}
                  onDelete={() => handleDelete(table)}
                  onPrint={() => setPrintTarget(table)}
                  pending={pendingId === table.id || isPending}
                />
              ))}
            </ul>
          </section>
        )}

        {!loading && inactiveTables.length > 0 && (
          <section>
            <h2 className="text-xs tracking-[0.15em] uppercase text-[#8A8375] mb-3">
              Inativas · {inactiveTables.length}
            </h2>
            <ul className="space-y-3 opacity-60">
              {inactiveTables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  restaurantSlug={restaurantSlug}
                  onToggle={() => handleToggle(table)}
                  onDelete={() => handleDelete(table)}
                  onPrint={() => setPrintTarget(table)}
                  pending={pendingId === table.id || isPending}
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      {printTarget && (
        <PrintModal
          table={printTarget}
          restaurantSlug={restaurantSlug}
          restaurantName={restaurantName}
          onClose={() => setPrintTarget(null)}
        />
      )}
    </div>
  )
}
