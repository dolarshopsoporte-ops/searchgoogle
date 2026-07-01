import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type OrganicResult = {
  title?: string;
  url?: string;
  description?: string;
  position?: number;
};

// Formato de dataset item aceito de forma flexível: cobre tanto o shape
// comum de actors de "Google Search Scraper" (searchQuery + organicResults[])
// quanto um shape já achatado (query/url/title direto no item), já que o
// actor real (APIFY_SEARCH_ACTOR_ID) ainda não está definido.
type ApifyDatasetItem = {
  searchQuery?: { term?: string };
  query?: string;
  organicResults?: OrganicResult[];
  title?: string;
  url?: string;
  description?: string;
  position?: number;
};

export type SearchResultItem = {
  query: string;
  position: number | null;
  title: string;
  url: string;
  domain: string;
  snippet: string;
};

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function runApifyActor(
  queries: string[],
  actorId: string,
  token: string
): Promise<ApifyDatasetItem[]> {
  const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries: queries.join("\n") })
  });

  const run = await runRes.json();
  const runId: string | undefined = run?.data?.id;
  if (!runId) throw new Error("Falha ao iniciar o Apify: " + JSON.stringify(run));

  let status = "RUNNING";
  let attempts = 0;
  while (status === "RUNNING" || status === "READY") {
    await new Promise((r) => setTimeout(r, 4000));
    const s = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
    status = (await s.json())?.data?.status;
    if (++attempts > 45) throw new Error("Timeout: Apify demorou demais");
  }

  if (status !== "SUCCEEDED") throw new Error("Apify falhou com status: " + status);

  const datasetRes = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}`
  );
  return datasetRes.json();
}

function flatten(items: ApifyDatasetItem[]): SearchResultItem[] {
  const out: SearchResultItem[] = [];
  for (const item of items) {
    const query = item.searchQuery?.term ?? item.query ?? "";
    if (item.organicResults?.length) {
      for (const r of item.organicResults) {
        if (!r.url) continue;
        out.push({
          query,
          position: r.position ?? null,
          title: r.title ?? "",
          url: r.url,
          domain: domainOf(r.url),
          snippet: r.description ?? ""
        });
      }
    } else if (item.url) {
      out.push({
        query,
        position: item.position ?? null,
        title: item.title ?? "",
        url: item.url,
        domain: domainOf(item.url),
        snippet: item.description ?? ""
      });
    }
  }
  return out;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const queries: string[] | undefined = body?.queries;
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

  try {
    const items = await runApifyActor(queries, actorId, token);
    const results = flatten(items);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("search error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
