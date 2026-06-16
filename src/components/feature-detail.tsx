"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ItemType = "category" | "feature";

type ImageBadgeMark = {
  id: string; number: number; x: number; y: number; w?: number; h?: number;
};

type Policy = {
  id: string;
  item_type: ItemType;
  item_id: string;
  kind: string;
  title: string;
  policy_note: string;
  ui_note: string;
  consideration_note: string;
  description_items: string[];
  wireframe_url: string | null;
  image_badges: ImageBadgeMark[];
  sort_order: number;
  author_name: string | null;
  updated_at: string | null;
};

type FeatureTab = {
  id: string;
  item_type: string;
  item_id: string;
  name: string;
  figma_url: string | null;
  sort_order: number;
};

type FeatureDetailProps = {
  itemType: ItemType;
  itemId: string;
  currentUserName: string;
  canEdit: boolean;
};

const MAX_SIZE = 5 * 1024 * 1024;
const BADGE_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];
function getBadgeColor(n: number) { return BADGE_COLORS[(n - 1) % BADGE_COLORS.length]; }

function emptyPolicy(itemType: ItemType, itemId: string, kind: string): Policy {
  return { id: "", item_type: itemType, item_id: itemId, kind, title: "", policy_note: "", ui_note: "", consideration_note: "", description_items: [], wireframe_url: null, image_badges: [], sort_order: 0, author_name: null, updated_at: null };
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

// Auto-expanding textarea — grows to fit content, no scrollbar
function AutoResizeTextarea({ value, onChange, onBlur, readOnly, placeholder, className }: {
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
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
  }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={onChange} onBlur={onBlur} readOnly={readOnly}
      placeholder={placeholder} rows={1}
      className={className}
      style={{ overflow: "hidden", resize: "none" }}
    />
  );
}

