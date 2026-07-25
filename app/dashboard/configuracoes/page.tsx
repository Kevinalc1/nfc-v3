'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Fraunces, Inter } from 'next/font/google'
import {
  getRestaurantSettings,
  updateRestaurantSettings,
  checkSlugAvailability,
  type Restaurant,
} from '@/app/actions/restaurant'
import { SLUG_RULES } from '@/lib/validations/restaurant'

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
// Tipos internos
// ---------------------------------------------------------------------------

type SlugStatus =
  | { state: 'idle' }
  | { state: 'typing' }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'taken' }
  | { state: 'invalid'; hint: string }
  | { state: 'unchanged' }

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-')
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

// ---------------------------------------------------------------------------
// Sub-componente: indicador visual do slug
// ---------------------------------------------------------------------------

function SlugIndicator({ status }: { status: SlugStatus }) {
  if (status.state === 'idle' || status.state === 'unchanged') return null

  const map: Record<
    Exclude<SlugStatus['state'], 'idle' | 'unchanged'>,
    { label: string; className: string }
  > = {
    typing:   { label: 'Verificando…',      className: 'text-[#8A8375]' },
    checking: { label: 'Verificando…',      className: 'text-[#8A8375]' },
    available:{ label: '✓ Disponível',      className: 'text-[#3F6B4F]' },
    taken:    { label: '✗ Já está em uso',  className: 'text-[#C1502E]' },
    invalid:  {
      label: status.state === 'invalid' ? status.hint : '',
      className: 'text-[#C1502E]',
    },
  }

  const item = map[status.state as keyof typeof map]
  if (!item) return null

  return (
    <p className={`text-[11px] mt-1.5 ${item.className}`}>{item.label}</p>
  )
}

// ---------------------------------------------------------------------------
// Sub-componente: cartão de seção
// ---------------------------------------------------------------------------

