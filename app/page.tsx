// app/page.tsx
// Server Component — sem 'use client'.
// Renderizado no servidor: HTML pronto na primeira requisição, zero JS extra.

import Image from 'next/image'
import Link from 'next/link'
import { Fraunces, Inter } from 'next/font/google'

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-display',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
})

// ---------------------------------------------------------------------------
// Dados estáticos — edite aqui sem tocar no JSX
// ---------------------------------------------------------------------------

const BENEFITS = [
  {
    icon: '⚡',
    title: 'Pedidos em Tempo Real',
    description:
      'A cozinha recebe cada pedido instantaneamente via WebSocket. Sem papel, sem grito, sem erro de comunicação entre salão e cozinha.',
  },
  {
    icon: '📱',
    title: 'Cardápio via QR Code e NFC',
    description:
      'O cliente escaneia o código na mesa e faz o pedido pelo próprio celular. Sem app para baixar, sem fila no caixa.',
  },
  {
    icon: '📊',
    title: 'Gestão de Cozinha Kanban',
    description:
      'Painel visual com colunas Novos → Preparando → Entregues. A equipe avança o status com um toque e todos ficam sincronizados.',
  },
] as const

const STEPS = [
  { number: '01', label: 'Crie seu restaurante e monte o cardápio' },
  { number: '02', label: 'Gere os QR Codes e programe os adesivos NFC' },
  { number: '03', label: 'Receba pedidos e acompanhe em tempo real' },
] as const

// ---------------------------------------------------------------------------
// Componentes internos (Server Components puros)
// ---------------------------------------------------------------------------

function Navbar() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-[#F6F4EF]/90 backdrop-blur border-b border-[#DAD5C9]">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
        <Image
          src="/logo.svg"
          alt="Logo do Restaurante"
          width={120}
          height={38}
          className="w-28 h-auto object-contain"
          priority
        />

        <div className="flex items-center gap-3">
          <Link
            href="https://wa.me/"
            className="hidden sm:inline-flex text-sm text-[#8A8375] hover:text-[#2B2622] transition"
          >
            Falar com consultor
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium bg-[#2B2622] text-[#F6F4EF] rounded-sm px-4 py-2 hover:bg-[#3F6B4F] transition"
          >
            Acessar sistema
          </Link>
        </div>
      </div>
    </nav>
  )
}

