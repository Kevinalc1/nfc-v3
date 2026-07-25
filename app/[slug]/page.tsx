// app/[slug]/page.tsx
//
// Vitrine pública do cardápio — Server Component.
// Acessível por qualquer pessoa via link direto (redes sociais, Google Maps…).
// Diferente de app/m/[restaurantSlug]/[tableNumber]/page.tsx, esta rota
// não tem vínculo com mesa, carrinho ou pedido: é somente leitura.
//
// Rota: /{slug}   ex.: /pizzaria-do-joao

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Tables } from '@/types_db'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Restaurant = Tables<'restaurants'>
type Category   = Tables<'categories'>
type Product    = Tables<'products'>

type ProductWithCategory = Product & {
  categories: Pick<Category, 'id' | 'name' | 'display_order'> | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

// ---------------------------------------------------------------------------
// generateMetadata — SEO por restaurante
// ---------------------------------------------------------------------------

export async function generateMetadata(
  props: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await props.params
  const supabase  = await createServerSupabaseClient()

  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('name, description')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!restaurant) {
    return { title: 'Cardápio não encontrado' }
  }

  return {
    title: `Cardápio — ${restaurant.name}`,
    description: restaurant.description ?? `Veja o cardápio completo de ${restaurant.name}.`,
    openGraph: {
      title: `Cardápio — ${restaurant.name}`,
      description: restaurant.description ?? `Veja o cardápio completo de ${restaurant.name}.`,
    },
  }
}

// ---------------------------------------------------------------------------
// Busca de dados (server-side, sem 'use client')
// ---------------------------------------------------------------------------

async function fetchData(slug: string): Promise<{
  restaurant: Restaurant
  categories: Category[]
  productsByCategory: Map<string | null, ProductWithCategory[]>
}> {
  const supabase = await createServerSupabaseClient()

  // 1. Restaurante — a RLS garante que só restaurantes ativos são retornados
  const { data: restaurant } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!restaurant) notFound()

  // 2. Categorias ativas, ordenadas por display_order
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('restaurant_id', restaurant.id)
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  // 3. Produtos disponíveis com join de categoria
  //    Ordenamos por categoria.display_order depois por product.display_order
  //    — o Supabase não faz ORDER BY em tabela relacionada diretamente,
  //    então ordenamos por product.display_order e reagrupamos em memória.
  const { data: products } = await supabase
    .from('products')
    .select('*, categories(id, name, display_order)')
    .eq('restaurant_id', restaurant.id)
    .eq('is_available', true)
    .order('display_order', { ascending: true })

  // Agrupa produtos por category_id preservando a ordem já vinda do banco
  const productsByCategory = new Map<string | null, ProductWithCategory[]>()

  // Garante que categorias com display_order apareçam na ordem certa no Map
  for (const cat of categories ?? []) {
    productsByCategory.set(cat.id, [])
  }
  // Bucket para produtos sem categoria
  productsByCategory.set(null, [])

  for (const product of (products ?? []) as ProductWithCategory[]) {
    const key = product.category_id ?? null
    if (!productsByCategory.has(key)) productsByCategory.set(key, [])
    productsByCategory.get(key)!.push(product)
  }

  // Remove buckets vazios para não renderizar seções vazias
  for (const [key, items] of productsByCategory) {
    if (items.length === 0) productsByCategory.delete(key)
  }

  return {
    restaurant,
    categories: categories ?? [],
    productsByCategory,
  }
}

// ---------------------------------------------------------------------------
// Sub-componentes (sem estado — Server Components puros)
// ---------------------------------------------------------------------------

