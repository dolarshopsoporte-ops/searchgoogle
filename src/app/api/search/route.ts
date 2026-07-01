import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Actor: apify/google-search-scraper (nFJndFXA5zjCTuudP)
// Busca normal do Google (não a aba Shopping) com geo/idioma configuráveis,
// igual ao searchfromanywhere.com. O campo "paidProducts" no dataset é o
// carrossel de "Sponsored Products" (anúncios com foto/preço) que aparece
// embutido na busca normal — diferente da aba Shopping, esse carrossel
// costuma trazer lojas pequenas/Shopify, não só grandes marketplaces.
//
// IMPORTANTE: os nomes de campo exatos de paidProducts não estão 100%
// documentados publicamente. O mapeamento abaixo é best-effort (várias
// variantes de nome tentadas) — ajuste normalize() se um run real mostrar
// campos diferentes (ver console.log de diagnóstico abaixo).
type ApifyPaidProduct = {
  title?: string;
  position?: number;
  price?: string;
  extractedPrice?: number;
  extracted_price?: number;
  oldPrice?: string;
  old_price?: string;
  rating?: number;
  reviews?: number;
  reviewsCount?: number;
  source?: string;
  merchant?: string;
  seller?: string;
  link?: string;
  productLink?: string;
  product_link?: string;
  url?: string;
  thumbnail?: string;
  thumbnails?: string[];
  image?: string;
  tag?: string;
  badge?: string;
};

type ApifySearchDatasetItem = {
  searchQuery?: { term?: string };
  paidProducts?: ApifyPaidProduct[];
};

export type ShoppingResult = {
  query: string;
  position: number | null;
  title: string;
  productLink: string;
  thumbnail: string | null;
  price: string | null;
  extractedPrice: number | null;
  oldPrice: string | null;
  rating: number | null;
  reviews: number | null;
  source: string | null;
  tag: string | null;
  extensions: string[];
  snippet: string | null;
  merchantUrl: string | null;
  isShopify: boolean | null;
};

type FailedQuery = { query: string; error: string };

// Espelha os campos do actor (ver console.apify.com -> Input).
export type SearchFilters = {
  countryCode?: string;
  searchLanguage?: string;
  languageCode?: string;
  locationUule?: string;
  mobileResults?: boolean;
  maxPagesPerQuery?: number;
  focusOnPaidAds?: boolean;
};

function buildActorInput(queries: string[], filters: SearchFilters | undefined) {
  const input: Record<string, unknown> = {
    queries: queries.join("\n"),
    maxPagesPerQuery: filters?.maxPagesPerQuery ?? 1,
    // Sem isso o actor pode não extrair os anúncios de forma confiável —
    // é literalmente o motivo de usarmos esse actor (add-on pago, ver README).
    focusOnPaidAds: filters?.focusOnPaidAds ?? true
  };
  if (filters?.countryCode) input.countryCode = filters.countryCode;
  if (filters?.searchLanguage) input.searchLanguage = filters.searchLanguage;
  if (filters?.languageCode) input.languageCode = filters.languageCode;
  if (filters?.locationUule) input.locationUule = filters.locationUule;
  if (filters?.mobileResults) input.mobileResults = true;
  return input;
}