function HeroSection() {
  return (
    <section className="pt-40 pb-24 px-6 text-center">
      <div className="max-w-3xl mx-auto">
        {/* Eyebrow */}
        <span className="inline-block text-[11px] tracking-[0.25em] uppercase text-[#8A8375] bg-[#DAD5C9]/60 border border-[#DAD5C9] rounded-full px-4 py-1.5 mb-8">
          SaaS de Cardápio Digital para Restaurantes
        </span>

        {/* Título principal */}
        <h1
          className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl lg:text-6xl font-medium text-[#2B2622] leading-[1.08] tracking-tight"
        >
          Revolucione o atendimento
          <br />
          <span className="text-[#3F6B4F]">do seu restaurante</span>
        </h1>

        {/* Subtítulo */}
        <p className="mt-6 text-base sm:text-lg text-[#8A8375] leading-relaxed max-w-xl mx-auto">
          Do QR Code na mesa ao painel da cozinha — tudo conectado, tudo em
          tempo real. Seus clientes pedem mais rápido, sua equipe entrega com
          menos erro.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/login"
            className="w-full sm:w-auto text-sm font-semibold bg-[#2B2622] text-[#F6F4EF] rounded-sm px-7 py-3.5 hover:bg-[#3F6B4F] transition"
          >
            Acessar o sistema →
          </Link>
          <Link
            href="https://wa.me/"
            className="w-full sm:w-auto text-sm font-medium border border-[#DAD5C9] text-[#2B2622] rounded-sm px-7 py-3.5 hover:bg-[#DAD5C9]/40 transition flex items-center justify-center gap-2"
          >
            <WhatsAppIcon />
            Falar com consultor
          </Link>
        </div>

        {/* Prova social mínima */}
        <p className="mt-8 text-xs text-[#B8B2A2]">
          Sem cartão de crédito · Configuração em menos de 10 minutos
        </p>
      </div>

      {/* Decoração: preview do painel */}
      <div className="mt-16 max-w-4xl mx-auto">
        <div className="relative bg-white border border-[#DAD5C9] rounded-sm shadow-sm overflow-hidden">
          {/* Barra de "browser" falsa */}
          <div className="bg-[#F6F4EF] border-b border-[#DAD5C9] px-4 py-3 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#C1502E]/40" />
            <span className="w-3 h-3 rounded-full bg-[#E3A72E]/40" />
            <span className="w-3 h-3 rounded-full bg-[#3F6B4F]/40" />
            <span className="ml-3 flex-1 bg-[#DAD5C9]/50 rounded-full h-5 max-w-xs text-[10px] text-[#8A8375] flex items-center px-3">
              dashboard/pedidos
            </span>
          </div>

          {/* Kanban mockup */}
          <div className="p-5 grid grid-cols-3 gap-3 min-h-[200px]">
            {[
              { label: 'Novos', color: '#E3A72E', cards: ['Mesa 4 · 3 itens', 'Mesa 7 · 1 item'] },
              { label: 'Preparando', color: '#4A72A6', cards: ['Mesa 2 · 2 itens'] },
              { label: 'Entregues', color: '#3F6B4F', cards: ['Mesa 1 · 4 itens', 'Mesa 6 · 2 itens', 'Mesa 3 · 1 item'] },
            ].map((col) => (
              <div key={col.label}>
                <div
                  className="text-[10px] font-semibold tracking-widest uppercase pb-2 mb-2 border-b-2"
                  style={{ color: col.color, borderColor: col.color }}
                >
                  {col.label}
                </div>
                <div className="space-y-2">
                  {col.cards.map((card) => (
                    <div
                      key={card}
                      className="bg-[#FBFAF7] border border-[#DAD5C9] rounded-sm px-3 py-2 text-[11px] text-[#2B2622]"
                    >
                      {card}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-[#B8B2A2] mt-3 text-center">
          Painel de pedidos em tempo real — cozinha e salão sempre sincronizados
        </p>
      </div>
    </section>
  )
}

function BenefitsSection() {
  return (
    <section className="py-20 px-6 bg-white border-y border-[#DAD5C9]">
      <div className="max-w-5xl mx-auto">
        {/* Título da seção */}
        <div className="text-center mb-14">
          <span className="text-[11px] tracking-[0.2em] uppercase text-[#8A8375]">
            Por que o Cardápio Digital
          </span>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-medium text-[#2B2622] mt-2">
            Tudo que seu restaurante precisa,<br className="hidden sm:block" /> em um só lugar
          </h2>
        </div>

        {/* Grade de benefícios */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {BENEFITS.map((benefit) => (
            <div
              key={benefit.title}
              className="bg-[#F6F4EF] border border-[#DAD5C9] rounded-sm p-6"
            >
              <span className="text-3xl">{benefit.icon}</span>
              <h3 className="font-[family-name:var(--font-display)] text-lg font-medium text-[#2B2622] mt-3 mb-2">
                {benefit.title}
              </h3>
              <p className="text-sm text-[#8A8375] leading-relaxed">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  return (
    <section className="py-20 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <span className="text-[11px] tracking-[0.2em] uppercase text-[#8A8375]">
          Simples assim
        </span>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-medium text-[#2B2622] mt-2 mb-12">
          Configure em 3 passos
        </h2>

        <div className="space-y-5">
          {STEPS.map((step, i) => (
            <div
              key={step.number}
              className="flex items-center gap-5 bg-white border border-[#DAD5C9] rounded-sm px-6 py-4 text-left"
            >
              <span className="font-[family-name:var(--font-display)] text-2xl font-medium text-[#DAD5C9] shrink-0 w-8">
                {step.number}
              </span>
              <div className="w-px h-6 bg-[#DAD5C9] shrink-0" />
              <p className="text-sm font-medium text-[#2B2622]">{step.label}</p>
              {i < STEPS.length - 1 && (
                <span className="ml-auto text-[#DAD5C9] text-lg shrink-0">↓</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CtaSection() {
  return (
    <section className="py-20 px-6 bg-[#2B2622] text-[#F6F4EF]">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-medium leading-tight">
          Pronto para modernizar<br />seu restaurante?
        </h2>
        <p className="mt-4 text-sm text-[#9FBFA9] leading-relaxed max-w-md mx-auto">
          Comece hoje. Configure seu cardápio, gere os QR Codes das mesas e
          receba seu primeiro pedido digital em menos de uma hora.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/login"
            className="w-full sm:w-auto text-sm font-semibold bg-[#3F6B4F] text-[#F6F4EF] rounded-sm px-7 py-3.5 hover:bg-[#4d8460] transition"
          >
            Acessar o sistema →
          </Link>
          <Link
            href="https://wa.me/81986215008"
            className="w-full sm:w-auto text-sm font-medium border border-white/20 text-[#F6F4EF] rounded-sm px-7 py-3.5 hover:bg-white/5 transition flex items-center justify-center gap-2"
          >
            <WhatsAppIcon />
            Falar com consultor
          </Link>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-[#DAD5C9] bg-[#F6F4EF] px-6 py-8">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <Image
          src="/logo.svg"
          alt="Logo do Restaurante"
          width={96}
          height={30}
          className="w-24 h-auto object-contain opacity-50"
        />
        <p className="text-xs text-[#B8B2A2]">
          © {new Date().getFullYear()} K&A — Todos os direitos reservados
        </p>
        <Link
          href="/login"
          className="text-xs text-[#8A8375] hover:text-[#2B2622] transition"
        >
          Área do restaurante →
        </Link>
      </div>
    </footer>
  )
}

// Ícone WhatsApp inline — sem dependência externa
function WhatsAppIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4 shrink-0"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.532 5.862L.057 23.215a.75.75 0 0 0 .922.922l5.353-1.475A11.953 11.953 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.705 9.705 0 0 1-4.953-1.355l-.355-.213-3.676 1.013 1.013-3.676-.213-.355A9.705 9.705 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage() {
  return (
    <div
      className={`${fraunces.variable} ${inter.variable} font-[family-name:var(--font-body)] bg-[#F6F4EF] text-[#2B2622]`}
    >
      <Navbar />
      <main>
        <HeroSection />
        <BenefitsSection />
        <HowItWorksSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  )
}
