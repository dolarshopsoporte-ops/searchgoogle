# SearchGoogle

SearchGoogle é uma ferramenta de mineração de lojas/produtos via os anúncios de "Sponsored Products" que aparecem embutidos numa busca normal do Google (não a aba Shopping — essa é dominada por grandes marketplaces e raramente mostra lojas pequenas/Shopify). O operador informa termos de busca, opcionalmente simula um país/idioma/localização específicos (como o [searchfromanywhere.com](https://searchfromanywhere.com/)), e a ferramenta roda o actor Apify oficial [`google-search-scraper`](https://apify.com/apify/google-search-scraper), retornando os produtos anunciados (`paidProducts`) para análise e filtragem.

## Arquitetura

```
Next.js @ Vercel (UI + API)  ◀──HTTP──▶  Apify (Google Search Scraper)
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
| `APIFY_SEARCH_ACTOR_ID` | ID do actor Google Search Scraper oficial (`nFJndFXA5zjCTuudP` por padrão neste projeto). **Preencher antes do deploy** — sem ele a busca retorna erro 500. |

### Sobre o actor Apify

Diferente do actor de Google Shopping usado numa versão anterior deste projeto, o `google-search-scraper` aceita **todas as buscas em um único run** (campo `queries`, uma por linha) — a rota `/api/search` roda só um `POST /v2/acts/{actorId}/runs` para o lote inteiro, faz poll de status e lê `GET /dataset/items`. Isso simplifica o fluxo mas também significa que uma falha na run derruba todas as buscas do lote juntas (sem isolamento por busca).

Cada item do dataset corresponde a uma busca processada e traz um campo `paidProducts[]` — o carrossel de anúncios de produto (foto + preço) que aparece embutido na busca normal do Google, não a aba Shopping dedicada. **Atenção:** os nomes exatos de campo dentro de `paidProducts` não estavam 100% documentados publicamente no momento da integração; `normalize()` em `src/app/api/search/route.ts` tenta várias variantes de nome e loga uma amostra do primeiro item no console (Vercel → Logs) para facilitar ajuste caso o formato real divirja — mesmo processo usado para depurar o actor anterior.

Para extração confiável de anúncios é necessário habilitar `focusOnPaidAds` (ligado por padrão na UI) — é um **add-on pago à parte** da Apify, cobrado por página processada mesmo se nenhum anúncio for encontrado.

### Filtros disponíveis na UI

País (`countryCode`), Idioma da busca (`searchLanguage`), Idioma da interface (`languageCode`), Localização exata via parâmetro UULE do Google (`locationUule` — gerar em [padavvan.github.io](https://padavvan.github.io/)), Simular celular (`mobileResults`), Páginas por busca (`maxPagesPerQuery`) e Anúncios pagos (`focusOnPaidAds`, add-on cobrado à parte).

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