// ──────────────────────────────────────────────
// FeatureDetail — top-level component
// ──────────────────────────────────────────────
export function FeatureDetail({ itemType, itemId, currentUserName, canEdit }: FeatureDetailProps) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [customTabs, setCustomTabs] = useState<FeatureTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTabKind, setActiveTabKind] = useState<string>("current");
  const [addingTab, setAddingTab] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [editingTabFigmaId, setEditingTabFigmaId] = useState<string | null>(null);
  const [tabFigmaInput, setTabFigmaInput] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    Promise.all([
      supabase.from("policies").select("*").eq("item_type", itemType).eq("item_id", itemId).order("created_at"),
      supabase.from("feature_tabs").select("*").eq("item_type", itemType).eq("item_id", itemId).order("sort_order"),
    ]).then(([pRes, tRes]) => {
      if (!active) return;
      setPolicies((pRes.data ?? []) as Policy[]);
      setCustomTabs((tRes.data ?? []) as FeatureTab[]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [itemType, itemId]);

  // Fixed tabs always present
  const FIXED_TABS = [
    { id: "current", name: "현행", figma_url: null, isFixed: true },
    { id: "proposal", name: "신규 기획", figma_url: null, isFixed: true },
  ] as const;

  const allTabs = [
    ...FIXED_TABS,
    ...customTabs.map(t => ({ id: t.id, name: t.name, figma_url: t.figma_url, isFixed: false as const })),
  ];

  const activeTabMeta = allTabs.find(t => t.id === activeTabKind) ?? FIXED_TABS[0];
  const activePolicies = policies.filter(p => p.kind === activeTabKind);

  // 현행 탭은 항상 빈 카드 1개 표시
  const displayPolicies =
    activeTabKind === "current" && activePolicies.length === 0
      ? [emptyPolicy(itemType, itemId, "current")]
      : activePolicies;

  const tabDisplayName = activeTabMeta.name;

  // ── Handlers ──────────────────────────────────
  async function handleAddTab() {
    const name = newTabName.trim();
    if (!name) return;
    const supabase = createClient();
    const { data } = await supabase.from("feature_tabs")
      .insert({ item_type: itemType, item_id: itemId, name, sort_order: customTabs.length })
      .select("*").single();
    if (data) {
      setCustomTabs(prev => [...prev, data as FeatureTab]);
      setActiveTabKind((data as FeatureTab).id);
    }
    setAddingTab(false);
    setNewTabName("");
  }

  async function handleDeleteTab(tabId: string) {
    const supabase = createClient();
    await supabase.from("policies").delete().eq("item_type", itemType).eq("item_id", itemId).eq("kind", tabId);
    await supabase.from("feature_tabs").delete().eq("id", tabId);
    setCustomTabs(prev => prev.filter(t => t.id !== tabId));
    setPolicies(prev => prev.filter(p => p.kind !== tabId));
    setActiveTabKind("current");
  }

  async function handleSaveTabFigmaUrl(tabId: string) {
    const url = tabFigmaInput.trim();
    const supabase = createClient();
    await supabase.from("feature_tabs").update({ figma_url: url || null }).eq("id", tabId);
    setCustomTabs(prev => prev.map(t => t.id === tabId ? { ...t, figma_url: url || null } : t));
    setEditingTabFigmaId(null);
  }

  async function handleAddSection(kind: string) {
    const supabase = createClient();
    const { data } = await supabase.from("policies")
      .insert({ item_type: itemType, item_id: itemId, kind, author_name: currentUserName, updated_at: new Date().toISOString() })
      .select("*").single();
    if (data) setPolicies(prev => [...prev, data as Policy]);
  }

  async function handleDeleteSection(id: string) {
    const supabase = createClient();
    await supabase.from("policies").delete().eq("id", id);
    setPolicies(prev => prev.filter(p => p.id !== id));
  }

  async function handleBulkImport(tab: { id: string; figma_url: string | null }) {
    if (!tab.figma_url) return;
    setBulkImporting(true);
    setBulkProgress(0);
    setBulkError(null);

    try {
      const res = await fetch("/api/figma-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: tab.figma_url }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setBulkError(err.error ?? "피그마를 가져오지 못했습니다.");
        setBulkImporting(false);
        return;
      }
      const parsed = await res.json();
      const { sections, descriptions, policyNote, uiNote, considerationNote } = parsed as {
        sections: { name: string; imageBase64: string; imageMimeType: string }[];
        descriptions: string[];
        policyNote: string;
        uiNote: string;
        considerationNote: string;
      };

      if (!sections?.length) { setBulkError("가져올 와이어프레임이 없습니다."); setBulkImporting(false); return; }

      const supabase = createClient();
      const created: Policy[] = [];

      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        setBulkProgress(Math.round((i / sections.length) * 60));

        const policyData = {
          item_type: itemType,
          item_id: itemId,
          kind: tab.id,
          title: sec.name,
          author_name: currentUserName,
          updated_at: new Date().toISOString(),
          description_items: i === 0 ? descriptions : [],
          policy_note: i === 0 ? policyNote : "",
          ui_note: i === 0 ? uiNote : "",
          consideration_note: i === 0 ? considerationNote : "",
          image_badges: [],
        };
        const { data: policyRow, error: pErr } = await supabase.from("policies").insert(policyData).select("*").single();
        if (pErr || !policyRow) continue;

        let saved = policyRow as Policy;

        if (sec.imageBase64) {
          setBulkProgress(Math.round((i / sections.length) * 60 + 40 / sections.length));
          try {
            const bytes = Uint8Array.from(atob(sec.imageBase64), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: sec.imageMimeType });
            const ext = sec.imageMimeType.split("/")[1] ?? "png";
            const file = new File([blob], `figma.${ext}`, { type: sec.imageMimeType });
            const path = `${itemType}/${itemId}/${saved.id}-${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage.from("wireframes").upload(path, file, { upsert: true });
            if (!upErr) {
              const { data: urlData } = supabase.storage.from("wireframes").getPublicUrl(path);
              const wireframeUrl = `${urlData.publicUrl}?v=${Date.now()}`;
              const { data: updated } = await supabase.from("policies")
                .update({ wireframe_url: wireframeUrl, updated_at: new Date().toISOString() })
                .eq("id", saved.id).select("*").single();
              if (updated) saved = updated as Policy;
            }
          } catch { /* skip image upload */ }
        }

        created.push(saved);
        setBulkProgress(Math.round(((i + 1) / sections.length) * 100));
      }

      setPolicies(prev => [...prev, ...created]);
    } catch (e) {
      console.error("Bulk import error:", e);
      setBulkError("불러오기 중 오류가 발생했습니다.");
    } finally {
      setBulkImporting(false);
      setBulkProgress(0);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-zinc-400">불러오는 중...</p>;

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* ── 탭 바 ── */}
      <div className="flex flex-wrap items-center gap-1 rounded-full bg-zinc-100 p-1 self-start">
        {allTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTabKind(tab.id)}
            className={`flex items-center gap-1 rounded-full px-4 py-2 text-sm font-bold transition-colors ${activeTabKind === tab.id ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
          >
            {tab.name}
            {!tab.isFixed && activeTabKind === tab.id && canEdit && (
              <span
                role="button"
                aria-label="탭 삭제"
                onClick={e => { e.stopPropagation(); handleDeleteTab(tab.id); }}
                className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[11px] text-zinc-400 hover:bg-red-100 hover:text-red-500"
              >×</span>
            )}
          </button>
        ))}

        {/* + 추가 버튼 */}
        {canEdit && (
          addingTab ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={newTabName}
                onChange={e => setNewTabName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") handleAddTab();
                  if (e.key === "Escape") { setAddingTab(false); setNewTabName(""); }
                }}
                placeholder="탭 이름"
                className="w-24 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:ring-2 focus:ring-brand/20"
              />
              <button type="button" onClick={handleAddTab} className="rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand/90">확인</button>
              <button type="button" onClick={() => { setAddingTab(false); setNewTabName(""); }} className="rounded-full px-2 py-1.5 text-xs text-ink-muted hover:bg-white">취소</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingTab(true)}
              className="rounded-full px-3 py-2 text-sm font-bold text-ink-muted transition-colors hover:bg-white hover:text-ink"
            >
              + 추가
            </button>
          )
        )}
      </div>

      {/* ── 커스텀 탭 Figma URL 바 ── */}
      {!activeTabMeta.isFixed && canEdit && (
        <div className="flex items-center gap-2 rounded-2xl bg-zinc-50 px-4 py-3 text-sm">
          {editingTabFigmaId === activeTabKind ? (
            <>
              <svg width="14" height="14" viewBox="0 0 38 57" fill="none" className="shrink-0" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 28.5C19 25.9804 20.0009 23.5641 21.7825 21.7825C23.5641 20.0009 25.9804 19 28.5 19C31.0196 19 33.4359 20.0009 35.2175 21.7825C36.9991 23.5641 38 25.9804 38 28.5C38 31.0196 36.9991 33.4359 35.2175 35.2175C33.4359 36.9991 31.0196 38 28.5 38C25.9804 38 23.5641 36.9991 21.7825 35.2175C20.0009 33.4359 19 31.0196 19 28.5Z" fill="#1ABCFE"/>
                <path d="M0 47.5C0 44.9804 1.00089 42.5641 2.78249 40.7825C4.56408 39.0009 6.98044 38 9.5 38H19V47.5C19 50.0196 17.9991 52.4359 16.2175 54.2175C14.4359 55.9991 12.0196 57 9.5 57C6.98044 57 4.56408 55.9991 2.78249 54.2175C1.00089 52.4359 0 50.0196 0 47.5Z" fill="#0ACF83"/>
                <path d="M19 0V19H28.5C31.0196 19 33.4359 17.9991 35.2175 16.2175C36.9991 14.4359 38 12.0196 38 9.5C38 6.98044 36.9991 4.56408 35.2175 2.78249C33.4359 1.00089 31.0196 0 28.5 0H19Z" fill="#FF7262"/>
                <path d="M0 9.5C0 12.0196 1.00089 14.4359 2.78249 16.2175C4.56408 17.9991 6.98044 19 9.5 19H19V0H9.5C6.98044 0 4.56408 1.00089 2.78249 2.78249C1.00089 4.56408 0 6.98044 0 9.5Z" fill="#F24E1E"/>
                <path d="M0 28.5C0 31.0196 1.00089 33.4359 2.78249 35.2175C4.56408 36.9991 6.98044 38 9.5 38H19V19H9.5C6.98044 19 4.56408 20.0009 2.78249 21.7825C1.00089 23.5641 0 25.9804 0 28.5Z" fill="#A259FF"/>
              </svg>
              <input
                autoFocus
                type="url"
                value={tabFigmaInput}
                onChange={e => setTabFigmaInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") handleSaveTabFigmaUrl(activeTabKind);
                  if (e.key === "Escape") setEditingTabFigmaId(null);
                }}
                placeholder="https://www.figma.com/design/..."
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-ink outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20"
              />
              <button type="button" onClick={() => handleSaveTabFigmaUrl(activeTabKind)} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand/90">저장</button>
              <button type="button" onClick={() => setEditingTabFigmaId(null)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-ink-muted hover:bg-zinc-100">취소</button>
            </>
          ) : activeTabMeta.figma_url ? (
            <>
              <svg width="14" height="14" viewBox="0 0 38 57" fill="none" className="shrink-0" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 28.5C19 25.9804 20.0009 23.5641 21.7825 21.7825C23.5641 20.0009 25.9804 19 28.5 19C31.0196 19 33.4359 20.0009 35.2175 21.7825C36.9991 23.5641 38 25.9804 38 28.5C38 31.0196 36.9991 33.4359 35.2175 35.2175C33.4359 36.9991 31.0196 38 28.5 38C25.9804 38 23.5641 36.9991 21.7825 35.2175C20.0009 33.4359 19 31.0196 19 28.5Z" fill="#1ABCFE"/>
                <path d="M0 47.5C0 44.9804 1.00089 42.5641 2.78249 40.7825C4.56408 39.0009 6.98044 38 9.5 38H19V47.5C19 50.0196 17.9991 52.4359 16.2175 54.2175C14.4359 55.9991 12.0196 57 9.5 57C6.98044 57 4.56408 55.9991 2.78249 54.2175C1.00089 52.4359 0 50.0196 0 47.5Z" fill="#0ACF83"/>
                <path d="M19 0V19H28.5C31.0196 19 33.4359 17.9991 35.2175 16.2175C36.9991 14.4359 38 12.0196 38 9.5C38 6.98044 36.9991 4.56408 35.2175 2.78249C33.4359 1.00089 31.0196 0 28.5 0H19Z" fill="#FF7262"/>
                <path d="M0 9.5C0 12.0196 1.00089 14.4359 2.78249 16.2175C4.56408 17.9991 6.98044 19 9.5 19H19V0H9.5C6.98044 0 4.56408 1.00089 2.78249 2.78249C1.00089 4.56408 0 6.98044 0 9.5Z" fill="#F24E1E"/>
                <path d="M0 28.5C0 31.0196 1.00089 33.4359 2.78249 35.2175C4.56408 36.9991 6.98044 38 9.5 38H19V19H9.5C6.98044 19 4.56408 20.0009 2.78249 21.7825C1.00089 23.5641 0 25.9804 0 28.5Z" fill="#A259FF"/>
              </svg>
              <span className="flex-1 truncate text-xs text-ink-muted">{activeTabMeta.figma_url}</span>
              <button type="button" onClick={() => { setTabFigmaInput(activeTabMeta.figma_url ?? ""); setEditingTabFigmaId(activeTabKind); }} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold text-ink-muted hover:bg-zinc-100">편집</button>
              <button
                type="button"
                disabled={bulkImporting}
                onClick={() => handleBulkImport(activeTabMeta)}
                className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand/90 disabled:opacity-50"
              >
                {bulkImporting ? `불러오는 중... ${bulkProgress}%` : "전체 불러오기"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => { setTabFigmaInput(""); setEditingTabFigmaId(activeTabKind); }}
              className="flex items-center gap-1.5 text-xs font-bold text-ink-muted hover:text-brand"
            >
              <svg width="12" height="12" viewBox="0 0 38 57" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 28.5C19 25.98 20 23.56 21.78 21.78C23.56 20 25.98 19 28.5 19C31.02 19 33.44 20 35.22 21.78C36.99 23.56 38 25.98 38 28.5C38 31.02 36.99 33.44 35.22 35.22C33.44 36.99 31.02 38 28.5 38C25.98 38 23.56 36.99 21.78 35.22C20 33.44 19 31.02 19 28.5Z" fill="#1ABCFE"/>
                <path d="M0 47.5C0 44.98 1 42.56 2.78 40.78C4.56 39 6.98 38 9.5 38H19V47.5C19 50.02 17.99 52.44 16.22 54.22C14.44 55.99 12.02 57 9.5 57C6.98 57 4.56 55.99 2.78 54.22C1 52.44 0 50.02 0 47.5Z" fill="#0ACF83"/>
                <path d="M19 0V19H28.5C31.02 19 33.44 17.99 35.22 16.22C36.99 14.44 38 12.02 38 9.5C38 6.98 36.99 4.56 35.22 2.78C33.44 1 31.02 0 28.5 0H19Z" fill="#FF7262"/>
                <path d="M0 9.5C0 12.02 1 14.44 2.78 16.22C4.56 17.99 6.98 19 9.5 19H19V0H9.5C6.98 0 4.56 1 2.78 2.78C1 4.56 0 6.98 0 9.5Z" fill="#F24E1E"/>
                <path d="M0 28.5C0 31.02 1 33.44 2.78 35.22C4.56 36.99 6.98 38 9.5 38H19V19H9.5C6.98 19 4.56 20 2.78 21.78C1 23.56 0 25.98 0 28.5Z" fill="#A259FF"/>
              </svg>
              피그마 URL 연결하기
            </button>
          )}
        </div>
      )}

      {bulkError && <p className="text-xs text-red-500 px-1">{bulkError}</p>}

      {/* ── 섹션 카드 목록 ── */}
      <div className="flex flex-col gap-8">
        {activeTabKind !== "current" && displayPolicies.length === 0 && !bulkImporting && (
          <p className="px-1 text-sm text-ink-muted">섹션이 없습니다. 아래 버튼으로 추가하거나 피그마에서 불러오세요.</p>
        )}

        {displayPolicies.map(policy => (
          <PolicyCard
            key={policy.id || "empty"}
            policy={policy}
            tabName={tabDisplayName}
            onSaved={updated => setPolicies(prev =>
              prev.map(p => (p.id && p.id === updated.id) || (!p.id && policy === p) ? updated : p)
            )}
            onDelete={canEdit && !!policy.id ? () => handleDeleteSection(policy.id) : undefined}
            currentUserName={currentUserName}
            canEdit={canEdit}
          />
        ))}

        {canEdit && (
          <button
            type="button"
            onClick={() => handleAddSection(activeTabKind)}
            className="flex items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-zinc-200 py-5 text-sm font-bold text-ink-muted transition-colors hover:border-brand/40 hover:text-brand"
          >
            + 섹션 추가
          </button>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// PolicyCard
// ──────────────────────────────────────────────
type PolicyCardProps = {
  policy: Policy;
  tabName: string;
  onSaved: (policy: Policy) => void;
  onDelete?: () => void;
  currentUserName: string;
  canEdit: boolean;
};

function PolicyCard({ policy, tabName, onSaved, onDelete, currentUserName, canEdit }: PolicyCardProps) {
  const [title, setTitle] = useState(policy.title);
  const [policyNote, setPolicyNote] = useState(policy.policy_note);
  const [uiNote, setUiNote] = useState(policy.ui_note);
  const [considerationNote, setConsiderationNote] = useState(policy.consideration_note);
  const [showPolicy, setShowPolicy] = useState(!!policy.policy_note);
  const [showUiNote, setShowUiNote] = useState(!!policy.ui_note);
  const [showConsideration, setShowConsideration] = useState(!!policy.consideration_note);
  const [descriptionItems, setDescriptionItems] = useState<string[]>(
    policy.description_items.length ? policy.description_items : [""]
  );
  const [imageBadges, setImageBadges] = useState<ImageBadgeMark[]>(policy.image_badges ?? []);
  const [isPlacingBadge, setIsPlacingBadge] = useState(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [draggingBadgeId, setDraggingBadgeId] = useState<string | null>(null);
  const [editingBadgeId, setEditingBadgeId] = useState<string | null>(null);
  const [hoveredBadgeNumber, setHoveredBadgeNumber] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFigmaInput, setShowFigmaInput] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageBadgesRef = useRef(imageBadges);
  const descriptionItemsRef = useRef(descriptionItems);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { imageBadgesRef.current = imageBadges; }, [imageBadges]);
  useEffect(() => { descriptionItemsRef.current = descriptionItems; }, [descriptionItems]);

  // Badge style by kind
  const VERSION_LABEL = policy.kind === "current" ? "v1.0" : "v0.1";
  const badgeStyle =
    policy.kind === "current" ? "bg-white text-ink-muted" :
    policy.kind === "proposal" ? "bg-brand/10 text-brand" :
    "bg-purple-100 text-purple-700";

  // Drag-to-draw
  useEffect(() => {
    if (!isDrawingMode) return;
    function getPos(e: MouseEvent) {
      if (!imageContainerRef.current) return null;
      const rect = imageContainerRef.current.getBoundingClientRect();
      return {
        x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
        y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
      };
    }
    function handleMouseMove(e: MouseEvent) {
      if (!drawStartRef.current) return;
      const pos = getPos(e);
      if (!pos) return;
      setDrawRect({ x: Math.min(drawStartRef.current.x, pos.x), y: Math.min(drawStartRef.current.y, pos.y), w: Math.abs(pos.x - drawStartRef.current.x), h: Math.abs(pos.y - drawStartRef.current.y) });
    }
    function handleMouseUp(e: MouseEvent) {
      const start = drawStartRef.current;
      if (start) {
        const pos = getPos(e);
        if (pos) {
          const x = Math.min(start.x, pos.x), y = Math.min(start.y, pos.y), w = Math.abs(pos.x - start.x), h = Math.abs(pos.y - start.y);
          if (w > 2 && h > 2) {
            const badges = imageBadgesRef.current;
            const nextNumber = badges.length ? Math.max(...badges.map(b => b.number)) + 1 : 1;
            const newBadge: ImageBadgeMark = { id: crypto.randomUUID(), number: nextNumber, x, y, w, h };
            const nextBadges = [...badges, newBadge];
            const nextDesc = [...descriptionItemsRef.current, ""];
            setImageBadges(nextBadges);
            setDescriptionItems(nextDesc);
            persist({ image_badges: nextBadges, description_items: nextDesc });
          }
        }
        drawStartRef.current = null;
      }
      setDrawRect(null);
      setIsDrawingMode(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { drawStartRef.current = null; setDrawRect(null); setIsDrawingMode(false); setIsPlacingBadge(false); }
    }
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); document.removeEventListener("keydown", handleKeyDown); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDrawingMode]);

  async function persist(changes: Partial<Pick<Policy, "title" | "policy_note" | "ui_note" | "consideration_note" | "description_items" | "wireframe_url" | "image_badges">>): Promise<Policy | null> {
    const supabase = createClient();
    const stamp = { author_name: currentUserName, updated_at: new Date().toISOString() };
    if (!policy.id) {
      const { data, error: e } = await supabase.from("policies")
        .insert({ item_type: policy.item_type, item_id: policy.item_id, kind: policy.kind, title, policy_note: policyNote, ui_note: uiNote, consideration_note: considerationNote, description_items: descriptionItems, image_badges: imageBadges, ...changes, ...stamp })
        .select("*").single();
      if (!e && data) { onSaved(data as Policy); return data as Policy; }
      return null;
    }
    const { data, error: e } = await supabase.from("policies").update({ ...changes, ...stamp }).eq("id", policy.id).select("*").single();
    if (!e && data) { onSaved(data as Policy); return data as Policy; }
    return null;
  }

  async function uploadFile(file: File, knownPolicyId?: string) {
    if (!file.type.startsWith("image/")) { setError("이미지 파일만 업로드할 수 있습니다."); return; }
    if (file.size > MAX_SIZE) { setError("이미지 크기는 5MB 이하여야 합니다."); return; }
    setError(null); setUploading(true);
    const supabase = createClient();
    let policyId = knownPolicyId || policy.id;
    if (!policyId) {
      const { data, error: e } = await supabase.from("policies").insert({ item_type: policy.item_type, item_id: policy.item_id, kind: policy.kind, title, policy_note: policyNote, ui_note: uiNote, consideration_note: considerationNote, description_items: descriptionItems, image_badges: imageBadges }).select("*").single();
      if (e || !data) { setError(e?.message ?? "저장에 실패했습니다."); setUploading(false); return; }
      policyId = (data as Policy).id;
      onSaved(data as Policy);
    }
    const ext = file.name.split(".").pop();
    const path = `${policy.item_type}/${policy.item_id}/${policyId}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("wireframes").upload(path, file, { upsert: true });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("wireframes").getPublicUrl(path);
    const wireframeUrl = `${urlData.publicUrl}?v=${Date.now()}`;
    const { data: updated, error: updErr } = await supabase.from("policies").update({ wireframe_url: wireframeUrl, author_name: currentUserName, updated_at: new Date().toISOString() }).eq("id", policyId).select("*").single();
    if (updErr) setError(updErr.message);
    else if (updated) onSaved(updated as Policy);
    setUploading(false);
  }

  async function handleFigmaImport() {
    if (!figmaUrl.trim()) return;
    setError(null); setUploading(true); setShowFigmaInput(false);
    try {
      const res = await fetch("/api/figma-parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: figmaUrl.trim() }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.error ?? "피그마를 가져오지 못했습니다."); setUploading(false); return; }
      const parsed = await res.json();
      const { imageBase64, imageMimeType, descriptions, policyNote: newPN, uiNote: newUN, considerationNote: newCN, wireframeName } = parsed;
      const newDescs = Array.isArray(descriptions) && descriptions.length > 0 ? descriptions : [""];
      setDescriptionItems(newDescs);
      if (newPN) { setPolicyNote(newPN); setShowPolicy(true); }
      if (newUN) { setUiNote(newUN); setShowUiNote(true); }
      if (newCN) { setConsiderationNote(newCN); setShowConsideration(true); }
      if (wireframeName && !title) setTitle(wireframeName);
      const savedPolicy = await persist({
        ...(wireframeName && !title ? { title: wireframeName } : {}),
        description_items: newDescs,
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
        await uploadFile(file, savedPolicy?.id);
      } else { setUploading(false); }
    } catch (e) { console.error(e); setError("피그마 가져오기 중 오류가 발생했습니다."); setUploading(false); }
  }

  function handleImageMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    setShowImageMenu(false);
    if (!canEdit || !imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (isPlacingBadge) {
      e.preventDefault();
      const badges = imageBadgesRef.current;
      const nextNumber = badges.length ? Math.max(...badges.map(b => b.number)) + 1 : 1;
      const newBadge: ImageBadgeMark = { id: crypto.randomUUID(), number: nextNumber, x, y };
      const nextBadges = [...badges, newBadge];
      const nextDesc = [...descriptionItemsRef.current, ""];
      setImageBadges(nextBadges); setDescriptionItems(nextDesc);
      persist({ image_badges: nextBadges, description_items: nextDesc });
      setIsPlacingBadge(false);
      return;
    }
    if (isDrawingMode) { e.preventDefault(); drawStartRef.current = { x, y }; }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (!canEdit) return;
    const file = Array.from(e.clipboardData.items).find(item => item.type.startsWith("image/"))?.getAsFile();
    if (!file) return;
    e.preventDefault();
    void uploadFile(file);
  }

  function removeImageBadge(id: string) {
    const next = imageBadges.filter(b => b.id !== id);
    setImageBadges(next); persist({ image_badges: next });
  }

  function updateImageBadgeNumber(id: string, number: number) {
    const next = imageBadges.map(b => b.id === id ? { ...b, number } : b);
    setImageBadges(next); persist({ image_badges: next });
  }

  function handleBadgeMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation(); e.preventDefault();
    if (isDrawingMode) return;
    setDraggingBadgeId(id);
  }

  useEffect(() => {
    if (!draggingBadgeId) return;
    function handleMouseMove(e: MouseEvent) {
      if (!imageContainerRef.current) return;
      const rect = imageContainerRef.current.getBoundingClientRect();
      const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
      setImageBadges(prev => prev.map(b => b.id === draggingBadgeId ? { ...b, x, y } : b));
    }
    function handleMouseUp() { setDraggingBadgeId(null); persist({ image_badges: imageBadgesRef.current }); }
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => { document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingBadgeId]);

  function addDescriptionRow() {
    const next = [...descriptionItems, ""];
    setDescriptionItems(next); persist({ description_items: next });
  }

  function removeDescriptionRow(index: number) {
    const next = descriptionItems.filter((_, i) => i !== index);
    setDescriptionItems(next); persist({ description_items: next });
  }

  function updateDescriptionRow(index: number, value: string) {
    setDescriptionItems(prev => prev.map((item, i) => i === index ? value : item));
  }

  function handleDescriptionBlur() {
    if (JSON.stringify(descriptionItems) !== JSON.stringify(policy.description_items))
      persist({ description_items: descriptionItems });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold tracking-wide ${badgeStyle}`}>{tabName}</span>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-ink-muted">{VERSION_LABEL}</span>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => { if (title !== policy.title) persist({ title }); }}
          readOnly={!canEdit}
          placeholder="화면 제목을 입력하세요"
          className={`flex-1 rounded-xl px-3 py-2 text-lg font-bold text-ink outline-none transition-colors placeholder:font-normal placeholder:text-ink-muted ${canEdit ? "hover:bg-white focus:bg-white focus:ring-2 focus:ring-brand/20" : ""}`}
        />
        {(policy.author_name || formatDate(policy.updated_at)) && (
          <span className="text-xs text-ink-muted">{[policy.author_name, formatDate(policy.updated_at)].filter(Boolean).join(" · ")}</span>
        )}
        {onDelete && (
          <button type="button" onClick={onDelete} aria-label="기획서 삭제" className="rounded-full p-2 text-ink-muted transition-colors hover:bg-red-50 hover:text-red-500">🗑</button>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-4 rounded-3xl bg-surface p-5">
        <div className="flex gap-5">
          {/* Left: wireframe */}
          <div className="flex w-[55%] shrink-0 flex-col gap-3">
            {policy.wireframe_url ? (
              <div
                ref={imageContainerRef}
                tabIndex={0}
                onPaste={handlePaste}
                onMouseDown={handleImageMouseDown}
                className={`group relative overflow-hidden rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-brand/30 ${isDrawingMode || isPlacingBadge ? "cursor-crosshair select-none" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={policy.wireframe_url} alt="와이어프레임" className="w-full object-contain" draggable={false} />

                {canEdit && (
                  <div className="absolute right-2 top-2">
                    <button type="button" onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setShowImageMenu(v => !v); }} aria-label="이미지 설정" className={`flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-sm text-white backdrop-blur-sm transition-opacity hover:bg-black/65 ${showImageMenu ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>⚙️</button>
                    {showImageMenu && (
                      <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} className="absolute right-0 top-9 z-20 flex w-40 flex-col overflow-hidden rounded-xl bg-white py-1 text-sm font-bold shadow-lg">
                        <button type="button" onClick={() => { setShowImageMenu(false); inputRef.current?.click(); }} disabled={uploading} className="px-3 py-2 text-left text-ink transition-colors hover:bg-zinc-50 disabled:opacity-50">{uploading ? "업로드 중..." : "이미지 교체"}</button>
                        <button type="button" onClick={() => { setShowImageMenu(false); setIsPlacingBadge(true); }} className="px-3 py-2 text-left text-ink transition-colors hover:bg-zinc-50">번호 찍기</button>
                        <button type="button" onClick={() => { setShowImageMenu(false); setIsDrawingMode(true); }} className="px-3 py-2 text-left text-ink transition-colors hover:bg-zinc-50">영역 표시 추가</button>
                        <button type="button" onClick={() => { setShowImageMenu(false); persist({ wireframe_url: null }); }} className="px-3 py-2 text-left text-red-500 transition-colors hover:bg-red-50">이미지 삭제</button>
                      </div>
                    )}
                  </div>
                )}

                {isPlacingBadge && <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-black/5 pt-3"><span className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">클릭해서 번호를 찍으세요 · ESC 취소</span></div>}
                {isDrawingMode && <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-black/5 pt-3"><span className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">드래그해서 영역을 지정하세요 · ESC 취소</span></div>}
                {drawRect && <div className="pointer-events-none absolute z-20 border-2 border-dashed border-blue-500 bg-blue-500/10" style={{ left: `${drawRect.x}%`, top: `${drawRect.y}%`, width: `${drawRect.w}%`, height: `${drawRect.h}%` }} />}

                {imageBadges.map(b =>
                  b.w !== undefined && b.h !== undefined ? (
                    <div key={b.id} onMouseEnter={() => setHoveredBadgeNumber(b.number)} onMouseLeave={() => setHoveredBadgeNumber(null)} style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`, borderColor: getBadgeColor(b.number), backgroundColor: hoveredBadgeNumber === b.number ? getBadgeColor(b.number) + "18" : undefined }} className="group/box absolute border-2 border-dashed transition-colors">
                      <div onMouseDown={canEdit ? e => handleBadgeMouseDown(e, b.id) : undefined} onDoubleClick={canEdit ? e => { e.stopPropagation(); setEditingBadgeId(b.id); } : undefined} style={{ backgroundColor: getBadgeColor(b.number) }} className={`absolute -left-px -top-px flex min-w-[22px] select-none items-center justify-center rounded-br-md px-1.5 py-0.5 text-xs font-bold text-white shadow-sm ${canEdit ? "cursor-move" : ""}`}>
                        {editingBadgeId === b.id ? <input type="number" autoFocus defaultValue={b.number} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onBlur={e => { const n = Number(e.target.value); updateImageBadgeNumber(b.id, Number.isFinite(n) && n > 0 ? n : b.number); setEditingBadgeId(null); }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} className="w-8 bg-transparent text-center text-white outline-none" /> : b.number}
                      </div>
                      {canEdit && <button type="button" onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); removeImageBadge(b.id); }} style={{ color: getBadgeColor(b.number) }} className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] opacity-0 shadow transition-opacity group-hover/box:opacity-100">✕</button>}
                    </div>
                  ) : (
                    <div key={b.id} onMouseDown={canEdit ? e => handleBadgeMouseDown(e, b.id) : undefined} onMouseEnter={() => setHoveredBadgeNumber(b.number)} onMouseLeave={() => setHoveredBadgeNumber(null)} onDoubleClick={canEdit ? e => { e.stopPropagation(); setEditingBadgeId(b.id); } : undefined} style={{ left: `${b.x}%`, top: `${b.y}%`, backgroundColor: getBadgeColor(b.number) }} className={`group/badge absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 select-none items-center justify-center rounded-md text-sm font-bold text-white shadow-md ${canEdit ? "cursor-move" : ""}`}>
                      {editingBadgeId === b.id ? <input type="number" autoFocus defaultValue={b.number} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onBlur={e => { const n = Number(e.target.value); updateImageBadgeNumber(b.id, Number.isFinite(n) && n > 0 ? n : b.number); setEditingBadgeId(null); }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} className="h-full w-full rounded-md bg-transparent text-center text-white outline-none" /> : b.number}
                      {canEdit && <button type="button" onClick={e => { e.stopPropagation(); removeImageBadge(b.id); }} onMouseDown={e => e.stopPropagation()} className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] text-red-500 opacity-0 shadow transition-opacity group-hover/badge:opacity-100">✕</button>}
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div tabIndex={canEdit ? 0 : -1} onPaste={handlePaste} onClick={canEdit ? () => inputRef.current?.click() : undefined} className={`flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-zinc-200 bg-white text-sm font-medium text-ink-muted outline-none transition-colors ${canEdit ? "cursor-pointer hover:border-brand/40 hover:bg-brand/5 focus:border-brand/40 focus:bg-brand/5 focus:ring-2 focus:ring-brand/20" : ""}`}>
                  <span>{uploading ? "업로드 중..." : "와이어프레임 이미지가 없습니다."}</span>
                  {canEdit && <span className="text-xs text-ink-muted">클릭해서 업로드하거나 Ctrl+V로 캡쳐본을 붙여넣을 수 있어요.</span>}
                </div>
                {canEdit && !uploading && (
                  showFigmaInput ? (
                    <div className="flex gap-2">
                      <input type="url" value={figmaUrl} onChange={e => setFigmaUrl(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleFigmaImport(); if (e.key === "Escape") { setShowFigmaInput(false); setFigmaUrl(""); } }} autoFocus placeholder="https://www.figma.com/design/..." className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 focus:ring-2 focus:ring-brand/20" />
                      <button type="button" onClick={handleFigmaImport} className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand/90">가져오기</button>
                      <button type="button" onClick={() => { setShowFigmaInput(false); setFigmaUrl(""); }} className="rounded-xl px-3 py-2 text-sm font-bold text-ink-muted transition-colors hover:bg-zinc-100">취소</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowFigmaInput(true)} className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white py-2 text-xs font-bold text-ink-muted transition-colors hover:border-brand/40 hover:text-brand">
                      <svg width="14" height="14" viewBox="0 0 38 57" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19 28.5C19 25.9804 20.0009 23.5641 21.7825 21.7825C23.5641 20.0009 25.9804 19 28.5 19C31.0196 19 33.4359 20.0009 35.2175 21.7825C36.9991 23.5641 38 25.9804 38 28.5C38 31.0196 36.9991 33.4359 35.2175 35.2175C33.4359 36.9991 31.0196 38 28.5 38C25.9804 38 23.5641 36.9991 21.7825 35.2175C20.0009 33.4359 19 31.0196 19 28.5Z" fill="#1ABCFE"/>
                        <path d="M0 47.5C0 44.9804 1.00089 42.5641 2.78249 40.7825C4.56408 39.0009 6.98044 38 9.5 38H19V47.5C19 50.0196 17.9991 52.4359 16.2175 54.2175C14.4359 55.9991 12.0196 57 9.5 57C6.98044 57 4.56408 55.9991 2.78249 54.2175C1.00089 52.4359 0 50.0196 0 47.5Z" fill="#0ACF83"/>
                        <path d="M19 0V19H28.5C31.0196 19 33.4359 17.9991 35.2175 16.2175C36.9991 14.4359 38 12.0196 38 9.5C38 6.98044 36.9991 4.56408 35.2175 2.78249C33.4359 1.00089 31.0196 0 28.5 0H19Z" fill="#FF7262"/>
                        <path d="M0 9.5C0 12.0196 1.00089 14.4359 2.78249 16.2175C4.56408 17.9991 6.98044 19 9.5 19H19V0H9.5C6.98044 0 4.56408 1.00089 2.78249 2.78249C1.00089 4.56408 0 6.98044 0 9.5Z" fill="#F24E1E"/>
                        <path d="M0 28.5C0 31.0196 1.00089 33.4359 2.78249 35.2175C4.56408 36.9991 6.98044 38 9.5 38H19V19H9.5C6.98044 19 4.56408 20.0009 2.78249 21.7825C1.00089 23.5641 0 25.9804 0 28.5Z" fill="#A259FF"/>
                      </svg>
                      피그마 URL로 가져오기
                    </button>
                  )
                )}
              </div>
            )}
            {canEdit && <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadFile(f); }} />}
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>

          {/* Right: description + notes — no scroll, fully expanded */}
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-col gap-2 rounded-2xl bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink-muted">디스크립션</span>
                {canEdit && <button type="button" onClick={addDescriptionRow} className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-ink-muted transition-colors hover:bg-zinc-200 hover:text-ink">+ 행 추가</button>}
              </div>
              <div className="flex flex-col gap-2">
                {descriptionItems.map((item, index) => {
                  const rowNumber = index + 1;
                  const matchedBadge = imageBadges.find(b => b.number === rowNumber);
                  const color = matchedBadge ? getBadgeColor(rowNumber) : undefined;
                  const isHighlighted = hoveredBadgeNumber === rowNumber && !!color;
                  return (
                    <div key={index} onMouseEnter={() => setHoveredBadgeNumber(rowNumber)} onMouseLeave={() => setHoveredBadgeNumber(null)} className="flex gap-2 rounded-xl p-1 transition-colors" style={isHighlighted ? { boxShadow: `0 0 0 2px ${color}55`, backgroundColor: color + "0d" } : undefined}>
                      <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: color ?? "#e4e4e7", color: color ? "white" : "#71717a" }}>{rowNumber}</span>
                      <AutoResizeTextarea
                        value={item}
                        onChange={e => updateDescriptionRow(index, e.target.value)}
                        onBlur={handleDescriptionBlur}
                        readOnly={!canEdit}
                        placeholder="디스크립션을 입력하세요."
                        className="flex-1 rounded-xl bg-surface px-3 py-2 text-sm leading-relaxed text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20"
                      />
                      {canEdit && <button type="button" onClick={() => removeDescriptionRow(index)} className="self-start rounded-full px-2 py-1 text-xs font-bold text-ink-muted transition-colors hover:bg-red-50 hover:text-red-500">✕</button>}
                    </div>
                  );
                })}
              </div>
            </div>

            {canEdit && (!showPolicy || !showUiNote || !showConsideration) && (
              <div className="flex gap-2">
                {!showPolicy && <button type="button" onClick={() => setShowPolicy(true)} className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-ink-muted transition-colors hover:bg-zinc-200 hover:text-ink">+ 정책</button>}
                {!showUiNote && <button type="button" onClick={() => setShowUiNote(true)} className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-ink-muted transition-colors hover:bg-zinc-200 hover:text-ink">+ UI 참고사항</button>}
                {!showConsideration && <button type="button" onClick={() => setShowConsideration(true)} className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-ink-muted transition-colors hover:bg-zinc-200 hover:text-ink">+ 고려사항</button>}
              </div>
            )}

            {showPolicy && (
              <div className="rounded-2xl bg-red-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-red-500">정책</span>
                  {canEdit && <button type="button" onClick={() => setShowPolicy(false)} className="rounded-full px-2 py-0.5 text-xs font-bold text-red-300 transition-colors hover:bg-red-100 hover:text-red-500">✕</button>}
                </div>
                <AutoResizeTextarea value={policyNote} onChange={e => setPolicyNote(e.target.value)} onBlur={() => { if (policyNote !== policy.policy_note) persist({ policy_note: policyNote }); }} readOnly={!canEdit} placeholder="정책을 입력하세요." className="w-full bg-transparent text-sm leading-relaxed text-red-600 outline-none placeholder:text-red-300" />
              </div>
            )}

            {showUiNote && (
              <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-amber-600">★ UI 참고사항</span>
                  {canEdit && <button type="button" onClick={() => setShowUiNote(false)} className="rounded-full px-2 py-0.5 text-xs font-bold text-amber-400 transition-colors hover:bg-amber-100 hover:text-amber-600">✕</button>}
                </div>
                <AutoResizeTextarea value={uiNote} onChange={e => setUiNote(e.target.value)} onBlur={() => { if (uiNote !== policy.ui_note) persist({ ui_note: uiNote }); }} readOnly={!canEdit} placeholder="내용을 입력하세요." className="w-full bg-transparent text-sm leading-relaxed text-amber-800 outline-none placeholder:text-amber-300" />
              </div>
            )}

            {showConsideration && (
              <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-emerald-600">★ 고려사항</span>
                  {canEdit && <button type="button" onClick={() => setShowConsideration(false)} className="rounded-full px-2 py-0.5 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-100 hover:text-emerald-600">✕</button>}
                </div>
                <AutoResizeTextarea value={considerationNote} onChange={e => setConsiderationNote(e.target.value)} onBlur={() => { if (considerationNote !== policy.consideration_note) persist({ consideration_note: considerationNote }); }} readOnly={!canEdit} placeholder="내용을 입력하세요." className="w-full bg-transparent text-sm leading-relaxed text-emerald-800 outline-none placeholder:text-emerald-300" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
