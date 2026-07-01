"use client";

import { useState } from "react";
import styles from "./search.module.css";
import { Download, ExternalLink } from "@/components/Icons";

type ShoppingResult = {
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

type Filters = {
  location: string;
  gl: string;
  hl: string;
  googleDomain: string;
  device: "desktop" | "tablet" | "mobile";
  minPrice: string;
  maxPrice: string;
  sortBy: "" | "1" | "2";
  freeShipping: boolean;
  onSale: boolean;
  maxPages: string;
};

const DEFAULT_FILTERS: Filters = {
  location: "",
  gl: "",
  hl: "",
  googleDomain: "",
  device: "desktop",
  minPrice: "",
  maxPrice: "",
  sortBy: "",
  freeShipping: false,
  onSale: false,
  maxPages: "1"
};

function filtersToPayload(f: Filters) {
  const payload: Record<string, unknown> = {};
  if (f.location.trim()) payload.location = f.location.trim();
  if (f.gl.trim()) payload.gl = f.gl.trim();
  if (f.hl.trim()) payload.hl = f.hl.trim();
  if (f.googleDomain.trim()) payload.google_domain = f.googleDomain.trim();
  if (f.device !== "desktop") payload.device = f.device;
  if (f.minPrice.trim()) payload.min_price = Number(f.minPrice);
  if (f.maxPrice.trim()) payload.max_price = Number(f.maxPrice);
  if (f.sortBy) payload.sort_by = Number(f.sortBy);
  if (f.freeShipping) payload.free_shipping = true;
  if (f.onSale) payload.on_sale = true;
  const maxPages = Number(f.maxPages);
  payload.max_pages = Number.isFinite(maxPages) && maxPages >= 0 ? maxPages : 1;
  return payload;
}

async function fetchResults(
  queries: string[],
  filters: Filters,
  onlyShopify: boolean
): Promise<{ results: ShoppingResult[]; failedQueries: FailedQuery[] }> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries, filters: filtersToPayload(filters), onlyShopify })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || (await res.text()));
  }
  return res.json();
}

function toCsv(rows: ShoppingResult[]): string {
  const header = [
    "query",
    "position",
    "title",
    "price",
    "old_price",
    "rating",
    "reviews",
    "source",
    "merchant_url",
    "tag",
    "product_link"
  ];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.query,
        r.position ?? "",
        r.title,
        r.price ?? "",
        r.oldPrice ?? "",
        r.rating ?? "",
        r.reviews ?? "",
        r.source ?? "",
        r.merchantUrl ?? "",
        r.tag ?? "",
        r.productLink
      ]
        .map((v) => escape(String(v)))
        .join(",")
    );
  }
  return lines.join("\n");
}

