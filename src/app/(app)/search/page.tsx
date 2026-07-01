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
  delivery: string | null;
  extensions: string[];
  snippet: string | null;
};

type FailedQuery = { query: string; error: string };

async function fetchResults(
  queries: string[]
): Promise<{ results: ShoppingResult[]; failedQueries: FailedQuery[] }> {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries })
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
    "delivery",
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
        r.delivery ?? "",
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

export default function SearchPage() {
  const [raw, setRaw] = useState("");
  const [filter, setFilter] = useState("");
  const [step, setStep] = useState<"idle" | "loading" | "results">("idle");
  const [results, setResults] = useState<ShoppingResult[]>([]);
  const [failedQueries, setFailedQueries] = useState<FailedQuery[]>([]);
  const [error, setError] = useState("");

  const queries = [...new Set(raw.split("\n").map((q) => q.trim()).filter(Boolean))];

  async function handleSearch() {
    if (!queries.length) return;
    setStep("loading");
    setError("");
    setResults([]);
    setFailedQueries([]);
    try {
      const data = await fetchResults(queries);
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

          {error && <div className={styles.errorMsg}>⚠ {error}</div>}

          <button
            className={styles.btnSearch}
            onClick={handleSearch}
            disabled={step === "loading" || queries.length === 0}
          >
            {step === "loading" ? (
              <>
                <span className={styles.spinner} /> Buscando {queries.length} termo
                {queries.length !== 1 ? "s" : ""}... (pode levar alguns minutos)
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
                          {(item.delivery || item.extensions.length > 0) && (
                            <div className={styles.tagsRow}>
                              {item.delivery && <span className={styles.metaChip}>{item.delivery}</span>}
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
