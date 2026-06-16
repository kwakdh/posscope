"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { InfiniteCanvas } from "@/components/infinite-canvas";
import { WireframeCanvas } from "@/components/wireframe-canvas";
import { TableEditor } from "@/components/table-editor";
import type { Policy, PolicyMode, WireframeItem, FlowStep, TableData, AIScreen, BadgeMark } from "@/types/policy";
import { normalizePolicy } from "@/types/policy";

type ItemType = "category" | "feature";

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function fmtDate(v: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function emptyPolicy(itemType: ItemType, itemId: string, kind: string): Policy {
  return {
    id: "", item_type: itemType, item_id: itemId, kind,
    title: "", mode: "image",
    wireframes: [], flow_steps: [],
    description_items: [""], policy_note: "", ui_note: "", consideration_note: "",
    tables: [], ai_screens: [],
    wireframe_url: null, image_badges: [],
    sort_order: 0, author_name: null, updated_at: null,
  };
}

function AutoResizeTextarea(props: {
  value: string;
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
  onBlur?: () => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} rows={1} style={{ overflow: "hidden", resize: "none" }} />;
}

// ── Rich Text 노트 에디터 (Bold / 빨강 / 파랑 색상) ──────────────────────────

function RichNoteEditor({ value, onChange, onBlur, readOnly, placeholder, className }: {
  value: string; onChange: (v: string) => void; onBlur?: () => void;
  readOnly?: boolean; placeholder?: string; className?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isFocused = useRef(false);
  const [bar, setBar] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || isFocused.current) return;
    if (el.innerHTML !== (value || "")) el.innerHTML = value || "";
  }, [value]);

  useEffect(() => {
    const handler = () => {
      if (!isFocused.current || !editorRef.current) return setBar(null);
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !editorRef.current.contains(sel.anchorNode)) return setBar(null);
      const rng = sel.getRangeAt(0).getBoundingClientRect();
      const par = editorRef.current.parentElement!.getBoundingClientRect();
      setBar({ x: rng.left - par.left, y: rng.top - par.top - 40 });
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

  function exec(cmd: string, val?: string) {
    document.execCommand(cmd, false, val);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }

  return (
    <div className="relative">
      {bar && !readOnly && (
        <div
          className="absolute z-50 flex items-center gap-0.5 rounded-lg bg-zinc-900 px-1.5 py-1 shadow-lg"
          style={{ top: bar.y, left: Math.max(0, bar.x) }}
          onMouseDown={e => e.preventDefault()}
        >
          <button type="button" onMouseDown={e => { e.preventDefault(); exec("bold"); }} className="rounded px-1.5 py-0.5 text-xs font-bold text-white hover:bg-zinc-700">B</button>
          <button type="button" onMouseDown={e => { e.preventDefault(); exec("foreColor", "#ef4444"); }} className="rounded px-1.5 py-0.5 text-xs font-bold text-red-400 hover:bg-zinc-700">A</button>
          <button type="button" onMouseDown={e => { e.preventDefault(); exec("foreColor", "#3b82f6"); }} className="rounded px-1.5 py-0.5 text-xs font-bold text-blue-400 hover:bg-zinc-700">A</button>
          <button type="button" onMouseDown={e => { e.preventDefault(); exec("foreColor", "#22c55e"); }} className="rounded px-1.5 py-0.5 text-xs font-bold text-green-400 hover:bg-zinc-700">A</button>
          <button type="button" onMouseDown={e => { e.preventDefault(); exec("removeFormat"); }} className="rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-700">✕</button>
        </div>
      )}
      {!value && !isFocused.current && placeholder && (
        <div className="pointer-events-none absolute left-0 top-0 text-sm text-zinc-300">{placeholder}</div>
      )}
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onFocus={() => { isFocused.current = true; }}
        onBlur={() => { isFocused.current = false; setBar(null); onChange(editorRef.current?.innerHTML ?? ""); onBlur?.(); }}
        onInput={() => onChange(editorRef.current?.innerHTML ?? "")}
        className={`min-h-[1.25rem] break-words whitespace-pre-wrap outline-none ${className ?? ""}`}
      />
    </div>
  );
}

// ── FeatureTab 타입 ──────────────────────────────────────────────────────────

type FeatureTab = {
  id: string; item_type: string; item_id: string;
  name: string; figma_url: string | null; sort_order: number;
};

// ── 진행률 바 ────────────────────────────────────────────────────────────────

function ProgressBar({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-zinc-50 p-4">
      <div className="flex items-center justify-between text-xs font-bold">
        <span className="text-zinc-600">{label}</span>
        <span className="text-brand">{progress}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
        <div
          className="h-full rounded-full bg-brand transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ── Figma 로고 ───────────────────────────────────────────────────────────────

function FigmaLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 38 57" fill="none" className="shrink-0">
      <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0Z" fill="#1ABCFE" />
      <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 0 1-19 0Z" fill="#0ACF83" />
      <path d="M19 0v19h9.5a9.5 9.5 0 0 0 0-19H19Z" fill="#FF7262" />
      <path d="M0 9.5a9.5 9.5 0 0 0 9.5 9.5H19V0H9.5A9.5 9.5 0 0 0 0 9.5Z" fill="#F24E1E" />
      <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5Z" fill="#A259FF" />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// FeatureDetail (최상위)
// ──────────────────────────────────────────────────────────────────────────────

export function FeatureDetail({
  itemType, itemId, currentUserName, canEdit,
}: {
  itemType: ItemType; itemId: string; currentUserName: string; canEdit: boolean;
}) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [customTabs, setCustomTabs] = useState<FeatureTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTabKind, setActiveTabKind] = useState("current");
  const [addingTab, setAddingTab] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkLabel, setBulkLabel] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [editingTabFigmaId, setEditingTabFigmaId] = useState<string | null>(null);
  const [tabFigmaInput, setTabFigmaInput] = useState("");

  useEffect(() => {
    let active = true;
    const sb = createClient();
    Promise.all([
      sb.from("policies").select("*").eq("item_type", itemType).eq("item_id", itemId).order("created_at"),
      sb.from("feature_tabs").select("*").eq("item_type", itemType).eq("item_id", itemId).order("sort_order"),
    ]).then(([pRes, tRes]) => {
      if (!active) return;
      setPolicies((pRes.data ?? []).map(normalizePolicy));
      setCustomTabs((tRes.data ?? []) as FeatureTab[]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [itemType, itemId]);

  const FIXED_TABS = [
    { id: "current", name: "현행", figma_url: null, isFixed: true } as const,
    { id: "proposal", name: "신규 기획", figma_url: null, isFixed: true } as const,
  ];
  const allTabs = [...FIXED_TABS, ...customTabs.map(t => ({ ...t, isFixed: false as const }))];
  const activeTabMeta = allTabs.find(t => t.id === activeTabKind) ?? FIXED_TABS[0];
  const activePolicies = policies.filter(p => p.kind === activeTabKind);
  const displayPolicies = activeTabKind === "current" && activePolicies.length === 0
    ? [emptyPolicy(itemType, itemId, "current")]
    : activePolicies;

  // ── 탭 핸들러 ──────────────────────────────────────────────────────────
  async function handleAddTab() {
    const name = newTabName.trim(); if (!name) return;
    const sb = createClient();
    const { data } = await sb.from("feature_tabs")
      .insert({ item_type: itemType, item_id: itemId, name, sort_order: customTabs.length })
      .select("*").single();
    if (data) { setCustomTabs(prev => [...prev, data as FeatureTab]); setActiveTabKind((data as FeatureTab).id); }
    setAddingTab(false); setNewTabName("");
  }

  async function handleDeleteTab(tabId: string) {
    const sb = createClient();
    await sb.from("policies").delete().eq("item_type", itemType).eq("item_id", itemId).eq("kind", tabId);
    await sb.from("feature_tabs").delete().eq("id", tabId);
    setCustomTabs(prev => prev.filter(t => t.id !== tabId));
    setPolicies(prev => prev.filter(p => p.kind !== tabId));
    setActiveTabKind("current");
  }

  async function handleSaveTabFigmaUrl(tabId: string) {
    const url = tabFigmaInput.trim();
    const sb = createClient();
    await sb.from("feature_tabs").update({ figma_url: url || null }).eq("id", tabId);
    setCustomTabs(prev => prev.map(t => t.id === tabId ? { ...t, figma_url: url || null } : t));
    setEditingTabFigmaId(null);
  }

  async function handleAddSection(kind: string) {
    const sb = createClient();
    const { data } = await sb.from("policies")
      .insert({ item_type: itemType, item_id: itemId, kind, mode: "image", author_name: currentUserName, updated_at: new Date().toISOString() })
      .select("*").single();
    if (data) setPolicies(prev => [...prev, normalizePolicy(data)]);
  }

  async function handleDeleteSection(id: string) {
    const sb = createClient();
    await sb.from("policies").delete().eq("id", id);
    setPolicies(prev => prev.filter(p => p.id !== id));
  }

  // ── 피그마 탭 전체 일괄 불러오기 (2단계 진행률 표시) ─────────────────
  async function handleBulkImport(tab: { id: string; figma_url: string | null }) {
    if (!tab.figma_url) return;
    setBulkImporting(true); setBulkProgress(0); setBulkError(null);
    setBulkLabel("피그마에 연결하는 중...");
    try {
      // ── Phase 1: 텍스트/구조 파싱 (0 → 50%) ──
      const animInterval = setInterval(() => {
        setBulkProgress(prev => prev < 45 ? prev + 2 : prev);
      }, 200);

      const res = await fetch("/api/figma-parse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: tab.figma_url }),
      });
      clearInterval(animInterval);

      if (!res.ok) {
        setBulkError((await res.json().catch(() => ({}))).error ?? "피그마를 가져오지 못했습니다.");
        setBulkImporting(false); return;
      }
      const parsed = await res.json();
      const { sections, descriptions, policyNote, uiNote, considerationNote } = parsed as {
        sections: { name: string; imageUrl: string; imageBase64: string; imageMimeType: string; badges: BadgeMark[]; isModal: boolean }[];
        descriptions: string[]; policyNote: string; uiNote: string; considerationNote: string;
      };
      if (!sections?.length) { setBulkError("가져올 와이어프레임이 없습니다."); setBulkImporting(false); return; }

      setBulkProgress(50);
      setBulkLabel(`텍스트 파싱 완료 · 이미지 업로드 중 (0/${sections.length})`);

      // ── Phase 2: 이미지 업로드 (50 → 100%) ──
      const sb = createClient();
      const created: Policy[] = [];

      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        setBulkLabel(`이미지 업로드 중 (${i + 1}/${sections.length})`);
        const { data: row, error: err } = await sb.from("policies").insert({
          item_type: itemType, item_id: itemId, kind: tab.id,
          title: sec.name, mode: "figma",
          description_items: i === 0 ? descriptions : [],
          policy_note: i === 0 ? policyNote : "",
          ui_note: i === 0 ? uiNote : "",
          consideration_note: i === 0 ? considerationNote : "",
          wireframes: [], flow_steps: [], tables: [], ai_screens: [],
          author_name: currentUserName, updated_at: new Date().toISOString(),
        }).select("*").single();
        if (err || !row) { setBulkProgress(50 + Math.round(((i + 1) / sections.length) * 50)); continue; }
        let saved = normalizePolicy(row);

        // 서버사이드 업로드 URL 우선, fallback으로 base64 클라이언트 업로드
        const srcUrl = sec.imageUrl || null;
        const srcBase64 = sec.imageBase64 || null;
        if (srcUrl || srcBase64) {
          try {
            let finalUrl: string | null = null;
            if (srcUrl) {
              finalUrl = `${srcUrl}?v=${Date.now()}`;
            } else if (srcBase64) {
              const bytes = Uint8Array.from(atob(srcBase64), c => c.charCodeAt(0));
              const blob = new Blob([bytes], { type: sec.imageMimeType });
              const ext = sec.imageMimeType.split("/")[1] ?? "png";
              const wfId2 = crypto.randomUUID();
              const path = `${itemType}/${itemId}/${saved.id}-${wfId2}.${ext}`;
              const { error: upErr } = await sb.storage.from("wireframes").upload(path, new File([blob], `figma.${ext}`, { type: sec.imageMimeType }), { upsert: true });
              if (!upErr) {
                const { data: urlData } = sb.storage.from("wireframes").getPublicUrl(path);
                finalUrl = `${urlData.publicUrl}?v=${Date.now()}`;
              }
            }
            if (finalUrl) {
              const wfId = crypto.randomUUID();
              const wfItem: WireframeItem = {
                id: wfId, url: finalUrl, name: sec.name,
                badges: sec.badges ?? [], isModal: sec.isModal ?? false, modalFor: null, order: i,
              };
              const { data: updated } = await sb.from("policies")
                .update({ wireframes: [wfItem], wireframe_url: wfItem.url, updated_at: new Date().toISOString() })
                .eq("id", saved.id).select("*").single();
              if (updated) saved = normalizePolicy(updated);
            }
          } catch { /* skip */ }
        }
        created.push(saved);
        setBulkProgress(50 + Math.round(((i + 1) / sections.length) * 50));
      }

      setPolicies(prev => [...prev, ...created]);
      setBulkLabel(`완료 — ${created.length}개 섹션 가져옴`);
      setTimeout(() => { setBulkImporting(false); setBulkProgress(0); setBulkLabel(""); }, 1500);
    } catch (e) {
      console.error(e); setBulkError("불러오기 중 오류가 발생했습니다.");
      setBulkImporting(false);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-zinc-400">불러오는 중...</p>;

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* ── 탭 바 ── */}
      <div className="flex flex-wrap items-center gap-1 self-start rounded-full bg-zinc-100 p-1">
        {allTabs.map(tab => (
          <button key={tab.id} type="button" onClick={() => setActiveTabKind(tab.id)}
            className={`flex items-center gap-1 rounded-full px-4 py-2 text-sm font-bold transition-colors ${activeTabKind === tab.id ? "bg-white text-ink shadow-sm" : "text-zinc-500 hover:text-ink"}`}>
            {tab.name}
            {!tab.isFixed && activeTabKind === tab.id && canEdit && (
              <span role="button" onClick={e => { e.stopPropagation(); handleDeleteTab(tab.id); }}
                className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-zinc-400 hover:bg-red-100 hover:text-red-500">×</span>
            )}
          </button>
        ))}
        {canEdit && (
          addingTab ? (
            <div className="flex items-center gap-1">
              <input autoFocus value={newTabName} onChange={e => setNewTabName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAddTab(); if (e.key === "Escape") { setAddingTab(false); setNewTabName(""); } }}
                placeholder="탭 이름" className="w-24 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand/20" />
              <button type="button" onClick={handleAddTab} className="rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand/90">확인</button>
              <button type="button" onClick={() => { setAddingTab(false); setNewTabName(""); }} className="rounded-full px-2 py-1.5 text-xs text-zinc-500 hover:bg-white">취소</button>
            </div>
          ) : (
            <button type="button" onClick={() => setAddingTab(true)}
              className="rounded-full px-3 py-2 text-sm font-bold text-zinc-400 hover:bg-white hover:text-ink">+ 추가</button>
          )
        )}
      </div>

      {/* ── 커스텀 탭 Figma URL 바 ── */}
      {!activeTabMeta.isFixed && canEdit && (
        <div className="flex items-center gap-2 rounded-2xl bg-zinc-50 px-4 py-3">
          {editingTabFigmaId === activeTabKind ? (
            <>
              <FigmaLogo />
              <input autoFocus type="url" value={tabFigmaInput} onChange={e => setTabFigmaInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleSaveTabFigmaUrl(activeTabKind); if (e.key === "Escape") setEditingTabFigmaId(null); }}
                placeholder="https://www.figma.com/design/..."
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20" />
              <button type="button" onClick={() => handleSaveTabFigmaUrl(activeTabKind)} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand/90">저장</button>
              <button type="button" onClick={() => setEditingTabFigmaId(null)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-100">취소</button>
            </>
          ) : activeTabMeta.figma_url ? (
            <>
              <FigmaLogo />
              <span className="flex-1 truncate text-xs text-zinc-400">{activeTabMeta.figma_url}</span>
              <button type="button" onClick={() => { setTabFigmaInput(activeTabMeta.figma_url ?? ""); setEditingTabFigmaId(activeTabKind); }} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-100">편집</button>
              <button type="button" disabled={bulkImporting} onClick={() => handleBulkImport(activeTabMeta)}
                className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand/90 disabled:opacity-50">
                {bulkImporting ? "불러오는 중..." : "전체 불러오기"}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => { setTabFigmaInput(""); setEditingTabFigmaId(activeTabKind); }}
              className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-brand">
              <FigmaLogo />피그마 URL 연결하기
            </button>
          )}
        </div>
      )}

      {/* ── 피그마 진행률 바 ── */}
      {bulkImporting && <ProgressBar progress={bulkProgress} label={bulkLabel || "불러오는 중..."} />}
      {bulkError && <p className="px-1 text-xs text-red-500">{bulkError}</p>}

      {/* ── 섹션 목록 ── */}
      <div className="flex flex-col gap-8">
        {activeTabKind !== "current" && displayPolicies.length === 0 && !bulkImporting && (
          <p className="px-1 text-sm text-zinc-400">섹션이 없습니다. 아래 버튼으로 추가하거나 피그마에서 불러오세요.</p>
        )}
        {displayPolicies.map(policy => (
          <PolicyCard
            key={policy.id || "empty"}
            policy={policy}
            tabName={activeTabMeta.name}
            onSaved={updated => setPolicies(prev =>
              prev.map(p => (p.id && p.id === updated.id) || (!p.id && !policy.id) ? updated : p)
            )}
            onDelete={canEdit && !!policy.id ? () => handleDeleteSection(policy.id) : undefined}
            currentUserName={currentUserName}
            canEdit={canEdit}
          />
        ))}
        {canEdit && (
          <button type="button" onClick={() => handleAddSection(activeTabKind)}
            className="flex items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-zinc-200 py-5 text-sm font-bold text-zinc-400 transition-colors hover:border-brand/40 hover:text-brand">
            + 섹션 추가
          </button>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// PolicyCard
// ──────────────────────────────────────────────────────────────────────────────

function PolicyCard({ policy, tabName, onSaved, onDelete, currentUserName, canEdit }: {
  policy: Policy; tabName: string;
  onSaved: (p: Policy) => void;
  onDelete?: () => void;
  currentUserName: string; canEdit: boolean;
}) {
  const [title, setTitle] = useState(policy.title);
  const [mode, setMode] = useState<PolicyMode>(policy.mode);
  const [wireframes, setWireframes] = useState<WireframeItem[]>(policy.wireframes);
  const [flowSteps, setFlowSteps] = useState<FlowStep[]>(policy.flow_steps);
  const [descItems, setDescItems] = useState<string[]>(policy.description_items.length ? policy.description_items : [""]);
  const [policyNote, setPolicyNote] = useState(policy.policy_note);
  const [uiNote, setUiNote] = useState(policy.ui_note);
  const [considerNote, setConsiderNote] = useState(policy.consideration_note);
  const [tables, setTables] = useState<TableData[]>(policy.tables);
  const [aiScreens, setAiScreens] = useState<AIScreen[]>(policy.ai_screens);
  const [showPolicy, setShowPolicy] = useState(!!policy.policy_note);
  const [showUi, setShowUi] = useState(!!policy.ui_note);
  const [showConsider, setShowConsider] = useState(!!policy.consideration_note);
  const [hoveredBadgeNum, setHoveredBadgeNum] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Figma 단건 임포트 상태 ──────────────────────────────────────────────
  const [figmaUrl, setFigmaUrl] = useState("");
  const [showFigmaInput, setShowFigmaInput] = useState(false);
  const [figmaProgress, setFigmaProgress] = useState(0);
  const [figmaImporting, setFigmaImporting] = useState(false);

  // ── AI 모드 상태 ────────────────────────────────────────────────────────
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiRefImage, setAiRefImage] = useState<{ data: string; mimeType: string } | null>(null);
  const [aiRefPreview, setAiRefPreview] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [activeAiScreen, setActiveAiScreen] = useState(0);
  const aiFileRef = useRef<HTMLInputElement>(null);

  // ── 리사이즈 패널 ────────────────────────────────────────────────────────
  const [rightWidth, setRightWidth] = useState(380);
  const splitterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = splitterRef.current;
    if (!el) return;
    let startX = 0, startW = rightWidth;
    function down(e: MouseEvent) { e.preventDefault(); startX = e.clientX; startW = rightWidth; document.addEventListener("mousemove", move); document.addEventListener("mouseup", up); }
    function move(e: MouseEvent) { setRightWidth(Math.max(280, Math.min(700, startW + (startX - e.clientX)))); }
    function up() { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); }
    el.addEventListener("mousedown", down);
    return () => el.removeEventListener("mousedown", down);
  }, [rightWidth]);

  const VERSION_LABEL = policy.kind === "current" ? "v1.0" : "v0.1";
  const badgeStyle =
    policy.kind === "current" ? "bg-white text-zinc-500" :
    policy.kind === "proposal" ? "bg-brand/10 text-brand" :
    "bg-purple-100 text-purple-700";

  // ── persist ────────────────────────────────────────────────────────────
  async function persist(changes: Partial<Policy>): Promise<Policy | null> {
    const sb = createClient();
    const stamp = { author_name: currentUserName, updated_at: new Date().toISOString() };
    if (!policy.id) {
      const { data, error: e } = await sb.from("policies")
        .insert({ item_type: policy.item_type, item_id: policy.item_id, kind: policy.kind, mode, title, description_items: descItems, policy_note: policyNote, ui_note: uiNote, consideration_note: considerNote, wireframes, flow_steps: flowSteps, tables, ai_screens: aiScreens, image_badges: [], wireframe_url: null, ...changes, ...stamp })
        .select("*").single();
      if (!e && data) { const p = normalizePolicy(data); onSaved(p); return p; }
      return null;
    }
    const { data, error: e } = await sb.from("policies").update({ ...changes, ...stamp }).eq("id", policy.id).select("*").single();
    if (!e && data) { const p = normalizePolicy(data); onSaved(p); return p; }
    return null;
  }

  // ── 이미지 업로드 ──────────────────────────────────────────────────────
  async function handleUpload(wfId: string, file: File) {
    if (!file.type.startsWith("image/")) { setError("이미지 파일만 업로드할 수 있습니다."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("이미지 크기는 10MB 이하여야 합니다."); return; }
    setError(null); setUploading(true);
    const sb = createClient();
    let policyId = policy.id;
    if (!policyId) {
      const saved = await persist({ wireframes, flow_steps: flowSteps });
      if (!saved) { setUploading(false); return; }
      policyId = saved.id;
    }
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${policy.item_type}/${policy.item_id}/${policyId}-${wfId}-${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from("wireframes").upload(path, file, { upsert: true });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    const { data: urlData } = sb.storage.from("wireframes").getPublicUrl(path);
    const url = `${urlData.publicUrl}?v=${Date.now()}`;
    const existing = wireframes.find(w => w.id === wfId);
    const nextWfs: WireframeItem[] = existing
      ? wireframes.map(w => w.id === wfId ? { ...w, url } : w)
      : [{ id: wfId, url, name: title || "화면", badges: [], isModal: false, modalFor: null, order: 0 }];
    setWireframes(nextWfs);
    await persist({ wireframes: nextWfs, wireframe_url: nextWfs[0]?.url ?? null });
    setUploading(false);
  }

  // ── 피그마 단건 임포트 (2단계 진행률) ─────────────────────────────────
  async function handleFigmaImport() {
    if (!figmaUrl.trim()) return;
    setError(null); setFigmaImporting(true); setShowFigmaInput(false); setFigmaProgress(0);

    const animInterval = setInterval(() => {
      setFigmaProgress(prev => prev < 45 ? prev + 3 : prev);
    }, 150);

    try {
      const res = await fetch("/api/figma-parse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: figmaUrl.trim() }),
      });
      clearInterval(animInterval);
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "피그마를 가져오지 못했습니다."); setFigmaImporting(false); return; }

      const parsed = await res.json();
      const { imageUrl: newImgUrl, imageBase64, imageMimeType, descriptions, policyNote: newPN, uiNote: newUN, considerationNote: newCN, wireframeName, sections: parsedSections } = parsed;

      setFigmaProgress(50);
      const newDescs = Array.isArray(descriptions) && descriptions.length ? descriptions : [""];
      const newBadges: BadgeMark[] = parsedSections?.[0]?.badges ?? [];
      setDescItems(newDescs);
      if (newPN) { setPolicyNote(newPN); setShowPolicy(true); }
      if (newUN) { setUiNote(newUN); setShowUi(true); }
      if (newCN) { setConsiderNote(newCN); setShowConsider(true); }
      if (wireframeName && !title) setTitle(wireframeName);
      setFigmaUrl("");
      setFigmaProgress(60);

      // 서버에서 Supabase 업로드 완료된 URL 사용 (우선), 실패 시 base64 fallback
      if (newImgUrl) {
        const existingWfId = wireframes[0]?.id ?? crypto.randomUUID();
        const nextWfs: WireframeItem[] = wireframes.length > 0
          ? wireframes.map((w, i) => i === 0 ? { ...w, url: `${newImgUrl}?v=${Date.now()}`, badges: newBadges.length ? newBadges : w.badges } : w)
          : [{ id: existingWfId, url: `${newImgUrl}?v=${Date.now()}`, name: wireframeName || "화면", badges: newBadges, isModal: false, modalFor: null, order: 0 }];
        setWireframes(nextWfs);
        await persist({
          description_items: newDescs,
          wireframes: nextWfs,
          wireframe_url: nextWfs[0]?.url ?? null,
          ...(wireframeName && !title ? { title: wireframeName } : {}),
          ...(newPN ? { policy_note: newPN } : {}),
          ...(newUN ? { ui_note: newUN } : {}),
          ...(newCN ? { consideration_note: newCN } : {}),
        });
      } else if (imageBase64) {
        // fallback: base64를 클라이언트에서 업로드
        if (newBadges.length) {
          const firstWfId = wireframes[0]?.id ?? crypto.randomUUID();
          setWireframes(prev => prev.length
            ? prev.map((w, i) => i === 0 ? { ...w, badges: newBadges } : w)
            : [{ id: firstWfId, url: null, name: wireframeName || "화면", badges: newBadges, isModal: false, modalFor: null, order: 0 }]
          );
        }
        await persist({
          description_items: newDescs,
          ...(wireframeName && !title ? { title: wireframeName } : {}),
          ...(newPN ? { policy_note: newPN } : {}),
          ...(newUN ? { ui_note: newUN } : {}),
          ...(newCN ? { consideration_note: newCN } : {}),
        });
        const bytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: imageMimeType ?? "image/png" });
        const file = new File([blob], `figma.${imageMimeType?.split("/")[1] ?? "png"}`, { type: imageMimeType ?? "image/png" });
        const wfId = wireframes[0]?.id ?? crypto.randomUUID();
        await handleUpload(wfId, file);
      } else {
        await persist({
          description_items: newDescs,
          ...(wireframeName && !title ? { title: wireframeName } : {}),
          ...(newPN ? { policy_note: newPN } : {}),
          ...(newUN ? { ui_note: newUN } : {}),
          ...(newCN ? { consideration_note: newCN } : {}),
        });
      }
      setFigmaProgress(100);
      setTimeout(() => { setFigmaImporting(false); setFigmaProgress(0); }, 800);
    } catch (e) { clearInterval(animInterval); console.error(e); setError("피그마 가져오기 중 오류가 발생했습니다."); setFigmaImporting(false); }
  }

  // ── AI 참조 이미지 선택 ─────────────────────────────────────────────────
  function handleAiRefImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      const data = result.split(",")[1];
      const mimeType = file.type;
      setAiRefImage({ data, mimeType });
      setAiRefPreview(result);
    };
    reader.readAsDataURL(file);
  }

  // ── AI 생성 ──────────────────────────────────────────────────────────
  async function handleAIGenerate() {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true); setAiError(null);
    try {
      const res = await fetch("/api/ai-generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          referenceImage: aiRefImage ?? undefined,
          context: { title, descriptions: descItems, policyNote, uiNote, considerNote },
        }),
      });
      if (!res.ok) { setAiError((await res.json().catch(() => ({}))).error ?? "생성 실패"); setAiGenerating(false); return; }
      const data = await res.json() as {
        screens: AIScreen[];
        descriptions?: string[]; policyNote?: string; tables?: TableData[];
      };
      setAiScreens(data.screens ?? []);
      setActiveAiScreen(0);
      if (data.descriptions?.length) setDescItems(data.descriptions);
      if (data.policyNote) { setPolicyNote(data.policyNote); setShowPolicy(true); }
      if (data.tables?.length) setTables(data.tables);
      await persist({
        mode: "ai", ai_screens: data.screens ?? [],
        ...(data.descriptions?.length ? { description_items: data.descriptions } : {}),
        ...(data.policyNote ? { policy_note: data.policyNote } : {}),
        ...(data.tables?.length ? { tables: data.tables } : {}),
      });
    } catch (e) { console.error(e); setAiError("AI 생성 중 오류가 발생했습니다."); }
    finally { setAiGenerating(false); }
  }

  function handleWfsChange(wfs: WireframeItem[]) {
    setWireframes(wfs);
    persist({ wireframes: wfs, wireframe_url: wfs.find(w => !w.isModal)?.url ?? null });
  }
  function handleFlowChange(steps: FlowStep[]) {
    setFlowSteps(steps);
    persist({ flow_steps: steps });
  }
  function handleTablesBlur() { persist({ tables }); }

  // ── AI iframe postMessage 핸들러 (화면 전환) ─────────────────────────
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.action === "navigate" && typeof e.data.to === "string") {
        const idx = aiScreens.findIndex(s => s.id === e.data.to);
        if (idx >= 0) setActiveAiScreen(idx);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [aiScreens]);

  return (
    <div className="flex flex-col gap-3">
      {/* ── 카드 헤더 ── */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badgeStyle}`}>{tabName}</span>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-zinc-500">{VERSION_LABEL}</span>
        <input value={title} readOnly={!canEdit}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => { if (title !== policy.title) persist({ title }); }}
          placeholder="화면 제목을 입력하세요"
          className={`flex-1 rounded-xl px-3 py-2 text-lg font-bold text-ink outline-none placeholder:font-normal placeholder:text-zinc-400 transition-colors ${canEdit ? "hover:bg-white focus:bg-white focus:ring-2 focus:ring-brand/20" : ""}`} />
        {(policy.author_name || fmtDate(policy.updated_at)) && (
          <span className="text-xs text-zinc-400">{[policy.author_name, fmtDate(policy.updated_at)].filter(Boolean).join(" · ")}</span>
        )}
        {onDelete && (
          <button type="button" onClick={onDelete} className="rounded-full p-2 text-zinc-400 hover:bg-red-50 hover:text-red-500">🗑</button>
        )}
      </div>

      {/* ── 모드 스위처 ── */}
      {canEdit && (
        <div className="flex items-center gap-1 self-start rounded-xl bg-zinc-100 p-1">
          {([["image", "🖼️ 이미지"], ["figma", "📐 피그마"], ["ai", "✨ AI"]] as [PolicyMode, string][]).map(([m, label]) => (
            <button key={m} type="button"
              onClick={() => { setMode(m); persist({ mode: m }); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${mode === m ? "bg-white text-ink shadow-sm" : "text-zinc-500 hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── 카드 본문: 무한 캔버스 + 리사이즈 패널 ── */}
      <div className="overflow-hidden rounded-3xl bg-surface">

        {/* ── AI 모드 프롬프트 입력 ── */}
        {mode === "ai" && canEdit && (
          <div className="flex flex-col gap-3 border-b border-zinc-100 p-4">
            {/* 현행 이미지 첨부 */}
            <div className="flex items-start gap-2">
              <button type="button" onClick={() => aiFileRef.current?.click()}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-500 hover:border-brand/40 hover:text-brand">
                📎 현행 화면 첨부
              </button>
              {aiRefPreview && (
                <div className="relative flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={aiRefPreview} alt="참조 이미지" className="h-12 w-auto rounded-lg border border-zinc-200 object-contain" />
                  <button type="button" onClick={() => { setAiRefImage(null); setAiRefPreview(null); }}
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">✕</button>
                </div>
              )}
              <input ref={aiFileRef} type="file" accept="image/*" className="hidden" onChange={handleAiRefImageSelect} />
            </div>
            {/* 프롬프트 입력 */}
            <div className="flex gap-2">
              <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) handleAIGenerate(); }}
                placeholder={aiRefImage ? "첨부된 현행 화면 기반으로 기획 내용을 설명하세요 (Enter 생성)" : "화면 기획 내용을 설명하세요. 현행 화면 이미지를 첨부하면 더 정확합니다 (Enter 생성)"}
                className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20" />
              <button type="button" onClick={handleAIGenerate} disabled={aiGenerating}
                className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-50">
                {aiGenerating ? "✨ 생성 중..." : "✨ 생성"}
              </button>
            </div>
            {aiError && <p className="text-xs text-red-500">{aiError}</p>}
          </div>
        )}

        {/* ── 피그마 임포트 단건 UI ── */}
        {mode === "figma" && canEdit && (
          <div className="border-b border-zinc-100 p-4">
            {figmaImporting ? (
              <ProgressBar progress={figmaProgress} label={figmaProgress < 50 ? "피그마 구조 파싱 중..." : figmaProgress < 100 ? "이미지 업로드 중..." : "완료!"} />
            ) : showFigmaInput ? (
              <div className="flex gap-2">
                <FigmaLogo />
                <input type="url" value={figmaUrl} autoFocus
                  onChange={e => setFigmaUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleFigmaImport(); if (e.key === "Escape") { setShowFigmaInput(false); setFigmaUrl(""); } }}
                  placeholder="https://www.figma.com/design/..."
                  className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20" />
                <button type="button" onClick={handleFigmaImport} disabled={uploading}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-50">
                  가져오기
                </button>
                <button type="button" onClick={() => { setShowFigmaInput(false); setFigmaUrl(""); }}
                  className="rounded-xl px-3 py-2 text-sm font-bold text-zinc-400 hover:bg-zinc-100">취소</button>
              </div>
            ) : wireframes.filter(w => !w.isModal).length > 0 ? (
              <button type="button" onClick={() => setShowFigmaInput(true)}
                className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-brand">
                <FigmaLogo />다시 불러오기
              </button>
            ) : (
              <button type="button" onClick={() => setShowFigmaInput(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-zinc-200 py-3 text-sm font-bold text-zinc-400 hover:border-brand/40 hover:text-brand">
                <FigmaLogo />피그마 URL로 가져오기
              </button>
            )}
          </div>
        )}

        {/* ── 본문 레이아웃: [무한 캔버스] | [드래그 핸들] | [우측 패널] ── */}
        <div className="flex" style={{ height: 580 }}>

          {/* 무한 캔버스 영역 */}
          <InfiniteCanvas key={mode} className="flex-1 min-w-0" initialScale={mode === "ai" ? 1 : 0.5}>
            {/* AI 모드 */}
            {mode === "ai" && (
              <div className="flex gap-6">
                {aiScreens.length > 0 ? (
                  aiScreens.map((s, i) => (
                    <div key={s.id} className="flex flex-col gap-2" style={{ width: 390 }}>
                      <div className="flex items-center gap-2 px-1">
                        <button type="button" onClick={() => setActiveAiScreen(i)}
                          className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${activeAiScreen === i ? "bg-brand text-white" : "bg-white text-zinc-500 hover:bg-brand/10 hover:text-brand"}`}>
                          {s.name}
                        </button>
                        {s.flowTo.length > 0 && s.flowTo.map(toId => {
                          const target = aiScreens.find(x => x.id === toId);
                          return target ? (
                            <button key={toId} type="button" onClick={() => setActiveAiScreen(aiScreens.findIndex(x => x.id === toId))}
                              className="text-xs text-zinc-400 hover:text-brand">→ {target.name}</button>
                          ) : null;
                        })}
                      </div>
                      <iframe
                        srcDoc={s.html}
                        sandbox="allow-scripts allow-same-origin"
                        className={`w-full rounded-2xl border-2 transition-all ${activeAiScreen === i ? "border-brand shadow-lg shadow-brand/20" : "border-zinc-200"}`}
                        style={{ height: 480 }}
                        title={s.name}
                      />
                    </div>
                  ))
                ) : (
                  <div className="flex h-[480px] w-[390px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-zinc-300 bg-white text-zinc-400">
                    <span className="text-5xl">✨</span>
                    <span className="text-sm font-medium">위에서 기획 내용을 입력하고 생성하세요</span>
                    {canEdit && <span className="text-xs opacity-60">현행 화면 이미지 첨부 시 더욱 정확</span>}
                  </div>
                )}
              </div>
            )}

            {/* 이미지 / 피그마 모드 */}
            {(mode === "image" || mode === "figma") && (
              <>
                {wireframes.length === 0 && mode === "image" && (
                  <div
                    onClick={canEdit ? () => {
                      const id = crypto.randomUUID();
                      setWireframes([{ id, url: null, name: title || "화면", badges: [], isModal: false, modalFor: null, order: 0 }]);
                    } : undefined}
                    style={{ width: 390, height: 700 }}
                    className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 bg-white text-zinc-400 ${canEdit ? "cursor-pointer hover:border-brand/40 hover:bg-brand/5" : ""}`}
                  >
                    <span className="text-3xl">🖼️</span>
                    <span className="text-sm">이미지가 없습니다</span>
                    {canEdit && <span className="text-xs opacity-60">클릭해서 와이어프레임 추가</span>}
                  </div>
                )}
                {wireframes.length > 0 && (
                  <WireframeCanvas
                    wireframes={wireframes} flowSteps={flowSteps}
                    onWireframesChange={handleWfsChange} onFlowStepsChange={handleFlowChange}
                    onUpload={handleUpload}
                    hoveredBadgeNumber={hoveredBadgeNum} onBadgeHover={setHoveredBadgeNum}
                    canEdit={canEdit}
                  />
                )}
              </>
            )}
          </InfiniteCanvas>

          {/* 리사이즈 드래그 핸들 */}
          <div
            ref={splitterRef}
            className="w-1.5 shrink-0 cursor-col-resize bg-zinc-150 transition-colors hover:bg-brand/40 active:bg-brand"
            title="드래그로 패널 너비 조절"
          />

          {/* 우측 정책 패널 (리사이즈 가능) */}
          <div
            className="shrink-0 overflow-y-auto"
            style={{ width: rightWidth }}
          >
            <DescriptionPanel
              descItems={descItems} policyNote={policyNote} uiNote={uiNote} considerNote={considerNote}
              tables={tables} showPolicy={showPolicy} showUi={showUi} showConsider={showConsider}
              hoveredBadgeNum={hoveredBadgeNum}
              onDescChange={setDescItems}
              onPolicyChange={setPolicyNote} onUiChange={setUiNote} onConsiderChange={setConsiderNote}
              onTablesChange={setTables}
              onShowPolicy={setShowPolicy} onShowUi={setShowUi} onShowConsider={setShowConsider}
              onBadgeHover={setHoveredBadgeNum}
              onBlur={() => persist({ description_items: descItems, policy_note: policyNote, ui_note: uiNote, consideration_note: considerNote, tables })}
              onTablesBlur={handleTablesBlur}
              canEdit={canEdit}
            />
          </div>
        </div>

        {(error || uploading) && (
          <div className="border-t border-zinc-100 px-4 py-2 text-xs">
            {uploading && <span className="text-zinc-400">업로드 중...</span>}
            {error && <span className="text-red-500">{error}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// DescriptionPanel
// ──────────────────────────────────────────────────────────────────────────────

function DescriptionPanel({
  descItems, policyNote, uiNote, considerNote, tables,
  showPolicy, showUi, showConsider, hoveredBadgeNum,
  onDescChange, onPolicyChange, onUiChange, onConsiderChange, onTablesChange,
  onShowPolicy, onShowUi, onShowConsider, onBadgeHover,
  onBlur, onTablesBlur, canEdit,
}: {
  descItems: string[]; policyNote: string; uiNote: string; considerNote: string;
  tables: TableData[]; showPolicy: boolean; showUi: boolean; showConsider: boolean;
  hoveredBadgeNum: number | null;
  onDescChange: (v: string[]) => void; onPolicyChange: (v: string) => void;
  onUiChange: (v: string) => void; onConsiderChange: (v: string) => void;
  onTablesChange: (v: TableData[]) => void;
  onShowPolicy: (v: boolean) => void; onShowUi: (v: boolean) => void; onShowConsider: (v: boolean) => void;
  onBadgeHover: (n: number | null) => void;
  onBlur: () => void; onTablesBlur: () => void;
  canEdit: boolean;
}) {
  const BADGE_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];
  const bColor = (n: number) => BADGE_COLORS[(n - 1) % BADGE_COLORS.length];

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* 디스크립션 */}
      <div className="flex flex-col gap-2 rounded-2xl bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-400">디스크립션</span>
          {canEdit && (
            <button type="button" onClick={() => onDescChange([...descItems, ""])}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-400 hover:bg-zinc-200 hover:text-ink">+ 행 추가</button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {descItems.map((item, idx) => {
            const num = idx + 1;
            const isHighlighted = hoveredBadgeNum === num;
            const color = bColor(num);
            return (
              <div key={idx}
                onMouseEnter={() => onBadgeHover(num)} onMouseLeave={() => onBadgeHover(null)}
                style={isHighlighted ? { boxShadow: `0 0 0 2px ${color}55`, backgroundColor: color + "0d" } : undefined}
                className="flex gap-2 rounded-xl p-1 transition-all">
                <span style={{ backgroundColor: color }} className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">{num}</span>
                <AutoResizeTextarea value={item} readOnly={!canEdit}
                  onChange={e => onDescChange(descItems.map((v, i) => i === idx ? e.target.value : v))}
                  onBlur={onBlur} placeholder="디스크립션을 입력하세요."
                  className="flex-1 rounded-xl bg-zinc-50 px-3 py-2 text-sm leading-relaxed text-ink outline-none focus:ring-2 focus:ring-brand/20" />
                {canEdit && (
                  <button type="button" onClick={() => { onDescChange(descItems.filter((_, i) => i !== idx)); onBlur(); }}
                    className="self-start rounded-full px-2 py-1 text-xs font-bold text-zinc-400 hover:bg-red-50 hover:text-red-500">✕</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 표 */}
      <TableEditor tables={tables} onChange={onTablesChange} onBlur={onTablesBlur} canEdit={canEdit} />

      {/* 추가 토글 버튼 */}
      {canEdit && (!showPolicy || !showUi || !showConsider) && (
        <div className="flex flex-wrap gap-2">
          {!showPolicy && <button type="button" onClick={() => onShowPolicy(true)} className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-200 hover:text-ink">+ 정책</button>}
          {!showUi && <button type="button" onClick={() => onShowUi(true)} className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-200 hover:text-ink">+ UI 참고사항</button>}
          {!showConsider && <button type="button" onClick={() => onShowConsider(true)} className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-200 hover:text-ink">+ 고려사항</button>}
        </div>
      )}

      {/* 정책 (Rich Text) */}
      {showPolicy && (
        <div className="rounded-2xl bg-red-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-red-500">정책</span>
            {canEdit && <button type="button" onClick={() => onShowPolicy(false)} className="text-xs font-bold text-red-300 hover:text-red-500">✕</button>}
          </div>
          <RichNoteEditor value={policyNote} readOnly={!canEdit} onChange={onPolicyChange} onBlur={onBlur}
            placeholder="정책을 입력하세요." className="text-sm leading-relaxed text-red-700" />
        </div>
      )}

      {/* UI 참고사항 (Rich Text) */}
      {showUi && (
        <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-amber-600">★ UI 참고사항</span>
            {canEdit && <button type="button" onClick={() => onShowUi(false)} className="text-xs font-bold text-amber-400 hover:text-amber-600">✕</button>}
          </div>
          <RichNoteEditor value={uiNote} readOnly={!canEdit} onChange={onUiChange} onBlur={onBlur}
            placeholder="내용을 입력하세요." className="text-sm leading-relaxed text-amber-800" />
        </div>
      )}

      {/* 고려사항 (Rich Text) */}
      {showConsider && (
        <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-emerald-600">★ 고려사항</span>
            {canEdit && <button type="button" onClick={() => onShowConsider(false)} className="text-xs font-bold text-emerald-400 hover:text-emerald-600">✕</button>}
          </div>
          <RichNoteEditor value={considerNote} readOnly={!canEdit} onChange={onConsiderChange} onBlur={onBlur}
            placeholder="내용을 입력하세요." className="text-sm leading-relaxed text-emerald-800" />
        </div>
      )}
    </div>
  );
}
