/* CiteVerify frontend – single-file React app.
   Sections: shared UI & infrastructure · Student portal · Professor portal · Login, shell & routing. */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, RadialBarChart, RadialBar, PolarAngleAxis, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis, Area, AreaChart } from "recharts";
import { AlertTriangle, ArrowRight, BookOpen, Check, CheckCircle2, ChevronRight, CircleHelp, Clock, ExternalLink, FileText, GitBranch, Hash, Info, Link2, Loader2, Minus, Search, ShieldAlert, ShieldCheck, Sigma, X, XCircle, Download, FileUp, FolderOpen, GitCompare, Lightbulb, MessageSquare, RefreshCw, Send, Sparkles, Trash2, Upload, FileSearch, ClipboardCheck, Flag, Inbox, Pencil, Users, Wand2, Activity, Repeat, ArrowLeft, Bell, BookMarked, GraduationCap, History, LayoutDashboard, LogOut, Menu, Moon, Network, Settings, Sun, Timer, TrendingUp, Microscope, ChartLine as ChartLineIcon, Plus, File, Waypoints, MessageSquareText, ChevronsLeft, ChevronsRight, LayoutGrid, ClipboardList, Gauge, Quote } from "lucide-react";
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./index.css";
import studentImg from "./student.png";
import professorImg from "./professor.png";

/* ======================================================================
   SHARED UI & INFRASTRUCTURE
   ====================================================================== */
/* Shared infrastructure + components used by both portals. */
/* ------------------------------------------------------------------ API */
export const auth = {
  get token() { return localStorage.getItem("cv_token") || ""; },
  set(token: string, user: any) { localStorage.setItem("cv_token", token); localStorage.setItem("cv_user", JSON.stringify(user)); },
  clear() { localStorage.removeItem("cv_token"); localStorage.removeItem("cv_user"); },
  user(): any { try { return JSON.parse(localStorage.getItem("cv_user") || "null"); } catch { return null; } },
};

export async function api<T = any>(path: string, opts: { method?: string; body?: any; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (auth.token) headers.Authorization = "Bearer " + auth.token;
  let body: any;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }
  let res: Response;
  try {
    res = await fetch("/api" + path, { method: opts.method || (body ? "POST" : "GET"), headers, body });
  } catch {
    throw new Error("Cannot reach the CiteVerify server. Is the backend running?");
  }
  if (res.status === 401) { auth.clear(); window.dispatchEvent(new Event("cv-logout")); }
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch { /* not json */ }
    throw new Error(msg || "Request failed");
  }
  return res.json();
}

export function uploadWithProgress(form: FormData, onProgress: (pct: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents/upload");
    xhr.setRequestHeader("Authorization", "Bearer " + auth.token);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: any = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.detail || "Upload failed (" + xhr.status + ")"));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}

export const reportUrl = (docId: number) => `/api/documents/${docId}/report.pdf?token=${encodeURIComponent(auth.token)}`;

