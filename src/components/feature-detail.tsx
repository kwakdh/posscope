"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { WireframeCanvas } from "@/components/wireframe-canvas";
import { TableEditor } from "@/components/table-editor";
import type {
  Policy, PolicyMode, WireframeItem, FlowStep, TableData, AIScreen, BadgeMark,
} from "@/types/policy";
import { normalizePolicy } from "@/types/policy";

type ItemType = "category" | "feature";

// ── 공통 유틸 ─────────────────────────────────────────────────────────────────

function formatDate(v: string | null) {
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

// ── FeatureTab 타입 ────────────────────────────────────────────────────────────

type FeatureTab = {
  id: string; item_type: string; item_id: string;
  name: string; figma_url: string | null; sort_order: number;
};

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
  const allTabs = [
    ...FIXED_TABS,
    ...customTabs.map(t => ({ ...t, isFixed: false as const })),
  ];
  const activeTabMeta = allTabs.find(t => t.id === activeTabKind) ?? FIXED_TABS[0];
  const activePolicies = policies.filter(p => p.kind === activeTabKind);
  const displayPolicies =
    activeTabKind === "current" && activePolicies.length === 0
      ? [emptyPolicy(itemType, itemId, "current")]
      : activePolicies;

  // ── 탭 핸들러 ────────────────────────────────────────
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

  // ── 탭 전체 일괄 불러오기 (피그마 → 섹션 배열) ────────
  async function handleBulkImport(tab: { id: string; figma_url: string | null }) {
    if (!tab.figma_url) return;
    setBulkImporting(true); setBulkProgress(0); setBulkError(null);
    try {
      const res = await fetch("/api/figma-parse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: tab.figma_url }),
      });
      if (!res.ok) { setBulkError((await res.json().catch(() => ({}))).error ?? "피그마를 가져오지 못했습니다."); setBulkImporting(false); return; }
      const parsed = await res.json();
      const { sections, descriptions, policyNote, uiNote, considerationNote } = parsed as {
        sections: { name: string; imageBase64: string; imageMimeType: string; badges: BadgeMark[]; isModal: boolean }[];
        descriptions: string[]; policyNote: string; uiNote: string; considerationNote: string;
      };
      if (!sections?.length) { setBulkError("가져올 와이어프레임이 없습니다."); setBulkImporting(false); return; }

      const sb = createClient();
      const created: Policy[] = [];

      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        setBulkProgress(Math.round((i / sections.length) * 60));
        const { data: row, error: err } = await sb.from("policies").insert({
          item_type: itemType, item_id: itemId, kind: tab.id,
          title: sec.name, mode: "image",
          description_items: i === 0 ? descriptions : [],
          policy_note: i === 0 ? policyNote : "",
          ui_note: i === 0 ? uiNote : "",
          consideration_note: i === 0 ? considerationNote : "",
          wireframes: [], flow_steps: [], tables: [], ai_screens: [],
          author_name: currentUserName, updated_at: new Date().toISOString(),
        }).select("*").single();
        if (err || !row) continue;
        let saved = normalizePolicy(row);

        if (sec.imageBase64) {
          try {
            const bytes = Uint8Array.from(atob(sec.imageBase64), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: sec.imageMimeType });
            const ext = sec.imageMimeType.split("/")[1] ?? "png";
            const wfId = crypto.randomUUID();
            const path = `${itemType}/${itemId}/${saved.id}-${wfId}.${ext}`;
            const { error: upErr } = await sb.storage.from("wireframes").upload(path, new File([blob], `figma.${ext}`, { type: sec.imageMimeType }), { upsert: true });
            if (!upErr) {
              const { data: urlData } = sb.storage.from("wireframes").getPublicUrl(path);
              const wfItem: WireframeItem = {
                id: wfId, url: `${urlData.publicUrl}?v=${Date.now()}`, name: sec.name,
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
        setBulkProgress(Math.round(((i + 1) / sections.length) * 100));
      }
      setPolicies(prev => [...prev, ...created]);
    } catch (e) {
      console.error(e); setBulkError("불러오기 중 오류가 발생했습니다.");
    } finally { setBulkImporting(false); setBulkProgress(0); }
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
                placeholder="탭 이름" className="w-24 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:ring-2 focus:ring-brand/20" />
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
        <FigmaUrlBar
          tabId={activeTabKind}
          figmaUrl={activeTabMeta.figma_url}
          editing={editingTabFigmaId === activeTabKind}
          inputValue={tabFigmaInput}
          onInputChange={setTabFigmaInput}
          onEdit={() => { setTabFigmaInput(activeTabMeta.figma_url ?? ""); setEditingTabFigmaId(activeTabKind); }}
          onSave={() => handleSaveTabFigmaUrl(activeTabKind)}
          onCancel={() => setEditingTabFigmaId(null)}
          bulkImporting={bulkImporting}
          bulkProgress={bulkProgress}
          onBulkImport={() => handleBulkImport(activeTabMeta)}
        />
      )}
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
// FigmaUrlBar
// ──────────────────────────────────────────────────────────────────────────────

function FigmaUrlBar({ tabId, figmaUrl, editing, inputValue, onInputChange, onEdit, onSave, onCancel, bulkImporting, bulkProgress, onBulkImport }: {
  tabId: string; figmaUrl: string | null; editing: boolean;
  inputValue: string; onInputChange: (v: string) => void;
  onEdit: () => void; onSave: () => void; onCancel: () => void;
  bulkImporting: boolean; bulkProgress: number; onBulkImport: () => void;
}) {
  const FigmaLogo = () => (
    <svg width="14" height="14" viewBox="0 0 38 57" fill="none" className="shrink-0">
      <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0Z" fill="#1ABCFE" />
      <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 0 1-19 0Z" fill="#0ACF83" />
      <path d="M19 0v19h9.5a9.5 9.5 0 0 0 0-19H19Z" fill="#FF7262" />
      <path d="M0 9.5a9.5 9.5 0 0 0 9.5 9.5H19V0H9.5A9.5 9.5 0 0 0 0 9.5Z" fill="#F24E1E" />
      <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5Z" fill="#A259FF" />
    </svg>
  );

  return (
    <div className="flex items-center gap-2 rounded-2xl bg-zinc-50 px-4 py-3 text-sm">
      {editing ? (
        <>
          <FigmaLogo />
          <input autoFocus type="url" value={inputValue} onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
            placeholder="https://www.figma.com/design/..."
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20" />
          <button type="button" onClick={onSave} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand/90">저장</button>
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-100">취소</button>
        </>
      ) : figmaUrl ? (
        <>
          <FigmaLogo />
          <span className="flex-1 truncate text-xs text-zinc-400">{figmaUrl}</span>
          <button type="button" onClick={onEdit} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-100">편집</button>
          <button type="button" disabled={bulkImporting} onClick={onBulkImport}
            className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand/90 disabled:opacity-50">
            {bulkImporting ? `불러오는 중... ${bulkProgress}%` : "전체 불러오기"}
          </button>
        </>
      ) : (
        <button type="button" onClick={onEdit}
          className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-brand">
          <FigmaLogo />피그마 URL 연결하기
        </button>
      )}
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
  const [showFigmaInput, setShowFigmaInput] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [activeAiScreen, setActiveAiScreen] = useState(0);

  const VERSION_LABEL = policy.kind === "current" ? "v1.0" : "v0.1";
  const badgeStyle =
    policy.kind === "current" ? "bg-white text-zinc-500" :
    policy.kind === "proposal" ? "bg-brand/10 text-brand" :
    "bg-purple-100 text-purple-700";

  // ── persist ────────────────────────────────────────────
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

  // ── upload wireframe image ────────────────────────────
  async function handleUpload(wireframeId: string, file: File) {
    if (!file.type.startsWith("image/")) { setError("이미지 파일만 업로드할 수 있습니다."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("이미지 크기는 5MB 이하여야 합니다."); return; }
    setError(null); setUploading(true);
    const sb = createClient();

    let policyId = policy.id;
    if (!policyId) {
      const saved = await persist({ wireframes, flow_steps: flowSteps });
      if (!saved) { setUploading(false); return; }
      policyId = saved.id;
    }

    const ext = file.name.split(".").pop() ?? "png";
    const path = `${policy.item_type}/${policy.item_id}/${policyId}-${wireframeId}-${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from("wireframes").upload(path, file, { upsert: true });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    const { data: urlData } = sb.storage.from("wireframes").getPublicUrl(path);
    const url = `${urlData.publicUrl}?v=${Date.now()}`;

    const targetWf = wireframes.find(w => w.id === wireframeId);
    let nextWireframes: WireframeItem[];
    if (targetWf) {
      nextWireframes = wireframes.map(w => w.id === wireframeId ? { ...w, url } : w);
    } else {
      nextWireframes = [{ id: wireframeId, url, name: title || "화면", badges: [], isModal: false, modalFor: null, order: 0 }];
    }
    setWireframes(nextWireframes);
    await persist({ wireframes: nextWireframes, wireframe_url: nextWireframes[0]?.url ?? null });
    setUploading(false);
  }

  // ── Figma 단건 임포트 (이미지 + 텍스트 + 배지) ─────────
  async function handleFigmaImport() {
    if (!figmaUrl.trim()) return;
    setError(null); setUploading(true); setShowFigmaInput(false);
    try {
      const res = await fetch("/api/figma-parse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: figmaUrl.trim() }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "피그마를 가져오지 못했습니다."); setUploading(false); return; }
      const parsed = await res.json();
      const {
        imageBase64, imageMimeType, descriptions, policyNote: newPN, uiNote: newUN,
        considerationNote: newCN, wireframeName, sections: parsedSections,
      } = parsed;

      const newDescs = Array.isArray(descriptions) && descriptions.length ? descriptions : [""];
      const newBadges: BadgeMark[] = parsedSections?.[0]?.badges ?? [];
      setDescItems(newDescs);
      if (newBadges.length) {
        const firstWfId = wireframes[0]?.id ?? crypto.randomUUID();
        setWireframes(prev => prev.length
          ? prev.map((w, i) => i === 0 ? { ...w, badges: newBadges } : w)
          : [{ id: firstWfId, url: null, name: wireframeName || "화면", badges: newBadges, isModal: false, modalFor: null, order: 0 }]
        );
      }
      if (newPN) { setPolicyNote(newPN); setShowPolicy(true); }
      if (newUN) { setUiNote(newUN); setShowUi(true); }
      if (newCN) { setConsiderNote(newCN); setShowConsider(true); }
      if (wireframeName && !title) setTitle(wireframeName);

      const saved = await persist({
        description_items: newDescs,
        ...(wireframeName && !title ? { title: wireframeName } : {}),
        ...(newPN ? { policy_note: newPN } : {}),
        ...(newUN ? { ui_note: newUN } : {}),
        ...(newCN ? { consideration_note: newCN } : {}),
      });
      setFigmaUrl("");

      if (imageBase64) {
        const bytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: imageMimeType ?? "image/png" });
        const ext = (imageMimeType ?? "image/png").split("/")[1] ?? "png";
        const file = new File([blob], `figma.${ext}`, { type: imageMimeType ?? "image/png" });
        const wfId = wireframes[0]?.id ?? crypto.randomUUID();
        await handleUpload(wfId, file);
      } else { setUploading(false); }
    } catch (e) { console.error(e); setError("피그마 가져오기 중 오류가 발생했습니다."); setUploading(false); }
  }

  // ── AI 생성 ────────────────────────────────────────────
  async function handleAIGenerate() {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true); setAiError(null);
    try {
      const res = await fetch("/api/ai-generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          context: { title, descriptions: descItems, policyNote, uiNote, considerNote },
        }),
      });
      if (!res.ok) { setAiError((await res.json().catch(() => ({}))).error ?? "생성 실패"); setAiGenerating(false); return; }
      const data = await res.json() as {
        screens: { id: string; name: string; html: string; order: number; flowTo: string[] }[];
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

  // ── wireframe/flow persist helpers ────────────────────
  function handleWfsChange(wfs: WireframeItem[]) {
    setWireframes(wfs);
    persist({ wireframes: wfs, wireframe_url: wfs.find(w => !w.isModal)?.url ?? null });
  }
  function handleFlowChange(steps: FlowStep[]) {
    setFlowSteps(steps);
    persist({ flow_steps: steps });
  }
  function handleTablesChange(tbls: TableData[]) { setTables(tbls); }
  function handleTablesBlur() { persist({ tables }); }

  return (
    <div className="flex flex-col gap-3">
      {/* ── 카드 헤더 ── */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badgeStyle}`}>{tabName}</span>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-zinc-500">{VERSION_LABEL}</span>
        <input value={title} readOnly={!canEdit}
          onChange={e => setTitle(e.target.value)} onBlur={() => { if (title !== policy.title) persist({ title }); }}
          placeholder="화면 제목을 입력하세요"
          className={`flex-1 rounded-xl px-3 py-2 text-lg font-bold text-ink outline-none placeholder:font-normal placeholder:text-zinc-400 transition-colors ${canEdit ? "hover:bg-white focus:bg-white focus:ring-2 focus:ring-brand/20" : ""}`} />
        {(policy.author_name || formatDate(policy.updated_at)) && (
          <span className="text-xs text-zinc-400">{[policy.author_name, formatDate(policy.updated_at)].filter(Boolean).join(" · ")}</span>
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

      {/* ── 카드 본문 ── */}
      <div className="flex flex-col gap-4 rounded-3xl bg-surface p-5">

        {/* ─── AI 모드 ─── */}
        {mode === "ai" && (
          <div className="flex flex-col gap-4">
            {canEdit && (
              <div className="flex gap-2">
                <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) handleAIGenerate(); }}
                  placeholder="화면 기획 내용을 설명하세요 (Enter로 생성)"
                  className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20" />
                <button type="button" onClick={handleAIGenerate} disabled={aiGenerating}
                  className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-50">
                  {aiGenerating ? "생성 중..." : "생성"}
                </button>
              </div>
            )}
            {aiError && <p className="text-xs text-red-500">{aiError}</p>}

            <div className="flex gap-5">
              {/* AI 화면 캔버스 */}
              <div className="flex w-[55%] shrink-0 flex-col gap-3">
                {aiScreens.length > 0 ? (
                  <>
                    {/* 화면 탭 */}
                    <div className="flex flex-wrap gap-1">
                      {aiScreens.map((s, i) => (
                        <button key={s.id} type="button" onClick={() => setActiveAiScreen(i)}
                          className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors ${activeAiScreen === i ? "bg-brand text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"}`}>
                          {s.name}
                        </button>
                      ))}
                    </div>
                    {/* iframe 렌더링 */}
                    {aiScreens[activeAiScreen] && (
                      <iframe
                        srcDoc={aiScreens[activeAiScreen].html}
                        sandbox="allow-scripts allow-same-origin"
                        className="h-[480px] w-full rounded-2xl border border-zinc-200 bg-white"
                        title={aiScreens[activeAiScreen].name}
                      />
                    )}
                    {/* 흐름 화살표 */}
                    {aiScreens[activeAiScreen]?.flowTo.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {aiScreens[activeAiScreen].flowTo.map(toId => {
                          const target = aiScreens.find(s => s.id === toId);
                          return target ? (
                            <button key={toId} type="button" onClick={() => setActiveAiScreen(aiScreens.findIndex(s => s.id === toId))}
                              className="rounded-full border border-brand/30 bg-brand/5 px-3 py-1 text-xs font-bold text-brand hover:bg-brand/10">
                              → {target.name}
                            </button>
                          ) : null;
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex aspect-[9/16] max-h-[400px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 text-sm text-zinc-400">
                    <span className="text-3xl">✨</span>
                    <span>위에 기획 내용을 입력하고 생성하세요</span>
                  </div>
                )}
              </div>

              {/* 우측 설명 */}
              <DescriptionPanel
                descItems={descItems} policyNote={policyNote} uiNote={uiNote} considerNote={considerNote}
                tables={tables} showPolicy={showPolicy} showUi={showUi} showConsider={showConsider}
                hoveredBadgeNum={hoveredBadgeNum}
                onDescChange={setDescItems} onPolicyChange={setPolicyNote} onUiChange={setUiNote} onConsiderChange={setConsiderNote}
                onTablesChange={handleTablesChange}
                onShowPolicy={setShowPolicy} onShowUi={setShowUi} onShowConsider={setShowConsider}
                onBadgeHover={setHoveredBadgeNum}
                onBlur={() => persist({ description_items: descItems, policy_note: policyNote, ui_note: uiNote, consideration_note: considerNote, tables })}
                onTablesBlur={handleTablesBlur}
                canEdit={canEdit}
              />
            </div>
          </div>
        )}

        {/* ─── 이미지 / 피그마 모드 (공통) ─── */}
        {(mode === "image" || mode === "figma") && (
          <div className="flex gap-5">
            {/* 왼쪽: N:1 와이어프레임 캔버스 */}
            <div className="flex w-[55%] shrink-0 flex-col gap-3">
              {/* 피그마 URL 입력 (이미지 없을 때 + figma 모드) */}
              {mode === "figma" && wireframes.filter(w => !w.isModal).length === 0 && (
                <div className="flex flex-col gap-2">
                  {showFigmaInput ? (
                    <div className="flex gap-2">
                      <input type="url" value={figmaUrl} autoFocus
                        onChange={e => setFigmaUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleFigmaImport(); if (e.key === "Escape") { setShowFigmaInput(false); setFigmaUrl(""); } }}
                        placeholder="https://www.figma.com/design/..."
                        className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20" />
                      <button type="button" onClick={handleFigmaImport} disabled={uploading}
                        className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-50">
                        {uploading ? "가져오는 중..." : "가져오기"}
                      </button>
                      <button type="button" onClick={() => { setShowFigmaInput(false); setFigmaUrl(""); }}
                        className="rounded-xl px-3 py-2 text-sm font-bold text-zinc-400 hover:bg-zinc-100">취소</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowFigmaInput(true)}
                      className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-zinc-200 py-4 text-sm font-bold text-zinc-400 hover:border-brand/40 hover:text-brand">
                      📐 피그마 URL로 가져오기
                    </button>
                  )}
                </div>
              )}

              {/* 피그마 재가져오기 (이미지 있을 때 + figma 모드) */}
              {mode === "figma" && wireframes.filter(w => !w.isModal).length > 0 && canEdit && (
                <div className="flex items-center gap-2">
                  {showFigmaInput ? (
                    <>
                      <input type="url" value={figmaUrl} autoFocus
                        onChange={e => setFigmaUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleFigmaImport(); if (e.key === "Escape") { setShowFigmaInput(false); setFigmaUrl(""); } }}
                        placeholder="피그마 URL"
                        className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand/20" />
                      <button type="button" onClick={handleFigmaImport} disabled={uploading}
                        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">재가져오기</button>
                      <button type="button" onClick={() => { setShowFigmaInput(false); setFigmaUrl(""); }}
                        className="text-xs text-zinc-400">취소</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setShowFigmaInput(true)}
                      className="text-xs font-bold text-zinc-400 hover:text-brand">📐 다시 불러오기</button>
                  )}
                </div>
              )}

              {/* 이미지 모드 - 비어있을 때 */}
              {mode === "image" && wireframes.filter(w => !w.isModal).length === 0 && (
                <div
                  onClick={canEdit ? () => { const id = crypto.randomUUID(); setWireframes([{ id, url: null, name: title || "화면", badges: [], isModal: false, modalFor: null, order: 0 }]); } : undefined}
                  className={`flex aspect-[9/16] max-h-[400px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 text-sm text-zinc-400 ${canEdit ? "cursor-pointer hover:border-brand/40 hover:bg-brand/5" : ""}`}
                >
                  <span className="text-3xl">🖼️</span>
                  <span>이미지가 없습니다.</span>
                  {canEdit && <span className="text-xs">클릭해서 와이어프레임 추가</span>}
                </div>
              )}

              {/* WireframeCanvas */}
              {wireframes.length > 0 && (
                <WireframeCanvas
                  wireframes={wireframes} flowSteps={flowSteps}
                  onWireframesChange={handleWfsChange} onFlowStepsChange={handleFlowChange}
                  onUpload={handleUpload}
                  hoveredBadgeNumber={hoveredBadgeNum} onBadgeHover={setHoveredBadgeNum}
                  canEdit={canEdit}
                />
              )}

              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>

            {/* 우측: 설명 패널 */}
            <DescriptionPanel
              descItems={descItems} policyNote={policyNote} uiNote={uiNote} considerNote={considerNote}
              tables={tables} showPolicy={showPolicy} showUi={showUi} showConsider={showConsider}
              hoveredBadgeNum={hoveredBadgeNum}
              onDescChange={setDescItems} onPolicyChange={setPolicyNote} onUiChange={setUiNote} onConsiderChange={setConsiderNote}
              onTablesChange={handleTablesChange}
              onShowPolicy={setShowPolicy} onShowUi={setShowUi} onShowConsider={setShowConsider}
              onBadgeHover={setHoveredBadgeNum}
              onBlur={() => persist({ description_items: descItems, policy_note: policyNote, ui_note: uiNote, consideration_note: considerNote, tables })}
              onTablesBlur={handleTablesBlur}
              canEdit={canEdit}
            />
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
    <div className="flex flex-1 flex-col gap-3">
      {/* 디스크립션 */}
      <div className="flex flex-col gap-2 rounded-2xl bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-zinc-400">디스크립션</span>
          {canEdit && (
            <button type="button" onClick={() => { onDescChange([...descItems, ""]); }}
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

      {/* 추가 섹션 토글 버튼 */}
      {canEdit && (!showPolicy || !showUi || !showConsider) && (
        <div className="flex gap-2">
          {!showPolicy && <button type="button" onClick={() => onShowPolicy(true)} className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-200 hover:text-ink">+ 정책</button>}
          {!showUi && <button type="button" onClick={() => onShowUi(true)} className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-200 hover:text-ink">+ UI 참고사항</button>}
          {!showConsider && <button type="button" onClick={() => onShowConsider(true)} className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-200 hover:text-ink">+ 고려사항</button>}
        </div>
      )}

      {showPolicy && (
        <div className="rounded-2xl bg-red-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-red-500">정책</span>
            {canEdit && <button type="button" onClick={() => onShowPolicy(false)} className="text-xs font-bold text-red-300 hover:text-red-500">✕</button>}
          </div>
          <AutoResizeTextarea value={policyNote} readOnly={!canEdit} onChange={e => onPolicyChange(e.target.value)} onBlur={onBlur}
            placeholder="정책을 입력하세요." className="w-full bg-transparent text-sm leading-relaxed text-red-600 outline-none placeholder:text-red-300" />
        </div>
      )}

      {showUi && (
        <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-amber-600">★ UI 참고사항</span>
            {canEdit && <button type="button" onClick={() => onShowUi(false)} className="text-xs font-bold text-amber-400 hover:text-amber-600">✕</button>}
          </div>
          <AutoResizeTextarea value={uiNote} readOnly={!canEdit} onChange={e => onUiChange(e.target.value)} onBlur={onBlur}
            placeholder="내용을 입력하세요." className="w-full bg-transparent text-sm leading-relaxed text-amber-800 outline-none placeholder:text-amber-300" />
        </div>
      )}

      {showConsider && (
        <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-emerald-600">★ 고려사항</span>
            {canEdit && <button type="button" onClick={() => onShowConsider(false)} className="text-xs font-bold text-emerald-400 hover:text-emerald-600">✕</button>}
          </div>
          <AutoResizeTextarea value={considerNote} readOnly={!canEdit} onChange={e => onConsiderChange(e.target.value)} onBlur={onBlur}
            placeholder="내용을 입력하세요." className="w-full bg-transparent text-sm leading-relaxed text-emerald-800 outline-none placeholder:text-emerald-300" />
        </div>
      )}
    </div>
  );
}
