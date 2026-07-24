# 🍽️ Cardápio Digital — SaaS MVP

> Plataforma multi-tenant de cardápio digital para restaurantes.  
> Clientes fazem pedidos direto da mesa via QR Code ou NFC; o restaurante recebe e gerencia tudo em tempo real.

---

## Índice

1. [Visão geral](#visão-geral)
2. [Stack](#stack)
3. [Arquitetura e fluxo](#arquitetura-e-fluxo)
4. [Multi-tenant com RLS](#multi-tenant-com-rls)
5. [Pré-requisitos](#pré-requisitos)
6. [Instalação](#instalação)
7. [Variáveis de ambiente](#variáveis-de-ambiente)
8. [Banco de dados](#banco-de-dados)
9. [Storage](#storage)
10. [Realtime](#realtime)
11. [Estrutura de pastas](#estrutura-de-pastas)
12. [Telas do MVP](#telas-do-mvp)
13. [Roadmap pós-MVP](#roadmap-pós-mvp)

---

## Visão geral

```
Cliente escaneia QR Code / toca NFC
        ↓
Cardápio público da mesa  (/m/[slug]/[mesa])
        ↓
Faz o pedido → grava no Supabase
        ↓
Painel do restaurante recebe em tempo real (Realtime)
        ↓
Dono avança o status: Confirmado → Preparando → Pronto → Entregue
```

Cada restaurante é um **tenant isolado**: o dono cadastra seu restaurante, cria pratos e mesas, e só enxerga os próprios dados — garantido por Row Level Security no banco.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | [Next.js 14+](https://nextjs.org) — App Router |
| Banco de dados | [Supabase](https://supabase.com) (PostgreSQL) |
| Autenticação | Supabase Auth (email + senha) |
| Tempo real | Supabase Realtime (WebSocket) |
| Storage | Supabase Storage (fotos e vídeos de pratos) |
| Estilização | [Tailwind CSS](https://tailwindcss.com) |
| Tipagem | TypeScript — types gerados do schema (`types_db.ts`) |
| Fontes | Google Fonts — Fraunces (display) + Inter (corpo) |
| QR Code | [QR Server API](https://goqr.me/api/) — sem dependência extra |
| Server Actions | `@supabase/ssr` + `next/cache` (`revalidatePath`) |

---

## Arquitetura e fluxo

```
┌─────────────────────────────────────────────────────────┐
│                        Next.js                          │
│                                                         │
│   app/                                                  │
│   ├── login/              → autenticação do dono        │
│   ├── m/[slug]/[mesa]/    → cardápio público (cliente)  │
│   └── dashboard/                                        │
│       ├── layout.tsx      → sidebar + topbar mobile     │
│       ├── pedidos/        → painel em tempo real        │
│       ├── produtos/       → CRUD de pratos              │
│       └── mesas/          → CRUD + QR Code / NFC        │
│                                                         │
│   app/actions/tables.ts   → Server Actions (RLS-safe)   │
│   lib/supabase/                                         │
│       ├── client.ts       → browser client              │
│       └── server.ts       → server client (cookies)     │
└────────────────────┬────────────────────────────────────┘
                     │  HTTPS / WebSocket
┌────────────────────▼────────────────────────────────────┐
│                      Supabase                           │
│                                                         │
│   PostgreSQL  ←→  Row Level Security (multi-tenant)     │
│   Auth            JWT validado em cada requisição       │
│   Realtime        Canal por restaurant_id               │
│   Storage         Buckets: product-images, product-videos│
└─────────────────────────────────────────────────────────┘
```

### Dois clientes Supabase, propósitos distintos

| Arquivo | Usado em | Por quê |
|---|---|---|
| `lib/supabase/client.ts` | Client Components (`'use client'`) | `createBrowserClient` — lê sessão do cookie no browser |
| `lib/supabase/server.ts` | Server Actions, Server Components | `createServerClient` — lê/escreve cookie via `next/headers`; valida JWT no servidor |

> ⚠️ **Nunca use o server client em Client Components**, nem o browser client em Server Actions. A separação é o que mantém a sessão segura.

---

## Multi-tenant com RLS

O isolamento entre restaurantes é feito inteiramente no banco, via **Row Level Security (RLS)** do PostgreSQL. Isso significa que mesmo que haja um bug no código da aplicação, um dono nunca consegue ler ou alterar dados de outro restaurante.

### Como funciona na prática

```
auth.uid()  ──▶  restaurants.owner_id  ──▶  restaurant_id
                                               ↓
                              categories / products / tables / orders
```

1. O Supabase injeta `auth.uid()` automaticamente em toda query autenticada.
2. A policy de `restaurants` exige `owner_id = auth.uid()`.
3. As policies das outras tabelas filtram por `restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())`.
4. Nenhuma query de aplicação precisa passar o `restaurant_id` manualmente — o banco rejeita qualquer acesso que não pertença ao dono logado.

### Mapa de policies por tabela

| Tabela | Leitura pública | Leitura autenticada | Escrita |
|---|---|---|---|
| `restaurants` | ✅ (somente `is_active`) | ✅ próprio | ✅ próprio (`owner_id`) |
| `categories` | ✅ (somente `is_active`) | ✅ próprio | ✅ próprio |
| `products` | ✅ (somente `is_available`) | ✅ próprio | ✅ próprio |
| `restaurant_tables` | ✅ (somente `is_active`) | ✅ próprio | ✅ próprio |
| `orders` | ❌ | ✅ próprio | ✅ qualquer (cliente anônimo) |
| `order_items` | ❌ | ✅ próprio | ✅ qualquer (cliente anônimo) |

> **Pedidos e itens** permitem inserção anônima para que o cliente na mesa possa fazer o pedido sem precisar criar uma conta. A leitura, porém, é restrita ao dono do restaurante.

---

## Pré-requisitos

Antes de começar, você precisa ter instalado na máquina:

- **Node.js** `18.17` ou superior — [download](https://nodejs.org)
- **npm** `9+` (já vem com o Node) ou `pnpm` / `yarn`
- Uma conta no **[Supabase](https://supabase.com)** (plano gratuito é suficiente para o MVP)
- **Git** para clonar o repositório

Verifique as versões:

```bash
node -v   # deve retornar v18.x ou superior
npm -v    # deve retornar 9.x ou superior
```

---

## Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/cardapio-digital.git
cd cardapio-digital
```

### 2. Instale as dependências

```bash
npm install
```

As dependências principais são:

```bash
# Supabase — cliente e SSR para Next.js
npm install @supabase/supabase-js @supabase/ssr

# Fontes do Google via Next.js (já incluído no Next.js 13+)
# Tailwind CSS (configurar conforme abaixo se não estiver no projeto)
npm install -D tailwindcss postcss autoprefixer
```

### 3. Configure as variáveis de ambiente

Veja a seção [Variáveis de ambiente](#variáveis-de-ambiente) abaixo.

### 4. Configure o banco de dados

Veja a seção [Banco de dados](#banco-de-dados) abaixo.

### 5. Configure o Storage

Veja a seção [Storage](#storage) abaixo.

### 6. Rode o projeto

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).  
A primeira tela é o login em `/login`. Crie um usuário direto no painel do Supabase (Authentication → Users → Add user) e depois associe um restaurante via SQL para começar a testar.

---

## Variáveis de ambiente

### 1. Crie o arquivo `.env.local`

Na raiz do projeto, copie o arquivo de exemplo:

```bash
cp .env.example .env.local
```

Ou crie manualmente:

```bash
touch .env.local
```

### 2. Preencha as variáveis

```env
# .env.local

# ─── Supabase ────────────────────────────────────────────────────────────────
# Encontre em: painel Supabase → Settings → API

# URL do seu projeto (pública — pode aparecer no browser)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co

# Chave anônima (pública — usada no browser; o RLS protege os dados)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ─── App ─────────────────────────────────────────────────────────────────────
# URL base da aplicação (usada para montar os links dos QR Codes)
# Em desenvolvimento: http://localhost:3000
# Em produção: https://seudominio.com.br
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Onde encontrar as chaves no Supabase

```
Painel Supabase
  └── Settings (engrenagem no menu lateral)
      └── API
          ├── Project URL          → NEXT_PUBLIC_SUPABASE_URL
          └── Project API keys
              └── anon / public    → NEXT_PUBLIC_SUPABASE_ANON_KEY
```

> 🔒 **Segurança:** a chave `anon` é segura para expor no browser **porque o RLS está ativo**. Ela permite apenas o que as policies explicitamente autorizam. Nunca coloque a chave `service_role` (admin) em variáveis `NEXT_PUBLIC_*` — ela bypassa o RLS completamente.

### 4. Crie o `.env.example` para o repositório

Commite este arquivo **sem os valores reais** para que outros desenvolvedores saibam o que precisam configurar:

```env
# .env.example  ← commitar este arquivo (sem valores)

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

E adicione `.env.local` ao `.gitignore`:

```bash
# .gitignore
.env.local
.env*.local
```

---

## Banco de dados

### Executar o schema no Supabase

1. Acesse o painel do Supabase
2. Vá em **SQL Editor** (ícone `</>` no menu lateral)
3. Clique em **New query**
4. Copie e cole o conteúdo de `schema.sql` (na raiz deste repositório)
5. Clique em **Run** (ou `Ctrl + Enter`)

O script cria, na ordem correta:

```
extensions          → uuid-ossp
restaurants         → tabela principal dos tenants
categories          → categorias de pratos
products            → pratos (com image_url e video_url)
restaurant_tables   → mesas (com qr_code_token)
orders              → pedidos (vinculados à mesa)
order_items         → itens de cada pedido
triggers            → updated_at automático em todas as tabelas
RLS policies        → isolamento multi-tenant completo
```

> ✅ O script é **idempotente para criação** — se você precisar recriar, use `DROP TABLE ... CASCADE` antes de rodar novamente, ou crie um novo projeto Supabase limpo.

### Criar o primeiro restaurante

Após criar um usuário no painel (Authentication → Users), execute no SQL Editor para associar um restaurante a ele:

```sql
INSERT INTO restaurants (owner_id, name, slug, description)
VALUES (
  'uuid-do-usuario-aqui',   -- cole o ID do usuário criado
  'Meu Restaurante',
  'meu-restaurante',        -- slug único, usado na URL pública
  'O melhor da cidade.'
);
```

---

## Storage

O projeto usa dois buckets no Supabase Storage para armazenar mídias dos pratos.

### Criar os buckets

1. No painel Supabase, vá em **Storage** (ícone de pasta)
2. Clique em **New bucket** e crie os dois abaixo:

| Nome do bucket | Tipo | Finalidade |
|---|---|---|
| `product-images` | **Public** | Fotos dos pratos |
| `product-videos` | **Public** | Vídeos dos pratos |

> Marque **Public bucket** ao criar — isso gera URLs públicas para as imagens aparecerem no cardápio do cliente sem autenticação.

### Limites de upload (configurados no código)

| Mídia | Limite |
|---|---|
| Foto | 5 MB |
| Vídeo | 50 MB |

Para ajustar, edite as constantes em `app/dashboard/produtos/novo/page.tsx` e `app/dashboard/produtos/[id]/editar/page.tsx`:

```ts
const MAX_IMAGE_MB = 5
const MAX_VIDEO_MB = 50
```

---

## Realtime

O painel de pedidos (`/dashboard/pedidos`) usa Supabase Realtime para receber novos pedidos e atualizações de status sem recarregar a página.

### Habilitar Realtime na tabela `orders`

1. No painel Supabase, vá em **Database → Replication**
2. Em **supabase_realtime**, clique em **0 tables** (ou no número atual)
3. Ative a tabela **`orders`**
4. Salve

> Sem essa configuração o canal WebSocket se conecta mas nunca recebe eventos — os pedidos só aparecem após recarregar a página.

### Como o canal funciona

```ts
supabase
  .channel(`orders:restaurant:${restaurantId}`)
  .on('postgres_changes', { event: 'INSERT', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, handler)
  .on('postgres_changes', { event: 'UPDATE', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, handler)
  .subscribe()
```

O filtro `restaurant_id=eq.{id}` garante que cada restaurante recebe apenas os próprios eventos — o RLS cuida do banco, e o filtro de canal cuida do WebSocket.

---

## Estrutura de pastas

```
cardapio-digital/
│
├── app/                              # Next.js App Router
│   ├── actions/
│   │   └── tables.ts                # Server Actions: getTables, createTable, deleteTable, toggleTableActive
│   │
│   ├── login/
│   │   └── page.tsx                 # Tela de login do dono
│   │
│   ├── m/
│   │   └── [restaurantSlug]/
│   │       └── [tableNumber]/
│   │           └── page.tsx         # Cardápio público (cliente na mesa)
│   │
│   └── dashboard/
│       ├── layout.tsx               # Sidebar + topbar mobile (compartilhado)
│       ├── pedidos/
│       │   └── page.tsx             # Painel de pedidos em tempo real
│       ├── produtos/
│       │   ├── page.tsx             # Listagem de pratos
│       │   ├── novo/
│       │   │   └── page.tsx         # Cadastro de novo prato
│       │   └── [id]/
│       │       └── editar/
│       │           └── page.tsx     # Edição de prato
│       └── mesas/
│           └── page.tsx             # Cadastro de mesas + QR Code / NFC
│
├── lib/
│   └── supabase/
│       ├── client.ts                # Browser client (Client Components)
│       └── server.ts                # Server client (Server Actions / Components)
│
├── types_db.ts                      # Types TypeScript do schema (Row, Insert, Update)
├── schema.sql                       # Schema completo do banco (rodar no SQL Editor)
├── .env.example                     # Variáveis de ambiente necessárias (sem valores)
├── .env.local                       # ⚠️ NÃO commitar — valores reais
└── README.md                        # Este arquivo
```

---

## Telas do MVP

| Rota | Quem acessa | O que faz |
|---|---|---|
| `/login` | Dono | Login com e-mail e senha |
| `/dashboard/pedidos` | Dono | Painel de pedidos em tempo real, avanço de status |
| `/dashboard/produtos` | Dono | Listagem, ativação/pausa e exclusão de pratos |
| `/dashboard/produtos/novo` | Dono | Cadastro de prato com foto e vídeo |
| `/dashboard/produtos/[id]/editar` | Dono | Edição de prato existente |
| `/dashboard/mesas` | Dono | Cadastro de mesas, QR Code, link NFC, impressão |
| `/m/[slug]/[mesa]` | Cliente | Cardápio público, carrinho e envio de pedido |

---

## Roadmap pós-MVP

Funcionalidades deixadas de fora intencionalmente para manter o escopo enxuto:

- [ ] **Preço promocional** — campo `promo_price` já existe no banco, falta expor na UI
- [ ] **Observações por item** — hoje só existe observação geral por pedido
- [ ] **Configurações do restaurante** — editar nome, slug, logo, foto de capa, telefone
- [ ] **Regenerar QR Code / token NFC** — invalidar o token antigo sem mudar o número da mesa
- [ ] **Histórico de pedidos** — filtro por data, exportação CSV
- [ ] **Múltiplos usuários por restaurante** — garçons com acesso limitado
- [ ] **Notificação push** — avisar o cliente quando o pedido ficar pronto
- [ ] **Pagamento integrado** — Stripe ou Mercado Pago na finalização do pedido
- [ ] **Migrations com Supabase CLI** — substituir o `schema.sql` manual por migrações versionadas

---

## Licença

MIT — veja [LICENSE](./LICENSE) para detalhes.