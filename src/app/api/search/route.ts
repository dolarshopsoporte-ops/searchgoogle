import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Actor: johnvc/google-shopping-api-google-shopping-products-prices-deals
// Input schema aceita apenas uma busca por run (campo obrigatório "q"), sem
// suporte a batch — por isso rodamos um run por query, sequencialmente.
//
// IMPORTANTE: cada item do dataset é uma PÁGINA de resultados, não um
// produto. Os produtos ficam aninhados em `shopping_results[]` (confirmado
// via teste real no console da Apify — um run com max_pages=1 gera 1 item de
// dataset contendo ~40 produtos dentro de shopping_results). Tratar o
// dataset como lista de produtos direto (como antes) sempre resultava em 0,
// já que o item de página não tem campo "title".
type ApifyShoppingProduct = {
  position?: number;
  title?: string;
  source?: string;
  price?: string;
  extracted_price?: number;
  old_price?: string;
  extracted_old_price?: number;
  rating?: number;
  reviews?: number;
  extensions?: string[] | string;
  thumbnail?: string;
  thumbnails?: string[];
  product_link?: string;
  link?: string;
  tag?: string;
  snippet?: string;
};

type ApifyPageItem = {
  page_number?: number;
  shopping_results?: ApifyShoppingProduct[];
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

// Espelha os campos opcionais do actor (ver console.apify.com -> Input).
export type SearchFilters = {
  location?: string;
  gl?: string;
  hl?: string;
  google_domain?: string;
  device?: "desktop" | "tablet" | "mobile";
  min_price?: number;
  max_price?: number;
  sort_by?: 1 | 2;
  free_shipping?: boolean;
  on_sale?: boolean;
  max_pages?: number;
};

function buildActorInput(query: string, filters: SearchFilters | undefined) {
  const input: Record<string, unknown> = { q: query, max_pages: filters?.max_pages ?? 1 };
  if (filters?.location) input.location = filters.location;
  if (filters?.gl) input.gl = filters.gl;
  if (filters?.hl) input.hl = filters.hl;
  if (filters?.google_domain) input.google_domain = filters.google_domain;
  if (filters?.device) input.device = filters.device;
  if (filters?.min_price != null) input.min_price = filters.min_price;
  if (filters?.max_price != null) input.max_price = filters.max_price;
  if (filters?.sort_by) input.sort_by = filters.sort_by;
  if (filters?.free_shipping) input.free_shipping = true;
  if (filters?.on_sale) input.on_sale = true;
  return input;
}

async function runApifyActor(
  query: string,
  filters: SearchFilters | undefined,
  actorId: string,
  token: string
): Promise<ApifyPageItem[]> {
  const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildActorInput(query, filters))
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
    if (++attempts > 60) throw new Error("Timeout: Apify demorou demais");
  }

  if (status !== "SUCCEEDED") throw new Error("Apify falhou com status: " + status);

  // Pequena folga: o dataset do run pode levar um instante para ficar
  // disponível para leitura logo após o status virar SUCCEEDED.
  await new Promise((r) => setTimeout(r, 1500));

  const datasetRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}`
  );
  if (!datasetRes.ok) {
    throw new Error(`Falha ao ler dataset do Apify (HTTP ${datasetRes.status})`);
  }
  return datasetRes.json();
}

function normalize(query: string, pages: ApifyPageItem[]): ShoppingResult[] {
  const products = pages.flatMap((page) => page.shopping_results ?? []);
  return products
    .filter((it) => it.title)
    .map((it) => ({
      query,
      position: it.position ?? null,
      title: it.title ?? "",
      productLink: it.product_link ?? it.link ?? "",
      thumbnail: it.thumbnail ?? it.thumbnails?.[0] ?? null,
      price: it.price ?? null,
      extractedPrice: it.extracted_price ?? null,
      oldPrice: it.old_price ?? null,
      rating: it.rating ?? null,
      reviews: it.reviews ?? null,
      source: it.source ?? null,
      tag: it.tag ?? null,
      extensions: Array.isArray(it.extensions)
        ? it.extensions
        : it.extensions
          ? [it.extensions]
          : [],
      snippet: it.snippet ?? null,
      merchantUrl: null,
      isShopify: null
    }));
}

const MERCHANT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// O product_link do Google Shopping é uma página intermediária (não a loja).
// O destino real fica no atributo data-redirect-url do HTML — confirmado
// inspecionando a página real (sem precisar de browser/JS).
async function resolveMerchantUrl(productLink: string): Promise<string | null> {
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

  const results: ShoppingResult[] = [];
  const failedQueries: FailedQuery[] = [];

  for (const query of queries) {
    try {
      const pages = await runApifyActor(query, filters, actorId, token);
      const normalized = normalize(query, pages);
      console.log(
        `[search] "${query}" -> ${pages.length} página(s), ${normalized.length} produtos`
      );
      results.push(...normalized);
    } catch (err) {
      console.error(`[search] "${query}" falhou:`, err);
      failedQueries.push({ query, error: (err as Error).message });
    }
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
