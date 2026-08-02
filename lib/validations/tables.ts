// lib/validations/tables.ts
//
// Utilitários de mesa sem diretiva 'use server'.
// Importável tanto em Server Actions quanto em Client Components.

/**
 * Gera slug de URL a partir do nome da mesa.
 * Espelha a função slugify() do Postgres para consistência.
 *
 * "Mesa 2"      → "mesa-2"
 * "Varanda Sul" → "varanda-sul"
 * "Balcão VIP"  → "balcao-vip"
 */
export function generateTableSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')               // decompõe acentos (á → a + ́)
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos
    .replace(/[^a-z0-9]+/g, '-')   // não-alfanumérico → hífen
    .replace(/^-+|-+$/g, '')       // remove hífens nas pontas
}