function downloadCsv(rows: ShoppingResult[]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `searchgoogle-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function merchantDomain(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export default function SearchPage() {
  const [raw, setRaw] = useState("");
  const [filter, setFilter] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [onlyShopify, setOnlyShopify] = useState(false);
  const [step, setStep] = useState<"idle" | "loading" | "results">("idle");
  const [results, setResults] = useState<ShoppingResult[]>([]);
  const [failedQueries, setFailedQueries] = useState<FailedQuery[]>([]);
  const [error, setError] = useState("");

  const queries = [...new Set(raw.split("\n").map((q) => q.trim()).filter(Boolean))];

  function setFilterField<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSearch() {
    if (!queries.length) return;
    setStep("loading");
    setError("");
    setResults([]);
    setFailedQueries([]);
    try {
      const data = await fetchResults(queries, filters, onlyShopify);
      setResults(data.results);
      setFailedQueries(data.failedQueries || []);
      setStep("results");
    } catch (e) {
      setError((e as Error).message);
      setStep("idle");
    }
  }

  const filtered = filter.trim()
    ? results.filter(
        (r) =>
          r.title.toLowerCase().includes(filter.toLowerCase()) ||
          r.source?.toLowerCase().includes(filter.toLowerCase())
      )
    : results;

  const grouped = new Map<string, ShoppingResult[]>();
  for (const r of filtered) {
    const list = grouped.get(r.query) ?? [];
    list.push(r);
    grouped.set(r.query, list);
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>◎</span>
          <span className={styles.logoText}>SearchGoogle</span>
        </div>
        <p className={styles.tagline}>
          Busca de produtos no Google Shopping via Apify — preços, vendedores e avaliações por
          palavra-chave
        </p>
      </header>

      <main>
        <section className={styles.card}>
          <div className={styles.cardLabel}>BUSCAS — uma por linha</div>
          <textarea
            className={styles.queryInput}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={"tênis ortopédico feminino\nsuplemento emagrecedor"}
            rows={7}
          />
          {queries.length > 0 && (
            <div className={styles.queryCount}>
              {queries.length} busca{queries.length !== 1 ? "s" : ""} detectada
              {queries.length !== 1 ? "s" : ""} — 1 run Apify por busca
            </div>
          )}

          <div className={styles.filtersBlock}>
            <div className={styles.cardLabel}>FILTROS (opcional)</div>
            <p className={styles.filtersHint}>
              Se preencher País (gl), preencha também o Domínio Google correspondente (ex:
              gl=de → google.de). Buscar em google.com pedindo resultados de outro país pode
              retornar poucos ou nenhum produto.
            </p>
            <div className={styles.filtersGrid}>
              <label className={styles.filterField}>
                <span className={styles.filterFieldLabel}>Localização</span>
                <input
                  className={styles.filterFieldInput}
                  value={filters.location}
                  onChange={(e) => setFilterField("location", e.target.value)}
                  placeholder="Berlin, Germany"
                />
              </label>
              <label className={styles.filterField}>
                <span className={styles.filterFieldLabel}>País (gl)</span>
                <input
                  className={styles.filterFieldInput}
                  value={filters.gl}
                  onChange={(e) => setFilterField("gl", e.target.value)}
                  placeholder="de"
                  maxLength={2}
                />
              </label>
              <label className={styles.filterField}>
                <span className={styles.filterFieldLabel}>Idioma (hl)</span>
                <input
                  className={styles.filterFieldInput}
                  value={filters.hl}
                  onChange={(e) => setFilterField("hl", e.target.value)}
                  placeholder="de"
                  maxLength={2}
                />
              </label>
              <label className={styles.filterField}>
                <span className={styles.filterFieldLabel}>Domínio Google</span>
                <input
                  className={styles.filterFieldInput}
                  value={filters.googleDomain}
                  onChange={(e) => setFilterField("googleDomain", e.target.value)}
                  placeholder="google.de"
                />
              </label>
              <label className={styles.filterField}>
                <span className={styles.filterFieldLabel}>Dispositivo</span>
                <select
                  className={styles.filterFieldInput}
                  value={filters.device}
                  onChange={(e) => setFilterField("device", e.target.value as Filters["device"])}
                >
                  <option value="desktop">Desktop</option>
                  <option value="tablet">Tablet</option>
                  <option value="mobile">Mobile</option>
                </select>
              </label>
              <label className={styles.filterField}>
                <span className={styles.filterFieldLabel}>Ordenar por</span>
                <select
                  className={styles.filterFieldInput}
                  value={filters.sortBy}
                  onChange={(e) => setFilterField("sortBy", e.target.value as Filters["sortBy"])}
                >
                  <option value="">Relevância</option>
                  <option value="1">Preço: menor p/ maior</option>
                  <option value="2">Preço: maior p/ menor</option>
                </select>
              </label>
              <label className={styles.filterField}>
                <span className={styles.filterFieldLabel}>Preço mínimo</span>
                <input
                  className={styles.filterFieldInput}
                  type="number"
                  min={0}
                  value={filters.minPrice}
                  onChange={(e) => setFilterField("minPrice", e.target.value)}
                  placeholder="0"
                />
              </label>
              <label className={styles.filterField}>
                <span className={styles.filterFieldLabel}>Preço máximo</span>
                <input
                  className={styles.filterFieldInput}
                  type="number"
                  min={0}
                  value={filters.maxPrice}
                  onChange={(e) => setFilterField("maxPrice", e.target.value)}
                  placeholder="1000"
                />
              </label>
              <label className={styles.filterField}>
                <span className={styles.filterFieldLabel}>Páginas por busca</span>
                <input
                  className={styles.filterFieldInput}
                  type="number"
                  min={0}
                  value={filters.maxPages}
                  onChange={(e) => setFilterField("maxPages", e.target.value)}
                  placeholder="1"
                />
              </label>
            </div>
            <div className={styles.checkboxRow}>
              <label className={styles.checkboxLabel}>
                <input
                  className="checkbox"
                  type="checkbox"
                  checked={filters.freeShipping}
                  onChange={(e) => setFilterField("freeShipping", e.target.checked)}
                />
                Só frete grátis
              </label>
              <label className={styles.checkboxLabel}>
                <input
                  className="checkbox"
                  type="checkbox"
                  checked={filters.onSale}
                  onChange={(e) => setFilterField("onSale", e.target.checked)}
                />
                Só em promoção
              </label>
              <label className={styles.checkboxLabel}>
                <input
                  className="checkbox"
                  type="checkbox"
                  checked={onlyShopify}
                  onChange={(e) => setOnlyShopify(e.target.checked)}
                />
                Só lojas Shopify (mais lento — verifica cada produto)
              </label>
            </div>
          </div>

          {error && <div className={styles.errorMsg}>⚠ {error}</div>}

          <button
            className={styles.btnSearch}
            onClick={handleSearch}
            disabled={step === "loading" || queries.length === 0}
          >
            {step === "loading" ? (
              <>
                <span className={styles.spinner} /> Buscando {queries.length} termo
                {queries.length !== 1 ? "s" : ""}
                {onlyShopify ? " e verificando Shopify" : ""}... (pode levar alguns minutos)
              </>
            ) : (
              <>
                <span>◎</span> Buscar produtos
              </>
            )}
          </button>
        </section>

        {step === "results" && (
          <>
            <div className={styles.summaryBar}>
              <div className={styles.summaryStat}>
                <span className={styles.statNum}>{results.length}</span>
                <span className={styles.statLbl}>produtos</span>
              </div>
              <div className={styles.summaryDiv} />
              <div className={`${styles.summaryStat} ${styles.summaryStatAccent}`}>
                <span className={styles.statNum}>{grouped.size}</span>
                <span className={styles.statLbl}>buscas c/ retorno</span>
              </div>
              <div className={styles.summaryDiv} />
              <div className={`${styles.summaryStat} ${styles.summaryStatMuted}`}>
                <span className={styles.statNum}>{failedQueries.length}</span>
                <span className={styles.statLbl}>buscas falharam</span>
              </div>
            </div>

            {failedQueries.length > 0 && (
              <div className={styles.errorMsg}>
                ⚠ {failedQueries.length} busca{failedQueries.length !== 1 ? "s" : ""} falhou:{" "}
                {failedQueries.map((f) => f.query).join(", ")}
              </div>
            )}

            <div className={styles.toolbar}>
              <input
                className={styles.filterInput}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar por título ou vendedor..."
              />
              <button
                className={styles.btnExport}
                onClick={() => downloadCsv(filtered)}
                disabled={filtered.length === 0}
              >
                <Download /> Exportar CSV
              </button>
            </div>

            {[...grouped.entries()].map(([query, items]) => (
              <section key={query} className={styles.queryGroup}>
                <div className={styles.sectionLabel}>
                  {query} — {items.length} produto{items.length !== 1 ? "s" : ""}
                </div>
                <div className={styles.resultList}>
                  {items.map((item, i) => (
                    <a
                      key={i}
                      href={item.productLink}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.resultCard}
                    >
                      <div className={styles.resultRow}>
                        {item.thumbnail && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className={styles.thumb} src={item.thumbnail} alt="" />
                        )}
                        <div className={styles.resultInfo}>
                          <div className={styles.resultTitleRow}>
                            <span className={styles.resultTitle}>{item.title}</span>
                            {item.position != null && (
                              <span className={styles.metaChip}>#{item.position}</span>
                            )}
                          </div>
                          {item.source && <span className={styles.resultDomain}>{item.source}</span>}
                          {item.isShopify && (
                            <span className={styles.tagBadge}>
                              Shopify{merchantDomain(item.merchantUrl) ? ` · ${merchantDomain(item.merchantUrl)}` : ""}
                            </span>
                          )}
                          <div className={styles.priceRow}>
                            {item.price && <span className={styles.price}>{item.price}</span>}
                            {item.oldPrice && (
                              <span className={styles.oldPrice}>{item.oldPrice}</span>
                            )}
                            {item.rating != null && (
                              <span className={styles.rating}>
                                ★ {item.rating.toFixed(1)}
                                {item.reviews != null && ` (${item.reviews})`}
                              </span>
                            )}
                          </div>
                          {(item.tag || item.extensions.length > 0) && (
                            <div className={styles.tagsRow}>
                              {item.tag && (
                                <span className={styles.tagBadge}>{item.tag}</span>
                              )}
                              {item.extensions.map((ext, j) => (
                                <span key={j} className={styles.metaChip}>
                                  {ext}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <ExternalLink className={styles.linkIcon} />
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            ))}

            {grouped.size === 0 && (
              <div className={styles.emptyState}>
                Nenhum produto encontrado{filter ? " para esse filtro" : ""}.
              </div>
            )}
          </>
        )}
      </main>
      <footer className={styles.footer}>Powered by Apify (Google Shopping)</footer>
    </div>
  );
}
