// lib/validations/restaurant.ts
//
// Constantes e helpers de validação do restaurante.
// Sem diretiva 'use server' — pode ser importado tanto por
// Server Actions quanto por Client Components sem restrição.

export const SLUG_RULES = {
  minLength: 3,
  maxLength: 60,
  // Apenas letras minúsculas, números e hífens; sem hífens no início ou fim.
  pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  patternHint:
    'Use apenas letras minúsculas, números e hífens. Não comece nem termine com hífen.',
} as const