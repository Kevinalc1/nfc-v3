'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Fraunces, Inter } from 'next/font/google'
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
// Navegação
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  {
    href: '/dashboard/pedidos',
    label: 'Pedidos',
    icon: IconOrders,
    matchPrefix: '/dashboard/pedidos',
  },
  {
    href: '/dashboard/produtos',
    label: 'Produtos',
    icon: IconProducts,
    matchPrefix: '/dashboard/produtos',
  },
  {
    href: '/dashboard/mesas',
    label: 'Mesas',
    icon: IconTables,
    matchPrefix: '/dashboard/mesas',
  },
  {
    href: '/dashboard/configuracoes',
    label: 'Configurações',
    icon: IconSettings,
    matchPrefix: '/dashboard/configuracoes',
  },
]

// ---------------------------------------------------------------------------
// Layout principal
// ---------------------------------------------------------------------------

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const [restaurantName, setRestaurantName] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  // Sidebar mobile: aberta ou fechada
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    async function loadRestaurant() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('restaurants')
        .select('name')
        .eq('owner_id', user.id)
        .single()

      if (data) setRestaurantName(data.name)
    }

    loadRestaurant()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fecha sidebar ao mudar de rota (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  async function handleLogout() {
    setLoggingOut(true)
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div
      className={`${fraunces.variable} ${inter.variable} font-[family-name:var(--font-body)] min-h-screen bg-[#F6F4EF] text-[#2B2622]`}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Overlay de fundo (mobile) — fecha a sidebar ao clicar fora          */}
      {/* ------------------------------------------------------------------ */}
      {sidebarOpen && (
        <div
          aria-hidden
          className="fixed inset-0 z-20 bg-[#2B2622]/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Sidebar                                                              */}
      {/* ------------------------------------------------------------------ */}
      <aside
        className={`
          fixed top-0 left-0 z-30 h-full w-64 bg-[#2B2622] text-[#F6F4EF]
          flex flex-col
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        {/* Topo: logo do produto + nome do restaurante */}
        <div className="px-6 pt-8 pb-6 border-b border-white/10">
          {/* Logo do produto — arquivo público /logo.svg com fundo transparente */}
          <Image
            src="/logo.svg"
            alt="Logo do Restaurante"
            width={128}
            height={40}
            className="w-32 h-auto object-contain"
            priority
          />

          {/* Nome do restaurante abaixo da logo */}
          <div className="mt-4">
            {restaurantName ? (
              <p className="font-[family-name:var(--font-display)] text-sm font-medium leading-snug text-[#CFE0D3]">
                {restaurantName}
              </p>
            ) : (
              <span className="inline-block w-28 h-4 rounded bg-white/10 animate-pulse" />
            )}
          </div>
        </div>

        {/* Navegação */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon, matchPrefix }) => {
            const active = pathname.startsWith(matchPrefix)
            return (
              <Link
                key={href}
                href={href}
                className={`
                  flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium transition
                  ${
                    active
                      ? 'bg-white/10 text-[#F6F4EF]'
                      : 'text-[#9FBFA9] hover:bg-white/5 hover:text-[#F6F4EF]'
                  }
                `}
              >
                {/* Marcador de ativo */}
                <span
                  className={`w-1 h-4 rounded-full transition-all ${
                    active ? 'bg-[#9FBFA9]' : 'bg-transparent'
                  }`}
                />
                <Icon
                  className={`w-4 h-4 shrink-0 ${active ? 'text-[#F6F4EF]' : 'text-[#9FBFA9]'}`}
                />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Rodapé: botão de logout */}
        <div className="px-3 pb-6 pt-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium text-[#9FBFA9] hover:bg-white/5 hover:text-[#F6F4EF] transition disabled:opacity-50"
          >
            <span className="w-1 h-4 rounded-full bg-transparent" />
            <IconLogout className="w-4 h-4 shrink-0" />
            {loggingOut ? 'Saindo…' : 'Sair'}
          </button>
        </div>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Área principal (empurrada para a direita no desktop)                */}
      {/* ------------------------------------------------------------------ */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Topbar mobile */}
        <header className="lg:hidden sticky top-0 z-10 bg-[#F6F4EF]/95 backdrop-blur border-b border-[#DAD5C9] px-4 h-14 flex items-center gap-3">
          {/* Botão hamburguer */}
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
            className="p-2 rounded-sm hover:bg-[#DAD5C9]/50 transition"
          >
            <IconMenu className="w-5 h-5" />
          </button>

          {/* Título da rota ativa */}
          <span className="font-[family-name:var(--font-display)] text-base font-medium">
            {NAV_ITEMS.find((n) => pathname.startsWith(n.matchPrefix))?.label ??
              'Dashboard'}
          </span>

          {/* Atalho de logout visível no mobile */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            aria-label="Sair"
            className="ml-auto p-2 rounded-sm text-[#8A8375] hover:bg-[#DAD5C9]/50 transition disabled:opacity-50"
          >
            <IconLogout className="w-5 h-5" />
          </button>
        </header>

        {/* Conteúdo da rota */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ícones inline (SVG puro — zero dependências)
// ---------------------------------------------------------------------------

function IconOrders({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  )
}

function IconProducts({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18M3 12h18M3 18h18" />
      <circle cx="7" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="7" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="7" cy="18" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconLogout({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function IconTables({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}