async function runApifyActor(
  queries: string[],
  filters: SearchFilters | undefined,
  actorId: string,
  token: string
): Promise<ApifySearchDatasetItem[]> {
  const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildActorInput(queries, filters))
  });

  const run = await runRes.json();
  const runId: string | undefined = run?.data?.id;
  if (!runId) throw new Error("Falha ao iniciar o Apify: " + JSON.stringify(run));

  let status = "RUNNING";
  let attempts = 0;
  while (status === "RUNNING" || status === "READY") {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
    status = (await s.json())?.data?.status;
    if (++attempts > 90) throw new Error("Timeout: Apify demorou demais");
  }

  if (status !== "SUCCEEDED") throw new Error("Apify falhou com status: " + status);

  await new Promise((r) => setTimeout(r, 1500));

  const datasetRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}`
  );
  if (!datasetRes.ok) {
    throw new Error(`Falha ao ler dataset do Apify (HTTP ${datasetRes.status})`);
  }
  return datasetRes.json();
}

function normalize(queries: string[], items: ApifySearchDatasetItem[]): ShoppingResult[] {
  const results: ShoppingResult[] = [];
  items.forEach((item, idx) => {
    const query = item.searchQuery?.term ?? queries[idx] ?? "desconhecida";
    for (const p of item.paidProducts ?? []) {
      if (!p.title) continue;
      results.push({
        query,
        position: p.position ?? null,
        title: p.title,
        productLink: p.link ?? p.productLink ?? p.product_link ?? p.url ?? "",
        thumbnail: p.thumbnail ?? p.thumbnails?.[0] ?? p.image ?? null,
        price: p.price ?? null,
        extractedPrice: p.extractedPrice ?? p.extracted_price ?? null,
        oldPrice: p.oldPrice ?? p.old_price ?? null,
        rating: p.rating ?? null,
        reviews: p.reviews ?? p.reviewsCount ?? null,
        source: p.source ?? p.merchant ?? p.seller ?? null,
        tag: p.tag ?? p.badge ?? null,
        extensions: [],
        snippet: null,
        merchantUrl: null,
        isShopify: null
      });
    }
  });
  return results;
}

const MERCHANT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// O link de um anúncio pode ser uma página intermediária do Google (com o
// destino real no atributo data-redirect-url) ou já ser o link direto da
// loja — tratamos os dois casos.
async function resolveMerchantUrl(productLink: string): Promise<string | null> {
  if (!productLink) return null;
  let host: string;
  try {
    host = new URL(productLink).hostname;
  } catch {
    return null;
  }
  if (!host.includes("google.")) return productLink;

  try {
    const res = await fetch(productLink, {
      headers: { "User-Agent": MERCHANT_UA, "Accept-Language": "de-DE,de;q=0.9,en;q=0.8" },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/data-redirect-url="([^"]+)"/);
    if (!match) return null;
    return match[1].replace(/&amp;/g, "&");
  } catch {
    return null;
  }
}

// Heurística best-effort: procura assinaturas comuns de lojas Shopify no
// HTML da loja e, como fallback, testa o endpoint público /products.json
// (presente na maioria das lojas Shopify). Pode dar falso negativo se a loja
// usar proxy/CDN que esconda esses sinais.
async function checkIsShopify(merchantUrl: string): Promise<boolean> {
  try {
    const res = await fetch(merchantUrl, {
      headers: { "User-Agent": MERCHANT_UA },
      signal: AbortSignal.timeout(8000)
    });
    const html = await res.text();
    if (/cdn\.shopify\.com|Shopify\.shop\s*=|shopify-features|shopify-digital-wallet/i.test(html)) {
      return true;
    }
    const origin = new URL(merchantUrl).origin;
    const productsJsonRes = await fetch(`${origin}/products.json`, {
      headers: { "User-Agent": MERCHANT_UA },
      signal: AbortSignal.timeout(5000)
    });
    if (productsJsonRes.ok) {
      const data = await productsJsonRes.json().catch(() => null);
      if (data && Array.isArray(data.products)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function annotateShopify(results: ShoppingResult[]): Promise<ShoppingResult[]> {
  const flags = await mapWithConcurrency(results, 8, async (r) => {
    const merchantUrl = await resolveMerchantUrl(r.productLink);
    if (!merchantUrl) return { merchantUrl: null, isShopify: false };
    const isShopify = await checkIsShopify(merchantUrl);
    return { merchantUrl, isShopify };
  });
  return results.map((r, i) => ({ ...r, ...flags[i] }));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const queries: string[] | undefined = body?.queries;
  const filters: SearchFilters | undefined = body?.filters;
  const onlyShopify: boolean = body?.onlyShopify === true;
  if (!queries?.length) {
    return NextResponse.json({ error: "Nenhuma busca fornecida" }, { status: 400 });
  }

  const token = process.env.APIFY_TOKEN;
  const actorId = process.env.APIFY_SEARCH_ACTOR_ID;
  if (!token) {
    return NextResponse.json({ error: "APIFY_TOKEN não configurado" }, { status: 500 });
  }
  if (!actorId) {
    return NextResponse.json({ error: "APIFY_SEARCH_ACTOR_ID não configurado" }, { status: 500 });
  }

  const failedQueries: FailedQuery[] = [];
  let results: ShoppingResult[] = [];

  try {
    const items = await runApifyActor(queries, filters, actorId, token);
    results = normalize(queries, items);
    console.log(`[search] ${queries.length} busca(s) -> ${results.length} produtos (ads)`);
    if (items[0]) {
      console.log(
        "[search] amostra do 1o item do dataset (debug):",
        JSON.stringify(items[0]).slice(0, 1500)
      );
    }
  } catch (err) {
    console.error("[search] run falhou:", err);
    for (const q of queries) failedQueries.push({ query: q, error: (err as Error).message });
  }

  let finalResults = results;
  if (onlyShopify && results.length > 0) {
    console.log(`[search] verificando Shopify em ${results.length} produto(s)...`);
    const annotated = await annotateShopify(results);
    finalResults = annotated.filter((r) => r.isShopify);
    console.log(`[search] ${finalResults.length}/${annotated.length} são lojas Shopify`);
  }

  return NextResponse.json({ results: finalResults, failedQueries });
}
