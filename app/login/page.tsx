'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
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

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (signInError) {
      setError('E-mail ou senha incorretos.')
      return
    }

    router.push('/dashboard/produtos')
    router.refresh()
  }

  return (
    <div
      className={`${fraunces.variable} ${inter.variable} min-h-screen flex font-[family-name:var(--font-body)] bg-[#F6F4EF] text-[#2B2622]`}
    >
      {/* Painel de marca (some em telas pequenas) */}
      <div className="hidden lg:flex lg:w-[42%] relative flex-col justify-between bg-[#3F6B4F] text-[#F6F4EF] p-12 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'radial-gradient(circle, #F6F4EF 1.5px, transparent 1.5px)',
            backgroundSize: '28px 28px',
          }}
        />
        <span className="relative z-10 text-xs tracking-[0.2em] uppercase text-[#CFE0D3]">
          Painel do restaurante
        </span>

        <div className="relative z-10">
          <h1 className="font-[family-name:var(--font-display)] text-[2.75rem] leading-[1.1] font-medium">
            O cardápio muda.
            <br />O trabalho, não.
          </h1>
          <p className="mt-4 text-[#CFE0D3] max-w-sm">
            Entre para atualizar pratos, preços e fotos — tudo em um só
            lugar, direto para a mesa do cliente.
          </p>
        </div>

        <span className="relative z-10 text-xs text-[#9FBFA9]">
          © {new Date().getFullYear()} — Cardápio Digital
        </span>
      </div>

      {/* Formulário */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="bg-white border border-[#DAD5C9] rounded-sm">
            {/* Faixa estilo "ficha" — elemento de assinatura visual */}
            <div className="border-b border-dashed border-[#DAD5C9] px-8 py-3 flex items-center justify-between">
              <span className="text-[11px] tracking-[0.15em] uppercase text-[#8A8375]">
                Acesso do dono
              </span>
              <span className="w-2 h-2 rounded-full bg-[#E3A72E]" />
            </div>

            <form onSubmit={handleSubmit} className="px-8 py-8 space-y-5">
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-medium">
                Entrar
              </h2>

              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-[#8A8375] mb-1.5"
                >
                  E-mail
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@restaurante.com"
                  className="w-full rounded-sm border border-[#DAD5C9] bg-[#FBFAF7] px-3 py-2.5 text-sm outline-none focus:border-[#3F6B4F] focus:ring-2 focus:ring-[#3F6B4F]/20 transition"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-[#8A8375] mb-1.5"
                >
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-sm border border-[#DAD5C9] bg-[#FBFAF7] px-3 py-2.5 text-sm outline-none focus:border-[#3F6B4F] focus:ring-2 focus:ring-[#3F6B4F]/20 transition"
                />
              </div>

              {error && (
                <p
                  role="alert"
                  className="text-sm text-[#C1502E] bg-[#C1502E]/[0.08] border border-[#C1502E]/20 rounded-sm px-3 py-2"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#2B2622] text-[#F6F4EF] text-sm font-medium rounded-sm py-2.5 hover:bg-[#3F6B4F] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3F6B4F]/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