function SectionCard({
  title,
  dot,
  children,
}: {
  title: string
  dot: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-[#DAD5C9] rounded-sm">
      <div className="border-b border-dashed border-[#DAD5C9] px-6 py-3 flex items-center justify-between">
        <span className="text-[11px] tracking-[0.15em] uppercase text-[#8A8375]">
          {title}
        </span>
        <span className={`w-2 h-2 rounded-full ${dot}`} />
      </div>
      <div className="px-6 py-6">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function ConfiguracoesPage() {
  const [original, setOriginal] = useState<Restaurant | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')

  const [slugStatus, setSlugStatus] = useState<SlugStatus>({ state: 'idle' })
  const debouncedSlug = useDebounce(slug, 600)

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const checkAbortRef = useRef<AbortController | null>(null)

  // ---------------------------------------------------------------------------
  // Carrega dados iniciais
  // ---------------------------------------------------------------------------

  useEffect(() => {
    async function load() {
      const result = await getRestaurantSettings()
      if (result.ok) {
        setOriginal(result.data)
        setName(result.data.name)
        setSlug(result.data.slug)
        setDescription(result.data.description ?? '')
      } else {
        setLoadError(result.error)
      }
      setLoading(false)
    }
    load()
  }, [])

  // ---------------------------------------------------------------------------
  // Verificação de slug em tempo real (debounced)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!original) return

    const normalized = normalizeSlug(debouncedSlug)

    if (normalized === original.slug) {
      setSlugStatus({ state: 'unchanged' })
      return
    }
    if (!normalized || normalized.length < SLUG_RULES.minLength) {
      setSlugStatus({ state: 'invalid', hint: `Mínimo de ${SLUG_RULES.minLength} caracteres.` })
      return
    }
    if (!SLUG_RULES.pattern.test(normalized)) {
      setSlugStatus({ state: 'invalid', hint: SLUG_RULES.patternHint })
      return
    }
    if (normalized.length > SLUG_RULES.maxLength) {
      setSlugStatus({ state: 'invalid', hint: `Máximo de ${SLUG_RULES.maxLength} caracteres.` })
      return
    }

    setSlugStatus({ state: 'checking' })
    checkAbortRef.current?.abort()
    checkAbortRef.current = new AbortController()

    checkSlugAvailability(normalized).then((result) => {
      if (result.ok) {
        setSlugStatus(result.data ? { state: 'available' } : { state: 'taken' })
      }
    })
  }, [debouncedSlug, original])

  function handleSlugChange(value: string) {
    setSlug(value)
    setSlugStatus({ state: 'typing' })
  }

  // ---------------------------------------------------------------------------
  // Controle de estado do formulário
  // ---------------------------------------------------------------------------

  const hasChanges =
    original !== null &&
    (name.trim() !== original.name ||
      normalizeSlug(slug) !== original.slug ||
      (description.trim() || null) !== original.description)

  const slugBlocking =
    slugStatus.state === 'taken' ||
    slugStatus.state === 'invalid' ||
    slugStatus.state === 'checking'

  const canSave = hasChanges && !slugBlocking && !isPending

  // ---------------------------------------------------------------------------
  // Submit e reset
  // ---------------------------------------------------------------------------

  function handleSubmit() {
    if (!canSave) return
    setSaveError(null)
    setSaveStatus('saving')

    startTransition(async () => {
      const result = await updateRestaurantSettings({
        name: name.trim(),
        slug: normalizeSlug(slug),
        description: description.trim(),
      })

      if (result.ok) {
        setOriginal(result.data)
        setName(result.data.name)
        setSlug(result.data.slug)
        setDescription(result.data.description ?? '')
        setSlugStatus({ state: 'unchanged' })
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 3000)
      } else {
        setSaveError(result.error)
        setSaveStatus('error')
      }
    })
  }

  function handleReset() {
    if (!original) return
    setName(original.name)
    setSlug(original.slug)
    setDescription(original.description ?? '')
    setSlugStatus({ state: 'unchanged' })
    setSaveStatus('idle')
    setSaveError(null)
  }

  // ---------------------------------------------------------------------------
  // Estados de carregamento e erro
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F4EF] text-sm text-[#8A8375]">
        Carregando configurações…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F4EF] px-6">
        <p className="text-sm text-[#C1502E] bg-[#C1502E]/[0.08] border border-[#C1502E]/20 rounded-sm px-4 py-3 max-w-sm text-center">
          {loadError}
        </p>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render principal
  // ---------------------------------------------------------------------------

  const appUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? ''

  const previewUrl = `${appUrl}/m/${normalizeSlug(slug) || '…'}/`

  return (
    <div
      className={`${fraunces.variable} ${inter.variable} min-h-screen bg-[#F6F4EF] text-[#2B2622] font-[family-name:var(--font-body)] py-8 px-6`}
    >
      <div className="max-w-xl mx-auto space-y-6">

        {/* Cabeçalho — oculto no mobile (o layout já exibe na topbar) */}
        <div className="hidden lg:block">
          <span className="text-xs tracking-[0.15em] uppercase text-[#8A8375]">
            Dashboard
          </span>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium mt-1">
            Configurações
          </h1>
        </div>

        {/* ── Identidade ── */}
        <SectionCard title="Identidade do restaurante" dot="bg-[#3F6B4F]">
          <div className="space-y-5">
            <div>
              <label htmlFor="name" className="block text-xs font-medium text-[#8A8375] mb-1.5">
                Nome do restaurante
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="Ex.: Pizzaria do João"
                className="w-full rounded-sm border border-[#DAD5C9] bg-[#FBFAF7] px-3 py-2.5 text-sm outline-none focus:border-[#3F6B4F] focus:ring-2 focus:ring-[#3F6B4F]/20 transition"
              />
              <div className="flex justify-end mt-1">
                <span className={`text-[10px] tabular-nums ${name.length > 90 ? 'text-[#C1502E]' : 'text-[#B8B2A2]'}`}>
                  {name.length}/100
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="description" className="block text-xs font-medium text-[#8A8375] mb-1.5">
                Descrição{' '}
                <span className="font-normal text-[#B8B2A2]">(opcional)</span>
              </label>
              <textarea
                id="description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                placeholder="Aparece no topo do cardápio para o cliente."
                className="w-full rounded-sm border border-[#DAD5C9] bg-[#FBFAF7] px-3 py-2.5 text-sm outline-none focus:border-[#3F6B4F] focus:ring-2 focus:ring-[#3F6B4F]/20 transition resize-none"
              />
              <div className="flex justify-end mt-1">
                <span className={`text-[10px] tabular-nums ${description.length > 450 ? 'text-[#C1502E]' : 'text-[#B8B2A2]'}`}>
                  {description.length}/500
                </span>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ── URL pública ── */}
        <SectionCard title="URL do cardápio" dot="bg-[#E3A72E]">
          <div className="space-y-4">
            <div>
              <label htmlFor="slug" className="block text-xs font-medium text-[#8A8375] mb-1.5">
                Slug{' '}
                <span className="font-normal text-[#B8B2A2]">(identificador único na URL)</span>
              </label>
              <div className="flex rounded-sm border border-[#DAD5C9] overflow-hidden focus-within:border-[#3F6B4F] focus-within:ring-2 focus-within:ring-[#3F6B4F]/20 transition">
                <span className="flex items-center bg-[#F6F4EF] px-3 text-[11px] text-[#8A8375] border-r border-[#DAD5C9] shrink-0 select-none">
                  /m/
                </span>
                <input
                  id="slug"
                  type="text"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  maxLength={SLUG_RULES.maxLength}
                  placeholder="meu-restaurante"
                  className="flex-1 bg-[#FBFAF7] px-3 py-2.5 text-sm outline-none font-mono"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="none"
                />
              </div>
              <SlugIndicator status={slugStatus} />
              <p className="text-[11px] text-[#B8B2A2] mt-1.5">{SLUG_RULES.patternHint}</p>
            </div>

            {/* Preview da URL */}
            <div className="rounded-sm bg-[#F6F4EF] border border-[#DAD5C9] px-4 py-3">
              <p className="text-[10px] tracking-[0.12em] uppercase text-[#8A8375] mb-1">
                URL pública do cardápio
              </p>
              <p className="text-xs font-mono text-[#2B2622] break-all">
                {previewUrl}
                <span className="text-[#8A8375]">[número-da-mesa]</span>
              </p>
            </div>

            {/* Aviso de impacto ao trocar slug */}
            {original && normalizeSlug(slug) !== original.slug && (
              <div className="flex gap-2.5 rounded-sm bg-[#E3A72E]/[0.08] border border-[#E3A72E]/30 px-4 py-3">
                <span className="text-[#A87209] mt-0.5 shrink-0">⚠</span>
                <p className="text-xs text-[#A87209]">
                  Alterar o slug muda a URL de todos os QR Codes e adesivos NFC
                  já impressos. Atualize os materiais físicos após salvar.
                </p>
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── Zona de perigo ── */}
        <SectionCard title="Zona de perigo" dot="bg-[#C1502E]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Desativar restaurante</p>
              <p className="text-xs text-[#8A8375] mt-0.5 max-w-xs">
                O cardápio público fica inacessível para clientes. Você continua
                com acesso ao painel normalmente.
              </p>
            </div>
            <button
              disabled
              title="Em breve"
              className="shrink-0 text-xs font-medium rounded-sm border border-[#C1502E]/30 text-[#C1502E] px-3 py-1.5 opacity-40 cursor-not-allowed"
            >
              Desativar
            </button>
          </div>
        </SectionCard>

        {/* ── Barra de ações sticky ── */}
        <div className="sticky bottom-4 z-10">
          <div className="bg-white border border-[#DAD5C9] rounded-sm px-5 py-4 flex items-center justify-between gap-4 shadow-sm">
            <div className="flex-1 min-w-0">
              {saveStatus === 'saved' && (
                <p className="text-sm text-[#3F6B4F]">✓ Configurações salvas</p>
              )}
              {saveStatus === 'error' && saveError && (
                <p className="text-sm text-[#C1502E] truncate">{saveError}</p>
              )}
              {saveStatus === 'idle' && hasChanges && (
                <p className="text-xs text-[#8A8375]">Você tem alterações não salvas.</p>
              )}
              {saveStatus === 'idle' && !hasChanges && (
                <p className="text-xs text-[#B8B2A2]">Nenhuma alteração.</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasChanges && (
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isPending}
                  className="text-sm font-medium rounded-sm border border-[#DAD5C9] px-4 py-2 hover:bg-[#F6F4EF] transition disabled:opacity-50"
                >
                  Descartar
                </button>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSave}
                className="text-sm font-medium rounded-sm bg-[#2B2622] text-[#F6F4EF] px-4 py-2 hover:bg-[#3F6B4F] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