/** Fetch hook with loading/error/reload. */
export function useApi<T = any>(path: string | null, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(!!path);
  const load = useCallback(async (silent = false) => {
    if (!path) return;
    if (!silent) setLoading(true);
    try { setData(await api<T>(path)); setError(""); } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

/* ------------------------------------------------------------------ Router */
type RouterValue = { path: string; query: URLSearchParams; navigate: (to: string) => void };
export const RouterCtx = createContext<RouterValue>({ path: "/", query: new URLSearchParams(), navigate: () => {} });
export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [loc, setLoc] = useState({ path: window.location.pathname, search: window.location.search });
  useEffect(() => {
    const on = () => setLoc({ path: window.location.pathname, search: window.location.search });
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const navigate = useCallback((to: string) => {
    window.history.pushState({}, "", to);
    setLoc({ path: window.location.pathname, search: window.location.search });
    window.scrollTo(0, 0);
  }, []);
  const value = useMemo(() => ({ path: loc.path, query: new URLSearchParams(loc.search), navigate }), [loc, navigate]);
  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>;
}
export const useRouter = () => useContext(RouterCtx);
export function Link({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) {
  const { navigate } = useRouter();
  return <a href={to} className={className} onClick={(e) => { e.preventDefault(); navigate(to); }}>{children}</a>;
}

/* ------------------------------------------------------------------ Theme */
type Theme = "light" | "dark";
export const ThemeCtx = createContext<{ theme: Theme; toggle: () => void; set: (t: Theme) => void }>({ theme: "light", toggle: () => {}, set: () => {} });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("cv_theme") as Theme) ||
    (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("cv_theme", theme);
  }, [theme]);
  return <ThemeCtx.Provider value={{ theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")), set: setTheme }}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx);

/* ------------------------------------------------------------------ System info (LLM / live lookup) */
export function useSystem() { return useApi<any>("/system"); }

/* ------------------------------------------------------------------ Verdicts */
export const VERDICTS = ["SUPPORTED", "PARTIALLY SUPPORTED", "UNSUPPORTED", "CONTRADICTORY", "POTENTIALLY OUTDATED", "NEEDS HUMAN REVIEW"] as const;
export const VERDICT_META: Record<string, { label: string; color: string; cls: string; dot: string; icon: any; short: string }> = {
  "SUPPORTED": { label: "Supported", short: "Supported", color: "#16a34a", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/25", dot: "bg-emerald-500", icon: CheckCircle2 },
  "PARTIALLY SUPPORTED": { label: "Partially supported", short: "Partial", color: "#ca8a04", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/30", dot: "bg-amber-500", icon: Minus },
  "UNSUPPORTED": { label: "Unsupported", short: "Unsupported", color: "#dc2626", cls: "bg-red-500/10 text-red-700 dark:text-red-400 ring-red-500/25", dot: "bg-red-500", icon: XCircle },
  "CONTRADICTORY": { label: "Contradictory", short: "Contradictory", color: "#be123c", cls: "bg-rose-600/10 text-rose-700 dark:text-rose-400 ring-rose-600/30", dot: "bg-rose-600", icon: AlertTriangle },
  "POTENTIALLY OUTDATED": { label: "Potentially outdated", short: "Outdated", color: "#ea580c", cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400 ring-orange-500/30", dot: "bg-orange-500", icon: Clock },
  "NEEDS HUMAN REVIEW": { label: "Needs human review", short: "Review", color: "#64748b", cls: "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/30", dot: "bg-slate-500", icon: CircleHelp },
};
export function VerdictBadge({ verdict, size = "md" }: { verdict: string; size?: "sm" | "md" }) {
  const m = VERDICT_META[verdict] || VERDICT_META["NEEDS HUMAN REVIEW"];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md ring-1 ring-inset font-medium whitespace-nowrap ${m.cls} ${size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs"}`}>
      <Icon size={size === "sm" ? 11 : 13} strokeWidth={2.4} />{m.label}
    </span>
  );
}
export function Confidence({ value, compact }: { value: number; compact?: boolean }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-slate-400";
  return (
    <div className="flex items-center gap-2" title="Strength of available evidence for this verdict – not a guarantee of correctness">
      <div className={`h-1.5 rounded-full bg-surface2 overflow-hidden ${compact ? "w-12" : "w-20"}`}><div className={`h-full ${color}`} style={{ width: pct + "%" }} /></div>
      <span className="text-xs tabular-nums text-muted">{pct}%</span>
    </div>
  );
}
export const DOC_STATUS: Record<string, { label: string; cls: string }> = {
  processing: { label: "Analysing", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  analyzed: { label: "Analysed", cls: "bg-slate-500/10 text-slate-700 dark:text-slate-300" },
  failed: { label: "Failed", cls: "bg-red-500/10 text-red-700 dark:text-red-400" },
  submitted: { label: "Awaiting review", cls: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
  in_review: { label: "In review", cls: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  reviewed: { label: "Reviewed", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  revision_requested: { label: "Revision requested", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
};
export function StatusPill({ status }: { status: string }) {
  const s = DOC_STATUS[status] || { label: status, cls: "bg-slate-500/10" };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}
export function RiskPill({ risk }: { risk?: string }) {
  if (!risk) return null;
  const cls = risk === "high" ? "text-red-600 dark:text-red-400 bg-red-500/10" : risk === "medium" ? "text-amber-600 dark:text-amber-400 bg-amber-500/10" : "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${cls}`}>{risk} risk</span>;
}

/* ------------------------------------------------------------------ Layout primitives */
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: string; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        {eyebrow && <div className="label mb-1.5 text-accent">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function Stat({ label, value, hint, icon: Icon, tone, onClick, title }: { label: string; value: React.ReactNode; hint?: string; icon?: any; tone?: string; onClick?: () => void; title?: string }) {
  const clickable = onClick ? { role: "button", tabIndex: 0, title, onClick, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } } : {};
  return (
    <div {...clickable} className={`card p-4 fade-in ${onClick ? "group cursor-pointer transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-muted font-medium">{label}</span>
        {Icon && <span className={`grid place-items-center size-7 rounded-md ${tone || "bg-accentsoft text-accent"}`}><Icon size={15} /></span>}
      </div>
      <div className="text-[26px] font-semibold tracking-tight mt-2 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
      {onClick && <div className="text-[11px] text-accent mt-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">View details →</div>}
    </div>
  );
}
export function Empty({ icon: Icon = FileText, title, body, action }: { icon?: any; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="size-11 rounded-xl bg-accentsoft text-accent grid place-items-center mb-3"><Icon size={20} /></div>
      <div className="font-medium">{title}</div>
      {body && <p className="text-sm text-muted mt-1 max-w-sm">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function Loading({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-3">{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-16 rounded-xl shimmer" />)}</div>;
}
export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="card p-4 border-red-500/30 bg-red-500/5 flex items-start gap-3">
      <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
      <div className="flex-1 text-sm"><div className="font-medium text-red-600 dark:text-red-400">Something went wrong</div><div className="text-muted">{error}</div></div>
      {retry && <button className="btn btn-ghost btn-sm" onClick={() => retry()}>Retry</button>}
    </div>
  );
}
export function Drawer({ open, onClose, children, width = 760, title }: { open: boolean; onClose: () => void; children: React.ReactNode; width?: number; title?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] fade-in" onClick={onClose} />
      <div className="relative h-full bg-bg border-l border-line shadow-2xl slide-in flex flex-col" style={{ width: `min(${width}px, 100vw)` }}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-line bg-surface shrink-0">
          <div className="font-medium text-sm truncate">{title}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
export function Modal({ open, onClose, title, children, footer, width = 620 }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/50 fade-in" onClick={onClose} />
      <div className="relative card shadow-2xl fade-in w-full max-h-[90vh] flex flex-col" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line"><div className="font-semibold">{title}</div><button className="btn btn-ghost btn-sm" onClick={onClose}><X size={15} /></button></div>
        <div className="p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-line flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-line overflow-x-auto">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${value === t.id ? "border-accent text-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-[11px] rounded-full bg-surface2 px-1.5 py-0.5 text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
      <input className="input pl-8 w-64" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "Search…"} />
    </div>
  );
}
export function VerdictFilter({ value, onChange, counts }: { value: string; onChange: (v: string) => void; counts?: Record<string, number> }) {
  const all = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;
  return (
    <div className="flex flex-wrap gap-1.5">
      {["ALL", ...VERDICTS].map((v) => {
        const active = value === v;
        const m = VERDICT_META[v];
        return (
          <button key={v} onClick={() => onChange(v)}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border transition-colors ${active ? "border-accent bg-accentsoft text-ink font-medium" : "border-line text-muted hover:text-ink bg-surface"}`}>
            {m && <span className={`size-1.5 rounded-full ${m.dot}`} />}{v === "ALL" ? "All claims" : m.label}
            {counts && <span className="tabular-nums opacity-70">{v === "ALL" ? all : counts[v] || 0}</span>}
          </button>
        );
      })}
    </div>
  );
}
export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "–");
export const fmtAgo = (s?: string | null) => {
  if (!s) return "";
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + "m ago";
  if (d < 86400) return Math.floor(d / 3600) + "h ago";
  return Math.floor(d / 86400) + "d ago";
};
export const fmtSize = (b: number) => (b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
export const authorsShort = (a: string[] = []) => (a.length > 2 ? a[0] + " et al." : a.join(" & "));

export function SimBadge({ paper }: { paper: any }) {
  if (!paper) return null;
  return paper.simulated
    ? <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-400" title="Fictional paper from the CiteVerify demo corpus">Simulated demo paper</span>
    : <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-sky-500/10 text-sky-700 dark:text-sky-400">Live · {String(paper.source || "").split("+").join(" + ")}</span>;
}
export function PaperCite({ paper, compact }: { paper: any; compact?: boolean }) {
  if (!paper) return <span className="text-muted text-sm">Source unavailable</span>;
  return (
    <div className="min-w-0">
      <div className={`font-serif font-medium leading-snug ${compact ? "text-[13px] line-clamp-2" : "text-[15px]"}`}>{paper.title}</div>
      <div className="text-xs text-muted mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{authorsShort(paper.authors)} · {paper.year || "n.d."}</span>
        {!compact && paper.venue && <span className="italic truncate max-w-[280px]">{paper.venue.replace(" (CiteVerify demo corpus)", "")}</span>}
        {!compact && <SimBadge paper={paper} />}
        {!compact && paper.doi && (paper.url
          ? <a className="inline-flex items-center gap-1 text-accent hover:underline" href={paper.url} target="_blank" rel="noreferrer">doi:{paper.doi}<ExternalLink size={11} /></a>
          : <span className="font-mono text-[11px]">doi:{paper.doi}</span>)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Evidence highlighting */
const LABEL_TEXT: Record<string, string> = { support: "Supporting evidence", contradict: "Contradicting evidence", partial: "Partial evidence", none: "No relevant evidence" };
export function HighlightLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted">
      {(["support", "contradict", "partial", "none"] as const).map((l) => <span key={l} className="inline-flex items-center gap-1.5"><mark className={`hl hl-${l}`}>&nbsp;&nbsp;&nbsp;</mark>{LABEL_TEXT[l]}</span>)}
    </div>
  );
}
export function EvidenceQuote({ e }: { e: any }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3.5">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="label !normal-case !tracking-normal !text-[11px]">{LABEL_TEXT[e.label] || "Evidence"}</span>
        <span className="text-[11px] text-muted font-mono">{[e.section, e.page ? "p. " + e.page : ""].filter(Boolean).join(" · ") || "location n/a"}</span>
      </div>
      <p className="font-serif text-[14.5px] leading-relaxed"><mark className={`hl hl-${e.label}`}>{e.text}</mark></p>
    </div>
  );
}
/** Full paper text with the evidence sentences highlighted in place. */
export function HighlightedPaper({ paper, evidence }: { paper: any; evidence: any[] }) {
  if (!paper) return <Empty icon={BookOpen} title="Source unavailable – manual verification required" body="No paper text could be retrieved for this citation. CiteVerify never fabricates evidence." />;
  const sections: { name: string; page?: number; text: string }[] = [];
  if (paper.abstract) sections.push({ name: "Abstract", page: paper.simulated ? 1 : undefined, text: paper.abstract });
  (paper.sections || []).forEach((s: any) => sections.push(s));
  const strip = (t: string) => t.replace(/\[\[P\d+\]\]/g, "").replace(/\s+/g, " ").trim();
  const findLabel = (sent: string) => {
    const s = strip(sent).replace(/\s*\([A-Z][^)]*\d{4}\)\.?$/, "").replace(/\.$/, "");
    const hit = evidence.find((e) => { const t = strip(e.text).replace(/\s*\([A-Z][^)]*\d{4}\)\.?$/, "").replace(/\.$/, ""); return t === s || t.startsWith(s) || s.startsWith(t); });
    return hit?.label as string | undefined;
  };
  return (
    <div className="space-y-5">
      {sections.length === 0 && <p className="text-sm text-muted">Only bibliographic metadata is available for this paper – no abstract or full text could be retrieved.</p>}
      {sections.map((s, i) => (
        <div key={i}>
          <div className="flex items-baseline justify-between mb-1.5"><h4 className="text-[13px] font-semibold">{s.name}</h4>{s.page && <span className="text-[11px] text-muted font-mono">page {s.page}</span>}</div>
          <p className="font-serif text-[14.5px] leading-[1.75] text-ink/90">
            {s.text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((sent, j) => {
              const label = findLabel(sent);
              const clean = sent.replace(/\[\[(P\d+)\]\]/g, "[ref]");
              return <React.Fragment key={j}>{label ? <mark className={`hl hl-${label}`} id={`ev-${label}`}>{clean}</mark> : clean}{" "}</React.Fragment>;
            })}
          </p>
        </div>
      ))}
      {!paper.simulated && <p className="text-xs text-muted border-t border-line pt-3">Full text is not openly available through the scholarly APIs; only the abstract was compared.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ Claim investigation panel */
const MISMATCH_ROWS: [string, string][] = [["citation_matched", "Citation matched to a real paper"], ["topic_match", "Paper topic matches the claim"], ["claim_supported", "Findings directly support the claim"], ["overgeneralized", "Conclusion is not overgeneralized"], ["contradictory", "No contradictory findings"]];

export function ClaimDetail({ claimId, onChanged, actions }: { claimId: number; onChanged?: () => void; actions?: (c: any, reload: () => void) => React.ReactNode }) {
  const { data: c, error, loading, reload } = useApi<any>(`/claims/${claimId}`, [claimId]);
  const [tab, setTab] = useState("evidence");
  if (loading) return <div className="p-5"><Loading rows={4} /></div>;
  if (error || !c) return <div className="p-5"><ErrorBox error={error} retry={reload} /></div>;
  const paper = c.paper;
  const ref = c.reference;
  const m = c.mismatch || {};
  const tabs = [
    { id: "evidence", label: "Evidence" },
    { id: "paper", label: "Source paper" },
    { id: "stats", label: "Statistics", count: c.numeric?.length || 0 },
    { id: "citation", label: "Citation check" },
    ...(c.outdated?.year ? [{ id: "outdated", label: "Research age" }] : []),
    ...(c.chain?.original_title ? [{ id: "chain", label: "Citation chain" }] : []),
  ];
  return (
    <div className="p-5 space-y-5">
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="label">Claim {c.idx}{c.student_name ? ` · ${c.student_name}` : ""} · {c.doc_title}</div>
          <VerdictBadge verdict={c.verdict} />
        </div>
        <p className="text-[15.5px] leading-relaxed font-medium">“{c.text}”</p>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Hash size={12} />Citation {c.citation_labels?.length ? c.citation_labels.map((l: string) => `[${l}]`).join(" ") : "none"}</span>
          <span className="inline-flex items-center gap-2">Confidence <Confidence value={c.confidence} /></span>
          <span className="inline-flex items-center gap-1">{c.engine === "llm" ? "Verified with LLM + rule checks" : "Rule-based verification"}</span>
        </div>
      </div>

      <div className={`rounded-xl p-4 border ${c.verdict === "SUPPORTED" ? "border-emerald-500/30 bg-emerald-500/5" : c.verdict === "NEEDS HUMAN REVIEW" ? "border-slate-500/30 bg-slate-500/5" : c.verdict === "PARTIALLY SUPPORTED" || c.verdict === "POTENTIALLY OUTDATED" ? "border-amber-500/30 bg-amber-500/5" : "border-red-500/30 bg-red-500/5"}`}>
        <div className="flex items-center gap-2 text-sm font-semibold mb-1"><Info size={15} />Why this verdict</div>
        <p className="text-sm leading-relaxed">{c.explanation}</p>
        {c.prof_note && <p className="text-sm mt-2 pt-2 border-t border-line"><span className="font-medium">Evaluator note: </span>{c.prof_note}{c.prof_verdict && <> · overridden to <VerdictBadge verdict={c.prof_verdict} size="sm" /></>}</p>}
      </div>

      {actions && <div className="flex flex-wrap gap-2">{actions(c, () => { reload(); onChanged?.(); })}</div>}

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "evidence" && (
        <div className="space-y-3 fade-in">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="card p-3.5"><div className="label mb-1.5">Student claim</div><p className="text-sm leading-relaxed">{c.text}</p></div>
            <div className="card p-3.5"><div className="label mb-1.5">Cited source</div><PaperCite paper={paper} compact />{paper && <div className="mt-1.5"><SimBadge paper={paper} /></div>}</div>
          </div>
          {c.evidence?.length ? c.evidence.map((e: any, i: number) => <EvidenceQuote key={i} e={e} />) :
            <div className="card p-4 text-sm text-muted">No evidence passage available. Source unavailable – manual verification required.</div>}
          <HighlightLegend />
        </div>
      )}
      {tab === "paper" && <div className="card p-5 fade-in"><div className="mb-4 pb-4 border-b border-line"><PaperCite paper={paper} /></div><HighlightedPaper paper={paper} evidence={c.evidence || []} /></div>}
      {tab === "stats" && (
        <div className="space-y-3 fade-in">
          {!c.numeric?.length && <div className="card p-4 text-sm text-muted">No numerical values were found in this claim.</div>}
          {c.numeric?.map((n: any, i: number) => (
            <div key={i} className="card p-4">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div><div className="label">Claimed value</div><div className="text-2xl font-semibold tabular-nums mt-1">{n.claimed}</div></div>
                <div><div className="label">Source value</div><div className="text-2xl font-semibold tabular-nums mt-1">{n.actual ?? "—"}</div></div>
                <div><div className="label">Difference</div><div className={`text-2xl font-semibold tabular-nums mt-1 ${n.match === false ? "text-red-600 dark:text-red-400" : n.match ? "text-emerald-600 dark:text-emerald-400" : "text-muted"}`}>{n.match ? "0" : n.difference_label ?? "n/a"}</div></div>
              </div>
              <div className={`text-sm font-medium mb-2 ${n.match === false ? "text-red-600 dark:text-red-400" : n.match ? "text-emerald-600 dark:text-emerald-400" : "text-muted"}`}>
                {n.match === false ? "Verdict: Contradictory numerical evidence" : n.match ? "Verdict: Value matches the source" : "Verdict: Figure not reported in the source"}
              </div>
              <EvidenceQuote e={{ text: n.passage.replace(/\[\[P\d+\]\]/g, ""), section: n.section, page: n.page, label: n.match === false ? "contradict" : n.match ? "support" : "none" }} />
            </div>
          ))}
        </div>
      )}
      {tab === "citation" && (
        <div className="space-y-3 fade-in">
          <div className="card divide-y divide-line">
            <div className="px-4 py-3 flex items-center justify-between"><span className="font-medium text-sm">Citation mismatch detector</span><span className="text-xs text-muted">{m.label}</span></div>
            {MISMATCH_ROWS.map(([k, label]) => {
              let v = m[k];
              if (k === "overgeneralized" || k === "contradictory") v = v === undefined || v === null ? null : !v;
              return (
                <div key={k} className="px-4 py-2.5 flex items-center justify-between text-sm">
                  <span>{label}</span>
                  {v === true ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check size={14} />Yes</span>
                    : v === false ? <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><X size={14} />No</span>
                      : <span className="text-muted">Not assessable</span>}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted">A paper is never marked valid just because its DOI or title exists – the findings themselves must support the claim.</p>
          {ref && <ReferenceCard r={ref} />}
        </div>
      )}
      {tab === "outdated" && <OutdatedPanel c={c} />}
      {tab === "chain" && <ChainPanel c={c} />}
    </div>
  );
}

export function ReferenceCard({ r }: { r: any }) {
  const ok = r.meta_status === "verified";
  const mismatch = r.meta_status === "mismatch";
  return (
    <div className={`card p-4 ${ok ? "" : mismatch ? "border-red-500/40" : "border-amber-500/40"}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="label">Reference [{r.label}]</span>
        {ok ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><ShieldCheck size={14} />Metadata verified</span>
          : mismatch ? <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400"><ShieldAlert size={14} />Confirmed metadata mismatch</span>
            : <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400"><CircleHelp size={14} />Could not be verified</span>}
      </div>
      <p className="text-[13px] font-mono leading-relaxed text-muted break-words">{r.raw}</p>
      {r.issues?.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {r.issues.map((i: any, k: number) => (
            <div key={k} className="text-sm flex gap-2">
              <AlertTriangle size={14} className={`mt-0.5 shrink-0 ${i.severity === "mismatch" ? "text-red-500" : "text-amber-500"}`} />
              <div>{i.message}{i.claimed && <div className="text-xs text-muted mt-0.5">Cited: <span className="font-mono">{i.claimed}</span> → Registered: <span className="font-mono">{i.actual}</span></div>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OutdatedPanel({ c }: { c: any }) {
  const o = c.outdated;
  return (
    <div className="space-y-3 fade-in">
      <div className={`rounded-xl p-4 border ${o.changed ? "border-orange-500/40 bg-orange-500/5" : "border-line bg-surface"}`}>
        <div className="flex items-center gap-2 font-semibold text-sm"><Clock size={15} />{o.changed ? "Potentially outdated evidence – newer research is available." : "Research age check"}</div>
        <p className="text-sm text-muted mt-1">{o.note}</p>
      </div>
      <div className="card p-4">
        <div className="relative pl-6 space-y-5">
          <div className="absolute left-2 top-1 bottom-1 w-px bg-line" />
          <div className="relative"><span className="absolute -left-[22px] top-1 size-3 rounded-full bg-slate-400 ring-4 ring-surface" />
            <div className="text-xs text-muted">{o.year} · cited source · {o.age} years old</div><div className="text-sm font-medium">{c.paper?.title}</div></div>
          {o.newer?.map((n: any, i: number) => (
            <div key={i} className="relative"><span className={`absolute -left-[22px] top-1 size-3 rounded-full ring-4 ring-surface ${n.differs ? "bg-orange-500" : "bg-emerald-500"}`} />
              <div className="text-xs text-muted">{n.year} · newer study · {n.differs ? "reports different findings" : "consistent"}</div>
              <div className="text-sm font-medium">{n.title}</div>
              {n.finding && <div className="mt-2"><EvidenceQuote e={{ text: n.finding, label: n.differs ? "contradict" : "support", section: "Newer evidence" }} /></div>}
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">An older paper is not automatically invalid. CiteVerify only raises an alert when newer related research reports different results.</p>
    </div>
  );
}

function ChainPanel({ c }: { c: any }) {
  const ch = c.chain;
  return (
    <div className="space-y-3 fade-in">
      <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
        {[{ t: "Student claim", b: c.text, tone: "border-accent/40" }, { t: "Cited paper (secondary)", b: c.paper?.title, tone: "border-line" }, { t: "Original research", b: ch.original_title, tone: ch.traceable ? "border-emerald-500/50" : "border-red-500/50" }].map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div className="grid place-items-center shrink-0"><ArrowRight size={16} className={i === 2 && !ch.traceable ? "text-red-500" : "text-muted"} /></div>}
            <div className={`card p-3 min-w-[180px] flex-1 border-2 ${s.tone}`}><div className="label mb-1">{s.t}</div><div className="text-[13px] leading-snug">{s.b}</div></div>
          </React.Fragment>
        ))}
      </div>
      <div className={`rounded-xl p-4 border ${ch.traceable ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
        <div className="font-semibold text-sm flex items-center gap-2"><GitBranch size={15} />{ch.traceable ? "Claim traced back to original evidence" : "Suspicious chain: claim cannot be traced to the original research evidence"}</div>
        <p className="text-sm mt-1">{ch.original_explanation}</p>
      </div>
      {ch.original_evidence?.map((e: any, i: number) => <EvidenceQuote key={i} e={e} />)}
    </div>
  );
}

/* ------------------------------------------------------------------ Citation network */
const EDGE_STYLE: Record<string, { stroke: string; dash?: string; label?: string; animated?: boolean }> = {
  support: { stroke: "#16a34a", label: "supports" },
  partial: { stroke: "#d97706", label: "partial" },
  contradict: { stroke: "#dc2626", label: "contradicts" },
  review: { stroke: "#64748b", dash: "5 4", label: "needs review" },
  cites: { stroke: "#8b5cf6", dash: "2 4", label: "cites" },
  chain_broken: { stroke: "#dc2626", dash: "6 4", label: "untraceable", animated: true },
  newer: { stroke: "#ea580c", dash: "4 4", label: "newer evidence" },
  authored: { stroke: "#94a3b8" },
};
function GNode({ data }: { data: any }) {
  const t = data.kind as string;
  const dim = data.dim ? "opacity-25" : "";
  const sel = data.selected ? "ring-2 ring-accent" : "";
  if (t === "student") return (
    <div className={`flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 shadow-sm ${dim} ${sel}`}>
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <span className="size-6 rounded-full bg-accent text-white grid place-items-center text-[11px] font-semibold">{data.label.split(" ").map((x: string) => x[0]).join("").slice(0, 2)}</span>
      <span className="text-xs font-medium">{data.label}</span>
    </div>
  );
  if (t === "claim") {
    const m = VERDICT_META[data.verdict] || VERDICT_META["NEEDS HUMAN REVIEW"];
    return (
      <div className={`w-[230px] rounded-lg border bg-surface px-2.5 py-2 shadow-sm ${dim} ${sel}`} style={{ borderColor: m.color, borderLeftWidth: 4 }}>
        <Handle type="target" position={Position.Left} className="!opacity-0" /><Handle type="source" position={Position.Right} className="!opacity-0" />
        <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: m.color }}>{m.short}</div>
        <div className="text-[11px] leading-snug line-clamp-2">{data.label}</div>
      </div>
    );
  }
  const colors: Record<string, string> = { paper: "#2563eb", cited: "#8b5cf6", newer: "#ea580c", missing: "#64748b" };
  return (
    <div className={`w-[220px] rounded-lg border-2 bg-surface px-2.5 py-2 shadow-sm ${dim} ${sel}`} style={{ borderColor: colors[t] || "#2563eb" }}>
      <Handle type="target" position={Position.Left} className="!opacity-0" /><Handle type="source" position={Position.Right} className="!opacity-0" />
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide" style={{ color: colors[t] }}>
        <span>{t === "newer" ? "Newer study" : t === "cited" ? "Cited by paper" : t === "missing" ? "No source" : "Research paper"}{data.year ? " · " + data.year : ""}</span>
        {data.students > 1 && <span className="rounded bg-red-500/15 text-red-600 dark:text-red-400 px-1">{data.students} students</span>}
      </div>
      <div className="text-[11px] leading-snug line-clamp-2 font-serif">{data.label}</div>
    </div>
  );
}
const nodeTypes = { g: GNode };

export function CitationGraph({ graph, height = 620, onSelect }: { graph: { nodes: any[]; edges: any[] }; height?: number; onSelect?: (n: any, related: any[]) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const layout = useMemo(() => {
    const cols: Record<string, number> = { student: 0, claim: 260, paper: 640, missing: 640, cited: 1000, newer: 1000 };
    const byId: Record<string, any> = {};
    graph.nodes.forEach((n) => (byId[n.id] = n));
    const pos: Record<string, { x: number; y: number }> = {};
    const claims = graph.nodes.filter((n) => n.type === "claim");
    const studentOf: Record<string, string> = {};
    graph.edges.filter((e) => e.kind === "authored").forEach((e) => (studentOf[e.target] = e.source));
    claims.sort((a, b) => (studentOf[a.id] || "").localeCompare(studentOf[b.id] || ""));
    claims.forEach((c, i) => (pos[c.id] = { x: cols.claim, y: i * 74 }));
    const place = (types: string[], parentsOf: (id: string) => string[]) => {
      const items = graph.nodes.filter((n) => types.includes(n.type)).map((n) => {
        const ps = parentsOf(n.id).filter((p) => pos[p]);
        return { n, y: ps.length ? ps.reduce((a, p) => a + pos[p].y, 0) / ps.length : 0 };
      }).sort((a, b) => a.y - b.y);
      let last = -Infinity;
      items.forEach(({ n, y }) => { const yy = Math.max(y, last + 78); pos[n.id] = { x: cols[n.type], y: yy }; last = yy; });
    };
    const parents = (id: string) => graph.edges.filter((e) => e.target === id).map((e) => e.source);
    const children = (id: string) => graph.edges.filter((e) => e.source === id).map((e) => e.target);
    place(["paper", "missing"], parents);
    place(["cited", "newer"], parents);
    place(["student"], children);
    return pos;
  }, [graph]);
  const related = useMemo(() => {
    if (!selected) return null;
    const s = new Set<string>([selected]);
    // walk both directions two hops for context
    for (let i = 0; i < 2; i++) graph.edges.forEach((e) => { if (s.has(e.source)) s.add(e.target); if (s.has(e.target)) s.add(e.source); });
    return s;
  }, [selected, graph]);
  const nodes: Node[] = graph.nodes.map((n) => ({
    id: n.id, type: "g", position: layout[n.id] || { x: 0, y: 0 },
    data: { ...n.data, label: n.label, kind: n.type, dim: related ? !related.has(n.id) : false, selected: selected === n.id },
  }));
  const edges: Edge[] = graph.edges.map((e, i) => {
    const st = EDGE_STYLE[e.kind] || EDGE_STYLE.review;
    const on = !related || (related.has(e.source) && related.has(e.target));
    return {
      id: "e" + i, source: e.source, target: e.target, animated: st.animated,
      style: { stroke: st.stroke, strokeWidth: e.kind === "authored" ? 1 : 1.8, strokeDasharray: st.dash, opacity: on ? 1 : 0.1 },
      label: selected && on && e.kind !== "authored" ? st.label : undefined, labelStyle: { fontSize: 10, fill: st.stroke },
      labelBgStyle: { fill: "var(--surface)" },
    };
  });
  return (
    <div className="card overflow-hidden" style={{ height }}>
      <ReactFlow style={{ background: "transparent" }} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ minZoom: graph.nodes.length > 30 ? 0.55 : 0.3, maxZoom: 1 }} minZoom={0.15} nodesDraggable proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => {
          const id = selected === n.id ? null : n.id;
          setSelected(id);
          const raw = graph.nodes.find((x) => x.id === n.id);
          const rel = graph.edges.filter((e) => e.source === n.id || e.target === n.id).map((e) => ({ edge: e, node: graph.nodes.find((x) => x.id === (e.source === n.id ? e.target : e.source)) }));
          onSelect?.(id ? raw : null, rel);
        }}
        onPaneClick={() => { setSelected(null); onSelect?.(null, []); }}>
        <Background gap={22} size={1} color="var(--border)" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.12)" style={{ background: "var(--surface)" }} nodeColor={(n: any) => n.data?.kind === "claim" ? (VERDICT_META[n.data.verdict]?.color || "#64748b") : n.data?.kind === "student" ? "#7c3aed" : "#2563eb"} />
      </ReactFlow>
    </div>
  );
}
export function GraphLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {Object.entries(EDGE_STYLE).filter(([k]) => k !== "authored").map(([k, s]) => (
        <span key={k} className="inline-flex items-center gap-1.5"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={s.stroke} strokeWidth="2" strokeDasharray={s.dash} /></svg>{s.label}</span>
      ))}
    </div>
  );
}
export function NodeInspector({ node, related, onOpenClaim }: { node: any; related: any[]; onOpenClaim?: (id: number) => void }) {
  if (!node) return <div className="card p-4 text-sm text-muted"><Link2 size={16} className="mb-2 text-accent" />Click any node to inspect its relationships. Connected claims, papers and evidence links are highlighted.</div>;
  return (
    <div className="card p-4 space-y-3 fade-in">
      <div className="label">{node.type === "claim" ? "Claim" : node.type === "student" ? "Student" : "Research paper"}</div>
      <div className={node.type === "claim" ? "text-sm" : "font-serif font-medium"}>{node.label}</div>
      {node.type === "claim" && <><VerdictBadge verdict={node.data.verdict} /><div className="text-xs text-muted">{node.data.student ? node.data.student + " · " : ""}{node.data.doc}</div>
        {onOpenClaim && <button className="btn btn-primary btn-sm" onClick={() => onOpenClaim(node.data.claim_id)}>Open evidence<ChevronRight size={14} /></button>}</>}
      {node.data?.students > 1 && <div className="rounded-lg bg-red-500/10 text-red-700 dark:text-red-400 text-xs p-2.5">Pattern: this paper is cited by {node.data.students} different students.</div>}
      <div>
        <div className="label mb-1.5">Connections ({related.length})</div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {related.map((r, i) => (
            <div key={i} className="text-xs flex items-start gap-2">
              <span className="mt-1 size-2 rounded-full shrink-0" style={{ background: EDGE_STYLE[r.edge.kind]?.stroke }} />
              <span><span className="text-muted">{EDGE_STYLE[r.edge.kind]?.label || r.edge.kind}: </span>{r.node?.label?.slice(0, 90)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Revision comparison */
export function Comparison({ data }: { data: any }) {
  const s = data.stats;
  const [filter, setFilter] = useState("all");
  const rows = data.rows.filter((r: any) => filter === "all" || (filter === "changed" ? r.type !== "unchanged" : r.type === filter));
  const tone: Record<string, string> = { removed: "bg-red-500/10 text-red-700 dark:text-red-400", modified: "bg-amber-500/10 text-amber-700 dark:text-amber-400", new: "bg-sky-500/10 text-sky-700 dark:text-sky-400", unchanged: "bg-slate-500/10 text-muted" };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Claims corrected" value={s.claims_corrected} icon={CheckCircle2} tone="bg-emerald-500/10 text-emerald-600" />
        <Stat label="Citations replaced" value={s.citations_replaced} icon={Link2} />
        <Stat label="New evidence added" value={s.new_evidence} icon={BookOpen} />
        <Stat label="Still unresolved" value={s.unsupported_remaining} icon={AlertTriangle} tone="bg-amber-500/10 text-amber-600" />
        <Stat label="New issues" value={s.new_issues} icon={XCircle} tone="bg-red-500/10 text-red-600" />
        <Stat label="Reliability" value={<span>{s.reliability_before}% → {s.reliability_after}%</span>} hint={(s.improvement >= 0 ? "+" : "") + s.improvement + " points"} icon={Sigma} />
      </div>
      <div className="card p-4 text-sm leading-relaxed">
        <span className="font-semibold">Research improvement summary. </span>
        Version {data.new.version} corrects {s.claims_corrected} claim{s.claims_corrected === 1 ? "" : "s"}, replaces {s.citations_replaced} citation{s.citations_replaced === 1 ? "" : "s"} and
        removes {s.removed} claim{s.removed === 1 ? "" : "s"}. {s.unsupported_remaining} claim{s.unsupported_remaining === 1 ? " still needs" : "s still need"} attention
        {s.new_issues ? `, and ${s.new_issues} new issue${s.new_issues === 1 ? " was" : "s were"} introduced` : ""}. Every revised claim was re-verified against its source – a reworded claim is not assumed correct.
      </div>
      <Tabs value={filter} onChange={setFilter} tabs={[{ id: "all", label: "All", count: data.rows.length }, { id: "changed", label: "Changed" }, { id: "modified", label: "Modified" }, { id: "new", label: "New" }, { id: "removed", label: "Removed" }]} />
      <div className="card overflow-hidden">
        <div className="grid grid-cols-2 border-b border-line bg-surface2 text-xs font-medium text-muted">
          <div className="px-4 py-2.5">Original · version {data.old.version}</div><div className="px-4 py-2.5 border-l border-line">Revised · version {data.new.version}</div>
        </div>
        {rows.map((r: any, i: number) => (
          <div key={i} className="grid grid-cols-2 border-b border-line last:border-0">
            <div className={`px-4 py-3 ${r.type === "removed" ? "bg-red-500/5" : ""}`}>
              {r.old ? <><div className="flex items-center gap-2 mb-1"><VerdictBadge verdict={r.old.verdict} size="sm" /></div><p className={`text-sm ${r.type === "removed" ? "line-through decoration-red-500/60" : ""}`}>{r.old.text}</p></> : <span className="text-xs text-muted italic">— not present —</span>}
            </div>
            <div className={`px-4 py-3 border-l border-line ${r.type === "new" ? "bg-sky-500/5" : r.improved ? "bg-emerald-500/5" : ""}`}>
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${tone[r.type]}`}>{r.type}</span>
                {r.new && <VerdictBadge verdict={r.new.verdict} size="sm" />}
                {r.citation_replaced && <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase bg-violet-500/10 text-violet-700 dark:text-violet-300">citation replaced</span>}
                {r.improved && <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">▲ improved</span>}
                {r.regressed && <span className="text-[11px] text-red-600 dark:text-red-400 font-medium">▼ regressed</span>}
                {r.type === "modified" && !r.improved && !r.regressed && r.new?.verdict !== "SUPPORTED" && <span className="text-[11px] text-amber-600 font-medium">reworded, still unresolved</span>}
              </div>
              {r.new ? <p className="text-sm">{r.new.text}</p> : <span className="text-xs text-muted italic">— removed in revision —</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Misc */
export function Spinner({ size = 16 }: { size?: number }) { return <Loader2 size={size} className="animate-spin" />; }
export function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => { if (ms === null) return; const t = setInterval(() => ref.current(), ms); return () => clearInterval(t); }, [ms]);
}
export function DemoNotice({ system }: { system: any }) {
  if (!system) return null;
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
      <Info size={14} className="shrink-0 mt-0.5" />
      <span>Demo papers marked <b>Simulated demo paper</b> are fictional data for this demo. References to real DOIs are checked live via {system.live_lookup ? "Crossref, Semantic Scholar and OpenAlex" : "— live lookup is disabled —"}.
        Claim analysis: {system.llm ? `Claude (${system.llm_model}) + deterministic checks` : "deterministic rule engine (set ANTHROPIC_API_KEY to add LLM reasoning)"}.</span>
    </div>
  );
}

/* ------------------------------------------------------------------ Toasts */
export function toast(message: string, tone: "ok" | "error" = "ok") { window.dispatchEvent(new CustomEvent("cv-toast", { detail: { message, tone } })); }
export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string; tone: string }[]>([]);
  useEffect(() => {
    const on = (e: any) => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, ...e.detail }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3800);
    };
    window.addEventListener("cv-toast", on);
    return () => window.removeEventListener("cv-toast", on);
  }, []);
  return (
    <div className="fixed bottom-5 right-5 z-[80] space-y-2">
      {items.map((t) => (
        <div key={t.id} className={`fade-in card shadow-lg px-4 py-3 text-sm flex items-center gap-2 ${t.tone === "error" ? "border-red-500/40" : ""}`}>
          {t.tone === "error" ? <AlertTriangle size={15} className="text-red-500" /> : <CheckCircle2 size={15} className="text-emerald-500" />}{t.message}
        </div>
      ))}
    </div>
  );
}

/* ======================================================================
   STUDENT / RESEARCHER PORTAL
   ====================================================================== */
/* Student / Researcher portal pages. */
/* ------------------------------------------------------------------ shared student widgets */
export function VerdictDonut({ counts, size = 190, onSelect }: { counts: Record<string, number>; size?: number; onSelect?: (verdict: string) => void }) {
  const data = VERDICTS.map((v) => ({ name: VERDICT_META[v].label, value: counts?.[v] || 0, color: VERDICT_META[v].color })).filter((d) => d.value);
  const total = data.reduce((a, b) => a + b.value, 0);
  if (!total) return <div className="text-sm text-muted py-10 text-center">No claims analysed yet.</div>;
  return (
    <div className="flex items-center gap-6 flex-wrap">
      <div style={{ width: size, height: size }} className="relative">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={size * 0.32} outerRadius={size * 0.48} paddingAngle={2} stroke="none">
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center pointer-events-none"><div className="text-center"><div className="text-2xl font-semibold">{total}</div><div className="text-[11px] text-muted">claims</div></div></div>
      </div>
      <div className="space-y-1.5 text-sm flex-1 min-w-[180px]">
        {VERDICTS.map((v) => onSelect ? (
          <button key={v} type="button" onClick={() => onSelect(v)} title={`Open ${VERDICT_META[v].label.toLowerCase()} claims`}
            className="group w-full flex items-center justify-between gap-3 rounded-md -mx-2 px-2 py-0.5 hover:bg-accentsoft transition-colors text-left">
            <span className="inline-flex items-center gap-2"><span className={`size-2.5 rounded-sm ${VERDICT_META[v].dot}`} />{VERDICT_META[v].label}</span>
            <span className="inline-flex items-center gap-1 tabular-nums text-muted">{counts?.[v] || 0}<ChevronRight size={13} className="opacity-0 group-hover:opacity-100 text-accent" /></span>
          </button>
        ) : (
          <div key={v} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2"><span className={`size-2.5 rounded-sm ${VERDICT_META[v].dot}`} />{VERDICT_META[v].label}</span>
            <span className="tabular-nums text-muted">{counts?.[v] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReliabilityGauge({ value, label = "Evidence reliability" }: { value: number; label?: string }) {
  const color = value >= 75 ? "#16a34a" : value >= 50 ? "#d97706" : "#dc2626";
  return (
    <div className="flex items-center gap-4">
      <div className="size-[120px] relative">
        <ResponsiveContainer>
          <RadialBarChart innerRadius="78%" outerRadius="100%" data={[{ v: value }]} startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="v" cornerRadius={8} fill={color} background={{ fill: "var(--surface-2)" }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center"><div className="text-2xl font-semibold tabular-nums">{value}%</div></div>
      </div>
      <div><div className="font-medium">{label}</div><p className="text-xs text-muted max-w-[220px] mt-1">Share of claims backed by their cited evidence (partial and outdated count half).</p></div>
    </div>
  );
}

function ClaimsList({ claims, onOpen, showDoc, initialFilter }: { claims: any[]; onOpen: (id: number) => void; showDoc?: boolean; initialFilter?: string }) {
  const [filter, setFilter] = useState(initialFilter || "ALL");
  const [q, setQ] = useState("");
  const counts = useMemo(() => { const c: Record<string, number> = {}; claims.forEach((x) => (c[x.verdict] = (c[x.verdict] || 0) + 1)); return c; }, [claims]);
  const verdictSet = filter.split(",");
  const rows = claims.filter((c) => (filter === "ALL" || verdictSet.includes(c.verdict)) && (!q || (c.text + " " + (c.paper?.title || "") + " " + (c.doc_title || "")).toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-4">
      {verdictSet.length > 1 && (
        <div className="rounded-lg border border-accent/30 bg-accentsoft px-3.5 py-2 text-sm flex flex-wrap items-center gap-2">
          <span className="text-muted">Showing</span>{verdictSet.map((v) => <VerdictBadge key={v} verdict={v} size="sm" />)}
          <button className="ml-auto text-accent text-xs hover:underline" onClick={() => setFilter("ALL")}>Clear filters</button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3"><VerdictFilter value={filter} onChange={setFilter} counts={counts} /><SearchBox value={q} onChange={setQ} placeholder="Search claims or papers…" /></div>
      <div className="space-y-2">
        {rows.length === 0 && <div className="card"><Empty icon={FileSearch} title="No claims match" body="Try a different filter or search term." /></div>}
        {rows.map((c) => (
          <button key={c.id} onClick={() => onOpen(c.id)} className="card w-full text-left p-4 hover:border-accent/60 transition-colors group">
            <div className="flex items-start gap-4">
              <div className="text-xs text-muted font-mono pt-0.5 w-6 shrink-0">#{c.idx}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[14.5px] leading-relaxed">{c.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
                  {showDoc && <span className="inline-flex items-center gap-1"><FileText size={12} />{c.doc_title}</span>}
                  <span className="inline-flex items-center gap-1 min-w-0"><BookOpen size={12} /><span className="truncate max-w-[380px]">{c.paper ? `${c.paper.title} (${c.paper.year || "n.d."})` : c.citation_labels?.length ? "Source unavailable" : "No citation"}</span></span>
                  {c.mismatch?.label && <span>{c.mismatch.label}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0"><VerdictBadge verdict={c.verdict} /><Confidence value={c.confidence} compact /></div>
              <ChevronRight size={16} className="text-muted mt-1 group-hover:text-accent shrink-0" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StudentClaimDrawer({ claimId, onClose, onChanged }: { claimId: number | null; onClose: () => void; onChanged?: () => void }) {
  const { navigate } = useRouter();
  return (
    <Drawer open={!!claimId} onClose={onClose} title="Evidence investigation">
      {claimId && <ClaimDetail claimId={claimId} onChanged={onChanged} actions={(c) => (
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/student/evidence?claim=${c.id}`)}><BookOpen size={14} />Open in Evidence Viewer</button>
          {c.verdict !== "SUPPORTED" && <button className="btn btn-primary btn-sm" onClick={() => navigate(`/student/suggestions?claim=${c.id}`)}><Lightbulb size={14} />Find better citations</button>}
        </>
      )} />}
    </Drawer>
  );
}

/* ------------------------------------------------------------------ Overview */
export function StudentOverview() {
  const { data, error, loading, reload } = useApi<any>("/student/overview");
  const { data: fb } = useApi<any[]>("/feedback");
  const { data: sys } = useSystem();
  const { navigate } = useRouter();
  if (loading) return <Loading rows={5} />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;
  const c = data.counts;
  const openFb = (fb || []).filter((f) => f.status === "sent");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Research workspace" title="Overview" subtitle="Your research deserves evidence. Here is how well your claims are backed by their sources."
        actions={<button className="btn btn-primary" onClick={() => navigate("/student/verify")}><Upload size={15} />New verification</button>} />
      {openFb.length > 0 && (
        <button onClick={() => navigate("/student/feedback")} className="w-full text-left rounded-xl border border-accent/40 bg-accentsoft p-4 flex items-center gap-3 hover:border-accent">
          <MessageSquare size={18} className="text-accent" />
          <div className="flex-1"><div className="text-sm font-medium">You have {openFb.length} open feedback item{openFb.length > 1 ? "s" : ""} from your professor</div><div className="text-xs text-muted">Review the comments and upload a revised version.</div></div>
          <ChevronRight size={16} />
        </button>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Documents analysed" value={data.documents} icon={FolderOpen} title="Open my documents" onClick={() => navigate("/student/documents")} />
        <Stat label="Claims extracted" value={data.claims} icon={FileSearch} title="Open all claims" onClick={() => navigate("/student/claims")} />
        <Stat label="Supported" value={c["SUPPORTED"]} icon={CheckCircle2} tone="bg-emerald-500/10 text-emerald-600" title="Open supported claims" onClick={() => navigate("/student/claims?verdict=SUPPORTED")} />
        <Stat label="Unsupported / contradictory" value={c["UNSUPPORTED"] + c["CONTRADICTORY"]} icon={XCircle} tone="bg-red-500/10 text-red-600" title="Open unsupported and contradictory claims" onClick={() => navigate("/student/claims?verdict=UNSUPPORTED,CONTRADICTORY")} />
        <Stat label="Partially supported" value={c["PARTIALLY SUPPORTED"]} icon={AlertTriangle} tone="bg-amber-500/10 text-amber-600" title="Open partially supported claims" onClick={() => navigate(`/student/claims?verdict=${encodeURIComponent("PARTIALLY SUPPORTED")}`)} />
        <Stat label="Need attention" value={data.attention} hint="documents" icon={ShieldAlert} tone="bg-orange-500/10 text-orange-600" title="Open documents that need attention" onClick={() => navigate("/student/documents?attention=1")} />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4"><div className="font-medium">Verification results</div><span className="text-xs text-muted">All documents</span></div>
          <VerdictDonut counts={c} onSelect={(v) => navigate(`/student/claims?verdict=${encodeURIComponent(v)}`)} />
        </div>
        <div className="card p-5 flex flex-col justify-center gap-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {([["Outdated alerts", c["POTENTIALLY OUTDATED"], "/student/outdated"], ["Suspicious refs", data.suspicious_refs, "/student/claims?view=refs"],
              ["Needs review", c["NEEDS HUMAN REVIEW"], `/student/claims?verdict=${encodeURIComponent("NEEDS HUMAN REVIEW")}`], ["Open feedback", data.open_feedback, "/student/feedback"]] as [string, number, string][]).map(([label, val, to]) => (
              <button key={label} type="button" onClick={() => navigate(to)} title={`Open ${label.toLowerCase()}`}
                className="group text-left rounded-lg bg-surface2 p-3 border border-transparent hover:border-accent/50 hover:bg-accentsoft transition-colors">
                <div className="text-xs text-muted flex items-center justify-between">{label}<ChevronRight size={13} className="opacity-0 group-hover:opacity-100 text-accent" /></div>
                <div className="text-lg font-semibold">{val}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between"><div className="font-medium">Recent verification activity</div><Link to="/student/documents" className="text-sm text-accent hover:underline">All documents</Link></div>
        {data.recent.length === 0 ? <Empty icon={Upload} title="No documents yet" body="Upload a PDF or DOCX, or try the sample document, to see CiteVerify in action." action={<button className="btn btn-primary" onClick={() => navigate("/student/verify")}>Start a verification</button>} /> : (
          <div className="divide-y divide-line">
            {data.recent.map((d: any) => (
              <button key={d.id} onClick={() => navigate(d.status === "processing" ? `/student/verify?doc=${d.id}` : `/student/documents/${d.id}`)} className="w-full text-left px-5 py-3.5 flex items-center gap-4 hover:bg-surface2">
                <div className="size-9 rounded-lg bg-accentsoft text-accent grid place-items-center shrink-0"><FileText size={16} /></div>
                <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{d.title}</div><div className="text-xs text-muted">v{d.version} · {d.summary?.claims ?? "–"} claims · {fmtAgo(d.created_at)}</div></div>
                {d.summary?.reliability !== undefined && <div className="text-sm tabular-nums text-muted hidden sm:block">{d.summary.reliability}% reliable</div>}
                <RiskPill risk={d.summary?.risk} /><StatusPill status={d.status} />
              </button>
            ))}
          </div>
        )}
      </div>
      <DemoNotice system={sys} />
    </div>
  );
}

/* ------------------------------------------------------------------ New verification workflow */
const STEPS = ["Upload document", "Document analysis", "Claim verification", "Verification report"];

export function NewVerification() {
  const { query, navigate } = useRouter();
  const docId = query.get("doc");
  const revise = query.get("revise");
  const [doc, setDoc] = useState<any>(null);
  const [step, setStep] = useState(0);
  const [loadErr, setLoadErr] = useState("");

  const poll = async () => {
    if (!docId) return;
    try {
      const d = await api(`/documents/${docId}`);
      setDoc(d);
      if (d.document.status === "processing") setStep(1);
      else if (step < 2) setStep(d.document.status === "failed" ? 1 : 2);
    } catch (e: any) { setLoadErr(e.message); }
  };
  useEffect(() => { if (docId) { setStep(1); poll(); } else { setDoc(null); setStep(0); } /* eslint-disable-next-line */ }, [docId]);
  useInterval(poll, docId && (!doc || doc.document.status === "processing") ? 700 : null);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Verification workflow" title={revise ? "Upload a revised version" : "New verification"} subtitle="Upload a document. CiteVerify extracts every claim, maps it to its citation, retrieves the original paper and checks the evidence." />
      <div className="card p-3 flex flex-wrap gap-1">
        {STEPS.map((s, i) => {
          const done = i < step, active = i === step;
          const clickable = docId && i >= 2 && doc && doc.document.status !== "processing" && doc.document.status !== "failed";
          return (
            <button key={s} disabled={!clickable} onClick={() => clickable && setStep(i)} className={`flex-1 min-w-[150px] flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-left ${active ? "bg-accentsoft" : ""}`}>
              <span className={`size-6 rounded-full grid place-items-center text-xs font-semibold shrink-0 ${done ? "bg-emerald-500 text-white" : active ? "bg-accent text-white" : "bg-surface2 text-muted"}`}>{done ? <Check size={13} /> : i + 1}</span>
              <span className={active ? "font-medium" : "text-muted"}>{s}</span>
            </button>
          );
        })}
      </div>
      {loadErr && <ErrorBox error={loadErr} />}
      {step === 0 && <UploadStep reviseId={revise ? Number(revise) : null} onCreated={(d) => navigate(`/student/verify?doc=${d.id}`)} />}
      {step === 1 && doc && <AnalysisStep doc={doc.document} onRetry={async () => { await api(`/documents/${doc.document.id}/reanalyze`, { method: "POST" }); poll(); }} />}
      {step === 1 && !doc && <Loading />}
      {step === 2 && doc && (
        <div className="space-y-4">
          <DocHeaderStrip doc={doc} />
          <AccuracySummary data={doc} />
          <ClaimsStep docId={doc.document.id} />
          <div className="flex justify-end"><button className="btn btn-primary" onClick={() => setStep(3)}>Continue to report<ArrowRight size={15} /></button></div>
        </div>
      )}
      {step === 3 && doc && <DocReport data={doc} onChanged={poll} />}
    </div>
  );
}

function UploadStep({ onCreated, reviseId }: { onCreated: (d: any) => void; reviseId: number | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const parent = reviseId ? String(reviseId) : "";
  const input = useRef<HTMLInputElement>(null);

  const pick = (f?: File | null) => {
    setError("");
    if (!f) return;
    const ok = /\.(pdf|docx)$/i.test(f.name);
    if (!ok) { setError("Unsupported file type. Please upload a PDF or DOCX document."); return; }
    if (f.size > 15 * 1024 * 1024) { setError("File is larger than 15 MB."); return; }
    setFile(f);
  };
  const start = async () => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    if (parent) form.append("parent_id", parent);
    setProgress(0); setError("");
    try { onCreated(await uploadWithProgress(form, setProgress)); } catch (e: any) { setError(e.message); setProgress(null); }
  };
  const sample = async (variant: string) => {
    setError("");
    try { onCreated(await api(`/documents/sample?variant=${variant}${parent ? `&parent_id=${parent}` : ""}`, { method: "POST" })); } catch (e: any) { setError(e.message); }
  };
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
          onClick={() => !file && input.current?.click()}
          className={`rounded-2xl border-2 border-dashed p-10 sm:py-16 min-h-[380px] flex flex-col justify-center text-center transition-colors ${file ? "border-line bg-surface" : "cursor-pointer"} ${drag ? "border-accent bg-accentsoft" : "border-line bg-surface hover:border-accent/60"}`}>
          <input ref={input} type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          {!file ? (
            <>
              <div className="size-[72px] rounded-2xl bg-accentsoft text-accent grid place-items-center mx-auto mb-5"><FileUp size={34} /></div>
              <div className="font-semibold text-lg">Drag & drop your research document</div>
              <div className="text-[15px] text-muted mt-1.5">or <span className="text-accent font-medium">browse files</span> · PDF or DOCX · up to 15 MB</div>
            </>
          ) : (
            <div className="text-left">
              <div className="flex items-center gap-4">
                <div className="size-12 rounded-xl bg-accentsoft text-accent grid place-items-center shrink-0"><FileText size={22} /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{file.name}</div>
                  <div className="text-xs text-muted mt-0.5">{fmtSize(file.size)} · {file.name.split(".").pop()?.toUpperCase()} document</div>
                </div>
                {progress === null && <>
                  <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); input.current?.click(); }}><RefreshCw size={14} />Replace</button>
                  <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); setFile(null); }}><X size={14} />Remove</button>
                </>}
              </div>
              {progress !== null && (
                <div className="mt-4"><div className="flex justify-between text-xs text-muted mb-1"><span>{progress < 100 ? "Uploading…" : "Upload complete – starting analysis"}</span><span>{progress}%</span></div>
                  <div className="h-1.5 rounded-full bg-surface2 overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: progress + "%" }} /></div></div>
              )}
            </div>
          )}
        </div>
        {error && <ErrorBox error={error} />}
        <div className="flex justify-end">
          <button className="btn btn-primary" disabled={!file || progress !== null} onClick={start}>{progress !== null ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}Start verification</button>
        </div>
      </div>
      <div className="space-y-4">
        <div className="card p-5">
          <div className="font-medium flex items-center gap-2"><Sparkles size={16} className="text-accent" />Try a sample document</div>
          <p className="text-sm text-muted mt-1.5">Three versions of the same AI-in-healthcare report (9 cited claims each), showing how CiteVerify scores accurate and inaccurate research.</p>
          {parent ? (
            <div className="flex flex-col gap-2 mt-4">
              <button className="btn btn-primary" onClick={() => sample("revised")}>Use revised sample document</button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {[
                { v: "accurate", n: 1, name: "High-accuracy original", tag: "Excellent · ~100%", tagCls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                  desc: "Every claim is stated exactly as its cited paper reports it." },
                { v: "story", n: 2, name: "Movie-story version", tag: "Poor · ~6%", tagCls: "bg-red-500/10 text-red-700 dark:text-red-400",
                  desc: "The same research told as a film story – with inflated numbers, absolute wording and citations to the wrong papers." },
                { v: "onechange", n: 3, name: "Good accuracy, one claim wrong", tag: "Good · ~89%", tagCls: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
                  desc: "Identical to version 1, except one claim says 99% where the paper reports 90.3%." },
              ].map((x) => (
                <div key={x.v} className="rounded-xl border border-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold"><span className="text-muted mr-1">{x.n}.</span>{x.name}</div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${x.tagCls}`}>{x.tag}</span>
                  </div>
                  <div className="text-xs text-muted mt-1">{x.desc}</div>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    <button className="btn btn-primary btn-sm" onClick={() => sample(x.v)}>Analyse this document</button>
                    <a className="btn btn-ghost btn-sm" href={`/api/demo/sample-file?variant=${x.v}`}><Download size={13} />Download DOCX</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card p-5 text-sm space-y-2">
          <div className="font-medium mb-1">What gets extracted</div>
          {["Document text (PyMuPDF / python-docx)", "Factual & statistical claims", "In-text citations – [1], [2-4], (Author, 2020)", "Reference list with DOIs", "Statistical statements"].map((x) => (
            <div key={x} className="flex items-center gap-2 text-muted"><Check size={14} className="text-emerald-500" />{x}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnalysisStep({ doc, onRetry }: { doc: any; onRetry: () => void }) {
  const { navigate } = useRouter();
  const stages: string[] = doc.stages;
  return (
    <div className="card p-6 sm:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="size-10 rounded-xl bg-accentsoft text-accent grid place-items-center"><FileText size={18} /></div>
        <div className="min-w-0"><div className="font-medium truncate">{doc.title}</div><div className="text-xs text-muted">{doc.filename} · {fmtSize(doc.size)} · {doc.filetype}</div></div>
      </div>
      {doc.status === "failed" ? (
        <div className="space-y-4">
          <ErrorBox error={doc.error || "Analysis failed."} />
          <div className="flex gap-2"><button className="btn btn-primary" onClick={onRetry}><RefreshCw size={14} />Retry analysis</button><button className="btn btn-ghost" onClick={() => navigate("/student/verify")}>Upload another file</button></div>
        </div>
      ) : (
        <div className="space-y-1">
          {stages.map((s, i) => {
            const idx = i + 1;
            const done = doc.stage > idx || (doc.stage === idx && idx === stages.length && doc.status !== "processing");
            const active = doc.stage === idx && !done;
            return (
              <div key={s} className={`flex items-center gap-3.5 rounded-lg px-3 py-3 transition-colors ${active ? "bg-accentsoft" : ""}`}>
                <span className={`size-7 rounded-full grid place-items-center shrink-0 transition-colors ${done ? "bg-emerald-500 text-white" : active ? "bg-accent text-white" : "bg-surface2 text-muted"}`}>
                  {done ? <Check size={14} /> : active ? <Loader2 size={14} className="animate-spin" /> : <span className="text-xs">{idx}</span>}
                </span>
                <span className={`text-sm ${active ? "font-medium" : done ? "" : "text-muted"}`}>{s}</span>
                {active && <span className="ml-auto text-xs text-accent pulse-dot">working…</span>}
              </div>
            );
          })}
          <p className="text-xs text-muted pt-4">Real papers are retrieved live from Crossref, Semantic Scholar and OpenAlex; this can take a little longer for long reference lists.</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Accuracy summary (document + cited papers) */
const ACCURACY_WEIGHT: Record<string, number> = { "SUPPORTED": 1, "POTENTIALLY OUTDATED": 0.6, "PARTIALLY SUPPORTED": 0.5, "UNSUPPORTED": 0, "CONTRADICTORY": 0 };
function accuracyGrade(v: number | null) {
  if (v === null) return { label: "Not enough evidence", color: "#64748b", cls: "text-slate-500" };
  if (v >= 90) return { label: "Excellent", color: "#16a34a", cls: "text-emerald-600 dark:text-emerald-400" };
  if (v >= 70) return { label: "Good", color: "#0ea5e9", cls: "text-sky-600 dark:text-sky-400" };
  if (v >= 50) return { label: "Fair", color: "#d97706", cls: "text-amber-600 dark:text-amber-400" };
  return { label: "Poor", color: "#dc2626", cls: "text-red-600 dark:text-red-400" };
}
function AccuracyBar({ label, value, total, hint, empty }: { label: string; value: number; total: number; hint: string; empty: string }) {
  const pct = total ? Math.round((value / total) * 100) : null;
  const g = accuracyGrade(pct);
  return (
    <div className="rounded-xl bg-surface2 p-3.5">
      <div className="flex items-baseline justify-between gap-2"><span className="text-xs text-muted">{label}</span><span className={`text-lg font-semibold tabular-nums ${g.cls}`}>{pct === null ? "–" : pct + "%"}</span></div>
      <div className="h-1.5 rounded-full bg-line/60 overflow-hidden mt-1.5"><div className="h-full rounded-full" style={{ width: (pct ?? 0) + "%", background: g.color }} /></div>
      <div className="text-[11px] text-muted mt-1.5">{total ? `${value} of ${total} ${hint}` : empty}</div>
    </div>
  );
}

export function AccuracySummary({ data, onOpenClaim }: { data: any; onOpenClaim?: (id: number) => void }) {
  const [showAll, setShowAll] = useState(false);
  const claims = (data.claims || []) as any[];
  const refs = (data.references || []) as any[];
  const papers = (data.papers || {}) as Record<string, any>;
  const checked = claims.filter((c) => c.verdict in ACCURACY_WEIGHT);
  const overall = checked.length ? Math.round((checked.reduce((a, c) => a + ACCURACY_WEIGHT[c.verdict], 0) / checked.length) * 100) : null;
  const grade = accuracyGrade(overall);
  const nums = claims.flatMap((c) => (c.numeric || []).filter((n: any) => n.match !== null && n.match !== undefined));
  // accuracy per cited paper: average score of the claims that rely on it
  const byPaper: Record<string, { paper: any; claims: any[]; ref: any }> = {};
  claims.forEach((c) => {
    if (!c.paper_id || !(c.verdict in ACCURACY_WEIGHT)) return;
    const k = String(c.paper_id);
    byPaper[k] = byPaper[k] || { paper: papers[k], claims: [], ref: refs.find((r) => r.paper_id === c.paper_id) };
    byPaper[k].claims.push(c);
  });
  const rows = Object.values(byPaper).map((r) => ({ ...r, score: Math.round((r.claims.reduce((a, c) => a + ACCURACY_WEIGHT[c.verdict], 0) / r.claims.length) * 100) }))
    .sort((a, b) => a.score - b.score);
  const shown = showAll ? rows : rows.slice(0, 6);
  const R = 52, C = 2 * Math.PI * R;
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="font-semibold">Accuracy summary</div>
        <div className="text-xs text-muted">How well the document and its cited research papers hold up against the evidence</div>
      </div>
      <div className="grid lg:grid-cols-[320px_1fr] gap-6 items-center">
        <div className="flex items-center gap-4">
          <div className="relative size-[132px] shrink-0">
            <svg viewBox="0 0 120 120" className="size-full -rotate-90">
              <circle cx="60" cy="60" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="11" />
              <circle cx="60" cy="60" r={R} fill="none" stroke={grade.color} strokeWidth="11" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C * (1 - (overall ?? 0) / 100)} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div><div className="text-[28px] font-semibold tabular-nums leading-none">{overall === null ? "–" : overall + "%"}</div><div className={`text-[11px] font-semibold mt-1 ${grade.cls}`}>{grade.label}</div></div>
            </div>
          </div>
          <div>
            <div className="font-medium">Overall document accuracy</div>
            <p className="text-xs text-muted mt-1 leading-relaxed">Based on {checked.length} of {claims.length} claims that could be checked against their sources{claims.length - checked.length ? ` (${claims.length - checked.length} need human review)` : ""}. Partial support counts half.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <AccuracyBar label="Claims accurate" value={checked.filter((c) => c.verdict === "SUPPORTED").length} total={checked.length} hint="checked claims fully supported" empty="No claims could be checked" />
          <AccuracyBar label="References correct" value={refs.filter((r) => r.meta_status === "verified").length} total={refs.length} hint="references match the publication" empty="No reference list found" />
          <AccuracyBar label="Papers found" value={refs.filter((r) => r.paper_id).length} total={refs.length} hint="cited papers retrieved" empty="No reference list found" />
          <AccuracyBar label="Statistics correct" value={nums.filter((n: any) => n.match).length} total={nums.length} hint="numbers match the source" empty="No statistics to compare" />
        </div>
      </div>
      {rows.length > 0 && (
        <div className="mt-5">
          <div className="label mb-2">Accuracy by cited paper · weakest first</div>
          <div className="rounded-xl border border-line divide-y divide-line overflow-hidden">
            {shown.map((r) => {
              const g = accuracyGrade(r.score);
              const counts = r.claims.reduce((m: Record<string, number>, c: any) => ((m[c.verdict] = (m[c.verdict] || 0) + 1), m), {});
              return (
                <button key={r.paper?.id ?? r.claims[0].id} type="button" onClick={() => onOpenClaim?.(r.claims[0].id)}
                  className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 hover:bg-surface2 transition-colors">
                  <div className="flex-1 min-w-[240px]">
                    <div className="text-[13.5px] font-serif leading-snug line-clamp-1">{r.paper?.title || "Cited paper"}</div>
                    <div className="text-[11px] text-muted mt-0.5 flex flex-wrap gap-x-2">
                      <span>{r.paper?.year || "n.d."}</span><span>· cited by {r.claims.length} claim{r.claims.length > 1 ? "s" : ""}</span>
                      {r.ref && r.ref.meta_status !== "verified" && <span className="text-red-600 dark:text-red-400">· reference details incorrect</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">{Object.entries(counts).map(([v, n]) => <span key={v} className="inline-flex items-center gap-1 text-[11px] text-muted"><span className={`size-2 rounded-full ${VERDICT_META[v]?.dot}`} />{n as number}</span>)}</div>
                  <div className="w-28"><div className="h-1.5 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full" style={{ width: r.score + "%", background: g.color }} /></div></div>
                  <div className={`w-12 text-right text-sm font-semibold tabular-nums ${g.cls}`}>{r.score}%</div>
                </button>
              );
            })}
          </div>
          {rows.length > 6 && <button className="text-xs text-accent hover:underline mt-2" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${rows.length} papers`}</button>}
        </div>
      )}
    </div>
  );
}

function DocHeaderStrip({ doc }: { doc: any }) {
  const s = doc.document.summary || {};
  return (
    <div className="card p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div className="min-w-0 flex-1"><div className="font-medium truncate">{doc.document.title}</div><div className="text-xs text-muted">v{doc.document.version} · {doc.document.filename}</div></div>
      <div className="text-sm"><span className="text-muted">Claims </span><b>{s.claims}</b></div>
      <div className="text-sm"><span className="text-muted">References </span><b>{s.references}</b></div>
      <div className="text-sm"><span className="text-muted">Mapped </span><b>{s.mapped_refs}/{s.references}</b></div>
      <div className="text-sm"><span className="text-muted">Reliability </span><b>{s.reliability}%</b></div>
      <RiskPill risk={s.risk} /><StatusPill status={doc.document.status} />
    </div>
  );
}

function ClaimsStep({ docId }: { docId: number }) {
  const { data, error, loading, reload } = useApi<any[]>(`/claims?doc_id=${docId}`, [docId]);
  const [open, setOpen] = useState<number | null>(null);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;
  return <><ClaimsList claims={data} onOpen={setOpen} /><StudentClaimDrawer claimId={open} onClose={() => setOpen(null)} onChanged={reload} /></>;
}

/* ------------------------------------------------------------------ Report */
export function DocReport({ data, onChanged }: { data: any; onChanged?: () => void }) {
  const { navigate } = useRouter();
  const d = data.document;
  const s = d.summary || {};
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const claims = data.claims as any[];
  const outdated = claims.filter((c) => c.outdated?.year);
  const sus = (data.references as any[]).filter((r) => r.meta_status !== "verified");
  const review = claims.filter((c) => ["NEEDS HUMAN REVIEW", "CONTRADICTORY", "UNSUPPORTED"].includes(c.verdict));
  const submit = async () => {
    setBusy(true);
    try { await api(`/documents/${d.id}/submit`, { method: "POST" }); toast("Submitted for professor review"); onChanged?.(); } catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-5">
      <div className="card p-5 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[240px]">
          <div className="label mb-1">Verification report</div>
          <div className="text-lg font-semibold">{d.title}</div>
          <div className="text-xs text-muted mt-0.5">Version {d.version} · {d.filename} · analysed {fmtDate(d.created_at)}</div>
        </div>
        <StatusPill status={d.status} />
        <a className="btn btn-ghost" href={reportUrl(d.id)} target="_blank" rel="noreferrer"><Download size={15} />Export PDF</a>
        {(d.status === "analyzed" || d.status === "revision_requested") && <button className="btn btn-primary" disabled={busy} onClick={submit}><Send size={15} />Submit for professor review</button>}
        {["submitted", "in_review"].includes(d.status) && <span className="text-sm text-muted">Submitted {fmtAgo(d.submitted_at)} – your professor can now review it.</span>}
      </div>
      <AccuracySummary data={data} onOpenClaim={setOpen} />
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Stat label="Claims extracted" value={s.claims} />
        <Stat label="Citations mapped" value={`${s.mapped_refs}/${s.references}`} />
        <Stat label="Supported" value={s.counts?.["SUPPORTED"]} tone="bg-emerald-500/10 text-emerald-600" icon={CheckCircle2} />
        <Stat label="Partially supported" value={s.counts?.["PARTIALLY SUPPORTED"]} tone="bg-amber-500/10 text-amber-600" icon={AlertTriangle} />
        <Stat label="Unsupported" value={s.counts?.["UNSUPPORTED"]} tone="bg-red-500/10 text-red-600" icon={XCircle} />
        <Stat label="Contradictory" value={s.counts?.["CONTRADICTORY"]} tone="bg-rose-500/10 text-rose-600" icon={XCircle} />
        <Stat label="Outdated alerts" value={s.counts?.["POTENTIALLY OUTDATED"]} tone="bg-orange-500/10 text-orange-600" icon={Clock} />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2"><div className="font-medium mb-4">Document overview</div><VerdictDonut counts={s.counts || {}} /></div>
        <div className="card p-5"><ReliabilityGauge value={s.reliability || 0} /><div className="mt-4 text-sm space-y-1.5">
          <div className="flex justify-between"><span className="text-muted">Suspicious references</span><b>{s.suspicious_refs}</b></div>
          <div className="flex justify-between"><span className="text-muted">Needs human review</span><b>{s.counts?.["NEEDS HUMAN REVIEW"]}</b></div>
          <div className="flex justify-between"><span className="text-muted">Overall risk</span><RiskPill risk={s.risk} /></div></div></div>
      </div>
      <div className="card">
        <div className="px-5 py-4 border-b border-line font-medium">Claim-by-claim evidence</div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>#</th><th>Claim</th><th>Evidence passage</th><th>Location</th><th>Verdict</th><th>Confidence</th><th>Source</th></tr></thead>
            <tbody>
              {claims.map((c) => {
                const e = c.evidence?.[0];
                const p = data.papers[c.paper_id];
                return (
                  <tr key={c.id} className="clickable" onClick={() => setOpen(c.id)}>
                    <td className="text-muted font-mono text-xs">{c.idx}</td>
                    <td className="max-w-[300px]">{c.text}</td>
                    <td className="max-w-[320px]">{e ? <span className="font-serif text-[13px]"><mark className={`hl hl-${e.label}`}>{e.text.length > 180 ? e.text.slice(0, 177) + "…" : e.text}</mark></span> : <span className="text-muted text-xs">Source unavailable – manual verification required</span>}</td>
                    <td className="text-xs text-muted whitespace-nowrap">{e ? [e.section, e.page ? "p. " + e.page : ""].filter(Boolean).join(", ") : "–"}</td>
                    <td><VerdictBadge verdict={c.verdict} size="sm" /></td>
                    <td><Confidence value={c.confidence} compact /></td>
                    <td className="text-xs">{p ? (p.url ? <a className="text-accent hover:underline inline-flex items-center gap-1" href={p.url} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>DOI<ExternalLink size={11} /></a> : <span className="text-muted">simulated</span>) : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="font-medium mb-3 flex items-center gap-2"><Clock size={16} className="text-orange-500" />Outdated research alerts</div>
          {outdated.length === 0 ? <p className="text-sm text-muted">No sources older than 10 years with conflicting newer evidence.</p> : outdated.map((c) => (
            <button key={c.id} onClick={() => setOpen(c.id)} className="w-full text-left rounded-lg border border-line p-3 mb-2 hover:border-accent/50">
              <div className="text-sm">{c.text}</div><div className="text-xs text-muted mt-1">{c.outdated.year} source · {c.outdated.age} years · {c.outdated.note}</div>
            </button>
          ))}
        </div>
        <div className="card p-5">
          <div className="font-medium mb-3 flex items-center gap-2"><ShieldAlert size={16} className="text-red-500" />Suspicious references</div>
          {sus.length === 0 ? <p className="text-sm text-muted">All references matched their publication records.</p> : <div className="space-y-2">{sus.map((r) => <ReferenceCard key={r.id} r={r} />)}</div>}
        </div>
      </div>
      <div className="card p-5">
        <div className="font-medium mb-3">Items requiring human review</div>
        {review.length === 0 ? <p className="text-sm text-muted">None – every claim has adequate evidence.</p> : (
          <div className="space-y-2">{review.map((c) => (
            <button key={c.id} onClick={() => setOpen(c.id)} className="w-full text-left flex items-start gap-3 rounded-lg border border-line p-3 hover:border-accent/50">
              <VerdictBadge verdict={c.verdict} size="sm" /><span className="text-sm flex-1">{c.text}</span>
              {c.verdict !== "SUPPORTED" && <span className="text-xs text-accent whitespace-nowrap" onClick={(e) => { e.stopPropagation(); navigate(`/student/suggestions?claim=${c.id}`); }}>Suggest sources →</span>}
            </button>
          ))}</div>
        )}
      </div>
      <StudentClaimDrawer claimId={open} onClose={() => setOpen(null)} onChanged={onChanged} />
    </div>
  );
}

/* ------------------------------------------------------------------ Documents */
export function Documents() {
  const { data, error, loading, reload } = useApi<any[]>("/documents");
  const { navigate, query } = useRouter();
  const [q, setQ] = useState("");
  const [attention, setAttention] = useState(query.get("attention") === "1");
  const needsAttention = (d: any) => ["high", "medium"].includes(d.summary?.risk) || d.status === "revision_requested";
  const del = async (id: number) => {
    if (!confirm("Delete this document and its verification results?")) return;
    try { await api(`/documents/${id}`, { method: "DELETE" }); toast("Document deleted"); reload(); } catch (e: any) { toast(e.message, "error"); }
  };
  const rows = (data || []).filter((d) => (!attention || needsAttention(d)) && (!q || d.title.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-5">
      {attention && (
        <div className="rounded-lg border border-accent/30 bg-accentsoft px-3.5 py-2 text-sm flex flex-wrap items-center gap-2 order-first">
          <span className="text-muted">Showing</span><b>documents that need attention</b><span className="text-muted">– medium/high risk, or a revision was requested</span>
          <button className="ml-auto text-accent text-xs hover:underline" onClick={() => setAttention(false)}>Show all documents</button>
        </div>
      )}
      <PageHeader title="My Documents" subtitle="All uploaded documents, their verification status and versions." actions={<><SearchBox value={q} onChange={setQ} placeholder="Search documents…" /><button className="btn btn-primary" onClick={() => navigate("/student/verify")}><Upload size={15} />Upload</button></>} />
      {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : rows.length === 0 ? <div className="card"><Empty icon={FolderOpen} title="No documents" body="Upload your first document to start verifying claims." action={<button className="btn btn-primary" onClick={() => navigate("/student/verify")}>New verification</button>} /></div> : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Document</th><th>Version</th><th>Claims</th><th>Reliability</th><th>Risk</th><th>Status</th><th>Uploaded</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="clickable" onClick={() => navigate(d.status === "processing" || d.status === "failed" ? `/student/verify?doc=${d.id}` : `/student/documents/${d.id}`)}>
                  <td><div className="font-medium">{d.title}</div><div className="text-xs text-muted">{d.filename} · {d.filetype} · {fmtSize(d.size)}</div></td>
                  <td>v{d.version}</td><td>{d.summary?.claims ?? "–"}</td>
                  <td className="tabular-nums">{d.summary?.reliability !== undefined ? d.summary.reliability + "%" : "–"}</td>
                  <td><RiskPill risk={d.summary?.risk} /></td><td><StatusPill status={d.status} /></td><td className="text-muted text-xs">{fmtDate(d.created_at)}</td>
                  <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {d.summary?.claims !== undefined && <a className="btn btn-ghost btn-sm mr-1" href={reportUrl(d.id)} target="_blank" rel="noreferrer" title="Export PDF"><Download size={13} /></a>}
                    <button className="btn btn-ghost btn-sm mr-1" title="Upload revision" onClick={() => navigate(`/student/verify?revise=${d.id}`)}><GitCompare size={13} /></button>
                    <button className="btn btn-danger btn-sm" title="Delete" onClick={() => del(d.id)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DocumentPage({ id }: { id: number }) {
  const { data, error, loading, reload } = useApi<any>(`/documents/${id}`, [id]);
  const { navigate } = useRouter();
  const [tab, setTab] = useState("report");
  const [open, setOpen] = useState<number | null>(null);
  const [cmp, setCmp] = useState<any>(null);
  useEffect(() => { if (tab === "versions" && data?.document.prev_id && !cmp) api(`/documents/${id}/compare`).then(setCmp).catch(() => {}); }, [tab, data, id, cmp]);
  if (loading) return <Loading rows={5} />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;
  const d = data.document;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted"><Link to="/student/documents" className="hover:text-ink">My Documents</Link><ChevronRight size={14} /><span className="text-ink truncate">{d.title}</span></div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "report", label: "Report" }, { id: "claims", label: "Claims", count: data.claims.length }, { id: "references", label: "References", count: data.references.length },
        { id: "feedback", label: "Feedback", count: data.feedback.length }, { id: "versions", label: "Versions", count: data.versions.length }, { id: "text", label: "Document text" }]} />
      {tab === "report" && <DocReport data={data} onChanged={reload} />}
      {tab === "claims" && <><ClaimsList claims={data.claims.map((c: any) => ({ ...c, paper: data.papers[c.paper_id] }))} onOpen={setOpen} /><StudentClaimDrawer claimId={open} onClose={() => setOpen(null)} onChanged={reload} /></>}
      {tab === "references" && <div className="grid md:grid-cols-2 gap-3">{data.references.map((r: any) => <ReferenceCard key={r.id} r={r} />)}{!data.references.length && <div className="card col-span-2"><Empty title="No reference list detected" body="Add a 'References' heading followed by your reference entries." /></div>}</div>}
      {tab === "feedback" && <FeedbackList items={data.feedback} onChanged={reload} />}
      {tab === "versions" && (
        <div className="space-y-4">
          <div className="card divide-y divide-line">{data.versions.map((v: any) => (
            <button key={v.id} onClick={() => navigate(`/student/documents/${v.id}`)} className={`w-full text-left px-5 py-3 flex items-center gap-4 hover:bg-surface2 ${v.id === d.id ? "bg-accentsoft" : ""}`}>
              <span className="font-mono text-xs w-8">v{v.version}</span><span className="flex-1 text-sm">{v.title}</span><span className="text-sm tabular-nums text-muted">{v.summary?.reliability ?? "–"}%</span><StatusPill status={v.status} />
            </button>))}</div>
          {d.prev_id ? (cmp ? <Comparison data={cmp} /> : <Loading />) : <div className="card p-5 text-sm text-muted flex items-center justify-between gap-3">This is the original version.<button className="btn btn-primary btn-sm" onClick={() => navigate(`/student/verify?revise=${d.id}`)}><Upload size={14} />Upload revised version</button></div>}
        </div>
      )}
      {tab === "text" && <div className="card p-6"><pre className="whitespace-pre-wrap font-serif text-[14.5px] leading-relaxed">{data.text}</pre></div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Claim explorer */
export function ClaimExplorer() {
  const { query } = useRouter();
  const { data, error, loading, reload } = useApi<any[]>("/claims");
  const { data: refs } = useApi<any[]>("/references");
  const [open, setOpen] = useState<number | null>(null);
  const [view, setView] = useState(query.get("view") || "claims");
  return (
    <div className="space-y-5">
      <PageHeader title="Claim Explorer" subtitle="Every claim extracted from your documents, with its verdict, evidence and reference integrity." />
      <Tabs value={view} onChange={setView} tabs={[{ id: "claims", label: "Claims", count: data?.length }, { id: "refs", label: "Reference integrity", count: refs?.filter((r) => r.meta_status !== "verified").length }]} />
      {view === "claims" && (loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : !data?.length ? <div className="card"><Empty title="No claims yet" body="Run a verification to extract claims." /></div> : <ClaimsList claims={data} onOpen={setOpen} showDoc initialFilter={query.get("verdict") || undefined} />)}
      {view === "refs" && <RefIntegrity refs={refs || []} />}
      <StudentClaimDrawer claimId={open} onClose={() => setOpen(null)} onChanged={reload} />
    </div>
  );
}
export function RefIntegrity({ refs, showStudent }: { refs: any[]; showStudent?: boolean }) {
  const [f, setF] = useState("issues");
  const rows = refs.filter((r) => f === "all" || (f === "issues" ? r.meta_status !== "verified" : r.meta_status === f));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="References checked" value={refs.length} />
        <Stat label="Verified" value={refs.filter((r) => r.meta_status === "verified").length} tone="bg-emerald-500/10 text-emerald-600" icon={CheckCircle2} />
        <Stat label="Confirmed mismatch" value={refs.filter((r) => r.meta_status === "mismatch").length} tone="bg-red-500/10 text-red-600" icon={ShieldAlert} />
        <Stat label="Could not be verified" value={refs.filter((r) => r.meta_status === "not_found" || r.meta_status === "unverified").length} tone="bg-amber-500/10 text-amber-600" icon={AlertTriangle} />
      </div>
      <div className="flex gap-1.5">{[["issues", "Suspicious"], ["mismatch", "Confirmed mismatch"], ["not_found", "Not found"], ["all", "All"]].map(([id, l]) => (
        <button key={id} onClick={() => setF(id)} className={`rounded-full px-3 py-1 text-xs border ${f === id ? "border-accent bg-accentsoft font-medium" : "border-line text-muted bg-surface"}`}>{l}</button>))}</div>
      <div className="grid md:grid-cols-2 gap-3">
        {rows.map((r) => <div key={r.id}><div className="text-xs text-muted mb-1">{showStudent ? r.student_name + " · " : ""}{r.doc_title}</div><ReferenceCard r={r} /></div>)}
        {!rows.length && <div className="card md:col-span-2"><Empty icon={CheckCircle2} title="Nothing to show" body="No references in this category." /></div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Evidence viewer */
export function EvidenceViewer() {
  const { query, navigate } = useRouter();
  const { data: claims, loading } = useApi<any[]>("/claims");
  const [q, setQ] = useState("");
  const selected = Number(query.get("claim")) || claims?.[0]?.id;
  const { data: c, loading: cl } = useApi<any>(selected ? `/claims/${selected}` : null, [selected]);
  const list = (claims || []).filter((x) => !q || x.text.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-5">
      <PageHeader title="Evidence Viewer" subtitle="See the exact sentence in the original paper that supports or contradicts each claim." actions={<HighlightLegend />} />
      {loading ? <Loading /> : !claims?.length ? <div className="card"><Empty title="No claims yet" body="Verify a document to inspect its evidence." /></div> : (
        <div className="grid xl:grid-cols-[320px_1fr] gap-4 items-start">
          <div className="card overflow-hidden xl:sticky xl:top-20">
            <div className="p-3 border-b border-line"><input className="input" placeholder="Filter claims…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-line">
              {list.map((x) => (
                <button key={x.id} onClick={() => navigate(`/student/evidence?claim=${x.id}`)} className={`w-full text-left px-3.5 py-3 hover:bg-surface2 ${x.id === selected ? "bg-accentsoft" : ""}`}>
                  <div className="flex items-center gap-2 mb-1"><span className={`size-2 rounded-full ${VERDICT_META[x.verdict]?.dot}`} /><span className="text-[11px] text-muted truncate">{x.doc_title}</span></div>
                  <div className="text-[13px] leading-snug line-clamp-2">{x.text}</div>
                </button>
              ))}
            </div>
          </div>
          {cl || !c ? <Loading rows={4} /> : (
            <div className="space-y-4 fade-in">
              <div className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="label">Student claim</div><div className="flex items-center gap-3"><Confidence value={c.confidence} /><VerdictBadge verdict={c.verdict} /></div></div>
                <p className="text-[17px] leading-relaxed mt-2 font-medium">“{c.text}”</p>
                <p className="text-sm text-muted mt-3 leading-relaxed">{c.explanation}</p>
                {c.numeric?.filter((n: any) => n.match === false).map((n: any, i: number) => (
                  <div key={i} className="mt-3 rounded-lg bg-red-500/5 border border-red-500/30 p-3 text-sm flex flex-wrap gap-x-6 gap-y-1">
                    <span>Claimed: <b>{n.claimed}</b></span><span>Source: <b>{n.actual}</b></span><span>Difference: <b className="text-red-600 dark:text-red-400">{n.difference_label}</b></span>
                  </div>
                ))}
              </div>
              <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4 items-start">
                <div className="space-y-3">
                  <div className="label">Evidence passages</div>
                  {c.evidence?.length ? c.evidence.map((e: any, i: number) => <EvidenceQuote key={i} e={e} />) : <div className="card p-4 text-sm text-muted">Source unavailable – manual verification required.</div>}
                  {c.verdict !== "SUPPORTED" && <button className="btn btn-primary w-full" onClick={() => navigate(`/student/suggestions?claim=${c.id}`)}><Lightbulb size={15} />Find better citations</button>}
                </div>
                <div className="card p-5">
                  <div className="pb-4 mb-4 border-b border-line"><div className="label mb-2">Original research paper</div><PaperCite paper={c.paper} /></div>
                  <HighlightedPaper paper={c.paper} evidence={c.evidence || []} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Network */
/* ------------------------------------------------------------------ Citation mind map (Citation Chain Explorer) */
type MindTone = "support" | "partial" | "contradict" | "review" | "newer" | "newerbad" | "outdated";
const MIND_TONE: Record<MindTone, { box: string; icon: any; iconCls: string; stroke: string }> = {
  support: { box: "bg-[#eaf6ec] border-[#7cc48a] text-[#14361d] dark:bg-emerald-500/10 dark:border-emerald-500/50 dark:text-emerald-50", icon: CheckCircle2, iconCls: "text-[#2f9e4a] dark:text-emerald-400", stroke: "#4a9a5c" },
  partial: { box: "bg-[#fdf6dd] border-[#e2c25a] text-[#3d2f07] dark:bg-amber-500/10 dark:border-amber-500/50 dark:text-amber-50", icon: AlertTriangle, iconCls: "text-[#c99a17] dark:text-amber-400", stroke: "#c9a227" },
  contradict: { box: "bg-[#fbe9e8] border-[#df8d8a] text-[#3e1210] dark:bg-red-500/10 dark:border-red-500/50 dark:text-red-50", icon: XCircle, iconCls: "text-[#d0453f] dark:text-red-400", stroke: "#a83b37" },
  review: { box: "bg-[#eef1f5] border-[#a9b4c4] text-[#1e293b] dark:bg-slate-500/10 dark:border-slate-500/50 dark:text-slate-100", icon: CircleHelp, iconCls: "text-[#64748b] dark:text-slate-300", stroke: "#7b8798" },
  newer: { box: "bg-[#eef0fd] border-[#a9b2ef] text-[#1c1f4a] dark:bg-indigo-500/10 dark:border-indigo-400/50 dark:text-indigo-50", icon: Check, iconCls: "text-[#6366f1] dark:text-indigo-300", stroke: "#a3a9e8" },
  newerbad: { box: "bg-[#fbe9e8] border-[#e5a5a2] text-[#3e1210] dark:bg-rose-500/10 dark:border-rose-400/50 dark:text-rose-50", icon: Check, iconCls: "text-[#d0453f] dark:text-rose-300", stroke: "#d9a0a0" },
  outdated: { box: "bg-[#fdeee2] border-[#efa66b] text-[#40200a] dark:bg-orange-500/10 dark:border-orange-500/50 dark:text-orange-50", icon: Clock, iconCls: "text-[#e2721f] dark:text-orange-400", stroke: "#e08a45" },
};
const VERDICT_TONE: Record<string, MindTone> = { "SUPPORTED": "support", "PARTIALLY SUPPORTED": "partial", "UNSUPPORTED": "contradict", "CONTRADICTORY": "contradict", "POTENTIALLY OUTDATED": "outdated", "NEEDS HUMAN REVIEW": "review" };
const EDGE_LABEL: Record<string, string> = { "SUPPORTED": "Supports", "PARTIALLY SUPPORTED": "Partially supports", "UNSUPPORTED": "Does not support", "CONTRADICTORY": "Contradicts", "POTENTIALLY OUTDATED": "Supports · outdated", "NEEDS HUMAN REVIEW": "Needs review" };

function MindNode({ data }: { data: any }) {
  const left = data.side === "left";
  if (data.kind === "center") return (
    <div className="w-[340px] rounded-[30px] px-7 py-5 text-center text-white shadow-xl ring-4 ring-[#9db4e6]/60 dark:ring-[#3b5bdb]/40" style={{ background: "linear-gradient(160deg,#2c5aa0,#1f3f7a)" }}>
      <Handle id="l" type="source" position={Position.Left} className="!opacity-0" /><Handle id="r" type="source" position={Position.Right} className="!opacity-0" />
      <div className="text-[15px] font-bold tracking-wide uppercase">{data.heading}</div>
      <div className="mt-1.5 text-[15px] leading-snug text-white/95">{data.title}</div>
      {data.sub && <div className="mt-2 text-[11.5px] text-white/70">{data.sub}</div>}
    </div>
  );
  const t = MIND_TONE[data.tone as MindTone] || MIND_TONE.review;
  const Icon = t.icon;
  const inner = left ? Position.Right : Position.Left;
  const outer = left ? Position.Left : Position.Right;
  return (
    <div className={`relative w-[260px] rounded-2xl border-2 px-3.5 py-2.5 shadow-sm cursor-pointer transition-transform hover:-translate-y-0.5 ${t.box} ${data.dim ? "opacity-30" : ""}`} title={data.tooltip}>
      {data.badge && <div className="absolute -top-2.5 -right-2 rounded-full bg-red-500 text-white text-[10px] font-semibold px-2 py-0.5 shadow ring-2 ring-[#f6f7f4] dark:ring-[#0c1426]">{data.badge}</div>}
      {data.relation && <div className="absolute -top-6 left-0 right-0 text-center text-[11.5px] font-bold uppercase tracking-[0.06em] whitespace-nowrap" style={{ color: data.relationColor }}>{data.relation}</div>}
      <Handle type="target" position={inner} className="!opacity-0" /><Handle type="source" position={outer} className="!opacity-0" />
      <div className="flex items-start gap-2">
        <Icon size={17} className={`shrink-0 mt-0.5 ${t.iconCls}`} strokeWidth={2.4} />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold leading-tight">{data.heading}</div>
          <div className={`text-[12.5px] leading-snug mt-0.5 line-clamp-3 ${data.kind === "finding" ? "italic font-serif" : ""}`}>{data.title}</div>
          {data.sub && <div className="text-[11px] mt-1 opacity-70 line-clamp-2">{data.sub}</div>}
        </div>
      </div>
    </div>
  );
}
const mindNodeTypes = { mind: MindNode };

/** Build the mind-map graph for one document (or one claim) from verification results. */
function buildMindMap(doc: any, focusClaim: number | null, reuse?: Record<number, number>) {
  const papers = doc.papers as Record<string, any>;
  const byKey: Record<string, any> = {};
  Object.values(papers).forEach((p: any) => (byKey[p.key] = p));
  const refById: Record<number, any> = {};
  (doc.references as any[]).forEach((r) => (refById[r.id] = r));
  const claims = (doc.claims as any[]).filter((c) => !focusClaim || c.id === focusClaim);
  const yr = (p: any) => (p?.year ? ` (${p.year})` : "");
  const short = (s: string, n = 110) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  type Branch = { node: any; edge: any; children: { node: any; edge: any }[] };
  const branches: Branch[] = claims.map((c, i) => {
    const p = papers[c.paper_id];
    const chainBroken = c.chain?.original_title && !c.chain.traceable;
    const id = `c${c.id}`;
    const tone: MindTone = chainBroken ? "review" : VERDICT_TONE[c.verdict] || "review";
    const label = chainBroken ? "Suspicious unverified chain" : !c.citation_labels?.length ? "No citation" : !p ? "Unverified source" : EDGE_LABEL[c.verdict];
    const node = {
      id, kind: "paper", tone: !p ? (c.citation_labels?.length ? "contradict" : "review") : tone, claimId: c.id,
      heading: p ? `Cited Paper ${c.citation_labels?.[0] ?? i + 1}:` : c.citation_labels?.length ? `Reference [${c.citation_labels[0]}]:` : "Uncited claim:",
      title: p ? p.title + yr(p) : c.citation_labels?.length ? "Source unavailable – manual verification required" : short(c.text, 90),
      sub: p ? "Claim: " + short(c.text, 90) : c.citation_labels?.length ? refById[c.ref_id]?.raw?.slice(0, 90) : "No source cited for this statement",
      tooltip: c.text, badge: p && reuse && (reuse[p.id] || 0) > 1 ? `Cited by ${reuse[p.id]} students` : undefined,
    };
    const dashed = chainBroken || (!p && !!c.citation_labels?.length);
    const edge = { kind: dashed ? "suspicious" : tone, label };
    const children: { node: any; edge: any }[] = [];
    // original sources the cited paper relies on (citation chain)
    if (c.chain?.original_title) {
      const op = papers[c.chain.original_paper_id];
      children.push({
        node: { id: `${id}-orig`, kind: "source", tone: c.chain.traceable ? "support" : "contradict", claimId: c.id, heading: "Original Source:",
          title: (op?.title || c.chain.original_title) + yr(op), sub: c.chain.traceable ? "Claim traced to original evidence" : `Original evidence: ${c.chain.original_verdict.toLowerCase()}`, tooltip: c.chain.original_explanation },
        edge: { kind: c.chain.traceable ? "support" : "suspicious" },
      });
    } else if (p?.cites?.length) {
      p.cites.slice(0, 2).forEach((k: string) => {
        const op = byKey[k];
        if (op) children.push({ node: { id: `${id}-cite-${k}`, kind: "source", tone: "support", claimId: c.id, heading: "Original Source:", title: op.title + yr(op), tooltip: op.title }, edge: { kind: "support" } });
      });
    }
    // what the evidence actually says (finding / limitation / mismatch)
    const showFinding = ["PARTIALLY SUPPORTED", "CONTRADICTORY", "UNSUPPORTED"].includes(c.verdict) && !chainBroken;
    const partials = (c.evidence || []).filter((e: any) => e.label === "partial");
    const ev = !showFinding ? null : c.evidence?.find((e: any) => e.label === "contradict")
      || partials.find((e: any) => /limit/i.test(e.section || "")) || partials[partials.length - 1];
    const num = c.numeric?.find((n: any) => n.match === false);
    if (num) children.push({ node: { id: `${id}-num`, kind: "finding", tone: "contradict", claimId: c.id, heading: "Source reports:", title: `${num.actual} – not ${num.claimed} (Δ ${num.difference_label})`, sub: [num.section, num.page ? "p. " + num.page : ""].filter(Boolean).join(" · "), tooltip: num.passage }, edge: { kind: "contradict" } });
    else if (c.mismatch?.label === "Topic mismatch") children.push({ node: { id: `${id}-topic`, kind: "finding", tone: "contradict", claimId: c.id, heading: "Topic mismatch:", title: "Paper does not study this subject", tooltip: c.explanation }, edge: { kind: "contradict" } });
    else if (ev) children.push({ node: { id: `${id}-ev`, kind: "finding", tone: ev.label === "contradict" ? "contradict" : "partial", claimId: c.id, heading: ev.label === "contradict" ? "Contradicting finding:" : /limit/i.test(ev.section || "") ? "Stated limitation:" : "Partial evidence:", title: short(ev.text, 120), sub: [ev.section, ev.page ? "p. " + ev.page : ""].filter(Boolean).join(" · "), tooltip: ev.text }, edge: { kind: ev.label === "contradict" ? "contradict" : "partial" } });
    // newer evidence
    (c.outdated?.newer || []).slice(0, 2).forEach((n: any, k: number) => children.push({
      node: { id: `${id}-new-${k}`, kind: "newer", tone: n.differs ? "newerbad" : "newer", claimId: c.id, heading: "Newer Evidence:", title: n.title + (n.year ? ` (${n.year})` : ""), sub: n.differs ? "Reports a different result" : "Consistent with the claim", tooltip: n.finding },
      edge: { kind: n.differs ? "newerbad" : "newer" },
    }));
    return { node, edge, children };
  });

  // layout: alternate branches left/right, stack children beside their parent
  const W1 = 450, W2 = 830, H1 = 170, H2 = 128;
  const sides: Record<"left" | "right", Branch[]> = { left: [], right: [] };
  branches.forEach((b, i) => sides[i % 2 === 0 ? "right" : "left"].push(b));
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const center = doc.document;
  const focus = focusClaim ? (doc.claims as any[]).find((c) => c.id === focusClaim) : null;
  nodes.push({ id: "center", type: "mind", position: { x: -170, y: -60 }, draggable: true,
    data: { kind: "center", heading: focus ? "Central claim:" : "Central claim:", title: focus ? focus.text : center.title, sub: focus ? center.title : `${claims.length} claims · ${center.summary?.reliability ?? "–"}% evidence reliability` } });
  (["left", "right"] as const).forEach((side) => {
    const list = sides[side];
    const heights = list.map((b) => Math.max(H1, b.children.length * H2));
    const total = heights.reduce((a, h) => a + h, 0) + (list.length - 1) * 40;
    let y = -total / 2;
    const sx = side === "right" ? 1 : -1;
    list.forEach((b, i) => {
      const h = heights[i];
      const cy = y + h / 2;
      const relColor = b.edge.kind === "suspicious" ? "#c0392b" : (MIND_TONE[b.edge.kind as MindTone] || MIND_TONE.review).stroke;
      nodes.push({ id: b.node.id, type: "mind", position: { x: sx * W1 - 130, y: cy - 45 }, data: { ...b.node, side, relation: b.edge.label, relationColor: relColor } });
      edges.push(mindEdge("center", b.node.id, b.edge.kind, undefined, side === "right" ? "r" : "l"));
      b.children.forEach((ch, k) => {
        const yy = cy - (b.children.length * H2) / 2 + k * H2 + H2 / 2;
        nodes.push({ id: ch.node.id, type: "mind", position: { x: sx * W2 - 130, y: yy - 40 }, data: { ...ch.node, side } });
        edges.push(mindEdge(b.node.id, ch.node.id, ch.edge.kind));
      });
      y += h + 40;
    });
  });
  return { nodes, edges, branches };
}
function mindEdge(source: string, target: string, kind: string, label?: string, sourceHandle?: string): Edge {
  const color = kind === "suspicious" ? "#c0392b" : (MIND_TONE[kind as MindTone] || MIND_TONE.review).stroke;
  const dash = kind === "suspicious" ? "9 7" : kind === "newer" || kind === "newerbad" ? "2 6" : undefined;
  return {
    id: `${source}->${target}`, source, target, sourceHandle, type: "default",
    style: { stroke: color, strokeWidth: kind === "newer" || kind === "newerbad" ? 2.2 : 3, strokeDasharray: dash, strokeLinecap: "round" },
    label: label?.toUpperCase(), labelStyle: { fill: color, fontWeight: 700, fontSize: 11, letterSpacing: "0.04em" },
    labelBgStyle: { fill: "var(--surface)", fillOpacity: 0.9 }, labelBgPadding: [6, 3], labelBgBorderRadius: 4,
  };
}
function MindLegend() {
  const items: [string, string, string | undefined][] = [["Supports", MIND_TONE.support.stroke, undefined], ["Partial", MIND_TONE.partial.stroke, undefined], ["Contradicts", MIND_TONE.contradict.stroke, undefined],
    ["Outdated", MIND_TONE.outdated.stroke, undefined], ["Suspicious / Unverified chain", "#c0392b", "7 5"], ["Newer evidence", MIND_TONE.newer.stroke, "2 4"]];
  return (
    <div className="card px-5 py-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
      <span className="font-semibold">Key legend</span>
      {items.map(([l, c, d]) => (
        <span key={l} className="inline-flex items-center gap-2">
          {d ? <svg width="30" height="6"><line x1="1" y1="3" x2="29" y2="3" stroke={c} strokeWidth="2.5" strokeDasharray={d} strokeLinecap="round" /></svg>
            : <span className="size-4 rounded-full border-2" style={{ borderColor: c, background: c + "22" }} />}{l}
        </span>
      ))}
    </div>
  );
}

function CitationMindMap({ doc, focusClaim, onOpenClaim, height = 760, reuse }: { doc: any; focusClaim: number | null; onOpenClaim: (id: number) => void; height?: number; reuse?: Record<number, number> }) {
  const { nodes, edges } = useMemo(() => buildMindMap(doc, focusClaim, reuse), [doc, focusClaim, reuse]);
  return (
    <div className="card overflow-hidden bg-[#f6f7f4] dark:bg-surface" style={{ height }}>
      <ReactFlow style={{ background: "transparent" }} key={`${doc.document.id}-${focusClaim}`} nodes={nodes} edges={edges} nodeTypes={mindNodeTypes} fitView fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
        minZoom={0.2} proOptions={{ hideAttribution: true }} nodesConnectable={false}
        onNodeClick={(_, n: any) => n.data?.claimId && onOpenClaim(n.data.claimId)}>
        <Background gap={24} size={1} color="var(--border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export function NetworkPage() {
  const { query, navigate } = useRouter();
  const { data: docs } = useApi<any[]>("/documents");
  const ready = (docs || []).filter((d) => d.status !== "processing" && d.status !== "failed");
  const docId = query.get("doc") || (ready[0] ? String(ready[0].id) : "");
  const focus = query.get("claim") ? Number(query.get("claim")) : null;
  const [view, setView] = useState("mindmap");
  const { data: doc, error, loading, reload } = useApi<any>(docId ? `/documents/${docId}` : null, [docId]);
  const { data: graph } = useApi<any>(view === "graph" ? `/network${docId ? `?doc_id=${docId}` : ""}` : null, [view, docId]);
  const [sel, setSel] = useState<{ node: any; related: any[] }>({ node: null, related: [] });
  const [open, setOpen] = useState<number | null>(null);
  const claims = (doc?.claims || []) as any[];
  const suspicious = claims.filter((c) => c.chain?.original_title && !c.chain.traceable).length;
  const counts = claims.reduce((m: Record<string, number>, c) => ((m[c.verdict] = (m[c.verdict] || 0) + 1), m), {});
  const setParam = (doc: string, claim?: string) => navigate(`/student/network?doc=${doc}${claim ? `&claim=${claim}` : ""}`);
  return (
    <div className="space-y-5">
      <PageHeader title="Citation Chain Explorer" subtitle="A mind map of your document's evidence: each cited paper, how it relates to your claims, the original sources behind it and newer research. Click any node to open the evidence."
        actions={<>
          <select className="input w-72" value={docId} onChange={(e) => setParam(e.target.value)}>{ready.length === 0 && <option value="">No analysed documents</option>}{ready.map((d) => <option key={d.id} value={d.id}>{d.title} (v{d.version})</option>)}</select>
          <select className="input w-64" value={focus ?? ""} onChange={(e) => setParam(docId, e.target.value)}><option value="">All claims</option>{claims.map((c) => <option key={c.id} value={c.id}>Claim {c.idx}: {c.text.slice(0, 60)}…</option>)}</select>
        </>} />
      <Tabs value={view} onChange={setView} tabs={[{ id: "mindmap", label: "Mind map" }, { id: "graph", label: "Network graph" }]} />
      {suspicious > 0 && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3.5 text-sm flex items-center gap-2"><AlertTriangle size={16} className="text-red-500" />{suspicious} suspicious citation chain{suspicious > 1 ? "s" : ""}: a cited paper repeats a claim that its own original source does not support (red dashed links).</div>}
      {!docId ? <div className="card"><Empty title="No citations to map yet" body="Verify a document to see its citation mind map." /></div>
        : loading ? <Loading rows={6} /> : error ? <ErrorBox error={error} retry={reload} /> : !doc ? null : view === "mindmap" ? (
          <>
            <div className="flex flex-wrap gap-2">{VERDICTS.filter((v) => counts[v]).map((v) => <span key={v} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs"><span className={`size-2 rounded-full ${VERDICT_META[v].dot}`} />{VERDICT_META[v].label}<b className="tabular-nums">{counts[v]}</b></span>)}</div>
            <CitationMindMap doc={doc} focusClaim={focus} onOpenClaim={setOpen} />
            <MindLegend />
          </>
        ) : (
          <>
            <GraphLegend />
            {!graph ? <Loading rows={6} /> : (
              <div className="grid xl:grid-cols-[1fr_320px] gap-4 items-start">
                <CitationGraph graph={graph} onSelect={(node, related) => setSel({ node, related })} />
                <NodeInspector node={sel.node} related={sel.related} onOpenClaim={setOpen} />
              </div>
            )}
          </>
        )}
      <StudentClaimDrawer claimId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ Outdated research */
export function Outdated() {
  const { data, loading, error, reload } = useApi<any[]>("/claims");
  const [open, setOpen] = useState<number | null>(null);
  const items = (data || []).filter((c) => c.outdated?.year);
  return (
    <div className="space-y-5">
      <PageHeader title="Outdated Research" subtitle="Sources older than 10 years are checked against newer related studies. Age alone never invalidates a paper – only conflicting newer evidence raises an alert." />
      {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : !items.length ? <div className="card"><Empty icon={Clock} title="No ageing sources" body="None of your cited sources are older than 10 years." /></div> : (
        <div className="space-y-3">
          {items.map((c) => (
            <div key={c.id} className={`card p-5 ${c.outdated.changed ? "border-orange-500/40" : ""}`}>
              <div className="flex flex-wrap items-start gap-3 justify-between">
                <div className="flex-1 min-w-[260px]">
                  {c.outdated.changed && <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 dark:text-orange-400 mb-2"><AlertTriangle size={13} />Potentially outdated evidence – newer research is available.</div>}
                  <p className="text-[15px]">{c.text}</p><div className="text-xs text-muted mt-1">{c.doc_title}</div>
                </div>
                <VerdictBadge verdict={c.verdict} />
              </div>
              <div className="mt-4 grid md:grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface2 p-3.5"><div className="label mb-1">Cited source · {c.outdated.year} · {c.outdated.age} years old</div><div className="text-sm font-serif">{c.paper?.title}</div>
                  {c.evidence?.[0] && <div className="mt-2 text-[13px] font-serif"><mark className="hl hl-support">{c.evidence[0].text}</mark></div>}</div>
                {c.outdated.newer?.length ? c.outdated.newer.map((n: any, i: number) => (
                  <div key={i} className={`rounded-lg p-3.5 border ${n.differs ? "border-orange-500/40 bg-orange-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}><div className="label mb-1">Newer study · {n.year} · {n.differs ? "different findings" : "consistent"}</div><div className="text-sm font-serif">{n.title}</div>
                    {n.finding && <div className="mt-2 text-[13px] font-serif"><mark className={`hl ${n.differs ? "hl-contradict" : "hl-support"}`}>{n.finding}</mark></div>}</div>
                )) : <div className="rounded-lg border border-line p-3.5 text-sm text-muted">{c.outdated.note}</div>}
              </div>
              <div className="mt-3 flex justify-end gap-2"><button className="btn btn-ghost btn-sm" onClick={() => setOpen(c.id)}>Investigate</button></div>
            </div>
          ))}
        </div>
      )}
      <StudentClaimDrawer claimId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ Suggestions */
export function Suggestions() {
  const { query, navigate } = useRouter();
  const { data: claims, loading, reload } = useApi<any[]>("/claims");
  const candidates = (claims || []).filter((c) => c.verdict !== "SUPPORTED");
  const selected = Number(query.get("claim")) || candidates[0]?.id;
  const claim = (claims || []).find((c) => c.id === selected);
  const { data: sugg, loading: sl, error: se, reload: sr } = useApi<any[]>(selected ? `/claims/${selected}/suggestions` : null, [selected]);
  const [preview, setPreview] = useState<any>(null);
  const [confirm, setConfirm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const replace = async () => {
    setBusy(true);
    try {
      const res = await api(`/claims/${selected}/replace`, { body: { paper_id: confirm.paper.id } });
      toast(`Citation replaced – claim re-verified as ${VERDICT_META[res.verdict].label.toLowerCase()}`);
      setConfirm(null); reload(); sr();
    } catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Suggested Citations" subtitle="For unsupported or weak citations, CiteVerify searches for better sources. Nothing is replaced until you review the paper and approve." />
      {loading ? <Loading /> : !candidates.length ? <div className="card"><Empty icon={CheckCircle2} title="All claims are supported" body="No citation needs replacing." /></div> : (
        <div className="grid xl:grid-cols-[340px_1fr] gap-4 items-start">
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-line text-sm font-medium">Claims needing better evidence ({candidates.length})</div>
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-line">
              {candidates.map((c) => (
                <button key={c.id} onClick={() => navigate(`/student/suggestions?claim=${c.id}`)} className={`w-full text-left px-4 py-3 hover:bg-surface2 ${c.id === selected ? "bg-accentsoft" : ""}`}>
                  <VerdictBadge verdict={c.verdict} size="sm" /><div className="text-[13px] mt-1.5 line-clamp-2">{c.text}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {claim && <div className="card p-5"><div className="flex justify-between gap-3"><div className="label">Selected claim</div><VerdictBadge verdict={claim.verdict} /></div><p className="mt-2 text-[15px]">{claim.text}</p>
              <div className="text-xs text-muted mt-2">Current citation: {claim.paper ? `${claim.paper.title} (${claim.paper.year})` : "none / unavailable"}</div>
              {claim.replacement?.to_paper_id && <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">Citation replaced by you · re-verified</div>}</div>}
            {sl ? <Loading rows={3} /> : se ? <ErrorBox error={se} retry={sr} /> : !sugg?.length ? <div className="card"><Empty icon={Lightbulb} title="No suitable alternatives found" body="No paper in the available sources directly addresses this claim. Consider rewording or removing it." /></div> : sugg.map((s: any) => (
              <div key={s.paper.id} className="card p-5">
                <div className="flex flex-wrap items-start gap-3 justify-between">
                  <div className="flex-1 min-w-[260px]"><PaperCite paper={s.paper} /></div>
                  <div className="text-right"><div className="text-xs text-muted">Relevance</div><div className="text-lg font-semibold tabular-nums">{Math.round(s.relevance * 100)}%</div></div>
                </div>
                {s.paper.abstract && <p className="text-sm text-muted mt-3 line-clamp-3">{s.paper.abstract}</p>}
                <div className="mt-3 rounded-lg bg-surface2 p-3 text-sm flex gap-2"><Sparkles size={15} className="text-accent shrink-0 mt-0.5" /><span><b>Why it's relevant: </b>{s.reason} Predicted verdict if cited: <VerdictBadge verdict={s.predicted_verdict} size="sm" /></span></div>
                {s.evidence?.[0] && <div className="mt-3"><EvidenceQuote e={s.evidence[0]} /></div>}
                <div className="mt-4 flex gap-2 justify-end">
                  <button className="btn btn-ghost btn-sm" onClick={() => setPreview(s)}><BookOpen size={14} />Review paper</button>
                  <button className="btn btn-primary btn-sm" onClick={() => setConfirm(s)}><Check size={14} />Replace citation</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Modal open={!!preview} onClose={() => setPreview(null)} title="Review suggested paper" width={760}
        footer={<><button className="btn btn-ghost" onClick={() => setPreview(null)}>Close</button><button className="btn btn-primary" onClick={() => { setConfirm(preview); setPreview(null); }}>Use this paper</button></>}>
        {preview && <div className="space-y-4"><PaperCite paper={preview.paper} /><HighlightedPaper paper={preview.paper} evidence={preview.evidence || []} /></div>}
      </Modal>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Replace citation?"
        footer={<><button className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={replace}>{busy && <Loader2 size={14} className="animate-spin" />}Approve replacement</button></>}>
        {confirm && <div className="space-y-3 text-sm"><p>The citation for this claim will be replaced with:</p><div className="card p-3"><PaperCite paper={confirm.paper} /></div>
          <p className="text-muted">The claim will be re-verified against the new paper. If the new source reports a different value, the verdict will reflect that – update your claim text in your next revision.</p></div>}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ Feedback */
function FeedbackList({ items, onChanged }: { items: any[]; onChanged: () => void }) {
  const { navigate } = useRouter();
  const mark = async (id: number) => { try { await api(`/feedback/${id}/addressed`, { method: "POST" }); toast("Marked as addressed – your professor has been notified"); onChanged(); window.dispatchEvent(new Event("cv-feedback-changed")); } catch (e: any) { toast(e.message, "error"); } };
  if (!items.length) return <div className="card"><Empty icon={MessageSquare} title="No feedback yet" body="When your professor reviews a submission, their feedback appears here." /></div>;
  return (
    <div className="space-y-3">
      {items.map((f) => (
        <div key={f.id} className={`card p-5 ${f.status === "sent" ? "border-accent/40" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="text-xs text-muted">{f.professor_name} · {f.doc_title} (v{f.doc_version}) · {fmtAgo(f.sent_at)}</div>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${f.status === "addressed" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-accentsoft text-accent"}`}>{f.status === "addressed" ? "Addressed" : "Open"}</span>
          </div>
          {f.claim_text && <div className="rounded-lg bg-surface2 p-3 mb-3 text-sm flex gap-2 items-start"><VerdictBadge verdict={f.claim_verdict} size="sm" /><span className="italic">“{f.claim_text}”</span></div>}
          <p className="text-[14.5px] leading-relaxed">{f.body}</p>
          {f.comment && <p className="text-sm mt-2 pl-3 border-l-2 border-accent text-muted">{f.comment}</p>}
          <div className="flex gap-2 justify-end mt-3">
            {f.claim_id && <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/student/evidence?claim=${f.claim_id}`)}>View evidence</button>}
            {f.status === "sent" && <><button className="btn btn-ghost btn-sm" onClick={() => navigate(`/student/verify?revise=${f.doc_id}`)}><Upload size={13} />Upload revision</button><button className="btn btn-primary btn-sm" onClick={() => mark(f.id)}><Check size={13} />Mark addressed</button></>}
          </div>
        </div>
      ))}
    </div>
  );
}
const SEV_ORDER = ["NEEDS HUMAN REVIEW", "UNSUPPORTED", "CONTRADICTORY", "POTENTIALLY OUTDATED", "PARTIALLY SUPPORTED", "SUPPORTED"];
const SEV_LABEL: Record<string, string> = { "POTENTIALLY OUTDATED": "Outdated", "": "General comments" };
const docName = (x: any) => x.doc_title || "Untitled document";
const GRAD = "linear-gradient(90deg,#3b82f6,#6366f1 45%,#4fb286)";
const FB_KPI_CLS = "group card p-6 fade-in w-full cursor-pointer text-left transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
function FbKpi({ label, icon: Icon, tone, children, onClick, active, hint }: { label: string; icon: any; tone: string; children: React.ReactNode; onClick: () => void; active?: boolean; hint: string }) {
  return (
    <button type="button" onClick={onClick} title={hint} className={`${FB_KPI_CLS} flex items-start justify-between gap-3 ${active ? "border-accent/60 ring-1 ring-accent/40" : ""}`}>
      <div className="min-w-0"><div className="text-[12px] font-semibold tracking-[0.08em] uppercase text-muted">{label}</div><div className="mt-3 flex items-baseline gap-3 flex-wrap">{children}</div>
        <div className="text-[11px] text-accent mt-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">{hint} →</div></div>
      <span className={`grid place-items-center size-11 rounded-xl shrink-0 ${tone}`}><Icon size={20} /></span>
    </button>
  );
}
export function FeedbackPage() {
  const { data, loading, error, reload } = useApi<any[]>("/feedback");
  useInterval(() => reload(true), 15000);
  const [f, setF] = useState("sent");
  const [sev, setSev] = useState<string | null>(null);
  const [doc, setDoc] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null), chartsRef = useRef<HTMLDivElement>(null);
  const showList = (tab: string) => { setF(tab); setSev(null); setDoc(null); setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const all = data || [];
  const total = all.length, done = all.filter((x) => x.status === "addressed").length, open = total - done;
  const rate = total ? Math.round((done / total) * 100) : 0;
  const papers = useMemo(() => {
    const m = new Map<string, { title: string; total: number; done: number }>();
    all.forEach((x) => { const k = docName(x); const e = m.get(k) || { title: k, total: 0, done: 0 }; e.total++; if (x.status === "addressed") e.done++; m.set(k, e); });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [data]);
  const sevRows = useMemo(() => {
    const m: Record<string, { open: number; done: number }> = {};
    all.forEach((x) => { const k = x.claim_verdict || ""; m[k] = m[k] || { open: 0, done: 0 }; x.status === "addressed" ? m[k].done++ : m[k].open++; });
    const keys = Object.keys(m).sort((a, b) => (SEV_ORDER.indexOf(a) + 99 * +(a === "")) - (SEV_ORDER.indexOf(b) + 99 * +(b === "")));
    return keys.map((k) => ({ key: k, label: SEV_LABEL[k] ?? VERDICT_META[k]?.label ?? k, ...m[k] }));
  }, [data]);
  const sevMax = Math.max(1, ...sevRows.map((r) => r.open + r.done));
  const trend = useMemo(() => {  // cumulative resolution rate at each day something was sent or addressed
    const days = new Set<string>();
    all.forEach((x) => { [x.sent_at || x.created_at, x.addressed_at].forEach((t) => t && days.add(t.slice(0, 10))); });
    const pts = [...days].sort().map((day) => {
      const end = day + "T23:59:59";
      const sent = all.filter((x) => (x.sent_at || x.created_at || "") <= end).length;
      const fixed = all.filter((x) => x.addressed_at && x.addressed_at <= end).length;
      return { name: new Date(day).toLocaleDateString(undefined, { day: "numeric", month: "short" }), v: sent ? Math.round((fixed / sent) * 100) : 0 };
    });
    const last = pts.slice(-4);
    last.push({ name: "Now", v: rate });
    return last;
  }, [data]);
  const delta = trend.length > 1 ? trend[trend.length - 1].v - trend[0].v : 0;
  const evaluator = all[0]?.professor_name || "";
  const initials = evaluator.replace(/^Dr\.?\s+/i, "").split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  const items = all.filter((x) => (f === "all" || x.status === f) && (sev === null || (x.claim_verdict || "") === sev) && (doc === null || docName(x) === doc));
  const pie = [{ name: "Addressed", value: done, color: "#4fb286", key: "addressed" }, { name: "Open", value: open, color: "#6366f1", key: "sent" }];
  const panel = "rounded-2xl border border-line bg-surface p-6";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold tracking-tight">Professor Feedback</h1>
          <p className="text-[15px] text-muted mt-1 max-w-3xl">Comments from your evaluator on specific claims. Address them in a revised version, then mark them as addressed.</p>
        </div>
        {evaluator && <div className="card px-4 py-2.5 flex items-center gap-3 text-[15px]"><span className="grid place-items-center size-8 rounded-full bg-violet-500/10 text-violet-600 text-xs font-semibold">{initials}</span><span className="text-muted">Evaluator:</span><span className="font-semibold">{evaluator}</span></div>}
      </div>
      {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : (<>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <FbKpi label="Total feedback items" icon={MessageSquareText} tone="bg-indigo-500/10 text-indigo-500" onClick={() => showList("all")} active={f === "all" && sev === null && doc === null} hint="Show all feedback"><span className="text-[38px] font-bold tabular-nums leading-none">{total}</span><span className="text-muted">across {papers.length} paper{papers.length === 1 ? "" : "s"}</span></FbKpi>
          <FbKpi label="Open action items" icon={Clock} tone="bg-blue-500/10 text-blue-600" onClick={() => showList("sent")} active={f === "sent" && sev === null && doc === null} hint="Show open items"><span className="text-[38px] font-bold tabular-nums leading-none text-blue-600">{open}</span>{open > 0 ? <span className="rounded-md bg-amber-500/10 text-amber-600 px-2.5 py-1 text-sm font-medium">Needs revision</span> : <span className="text-emerald-600 text-sm">All clear</span>}</FbKpi>
          <FbKpi label="Addressed & resolved" icon={CheckCircle2} tone="bg-emerald-500/10 text-emerald-600" onClick={() => showList("addressed")} active={f === "addressed" && sev === null && doc === null} hint="Show addressed items"><span className="text-[38px] font-bold tabular-nums leading-none text-emerald-600">{done}</span><span className="text-emerald-600 font-medium">verified</span></FbKpi>
          <button type="button" title="Open feedback analytics" onClick={() => chartsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className={FB_KPI_CLS}>
            <div className="flex items-start justify-between"><div className="text-[12px] font-semibold tracking-[0.08em] uppercase text-muted">Resolution rate</div><div className="text-[32px] font-bold tabular-nums leading-none">{rate}%</div></div>
            <div className="h-2.5 rounded-full bg-surface2 mt-5 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, background: GRAD }} /></div>
            <div className="flex justify-between text-sm text-muted mt-3"><span>{done} of {total} resolved</span><span>Target: 100%</span></div>
            <div className="text-[11px] text-accent mt-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">Open feedback analytics →</div>
          </button>
        </div>

        <div ref={chartsRef} className="card p-6 scroll-mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-line mb-6">
            <div className="flex items-center gap-4">
              <span className="grid place-items-center size-12 rounded-xl bg-indigo-500/10 text-indigo-500"><Activity size={22} /></span>
              <div><div className="text-lg font-semibold">Feedback Analytics &amp; Distribution</div><div className="text-sm text-muted">Click any chart slice, bar, or document row to filter comments below in real time</div></div>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 px-4 py-1.5 text-sm font-medium"><span className="size-2 rounded-full bg-emerald-500 animate-pulse" />Live Sync Enabled</span>
          </div>
          <div className="grid xl:grid-cols-3 gap-5">
            <div className={panel}>
              <div className="flex justify-between items-center mb-4"><div className="font-semibold">Resolution Status</div><span className="text-sm text-muted">Click slice to filter</span></div>
              <div className="flex items-center gap-5 flex-wrap justify-center">
                <div className="relative size-[190px]">
                  <ResponsiveContainer><PieChart><Pie data={pie} dataKey="value" innerRadius={68} outerRadius={92} startAngle={90} endAngle={-270} stroke="none" cursor="pointer" onClick={(d: any) => setF(d?.payload?.key ?? d?.key)}>{pie.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie></PieChart></ResponsiveContainer>
                  <div className="absolute inset-0 grid place-items-center pointer-events-none text-center"><div><div className="text-[30px] font-bold leading-none">{rate}%</div><div className="text-sm text-muted mt-1">Addressed</div></div></div>
                </div>
                <div className="space-y-3 flex-1 min-w-[160px]">
                  {pie.map((p) => (
                    <button key={p.key} type="button" onClick={() => setF(p.key)} className={`w-full text-left rounded-xl border p-3.5 transition-colors hover:border-accent/50 ${f === p.key ? "border-accent/60 bg-accentsoft" : "border-line"}`}>
                      <div className="flex items-center justify-between"><span className="inline-flex items-center gap-2 font-medium"><span className="size-3 rounded-full" style={{ background: p.color }} />{p.name}</span><span className="font-semibold tabular-nums" style={{ color: p.color }}>{p.value}</span></div>
                      <div className="text-sm text-muted mt-1 pl-5">{total ? Math.round((p.value / total) * 100) : 0}% {p.key === "addressed" ? "of total" : "remaining"}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5 rounded-xl border border-line py-2 text-center text-sm text-muted">{total} total evaluator comments · {done} resolved, {open} open</div>
            </div>

            <div className={panel}>
              <div className="flex justify-between items-center mb-5 gap-2 flex-wrap"><div className="font-semibold">Feedback by Issue Severity</div><div className="flex gap-3 text-sm text-muted"><span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-indigo-500" />Open</span><span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-[#4fb286]" />Addressed</span></div></div>
              <div className="space-y-5">
                {sevRows.length === 0 && <div className="text-sm text-muted py-8 text-center">No feedback yet.</div>}
                {sevRows.map((r) => {
                  const Icon = VERDICT_META[r.key]?.icon || MessageSquare;
                  return (
                    <button key={r.key} type="button" onClick={() => setSev(sev === r.key ? null : r.key)} className={`w-full text-left rounded-lg -mx-2 px-2 py-1 transition-colors hover:bg-accentsoft ${sev === r.key ? "bg-accentsoft" : ""}`}>
                      <div className="flex justify-between items-center text-[15px] mb-2"><span className="inline-flex items-center gap-2 font-medium"><Icon size={14} className="text-muted" />{r.label}</span><span className="font-mono text-sm text-muted"><b className="text-blue-600 font-medium">{r.open}</b> open · <b className="text-emerald-600 font-medium">{r.done}</b> done</span></div>
                      <div className="h-3 rounded-full bg-surface2 flex gap-0.5 overflow-hidden">
                        {r.open > 0 && <div className="h-full rounded-full" style={{ width: `${(r.open / sevMax) * 100}%`, background: "linear-gradient(90deg,#3b82f6,#6366f1)" }} />}
                        {r.done > 0 && <div className="h-full rounded-full bg-[#4fb286]" style={{ width: `${(r.done / sevMax) * 100}%` }} />}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 pt-4 border-t border-line flex justify-between text-sm"><span className="text-muted">Click any severity bar to filter</span><button className="text-accent font-medium hover:underline" onClick={() => { setSev(null); setDoc(null); setF("all"); }}>Show all</button></div>
            </div>

            <div className={panel}>
              <div className="flex justify-between items-center mb-4 gap-2"><div className="font-semibold">Resolution Velocity &amp; Papers</div>{trend.length > 1 && <span className="rounded-md bg-emerald-500/10 text-emerald-600 px-2.5 py-1 font-mono text-xs">{trend[0].name} → Now {delta >= 0 ? "+" : ""}{delta}%</span>}</div>
              <div className="rounded-xl border border-line p-3 h-[170px]">
                <ResponsiveContainer><AreaChart data={trend} margin={{ top: 22, right: 22, left: 22, bottom: 0 }}>
                  <defs><linearGradient id="fbVel" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4fb286" stopOpacity={0.25} /><stop offset="100%" stopColor="#4fb286" stopOpacity={0} /></linearGradient>
                    <linearGradient id="fbLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#6366f1" /><stop offset="100%" stopColor="#4fb286" /></linearGradient></defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={[0, 100]} />
                  <Tooltip formatter={(v: any) => [`${v}%`, "Resolved"]} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="v" stroke="url(#fbLine)" strokeWidth={2.5} fill="url(#fbVel)" dot={{ r: 4, fill: "#6366f1", stroke: "var(--surface)", strokeWidth: 2 }} label={{ position: "top", fontSize: 11, fill: "var(--muted)", formatter: (v: any) => `${v}%` }} />
                </AreaChart></ResponsiveContainer>
              </div>
              <div className="space-y-3 mt-5">
                {papers.map((p) => {
                  const pct = Math.round((p.done / p.total) * 100);
                  return (
                    <button key={p.title} type="button" onClick={() => setDoc(doc === p.title ? null : p.title)} className={`w-full text-left rounded-xl border p-3.5 transition-colors hover:border-accent/50 ${doc === p.title ? "border-accent/60 bg-accentsoft" : "border-line"}`}>
                      <div className="flex justify-between gap-3 text-sm"><span className="font-medium truncate">{p.title}</span><span className="font-mono text-muted shrink-0">{p.done}/{p.total} ({pct}%)</span></div>
                      <div className="h-1.5 rounded-full bg-surface2 mt-2.5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: GRAD }} /></div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div ref={listRef} className="flex flex-wrap items-center gap-3 scroll-mt-4">
          <Tabs value={f} onChange={setF} tabs={[{ id: "sent", label: "Open", count: open }, { id: "addressed", label: "Addressed", count: done }, { id: "all", label: "All", count: total }]} />
          {sev !== null && <button className="inline-flex items-center gap-1 rounded-full bg-accentsoft text-accent px-3 py-1 text-sm" onClick={() => setSev(null)}>{SEV_LABEL[sev] ?? VERDICT_META[sev]?.label ?? sev}<X size={13} /></button>}
          {doc !== null && <button className="inline-flex items-center gap-1 rounded-full bg-accentsoft text-accent px-3 py-1 text-sm max-w-xs" onClick={() => setDoc(null)}><span className="truncate">{doc}</span><X size={13} /></button>}
        </div>
        <FeedbackList items={items} onChanged={() => reload(true)} />
      </>)}
    </div>
  );
}

/* ------------------------------------------------------------------ Revision history */
const scoreTone = (v: number) => (v >= 75 ? { text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", word: "Strong" } : v >= 50 ? { text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500", word: "Fair" } : { text: "text-red-600 dark:text-red-400", bar: "bg-red-500", word: "Weak" });
const REV_GROUPS = [
  { id: "fixed", title: "Fixed in this version", hint: "These claims now have better evidence behind them. Nice work.", icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400", ring: "border-emerald-500/30", bg: "bg-emerald-500/10" },
  { id: "problem", title: "New problems", hint: "These appeared or got worse in this version. Check them before you submit.", icon: XCircle, tone: "text-red-600 dark:text-red-400", ring: "border-red-500/30", bg: "bg-red-500/10" },
  { id: "work", title: "Still needs work", hint: "These issues were there before and are still there. Change the wording or cite a better source.", icon: AlertTriangle, tone: "text-amber-600 dark:text-amber-400", ring: "border-amber-500/30", bg: "bg-amber-500/10" },
  { id: "removed", title: "Removed claims", hint: "You deleted these sentences, so they are no longer checked.", icon: Trash2, tone: "text-muted", ring: "border-line", bg: "bg-surface2" },
  { id: "ok", title: "Already fine", hint: "These claims were supported and still are.", icon: ShieldCheck, tone: "text-sky-600 dark:text-sky-400", ring: "border-sky-500/30", bg: "bg-sky-500/10" },
] as const;
function revGroup(r: any): string {
  if (r.type === "removed") return "removed";
  if (r.improved) return "fixed";
  if (r.regressed || (r.type === "new" && r.new?.verdict !== "SUPPORTED")) return "problem";
  return r.new?.verdict === "SUPPORTED" ? "ok" : "work";
}
function RevChange({ r, group }: { r: any; group: string }) {
  const { navigate } = useRouter();
  const textChanged = r.old && r.new && r.old.text !== r.new.text;
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      {r.type === "new" && <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-600 mb-2">New sentence added</div>}
      {r.old && (r.type === "removed" || textChanged) && (
        <div className="mb-2"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">{r.type === "removed" ? "You removed" : "Before"}</div>
          <p className={`text-sm text-muted ${r.type === "removed" ? "line-through decoration-red-500/50" : ""}`}>{r.old.text}</p></div>
      )}
      {r.new && (
        <div><div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">{textChanged ? "Now" : r.type === "new" ? "" : "Claim"}</div><p className="text-sm">{r.new.text}</p></div>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
        {r.old && r.new && r.old.verdict !== r.new.verdict ? <><VerdictBadge verdict={r.old.verdict} size="sm" /><ArrowRight size={13} className="text-muted" /><VerdictBadge verdict={r.new.verdict} size="sm" /></>
          : <VerdictBadge verdict={(r.new || r.old).verdict} size="sm" />}
        {r.citation_replaced && <span className="rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300 px-2 py-0.5">You changed the cited source</span>}
        {r.type === "modified" && !r.citation_replaced && textChanged && <span className="rounded-full bg-surface2 text-muted px-2 py-0.5">Wording changed</span>}
        {r.new?.id && group !== "removed" && <button className="ml-auto text-accent hover:underline" onClick={() => navigate(`/student/evidence?claim=${r.new.id}`)}>See evidence →</button>}
      </div>
    </div>
  );
}
function RevisionStory({ data, doc }: { data: any; doc: any }) {
  const { navigate } = useRouter();
  const s = data.stats;
  const [showOk, setShowOk] = useState(false);
  const grouped = useMemo(() => { const g: Record<string, any[]> = {}; data.rows.forEach((r: any) => (g[revGroup(r)] = [...(g[revGroup(r)] || []), r])); return g; }, [data]);
  const before = scoreTone(s.reliability_before), after = scoreTone(s.reliability_after);
  const up = s.improvement > 0, same = s.improvement === 0;
  const verdict = up ? (s.improvement >= 20 ? "Big improvement" : "Getting better") : same ? "No change in score" : "Score went down";
  return (
    <div className="space-y-5">
      <div className="card p-6">
        <div className="text-sm text-muted">Comparing <b className="text-[var(--text)]">version {data.old.version}</b> ({fmtDate(data.old.created_at)}) with <b className="text-[var(--text)]">version {data.new.version}</b> ({fmtDate(data.new.created_at)})</div>
        <div className="grid md:grid-cols-[1fr_auto_1fr] items-center gap-6 mt-5">
          {[["Before", data.old.version, s.reliability_before, before], ["After", data.new.version, s.reliability_after, after]].map(([lbl, v, val, t]: any, i) => (
            <React.Fragment key={lbl}>
              {i === 1 && <div className={`flex flex-col items-center ${up ? "text-emerald-600" : same ? "text-muted" : "text-red-600"}`}><ArrowRight size={28} /><span className="text-sm font-semibold mt-1">{up ? "+" : ""}{s.improvement} pts</span></div>}
              <div className="rounded-xl bg-surface2 p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">{lbl} · version {v}</div>
                <div className="flex items-baseline gap-2 mt-2"><span className={`text-[40px] font-bold leading-none tabular-nums ${t.text}`}>{val}%</span><span className={`text-sm font-medium ${t.text}`}>{t.word}</span></div>
                <div className="h-2 rounded-full bg-[var(--border)] mt-3 overflow-hidden"><div className={`h-full rounded-full ${t.bar}`} style={{ width: `${val}%` }} /></div>
              </div>
            </React.Fragment>
          ))}
        </div>
        <div className={`mt-5 rounded-xl px-4 py-3 text-[15px] ${up ? "bg-emerald-500/10" : same ? "bg-surface2" : "bg-red-500/10"}`}>
          <b>{verdict}.</b> {up ? "Your claims are better backed by evidence than before." : same ? "Your changes did not change how well your claims are supported." : "Some changes made your claims less supported."}{" "}
          {(grouped.problem?.length || 0) + (grouped.work?.length || 0) > 0
            ? <>You still have <b>{(grouped.problem?.length || 0) + (grouped.work?.length || 0)}</b> claim{(grouped.problem?.length || 0) + (grouped.work?.length || 0) === 1 ? "" : "s"} to fix, listed below.</>
            : <>Nothing is left to fix.</>}
        </div>
        <div className="text-xs text-muted mt-3 flex items-center gap-1.5"><Info size={13} />The evidence score is the share of your claims that the cited sources actually support. We re-check every claim in each new version.</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {REV_GROUPS.map((g) => (
          <a key={g.id} href={`#rev-${g.id}`} onClick={(e) => { e.preventDefault(); if (g.id === "ok") setShowOk(true); setTimeout(() => document.getElementById(`rev-${g.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 30); }}
            className={`card p-4 border ${g.ring} hover:-translate-y-0.5 hover:shadow-md transition-all`}>
            <div className={`flex items-center gap-2 text-sm font-medium ${g.tone}`}><g.icon size={16} />{g.title}</div>
            <div className="text-[28px] font-bold tabular-nums mt-1">{grouped[g.id]?.length || 0}</div>
          </a>
        ))}
      </div>

      {REV_GROUPS.map((g) => {
        const rows = grouped[g.id] || [];
        if (!rows.length) return null;
        const collapsed = g.id === "ok" && !showOk;
        return (
          <section key={g.id} id={`rev-${g.id}`} className="scroll-mt-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3"><span className={`grid place-items-center size-9 rounded-lg ${g.bg} ${g.tone}`}><g.icon size={18} /></span>
                <div><div className="font-semibold">{g.title} <span className="text-muted font-normal">({rows.length})</span></div><div className="text-sm text-muted">{g.hint}</div></div></div>
              {g.id === "ok" && <button className="text-sm text-accent hover:underline shrink-0" onClick={() => setShowOk(!showOk)}>{collapsed ? "Show" : "Hide"}</button>}
            </div>
            {!collapsed && <div className="grid lg:grid-cols-2 gap-3">{rows.map((r: any, i: number) => <RevChange key={i} r={r} group={g.id} />)}</div>}
          </section>
        );
      })}

      {doc && <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <div><div className="font-medium">Ready to improve it further?</div><div className="text-sm text-muted">Fix the claims above, then upload version {data.new.version + 1}. We will compare it with this one.</div></div>
        <button className="btn btn-primary" onClick={() => navigate(`/student/verify?revise=${doc.id}`)}><Upload size={15} />Upload version {data.new.version + 1}</button>
      </div>}
    </div>
  );
}
export function StudentRevisions() {
  const { data, loading, error, reload } = useApi<any[]>("/documents");
  const { query, navigate } = useRouter();
  const chains = useMemo(() => {
    const m: Record<number, any[]> = {};
    (data || []).filter((d) => d.status !== "processing").forEach((d) => (m[d.root_id] = [...(m[d.root_id] || []), d]));
    return Object.values(m).map((vs) => vs.sort((a, b) => a.version - b.version))
      .sort((a, b) => (b.length > 1 ? 1 : 0) - (a.length > 1 ? 1 : 0) || +new Date(b[b.length - 1].created_at) - +new Date(a[a.length - 1].created_at));
  }, [data]);
  const sel = Number(query.get("doc")) || chains.find((c) => c.length > 1)?.slice(-1)[0]?.id;
  const selDoc = (data || []).find((d) => d.id === sel);
  const selChain = chains.find((c) => c.some((v) => v.id === sel));
  const { data: cmp, loading: cl, error: ce } = useApi<any>(selDoc?.prev_id ? `/documents/${sel}/compare` : null, [sel]);
  return (
    <div className="space-y-6">
      <PageHeader title="Revision History" subtitle="See what changed each time you uploaded a new version of a document: which claims you fixed, which still need work, and whether your evidence score went up." />
      {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : !chains.length ? <div className="card"><Empty icon={History} title="No documents yet" body="Upload a document first. When you upload an improved version, the changes show up here." /></div> : (
        <>
          <div>
            <div className="flex items-center gap-2 mb-3"><span className="grid place-items-center size-6 rounded-full bg-accent text-white text-xs font-semibold">1</span><span className="font-medium">Pick a document</span></div>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {chains.map((vs) => {
                const latest = vs[vs.length - 1], active = vs.some((v) => v.id === sel);
                return (
                  <button key={vs[0].id} type="button" onClick={() => navigate(`/student/revisions?doc=${latest.id}`)}
                    className={`card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${active ? "border-accent ring-1 ring-accent/40" : "hover:border-accent/50"}`}>
                    <div className="flex items-start justify-between gap-2"><div className="font-medium text-sm line-clamp-2">{vs[0].title.replace(" (Revised)", "")}</div>{active && <CheckCircle2 size={17} className="text-accent shrink-0" />}</div>
                    <div className="text-xs text-muted mt-1">{vs.length === 1 ? "Only 1 version so far" : `${vs.length} versions`} · last upload {fmtAgo(latest.created_at)}</div>
                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                      {vs.map((v, i) => { const t = scoreTone(v.summary?.reliability ?? 0); return (
                        <React.Fragment key={v.id}>{i > 0 && <ArrowRight size={13} className="text-muted" />}
                          <span className="rounded-lg bg-surface2 px-2.5 py-1 text-xs">v{v.version} <b className={t.text}>{v.summary?.reliability ?? "–"}%</b></span></React.Fragment>); })}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-3"><span className="grid place-items-center size-6 rounded-full bg-accent text-white text-xs font-semibold">2</span><span className="font-medium">See what changed</span></div>
            {!selDoc?.prev_id
              ? <div className="card"><Empty icon={GitCompare} title={selDoc ? "This document has only one version" : "Pick a document above"} body="Upload an improved version of it and we will show you exactly what got better and what still needs work."
                  action={selDoc ? <button className="btn btn-primary btn-sm" onClick={() => navigate(`/student/verify?revise=${selChain?.[selChain.length - 1]?.id ?? selDoc.id}`)}><Upload size={14} />Upload version 2</button> : undefined} /></div>
              : cl ? <Loading rows={4} /> : ce ? <ErrorBox error={ce} /> : cmp && <RevisionStory data={cmp} doc={selChain?.[selChain.length - 1]} />}
          </div>
        </>
      )}
    </div>
  );
}

/* ======================================================================
   PROFESSOR / EVALUATOR PORTAL
   ====================================================================== */
/* Professor / Evaluator portal pages. */
const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text)" };

/* ------------------------------------------------------------------ Overview */
export function ProfessorOverview() {
  const { data, error, loading, reload } = useApi<any>("/professor/overview");
  const { data: sys } = useSystem();
  const { navigate } = useRouter();
  if (loading) return <Loading rows={5} />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;
  const riskData = [{ name: "Low risk", key: "low", v: data.risk.low, c: "#16a34a" }, { name: "Medium risk", key: "medium", v: data.risk.medium, c: "#d97706" }, { name: "High risk", key: "high", v: data.risk.high, c: "#dc2626" }];
  const verdictData = VERDICTS.map((v) => ({ name: VERDICT_META[v].short, verdict: v, v: data.counts[v] || 0, c: VERDICT_META[v].color }));
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Research integrity" title="Evaluator overview" subtitle="A citation is not proof by itself. Review the evidence behind every claim your students submit."
        actions={<button className="btn btn-primary" onClick={() => navigate("/professor/evidence")}><ClipboardCheck size={15} />Investigate claims</button>} />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Students" value={data.students} icon={Users} title="Open student progress" onClick={() => navigate("/professor/progress")} />
        <Stat label="Submissions" value={data.submissions} icon={FileText} title="Open all submissions" onClick={() => navigate("/professor/submissions?tab=all")} />
        <Stat label="Awaiting review" value={data.awaiting} icon={Inbox} tone="bg-indigo-500/10 text-indigo-600 dark:text-indigo-300" title="Open submissions awaiting review" onClick={() => navigate("/professor/submissions?tab=submitted")} />
        <Stat label="Claims needing attention" value={data.attention} icon={AlertTriangle} tone="bg-amber-500/10 text-amber-600" title="Open unreviewed problem claims" onClick={() => navigate("/professor/evidence?review=attention")} />
        <Stat label="Unsupported / contradictory" value={data.unsupported} icon={XCircle} tone="bg-red-500/10 text-red-600" title="Open unsupported and contradictory claims" onClick={() => navigate("/professor/evidence?verdict=UNSUPPORTED,CONTRADICTORY")} />
        <Stat label="Suspicious references" value={data.suspicious_refs} icon={ShieldAlert} tone="bg-rose-500/10 text-rose-600" title="Open reference integrity" onClick={() => navigate("/professor/integrity?tab=refs")} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="font-medium mb-1">Submission risk distribution</div><div className="text-xs text-muted mb-3">Based on unsupported, contradictory and unverifiable claims · click a bar to open those submissions</div>
          <div className="h-[190px]"><ResponsiveContainer><BarChart data={riskData} layout="vertical" margin={{ left: 10, right: 20 }}>
            <XAxis type="number" hide allowDecimals={false} /><YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }} /><Bar dataKey="v" name="Submissions" radius={[0, 6, 6, 0]} barSize={22} cursor="pointer" onClick={(d: any) => navigate(`/professor/submissions?tab=all&risk=${d?.payload?.key ?? d?.key}`)}>{riskData.map((d, i) => <Cell key={i} fill={d.c} />)}</Bar>
          </BarChart></ResponsiveContainer></div>
        </div>
        <div className="card p-5">
          <div className="font-medium mb-1">Claim verdicts across submissions</div><div className="text-xs text-muted mb-3">{Object.values(data.counts as Record<string, number>).reduce((a, b) => a + b, 0)} claims · click a bar to open those claims</div>
          <div className="h-[190px]"><ResponsiveContainer><BarChart data={verdictData} margin={{ left: -20 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }} />
            <Bar dataKey="v" name="Claims" radius={[5, 5, 0, 0]} cursor="pointer" onClick={(d: any) => navigate(`/professor/evidence?verdict=${encodeURIComponent(d?.payload?.verdict ?? d?.verdict)}`)}>{verdictData.map((d, i) => <Cell key={i} fill={d.c} />)}</Bar>
          </BarChart></ResponsiveContainer></div>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="px-5 py-4 border-b border-line flex justify-between items-center"><div className="font-medium">Awaiting your review</div><button className="text-sm text-accent hover:underline" onClick={() => navigate("/professor/submissions")}>All submissions</button></div>
          {data.awaiting_docs.length === 0 ? <Empty icon={CheckCircle2} title="Inbox zero" body="No submissions are waiting for review." /> : (
            <div className="divide-y divide-line">{data.awaiting_docs.map((d: any) => (
              <button key={d.id} onClick={() => navigate(`/professor/evidence?doc=${d.id}`)} className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-surface2">
                <Avatar name={d.owner_name} /><div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{d.title}</div><div className="text-xs text-muted">{d.owner_name} · v{d.version} · submitted {fmtAgo(d.submitted_at)}</div></div>
                <RiskPill risk={d.summary?.risk} /><ChevronRight size={15} className="text-muted" />
              </button>))}</div>
          )}
        </div>
        <div className="card">
          <div className="px-5 py-4 border-b border-line font-medium flex items-center gap-2"><Activity size={15} className="text-accent" />Recent activity</div>
          <div className="px-5 py-3 space-y-0">
            {data.activity.map((a: any, i: number) => (
              <div key={i} className="flex gap-3 py-2.5 relative">
                <div className="flex flex-col items-center"><span className={`size-2.5 rounded-full mt-1.5 ${a.status.startsWith("feedback") ? "bg-accent" : a.status === "submitted" ? "bg-indigo-500" : a.status === "reviewed" ? "bg-emerald-500" : "bg-amber-500"}`} />{i < data.activity.length - 1 && <span className="w-px flex-1 bg-line mt-1" />}</div>
                <div className="flex-1 min-w-0 pb-1"><div className="text-sm">{a.status.startsWith("feedback") ? a.title : <><b className="font-medium">{a.student}</b> · {a.title}{a.version > 1 ? ` (v${a.version})` : ""}</>}</div>
                  <div className="text-xs text-muted flex gap-2 items-center mt-0.5">{!a.status.startsWith("feedback") && <StatusPill status={a.status} />}{fmtAgo(a.at)}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="px-5 py-4 border-b border-line font-medium">Recently reviewed submissions</div>
        <div className="divide-y divide-line">{data.recent_reviewed.map((d: any) => (
          <div key={d.id} className="px-5 py-3 flex items-center gap-3"><Avatar name={d.owner_name} /><div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{d.title}</div><div className="text-xs text-muted">{d.owner_name} · reviewed {fmtDate(d.reviewed_at)}</div></div>
            <span className="text-sm tabular-nums text-muted">{d.summary?.reliability}%</span><StatusPill status={d.status} /></div>))}
          {!data.recent_reviewed.length && <div className="p-5 text-sm text-muted">No reviewed submissions yet.</div>}</div>
      </div>
      <DemoNotice system={sys} />
    </div>
  );
}
function Avatar({ name }: { name: string }) {
  return <span className="size-8 rounded-full bg-accentsoft text-accent grid place-items-center text-xs font-semibold shrink-0">{(name || "?").split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>;
}

/* ------------------------------------------------------------------ Submissions */
export function Submissions() {
  const { data, error, loading, reload } = useApi<any[]>("/documents");
  const { navigate, query } = useRouter();
  const [f, setF] = useState(query.get("tab") || "open");
  const [risk, setRisk] = useState(query.get("risk") || "");
  const [q, setQ] = useState("");
  const setStatus = async (id: number, status: string) => {
    try { await api(`/documents/${id}/status`, { body: { status } }); toast(status === "revision_requested" ? "Revision requested – student notified" : status === "reviewed" ? "Marked as reviewed – student notified" : "Marked as in review"); reload(); }
    catch (e: any) { toast(e.message, "error"); }
  };
  const rows = (data || []).filter((d) => (f === "all" || (f === "open" ? ["submitted", "in_review"].includes(d.status) : d.status === f)) && (!risk || d.summary?.risk === risk) && (!q || (d.title + d.owner_name).toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-5">
      <PageHeader title="Student Submissions" subtitle="Documents students have submitted for evaluation." actions={<>
        <select className="input !w-auto" value={risk} onChange={(e) => setRisk(e.target.value)}><option value="">Any risk</option><option value="high">High risk</option><option value="medium">Medium risk</option><option value="low">Low risk</option></select>
        <SearchBox value={q} onChange={setQ} placeholder="Search student or title…" /></>} />
      <Tabs value={f} onChange={setF} tabs={[{ id: "open", label: "Open", count: data?.filter((d) => ["submitted", "in_review"].includes(d.status)).length }, { id: "submitted", label: "Awaiting review", count: data?.filter((d) => d.status === "submitted").length }, { id: "revision_requested", label: "Revision requested" }, { id: "reviewed", label: "Reviewed" }, { id: "all", label: "All", count: data?.length }]} />
      {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : !rows.length ? <div className="card"><Empty icon={Inbox} title="No submissions here" /></div> : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Student</th><th>Document</th><th>Claims</th><th>Issues</th><th>Reliability</th><th>Risk</th><th>Status</th><th>Submitted</th><th className="text-right">Actions</th></tr></thead>
            <tbody>{rows.map((d) => {
              const c = d.summary?.counts || {};
              return (
                <tr key={d.id} className="clickable" onClick={() => navigate(`/professor/evidence?doc=${d.id}`)}>
                  <td><div className="flex items-center gap-2"><Avatar name={d.owner_name} /><span className="whitespace-nowrap">{d.owner_name}</span></div></td>
                  <td><div className="font-medium">{d.title}</div><div className="text-xs text-muted">Version {d.version}</div></td>
                  <td>{d.summary?.claims}</td>
                  <td className="text-xs whitespace-nowrap"><span className="text-red-600 dark:text-red-400">{(c["UNSUPPORTED"] || 0) + (c["CONTRADICTORY"] || 0)} unsupported</span><br /><span className="text-muted">{d.summary?.suspicious_refs} suspicious refs</span></td>
                  <td className="tabular-nums">{d.summary?.reliability}%</td><td><RiskPill risk={d.summary?.risk} /></td><td><StatusPill status={d.status} /></td>
                  <td className="text-xs text-muted whitespace-nowrap">{fmtDate(d.submitted_at)}</td>
                  <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <a className="btn btn-ghost btn-sm mr-1" href={reportUrl(d.id)} target="_blank" rel="noreferrer" title="PDF report"><Download size={13} /></a>
                    {d.version > 1 && <button className="btn btn-ghost btn-sm mr-1" title="Compare versions" onClick={() => navigate(`/professor/revisions?doc=${d.id}`)}><GitCompare size={13} /></button>}
                    <button className="btn btn-ghost btn-sm mr-1" title="Write feedback" onClick={() => navigate(`/professor/feedback?doc=${d.id}`)}><MessageSquare size={13} /></button>
                    {d.status !== "revision_requested" && <button className="btn btn-ghost btn-sm mr-1" onClick={() => setStatus(d.id, "revision_requested")}>Request revision</button>}
                    {d.status !== "reviewed" && <button className="btn btn-primary btn-sm" onClick={() => setStatus(d.id, "reviewed")}><Check size={13} />Reviewed</button>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Evidence verification dashboard */
function ReviewActions({ c, reload }: { c: any; reload: () => void }) {
  const { navigate } = useRouter();
  const [note, setNote] = useState(c.prof_note || "");
  const [override, setOverride] = useState(c.prof_verdict || "");
  const [busy, setBusy] = useState(false);
  const save = async (review_status: string) => {
    setBusy(true);
    try { await api(`/claims/${c.id}/review`, { method: "PATCH", body: { review_status, prof_verdict: review_status === "overridden" ? override : "", prof_note: note } }); toast("Review saved"); reload(); }
    catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  return (
    <div className="card p-4 w-full space-y-3">
      <div className="flex items-center justify-between"><div className="font-medium text-sm">Evaluator review</div><span className="text-xs text-muted capitalize">Status: {c.review_status}</span></div>
      <textarea className="input min-h-[64px]" placeholder="Private evaluator note (shown in the report)…" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2 items-center">
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => save("confirmed")}><Check size={13} />Confirm verdict</button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => save("flagged")}><Flag size={13} />Flag for follow-up</button>
        <select className="input !w-auto !py-1 text-xs" value={override} onChange={(e) => setOverride(e.target.value)}><option value="">Override verdict…</option>{VERDICTS.map((v) => <option key={v} value={v}>{VERDICT_META[v].label}</option>)}</select>
        <button className="btn btn-ghost btn-sm" disabled={busy || !override} onClick={() => save("overridden")}>Apply override</button>
        <div className="flex-1" />
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/professor/feedback?doc=${c.doc_id}&claim=${c.id}`)}><MessageSquare size={13} />Write feedback</button>
      </div>
    </div>
  );
}
export function ProfClaimDrawer({ claimId, onClose, onChanged }: { claimId: number | null; onClose: () => void; onChanged?: () => void }) {
  return <Drawer open={!!claimId} onClose={onClose} title="Investigation panel" width={820}>{claimId && <ClaimDetail claimId={claimId} onChanged={onChanged} actions={(c, reload) => <ReviewActions c={c} reload={reload} />} />}</Drawer>;
}

/* Full student document with every extracted claim highlighted in its verdict colour. */
const VERDICT_HL: Record<string, string> = {
  "SUPPORTED": "bg-emerald-500/15 shadow-[inset_0_-2px_0_rgba(22,163,74,0.7)]",
  "PARTIALLY SUPPORTED": "bg-amber-400/20 shadow-[inset_0_-2px_0_rgba(202,138,4,0.75)]",
  "POTENTIALLY OUTDATED": "bg-orange-400/20 shadow-[inset_0_-2px_0_rgba(234,88,12,0.75)]",
  "UNSUPPORTED": "bg-red-500/15 shadow-[inset_0_-2px_0_rgba(220,38,38,0.75)]",
  "CONTRADICTORY": "bg-rose-600/15 shadow-[inset_0_-2px_0_rgba(190,18,60,0.8)]",
  "NEEDS HUMAN REVIEW": "bg-slate-400/20 shadow-[inset_0_-2px_0_rgba(100,116,139,0.7)]",
};
function SubmissionDocumentView({ data, onOpenClaim }: { data: any; onOpenClaim: (id: number) => void }) {
  const claims = (data.claims || []) as any[];
  const paragraphs = useMemo(() => {
    const norm = (t: string) => t.replace(/\s+/g, " ").trim();
    return String(data.text || "").split(/\n\s*\n/).map(norm).filter(Boolean).map((para) => {
      const hits: { start: number; end: number; c: any }[] = [];
      claims.forEach((c) => {
        const t = norm(c.text);
        const i = para.indexOf(t);
        if (i >= 0 && !hits.some((h) => i < h.end && i + t.length > h.start)) hits.push({ start: i, end: i + t.length, c });
      });
      hits.sort((a, b) => a.start - b.start);
      const parts: React.ReactNode[] = [];
      let pos = 0;
      hits.forEach((h, k) => {
        if (h.start > pos) parts.push(para.slice(pos, h.start));
        parts.push(
          <mark key={k} onClick={() => onOpenClaim(h.c.id)} title={`Claim ${h.c.idx} · ${VERDICT_META[h.c.verdict]?.label} – click to investigate`}
            className={`cursor-pointer rounded-[3px] px-0.5 text-inherit hover:ring-2 hover:ring-accent/50 ${VERDICT_HL[h.c.verdict] || ""}`}>
            {para.slice(h.start, h.end)}<sup className="ml-0.5 text-[10px] font-sans font-semibold text-muted">#{h.c.idx}</sup>
          </mark>,
        );
        pos = h.end;
      });
      if (pos < para.length) parts.push(para.slice(pos));
      return { parts, heading: para.length < 90 && !/[.:;,]$/.test(para) && !hits.length, refs: /^\s*(references|bibliography)\s*$/i.test(para) };
    });
  }, [data, claims, onOpenClaim]);
  return (
    <div className="grid xl:grid-cols-[1fr_260px] gap-4 items-start">
      <div className="card p-6 sm:p-8 max-h-[78vh] overflow-y-auto">
        <div className="label mb-3">Student document · {data.document.filename}</div>
        <div className="font-serif text-[15px] leading-[1.8] space-y-3.5 max-w-[78ch]">
          {paragraphs.map((p, i) => p.heading
            ? <h3 key={i} className={`font-sans font-semibold ${i === 0 ? "text-xl" : "text-[15px] pt-2"} ${p.refs ? "pt-4 border-t border-line" : ""}`}>{p.parts}</h3>
            : <p key={i}>{p.parts}</p>)}
        </div>
      </div>
      <div className="card p-4 xl:sticky xl:top-20 space-y-2 text-xs">
        <div className="font-semibold text-sm mb-1">Highlight key</div>
        {VERDICTS.map((v) => (
          <div key={v} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2"><mark className={`rounded-[3px] px-2 ${VERDICT_HL[v]}`}>&nbsp;</mark>{VERDICT_META[v].label}</span>
            <span className="tabular-nums text-muted">{claims.filter((c) => c.verdict === v).length}</span>
          </div>
        ))}
        <p className="text-muted pt-2 border-t border-line">Click any highlighted claim to open its evidence. Numbers (#1, #2…) match the claims table.</p>
      </div>
    </div>
  );
}

/* Every paper the submission cites: full available text with the evidence passages highlighted. */
function CitedPapersView({ data, onOpenClaim }: { data: any; onOpenClaim: (id: number) => void }) {
  const claims = (data.claims || []) as any[];
  const refs = (data.references || []) as any[];
  const papers = (data.papers || {}) as Record<string, any>;
  const list = useMemo(() => {
    const ids = new Set<number>([...claims.map((c) => c.paper_id), ...refs.map((r) => r.paper_id)].filter(Boolean));
    return [...ids].map((id) => papers[String(id)]).filter(Boolean).map((p) => ({
      paper: p, ref: refs.find((r) => r.paper_id === p.id), claims: claims.filter((c) => c.paper_id === p.id),
    })).sort((a, b) => (Number(a.ref?.label) || 999) - (Number(b.ref?.label) || 999));
  }, [data]);
  const unavailable = refs.filter((r) => !r.paper_id);
  const [sel, setSel] = useState<number | null>(list[0]?.paper.id ?? null);
  const cur = list.find((x) => x.paper.id === sel) || list[0];
  if (!list.length) return <div className="card"><Empty icon={BookOpen} title="No cited papers could be retrieved" body="The references of this submission could not be found in the scholarly indexes." /></div>;
  return (
    <div className="grid xl:grid-cols-[340px_1fr] gap-4 items-start">
      <div className="card overflow-hidden xl:sticky xl:top-20">
        <div className="px-4 py-3 border-b border-line text-sm font-medium">Cited papers ({list.length} retrieved{unavailable.length ? `, ${unavailable.length} unavailable` : ""})</div>
        <div className="max-h-[70vh] overflow-y-auto divide-y divide-line">
          {list.map((x) => (
            <button key={x.paper.id} onClick={() => setSel(x.paper.id)} className={`w-full text-left px-4 py-3 hover:bg-surface2 ${cur?.paper.id === x.paper.id ? "bg-accentsoft" : ""}`}>
              <div className="text-[11px] text-muted font-mono">{x.ref ? `[${x.ref.label}]` : "–"} · {x.paper.year || "n.d."}</div>
              <div className="text-[13px] font-serif leading-snug line-clamp-2 mt-0.5">{x.paper.title}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {x.claims.map((c) => <span key={c.id} className={`size-2 rounded-full ${VERDICT_META[c.verdict]?.dot}`} title={`Claim ${c.idx}: ${VERDICT_META[c.verdict]?.label}`} />)}
                <span className="text-[11px] text-muted">{x.claims.length} claim{x.claims.length === 1 ? "" : "s"}</span>
                {x.ref && x.ref.meta_status !== "verified" && <span className="text-[10.5px] text-red-600 dark:text-red-400">· reference details incorrect</span>}
              </div>
            </button>
          ))}
          {unavailable.map((r) => (
            <div key={r.id} className="px-4 py-3 opacity-70">
              <div className="text-[11px] text-muted font-mono">[{r.label}] · not retrieved</div>
              <div className="text-[12px] text-muted line-clamp-2 mt-0.5">{r.raw}</div>
            </div>
          ))}
        </div>
      </div>
      {cur && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1 min-w-[260px]"><PaperCite paper={cur.paper} /></div>
              {cur.paper.url && <a className="btn btn-ghost btn-sm" href={cur.paper.url} target="_blank" rel="noreferrer"><ExternalLink size={13} />Open original paper</a>}
            </div>
            {cur.ref && <div className="mt-4"><ReferenceCard r={cur.ref} /></div>}
            {cur.claims.length > 0 && (
              <div className="mt-4">
                <div className="label mb-2">Student claims citing this paper</div>
                <div className="space-y-1.5">
                  {cur.claims.map((c) => (
                    <button key={c.id} onClick={() => onOpenClaim(c.id)} className="w-full text-left flex items-start gap-3 rounded-lg border border-line px-3 py-2 hover:border-accent/50">
                      <span className="text-xs text-muted font-mono pt-0.5">#{c.idx}</span><span className="text-sm flex-1">{c.text}</span><VerdictBadge verdict={c.verdict} size="sm" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4"><div className="label">Full available text</div><HighlightLegend /></div>
            <HighlightedPaper paper={cur.paper} evidence={cur.claims.flatMap((c) => c.evidence || [])} />
          </div>
        </div>
      )}
    </div>
  );
}

export function EvidenceDashboard() {
  const { query, navigate } = useRouter();
  const docId = query.get("doc") || "";
  const { data: docs } = useApi<any[]>("/documents");
  const { data, error, loading, reload } = useApi<any[]>(`/claims${docId ? `?doc_id=${docId}` : ""}`, [docId]);
  const [filter, setFilter] = useState(query.get("verdict") || "ALL");
  const [review, setReview] = useState(query.get("review") || "all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [view, setView] = useState(query.get("view") || "claims");
  const { data: full, loading: fullLoading } = useApi<any>(docId && view !== "claims" ? `/documents/${docId}` : null, [docId, view]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; (data || []).forEach((x) => (c[x.verdict] = (c[x.verdict] || 0) + 1)); return c; }, [data]);
  const verdictSet = filter.split(",");
  const rows = (data || []).filter((c) => (filter === "ALL" || verdictSet.includes(c.verdict)) &&
    (review === "all" || (review === "attention" ? c.verdict !== "SUPPORTED" && c.review_status === "pending" : c.review_status === review)) &&
    (!q || (c.text + c.student_name + c.doc_title + (c.paper?.title || "")).toLowerCase().includes(q.toLowerCase())));
  const doc = (docs || []).find((d) => String(d.id) === docId);
  return (
    <div className="space-y-5">
      <PageHeader title="Evidence Verification" subtitle="Every extracted claim next to the original evidence. Click a row to open the investigation panel."
        actions={<>
          <select className="input w-72" value={docId} onChange={(e) => navigate(`/professor/evidence${e.target.value ? `?doc=${e.target.value}` : ""}`)}>
            <option value="">All submissions</option>{(docs || []).map((d) => <option key={d.id} value={d.id}>{d.owner_name} – {d.title} (v{d.version})</option>)}
          </select>
          {doc && <a className="btn btn-ghost" href={reportUrl(doc.id)} target="_blank" rel="noreferrer"><Download size={14} />PDF</a>}
          {doc && <button className="btn btn-primary" onClick={() => navigate(`/professor/feedback?doc=${doc.id}`)}><Wand2 size={14} />Generate feedback</button>}
        </>} />
      {doc && <div className="card p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"><Avatar name={doc.owner_name} /><div className="flex-1 min-w-[200px]"><div className="font-medium">{doc.title}</div><div className="text-xs text-muted">{doc.owner_name} · version {doc.version} · submitted {fmtDate(doc.submitted_at)}</div></div>
        <span>Reliability <b>{doc.summary?.reliability}%</b></span><RiskPill risk={doc.summary?.risk} /><StatusPill status={doc.status} /></div>}
      <Tabs value={view} onChange={setView} tabs={[{ id: "claims", label: "Claims & evidence", count: data?.length }, { id: "document", label: "Student document" }, { id: "papers", label: "Cited papers" }]} />
      {view !== "claims" && (!docId
        ? <div className="card"><Empty icon={FileText} title="Choose a submission" body="Select a student's submission above to read the full document and the full text of every paper it cites." /></div>
        : fullLoading || !full ? <Loading rows={5} />
        : view === "document" ? <SubmissionDocumentView data={full} onOpenClaim={setOpen} /> : <CitedPapersView key={docId} data={full} onOpenClaim={setOpen} />)}
      {view === "claims" && <>
      {(verdictSet.length > 1 || review === "attention") && (
        <div className="rounded-lg border border-accent/30 bg-accentsoft px-3.5 py-2 text-sm flex flex-wrap items-center gap-2">
          <span className="text-muted">Showing</span>
          {review === "attention" && <b>unreviewed claims that are not fully supported</b>}
          {verdictSet.length > 1 && verdictSet.map((v) => <VerdictBadge key={v} verdict={v} size="sm" />)}
          <button className="ml-auto text-accent text-xs hover:underline" onClick={() => { setFilter("ALL"); setReview("all"); }}>Clear filters</button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3"><VerdictFilter value={filter} onChange={setFilter} counts={counts} />
        <div className="flex gap-2"><select className="input !w-auto" value={review} onChange={(e) => setReview(e.target.value)}><option value="all">Any review status</option><option value="attention">Needs attention (unreviewed issues)</option><option value="pending">Pending review</option><option value="confirmed">Confirmed</option><option value="overridden">Overridden</option><option value="flagged">Flagged</option></select>
          <SearchBox value={q} onChange={setQ} placeholder="Search claims, students, papers…" /></div></div>
      {loading ? <Loading rows={5} /> : error ? <ErrorBox error={error} retry={reload} /> : !rows.length ? <div className="card"><Empty icon={ClipboardCheck} title="No claims match these filters" /></div> : (
        <div className="card overflow-auto max-h-[72vh]">
          <table className="tbl min-w-[1200px]">
            <thead><tr><th>Student</th><th>Document</th><th className="w-[260px]">Extracted claim</th><th>Cited paper</th><th className="w-[300px]">Original evidence passage</th><th>Location</th><th>Result</th><th>Confidence</th><th>Review</th></tr></thead>
            <tbody>{rows.map((c) => {
              const e = c.evidence?.[0];
              return (
                <tr key={c.id} className="clickable" onClick={() => setOpen(c.id)}>
                  <td className="whitespace-nowrap">{c.student_name}</td>
                  <td className="text-xs text-muted max-w-[150px]">{c.doc_title}</td>
                  <td>{c.text}</td>
                  <td className="max-w-[200px] text-xs">{c.paper ? <><div className="font-serif text-[13px] text-ink line-clamp-2">{c.paper.title}</div><div className="text-muted">{c.paper.year}</div></> : <span className="text-muted">{c.citation_labels?.length ? "Unavailable" : "No citation"}</span>}</td>
                  <td>{e ? <span className="font-serif text-[13px]"><mark className={`hl hl-${e.label}`}>{e.text.length > 160 ? e.text.slice(0, 157) + "…" : e.text}</mark></span> : <span className="text-xs text-muted">Source unavailable – manual verification required</span>}</td>
                  <td className="text-xs text-muted whitespace-nowrap">{e ? [e.section, e.page ? "p. " + e.page : ""].filter(Boolean).join(", ") : "–"}</td>
                  <td><VerdictBadge verdict={c.prof_verdict || c.verdict} size="sm" />{c.prof_verdict && <div className="text-[10px] text-muted mt-1">overridden</div>}</td>
                  <td><Confidence value={c.confidence} compact /></td>
                  <td><ReviewPill s={c.review_status} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      </>}
      <ProfClaimDrawer claimId={open} onClose={() => setOpen(null)} onChanged={reload} />
    </div>
  );
}
function ReviewPill({ s }: { s: string }) {
  const m: Record<string, string> = { pending: "bg-slate-500/10 text-muted", confirmed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", overridden: "bg-violet-500/10 text-violet-700 dark:text-violet-300", flagged: "bg-red-500/10 text-red-700 dark:text-red-400" };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${m[s] || m.pending}`}>{s}</span>;
}

/* ------------------------------------------------------------------ Citation intelligence */
export function Intelligence() {
  const { query, navigate } = useRouter();
  const { data, reload } = useApi<any>("/network");
  const { data: docs } = useApi<any[]>("/documents");
  const [open, setOpen] = useState<number | null>(null);
  const docId = query.get("doc") || (docs?.[0] ? String(docs[0].id) : "");
  const focus = query.get("claim") ? Number(query.get("claim")) : null;
  const { data: doc, loading: dl, error: de, reload: dr } = useApi<any>(docId ? `/documents/${docId}` : null, [docId]);
  const setParam = (d: string, claim?: string) => navigate(`/professor/intelligence?doc=${d}${claim ? `&claim=${claim}` : ""}`);
  const patterns = useMemo(() => {
    if (!data) return [];
    return data.nodes.filter((n: any) => n.type === "paper" && (n.data.students || 0) > 1).map((n: any) => {
      const inE = data.edges.filter((e: any) => e.target === n.id && e.source.startsWith("c"));
      const bad = inE.filter((e: any) => ["contradict", "review"].includes(e.kind)).length;
      return { node: n, uses: inE.length, students: n.data.students, bad };
    }).sort((a: any, b: any) => b.students - a.students || b.bad - a.bad);
  }, [data]);
  const reuse = useMemo(() => {
    const m: Record<number, number> = {};
    (data?.nodes || []).forEach((n: any) => { if (n.data?.paper_id && n.data.students) m[n.data.paper_id] = n.data.students; });
    return m;
  }, [data]);
  const broken = (data?.edges || []).filter((e: any) => e.kind === "chain_broken").length;
  const claims = (doc?.claims || []) as any[];
  const counts = claims.reduce((m: Record<string, number>, c) => ((m[c.verdict] = (m[c.verdict] || 0) + 1), m), {});
  const patternsGrid = (
    <div className="card">
      <div className="px-4 py-3 border-b border-line font-medium text-sm flex items-center gap-2"><Repeat size={15} className="text-accent" />Repeatedly used papers<span className="text-xs text-muted font-normal">· cited by 2 or more students</span></div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-px bg-line">
        {patterns.map((p: any) => (
          <div key={p.node.id} className="px-4 py-3 bg-surface">
            <div className="text-[13px] font-serif leading-snug">{p.node.label}</div>
            <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded bg-surface2 px-1.5 py-0.5">{p.students} students</span><span className="rounded bg-surface2 px-1.5 py-0.5">{p.uses} claims</span>
              {p.bad > 0 && <span className="rounded bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5">{p.bad} misrepresent it</span>}
            </div>
            {p.bad > 1 && <div className="text-xs text-muted mt-1.5">Pattern: several students cite this paper for a claim it does not support.</div>}
          </div>
        ))}
        {!patterns.length && <div className="p-4 text-sm text-muted bg-surface">No paper is shared across students yet.</div>}
      </div>
    </div>
  );
  return (
    <div className="space-y-5">
      <PageHeader title="Citation Network Intelligence" subtitle="A mind map of each submission's evidence – cited papers, how they relate to the student's claims, the original sources behind them and newer research. Papers reused across students are flagged."
        actions={<>
          <select className="input w-80" value={docId} onChange={(e) => setParam(e.target.value)}>{!docs?.length && <option value="">No submissions</option>}{(docs || []).map((d) => <option key={d.id} value={d.id}>{d.owner_name} – {d.title} (v{d.version})</option>)}</select>
          <select className="input w-60" value={focus ?? ""} onChange={(e) => setParam(docId, e.target.value)}><option value="">All claims</option>{claims.map((c) => <option key={c.id} value={c.id}>Claim {c.idx}: {c.text.slice(0, 55)}…</option>)}</select>
        </>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Students" value={(data?.nodes || []).filter((n: any) => n.type === "student").length} icon={Users} />
        <Stat label="Claims mapped" value={(data?.nodes || []).filter((n: any) => n.type === "claim").length} icon={FileText} />
        <Stat label="Papers reused by 2+ students" value={patterns.length} icon={Repeat} tone="bg-amber-500/10 text-amber-600" />
        <Stat label="Untraceable chains" value={broken} icon={GitBranch} tone="bg-red-500/10 text-red-600" />
      </div>
      {!docId ? <div className="card"><Empty title="No submissions yet" body="When students submit documents, their citation mind maps appear here." /></div>
          : dl ? <Loading rows={6} /> : de ? <ErrorBox error={de} retry={dr} /> : !doc ? null : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted mr-1">{doc.document.owner_name} · v{doc.document.version}</span>
                {VERDICTS.filter((v) => counts[v]).map((v) => <span key={v} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs"><span className={`size-2 rounded-full ${VERDICT_META[v].dot}`} />{VERDICT_META[v].label}<b className="tabular-nums">{counts[v]}</b></span>)}
              </div>
              <CitationMindMap doc={doc} focusClaim={focus} onOpenClaim={setOpen} reuse={reuse} />
              <MindLegend />
              {patternsGrid}
            </>
          )}
      <ProfClaimDrawer claimId={open} onClose={() => setOpen(null)} onChanged={() => { reload(); dr(); }} />
    </div>
  );
}

/* ------------------------------------------------------------------ Academic integrity */
export function Integrity() {
  const { data: refs, loading } = useApi<any[]>("/references");
  const { data: claims } = useApi<any[]>("/claims");
  const { query } = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [tab, setTab] = useState(query.get("tab") || "refs");
  const chains = (claims || []).filter((c) => c.chain?.original_title && !c.chain.traceable);
  const uncited = (claims || []).filter((c) => c.mismatch?.label === "Missing citation");
  const stats = (claims || []).filter((c) => c.numeric?.some((n: any) => n.match === false));
  const contradictions = (claims || []).filter((c) => c.verdict === "CONTRADICTORY" && !c.numeric?.some((n: any) => n.match === false));
  const ClaimRows = ({ items, render }: { items: any[]; render?: (c: any) => React.ReactNode }) => (
    !items.length ? <div className="card"><Empty icon={CheckCircle2} title="No issues in this category" /></div> :
      <div className="space-y-2">{items.map((c) => (
        <button key={c.id} onClick={() => setOpen(c.id)} className="card w-full text-left p-4 hover:border-accent/50">
          <div className="flex items-center justify-between gap-2 mb-1.5"><span className="text-xs text-muted">{c.student_name} · {c.doc_title}</span><VerdictBadge verdict={c.verdict} size="sm" /></div>
          <p className="text-sm">{c.text}</p>{render?.(c)}
        </button>))}</div>
  );
  return (
    <div className="space-y-5">
      <PageHeader title="Academic Integrity" subtitle="Fabricated or manipulated references, misrepresented statistics, untraceable citation chains and uncited factual claims across all submissions." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "refs", label: "Reference integrity", count: refs?.filter((r) => r.meta_status !== "verified").length }, { id: "stats", label: "Statistical misrepresentation", count: stats.length },
        { id: "contra", label: "Contradicted claims", count: contradictions.length }, { id: "chains", label: "Citation chains", count: chains.length }, { id: "uncited", label: "Uncited claims", count: uncited.length }]} />
      {tab === "refs" && (loading ? <Loading /> : <RefIntegrity refs={refs || []} showStudent />)}
      {tab === "stats" && <ClaimRows items={stats} render={(c) => c.numeric.filter((n: any) => n.match === false).map((n: any, i: number) => <div key={i} className="mt-2 text-xs flex gap-4"><span>Claimed <b>{n.claimed}</b></span><span>Source <b>{n.actual}</b></span><span className="text-red-600 dark:text-red-400">Δ {n.difference_label}</span></div>)} />}
      {tab === "contra" && <ClaimRows items={contradictions} render={(c) => c.evidence?.[0] && <div className="mt-2 text-[13px] font-serif"><mark className="hl hl-contradict">{c.evidence[0].text}</mark></div>} />}
      {tab === "chains" && <ClaimRows items={chains} render={(c) => <div className="mt-2 text-xs text-muted flex items-center gap-1.5 flex-wrap">Claim → <span className="font-serif">{c.paper?.title}</span> → <span className="text-red-600 dark:text-red-400 font-serif">{c.chain.original_title}</span> ({c.chain.original_verdict.toLowerCase()})</div>} />}
      {tab === "uncited" && <ClaimRows items={uncited} />}
      <ProfClaimDrawer claimId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ Revision tracking */
export function ProfessorRevisions() {
  const { query, navigate } = useRouter();
  const { data, error, loading, reload } = useApi<any[]>("/professor/revisions");
  const sel = Number(query.get("doc")) || data?.[0]?.doc.id;
  const { data: cmp, loading: cl, error: ce } = useApi<any>(sel ? `/documents/${sel}/compare` : null, [sel]);
  const item = (data || []).find((x) => x.doc.id === sel);
  const { data: fb } = useApi<any[]>(item ? `/feedback?doc_id=${item.prev.id}` : null, [item?.prev.id]);
  return (
    <div className="space-y-5">
      <PageHeader title="Revision Tracking & Academic Progress" subtitle="Compare original and revised submissions. Every revised claim is re-verified – changed wording is never assumed to be correct." />
      {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : !data?.length ? <div className="card"><Empty icon={GitCompare} title="No revised submissions yet" body="When a student uploads and submits a revised version, the comparison appears here." /></div> : (
        <>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.map((r) => (
              <button key={r.doc.id} onClick={() => navigate(`/professor/revisions?doc=${r.doc.id}`)} className={`card p-4 text-left hover:border-accent/60 ${r.doc.id === sel ? "!border-accent ring-2 ring-accentsoft" : ""}`}>
                <div className="flex items-center gap-2"><Avatar name={r.student_name} /><div className="min-w-0"><div className="text-sm font-medium truncate">{r.student_name}</div><div className="text-xs text-muted truncate">{r.doc.title}</div></div></div>
                <div className="mt-3 flex items-center gap-2 text-sm"><span className="tabular-nums text-muted">v{r.prev.version} {r.stats.reliability_before}%</span><span>→</span><b className="tabular-nums">v{r.doc.version} {r.stats.reliability_after}%</b>
                  <span className={`ml-auto text-xs font-semibold ${r.stats.improvement >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600"}`}>{r.stats.improvement >= 0 ? "+" : ""}{r.stats.improvement}</span></div>
                <div className="mt-2 text-xs text-muted">{r.stats.claims_corrected} corrected · {r.stats.unsupported_remaining} unresolved · {r.stats.new_issues} new issues</div>
              </button>
            ))}
          </div>
          {fb && fb.length > 0 && (
            <div className="card p-4">
              <div className="font-medium text-sm mb-2">Feedback on the previous version</div>
              <div className="flex flex-wrap gap-2">{fb.map((f) => <span key={f.id} className={`rounded-full px-2.5 py-1 text-xs ${f.status === "addressed" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>{f.status === "addressed" ? "✓ addressed" : "open"} · {(f.claim_text || f.body).slice(0, 48)}…</span>)}</div>
            </div>
          )}
          {cl ? <Loading rows={4} /> : ce ? <ErrorBox error={ce} /> : cmp && <Comparison data={cmp} />}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Feedback center */
export function FeedbackCenter() {
  const { query, navigate } = useRouter();
  const docId = query.get("doc") || "";
  const claimParam = query.get("claim");
  const { data: docs } = useApi<any[]>("/documents");
  const { data: sent, reload: reloadSent } = useApi<any[]>("/feedback");
  const [draft, setDraft] = useState<any>(null);
  const [comment, setComment] = useState("");
  const [include, setInclude] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState("");
  const [requestRevision, setRequestRevision] = useState(true);
  const [tab, setTab] = useState("compose");
  const doc = (docs || []).find((d) => String(d.id) === docId);

  const generate = async () => {
    if (!docId) return;
    setBusy("gen");
    try {
      const res = await api("/feedback/generate", { body: { doc_id: Number(docId), claim_ids: claimParam ? [Number(claimParam)] : null } });
      setDraft(res); setInclude(Object.fromEntries(res.items.map((i: any) => [i.claim_id, true])));
    } catch (e: any) { toast(e.message, "error"); } finally { setBusy(""); }
  };
  useEffect(() => { setDraft(null); setComment(""); if (docId) generate(); /* eslint-disable-next-line */ }, [docId, claimParam]);

  const save = async (send: boolean) => {
    if (!draft) return;
    setBusy(send ? "send" : "save");
    try {
      const items = draft.items.filter((i: any) => include[i.claim_id]);
      if (!claimParam) await api("/feedback", { body: { doc_id: Number(docId), body: draft.overall, comment, send } });
      for (const it of items) await api("/feedback", { body: { doc_id: Number(docId), claim_id: it.claim_id, body: it.body, comment: claimParam ? comment : "", send } });
      if (send && requestRevision) await api(`/documents/${docId}/status`, { body: { status: "revision_requested" } });
      toast(send ? `Feedback sent to ${doc?.owner_name}` : "Saved as draft");
      reloadSent(); setDraft(null); setTab("tracker");
    } catch (e: any) { toast(e.message, "error"); } finally { setBusy(""); }
  };
  const sendDraft = async (id: number) => { try { await api(`/feedback/${id}`, { method: "PATCH", body: { send: true } }); toast("Feedback sent"); reloadSent(); } catch (e: any) { toast(e.message, "error"); } };
  const delDraft = async (id: number) => { try { await api(`/feedback/${id}`, { method: "DELETE" }); reloadSent(); } catch (e: any) { toast(e.message, "error"); } };
  const editDraft = async (f: any) => { const body = prompt("Edit feedback", f.body); if (body === null) return; await api(`/feedback/${f.id}`, { method: "PATCH", body: { body } }); reloadSent(); };

  return (
    <div className="space-y-5">
      <PageHeader title="Feedback Center" subtitle="Generate contextual feedback from verification results, edit it, add your own comments and send it to the student." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "compose", label: "Compose" }, { id: "tracker", label: "Feedback tracker", count: sent?.length }]} />
      {tab === "compose" && (
        <div className="grid xl:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            <div className="card p-4 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[260px]"><label className="label">Submission</label>
                <select className="input mt-1.5" value={docId} onChange={(e) => navigate(`/professor/feedback${e.target.value ? `?doc=${e.target.value}` : ""}`)}>
                  <option value="">Select a submission…</option>{(docs || []).map((d) => <option key={d.id} value={d.id}>{d.owner_name} – {d.title} (v{d.version})</option>)}
                </select></div>
              <button className="btn btn-primary" disabled={!docId || busy === "gen"} onClick={generate}>{busy === "gen" ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}Regenerate</button>
            </div>
            {!docId ? <div className="card"><Empty icon={MessageSquare} title="Choose a submission" body="Feedback is generated automatically from weak claims, incorrect references, unsupported evidence and statistical mismatches." /></div>
              : busy === "gen" || !draft ? <Loading rows={4} /> : (
                <div className="card">
                  <div className="px-5 py-3.5 border-b border-line flex items-center justify-between"><div className="font-medium flex items-center gap-2"><Sparkles size={15} className="text-accent" />Feedback editor</div>
                    <span className="text-xs text-muted">{draft.engine === "llm" ? "Drafted with Claude from verified findings" : "Generated from verification findings"} · fully editable</span></div>
                  <div className="p-5 space-y-4">
                    {!claimParam && <div><label className="label">Overall summary</label><textarea className="input mt-1.5 min-h-[80px] leading-relaxed" value={draft.overall} onChange={(e) => setDraft({ ...draft, overall: e.target.value })} /></div>}
                    {draft.items.length === 0 && <div className="text-sm text-muted">Every claim in this submission is supported – no issue-specific feedback was generated.</div>}
                    {draft.items.map((it: any, i: number) => (
                      <div key={it.claim_id} className={`rounded-xl border p-4 ${include[it.claim_id] ? "border-line" : "border-dashed border-line opacity-55"}`}>
                        <div className="flex items-start gap-3 mb-2">
                          <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={!!include[it.claim_id]} onChange={(e) => setInclude({ ...include, [it.claim_id]: e.target.checked })} />
                          <div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-1"><VerdictBadge verdict={it.verdict} size="sm" /><span className="text-xs text-muted">Claim</span></div><p className="text-sm italic text-muted">“{it.claim_text}”</p></div>
                        </div>
                        <textarea className="input min-h-[84px] leading-relaxed" value={it.body} onChange={(e) => { const items = [...draft.items]; items[i] = { ...it, body: e.target.value }; setDraft({ ...draft, items }); }} />
                      </div>
                    ))}
                    <div><label className="label">Personal comment (optional)</label><textarea className="input mt-1.5 min-h-[64px]" placeholder="e.g. Good structure overall – focus on the statistical claims before resubmitting." value={comment} onChange={(e) => setComment(e.target.value)} /></div>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--accent)]" checked={requestRevision} onChange={(e) => setRequestRevision(e.target.checked)} />Request a revised version when sending</label>
                  </div>
                  <div className="px-5 py-3.5 border-t border-line flex justify-end gap-2">
                    <button className="btn btn-ghost" disabled={!!busy} onClick={() => save(false)}>{busy === "save" && <Loader2 size={14} className="animate-spin" />}Save draft</button>
                    <button className="btn btn-primary" disabled={!!busy} onClick={() => save(true)}>{busy === "send" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Send to {doc?.owner_name?.split(" ")[0] || "student"}</button>
                  </div>
                </div>
              )}
          </div>
          <div className="card p-4 space-y-3 text-sm">
            <div className="font-medium">How feedback is generated</div>
            {["Numerical mismatches quote both the claimed and the source value", "Topic mismatches explain why the cited paper is irrelevant", "Overgeneralizations reference the authors' stated limitations", "Outdated evidence names the newer study", "Unverifiable references ask the student to check DOI, authors and year"].map((x) => <div key={x} className="flex gap-2 text-muted"><Check size={14} className="text-emerald-500 shrink-0 mt-0.5" />{x}</div>)}
            <p className="text-xs text-muted pt-2 border-t border-line">Facts in the feedback (values, titles) come from verified evidence only. Students see feedback in their dashboard and get a notification.</p>
          </div>
        </div>
      )}
      {tab === "tracker" && (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Student</th><th>Document</th><th className="w-[45%]">Feedback</th><th>Status</th><th>Sent</th><th className="text-right">Actions</th></tr></thead>
            <tbody>{(sent || []).map((f) => (
              <tr key={f.id}>
                <td className="whitespace-nowrap">{f.student_name}</td><td className="text-xs text-muted">{f.doc_title} (v{f.doc_version})</td>
                <td><div className="text-sm">{f.body}</div>{f.comment && <div className="text-xs text-muted mt-1 pl-2 border-l-2 border-accent">{f.comment}</div>}</td>
                <td><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${f.status === "addressed" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : f.status === "sent" ? "bg-accentsoft text-accent" : "bg-slate-500/10 text-muted"}`}>{f.status === "sent" ? "Awaiting student" : f.status}</span></td>
                <td className="text-xs text-muted whitespace-nowrap">{f.sent_at ? fmtAgo(f.sent_at) : "–"}</td>
                <td className="text-right whitespace-nowrap">{f.status === "draft" && <>
                  <button className="btn btn-ghost btn-sm mr-1" onClick={() => editDraft(f)}><Pencil size={13} /></button>
                  <button className="btn btn-ghost btn-sm mr-1" onClick={() => delDraft(f.id)}><Trash2 size={13} /></button>
                  <button className="btn btn-primary btn-sm" onClick={() => sendDraft(f.id)}><Send size={13} />Send</button></>}</td>
              </tr>
            ))}</tbody>
          </table>
          {!sent?.length && <Empty icon={MessageSquare} title="No feedback yet" />}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Student progress */
type ProgressStatus = "attention" | "growth" | "track" | "moderate" | "none";
const PROGRESS_STATUS: Record<ProgressStatus, { label: string; pill: string; tile: string; stroke: string; fill: string }> = {
  attention: { label: "Needs Attention", pill: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300", tile: "bg-red-50 dark:bg-red-500/10", stroke: "#6d28d9", fill: "#8b5cf6" },
  growth: { label: "Strong Growth", pill: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", tile: "bg-emerald-50 dark:bg-emerald-500/10", stroke: "#6d28d9", fill: "#8b5cf6" },
  track: { label: "On Track", pill: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", tile: "bg-sky-50 dark:bg-sky-500/10", stroke: "#6d28d9", fill: "#8b5cf6" },
  moderate: { label: "Moderate", pill: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", tile: "bg-amber-50 dark:bg-amber-500/10", stroke: "#d4a017", fill: "#f2c94c" },
  none: { label: "No submissions", pill: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300", tile: "bg-slate-50 dark:bg-slate-500/10", stroke: "#94a3b8", fill: "#cbd5e1" },
};
function progressStatus(s: any): ProgressStatus {
  if (!s.timeline.length) return "none";
  const latest = s.latest_reliability ?? 0;
  const delta = s.timeline.length > 1 ? latest - (s.first_reliability ?? latest) : 0;
  if (latest < 50 || delta <= -10) return "attention";
  if (delta >= 15) return "growth";
  if (latest >= 70) return "track";
  return "moderate";
}

function ProgressSummaryTile({ label, value, icon: Icon, cls, iconCls, active, onClick, title }: { label: string; value: React.ReactNode; icon: any; cls: string; iconCls: string; active?: boolean; onClick?: () => void; title?: string }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={`flex items-center gap-4 rounded-2xl border px-5 py-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${cls} ${active ? "ring-2 ring-accent" : ""}`}>
      <span className={`grid place-items-center size-12 rounded-xl ${iconCls}`}><Icon size={22} /></span>
      <span><span className="block text-sm text-muted">{label}</span><span className="block text-[26px] font-semibold leading-tight tabular-nums">{value}</span></span>
    </button>
  );
}

export function Progress() {
  const { data, error, loading, reload } = useApi<any[]>("/professor/students");
  const { navigate } = useRouter();
  const [only, setOnly] = useState<ProgressStatus | "">("");
  const students = data || [];
  const withSubs = students.filter((s) => s.timeline.length);
  const cohortAvg = withSubs.length ? Math.round(withSubs.reduce((a, s) => a + (s.latest_reliability || 0), 0) / withSubs.length) : 0;
  const totalSubs = students.reduce((a, s) => a + s.submissions, 0);
  const sent = students.reduce((a, s) => a + s.feedback_sent, 0);
  const addressed = students.reduce((a, s) => a + s.feedback_addressed, 0);
  const attentionCount = students.filter((s) => progressStatus(s) === "attention").length;
  const visible = students.filter((s) => !only || progressStatus(s) === only);
  return (
    <div className="space-y-6">
      <PageHeader title="Student Progress" subtitle="Evidence reliability across each student's submissions and how they respond to feedback." />
      {loading ? <Loading rows={4} /> : error ? <ErrorBox error={error} retry={reload} /> : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <ProgressSummaryTile label="Cohort Avg" value={`${cohortAvg}%`} icon={Gauge} title="Show all students" onClick={() => setOnly("")}
              cls="bg-gradient-to-br from-violet-50 to-white border-violet-100 dark:from-violet-500/10 dark:to-surface dark:border-violet-500/20" iconCls="bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300" />
            <ProgressSummaryTile label="Total Submissions" value={totalSubs} icon={FileText} title="Open all submissions" onClick={() => navigate("/professor/submissions?tab=all")}
              cls="bg-gradient-to-br from-sky-50 to-white border-sky-100 dark:from-sky-500/10 dark:to-surface dark:border-sky-500/20" iconCls="bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300" />
            <ProgressSummaryTile label="Feedback Addressed" value={sent ? `${Math.round((addressed / sent) * 100)}%` : "–"} icon={CheckCircle2} title="Open the feedback tracker" onClick={() => navigate("/professor/feedback")}
              cls="bg-gradient-to-br from-emerald-50 to-white border-emerald-100 dark:from-emerald-500/10 dark:to-surface dark:border-emerald-500/20" iconCls="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300" />
            <ProgressSummaryTile label="Needs Attention" value={attentionCount} icon={AlertTriangle} active={only === "attention"} title="Show only students who need attention" onClick={() => setOnly(only === "attention" ? "" : "attention")}
              cls="bg-gradient-to-br from-amber-50 to-white border-amber-100 dark:from-amber-500/10 dark:to-surface dark:border-amber-500/20" iconCls="bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300" />
          </div>
          {only && (
            <div className="rounded-lg border border-accent/30 bg-accentsoft px-3.5 py-2 text-sm flex items-center gap-2">
              <span className="text-muted">Showing</span><b>{PROGRESS_STATUS[only].label}</b><span className="text-muted">students</span>
              <button className="ml-auto text-accent text-xs hover:underline" onClick={() => setOnly("")}>Show all students</button>
            </div>
          )}
          <div className="grid lg:grid-cols-2 gap-5">
            {visible.map((s) => {
              const st = progressStatus(s);
              const meta = PROGRESS_STATUS[st];
              const delta = s.timeline.length > 1 ? (s.latest_reliability ?? 0) - (s.first_reliability ?? 0) : null;
              const series = s.timeline.map((t: any, i: number) => ({ name: `#${i + 1} v${t.version}`, v: t.reliability, title: t.title }));
              const gid = `prog-${s.student.id}`;
              const latestDoc = s.timeline[s.timeline.length - 1];
              return (
                <div key={s.student.id} className="card rounded-2xl p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="size-11 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200 grid place-items-center text-sm font-semibold shrink-0">
                      {s.student.name.split(" ").map((x: string) => x[0]).join("").slice(0, 2)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[17px] font-semibold leading-tight">{s.student.name}</div>
                      <div className="text-xs text-muted truncate mt-0.5">{s.student.program} · {s.student.email}</div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${meta.pill}`}>{meta.label}</span>
                    {s.latest_reliability !== null && (
                      <div className="text-right shrink-0 -mt-1">
                        <div className="text-[28px] font-semibold leading-none tabular-nums">{s.latest_reliability}%</div>
                        {delta !== null && delta !== 0 && <div className={`text-xs font-medium mt-1 ${delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{delta > 0 ? "▲" : "▼"} {Math.abs(delta)} pts</div>}
                      </div>
                    )}
                  </div>
                  {series.length === 0 ? <div className="h-[150px] grid place-items-center text-sm text-muted">No submissions yet.</div> : (
                    <div className="h-[150px] mt-4">
                      <ResponsiveContainer>
                        <AreaChart data={series.length === 1 ? [{ ...series[0], name: "" }, { ...series[0], mark: true }, { ...series[0], name: " " }] : series.map((d: any) => ({ ...d, mark: true }))} margin={{ left: -24, right: 10, top: 8, bottom: 0 }}>
                          <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={meta.fill} stopOpacity={0.45} /><stop offset="100%" stopColor={meta.fill} stopOpacity={0.03} /></linearGradient></defs>
                          <CartesianGrid vertical={false} stroke="var(--border)" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v + "%", "Reliability"]} labelFormatter={(l: any, p: any) => p?.[0]?.payload?.title || l} />
                          <Area type="monotone" dataKey="v" stroke={meta.stroke} strokeWidth={2.5} fill={`url(#${gid})`}
                            dot={(pr: any) => pr.payload?.mark ? <circle key={pr.index} cx={pr.cx} cy={pr.cy} r={5} fill={meta.stroke} stroke="var(--surface)" strokeWidth={2} /> : <g key={pr.index} />} activeDot={{ r: 6 }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl py-2.5 bg-violet-100/70 dark:bg-violet-500/15"><div className="text-xs text-muted">Submissions</div><div className="text-xl font-semibold tabular-nums">{s.submissions}</div></div>
                    <div className={`rounded-xl py-2.5 ${meta.tile}`}><div className="text-xs text-muted">Feedback sent</div><div className="text-xl font-semibold tabular-nums">{s.feedback_sent}</div></div>
                    <div className={`rounded-xl py-2.5 ${meta.tile}`}><div className="text-xs text-muted">Addressed</div><div className="text-xl font-semibold tabular-nums">{s.feedback_addressed}/{s.feedback_sent}</div></div>
                  </div>
                  {latestDoc && (
                    <button className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium px-4 py-1.5 transition-colors dark:bg-violet-600 dark:hover:bg-violet-500"
                      onClick={() => navigate(`/professor/evidence?doc=${latestDoc.doc_id}`)}>Open latest submission <ArrowRight size={14} /></button>
                  )}
                </div>
              );
            })}
            {!visible.length && <div className="card lg:col-span-2"><Empty icon={Users} title="No students in this group" /></div>}
          </div>
        </>
      )}
    </div>
  );
}


/* ======================================================================
   LOGIN, PORTAL SHELL & ROUTING
   ====================================================================== */
/* ------------------------------------------------------------------ Auth context */
type User = { id: number; email: string; name: string; role: "student" | "professor"; program: string };
const AuthCtx = createContext<{ user: User | null; setUser: (u: User | null) => void; logout: () => void }>({ user: null, setUser: () => {}, logout: () => {} });
export const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.token ? auth.user() : null);
  const { navigate } = useRouter();
  const logout = () => { auth.clear(); setUser(null); navigate("/"); };
  useEffect(() => {
    const on = () => { setUser(null); navigate("/"); };
    window.addEventListener("cv-logout", on);
    return () => window.removeEventListener("cv-logout", on);
  }, [navigate]);
  return <AuthCtx.Provider value={{ user, setUser, logout }}>{children}</AuthCtx.Provider>;
}

/* ------------------------------------------------------------------ Login (reference design) */
/* Original reference illustrations (frontend/src/*.png), embedded unmodified into the built page. */
function Illustration({ role }: { role: "student" | "professor" }) {
  return (
    <div className="bg-white rounded-[22px] overflow-hidden w-full aspect-[682/546]">
      <img src={role === "student" ? studentImg : professorImg} alt={role === "student" ? "Student with graduation cap working on a laptop" : "Professor holding a book and raising a finger"}
        className="w-full h-full object-cover" draggable={false} />
    </div>
  );
}

/* Animated, seamlessly looping scene shown after choosing the Student Portal (10 s loop, pausable, honours reduced-motion). */
function StudentAnimation() {
  const [paused, setPaused] = useState(false);
  const particles = Array.from({ length: 12 }, (_, i) => ({
    left: 62 + (i % 4) * 3, top: 58 + (i % 3) * 5, delay: (i * 0.83) % 10, dur: 4.2 + (i % 4) * 0.7,
    dx: 120 + (i % 5) * 40, dy: -(70 + (i % 4) * 45), color: i % 2 ? "#a855f7" : "#3b82f6", size: 5 + (i % 3) * 2,
  }));
  const chip = "absolute flex items-center gap-1.5 rounded-xl bg-white/90 backdrop-blur px-2.5 py-1.5 text-[11px] font-semibold text-[#1e293b] shadow-[0_8px_24px_-8px_rgba(30,41,90,0.35)] ring-1 ring-black/5";
  return (
    <div className={`cv-anim relative bg-white rounded-[22px] overflow-hidden w-full aspect-[682/546] ${paused ? "cv-paused" : ""}`}
      role="img" aria-label="Animated scene: a student verifies research citations on her laptop while papers, citations and verified checkmarks float around her">
      {/* soft blue / purple lighting */}
      <div className="absolute -left-1/4 -top-1/3 w-3/4 h-3/4 rounded-full bg-blue-400/20 blur-3xl cv-glow" />
      <div className="absolute -right-1/4 -bottom-1/3 w-3/4 h-3/4 rounded-full bg-violet-400/20 blur-3xl cv-glow" style={{ animationDelay: "-2.5s" }} />
      {/* the student */}
      <img src={studentImg} alt="" className="relative w-full h-full object-cover cv-breathe" draggable={false} />
      {/* laptop screen light, as if she is typing */}
      <div className="absolute left-[56%] top-[50%] w-[30%] h-[34%] rounded-full cv-screen"
        style={{ background: "radial-gradient(closest-side, rgba(96,165,250,0.45), rgba(167,139,250,0.18), transparent)" }} />
      <div className="absolute left-[73%] top-[50%] flex gap-1 rounded-full bg-white/95 px-2 py-1.5 shadow-md ring-1 ring-black/5">
        {[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-blue-500 cv-type" style={{ animationDelay: `${i * 0.18}s` }} />)}
      </div>
      {/* citation link drawn from the laptop to the citation chip */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 80" preserveAspectRatio="none">
        <defs><linearGradient id="cvLink" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#3b82f6" /><stop offset="1" stopColor="#a855f7" /></linearGradient></defs>
        <path d="M72 51 C 80 40, 77 22, 85 13" fill="none" stroke="url(#cvLink)" strokeWidth="0.45" strokeLinecap="round" pathLength={60} strokeDasharray="60" className="cv-draw" />
      </svg>
      {/* floating academic elements */}
      <div className={`${chip} left-[4%] top-[7%] cv-float`} style={{ ["--r" as any]: "-4deg" }}>
        <FileText size={14} className="text-blue-600" /><span className="flex flex-col gap-0.5"><span>Research paper</span><span className="h-1 w-14 rounded bg-slate-200" /><span className="h-1 w-10 rounded bg-slate-200" /></span>
      </div>
      <div className={`${chip} left-[79%] top-[6%] cv-float`} style={{ animationDelay: "-1.5s", ["--r" as any]: "5deg" }}>
        <span className="font-mono text-violet-600">[1]</span><span>Citation</span>
      </div>
      <div className={`${chip} left-[3%] top-[42%] cv-float`} style={{ animationDelay: "-3s", ["--r" as any]: "3deg" }}>
        <BookOpen size={14} className="text-violet-600" /><span>Evidence</span>
      </div>
      <div className={`${chip} left-[84%] top-[36%] cv-float !px-2`} style={{ animationDelay: "-2.2s", ["--r" as any]: "-6deg" }}>
        <span className="font-serif text-lg leading-none text-blue-600">“</span><span>Claim</span>
      </div>
      <div className="absolute left-[71%] top-[23%] cv-pop" style={{ animationDelay: "1.2s" }}>
        <CheckCircle2 size={26} className="text-emerald-500 drop-shadow" strokeWidth={2.5} />
      </div>
      <div className="absolute left-[22%] top-[24%] cv-pop" style={{ animationDelay: "5.6s" }}>
        <CheckCircle2 size={20} className="text-emerald-500 drop-shadow" strokeWidth={2.5} />
      </div>
      {/* collaboration particles drifting towards the evaluator side */}
      {particles.map((p, i) => (
        <span key={i} className="absolute rounded-full cv-particle"
          style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size, background: p.color, boxShadow: `0 0 10px ${p.color}`,
            animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, ["--dx" as any]: `${p.dx}px`, ["--dy" as any]: `${p.dy}px` }} />
      ))}
      {/* verification badge */}
      <div className="absolute left-[4%] bottom-[7%] flex items-center gap-2 rounded-2xl bg-white/95 px-3 py-2 shadow-[0_10px_30px_-10px_rgba(16,185,129,0.6)] ring-1 ring-emerald-500/30 cv-badge">
        <span className="grid place-items-center size-6 rounded-full bg-emerald-500 text-white"><Check size={14} strokeWidth={3} /></span>
        <span className="leading-tight"><span className="block text-[11px] font-bold text-emerald-700">Claim verified</span><span className="block text-[10px] text-slate-500">Evidence found · p. 5</span></span>
      </div>
      {/* opening fade from dark */}
      <div className="absolute inset-0 bg-black pointer-events-none cv-intro" />
      <button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? "Play animation" : "Pause animation"}
        className="absolute right-3 bottom-3 grid place-items-center size-8 rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/60 transition-colors">
        {paused ? <span className="ml-0.5 border-y-[5px] border-y-transparent border-l-[8px] border-l-white" /> : <span className="flex gap-[3px]"><span className="w-[3px] h-[10px] bg-white rounded-sm" /><span className="w-[3px] h-[10px] bg-white rounded-sm" /></span>}
      </button>
    </div>
  );
}

/* Animated, seamlessly looping scene shown after choosing the Professor Portal (10 s loop, pausable, honours reduced-motion). */
function ProfessorAnimation() {
  const [paused, setPaused] = useState(false);
  // small academic tokens that drift into the verification seal (top-right) between ~5.5 s and 7.5 s
  const tokens = [
    { x0: "6%", y0: "14%", icon: FileText, cls: "text-violet-600" }, { x0: "10%", y0: "62%", icon: BookOpen, cls: "text-indigo-600" },
    { x0: "44%", y0: "6%", icon: Quote, cls: "text-violet-500" }, { x0: "88%", y0: "52%", icon: FileSearch, cls: "text-blue-600" },
    { x0: "60%", y0: "82%", icon: ShieldCheck, cls: "text-emerald-600" }, { x0: "26%", y0: "84%", icon: Hash, cls: "text-fuchsia-600" },
  ];
  const sparks = Array.from({ length: 10 }, (_, i) => ({
    left: 8 + ((i * 37) % 84), top: 10 + ((i * 53) % 78), delay: (i * 0.9) % 10, dur: 5 + (i % 4), size: 4 + (i % 3) * 2, color: i % 2 ? "#a78bfa" : "#60a5fa",
  }));
  const chip = "absolute flex items-center gap-1.5 rounded-xl bg-white/90 backdrop-blur px-2.5 py-1.5 text-[11px] font-semibold text-[#2e1065] shadow-[0_8px_24px_-8px_rgba(76,29,149,0.4)] ring-1 ring-black/5";
  return (
    <div className={`cv-anim relative bg-white rounded-[22px] overflow-hidden w-full aspect-[682/546] ${paused ? "cv-paused" : ""}`}
      role="img" aria-label="Animated scene: the professor explains with a raised finger while research papers and citations drift into a glowing verification seal">
      {/* soft violet / blue lighting */}
      <div className="absolute -left-1/4 -top-1/3 w-3/4 h-3/4 rounded-full bg-violet-400/20 blur-3xl cv-glow" />
      <div className="absolute -right-1/4 -bottom-1/3 w-3/4 h-3/4 rounded-full bg-blue-400/20 blur-3xl cv-glow" style={{ animationDelay: "-2.5s" }} />
      {/* the professor */}
      <img src={professorImg} alt="" className="relative w-full h-full object-cover cv-breathe" draggable={false} />
      {/* explaining gesture: a spark at the raised fingertip */}
      <div className="absolute left-[29.5%] top-[21%] -translate-x-1/2 -translate-y-1/2 size-16 rounded-full cv-finger"
        style={{ background: "radial-gradient(closest-side, rgba(250,204,21,0.55), rgba(167,139,250,0.35), transparent)" }} />
      <Sparkles size={18} className="absolute left-[27.5%] top-[14%] text-amber-400 cv-finger-icon" />
      {/* the book: soft light and pages drifting up */}
      <div className="absolute left-[60%] top-[50%] w-[24%] h-[22%] rounded-full cv-book"
        style={{ background: "radial-gradient(closest-side, rgba(196,181,253,0.55), rgba(96,165,250,0.18), transparent)" }} />
      {[0, 1, 2].map((i) => (
        <span key={i} className="absolute w-[18px] h-[23px] rounded-[3px] bg-white shadow-md ring-1 ring-violet-200 cv-page"
          style={{ left: `${66 + i * 4}%`, top: "56%", animationDelay: `${i * 0.35}s`, ["--r" as any]: `${-12 + i * 12}deg` }}>
          <span className="absolute left-[3px] right-[3px] top-[5px] h-[2px] bg-violet-200 rounded" /><span className="absolute left-[3px] right-[6px] top-[10px] h-[2px] bg-violet-200 rounded" />
          <span className="absolute left-[3px] right-[4px] top-[15px] h-[2px] bg-violet-200 rounded" />
        </span>
      ))}
      {/* floating academic elements */}
      <div className={`${chip} left-[4%] top-[36%] cv-float`} style={{ ["--r" as any]: "-3deg" }}><ClipboardCheck size={14} className="text-violet-600" /><span>Review</span></div>
      <div className={`${chip} left-[66%] top-[6%] cv-float`} style={{ animationDelay: "-1.6s", ["--r" as any]: "4deg" }}><span className="font-mono text-violet-600">[12]</span><span>Citation</span></div>
      <div className={`${chip} left-[78%] top-[42%] cv-float`} style={{ animationDelay: "-3s", ["--r" as any]: "-5deg" }}><BookOpen size={14} className="text-indigo-600" /><span>Evidence</span></div>
      {/* tokens converging into the seal */}
      {tokens.map((t, i) => {
        const Icon = t.icon;
        return (
          <span key={i} className="absolute grid place-items-center size-7 -ml-3.5 -mt-3.5 rounded-lg bg-white/95 shadow-md ring-1 ring-violet-200 cv-converge"
            style={{ ["--x0" as any]: t.x0, ["--y0" as any]: t.y0, ["--x1" as any]: "88%", ["--y1" as any]: "25%", animationDelay: `${i * 0.12}s` }}>
            <Icon size={14} className={t.cls} />
          </span>
        );
      })}
      {/* verification seal */}
      <div className="absolute left-[88%] top-[25%] -translate-x-1/2 -translate-y-1/2">
        <div className="absolute inset-0 -m-4 rounded-full bg-emerald-400/50 blur-xl cv-seal-glow" />
        <div className="relative grid place-items-center size-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg ring-4 ring-white cv-seal">
          <Check size={24} strokeWidth={3} />
        </div>
      </div>
      {/* ambient particles */}
      {sparks.map((p, i) => (
        <span key={i} className="absolute rounded-full cv-twinkle"
          style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size, background: p.color, boxShadow: `0 0 10px ${p.color}`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }} />
      ))}
      {/* verification badge */}
      <div className="absolute left-[4%] bottom-[7%] flex items-center gap-2 rounded-2xl bg-white/95 px-3 py-2 shadow-[0_10px_30px_-10px_rgba(124,58,237,0.6)] ring-1 ring-violet-500/30 cv-badge-late">
        <span className="grid place-items-center size-6 rounded-full bg-violet-600 text-white"><ShieldCheck size={14} strokeWidth={2.5} /></span>
        <span className="leading-tight"><span className="block text-[11px] font-bold text-violet-700">Submission verified</span><span className="block text-[10px] text-slate-500">Evidence checked · 9 citations</span></span>
      </div>
      {/* opening fade from dark */}
      <div className="absolute inset-0 bg-black pointer-events-none cv-intro" />
      <button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? "Play animation" : "Pause animation"}
        className="absolute right-3 bottom-3 grid place-items-center size-8 rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/60 transition-colors">
        {paused ? <span className="ml-0.5 border-y-[5px] border-y-transparent border-l-[8px] border-l-white" /> : <span className="flex gap-[3px]"><span className="w-[3px] h-[10px] bg-white rounded-sm" /><span className="w-[3px] h-[10px] bg-white rounded-sm" /></span>}
      </button>
    </div>
  );
}

const PORTALS = {
  student: { label: "Student login", title: "Student Portal", desc: "Verify your research. Improve your academic work.",
    card: "bg-[#1c2a43] hover:bg-[#203150]", pill: "bg-[#20365a] text-[#5b9cff]", labelCls: "text-[#5b9cff]", email: "student@citeverify.demo", accent: "#3b82f6" },
  professor: { label: "Professor login", title: "Professor Portal", desc: "Evaluate research. Guide better scholarship.",
    card: "bg-[#2e2442] hover:bg-[#352a4d]", pill: "bg-[#3c2b5c] text-[#b48cff]", labelCls: "text-[#b48cff]", email: "professor@citeverify.demo", accent: "#a855f7" },
};

function LoginPage() {
  const { navigate } = useRouter();
  const { user, setUser } = useAuth();
  const [role, setRole] = useState<"student" | "professor" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) navigate(`/${user.role}/overview`); }, [user, navigate]);
  const { theme, toggle } = useTheme();
  useEffect(() => { document.documentElement.style.background = theme === "dark" ? "#000" : "#f3f4f7"; return () => { document.documentElement.style.background = ""; }; }, [theme]);

  const signIn = async (e?: React.FormEvent, demo = false) => {
    e?.preventDefault();
    if (!role) return;
    setBusy(true); setError("");
    try {
      const res = await api("/auth/login", { body: { email: demo ? PORTALS[role].email : email, password: demo ? "demo123" : password, role } });
      auth.set(res.token, res.user);
      setUser(res.user);
      navigate(`/${role}/overview`);
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#f3f4f7] dark:bg-black text-[#0f1424] dark:text-white flex items-center justify-center p-4 sm:p-8 transition-colors" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="relative w-full max-w-[1180px] rounded-[36px] border border-[#e2e4ea] dark:border-[#3a3a3a] bg-white dark:bg-black shadow-[0_10px_40px_-15px_rgba(15,20,36,0.18)] dark:shadow-none px-4 sm:px-6 pt-8 pb-6 transition-colors">
        <button type="button" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          className="absolute top-5 right-5 inline-flex items-center gap-1.5 rounded-full border border-[#e2e4ea] dark:border-[#3a3a3a] bg-white dark:bg-[#0d0d0d] px-3 py-1.5 text-sm text-[#4b5263] dark:text-[#d4d4d4] hover:bg-[#f3f4f7] dark:hover:bg-[#1a1a1a] transition-colors">
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}<span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"} mode</span>
        </button>
        <div className="text-center mb-7">
          <h1 className="text-3xl sm:text-[40px] font-semibold tracking-tight">Welcome to CiteVerify</h1>
          <p className="text-[#4b5263] dark:text-[#d4d4d4] mt-6 text-base sm:text-[22px]">Your research deserves evidence. Choose your workspace.</p>
        </div>
        {!role ? (
          <div className="grid md:grid-cols-2 gap-6">
            {(["student", "professor"] as const).map((r) => {
              const p = PORTALS[r];
              return (
                <button key={r} onClick={() => { setRole(r); setEmail(p.email); setPassword(""); setError(""); }}
                  className={`group text-left text-white rounded-[26px] p-5 sm:p-6 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${p.card}`}>
                  <Illustration role={r} />
                  <div className="mt-6 text-2xl sm:text-[28px] font-semibold tracking-tight">{p.title}</div>
                  <p className="mt-4 text-[#cdd3e0] text-base sm:text-[19px]">{p.desc}</p>
                  <span className={`mt-3 inline-block rounded-full px-3.5 py-1 text-base sm:text-[19px] font-medium transition-transform group-hover:translate-x-0.5 ${p.pill}`}>{p.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 items-stretch fade-in">
            <div className={`rounded-[26px] p-5 sm:p-6 text-white ${PORTALS[role].card} ${role === "professor" ? "cv-card-glow" : ""}`}>
              {role === "student" ? <StudentAnimation /> : <ProfessorAnimation />}
              <div className="mt-6 text-2xl sm:text-[28px] font-semibold tracking-tight">{PORTALS[role].title}</div>
              <p className="mt-4 text-[#cdd3e0] text-base sm:text-[19px]">{PORTALS[role].desc}</p>
            </div>
            <form onSubmit={signIn} className="rounded-[26px] border border-[#e2e4ea] dark:border-[#2b2b2b] bg-[#fafbfc] dark:bg-[#0a0a0a] p-6 sm:p-8 flex flex-col">
              <button type="button" onClick={() => setRole(null)} className="self-start inline-flex items-center gap-1.5 text-sm text-[#6b7280] dark:text-[#a3a3a3] hover:text-[#0f1424] dark:hover:text-white mb-6"><ArrowLeft size={15} />Change workspace</button>
              <div className={`text-sm font-semibold uppercase tracking-[0.12em] ${PORTALS[role].labelCls}`}>{PORTALS[role].label}</div>
              <h2 className="text-2xl font-semibold mt-1 mb-6">Sign in to your workspace</h2>
              <label className="text-xs text-[#6b7280] dark:text-[#a3a3a3] mb-1.5">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="username"
                className="rounded-lg bg-white dark:bg-black border border-[#d9dce3] dark:border-[#2f2f2f] px-3.5 py-2.5 text-sm outline-none focus:border-[#9aa0ad] dark:focus:border-[#555] mb-4" />
              <label className="text-xs text-[#6b7280] dark:text-[#a3a3a3] mb-1.5">Password</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required autoComplete="current-password" placeholder="demo123"
                className="rounded-lg bg-white dark:bg-black border border-[#d9dce3] dark:border-[#2f2f2f] px-3.5 py-2.5 text-sm outline-none focus:border-[#9aa0ad] dark:focus:border-[#555] mb-5" />
              {error && <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{error}</div>}
              <button disabled={busy} className="rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60 inline-flex items-center justify-center gap-2" style={{ background: PORTALS[role].accent }}>
                {busy && <Loader2 size={15} className="animate-spin" />}Sign in
              </button>
              <button type="button" disabled={busy} onClick={() => signIn(undefined, true)} className="mt-3 rounded-lg py-2.5 text-sm font-medium border border-[#d9dce3] dark:border-[#2f2f2f] hover:bg-black/5 dark:hover:bg-white/5">
                Continue with demo {role} account
              </button>
              <p className="mt-auto pt-6 text-xs text-[#8a8f9c] dark:text-[#737373]">Demo: {PORTALS[role].email} · password demo123</p>
            </form>
          </div>
        )}
        <p className="text-center text-[#6b7280] dark:text-[#c4c4c4] text-base sm:text-[19px] mt-8">One platform • Two role-specific experiences</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Portal shell */
type NavItem = { path: string; label: string; icon: any };
const STUDENT_NAV: NavItem[] = [
  { path: "overview", label: "Overview", icon: LayoutDashboard }, { path: "verify", label: "New Verification", icon: Upload },
  { path: "documents", label: "My Documents", icon: FolderOpen }, { path: "claims", label: "Claim Explorer", icon: FileSearch },
  { path: "evidence", label: "Evidence Viewer", icon: Microscope }, { path: "network", label: "Citation Network", icon: Network },
  { path: "outdated", label: "Outdated Research", icon: Timer }, { path: "suggestions", label: "Suggested Citations", icon: Lightbulb },
  { path: "feedback", label: "Professor Feedback", icon: MessageSquare }, { path: "revisions", label: "Revision History", icon: History },
  { path: "settings", label: "Settings", icon: Settings },
];
const PROFESSOR_NAV: NavItem[] = [
  { path: "overview", label: "Overview", icon: LayoutDashboard }, { path: "submissions", label: "Student Submissions", icon: FileText },
  { path: "evidence", label: "Evidence Verification", icon: ClipboardCheck }, { path: "intelligence", label: "Citation Intelligence", icon: Network },
  { path: "integrity", label: "Academic Integrity", icon: ShieldAlert }, { path: "revisions", label: "Revision Tracking", icon: GitCompare },
  { path: "feedback", label: "Feedback Center", icon: MessageSquare }, { path: "progress", label: "Student Progress", icon: TrendingUp },
  { path: "settings", label: "Settings", icon: Settings },
];

function Notifications() {
  const { navigate } = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const load = () => api("/notifications").then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);
  useInterval(load, 15000);
  const unread = items.filter((n) => !n.read).length;
  return (
    <div className="relative">
      <button className="btn btn-ghost btn-sm relative" onClick={() => { setOpen(!open); if (!open && unread) api("/notifications/read", { method: "POST" }).then(load); }} aria-label="Notifications">
        <Bell size={16} />{unread > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] grid place-items-center">{unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-[360px] card shadow-xl z-40 overflow-hidden fade-in">
            <div className="px-4 py-3 border-b border-line text-sm font-semibold">Notifications</div>
            <div className="max-h-[420px] overflow-y-auto divide-y divide-line">
              {items.length === 0 && <div className="p-6 text-sm text-muted text-center">You're all caught up.</div>}
              {items.map((n) => (
                <button key={n.id} className="w-full text-left px-4 py-3 hover:bg-surface2 flex gap-3" onClick={() => { setOpen(false); n.link && navigate(n.link); }}>
                  <span className={`mt-1.5 size-2 rounded-full shrink-0 ${n.read ? "bg-transparent" : "bg-accent"}`} />
                  <span className="min-w-0"><span className="block text-sm font-medium">{n.title}</span><span className="block text-xs text-muted mt-0.5">{n.body}</span><span className="block text-[11px] text-muted mt-1">{fmtAgo(n.created_at)}</span></span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* Student sidebar: grouped sections, status badges, collapsible rail; adapts to light and dark mode. */
const STUDENT_SECTIONS: { title: string; items: string[] }[] = [
  { title: "Workspace", items: ["overview", "verify", "documents"] },
  { title: "Forensic Analysis", items: ["claims", "evidence", "network"] },
  { title: "Quality & Review", items: ["outdated", "suggestions", "feedback"] },
  { title: "System", items: ["revisions", "settings"] },
];
const STUDENT_ICONS: Record<string, any> = {
  overview: ChartLineIcon, verify: Plus, documents: File, claims: Search, evidence: Microscope, network: Waypoints,
  outdated: Clock, suggestions: Lightbulb, feedback: MessageSquareText, revisions: History, settings: Settings,
};

function StudentSidebar({ current, onNavigate, forceExpanded }: { current: string; onNavigate: (path: string) => void; forceExpanded?: boolean }) {
  const { user, logout } = useAuth();
  const [collapsedPref, setCollapsedPref] = useState(() => localStorage.getItem("cv_sidebar_collapsed") === "1");
  const collapsed = !forceExpanded && collapsedPref;
  const [openFeedback, setOpenFeedback] = useState<{ count: number; professor: string }>({ count: 0, professor: "" });
  useEffect(() => {
    const load = () => api<any[]>("/feedback").then((fb) => {
      const open = fb.filter((f) => f.status === "sent");
      setOpenFeedback({ count: open.length, professor: (open[0] || fb[0])?.professor_name || "" });
    }).catch(() => {});
    load();
    window.addEventListener("cv-feedback-changed", load);  // refresh the badge as soon as feedback is marked addressed
    return () => window.removeEventListener("cv-feedback-changed", load);
  }, [current]);
  const toggle = () => { const v = !collapsedPref; setCollapsedPref(v); localStorage.setItem("cv_sidebar_collapsed", v ? "1" : "0"); };
  const labelOf = (p: string) => STUDENT_NAV.find((n) => n.path === p)?.label || p;
  const profInitials = (openFeedback.professor || "Professor").replace(/^Dr\.?\s*/, "").split(" ").map((x) => x[0]).join("").slice(0, 2);

  const badge = (p: string) => {
    if (collapsed) return null;
    if (p === "overview") return <TrendingUp size={16} className="text-emerald-500 dark:text-emerald-400" strokeWidth={2.4} />;
    if (p === "verify") return <span className="grid place-items-center size-6 rounded-md bg-blue-100 text-blue-600 dark:bg-white/15 dark:text-white"><Sparkles size={12} /></span>;
    if (p === "feedback" && openFeedback.professor) return (
      <span className="relative" title={`${openFeedback.count} open feedback from ${openFeedback.professor}`}>
        <span className="grid place-items-center size-7 rounded-full text-[10.5px] font-semibold text-white bg-gradient-to-br from-violet-500 to-fuchsia-600 ring-2 ring-white dark:ring-[#0d1838]">{profInitials}</span>
        {openFeedback.count > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9.5px] font-semibold grid place-items-center ring-2 ring-white dark:ring-[#0d1838]">{openFeedback.count}</span>}
      </span>
    );
    return null;
  };

  return (
    <aside className={`${collapsed ? "w-[76px]" : "w-[264px]"} shrink-0 h-full flex flex-col relative overflow-hidden transition-[width] duration-200
      bg-gradient-to-b from-white to-[#f3f6fd] border-r border-[#e3e8f3] text-[#1e293b]
      dark:from-[#0b1430] dark:via-[#0e1a3d] dark:to-[#0a1230] dark:border-white/5 dark:text-[#e3e9fb]`}>
      {/* soft glow, dark mode only */}
      <div className="pointer-events-none absolute -right-24 top-1/3 size-72 rounded-full bg-[#3b5bdb]/0 dark:bg-[#3b5bdb]/20 blur-3xl" />
      <div className={`relative h-[72px] flex items-center ${collapsed ? "justify-center px-2" : "px-4 gap-3"}`}>
        <div className="size-10 shrink-0 rounded-xl grid place-items-center shadow-md shadow-blue-900/20" style={{ background: "linear-gradient(135deg,#3b82f6,#4338ca)" }}>
          <GraduationCap size={20} className="text-white" />
        </div>
        {!collapsed && <div className="flex-1 min-w-0">
          <div className="font-semibold text-[17px] leading-tight tracking-tight">CiteVerify</div>
          <div className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400">research workspace</div>
        </div>}
        {!collapsed && <button onClick={toggle} title="Collapse sidebar" aria-label="Collapse sidebar"
          className="hidden lg:grid size-9 place-items-center rounded-lg bg-[#eef2fb] text-[#334155] hover:bg-[#e2e8f6] dark:bg-white/10 dark:text-white dark:hover:bg-white/15 transition-colors">
          <ChevronsLeft size={17} />
        </button>}
      </div>
      {collapsed && <button onClick={toggle} title="Expand sidebar" aria-label="Expand sidebar"
        className="relative mx-auto mb-1 grid size-9 place-items-center rounded-lg bg-[#eef2fb] text-[#334155] hover:bg-[#e2e8f6] dark:bg-white/10 dark:text-white dark:hover:bg-white/15">
        <ChevronsRight size={17} />
      </button>}
      <nav className="relative flex-1 overflow-y-auto px-3 pb-4">
        {STUDENT_SECTIONS.map((sec) => (
          <div key={sec.title} className="mt-3">
            {collapsed ? <div className="mx-3 my-2 h-px bg-[#e3e8f3] dark:bg-white/10" />
              : <div className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8] dark:text-[#8796c0]">{sec.title}</div>}
            <div className="space-y-0.5">
              {sec.items.map((p) => {
                const Icon = STUDENT_ICONS[p];
                const active = p === current;
                return (
                  <a key={p} href={`/student/${p}`} title={collapsed ? labelOf(p) : undefined} onClick={(e) => { e.preventDefault(); onNavigate(p); }}
                    className={`group flex items-center rounded-xl text-[14.5px] transition-colors ${collapsed ? "justify-center h-11" : "gap-3 px-3 h-11"}
                      ${active ? "bg-blue-50 text-blue-700 font-semibold ring-1 ring-inset ring-blue-200/70 dark:bg-white/10 dark:text-white dark:ring-white/10"
                        : "text-[#334155] hover:bg-[#eef2fb] dark:text-[#d5ddf5] dark:hover:bg-white/[0.06] dark:hover:text-white"}`}>
                    <Icon size={19} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-blue-600 dark:text-white" : "text-[#64748b] group-hover:text-[#1e293b] dark:text-[#aebbe0] dark:group-hover:text-white"} />
                    {!collapsed && <span className="flex-1 truncate">{labelOf(p)}</span>}
                    {badge(p)}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className={`relative p-3 border-t border-[#e3e8f3] dark:border-white/5`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2.5 px-2"} py-1.5`}>
          <div className="size-9 shrink-0 rounded-full grid place-items-center text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg,#3b82f6,#1d4ed8)" }} title={collapsed ? user?.name : undefined}>
            {user?.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</div>
          {!collapsed && <>
            <div className="min-w-0 flex-1"><div className="text-[13px] font-medium truncate">{user?.name}</div><div className="text-[11px] text-[#64748b] dark:text-[#8796c0] truncate">{user?.email}</div></div>
            <button onClick={logout} className="p-1.5 rounded-md text-[#64748b] hover:bg-[#eef2fb] dark:text-[#aebbe0] dark:hover:bg-white/10" title="Log out" aria-label="Log out"><LogOut size={15} /></button>
          </>}
        </div>
      </div>
    </aside>
  );
}

/* Professor sidebar: grouped sections, gradient-glow active item, live counts; adapts to light and dark mode. */
const PROFESSOR_SECTIONS: { title: string; items: string[] }[] = [
  { title: "Workspace", items: ["overview", "submissions"] },
  { title: "Integrity & Audit", items: ["evidence", "intelligence"] },
  { title: "Review & Mentorship", items: ["integrity", "revisions", "feedback"] },
  { title: "System", items: ["progress", "settings"] },
];
const PROFESSOR_ICONS: Record<string, any> = {
  overview: LayoutGrid, submissions: FileText, evidence: ClipboardList, intelligence: Network, integrity: GraduationCap,
  revisions: GitCompare, feedback: MessageSquare, progress: TrendingUp, settings: Settings,
};

function ProfessorSidebar({ current, onNavigate, forceExpanded }: { current: string; onNavigate: (path: string) => void; forceExpanded?: boolean }) {
  const { user, logout } = useAuth();
  const [collapsedPref, setCollapsedPref] = useState(() => localStorage.getItem("cv_prof_sidebar_collapsed") === "1");
  const collapsed = !forceExpanded && collapsedPref;
  const [counts, setCounts] = useState<{ awaiting: number; feedback: number }>({ awaiting: 0, feedback: 0 });
  useEffect(() => {
    api<any>("/professor/overview").then((o) => setCounts((c) => ({ ...c, awaiting: o.awaiting || 0 }))).catch(() => {});
  }, [current]);
  const toggle = () => { const v = !collapsedPref; setCollapsedPref(v); localStorage.setItem("cv_prof_sidebar_collapsed", v ? "1" : "0"); };
  const labelOf = (p: string) => PROFESSOR_NAV.find((n) => n.path === p)?.label || p;
  const countBadge = (n: number, title: string) => n > 0 ? <span title={title} className="min-w-6 h-6 px-1.5 rounded-md grid place-items-center text-[12px] font-semibold bg-violet-600 text-white dark:bg-violet-600/80 shadow-sm shadow-violet-900/30">{n}</span> : null;
  const badge = (p: string) => {
    if (collapsed) return null;
    if (p === "submissions") return countBadge(counts.awaiting, `${counts.awaiting} submission(s) awaiting review`);
    return null;
  };
  return (
    <aside className={`${collapsed ? "w-[76px]" : "w-[284px]"} shrink-0 h-full flex flex-col relative overflow-hidden transition-[width] duration-200
      bg-gradient-to-b from-[#fbfaff] to-[#f1edfb] border-r border-[#e6e0f3] text-[#241b3a]
      dark:from-[#120d20] dark:via-[#160f28] dark:to-[#0f0a1a] dark:border-white/5 dark:text-[#ece6fb]`}>
      <div className="pointer-events-none absolute -left-24 top-10 size-64 rounded-full bg-cyan-400/0 dark:bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-24 size-72 rounded-full bg-violet-400/0 dark:bg-violet-600/15 blur-3xl" />
      <div className={`relative h-[72px] flex items-center ${collapsed ? "justify-center px-2" : "px-4 gap-3"}`}>
        <div className="size-10 shrink-0 rounded-xl grid place-items-center shadow-md shadow-violet-900/30" style={{ background: "linear-gradient(135deg,#22d3ee,#7c3aed)" }}>
          <BookMarked size={18} className="text-white" />
        </div>
        {!collapsed && <div className="flex-1 min-w-0">
          <div className="font-semibold text-[17px] leading-tight tracking-tight">CiteVerify</div>
          <div className="text-[12px] font-medium text-violet-600 dark:text-violet-300">evaluator workspace</div>
        </div>}
        {!collapsed && <button onClick={toggle} title="Collapse sidebar" aria-label="Collapse sidebar"
          className="hidden lg:grid size-9 place-items-center rounded-lg bg-[#efeaf9] text-[#3b2f5c] hover:bg-[#e5ddf6] dark:bg-white/10 dark:text-white dark:hover:bg-white/15 transition-colors"><ChevronsLeft size={17} /></button>}
      </div>
      {collapsed && <button onClick={toggle} title="Expand sidebar" aria-label="Expand sidebar"
        className="relative mx-auto mb-1 grid size-9 place-items-center rounded-lg bg-[#efeaf9] text-[#3b2f5c] hover:bg-[#e5ddf6] dark:bg-white/10 dark:text-white dark:hover:bg-white/15"><ChevronsRight size={17} /></button>}
      <nav className="relative flex-1 overflow-y-auto px-3 pb-4">
        {PROFESSOR_SECTIONS.map((sec) => (
          <div key={sec.title} className="mt-3">
            {collapsed ? <div className="mx-3 my-2 h-px bg-[#e6e0f3] dark:bg-white/10" />
              : <div className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8b80a8] dark:text-[#9a8fb8]">{sec.title}</div>}
            <div className="space-y-1">
              {sec.items.map((p) => {
                const Icon = PROFESSOR_ICONS[p];
                const active = p === current;
                const inner = (
                  <span className={`flex items-center w-full h-11 rounded-[11px] ${collapsed ? "justify-center" : "gap-3 px-3"}
                    ${active ? "bg-gradient-to-r from-[#eefbfe] to-[#f3ecff] dark:from-[#1a2140] dark:to-[#2a1a48]" : ""}`}>
                    <Icon size={19} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-violet-600 dark:text-white" : "text-[#6b5f8a] group-hover:text-[#241b3a] dark:text-[#b5aad3] dark:group-hover:text-white"} />
                    {!collapsed && <span className={`flex-1 truncate text-[14.5px] ${active ? "font-semibold" : ""}`}>{labelOf(p)}</span>}
                    {badge(p)}
                  </span>
                );
                return (
                  <a key={p} href={`/professor/${p}`} title={collapsed ? labelOf(p) : undefined} onClick={(e) => { e.preventDefault(); onNavigate(p); }}
                    className={`group block rounded-xl transition-colors ${active
                      ? "p-[1.5px] bg-gradient-to-r from-cyan-400 via-sky-400 to-violet-500 shadow-[0_0_16px_-4px_rgba(139,92,246,0.55)] dark:shadow-[0_0_20px_-2px_rgba(139,92,246,0.6)] text-[#241b3a] dark:text-white"
                      : "p-[1.5px] text-[#3b2f5c] hover:bg-[#efeaf9] dark:text-[#ddd5f3] dark:hover:bg-white/[0.06]"}`}>
                    {inner}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="relative p-3 border-t border-[#e6e0f3] dark:border-white/5">
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2.5 px-2"} py-1.5`}>
          <div className="size-9 shrink-0 rounded-full grid place-items-center text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg,#8b5cf6,#5b21b6)" }} title={collapsed ? user?.name : undefined}>
            {user?.name.replace(/^Dr\.?\s*/, "").split(" ").map((x) => x[0]).join("").slice(0, 2)}</div>
          {!collapsed && <>
            <div className="min-w-0 flex-1"><div className="text-[13px] font-medium truncate">{user?.name}</div><div className="text-[11px] text-[#7a6f97] dark:text-[#9a8fb8] truncate">{user?.email}</div></div>
            <button onClick={logout} className="p-1.5 rounded-md text-[#6b5f8a] hover:bg-[#efeaf9] dark:text-[#b5aad3] dark:hover:bg-white/10" title="Log out" aria-label="Log out"><LogOut size={15} /></button>
          </>}
        </div>
      </div>
    </aside>
  );
}

function Shell({ role, nav, children }: { role: "student" | "professor"; nav: NavItem[]; children: React.ReactNode }) {
  const { path, navigate } = useRouter();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [mobile, setMobile] = useState(false);
  const current = path.split("/")[2] || "overview";
  const item = nav.find((n) => n.path === current);
  const sidebar = (
    <aside className="w-[248px] shrink-0 bg-sidebar text-sidebartext flex flex-col h-full">
      <div className="h-16 px-5 flex items-center gap-2.5 border-b border-white/5">
        <div className="size-8 rounded-lg grid place-items-center" style={{ background: role === "student" ? "linear-gradient(135deg,#2563eb,#1e3a8a)" : "linear-gradient(135deg,#8b5cf6,#4c1d95)" }}>
          {role === "student" ? <GraduationCap size={17} className="text-white" /> : <BookMarked size={16} className="text-white" />}
        </div>
        <div><div className="text-white font-semibold text-[15px] leading-none">CiteVerify</div><div className="text-[11px] opacity-60 mt-1">{role === "student" ? "Research workspace" : "Evaluator workspace"}</div></div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {nav.map((n) => {
          const active = n.path === current;
          const Icon = n.icon;
          return (
            <a key={n.path} href={`/${role}/${n.path}`} onClick={(e) => { e.preventDefault(); setMobile(false); navigate(`/${role}/${n.path}`); }}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors ${active ? "bg-sidebar2 text-white font-medium" : "hover:bg-white/5 hover:text-white"}`}>
              <Icon size={16} className={active ? (role === "student" ? "text-[#6ea0ff]" : "text-[#c4a7ff]") : "opacity-70"} />{n.label}
            </a>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/5">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="size-8 rounded-full grid place-items-center text-xs font-semibold text-white" style={{ background: role === "student" ? "#1d4ed8" : "#6d28d9" }}>
            {user?.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</div>
          <div className="min-w-0 flex-1"><div className="text-[13px] text-white truncate">{user?.name}</div><div className="text-[11px] opacity-60 truncate">{user?.email}</div></div>
          <button onClick={logout} className="p-1.5 rounded-md hover:bg-white/10" title="Log out" aria-label="Log out"><LogOut size={15} /></button>
        </div>
      </div>
    </aside>
  );
  return (
    <div data-portal={role} className="min-h-screen flex bg-bg text-ink">
      <div className="hidden lg:flex h-screen sticky top-0 self-start z-30">{role === "student" ? <StudentSidebar current={current} onNavigate={(p) => navigate(`/student/${p}`)} /> : <ProfessorSidebar current={current} onNavigate={(p) => navigate(`/professor/${p}`)} />}</div>
      {mobile && <div className="fixed inset-0 z-50 flex lg:hidden"><div className="h-full">{role === "student" ? <StudentSidebar forceExpanded current={current} onNavigate={(p) => { setMobile(false); navigate(`/student/${p}`); }} /> : <ProfessorSidebar forceExpanded current={current} onNavigate={(p) => { setMobile(false); navigate(`/professor/${p}`); }} />}</div><div className="flex-1 bg-black/50" onClick={() => setMobile(false)} /></div>}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 sticky top-0 z-20 bg-bg/85 backdrop-blur border-b border-line flex items-center gap-3 px-4 sm:px-8">
          <button className="lg:hidden btn btn-ghost btn-sm" onClick={() => setMobile(true)} aria-label="Menu"><Menu size={16} /></button>
          <div className="text-sm text-muted hidden sm:block">{role === "student" ? "Student portal" : "Evaluator portal"} <span className="mx-1.5">/</span><span className="text-ink font-medium">{item?.label || "Document"}</span></div>
          <div className="flex-1" />
          <button className="btn btn-ghost btn-sm" onClick={toggle} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}<span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
          <Notifications />
          <button className="btn btn-ghost btn-sm" onClick={logout}><LogOut size={15} /><span className="hidden sm:inline">Log out</span></button>
        </header>
        <main key={path} className="flex-1 px-4 sm:px-8 py-7 max-w-[1440px] w-full mx-auto fade-in">{children}</main>
        <Toaster />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Routing */
function StudentRoutes({ page, param }: { page: string; param?: string }) {
  const map: Record<string, React.ReactNode> = {
    overview: <StudentOverview />, verify: <NewVerification />, documents: param ? <DocumentPage id={Number(param)} /> : <Documents />,
    claims: <ClaimExplorer />, evidence: <EvidenceViewer />, network: <NetworkPage />, outdated: <Outdated />,
    suggestions: <Suggestions />, feedback: <FeedbackPage />, revisions: <StudentRevisions />, settings: <SettingsPage />,
  };
  return <>{map[page] || <NotFound />}</>;
}
function ProfessorRoutes({ page }: { page: string }) {
  const map: Record<string, React.ReactNode> = {
    overview: <ProfessorOverview />, submissions: <Submissions />, evidence: <EvidenceDashboard />,
    intelligence: <Intelligence />, integrity: <Integrity />, revisions: <ProfessorRevisions />,
    feedback: <FeedbackCenter />, progress: <Progress />, settings: <SettingsPage />,
  };
  return <>{map[page] || <NotFound />}</>;
}
function NotFound() {
  const { navigate } = useRouter();
  return <div className="card p-10 text-center"><div className="font-semibold">Page not found</div><button className="btn btn-primary mt-4" onClick={() => navigate("/")}>Go home</button></div>;
}

export function SettingsPage() {
  const { theme, set } = useTheme();
  const { user, logout } = useAuth();
  const [sys, setSys] = useState<any>(null);
  useEffect(() => { api("/system").then(setSys).catch(() => {}); }, []);
  const prof = user?.role === "professor";
  const preview = (t: "light" | "dark") => ({
    page: t === "dark" ? (prof ? "bg-[#0b0a0f]" : "bg-[#060b18]") : (prof ? "bg-[#f6f5f9]" : "bg-[#f5f7fb]"),
    side: t === "dark" ? (prof ? "bg-gradient-to-b from-[#120d20] to-[#0f0a1a]" : "bg-gradient-to-b from-[#0b1430] to-[#0a1230]") : (prof ? "bg-gradient-to-b from-[#fbfaff] to-[#f1edfb] border-r border-[#e6e0f3]" : "bg-gradient-to-b from-white to-[#f3f6fd] border-r border-[#e3e8f3]"),
    line: t === "dark" ? "bg-white/15" : "bg-[#d9deea]",
    card: t === "dark" ? (prof ? "bg-[#131118] border-[#29243a]" : "bg-[#0c1426] border-[#1c2944]") : "bg-white border-[#e2e7f0]",
    accent: prof ? "bg-violet-500" : "bg-blue-500",
  });
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-line last:border-0"><span className="text-muted">{k}</span><span className="text-right font-medium">{v}</span></div>
  );
  return (
    <div className="w-full space-y-6">
      <div><h1 className="text-[22px] font-semibold tracking-tight">Settings</h1><p className="text-sm text-muted mt-1">Appearance, account and verification engine status.</p></div>
      <div className="card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div className="font-semibold">Appearance</div>
          <div className="text-xs text-muted">Applies to the login page and both portals · remembered on this device</div>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {(["light", "dark"] as const).map((t) => {
            const pv = preview(t);
            return (
              <button key={t} onClick={() => set(t)} className={`rounded-2xl border-2 p-4 text-left transition-all hover:-translate-y-0.5 ${theme === t ? "border-accent ring-4 ring-accentsoft" : "border-line hover:border-muted"}`}>
                <div className={`h-56 rounded-xl border border-line flex overflow-hidden ${pv.page}`}>
                  <div className={`w-[22%] p-3 space-y-2.5 ${pv.side}`}>
                    <div className={`size-6 rounded-md ${pv.accent}`} />
                    {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className={`h-2 rounded ${i === 0 ? pv.accent + " opacity-80" : pv.line}`} style={{ width: `${60 + ((i * 17) % 35)}%` }} />)}
                  </div>
                  <div className="flex-1 p-4 space-y-3">
                    <div className={`h-3 w-1/3 rounded ${pv.line}`} />
                    <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className={`h-12 rounded-lg border ${pv.card}`} />)}</div>
                    <div className="grid grid-cols-3 gap-2"><div className={`col-span-2 h-24 rounded-lg border ${pv.card}`} /><div className={`h-24 rounded-lg border ${pv.card}`} /></div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-sm font-semibold flex items-center gap-2 capitalize">{t === "dark" ? <Moon size={15} /> : <Sun size={15} />}{t} mode</div>
                  {theme === t ? <span className="text-xs font-medium text-accent inline-flex items-center gap-1"><CheckCircle2 size={14} />Active</span> : <span className="text-xs text-muted">Click to apply</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="card p-6 text-sm">
          <div className="flex items-center gap-3 mb-3">
            <span className="size-11 rounded-full grid place-items-center text-sm font-semibold text-white" style={{ background: prof ? "linear-gradient(135deg,#8b5cf6,#5b21b6)" : "linear-gradient(135deg,#3b82f6,#1d4ed8)" }}>
              {user?.name.replace(/^Dr\.?\s*/, "").split(" ").map((x) => x[0]).join("").slice(0, 2)}</span>
            <div><div className="font-semibold">Account</div><div className="text-xs text-muted">Signed in to the {prof ? "Professor / Evaluator" : "Student / Researcher"} portal</div></div>
          </div>
          <Row k="Name" v={user?.name} />
          <Row k="Email" v={user?.email} />
          <Row k="Role" v={<span className="capitalize">{user?.role}</span>} />
          <Row k="Programme" v={user?.program} />
          <div className="pt-4"><button className="btn btn-danger" onClick={logout}><LogOut size={15} />Log out</button></div>
        </div>
        <div className="card p-6 text-sm">
          <div className="font-semibold mb-3">Verification engine</div>
          <Row k="Claim reasoning" v={sys?.llm ? `Claude (${sys.llm_model}) + rule checks` : "Deterministic rule engine"} />
          <Row k="Live paper retrieval" v={sys?.live_lookup ? <span className="text-emerald-600 dark:text-emerald-400">Enabled</span> : "Disabled"} />
          <Row k="Sources" v={sys?.sources?.join(", ")} />
          <Row k="Demo corpus" v={`${sys?.demo_corpus_size ?? "–"} simulated papers`} />
          <p className="text-xs text-muted pt-4">Statistical comparisons, metadata checks and citation-chain tracing are always deterministic. Semantic similarity alone never determines a verdict, and evidence passages are always quoted from retrieved sources.</p>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { path, navigate } = useRouter();
  const { user } = useAuth();
  const parts = path.split("/").filter(Boolean);
  const portal = parts[0];
  useEffect(() => {
    if ((portal === "student" || portal === "professor") && !user) navigate("/");
    else if (user && portal && portal !== user.role && (portal === "student" || portal === "professor")) navigate(`/${user.role}/overview`); // role guard
  }, [portal, user, navigate]);
  if (!portal || !user || (portal !== "student" && portal !== "professor")) return <LoginPage />;
  if (portal !== user.role) return null;
  const page = parts[1] || "overview";
  return portal === "student"
    ? <Shell role="student" nav={STUDENT_NAV}><StudentRoutes page={page} param={parts[2]} /></Shell>
    : <Shell role="professor" nav={PROFESSOR_NAV}><ProfessorRoutes page={page} /></Shell>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider><ThemeProvider><AuthProvider><App /></AuthProvider></ThemeProvider></RouterProvider>
  </React.StrictMode>,
);
