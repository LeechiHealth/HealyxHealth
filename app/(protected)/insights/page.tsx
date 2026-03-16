"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Header } from "@/components/header";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  type: "journal" | "clinical-trial" | "review";
  title: string;
  source: string;
  badge: string;
  badges: string[];
  date?: string;
  year?: string;
  journal?: string;
  abstract?: string;
  authors?: string[];
  meshTerms?: string[];
  url: string;
  pmid?: string;
  nctId?: string;
  status?: string;
  phase?: string;
  conditions?: string[];
}

// ─── Badge config ─────────────────────────────────────────────────────────────

const BADGE_CONFIG: Record<string, { label: string; icon: string; cls: string }> = {
  "Meta-Analysis": {
    label: "META-ANALYSIS",
    icon: "◈",
    cls: "bg-violet-500/15 text-violet-300 border border-violet-500/25",
  },
  "Systematic Review": {
    label: "SYSTEMATIC REVIEW",
    icon: "◈",
    cls: "bg-violet-500/15 text-violet-300 border border-violet-500/25",
  },
  "Literature Review": {
    label: "LITERATURE REVIEW",
    icon: "▦",
    cls: "bg-amber-500/15 text-amber-300 border border-amber-500/25",
  },
  RCT: {
    label: "RCT",
    icon: "◉",
    cls: "bg-cyan-500/15 text-cyan-300 border border-cyan-500/25",
  },
  "Clinical Trial": {
    label: "CLINICAL TRIAL",
    icon: "◉",
    cls: "bg-blue-500/15 text-blue-300 border border-blue-500/25",
  },
  "Peer-Reviewed": {
    label: "PEER-REVIEWED",
    icon: "✓",
    cls: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25",
  },
  Recruiting: {
    label: "RECRUITING",
    icon: "●",
    cls: "bg-green-500/15 text-green-300 border border-green-500/25",
  },
  Completed: {
    label: "COMPLETED",
    icon: "●",
    cls: "bg-slate-500/15 text-slate-300 border border-slate-500/25",
  },
  Active: {
    label: "ACTIVE",
    icon: "●",
    cls: "bg-teal-500/15 text-teal-300 border border-teal-500/25",
  },
};

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "review", label: "Reviews" },
  { key: "journal", label: "Journals" },
  { key: "clinical-trial", label: "Trials" },
];

// ─── Bookmark icon ─────────────────────────────────────────────────────────────

function BookmarkIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  );
}

// ─── Result Card ──────────────────────────────────────────────────────────────

