import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Actor: johnvc/google-shopping-api-google-shopping-products-prices-deals
// Input schema aceita apenas uma busca por run (campo obrigatório "q"), sem
// suporte a batch — por isso rodamos um run por query, sequencialmente.
type ApifyShoppingItem = {
  position?: number;
  title?: string;
  source?: string;
  seller?: string;
  price?: string;
  extracted_price?: number;
  extractedPrice?: number;
  old_price?: string;
  rating?: number;
  reviews?: number;
  review_count?: number;
  delivery?: string;
  shipping?: string;
  extensions?: string[] | string;
  product_link?: string;
  productLink?: string;
  link?: string;
  thumbnail?: string;
  image?: string;
  snippet?: string;
  description?: string;
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
  delivery: string | null;
  extensions: string[];
  snippet: string | null;
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
): Promise<ApifyShoppingItem[]> {
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

  const datasetRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}`
  );
  return datasetRes.json();
}

function normalize(query: string, items: ApifyShoppingItem[]): ShoppingResult[] {
  return items
    .filter((it) => it.title && (it.product_link || it.productLink || it.link))
    .map((it) => ({
      query,
      position: it.position ?? null,
      title: it.title ?? "",
      productLink: it.product_link ?? it.productLink ?? it.link ?? "",
      thumbnail: it.thumbnail ?? it.image ?? null,
      price: it.price ?? null,
      extractedPrice: it.extracted_price ?? it.extractedPrice ?? null,
      oldPrice: it.old_price ?? null,
      rating: it.rating ?? null,
      reviews: it.reviews ?? it.review_count ?? null,
      source: it.source ?? it.seller ?? null,
      delivery: it.delivery ?? it.shipping ?? null,
      extensions: Array.isArray(it.extensions)
        ? it.extensions
        : it.extensions
          ? [it.extensions]
          : [],
      snippet: it.snippet ?? it.description ?? null
    }));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const queries: string[] | undefined = body?.queries;
  const filters: SearchFilters | undefined = body?.filters;
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
      const items = await runApifyActor(query, filters, actorId, token);
      results.push(...normalize(query, items));
    } catch (err) {
      failedQueries.push({ query, error: (err as Error).message });
    }
  }

  return NextResponse.json({ results, failedQueries });
}
