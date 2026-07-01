# SearchGoogle

SearchGoogle é uma ferramenta de mineração de produtos via Google Shopping. O operador informa termos de busca (nichos, palavras-chave) e a ferramenta roda o actor Apify [`google-shopping-api-google-shopping-products-prices-deals`](https://apify.com/johnvc/google-shopping-api-google-shopping-products-prices-deals), retornando produtos com preço, vendedor, avaliação e frete para análise e filtragem.

## Arquitetura

```
Next.js @ Vercel (UI + API)  ◀──HTTP──▶  Apify (Google Shopping Scraper)
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
| `APIFY_SEARCH_ACTOR_ID` | ID do actor Google Shopping Scraper (`U02ytMsu6ynITFJHX` por padrão neste projeto). **Preencher antes do deploy** — sem ele a busca retorna erro 500. |

### Sobre o actor Apify

O actor aceita **uma busca por run** (campo obrigatório `q`), sem suporte a batch. Por isso a rota `/api/search` roda um run por termo digitado (sequencialmente: `POST /v2/acts/{actorId}/runs` com `{ q, max_pages: 1 }` → poll de status → `GET /dataset/items`), e junta os resultados de todos. Buscas que falharem individualmente aparecem em `failedQueries` sem derrubar as demais.

Cada item do dataset é uma **página** de resultados (`page_number`, `search_metadata`, etc.), não um produto — os produtos ficam aninhados em `shopping_results[]`. Campos retornados por produto (ver `normalize()` em `src/app/api/search/route.ts`): `title`, `product_link`, `thumbnail`/`thumbnails[]`, `price`/`extracted_price`, `old_price`, `rating`, `reviews`, `source` (vendedor), `tag` (badge tipo "SALE"/"NIEDRIGER PREIS"), `extensions[]`, `position`. Não existe campo de delivery/shipping neste actor.

### Filtros disponíveis na UI

A UI expõe os filtros opcionais do actor (aplicados a todas as buscas do lote): Localização (`location`), País (`gl`), Idioma (`hl`), Domínio Google (`google_domain`), Dispositivo (`device`), Preço mínimo/máximo, Ordenação por preço (`sort_by`), Só frete grátis (`free_shipping`), Só em promoção (`on_sale`) e Páginas por busca (`max_pages`, ~40 produtos por página). **Importante:** se preencher `gl`, preencha também `google_domain` correspondente (ex: `gl=de` → `google.de`) — buscar em `google.com` pedindo resultados de outro país retorna poucos/nenhum produto.

### Filtro "Só lojas Shopify"

Filtro próprio da aplicação (não é parâmetro do actor). Como o `product_link` retornado é uma página intermediária do Google (não a loja), o processo é:

1. Busca o HTML de `product_link` (requisição simples, sem browser) e extrai a URL real da loja do atributo `data-redirect-url`.
2. Busca a página da loja e procura assinaturas de Shopify (`cdn.shopify.com`, `Shopify.shop`) ou testa o endpoint público `/products.json`.

É best-effort: pode gerar falso negativo se a loja escutar atrás de proxy/CDN que esconda esses sinais. Roda com concorrência limitada (8 produtos em paralelo) mas ainda assim deixa a busca bem mais lenta (1-2 requisições extras por produto), então é opcional via checkbox.

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