function ResultCard({
  result,
  index,
  isBookmarked,
  onBookmarkToggle,
}: {
  result: SearchResult;
  index: number;
  isBookmarked: boolean;
  onBookmarkToggle: (result: SearchResult) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);

  const abstract = result.abstract || "";
  const snippet = abstract.substring(0, 280);
  const hasMore = abstract.length > 280;

  const authorLine =
    result.authors && result.authors.length > 0
      ? result.authors.length === 1
        ? result.authors[0]
        : `${result.authors[0]} et al.`
      : null;

  async function handleBookmark(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (toggling) return;
    setToggling(true);
    await onBookmarkToggle(result);
    setToggling(false);
  }

  return (
    <div className="group relative border border-white/8 rounded-2xl bg-white/[0.018] hover:bg-white/[0.03] hover:border-white/14 transition-all duration-200 p-5">

      {/* Number + Title row */}
      <div className="flex gap-4 mb-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-white/8 flex items-center justify-center text-xs font-semibold text-muted-foreground mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[15px] font-semibold text-foreground leading-snug hover:text-cyan-300 transition-colors line-clamp-2"
          >
            {result.title}
          </a>
        </div>

        {/* Bookmark button */}
        <button
          onClick={handleBookmark}
          disabled={toggling}
          title={isBookmarked ? "Remove from library" : "Save to library"}
          className={`flex-shrink-0 mt-0.5 transition-all duration-150 ${
            isBookmarked
              ? "opacity-100 text-amber-400"
              : "opacity-0 group-hover:opacity-50 hover:!opacity-100 text-muted-foreground hover:text-amber-400"
          }`}
          aria-label={isBookmarked ? "Remove from library" : "Save to library"}
        >
          <BookmarkIcon filled={isBookmarked} className="w-4 h-4" />
        </button>

        {/* External link */}
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity mt-0.5"
          aria-label="Open source"
        >
          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      {/* Key Takeaway / Abstract */}
      {abstract && (
        <div className="ml-11 mb-3.5">
          <span className="text-[10px] font-bold tracking-widest text-muted-foreground/50 uppercase mr-2">
            Key Takeaway ·
          </span>
          <span className="text-[13px] text-muted-foreground leading-relaxed">
            {expanded ? abstract : snippet}
            {hasMore && !expanded && "…"}
          </span>
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-1.5 text-[11px] text-cyan-400/70 hover:text-cyan-400 transition-colors"
            >
              {expanded ? "less" : "more"}
            </button>
          )}
        </div>
      )}

      {/* Badges */}
      {result.badges && result.badges.length > 0 && (
        <div className="ml-11 flex flex-wrap gap-1.5 mb-3">
          {result.badges.map((b) => {
            const cfg = BADGE_CONFIG[b];
            if (!cfg) return null;
            return (
              <span key={b} className={`inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full ${cfg.cls}`}>
                <span className="text-[8px]">{cfg.icon}</span>
                {cfg.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Metadata: year · author · journal · source */}
      <div className="ml-11 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground/55">
        {result.year && <span>{result.year}</span>}
        {result.year && (authorLine || result.journal) && <span className="text-white/15">·</span>}
        {authorLine && <span>{authorLine}</span>}
        {authorLine && result.journal && <span className="text-white/15">·</span>}
        {result.journal && (
          <span className="italic truncate max-w-[220px]">{result.journal}</span>
        )}
        {result.phase && (
          <>
            <span className="text-white/15">·</span>
            <span>{result.phase}</span>
          </>
        )}
        {result.status && result.source === "ClinicalTrials.gov" && (
          <>
            <span className="text-white/15">·</span>
            <span>{result.status}</span>
          </>
        )}
        <span className="ml-auto text-[10px] text-white/20 font-medium tracking-wide uppercase hidden sm:block">
          {result.source === "PubMed / NIH" ? "PubMed" : result.source}
        </span>
      </div>

      {/* MeSH / condition tags */}
      {result.meshTerms && result.meshTerms.length > 0 && (
        <div className="ml-11 flex flex-wrap gap-1.5 mt-3">
          {result.meshTerms.map((term) => (
            <span key={term} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/8 text-white/30 font-medium">
              {term}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ResultSkeleton({ index }: { index: number }) {
  return (
    <div className="border border-white/8 rounded-2xl bg-white/[0.018] p-5 animate-pulse">
      <div className="flex gap-4 mb-3">
        <div className="w-7 h-7 rounded-full bg-white/8 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-white/10 rounded-full w-full" />
          <div className="h-3.5 bg-white/10 rounded-full w-4/5" />
        </div>
      </div>
      <div className="ml-11 space-y-2 mb-3">
        <div className="h-3 bg-white/7 rounded-full w-full" />
        <div className="h-3 bg-white/7 rounded-full w-11/12" />
        <div className="h-3 bg-white/7 rounded-full w-3/4" />
      </div>
      <div className="ml-11 flex gap-2 mb-3">
        <div className="h-4 w-24 bg-white/8 rounded-full" />
        <div className="h-4 w-16 bg-white/8 rounded-full" />
      </div>
      <div className="ml-11 flex gap-2">
        {[...Array(index % 2 === 0 ? 3 : 4)].map((_, i) => (
          <div key={i} className="h-4 w-16 bg-white/5 rounded-full" />
        ))}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
        <svg className="w-5 h-5 text-muted-foreground/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-[15px] font-medium text-foreground/60 mb-1">No results for &ldquo;{query}&rdquo;</p>
      <p className="text-[13px] text-muted-foreground/40">Try a different term — condition, medication, or treatment name</p>
    </div>
  );
}

// ─── Empty Library state ───────────────────────────────────────────────────────

function EmptyLibrary() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
        <BookmarkIcon filled={false} className="w-6 h-6 text-amber-400/60" />
      </div>
      <p className="text-[15px] font-medium text-foreground/60 mb-1">Your library is empty</p>
      <p className="text-[13px] text-muted-foreground/40 max-w-xs">
        Search for health topics and click the bookmark icon on any result to save it here.
      </p>
    </div>
  );
}

// ─── Hero (pre-search) ────────────────────────────────────────────────────────

function HeroSearch({ onSearch }: { onSearch: (q: string) => void }) {
  const [q, setQ] = useState("");

  const suggestions = [
    "Testosterone replacement therapy",
    "Metformin and longevity",
    "Intermittent fasting metabolic health",
    "Vitamin D deficiency cardiovascular",
    "GLP-1 agonists weight loss",
    "Sleep and cognitive decline",
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">Research & Insights</h1>
        <p className="text-[15px] text-muted-foreground max-w-md">
          Search peer-reviewed journals, clinical trials, and validated medical literature
        </p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (q.trim()) onSearch(q.trim()); }}
        className="w-full max-w-2xl"
      >
        <div className="relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search any health topic, condition, or treatment…"
            autoFocus
            className="w-full bg-white/[0.04] border border-white/12 hover:border-white/20 focus:border-cyan-500/50 rounded-2xl pl-12 pr-28 py-4 text-[15px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!q.trim()}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed text-black text-[13px] font-bold px-4 py-1.5 rounded-xl transition-colors"
          >
            Search
          </button>
        </div>
      </form>

      <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-xl">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSearch(s)}
            className="text-[12px] px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground/60 hover:text-foreground hover:border-white/20 hover:bg-white/8 transition-all"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeFilter, setActiveFilter] = useState("all");

  // Bookmarks
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [libraryResults, setLibraryResults] = useState<SearchResult[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // Load saved bookmarks on mount
  useEffect(() => {
    if (!user) return;
    loadBookmarks();
  }, [user]);

  async function loadBookmarks() {
    if (!user) return;
    setLibraryLoading(true);
    const { data } = await supabase
      .from("bookmarked_insights")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      const ids = new Set(data.map((b: any) => b.result_id as string));
      setBookmarkedIds(ids);

      // Reconstruct SearchResult objects from saved data
      const results: SearchResult[] = data.map((b: any) => ({
        id: b.result_id,
        type: (b.result_type || "journal") as SearchResult["type"],
        title: b.title || "",
        source: b.source || "",
        badge: b.badge || "",
        badges: b.badge ? [b.badge] : [],
        abstract: b.abstract || "",
        authors: b.authors || [],
        year: b.year || "",
        url: b.url || "#",
      }));
      setLibraryResults(results);
    }
    setLibraryLoading(false);
  }

  const handleBookmarkToggle = useCallback(async (result: SearchResult) => {
    if (!user) return;
    const alreadyBookmarked = bookmarkedIds.has(result.id);

    if (alreadyBookmarked) {
      // Optimistic remove
      setBookmarkedIds(prev => { const s = new Set(prev); s.delete(result.id); return s; });
      setLibraryResults(prev => prev.filter(r => r.id !== result.id));

      await supabase
        .from("bookmarked_insights")
        .delete()
        .eq("user_id", user.id)
        .eq("result_id", result.id);
    } else {
      // Optimistic add
      setBookmarkedIds(prev => new Set([...prev, result.id]));
      setLibraryResults(prev => [result, ...prev]);

      await supabase.from("bookmarked_insights").upsert({
        user_id: user.id,
        result_id: result.id,
        result_type: result.type,
        title: result.title,
        source: result.source,
        url: result.url,
        authors: result.authors || [],
        year: result.year || null,
        badge: result.badge || null,
        abstract: result.abstract || null,
        notes: null,
      });
    }
  }, [user, bookmarkedIds]);

  const handleSearch = async (query: string) => {
    const q = query.trim();
    if (!q) return;

    setSearchQuery(q);
    setInputValue(q);
    setSearching(true);
    setHasSearched(true);
    setActiveFilter("all");
    setShowLibrary(false);

    try {
      const res = await fetch("/api/insights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const filteredResults =
    activeFilter === "all"
      ? searchResults
      : searchResults.filter((r) => r.type === activeFilter);

  // Pre-search hero
  if (!hasSearched && !showLibrary) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowLibrary(true)}
              className={`flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg transition-colors ${
                libraryResults.length > 0
                  ? "text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/30"
                  : "text-muted-foreground/50 hover:text-muted-foreground bg-white/5 border border-white/10"
              }`}
            >
              <BookmarkIcon filled={libraryResults.length > 0} className="w-3.5 h-3.5" />
              My Library
              {libraryResults.length > 0 && (
                <span className="ml-0.5 text-[10px] opacity-70">{libraryResults.length}</span>
              )}
            </button>
          </div>
        </div>
        <HeroSearch onSearch={handleSearch} />
      </div>
    );
  }

  // Library view
  if (showLibrary) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6">

          {/* Library header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowLibrary(false)}
                className="text-muted-foreground/50 hover:text-foreground transition-colors"
                aria-label="Back"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center gap-2">
                <BookmarkIcon filled className="w-4 h-4 text-amber-400" />
                <h1 className="text-[17px] font-semibold text-foreground">My Library</h1>
                {libraryResults.length > 0 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                    {libraryResults.length} saved
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => { setShowLibrary(false); }}
              className="text-[12px] font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Search Research →
            </button>
          </div>

          {/* Library results */}
          {libraryLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <ResultSkeleton key={i} index={i} />)}
            </div>
          ) : libraryResults.length === 0 ? (
            <EmptyLibrary />
          ) : (
            <div className="space-y-3">
              {libraryResults.map((r, i) => (
                <ResultCard
                  key={r.id}
                  result={r}
                  index={i}
                  isBookmarked={bookmarkedIds.has(r.id)}
                  onBookmarkToggle={handleBookmarkToggle}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Results view
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6">

        {/* Compact search bar */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSearch(inputValue); }}
          className="relative mb-6"
        >
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search health topics, conditions, treatments…"
            className="w-full bg-white/[0.03] border border-white/10 focus:border-cyan-500/40 rounded-xl pl-10 pr-24 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={searching || !inputValue.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-30 text-black text-[12px] font-bold px-3 py-1 rounded-lg transition-colors"
          >
            {searching ? "…" : "Search"}
          </button>
        </form>

        {/* Filter tabs + count + library button */}
        {!searching && searchResults.length > 0 && (
          <div className="flex items-center justify-between mb-5">
            <div className="flex gap-1">
              {FILTER_TABS.map((tab) => {
                const count =
                  tab.key === "all"
                    ? searchResults.length
                    : searchResults.filter((r) => r.type === tab.key).length;
                if (count === 0 && tab.key !== "all") return null;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveFilter(tab.key)}
                    className={`text-[12px] font-medium px-3 py-1 rounded-lg transition-colors ${
                      activeFilter === tab.key
                        ? "bg-white/10 text-foreground"
                        : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-white/5"
                    }`}
                  >
                    {tab.label}
                    <span className="ml-1.5 text-[11px] opacity-50">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-muted-foreground/40">
                {filteredResults.length} result{filteredResults.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() => setShowLibrary(true)}
                className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors ${
                  bookmarkedIds.size > 0
                    ? "text-amber-400 bg-amber-500/10 border border-amber-500/20"
                    : "text-muted-foreground/40 hover:text-muted-foreground bg-white/5 border border-white/8"
                }`}
              >
                <BookmarkIcon filled={bookmarkedIds.size > 0} className="w-3 h-3" />
                Library
                {bookmarkedIds.size > 0 && <span className="opacity-70">{bookmarkedIds.size}</span>}
              </button>
            </div>
          </div>
        )}

        {/* Results list */}
        <div className="space-y-3">
          {searching ? (
            [...Array(6)].map((_, i) => <ResultSkeleton key={i} index={i} />)
          ) : filteredResults.length === 0 && hasSearched ? (
            <EmptyState query={searchQuery} />
          ) : (
            filteredResults.map((r, i) => (
              <ResultCard
                key={r.id}
                result={r}
                index={i}
                isBookmarked={bookmarkedIds.has(r.id)}
                onBookmarkToggle={handleBookmarkToggle}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