function Header({ restaurant }: { restaurant: Restaurant }) {
  return (
    <header className="bg-[#2B2622] text-[#F6F4EF] px-5 pt-10 pb-8">
      {/* Cover — exibe se disponível */}
      {restaurant.cover_image_url && (
        <div className="w-full h-36 rounded-sm overflow-hidden mb-5 -mx-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={restaurant.cover_image_url}
            alt={`Foto de capa de ${restaurant.name}`}
            className="w-full h-full object-cover opacity-60"
          />
        </div>
      )}

      {/* Logo + nome */}
      <div className="flex items-center gap-4">
        {restaurant.logo_url && (
          <div className="w-14 h-14 rounded-sm border-2 border-white/20 overflow-hidden shrink-0 bg-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={restaurant.logo_url}
              alt={`Logo de ${restaurant.name}`}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div>
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#9FBFA9]">
            Cardápio
          </p>
          <h1 className="text-2xl font-semibold leading-tight mt-0.5"
              style={{ fontFamily: 'Georgia, serif' }}>
            {restaurant.name}
          </h1>
        </div>
      </div>

      {/* Descrição */}
      {restaurant.description && (
        <p className="mt-3 text-sm text-[#CFE0D3] leading-relaxed">
          {restaurant.description}
        </p>
      )}

      {/* Informações de contato */}
      {(restaurant.phone || restaurant.address) && (
        <div className="mt-4 flex flex-col gap-1">
          {restaurant.phone && (
            <a
              href={`tel:${restaurant.phone}`}
              className="text-xs text-[#9FBFA9] flex items-center gap-1.5"
            >
              <span>📞</span> {restaurant.phone}
            </a>
          )}
          {restaurant.address && (
            <p className="text-xs text-[#9FBFA9] flex items-center gap-1.5">
              <span>📍</span> {restaurant.address}
            </p>
          )}
        </div>
      )}

      {/* Aviso: vitrine, não cardápio interativo */}
      <div className="mt-5 bg-white/[0.07] border border-white/10 rounded-sm px-3 py-2">
        <p className="text-[11px] text-[#CFE0D3] leading-snug">
          Para fazer um pedido, escaneie o QR Code ou toque no adesivo NFC da
          sua mesa.
        </p>
      </div>
    </header>
  )
}

function ProductCard({ product }: { product: ProductWithCategory }) {
  const hasPromo =
    product.promo_price !== null &&
    product.promo_price !== undefined &&
    product.promo_price < product.price

  return (
    <li className="flex gap-3 py-4 border-b border-[#EEE9E0] last:border-0">
      {/* Foto */}
      {product.image_url && (
        <div className="w-20 h-20 rounded-sm overflow-hidden shrink-0 bg-[#F0EBE3]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-[#2B2622] leading-snug">
            {product.name}
          </h3>
          {/* Badge de vídeo */}
          {product.video_url && (
            <span className="shrink-0 text-[9px] uppercase tracking-wider bg-[#3F6B4F]/10 text-[#3F6B4F] border border-[#3F6B4F]/20 rounded-sm px-1.5 py-0.5">
              Vídeo
            </span>
          )}
        </div>

        {product.description && (
          <p className="mt-0.5 text-xs text-[#8A8375] leading-relaxed line-clamp-2">
            {product.description}
          </p>
        )}

        {/* Preço */}
        <div className="mt-1.5 flex items-baseline gap-2">
          {hasPromo ? (
            <>
              <span className="text-sm font-semibold text-[#3F6B4F]">
                {currencyFormatter.format(product.promo_price!)}
              </span>
              <span className="text-xs text-[#B8B2A2] line-through">
                {currencyFormatter.format(product.price)}
              </span>
            </>
          ) : (
            <span className="text-sm font-semibold text-[#2B2622]">
              {currencyFormatter.format(product.price)}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

function CategorySection({
  title,
  products,
}: {
  title: string
  products: ProductWithCategory[]
}) {
  return (
    <section className="mb-2">
      {/* Cabeçalho de categoria sticky — cola no topo ao rolar */}
      <div className="sticky top-0 z-10 bg-[#F6F4EF]/95 backdrop-blur-sm border-b border-[#DAD5C9] px-5 py-2.5">
        <h2 className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#8A8375]">
          {title}
        </h2>
      </div>

      <ul className="px-5">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page — Server Component
// ---------------------------------------------------------------------------

export default async function CardapioPublicoPage(
  props: { params: Promise<{ slug: string }> }
) {
  const { slug } = await props.params
  const { restaurant, categories, productsByCategory } = await fetchData(slug)

  const totalProducts = [...productsByCategory.values()].reduce(
    (sum, items) => sum + items.length,
    0
  )

  return (
    <div className="min-h-screen bg-[#F6F4EF] text-[#2B2622]">

      <Header restaurant={restaurant} />

      <main className="pb-12">
        {totalProducts === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-sm text-[#8A8375]">
              Nenhum item disponível no momento.
            </p>
          </div>
        ) : (
          <>
            {/* Categorias com produtos */}
            {categories.map((cat) => {
              const items = productsByCategory.get(cat.id)
              if (!items || items.length === 0) return null
              return (
                <CategorySection
                  key={cat.id}
                  title={cat.name}
                  products={items}
                />
              )
            })}

            {/* Produtos sem categoria */}
            {(productsByCategory.get(null)?.length ?? 0) > 0 && (
              <CategorySection
                title="Outros"
                products={productsByCategory.get(null)!}
              />
            )}
          </>
        )}
      </main>

      {/* Rodapé */}
      <footer className="border-t border-[#DAD5C9] px-5 py-6 text-center">
        <p className="text-[11px] text-[#B8B2A2]">
          Cardápio Digital · {restaurant.name}
        </p>
      </footer>

    </div>
  )
}
