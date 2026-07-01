# SearchGoogle

SearchGoogle é uma ferramenta de descoberta de lojas/produtos via busca em massa no Google. O operador informa termos de busca (nichos, palavras-chave) e a ferramenta roda um actor Apify que executa a busca no Google, retornando os resultados orgânicos (título, URL, domínio, snippet) para análise e filtragem.

## Arquitetura

```
Next.js @ Vercel (UI + API)  ◀──HTTP──▶  Apify (actor de busca no Google)
         │
         ▼
   PostgreSQL (Neon) — apenas auth (User)
```

Diferente do [aktani-miner](https://github.com/dolarshopsoporte-ops/aktani-miner), não há worker separado nem scraping próprio com Playwright: a busca é inteiramente delegada a um actor Apify via API (mesmo padrão usado no DomainScout do aktani-miner — `POST /runs` → poll de status → `GET /dataset/items`).

## Stack

- Node.js 20, TypeScript strict, ESM
- Next.js 14 (App Router) + React 18 + Tailwind
- Prisma 5 + PostgreSQL (Neon) — só para autenticação (tabela `User`)
- NextAuth credentials + bcrypt + JWT (único usuário = operador)

## Setup local

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:push
npm run seed        # opcional — cria usuário bootstrap se BOOTSTRAP_USER_* setados
npm run dev          # http://localhost:3000
```

### Variáveis de ambiente

Ver `.env.example`. Resumo:

| Nome | Propósito |
|------|-----------|
| `DATABASE_URL` | Neon connection string |
| `NEXTAUTH_URL` | URL pública do app |
| `NEXTAUTH_SECRET` | Segredo JWT |
| `BOOTSTRAP_USER_EMAIL` / `BOOTSTRAP_USER_PASSWORD` | Cria usuário inicial no primeiro deploy |
| `APIFY_TOKEN` | Token da conta Apify |
| `APIFY_SEARCH_ACTOR_ID` | ID do actor Apify usado para rodar a busca no Google. **Preencher antes do deploy** — sem ele a busca retorna erro 500. |

### Sobre o actor Apify

A rota `/api/search` envia `{ queries: "<termo1>\n<termo2>..." }` para `POST /v2/acts/{actorId}/runs` e espera um dataset compatível com o padrão de actors "Google Search Results Scraper" (ex: um item por query, com `searchQuery.term` e `organicResults[]` contendo `title`/`url`/`description`/`position`). O parser em `src/app/api/search/route.ts` também aceita um shape já achatado (`query`/`title`/`url`/`description` direto no item) caso o actor escolhido retorne diferente — ajuste `flatten()` se o formato do actor real divergir.

## Deploy

### Vercel (UI + API)

1. Importar o repo `dolarshopsoporte-ops/searchgoogle` na Vercel. Framework preset: Next.js.
2. Build command: `npm run build` (default) — roda `prisma generate && prisma db push --skip-generate && tsx prisma/seed.ts && next build`.
3. Env vars: copiar do `.env.example`.

### Neon

1. Criar um projeto Neon (pode ser um novo, ou compartilhar o mesmo do aktani-miner se preferir single-DB).
2. Copiar a connection string com `?sslmode=require` para `DATABASE_URL`.

### Estratégia de schema

Mesma abordagem do aktani-miner: `prisma db push --skip-generate` no build da Vercel, sem pasta `prisma/migrations/`.

## O que NÃO está neste release

- Scraping próprio (Playwright/worker) — tudo delegado ao actor Apify
- Persistência de histórico de buscas (resultados são exibidos na tela, não salvos no banco)
- Multi-usuário, roles, RBAC
- Redis, BullMQ, ou qualquer queue
