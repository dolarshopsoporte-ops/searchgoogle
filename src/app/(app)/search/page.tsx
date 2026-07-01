"use client";

import { useState } from "react";
import styles from "./search.module.css";
import { Download, ExternalLink } from "@/components/Icons";

type SearchResultItem = {
  query: string;
  position: number | null;
  title: string;
  url: string;
  domain: string;
  snippet: string;
};

async function fetchResults(queries: string[]): Promise<{ results: SearchResultItem[] }> {
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

function toCsv(rows: SearchResultItem[]): string {
  const header = ["query", "position", "title", "domain", "url", "snippet"];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.query, r.position ?? "", r.title, r.domain, r.url, r.snippet]
        .map((v) => escape(String(v)))
        .join(",")
    );
  }
  return lines.join("\n");
}

function downloadCsv(rows: SearchResultItem[]) {
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
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [error, setError] = useState("");

  const queries = [...new Set(raw.split("\n").map((q) => q.trim()).filter(Boolean))];

  async function handleSearch() {
    if (!queries.length) return;
    setStep("loading");
    setError("");
    setResults([]);
    try {
      const data = await fetchResults(queries);
      setResults(data.results);
      setStep("results");
    } catch (e) {
      setError((e as Error).message);
      setStep("idle");
    }
  }

  const filtered = filter.trim()
    ? results.filter(
        (r) =>
          r.domain.toLowerCase().includes(filter.toLowerCase()) ||
          r.title.toLowerCase().includes(filter.toLowerCase())
      )
    : results;

  const grouped = new Map<string, SearchResultItem[]>();
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
          Busca em massa no Google via Apify — descubra lojas e páginas por palavra-chave
        </p>
      </header>

      <main>
        <section className={styles.card}>
          <div className={styles.cardLabel}>BUSCAS — uma por linha</div>
          <textarea
            className={styles.queryInput}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={"tênis ortopédico feminino\nloja de suplementos shopify"}
            rows={7}
          />
          {queries.length > 0 && (
            <div className={styles.queryCount}>
              {queries.length} busca{queries.length !== 1 ? "s" : ""} detectada
              {queries.length !== 1 ? "s" : ""}
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
                {queries.length !== 1 ? "s" : ""}... (pode levar ~1 min)
              </>
            ) : (
              <>
                <span>◎</span> Buscar no Google
              </>
            )}
          </button>
        </section>

        {step === "results" && (
          <>
            <div className={styles.summaryBar}>
              <div className={styles.summaryStat}>
                <span className={styles.statNum}>{results.length}</span>
                <span className={styles.statLbl}>resultados</span>
              </div>
              <div className={styles.summaryDiv} />
              <div className={`${styles.summaryStat} ${styles.summaryStatAccent}`}>
                <span className={styles.statNum}>
                  {new Set(results.map((r) => r.domain)).size}
                </span>
                <span className={styles.statLbl}>domínios únicos</span>
              </div>
              <div className={styles.summaryDiv} />
              <div className={`${styles.summaryStat} ${styles.summaryStatMuted}`}>
                <span className={styles.statNum}>{grouped.size}</span>
                <span className={styles.statLbl}>buscas c/ retorno</span>
              </div>
            </div>

            <div className={styles.toolbar}>
              <input
                className={styles.filterInput}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar por domínio ou título..."
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
                  {query} — {items.length} resultado{items.length !== 1 ? "s" : ""}
                </div>
                <div className={styles.resultList}>
                  {items.map((item, i) => (
                    <a
                      key={i}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.resultCard}
                    >
                      <div className={styles.resultRow}>
                        <div className={styles.resultInfo}>
                          <div className={styles.resultTitleRow}>
                            <span className={styles.resultTitle}>{item.title || item.url}</span>
                            {item.position != null && (
                              <span className={styles.metaChip}>#{item.position}</span>
                            )}
                          </div>
                          <span className={styles.resultDomain}>{item.domain}</span>
                          {item.snippet && <p className={styles.resultSnippet}>{item.snippet}</p>}
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
                Nenhum resultado encontrado{filter ? " para esse filtro" : ""}.
              </div>
            )}
          </>
        )}
      </main>
      <footer className={styles.footer}>Powered by Apify</footer>
    </div>
  );
}
