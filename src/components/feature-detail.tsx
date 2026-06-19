"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { InfiniteCanvas } from "@/components/infinite-canvas";
import { WireframeCanvas } from "@/components/wireframe-canvas";
import { TableEditor } from "@/components/table-editor";
import type { Policy, PolicyMode, WireframeItem, FlowStep, TableData, AIScreen, DescGroup } from "@/types/policy";
import { normalizePolicy } from "@/types/policy";
import { parseFigmaTree } from "@/utils/figmaParser";

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
    title: "", mode: "canvas",
    wireframes: [], flow_steps: [],
    description_groups: [], description_items: [], policy_note: "", ui_note: "", consideration_note: "",
    tables: [], ai_screens: [],
    wireframe_url: null, image_badges: [],
    sort_order: 0, author_name: null, updated_at: null,
    version_major: kind === "current" ? 1 : 0,
    version_minor: kind === "current" ? 0 : 1,
    is_locked: false, published_at: null, publish_type: null, change_log: "",
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
  const [currentFigmaUrl, setCurrentFigmaUrl] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(`posscope_fig_${itemType}_${itemId}`) ?? "";
  });

  function saveCurrentFigmaUrl(url: string) {
    setCurrentFigmaUrl(url);
    if (typeof window !== "undefined") {
      if (url) localStorage.setItem(`posscope_fig_${itemType}_${itemId}`, url);
      else localStorage.removeItem(`posscope_fig_${itemType}_${itemId}`);
    }
  }

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

  const allTabs = [
    { id: "current" as string, name: "현행", figma_url: currentFigmaUrl, isFixed: true },
    ...customTabs.map(t => ({ ...t, isFixed: false })),
  ];
  const activeTabMeta = allTabs.find(t => t.id === activeTabKind) ?? allTabs[0];
  const activePolicies = policies.filter(p => p.kind === activeTabKind);
  // 잠금(발행 완료) row는 히스토리 패널에서 관리 — 메인 뷰에는 초안만 표시
  const draftPolicies = activePolicies.filter(p => !p.is_locked);
  const displayPolicies = draftPolicies.length > 0
    ? draftPolicies
    : activePolicies.length === 0
    ? [emptyPolicy(itemType, itemId, activeTabKind)]
    : [];

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
    if (tabId === "current") {
      saveCurrentFigmaUrl(url);
      setEditingTabFigmaId(null);
      return;
    }
    const sb = createClient();
    await sb.from("feature_tabs").update({ figma_url: url || null }).eq("id", tabId);
    setCustomTabs(prev => prev.map(t => t.id === tabId ? { ...t, figma_url: url || null } : t));
    setEditingTabFigmaId(null);
  }

  async function handleAddSection(kind: string) {
    const sb = createClient();
    const { data } = await sb.from("policies")
      .insert({ item_type: itemType, item_id: itemId, kind, mode: "canvas", author_name: currentUserName, updated_at: new Date().toISOString() })
      .select("*").single();
    if (data) setPolicies(prev => [...prev, normalizePolicy(data)]);
  }

  async function handleDeleteSection(id: string) {
    const sb = createClient();
    await sb.from("policies").delete().eq("id", id);
    setPolicies(prev => prev.filter(p => p.id !== id));
  }

  // ── 피그마 탭 전체 일괄 불러오기 (클라이언트 파싱 + Vercel 타임아웃 우회) ──
  async function handleBulkImport(tab: { id: string; figma_url: string | null }) {
    if (!tab.figma_url) return;
    setBulkImporting(true); setBulkProgress(0); setBulkError(null);
    setBulkLabel("피그마 노드 트리 수신 중...");
    try {
      // ── Phase 1: 서버 경량 Proxy → Raw 노드 JSON (0 → 20%) ──────────────
      const animInterval = setInterval(() => {
        setBulkProgress(prev => prev < 18 ? prev + 2 : prev);
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

      const { rawNode, fileKey } = await res.json();
      setBulkProgress(20);

      // ── Phase 2: 클라이언트 파싱 (브라우저, 타임아웃 없음) (20 → 35%) ──
      setBulkLabel("노드 트리 파싱 중...");
      const parseResult = parseFigmaTree(rawNode);
      setBulkProgress(35);

      // ── Phase 3: 이미지 Export URL 수신 (35 → 50%) ──────────────────────
      const allFrameIds = parseResult.hasSections
        ? parseResult.sections.flatMap(s => s.wireframeFrames.map(w => w.nodeId))
        : parseResult.wireframeFrames.map(w => w.nodeId);

      let imageUrls: Record<string, string | null> = {};
      if (allFrameIds.length > 0) {
        setBulkLabel("이미지 URL 추출 중...");
        const imgRes = await fetch("/api/figma-images", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileKey, nodeIds: allFrameIds }),
        });
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          imageUrls = imgData.images ?? {};
        }
      }
      setBulkProgress(50);

      // ── Phase 4: 이미지 다운로드 + Supabase 업로드 + DB 저장 ─────────────
      const sb = createClient();
      const created: Policy[] = [];

      async function resolveImageUrl(nodeId: string, policyId: string, order: number): Promise<string | null> {
        const dashId = nodeId.replace(/:/g, "-");
        const cdnUrl = imageUrls[nodeId] ?? imageUrls[dashId] ?? null;
        if (!cdnUrl) return null;
        try {
          const imgRes = await fetch(cdnUrl);
          if (!imgRes.ok) return cdnUrl;
          const blob = await imgRes.blob();
          const mimeType = imgRes.headers.get("content-type") ?? "image/png";
          const ext = mimeType.split("/")[1]?.split(";")[0] ?? "png";
          const path = `figma/${fileKey}/${dashId}-${policyId}-${order}.${ext}`;
          const { error: upErr } = await sb.storage.from("wireframes").upload(path, blob, { contentType: mimeType, upsert: true });
          if (upErr) return cdnUrl;
          const { data: urlData } = sb.storage.from("wireframes").getPublicUrl(path);
          return `${urlData.publicUrl}?v=${Date.now()}`;
        } catch {
          return cdnUrl;
        }
      }

      // ── 모드 A: 초록 포스트잇 섹션 (섹션 당 다수 wireframe) ──────────────
      if (parseResult.hasSections && parseResult.sections.length > 0) {
        setBulkLabel(`초록 포스트잇 ${parseResult.sections.length}개 섹션 감지됨`);

        for (let i = 0; i < parseResult.sections.length; i++) {
          const sec = parseResult.sections[i];
          setBulkLabel(`섹션 처리 중 (${i + 1}/${parseResult.sections.length}): ${sec.sectionTitle}`);

          const { data: row } = await sb.from("policies").insert({
            item_type: itemType, item_id: itemId, kind: tab.id,
            title: sec.sectionTitle, mode: "canvas",
            wireframes: [], flow_steps: [], tables: [], ai_screens: [],
            description_groups: sec.descriptionGroups ?? [],
            description_items: [],
            policy_note: sec.policyNote ?? "",
            ui_note: sec.uiNote ?? "",
            consideration_note: sec.considerationNote ?? "",
            author_name: currentUserName, updated_at: new Date().toISOString(),
          }).select("*").single();
          if (!row) { setBulkProgress(50 + Math.round(((i + 1) / parseResult.sections.length) * 50)); continue; }

          const wfItems: WireframeItem[] = [];
          for (let j = 0; j < sec.wireframeFrames.length; j++) {
            const frame = sec.wireframeFrames[j];
            const finalUrl = await resolveImageUrl(frame.nodeId, row.id, j);
            wfItems.push({
              id: crypto.randomUUID(), url: finalUrl, name: frame.name,
              badges: frame.badges ?? [], isModal: frame.isModal ?? false, modalFor: null, order: j,
            });
          }

          const { data: updated } = await sb.from("policies")
            .update({ wireframes: wfItems, wireframe_url: wfItems[0]?.url ?? null, updated_at: new Date().toISOString() })
            .eq("id", row.id).select("*").single();
          created.push(normalizePolicy(updated ?? row));
          setBulkProgress(50 + Math.round(((i + 1) / parseResult.sections.length) * 50));
        }

      // ── 모드 B: fallback — 와이어프레임 당 1섹션 ────────────────────────
      } else {
        if (!parseResult.wireframeFrames.length) {
          setBulkError("가져올 와이어프레임이 없습니다."); setBulkImporting(false); return;
        }
        const totalFrames = parseResult.wireframeFrames.length;
        setBulkLabel(`이미지 업로드 중 (0/${totalFrames})`);

        for (let i = 0; i < totalFrames; i++) {
          const frame = parseResult.wireframeFrames[i];
          setBulkLabel(`이미지 업로드 중 (${i + 1}/${totalFrames})`);

          const { data: row, error: err } = await sb.from("policies").insert({
            item_type: itemType, item_id: itemId, kind: tab.id,
            title: frame.name, mode: "canvas",
            description_groups: i === 0 ? parseResult.descriptionGroups : [],
            description_items: [],
            policy_note: i === 0 ? parseResult.policyNote : "",
            ui_note: i === 0 ? parseResult.uiNote : "",
            consideration_note: i === 0 ? parseResult.considerationNote : "",
            wireframes: [], flow_steps: [],
            tables: i === 0 ? parseResult.tables : [],
            ai_screens: [],
            author_name: currentUserName, updated_at: new Date().toISOString(),
          }).select("*").single();
          if (err || !row) { setBulkProgress(50 + Math.round(((i + 1) / totalFrames) * 50)); continue; }

          let saved = normalizePolicy(row);
          const finalUrl = await resolveImageUrl(frame.nodeId, saved.id, 0);
          if (finalUrl) {
            const wfItem: WireframeItem = {
              id: crypto.randomUUID(), url: finalUrl, name: frame.name,
              badges: frame.badges ?? [], isModal: frame.isModal ?? false, modalFor: null, order: i,
            };
            const { data: updated } = await sb.from("policies")
              .update({ wireframes: [wfItem], wireframe_url: wfItem.url, updated_at: new Date().toISOString() })
              .eq("id", saved.id).select("*").single();
            if (updated) saved = normalizePolicy(updated);
          }
          created.push(saved);
          setBulkProgress(50 + Math.round(((i + 1) / totalFrames) * 50));
        }
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

  // ── 탭 바 슬롯 (첫 번째 PolicyCard의 헤더 행에 주입) ──────────────────────
  const tabBarSlot: ReactNode = (
    <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5">
      {allTabs.map(tab => (
        <button key={tab.id} type="button" onClick={() => setActiveTabKind(tab.id)}
          className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${activeTabKind === tab.id ? "bg-white text-ink shadow-sm" : "text-zinc-500 hover:text-ink"}`}>
          {tab.name}
          {!tab.isFixed && activeTabKind === tab.id && canEdit && (
            <span role="button" onClick={e => { e.stopPropagation(); handleDeleteTab(tab.id); }}
              className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] text-zinc-400 hover:bg-red-100 hover:text-red-500">×</span>
          )}
        </button>
      ))}
      {canEdit && (
        addingTab ? (
          <div className="flex items-center gap-1">
            <input autoFocus value={newTabName} onChange={e => setNewTabName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAddTab(); if (e.key === "Escape") { setAddingTab(false); setNewTabName(""); } }}
              placeholder="탭 이름" className="w-20 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs outline-none focus:ring-2 focus:ring-brand/20" />
            <button type="button" onClick={handleAddTab} className="rounded-md bg-brand px-2 py-0.5 text-xs font-bold text-white hover:bg-brand/90">확인</button>
            <button type="button" onClick={() => { setAddingTab(false); setNewTabName(""); }} className="rounded-md px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-white">취소</button>
          </div>
        ) : (
          <button type="button" onClick={() => setAddingTab(true)}
            className="rounded-md px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:bg-white hover:text-ink">+ 추가</button>
        )
      )}
    </div>
  );

  return (
    <div className="mt-4 flex flex-col gap-3">
      {/* ── 피그마 일괄 불러오기 진행률 ── */}
      {bulkImporting && <ProgressBar progress={bulkProgress} label={bulkLabel || "불러오는 중..."} />}
      {bulkError && <p className="px-1 text-xs text-red-500">{bulkError}</p>}

      {/* ── 섹션 목록 ── */}
      <div className="flex flex-col gap-8">
        {displayPolicies.length === 0 && !bulkImporting && (
          <p className="px-1 text-sm text-zinc-400">섹션이 없습니다. 아래 버튼으로 추가하거나 피그마에서 불러오세요.</p>
        )}
        {displayPolicies.map((policy, pIdx) => (
          <PolicyCard
            key={policy.id || "empty"}
            policy={policy}
            tabName={activeTabMeta.name}
            itemType={itemType}
            itemId={itemId}
            onSaved={updated => setPolicies(prev => {
              if (prev.some(p => p.id && p.id === updated.id)) {
                return prev.map(p => p.id === updated.id ? updated : p);
              }
              const hasEmpty = prev.some(p => !p.id && p.kind === updated.kind && p.item_id === updated.item_id);
              if (hasEmpty) {
                return prev.map(p => (!p.id && p.kind === updated.kind && p.item_id === updated.item_id) ? updated : p);
              }
              return [...prev, updated];
            })}
            onDelete={canEdit && !!policy.id ? () => handleDeleteSection(policy.id) : undefined}
            onAddDraft={draft => setPolicies(prev => [...prev, draft])}
            currentUserName={currentUserName}
            canEdit={canEdit}
            tabBarSlot={pIdx === 0 ? tabBarSlot : undefined}
          />
        ))}
        {canEdit && (
          <button type="button" onClick={() => handleAddSection(activeTabKind)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 hover:text-gray-700 transition-colors">
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

function PolicyCard({ policy, tabName, itemType, itemId, onSaved, onDelete, onAddDraft, currentUserName, canEdit, tabBarSlot }: {
  policy: Policy; tabName: string; itemType: ItemType; itemId: string;
  onSaved: (p: Policy) => void;
  onDelete?: () => void;
  onAddDraft?: (p: Policy) => void;
  currentUserName: string; canEdit: boolean; tabBarSlot?: ReactNode;
}) {
  const [title, setTitle] = useState(policy.title);
  const [mode, setMode] = useState<PolicyMode>(policy.mode);
  const [wireframes, setWireframes] = useState<WireframeItem[]>(policy.wireframes);
  const [flowSteps, setFlowSteps] = useState<FlowStep[]>(policy.flow_steps);
  const [descGroups, setDescGroups] = useState<DescGroup[]>(
    policy.description_groups.length
      ? policy.description_groups
      : [{ id: `empty-${policy.id || "new"}`, pinNumber: "1", title: "", subItems: [] }]
  );
  const [activePinNumber, setActivePinNumber] = useState<string | null>(null);
  const [hoveredPinNumber, setHoveredPinNumber] = useState<string | null>(null);
  const [policyNote, setPolicyNote] = useState(policy.policy_note);
  const [uiNote, setUiNote] = useState(policy.ui_note);
  const [considerNote, setConsiderNote] = useState(policy.consideration_note);
  const [tables, setTables] = useState<TableData[]>(policy.tables);
  const [aiScreens, setAiScreens] = useState<AIScreen[]>(policy.ai_screens);
  const [showPolicy, setShowPolicy] = useState(!!policy.policy_note);
  const [showUi, setShowUi] = useState(!!policy.ui_note);
  const [showConsider, setShowConsider] = useState(!!policy.consideration_note);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── 버전 관리 상태 ──────────────────────────────────────────────────────
  const [publishing, setPublishing] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveType, setSaveType] = useState<"draft" | "minor" | "major">("draft");
  const [changeLogText, setChangeLogText] = useState("");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Policy[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
  const [enhanceMode, setEnhanceMode] = useState(false);
  const [enhanceSourceName, setEnhanceSourceName] = useState<string | null>(null);
  const aiFileRef = useRef<HTMLInputElement>(null);

  // ── 캔버스 도구 모드 (V=이동, H=패닝) ──────────────────────────────────
  const [canvasToolMode, setCanvasToolMode] = useState<"hand" | "move">("move");

  // ── 빈 캔버스 이미지 업로드 ────────────────────────────────────────────
  const emptyUploadRef = useRef<HTMLInputElement>(null);

  // ── isDirty 추적 ─────────────────────────────────────────────────────────
  const cleanSnap = useRef(JSON.stringify({
    title: policy.title, mode: policy.mode,
    wireframes: policy.wireframes, flowSteps: policy.flow_steps,
    descGroups: policy.description_groups.length
      ? policy.description_groups
      : [{ id: `empty-${policy.id || "new"}`, pinNumber: "1", title: "", subItems: [] }],
    policyNote: policy.policy_note, uiNote: policy.ui_note,
    considerNote: policy.consideration_note, tables: policy.tables,
  }));
  const [isDirty, setIsDirty] = useState(false);

  function markClean(vals?: Partial<{ title: string; mode: PolicyMode; wireframes: WireframeItem[]; flowSteps: FlowStep[]; descGroups: DescGroup[]; policyNote: string; uiNote: string; considerNote: string; tables: TableData[] }>) {
    cleanSnap.current = JSON.stringify({
      title: vals?.title ?? title, mode: vals?.mode ?? mode,
      wireframes: vals?.wireframes ?? wireframes, flowSteps: vals?.flowSteps ?? flowSteps,
      descGroups: vals?.descGroups ?? descGroups,
      policyNote: vals?.policyNote ?? policyNote, uiNote: vals?.uiNote ?? uiNote,
      considerNote: vals?.considerNote ?? considerNote, tables: vals?.tables ?? tables,
    });
    setIsDirty(false);
  }

  useEffect(() => {
    const cur = JSON.stringify({ title, mode, wireframes, flowSteps, descGroups, policyNote, uiNote, considerNote, tables });
    setIsDirty(cur !== cleanSnap.current);
  }, [title, mode, wireframes, flowSteps, descGroups, policyNote, uiNote, considerNote, tables]);

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

  const vMaj = policy.version_major;
  const vMin = policy.version_minor;
  const VERSION_LABEL = `v${vMaj}.${vMin}`;
  const isLocked = policy.is_locked;
  const badgeStyle =
    policy.kind === "current" ? "bg-white text-zinc-500" :
    policy.kind === "proposal" ? "bg-brand/10 text-brand" :
    "bg-purple-100 text-purple-700";
  // 버전 뱃지: 메이저(v1+) = 초록, 마이너(v0.x) = 앰버, 잠금 = 회색
  const versionBadgeStyle = isLocked
    ? "bg-zinc-100 text-zinc-400"
    : vMaj >= 1
    ? "bg-emerald-100 text-emerald-700"
    : "bg-amber-100 text-amber-700";

  // ── 배지 ↔ 디스크립션 양방향 싱크 ────────────────────────────────────────
  function handleBadgeClick(pin: string) {
    setActivePinNumber(prev => prev === pin ? null : pin);
    const selector = pin.includes("-") ? `[data-pin-sub="${pin}"]` : `[data-pin-group="${pin}"]`;
    document.querySelector<HTMLElement>(selector)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ── 토스트 알림 ───────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  }

  // ── 초안 저장 (버전 번호 변동 없이 현재 상태 덮어쓰기) ───────────────────
  async function handleDraftSave() {
    setError(null);
    const saved = await persist({
      title, mode, wireframes, flow_steps: flowSteps,
      description_groups: descGroups, policy_note: policyNote,
      ui_note: uiNote, consideration_note: considerNote, tables,
    });
    if (saved) { showToast("임시 저장 완료 ✓"); markClean(); }
  }

  // ── 버전 발행 (현재 row 잠금 → 새 초안 생성) ─────────────────────────────
  async function handlePublish(type: "minor" | "major", changeLog = "") {
    if (!policy.id || publishing) return;
    setPublishing(true);
    try {
      await persist({
        title, mode, wireframes, flow_steps: flowSteps,
        description_groups: descGroups, policy_note: policyNote,
        ui_note: uiNote, consideration_note: considerNote, tables,
      });
      const res = await fetch("/api/policy-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyId: policy.id, publishType: type, userName: currentUserName, changeLog }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "발행 실패");
      const { locked, newDraft } = await res.json() as { locked: Policy; newDraft: Policy };
      const vNext = type === "major" ? `v${vMaj + 1}.0` : `v${vMaj}.${vMin + 1}`;
      showToast(`${vNext} ${type === "major" ? "메이저 배포" : "마이너 발행"} 완료 🎉`);
      markClean();
      onSaved(locked);
      onAddDraft?.(newDraft);
      setHistoryLoaded(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setPublishing(false);
    }
  }

  // ── 모달 최종 확인 ────────────────────────────────────────────────────────
  async function handleSaveAction() {
    setShowSaveModal(false);
    if (saveType === "draft") {
      await handleDraftSave();
    } else {
      await handlePublish(saveType, changeLogText);
    }
    setChangeLogText("");
  }

  // ── 히스토리 lazy load ─────────────────────────────────────────────────
  async function loadHistory() {
    if (historyLoaded) return;
    const sb = createClient();
    const { data } = await sb
      .from("policies")
      .select("*")
      .eq("item_type", policy.item_type)
      .eq("item_id", policy.item_id)
      .eq("kind", policy.kind)
      .eq("is_locked", true)
      .order("version_major", { ascending: true })
      .order("version_minor", { ascending: true });
    if (data) setHistory(data.map(normalizePolicy));
    setHistoryLoaded(true);
  }

  // ── persist ────────────────────────────────────────────────────────────
  async function persist(changes: Partial<Policy>): Promise<Policy | null> {
    const sb = createClient();
    const stamp = { author_name: currentUserName, updated_at: new Date().toISOString() };
    if (!policy.id) {
      const { data, error: e } = await sb.from("policies")
        .insert({ item_type: policy.item_type, item_id: policy.item_id, kind: policy.kind, mode, title, description_groups: descGroups, description_items: [], policy_note: policyNote, ui_note: uiNote, consideration_note: considerNote, wireframes, flow_steps: flowSteps, tables, ai_screens: aiScreens, image_badges: [], wireframe_url: null, ...changes, ...stamp })
        .select("*").single();
      if (e) { console.error("[persist INSERT error]", e.message, e); setError(`저장 실패: ${e.message}`); return null; }
      if (!data) { setError("저장 실패: 서버 응답 없음"); return null; }
      const p = normalizePolicy(data); onSaved(p); return p;
    }
    const { data, error: e } = await sb.from("policies").update({ ...changes, ...stamp }).eq("id", policy.id).select("*").single();
    if (e) { console.error("[persist UPDATE error]", e.message, e); setError(`저장 실패: ${e.message}`); return null; }
    if (!data) { setError("저장 실패: 서버 응답 없음 (policy.id=" + policy.id + ")"); return null; }
    const p = normalizePolicy(data); onSaved(p); return p;
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

  // ── 피그마 단건 임포트 (클라이언트 파싱, 3단계 진행률) ─────────────────────
  async function handleFigmaImport() {
    if (!figmaUrl.trim()) return;
    setError(null); setFigmaImporting(true); setShowFigmaInput(false); setFigmaProgress(0);

    const animInterval = setInterval(() => {
      setFigmaProgress(prev => prev < 18 ? prev + 2 : prev);
    }, 150);

    try {
      // Phase 1: 0→20% — 서버 경량 Proxy → Raw 노드
      const res = await fetch("/api/figma-parse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: figmaUrl.trim() }),
      });
      clearInterval(animInterval);
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "피그마를 가져오지 못했습니다."); setFigmaImporting(false); return; }

      const { rawNode, fileKey } = await res.json();
      setFigmaProgress(20);

      // Phase 2: 20→50% — 클라이언트 파싱 (브라우저, 타임아웃 없음)
      const parseResult = parseFigmaTree(rawNode);
      const newGroups: DescGroup[] = parseResult.descriptionGroups.length
        ? parseResult.descriptionGroups
        : [{ id: crypto.randomUUID(), pinNumber: "1", title: "", subItems: [] }];
      setDescGroups(newGroups);
      if (parseResult.policyNote)       { setPolicyNote(parseResult.policyNote); setShowPolicy(true); }
      if (parseResult.uiNote)           { setUiNote(parseResult.uiNote); setShowUi(true); }
      if (parseResult.considerationNote){ setConsiderNote(parseResult.considerationNote); setShowConsider(true); }
      if (parseResult.wireframeName && !title) setTitle(parseResult.wireframeName);
      setFigmaUrl("");
      setFigmaProgress(40);

      // Phase 3: 40→80% — 이미지 Export URL 수신
      const allFrameIds = parseResult.hasSections
        ? parseResult.sections.flatMap(s => s.wireframeFrames.map(w => w.nodeId))
        : parseResult.wireframeFrames.map(w => w.nodeId);

      let imageUrls: Record<string, string | null> = {};
      if (allFrameIds.length > 0) {
        const imgRes = await fetch("/api/figma-images", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileKey, nodeIds: allFrameIds }),
        });
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          imageUrls = imgData.images ?? {};
        }
      }
      setFigmaProgress(60);

      // Phase 4: 60→100% — CDN 다운로드 + Supabase 업로드
      const sb = createClient();

      async function resolveUrl(nodeId: string, idx: number): Promise<string | null> {
        const dashId = nodeId.replace(/:/g, "-");
        const cdnUrl = imageUrls[nodeId] ?? imageUrls[dashId] ?? null;
        if (!cdnUrl) return null;
        try {
          const imgRes = await fetch(cdnUrl);
          if (!imgRes.ok) return cdnUrl;
          const blob = await imgRes.blob();
          const mimeType = imgRes.headers.get("content-type") ?? "image/png";
          const ext = mimeType.split("/")[1]?.split(";")[0] ?? "png";
          const wfId = crypto.randomUUID();
          const path = `figma/${fileKey}/${dashId}-${wfId}-${idx}.${ext}`;
          const { error: upErr } = await sb.storage.from("wireframes").upload(path, blob, { contentType: mimeType, upsert: true });
          if (upErr) return cdnUrl;
          const { data: urlData } = sb.storage.from("wireframes").getPublicUrl(path);
          return `${urlData.publicUrl}?v=${Date.now()}`;
        } catch {
          return cdnUrl;
        }
      }

      const flatFrames = parseResult.hasSections
        ? parseResult.sections.flatMap(s => s.wireframeFrames)
        : parseResult.wireframeFrames;

      const nextWfs: WireframeItem[] = await Promise.all(
        flatFrames.map(async (frame, i) => {
          const finalUrl = await resolveUrl(frame.nodeId, i);
          setFigmaProgress(60 + Math.round(((i + 1) / flatFrames.length) * 35));
          return {
            id: crypto.randomUUID(),
            url: finalUrl,
            name: frame.name || `화면 ${i + 1}`,
            badges: frame.badges ?? [],
            isModal: frame.isModal ?? false,
            modalFor: null,
            order: i,
          };
        })
      );

      // 메인 화면들 간 순차 플로우 스텝 자동 생성
      const mainNewWfs = nextWfs.filter(w => !w.isModal);
      const autoFlowSteps: FlowStep[] = mainNewWfs.slice(0, -1).map((wf, i) => ({
        id: crypto.randomUUID(), from: wf.id, to: mainNewWfs[i + 1].id, label: `Step ${i + 1}`,
      }));

      const finalWfs = nextWfs.length > 0 ? nextWfs : wireframes;
      setWireframes(finalWfs);
      if (autoFlowSteps.length > 0) setFlowSteps(autoFlowSteps);
      if (parseResult.tables.length > 0) setTables(parseResult.tables);

      await persist({
        description_groups: newGroups,
        wireframes: finalWfs,
        flow_steps: autoFlowSteps.length > 0 ? autoFlowSteps : flowSteps,
        wireframe_url: finalWfs[0]?.url ?? null,
        ...(parseResult.wireframeName && !title ? { title: parseResult.wireframeName } : {}),
        ...(parseResult.policyNote ? { policy_note: parseResult.policyNote } : {}),
        ...(parseResult.uiNote ? { ui_note: parseResult.uiNote } : {}),
        ...(parseResult.considerationNote ? { consideration_note: parseResult.considerationNote } : {}),
        ...(parseResult.tables.length > 0 ? { tables: parseResult.tables } : {}),
      });

      markClean({
        wireframes: finalWfs,
        flowSteps: autoFlowSteps.length > 0 ? autoFlowSteps : flowSteps,
        descGroups: newGroups,
        ...(parseResult.policyNote ? { policyNote: parseResult.policyNote } : {}),
        ...(parseResult.uiNote ? { uiNote: parseResult.uiNote } : {}),
        ...(parseResult.considerationNote ? { considerNote: parseResult.considerationNote } : {}),
        ...(parseResult.wireframeName && !title ? { title: parseResult.wireframeName } : {}),
      });
      setFigmaProgress(100);
      setTimeout(() => { setFigmaImporting(false); setFigmaProgress(0); }, 800);
    } catch (e) {
      clearInterval(animInterval);
      console.error(e); setError("피그마 가져오기 중 오류가 발생했습니다."); setFigmaImporting(false);
    }
  }

  // ── WireframeCanvas의 "✨ AI 고도화" 버튼 핸들러 ────────────────────────
  async function handleAIEnhance(wf: WireframeItem) {
    if (!wf.url) return;
    setMode("ai");
    setEnhanceMode(true);
    setEnhanceSourceName(wf.name);
    setAiPrompt(`[${wf.name}] 화면을 기반으로 `);
    try {
      const res = await fetch(wf.url);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = ev => {
        const result = ev.target?.result as string;
        setAiRefImage({ data: result.split(",")[1], mimeType: blob.type || "image/png" });
        setAiRefPreview(result);
      };
      reader.readAsDataURL(blob);
    } catch { /* URL 접근 불가 시 이미지 없이 AI 모드만 전환 */ }
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

  // ── AI 생성 / 고도화 ─────────────────────────────────────────────────
  async function handleAIGenerate() {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true); setAiError(null);
    try {
      const res = await fetch("/api/ai-generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          referenceImage: aiRefImage ?? undefined,
          enhanceMode,
          context: {
            title,
            descriptions: descGroups.map(g => g.title),
            subItems: descGroups.flatMap(g => g.subItems.map(s => `${s.pinNumber}: ${s.text}`)),
            policyNote, uiNote, considerNote,
          },
        }),
      });
      if (!res.ok) { setAiError((await res.json().catch(() => ({}))).error ?? "생성 실패"); setAiGenerating(false); return; }
      const data = await res.json() as {
        screens: AIScreen[];
        descriptions?: string[]; appendDescriptions?: string[];
        policyNote?: string; appendPolicyNote?: string;
        tables?: TableData[];
      };

      setAiScreens(data.screens ?? []);
      setActiveAiScreen(0);

      if (enhanceMode) {
        // 고도화 모드: 기존 정보에 추가/변경만 반영
        if (data.appendDescriptions?.length) {
          const basePin = descGroups.reduce((m, g) => Math.max(m, parseInt(g.pinNumber, 10) || 0), 0);
          const newGroups: DescGroup[] = data.appendDescriptions.map((text, i) => ({
            id: crypto.randomUUID(), pinNumber: String(basePin + i + 1), title: text, subItems: [],
          }));
          const merged = [...descGroups, ...newGroups];
          setDescGroups(merged);
          await persist({ mode: "ai", ai_screens: data.screens ?? [], description_groups: merged,
            ...(data.appendPolicyNote ? { policy_note: policyNote ? `${policyNote}\n\n[AI 고도화 추가]\n${data.appendPolicyNote}` : data.appendPolicyNote } : {}),
            ...(data.tables?.length ? { tables: data.tables } : {}),
          });
          if (data.appendPolicyNote) { setPolicyNote(prev => prev ? `${prev}\n\n[AI 고도화 추가]\n${data.appendPolicyNote}` : data.appendPolicyNote!); setShowPolicy(true); }
        } else {
          await persist({ mode: "ai", ai_screens: data.screens ?? [] });
        }
      } else {
        // 신규 생성 모드: 기존 내용 교체
        if (data.descriptions?.length) {
          const aiGroups: DescGroup[] = data.descriptions.map((text, i) => ({
            id: crypto.randomUUID(), pinNumber: String(i + 1), title: text, subItems: [],
          }));
          setDescGroups(aiGroups);
          await persist({ mode: "ai", ai_screens: data.screens ?? [], description_groups: aiGroups,
            ...(data.policyNote ? { policy_note: data.policyNote } : {}),
            ...(data.tables?.length ? { tables: data.tables } : {}),
          });
        } else {
          await persist({ mode: "ai", ai_screens: data.screens ?? [],
            ...(data.policyNote ? { policy_note: data.policyNote } : {}),
            ...(data.tables?.length ? { tables: data.tables } : {}),
          });
        }
        if (data.policyNote) { setPolicyNote(data.policyNote); setShowPolicy(true); }
        if (data.tables?.length) setTables(data.tables);
      }
      if (data.tables?.length && enhanceMode) setTables(prev => [...prev, ...data.tables!]);
      setEnhanceMode(false); setEnhanceSourceName(null);
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

  // ── Ctrl+V 전역 클립보드 붙여넣기 (canvas 모드, canEdit) ──────────────
  const wireframesRef2 = useRef(wireframes);
  useEffect(() => { wireframesRef2.current = wireframes; }, [wireframes]);

  useEffect(() => {
    if (mode !== "canvas" || !canEdit) return;
    function onPaste(e: ClipboardEvent) {
      const tgt = e.target as HTMLElement;
      // 텍스트 편집 중인 경우 무시
      if (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable) return;
      const file = Array.from(e.clipboardData?.items ?? [])
        .find(item => item.type.startsWith("image/"))
        ?.getAsFile();
      if (!file) return;
      e.preventDefault();
      const current = wireframesRef2.current;
      if (current.length === 0) {
        // 빈 캔버스 → 새 와이어프레임 생성
        handleUpload(crypto.randomUUID(), file);
      } else {
        // 기존 첫 번째 메인 와이어프레임에 덮어쓰기
        const firstMain = current.find(w => !w.isModal);
        if (firstMain) handleUpload(firstMain.id, file);
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [mode, canEdit]);

  return (
    <div className="flex flex-col gap-2">
      {/* ── 통합 헤더 행: [탭바] | [v배지] [제목] [📁시안|✨AI] [저장] [삭제] ── */}
      <div className="flex items-center gap-1.5 px-1 flex-nowrap overflow-x-auto">
        {/* 탭 바 슬롯 (첫 번째 섹션에만 주입) */}
        {tabBarSlot && (
          <>
            {tabBarSlot}
            <div className="mx-0.5 h-4 w-px shrink-0 bg-zinc-200" />
          </>
        )}

        {/* 버전 배지 */}
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${versionBadgeStyle}`}>
          {VERSION_LABEL}{isLocked ? " 🔒" : ""}
        </span>

        {/* 제목 입력 — flex-1로 여백 차지 */}
        <input value={title} readOnly={!canEdit || isLocked}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => { if (title !== policy.title) persist({ title }); }}
          placeholder="화면 제목을 입력하세요"
          className={`flex-1 min-w-0 rounded-lg px-2.5 py-1 text-sm font-bold text-ink outline-none placeholder:font-normal placeholder:text-zinc-400 transition-colors ${(canEdit && !isLocked) ? "hover:bg-white focus:bg-white focus:ring-2 focus:ring-brand/20" : ""}`} />

        {/* 모드 스위처 */}
        <div className="shrink-0 flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5">
          {([["canvas", "📁 시안"], ["ai", "✨ AI"]] as [PolicyMode, string][]).map(([m, label]) => (
            <button key={m} type="button"
              onClick={canEdit ? () => { setMode(m); persist({ mode: m }); } : undefined}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${mode === m ? "bg-white text-ink shadow-sm" : "text-zinc-500 hover:text-ink"} ${!canEdit ? "pointer-events-none" : ""}`}>
              {label}
            </button>
          ))}
        </div>

        {/* 저장 / 발행 버튼 */}
        {canEdit && !isLocked && (
          <button type="button" onClick={() => setShowSaveModal(true)}
            disabled={publishing}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold transition-colors disabled:opacity-40 ${isDirty || !policy.id ? "bg-brand text-white hover:bg-brand/90" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}>
            {publishing ? "처리 중..." : (isDirty || !policy.id) ? "💾 저장" : "✓ 저장됨"}
          </button>
        )}

        {/* 삭제 버튼 */}
        {onDelete && !isLocked && (
          <button type="button" onClick={() => setShowDeleteConfirm(true)} className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500">🗑</button>
        )}
      </div>

      {/* ── 카드 본문: 무한 캔버스 + 리사이즈 패널 ── */}
      <div className="overflow-hidden rounded-3xl bg-surface">

        {/* ── AI 모드 프롬프트 입력 ── */}
        {mode === "ai" && canEdit && (
          <div className="flex flex-col gap-3 border-b border-zinc-100 p-4">
            {/* 고도화 모드 배지 */}
            {enhanceMode && enhanceSourceName && (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700">
                  ✨ 고도화 모드: {enhanceSourceName}
                </span>
                <button type="button" onClick={() => { setEnhanceMode(false); setEnhanceSourceName(null); setAiRefImage(null); setAiRefPreview(null); setAiPrompt(""); }}
                  className="text-xs text-zinc-400 hover:text-zinc-600">초기화</button>
              </div>
            )}
            {/* 현행 이미지 첨부 */}
            <div className="flex items-start gap-2">
              {!enhanceMode && (
                <button type="button" onClick={() => aiFileRef.current?.click()}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-500 hover:border-brand/40 hover:text-brand">
                  📎 현행 화면 첨부
                </button>
              )}
              {aiRefPreview && (
                <div className="relative flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={aiRefPreview} alt="참조 이미지" className="h-12 w-auto rounded-lg border border-zinc-200 object-contain" />
                  {!enhanceMode && (
                    <button type="button" onClick={() => { setAiRefImage(null); setAiRefPreview(null); }}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">✕</button>
                  )}
                </div>
              )}
              <input ref={aiFileRef} type="file" accept="image/*" className="hidden" onChange={handleAiRefImageSelect} />
            </div>
            {/* 프롬프트 입력 */}
            <div className="flex gap-2">
              <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) handleAIGenerate(); }}
                placeholder={
                  enhanceMode
                    ? `"담기 버튼을 누르면 주문내역 팝업이 뜨게 수정해줘" — 변경사항만 설명하세요 (Enter)`
                    : aiRefImage ? "첨부된 현행 화면 기반으로 기획 내용을 설명하세요 (Enter 생성)"
                    : "화면 기획 내용을 설명하세요. 현행 화면 이미지를 첨부하면 더 정확합니다 (Enter 생성)"
                }
                className={`flex-1 rounded-xl border bg-white px-4 py-2.5 text-sm text-ink outline-none focus:ring-2 ${enhanceMode ? "border-purple-300 focus:border-purple-400 focus:ring-purple-100" : "border-zinc-200 focus:border-brand/40 focus:ring-brand/20"}`} />
              <button type="button" onClick={handleAIGenerate} disabled={aiGenerating}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${enhanceMode ? "bg-purple-600 hover:bg-purple-700" : "bg-brand hover:bg-brand/90"}`}>
                {aiGenerating ? "✨ 처리 중..." : enhanceMode ? "✨ 고도화" : "✨ 생성"}
              </button>
            </div>
            {aiError && <p className="text-xs text-red-500">{aiError}</p>}
          </div>
        )}

        {/* ── 피그마 다시 불러오기 바 — 이미 시안이 있을 때만 표시 ── */}
        {mode === "canvas" && canEdit && wireframes.length > 0 && (
          <div className="border-b border-zinc-100 px-4 py-2.5">
            {figmaImporting ? (
              <ProgressBar progress={figmaProgress} label={figmaProgress < 20 ? "피그마 노드 수신 중..." : figmaProgress < 50 ? "노드 파싱 중..." : figmaProgress < 80 ? "이미지 URL 추출 중..." : figmaProgress < 100 ? "이미지 업로드 중..." : "완료!"} />
            ) : showFigmaInput ? (
              <div className="flex gap-2">
                <FigmaLogo />
                <input type="url" value={figmaUrl} autoFocus
                  onChange={e => setFigmaUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleFigmaImport(); if (e.key === "Escape") { setShowFigmaInput(false); setFigmaUrl(""); } }}
                  placeholder="https://www.figma.com/design/..."
                  className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20" />
                <button type="button" onClick={handleFigmaImport} disabled={uploading}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand/90 disabled:opacity-50">
                  가져오기
                </button>
                <button type="button" onClick={() => { setShowFigmaInput(false); setFigmaUrl(""); }}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-100">취소</button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowFigmaInput(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-brand">
                <FigmaLogo />피그마 다시 불러오기
              </button>
            )}
          </div>
        )}

        {/* ── 본문 레이아웃: [무한 캔버스] | [드래그 핸들] | [우측 패널] ── */}
        <div className="relative flex" style={{ height: 'calc(100vh - 140px)', minHeight: 680 }}>

          {/* 무한 캔버스 영역 */}
          <InfiniteCanvas key={mode} className="flex-1 min-w-0" initialScale={mode === "ai" ? 1 : 0.5}
            toolMode={canvasToolMode} onToolChange={setCanvasToolMode}>
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

            {/* canvas 모드 — 시안이 있을 때만 WireframeCanvas 렌더링 */}
            {mode === "canvas" && wireframes.length > 0 && (
              <WireframeCanvas
                wireframes={wireframes} flowSteps={flowSteps}
                onWireframesChange={handleWfsChange} onFlowStepsChange={handleFlowChange}
                onUpload={handleUpload}
                activePinNumber={activePinNumber}
                hoveredPinNumber={hoveredPinNumber}
                onBadgeHover={setHoveredPinNumber}
                onBadgeClick={handleBadgeClick}
                onBadgeCreate={canEdit ? (pin) => {
                  setDescGroups(prev => {
                    if (prev.some(g => g.pinNumber === pin)) return prev;
                    const next = [...prev, { id: crypto.randomUUID(), pinNumber: pin, title: "", subItems: [] }];
                    return next.sort((a, b) => (parseInt(a.pinNumber, 10) || 0) - (parseInt(b.pinNumber, 10) || 0));
                  });
                } : undefined}
                onAIEnhance={canEdit ? handleAIEnhance : undefined}
                toolMode={canvasToolMode}
                canEdit={canEdit}
                onPinRename={canEdit ? (oldPin, newPin) => {
                  if (oldPin === newPin) return;
                  setDescGroups(prev => {
                    const exists = prev.find(g => g.pinNumber === oldPin);
                    if (!exists) return prev;
                    if (prev.some(g => g.pinNumber === newPin)) return prev;
                    return prev
                      .map(g => g.pinNumber === oldPin ? { ...g, pinNumber: newPin } : g)
                      .sort((a, b) => {
                        const aParts = a.pinNumber.split("-").map(Number);
                        const bParts = b.pinNumber.split("-").map(Number);
                        const am = aParts[0] ?? 0, as2 = aParts[1] ?? 0;
                        const bm = bParts[0] ?? 0, bs2 = bParts[1] ?? 0;
                        return am !== bm ? am - bm : as2 - bs2;
                      });
                  });
                } : undefined}
              />
            )}
          </InfiniteCanvas>

          {/* ── 빈 캔버스 통합 폼 오버레이 (시안 없을 때) ── */}
          {mode === "canvas" && wireframes.length === 0 && (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              style={{ right: rightWidth + 6 }}
            >
              <div className="pointer-events-auto flex w-80 flex-col gap-5 rounded-3xl bg-white p-8 shadow-xl">
                <div className="text-center">
                  <p className="text-sm font-semibold text-zinc-600">시안을 불러와 기획을 시작하세요</p>
                  <p className="mt-1 text-xs text-zinc-400">피그마에서 직접 가져오거나 이미지를 업로드하세요</p>
                </div>

                {/* 피그마 섹션 */}
                {figmaImporting ? (
                  <ProgressBar progress={figmaProgress} label={figmaProgress < 20 ? "피그마 노드 수신 중..." : figmaProgress < 50 ? "노드 파싱 중..." : figmaProgress < 80 ? "이미지 URL 추출 중..." : figmaProgress < 100 ? "이미지 업로드 중..." : "완료!"} />
                ) : showFigmaInput ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <FigmaLogo />
                      <input type="url" autoFocus value={figmaUrl}
                        onChange={e => setFigmaUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleFigmaImport(); if (e.key === "Escape") { setShowFigmaInput(false); setFigmaUrl(""); } }}
                        placeholder="https://www.figma.com/design/..."
                        className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20" />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleFigmaImport}
                        className="flex-1 rounded-xl bg-brand py-2 text-xs font-bold text-white hover:bg-brand/90">가져오기</button>
                      <button type="button" onClick={() => { setShowFigmaInput(false); setFigmaUrl(""); }}
                        className="rounded-xl px-4 py-2 text-xs font-bold text-zinc-400 hover:bg-zinc-100">취소</button>
                    </div>
                  </div>
                ) : canEdit ? (
                  <button type="button" onClick={() => setShowFigmaInput(true)}
                    className="flex items-center justify-center gap-2 rounded-2xl border-2 border-zinc-200 py-3 text-xs font-bold text-zinc-500 transition-colors hover:border-brand/40 hover:text-brand">
                    <FigmaLogo /> 피그마 URL로 가져오기
                  </button>
                ) : null}

                {canEdit && !figmaImporting && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-zinc-100" />
                      <span className="text-xs text-zinc-400">또는</span>
                      <div className="h-px flex-1 bg-zinc-100" />
                    </div>
                    <button type="button" onClick={() => emptyUploadRef.current?.click()}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-zinc-50 py-3 text-xs font-bold text-zinc-500 transition-colors hover:bg-brand/5 hover:text-brand">
                      시안 이미지 업로드
                    </button>
                  </>
                )}
              </div>
              <input
                ref={emptyUploadRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  handleUpload(crypto.randomUUID(), f);
                }}
              />
            </div>
          )}

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
              descGroups={descGroups} policyNote={policyNote} uiNote={uiNote} considerNote={considerNote}
              tables={tables} showPolicy={showPolicy} showUi={showUi} showConsider={showConsider}
              activePinNumber={activePinNumber} hoveredPinNumber={hoveredPinNumber}
              onDescGroupsChange={groups => { setDescGroups(groups); persist({ description_groups: groups }); }}
              onPolicyChange={setPolicyNote} onUiChange={setUiNote} onConsiderChange={setConsiderNote}
              onTablesChange={setTables}
              onShowPolicy={setShowPolicy} onShowUi={setShowUi} onShowConsider={setShowConsider}
              onBadgeHover={setHoveredPinNumber} onBadgeClick={handleBadgeClick}
              onBlur={() => persist({ description_groups: descGroups, policy_note: policyNote, ui_note: uiNote, consideration_note: considerNote, tables })}
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

      {/* ── 히스토리 (잠금 발행본 로그) ── */}
      {!!policy.id && (
        <div className="rounded-2xl border border-zinc-100 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => { setShowHistory(v => !v); if (!showHistory) loadHistory(); }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-bold text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 transition-colors"
          >
            <span>📋 히스토리</span>
            {historyLoaded && history.length > 0 && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{history.length}</span>
            )}
            <span className="ml-auto text-[10px]">{showHistory ? "▲" : "▼"}</span>
          </button>

          {showHistory && (
            <div className="border-t border-zinc-100">
              {!historyLoaded && (
                <p className="px-4 py-3 text-xs text-zinc-400">불러오는 중...</p>
              )}
              {historyLoaded && history.length === 0 && (
                <p className="px-4 py-3 text-xs text-zinc-400">아직 발행된 버전이 없습니다.</p>
              )}
              {history.map(h => {
                const hMaj = h.version_major;
                const hMin = h.version_minor;
                const isMajor = h.publish_type === "major";
                const hBadge = hMaj >= 1
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700";
                return (
                  <div key={h.id} className="flex items-start gap-3 border-b border-zinc-50 px-4 py-3 last:border-b-0 hover:bg-zinc-50 transition-colors">
                    <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${hBadge}`}>
                      v{hMaj}.{hMin}
                    </span>
                    <span className="mt-0.5 shrink-0 text-xs text-zinc-400">{isMajor ? "🔒 메이저" : "🚀 마이너"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-600">{h.title || "(제목 없음)"}</p>
                      {h.change_log && <p className="truncate text-xs text-zinc-400 mt-0.5">{h.change_log}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-zinc-400">
                      {[h.author_name, h.published_at ? fmtDate(h.published_at) : null].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* ── 저장/발행 모달 ── */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4"
          onClick={() => setShowSaveModal(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h3 className="mb-1 text-lg font-bold text-ink">기획서 저장 / 발행</h3>
            <p className="mb-5 text-sm text-zinc-400">저장 방식을 선택해주세요</p>

            {/* 옵션 라디오 그룹 */}
            <div className="mb-5 flex flex-col gap-2">
              {(
                [
                  { value: "draft",  label: "임시 저장 (초안)",          desc: "버전 변화 없이 현재 초안 상태 그대로 내용을 덮어씁니다.", badge: null,                          badgeStyle: "" },
                  { value: "minor",  label: "마이너 버전 발행",          desc: "기획안 수정/보완 시 발행하며, 뒤 자리가 1 증가합니다.",   badge: `v${vMaj}.${vMin} → v${vMaj}.${vMin + 1}`, badgeStyle: "bg-amber-100 text-amber-700" },
                  { value: "major",  label: "정식 버전 배포 (메이저)",    desc: "최종 기획 확정 시 전사에 배포하며, 앞 자리가 1 증가합니다.", badge: `v${vMaj}.${vMin} → v${vMaj + 1}.0`, badgeStyle: "bg-emerald-100 text-emerald-700" },
                ] as { value: "draft" | "minor" | "major"; label: string; desc: string; badge: string | null; badgeStyle: string }[]
              ).map(opt => {
                const disabled = opt.value !== "draft" && !policy.id;
                return (
                  <label key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-colors
                      ${disabled ? "cursor-not-allowed opacity-40" : ""}
                      ${saveType === opt.value && !disabled ? "border-brand bg-brand/5" : "border-zinc-100 hover:border-zinc-200"}`}>
                    <input type="radio" name="saveType" value={opt.value}
                      checked={saveType === opt.value}
                      disabled={disabled}
                      onChange={() => setSaveType(opt.value)}
                      className="mt-0.5 accent-brand" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-ink">{opt.label}</span>
                        {opt.badge && (
                          <span className={`rounded-full px-2 py-0.5 font-mono text-xs font-bold ${opt.badgeStyle}`}>{opt.badge}</span>
                        )}
                        {disabled && <span className="text-xs text-zinc-400">먼저 임시 저장 필요</span>}
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-400">{opt.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* 변경 사항 메모 (발행 옵션 선택 시) */}
            {saveType !== "draft" && (
              <div className="mb-5">
                <label className="mb-1.5 block text-xs font-bold text-zinc-500">변경 사항 메모 <span className="font-normal text-zinc-400">(선택)</span></label>
                <textarea
                  value={changeLogText}
                  onChange={e => setChangeLogText(e.target.value)}
                  placeholder="이번 버전의 변경 사항을 적어주세요 (예: 키패드 오류 수정)"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/20"
                />
              </div>
            )}

            {/* 액션 버튼 */}
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowSaveModal(false)}
                className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-bold text-zinc-500 transition-colors hover:bg-zinc-50">
                취소
              </button>
              <button type="button" onClick={handleSaveAction} disabled={publishing}
                className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand/90 disabled:opacity-40">
                {publishing ? "처리 중..." : "최종 확인"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 삭제 확인 모달 ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={() => setShowDeleteConfirm(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-xl">⚠️</div>
              <h3 className="text-base font-bold text-zinc-900">기획서 화면 전체 삭제</h3>
            </div>
            <p className="mb-1 text-sm font-semibold text-zinc-700">정말 이 기획서 화면을 전체 삭제하시겠습니까?</p>
            <p className="mb-6 text-xs text-zinc-400 leading-relaxed">
              삭제된 데이터와 정책 DB는 복구할 수 없습니다.<br />
              계속하시려면 아래 확인 버튼을 눌러주세요.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-bold text-zinc-500 hover:bg-zinc-50 transition-colors">
                취소
              </button>
              <button type="button" onClick={() => { setShowDeleteConfirm(false); onDelete?.(); }}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 transition-colors">
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 토스트 알림 ── */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-bold text-white shadow-xl">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// DescriptionPanel — 계층형 (부모 그룹 + 들여쓰기 하위 항목)
// ──────────────────────────────────────────────────────────────────────────────

const BADGE_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];
const bc = (pin: string) => {
  const n = parseInt(pin.split("-")[0], 10) || 1;
  return BADGE_COLORS[(n - 1) % BADGE_COLORS.length];
};

function DescriptionPanel({
  descGroups, policyNote, uiNote, considerNote, tables,
  showPolicy, showUi, showConsider,
  activePinNumber, hoveredPinNumber,
  onDescGroupsChange, onPolicyChange, onUiChange, onConsiderChange, onTablesChange,
  onShowPolicy, onShowUi, onShowConsider,
  onBadgeHover, onBadgeClick,
  onBlur, onTablesBlur, canEdit,
}: {
  descGroups: DescGroup[]; policyNote: string; uiNote: string; considerNote: string;
  tables: TableData[]; showPolicy: boolean; showUi: boolean; showConsider: boolean;
  activePinNumber: string | null; hoveredPinNumber: string | null;
  onDescGroupsChange: (v: DescGroup[]) => void;
  onPolicyChange: (v: string) => void; onUiChange: (v: string) => void; onConsiderChange: (v: string) => void;
  onTablesChange: (v: TableData[]) => void;
  onShowPolicy: (v: boolean) => void; onShowUi: (v: boolean) => void; onShowConsider: (v: boolean) => void;
  onBadgeHover: (pin: string | null) => void; onBadgeClick: (pin: string) => void;
  onBlur: () => void; onTablesBlur: () => void;
  canEdit: boolean;
}) {
  // 그룹 CRUD 헬퍼
  function updateGroup(gid: string, patch: Partial<DescGroup>) {
    onDescGroupsChange(descGroups.map(g => g.id === gid ? { ...g, ...patch } : g));
  }
  function deleteGroup(gid: string) { onDescGroupsChange(descGroups.filter(g => g.id !== gid)); }
  function addGroup() {
    const maxPin = descGroups.reduce((m, g) => Math.max(m, parseInt(g.pinNumber, 10) || 0), 0);
    onDescGroupsChange([...descGroups, { id: crypto.randomUUID(), pinNumber: String(maxPin + 1), title: "", subItems: [] }]);
  }
  function addSubItem(gid: string) {
    onDescGroupsChange(descGroups.map(g => {
      if (g.id !== gid) return g;
      const nextSub = g.subItems.length + 1;
      return { ...g, subItems: [...g.subItems, { pinNumber: `${g.pinNumber}-${nextSub}`, text: "" }] };
    }));
  }
  function updateSubItem(gid: string, pin: string, text: string) {
    onDescGroupsChange(descGroups.map(g =>
      g.id !== gid ? g : { ...g, subItems: g.subItems.map(s => s.pinNumber === pin ? { ...s, text } : s) }
    ));
  }
  function deleteSubItem(gid: string, pin: string) {
    onDescGroupsChange(descGroups.map(g =>
      g.id !== gid ? g : { ...g, subItems: g.subItems.filter(s => s.pinNumber !== pin) }
    ));
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* 디스크립션 — 계층형 */}
      <div className="flex flex-col gap-2 rounded-2xl bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-400">디스크립션</span>
          {canEdit && (
            <button type="button" onClick={addGroup}
              className="px-2 py-0.5 text-[10px] font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 hover:text-gray-700 transition-colors">+ 그룹 추가</button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {descGroups.map(group => {
            const color = bc(group.pinNumber);
            const isGroupActive = activePinNumber === group.pinNumber;
            const isGroupHovered = hoveredPinNumber === group.pinNumber;
            return (
              <div key={group.id} className="flex flex-col gap-1.5">
                {/* 부모 그룹 헤더 */}
                <div
                  data-pin-group={group.pinNumber}
                  onMouseEnter={() => onBadgeHover(group.pinNumber)}
                  onMouseLeave={() => onBadgeHover(null)}
                  onClick={() => onBadgeClick(group.pinNumber)}
                  style={
                    isGroupActive
                      ? { boxShadow: `0 0 0 2px ${color}`, backgroundColor: color + "15", outline: `1.5px solid ${color}60`, outlineOffset: "1px" }
                      : isGroupHovered
                      ? { boxShadow: `0 0 0 1.5px ${color}60`, backgroundColor: color + "0c" }
                      : undefined
                  }
                  className="flex cursor-pointer items-start gap-2 rounded-xl p-1.5 transition-all"
                >
                  <span
                    style={{
                      backgroundColor: color,
                      transform: isGroupActive ? "scale(1.2)" : isGroupHovered ? "scale(1.1)" : "scale(1)",
                    }}
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white transition-transform duration-150">
                    {group.pinNumber}
                  </span>
                  <AutoResizeTextarea
                    value={group.title} readOnly={!canEdit}
                    onChange={e => updateGroup(group.id, { title: e.target.value })}
                    onBlur={onBlur}
                    placeholder="정책 제목을 입력하세요."
                    className="flex-1 rounded-lg bg-zinc-50 px-3 py-1.5 text-sm font-medium leading-relaxed text-ink outline-none focus:ring-2 focus:ring-brand/20"
                  />
                  {canEdit && (
                    <button type="button" onClick={e => { e.stopPropagation(); deleteGroup(group.id); onBlur(); }}
                      className="self-start rounded-full px-2 py-1 text-xs font-bold text-zinc-300 hover:bg-red-50 hover:text-red-400">✕</button>
                  )}
                </div>

                {/* 하위 항목 (들여쓰기) */}
                {group.subItems.length > 0 && (
                  <div className="ml-8 flex flex-col gap-1 border-l-2 pl-3" style={{ borderColor: color + "40" }}>
                    {group.subItems.map(sub => {
                      const isSubActive = activePinNumber === sub.pinNumber;
                      const isSubHovered = hoveredPinNumber === sub.pinNumber;
                      return (
                        <div
                          key={sub.pinNumber}
                          data-pin-sub={sub.pinNumber}
                          onMouseEnter={() => onBadgeHover(sub.pinNumber)}
                          onMouseLeave={() => onBadgeHover(null)}
                          onClick={() => onBadgeClick(sub.pinNumber)}
                          style={
                            isSubActive
                              ? { boxShadow: `0 0 0 2px ${color}70`, backgroundColor: color + "15" }
                              : isSubHovered
                              ? { boxShadow: `0 0 0 2px ${color}30`, backgroundColor: color + "08" }
                              : undefined
                          }
                          className="flex cursor-pointer items-start gap-2 rounded-lg p-1 transition-all"
                        >
                          <span
                            style={{
                              backgroundColor: color,
                              fontSize: 9,
                              transform: isSubActive ? "scale(1.15)" : isSubHovered ? "scale(1.07)" : "scale(1)",
                            }}
                            className="mt-0.5 flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded px-1 font-bold text-white transition-transform duration-150">
                            {sub.pinNumber}
                          </span>
                          <AutoResizeTextarea
                            value={sub.text} readOnly={!canEdit}
                            onChange={e => updateSubItem(group.id, sub.pinNumber, e.target.value)}
                            onBlur={onBlur}
                            placeholder="하위 정책을 입력하세요."
                            className="flex-1 rounded-lg bg-zinc-50 px-2 py-1 text-xs leading-relaxed text-ink outline-none focus:ring-2 focus:ring-brand/20"
                          />
                          {canEdit && (
                            <button type="button" onClick={e => { e.stopPropagation(); deleteSubItem(group.id, sub.pinNumber); onBlur(); }}
                              className="self-start rounded-full px-1.5 py-0.5 text-[10px] font-bold text-zinc-300 hover:bg-red-50 hover:text-red-400">✕</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 하위 항목 추가 버튼 */}
                {canEdit && (
                  <button type="button" onClick={() => addSubItem(group.id)}
                    className="ml-8 self-start rounded-full bg-zinc-50 px-2.5 py-0.5 text-[11px] font-bold text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
                    + {group.pinNumber}-{group.subItems.length + 1}
                  </button>
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

      {/* 정책 */}
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

      {/* UI 참고사항 */}
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

      {/* 고려사항 */}
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
