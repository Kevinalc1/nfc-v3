'use client'

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
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

const MAX_IMAGE_MB = 5
const MAX_VIDEO_MB = 50

export default function NovoProdutoPage() {
  const router = useRouter()
  const supabase = createClient()

  const [restaurantId, setRestaurantId] = useState<string | null>(null)
  const [categories, setCategories] = useState<Tables<'categories'>[]>([])
  const [loadingContext, setLoadingContext] = useState(true)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [categoryId, setCategoryId] = useState('')

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  // Carrega o restaurante do dono logado e suas categorias
  useEffect(() => {
    async function loadContext() {
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

      if (restaurant) {
        setRestaurantId(restaurant.id)

        const { data: cats } = await supabase
          .from('categories')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .order('display_order')

        setCategories(cats ?? [])
      }

      setLoadingContext(false)
    }

    loadContext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`A foto deve ter até ${MAX_IMAGE_MB}MB.`)
      return
    }

    setError(null)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function handleVideoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`O vídeo deve ter até ${MAX_VIDEO_MB}MB.`)
      return
    }

    setError(null)
    setVideoFile(file)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!restaurantId) {
      setError('Não foi possível identificar o seu restaurante.')
      return
    }

    if (!name.trim() || !price) {
      setError('Preencha ao menos o nome e o preço do prato.')
      return
    }

    const parsedPrice = Number(price.replace(',', '.'))
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setError('Informe um preço válido.')
      return
    }

    setSaving(true)

    try {
      let imageUrl: string | null = null
      let videoUrl: string | null = null

      if (imageFile) {
        const path = `${restaurantId}/${Date.now()}-${imageFile.name}`
        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(path, imageFile)

        if (uploadError) throw uploadError

        imageUrl = supabase.storage.from('product-images').getPublicUrl(path)
          .data.publicUrl
      }

      if (videoFile) {
        const path = `${restaurantId}/${Date.now()}-${videoFile.name}`
        const { error: uploadError } = await supabase.storage
          .from('product-videos')
          .upload(path, videoFile)

        if (uploadError) throw uploadError

        videoUrl = supabase.storage.from('product-videos').getPublicUrl(path)
          .data.publicUrl
      }

      const { error: insertError } = await supabase.from('products').insert({
        restaurant_id: restaurantId,
        category_id: categoryId || null,
        name: name.trim(),
        description: description.trim() || null,
        price: parsedPrice,
        image_url: imageUrl,
        video_url: videoUrl,
      })

      if (insertError) throw insertError

      setSuccess(true)
      setTimeout(() => router.push('/dashboard/produtos'), 900)
    } catch (err) {
      console.error(err)
      setError('Não foi possível salvar o prato. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  if (loadingContext) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F4EF] text-sm text-[#8A8375]">
        Carregando…
      </div>
    )
  }

  return (
    <div
      className={`${fraunces.variable} ${inter.variable} min-h-screen bg-[#F6F4EF] text-[#2B2622] font-[family-name:var(--font-body)] py-10 px-6`}
    >
      <div className="max-w-xl mx-auto">
        <span className="text-xs tracking-[0.15em] uppercase text-[#8A8375]">
          Cardápio
        </span>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium mt-1 mb-8">
          Novo prato
        </h1>

        {/* Cartão estilo "ficha de receita" — elemento de assinatura visual */}
        <div className="bg-white border border-[#DAD5C9] rounded-sm">
          <div className="border-b border-dashed border-[#DAD5C9] px-8 py-3 flex items-center justify-between">
            <span className="text-[11px] tracking-[0.15em] uppercase text-[#8A8375]">
              Ficha do prato
            </span>
            <span className="w-2 h-2 rounded-full bg-[#3F6B4F]" />
          </div>

          <form onSubmit={handleSubmit} className="px-8 py-8 space-y-6">
            {/* Nome */}
            <div>
              <label
                htmlFor="name"
                className="block text-xs font-medium text-[#8A8375] mb-1.5"
              >
                Nome do prato
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Risoto de funghi"
                className="w-full rounded-sm border border-[#DAD5C9] bg-[#FBFAF7] px-3 py-2.5 text-sm outline-none focus:border-[#3F6B4F] focus:ring-2 focus:ring-[#3F6B4F]/20 transition"
              />
            </div>

            {/* Categoria */}
            {categories.length > 0 && (
              <div>
                <label
                  htmlFor="category"
                  className="block text-xs font-medium text-[#8A8375] mb-1.5"
                >
                  Categoria
                </label>
                <select
                  id="category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-sm border border-[#DAD5C9] bg-[#FBFAF7] px-3 py-2.5 text-sm outline-none focus:border-[#3F6B4F] focus:ring-2 focus:ring-[#3F6B4F]/20 transition"
                >
                  <option value="">Sem categoria</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Descrição */}
            <div>
              <label
                htmlFor="description"
                className="block text-xs font-medium text-[#8A8375] mb-1.5"
              >
                Descrição
              </label>
              <textarea
                id="description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ingredientes, modo de preparo, o que faz esse prato especial…"
                className="w-full rounded-sm border border-[#DAD5C9] bg-[#FBFAF7] px-3 py-2.5 text-sm outline-none focus:border-[#3F6B4F] focus:ring-2 focus:ring-[#3F6B4F]/20 transition resize-none"
              />
            </div>

            {/* Preço */}
            <div>
              <label
                htmlFor="price"
                className="block text-xs font-medium text-[#8A8375] mb-1.5"
              >
                Preço
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#8A8375] font-[family-name:var(--font-mono,monospace)]">
                  R$
                </span>
                <input
                  id="price"
                  type="text"
                  inputMode="decimal"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-sm border border-[#DAD5C9] bg-[#FBFAF7] pl-9 pr-3 py-2.5 text-sm font-mono outline-none focus:border-[#3F6B4F] focus:ring-2 focus:ring-[#3F6B4F]/20 transition"
                />
              </div>
            </div>

            {/* Foto */}
            <div>
              <label className="block text-xs font-medium text-[#8A8375] mb-1.5">
                Foto do prato
              </label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-sm border border-[#DAD5C9] bg-[#FBFAF7] overflow-hidden flex items-center justify-center shrink-0">
                  {imagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imagePreview}
                      alt="Pré-visualização do prato"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] text-[#B8B2A2] text-center px-1">
                      Sem foto
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="w-full text-sm text-[#8A8375] file:mr-3 file:rounded-sm file:border file:border-[#DAD5C9] file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#2B2622] hover:file:bg-[#F6F4EF] file:cursor-pointer cursor-pointer"
                  />
                  <p className="text-[11px] text-[#B8B2A2] mt-1">
                    JPG ou PNG, até {MAX_IMAGE_MB}MB.
                  </p>
                </div>
              </div>
            </div>

            {/* Vídeo */}
            <div>
              <label
                htmlFor="video"
                className="block text-xs font-medium text-[#8A8375] mb-1.5"
              >
                Vídeo do prato (opcional)
              </label>
              <input
                id="video"
                type="file"
                accept="video/*"
                onChange={handleVideoChange}
                className="w-full text-sm text-[#8A8375] file:mr-3 file:rounded-sm file:border file:border-[#DAD5C9] file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#2B2622] hover:file:bg-[#F6F4EF] file:cursor-pointer cursor-pointer"
              />
              {videoFile && (
                <p className="text-[11px] text-[#3F6B4F] mt-1">
                  {videoFile.name}
                </p>
              )}
              <p className="text-[11px] text-[#B8B2A2] mt-1">
                MP4 ou MOV, até {MAX_VIDEO_MB}MB.
              </p>
            </div>

            {error && (
              <p
                role="alert"
                className="text-sm text-[#C1502E] bg-[#C1502E]/[0.08] border border-[#C1502E]/20 rounded-sm px-3 py-2"
              >
                {error}
              </p>
            )}

            {success && (
              <p className="text-sm text-[#3F6B4F] bg-[#3F6B4F]/[0.08] border border-[#3F6B4F]/20 rounded-sm px-3 py-2">
                Prato salvo com sucesso!
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-[#2B2622] text-[#F6F4EF] text-sm font-medium rounded-sm py-2.5 hover:bg-[#3F6B4F] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3F6B4F]/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Salvando…' : 'Salvar prato'}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="px-5 text-sm font-medium rounded-sm border border-[#DAD5C9] hover:bg-[#F6F4EF] transition"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
