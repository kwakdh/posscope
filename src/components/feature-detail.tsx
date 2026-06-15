"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ItemType = "category" | "feature";

type ImageBadgeMark = {
  id: string;
  number: number;
  x: number;
  y: number;
};

type Policy = {
  id: string;
  item_type: ItemType;
  item_id: string;
  kind: "current" | "proposal";
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

type FeatureDetailProps = {
  itemType: ItemType;
  itemId: string;
  currentUserName: string;
  canEdit: boolean;
};

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const VERSION_LABEL: Record<Policy["kind"], string> = {
  current: "v1.0",
  proposal: "v0.1",
};

function emptyPolicy(itemType: ItemType, itemId: string, kind: Policy["kind"]): Policy {
  return {
    id: "",
    item_type: itemType,
    item_id: itemId,
    kind,
    title: "",
    policy_note: "",
    ui_note: "",
    consideration_note: "",
    description_items: [],
    wireframe_url: null,
    image_badges: [],
    sort_order: 0,
    author_name: null,
    updated_at: null,
  };
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

export function FeatureDetail({ itemType, itemId, currentUserName, canEdit }: FeatureDetailProps) {
  const [current, setCurrent] = useState<Policy | null>(null);
  const [proposals, setProposals] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<"current" | string>("current");

  useEffect(() => {
    let active = true;

    const supabase = createClient();
    supabase
      .from("policies")
      .select("*")
      .eq("item_type", itemType)
      .eq("item_id", itemId)
      .order("kind")
      .order("created_at")
      .then(({ data }) => {
        if (!active) return;
        const rows = (data ?? []) as Policy[];
        setCurrent(rows.find((row) => row.kind === "current") ?? emptyPolicy(itemType, itemId, "current"));
        setProposals(rows.filter((row) => row.kind === "proposal"));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [itemType, itemId]);

  async function handleAddProposal() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("policies")
      .insert({
        item_type: itemType,
        item_id: itemId,
        kind: "proposal",
        author_name: currentUserName,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (!error && data) {
      setProposals((prev) => [...prev, data as Policy]);
      setSelectedTab((data as Policy).id);
    }
  }

  async function handleDeleteProposal(id: string) {
    const supabase = createClient();
    await supabase.from("policies").delete().eq("id", id);
    setProposals((prev) => prev.filter((p) => p.id !== id));
    if (selectedTab === id) setSelectedTab("current");
  }

  if (loading || !current) {
    return <p className="mt-4 text-sm text-zinc-400">불러오는 중...</p>;
  }

  const selectedPolicy = selectedTab === "current" ? current : proposals.find((p) => p.id === selectedTab);

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex items-center gap-1 rounded-full bg-zinc-100 p-1">
        <button
          type="button"
          onClick={() => setSelectedTab("current")}
          className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
            selectedTab === "current"
              ? "bg-white text-ink shadow-sm"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          현행
        </button>
        {proposals.map((proposal, index) => (
          <button
            key={proposal.id}
            type="button"
            onClick={() => setSelectedTab(proposal.id)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
              selectedTab === proposal.id
                ? "bg-white text-ink shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            신규 기획{proposals.length > 1 ? ` ${index + 1}` : ""}
          </button>
        ))}
        {canEdit && (
          <button
            type="button"
            onClick={handleAddProposal}
            className="rounded-full px-4 py-2 text-sm font-bold text-ink-muted transition-colors hover:text-brand"
          >
            + 추가
          </button>
        )}
      </div>

      {selectedPolicy && (
        <PolicyCard
          key={selectedPolicy.id}
          policy={selectedPolicy}
          badge={selectedTab === "current" ? "현행" : "신규 기획"}
          onSaved={
            selectedTab === "current"
              ? setCurrent
              : (updated) => setProposals((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
          }
          onDelete={canEdit && selectedTab !== "current" ? () => handleDeleteProposal(selectedPolicy.id) : undefined}
          currentUserName={currentUserName}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

type PolicyCardProps = {
  policy: Policy;
  badge: "현행" | "신규 기획";
  onSaved: (policy: Policy) => void;
  onDelete?: () => void;
  currentUserName: string;
  canEdit: boolean;
};

function PolicyCard({ policy, badge, onSaved, onDelete, currentUserName, canEdit }: PolicyCardProps) {
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
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [draggingBadgeId, setDraggingBadgeId] = useState<string | null>(null);
  const [editingBadgeId, setEditingBadgeId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageBadgesRef = useRef(imageBadges);

  useEffect(() => {
    imageBadgesRef.current = imageBadges;
  }, [imageBadges]);

  const badgeStyle =
    badge === "현행" ? "bg-white text-ink-muted" : "bg-brand/10 text-brand";

  async function persist(
    changes: Partial<
      Pick<
        Policy,
        | "title"
        | "policy_note"
        | "ui_note"
        | "consideration_note"
        | "description_items"
        | "wireframe_url"
        | "image_badges"
      >
    >
  ) {
    const supabase = createClient();
    const stamp = { author_name: currentUserName, updated_at: new Date().toISOString() };

    if (!policy.id) {
      const { data, error: insertError } = await supabase
        .from("policies")
        .insert({
          item_type: policy.item_type,
          item_id: policy.item_id,
          kind: policy.kind,
          title,
          policy_note: policyNote,
          ui_note: uiNote,
          consideration_note: considerationNote,
          description_items: descriptionItems,
          image_badges: imageBadges,
          ...changes,
          ...stamp,
        })
        .select("*")
        .single();

      if (!insertError && data) {
        onSaved(data as Policy);
      }
      return;
    }

    const { data, error: updateError } = await supabase
      .from("policies")
      .update({ ...changes, ...stamp })
      .eq("id", policy.id)
      .select("*")
      .single();

    if (!updateError && data) {
      onSaved(data as Policy);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadFile(file);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (!canEdit) return;
    const file = Array.from(e.clipboardData.items)
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile();

    if (!file) return;
    e.preventDefault();
    void uploadFile(file);
  }

  async function uploadFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("이미지 크기는 5MB 이하여야 합니다.");
      return;
    }

    setError(null);
    setUploading(true);

    const supabase = createClient();

    // 새 정책 카드는 먼저 행을 만들어 id를 확보한다.
    let policyId = policy.id;
    if (!policyId) {
      const { data, error: insertError } = await supabase
        .from("policies")
        .insert({
          item_type: policy.item_type,
          item_id: policy.item_id,
          kind: policy.kind,
          title,
          policy_note: policyNote,
          ui_note: uiNote,
          consideration_note: considerationNote,
          description_items: descriptionItems,
          image_badges: imageBadges,
        })
        .select("*")
        .single();

      if (insertError || !data) {
        setError(insertError?.message ?? "저장에 실패했습니다.");
        setUploading(false);
        return;
      }
      policyId = (data as Policy).id;
      onSaved(data as Policy);
    }

    const ext = file.name.split(".").pop();
    const path = `${policy.item_type}/${policy.item_id}/${policyId}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from("wireframes").upload(path, file, {
      upsert: true,
    });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("wireframes").getPublicUrl(path);
    const wireframeUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    const { data: updated, error: updateError } = await supabase
      .from("policies")
      .update({ wireframe_url: wireframeUrl, author_name: currentUserName, updated_at: new Date().toISOString() })
      .eq("id", policyId)
      .select("*")
      .single();

    if (updateError) {
      setError(updateError.message);
    } else if (updated) {
      onSaved(updated as Policy);
    }

    setUploading(false);
  }

  async function handleRemoveWireframe() {
    setError(null);
    await persist({ wireframe_url: null });
  }

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    setShowImageMenu(false);
    if (!canEdit || !isPlacingBadge || !imageContainerRef.current) return;

    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const nextNumber = imageBadges.length
      ? Math.max(...imageBadges.map((b) => b.number)) + 1
      : 1;
    const next = [...imageBadges, { id: crypto.randomUUID(), number: nextNumber, x, y }];

    setImageBadges(next);
    setIsPlacingBadge(false);
    persist({ image_badges: next });
  }

  function removeImageBadge(id: string) {
    const next = imageBadges.filter((b) => b.id !== id);
    setImageBadges(next);
    persist({ image_badges: next });
  }

  function updateImageBadgeNumber(id: string, number: number) {
    const next = imageBadges.map((b) => (b.id === id ? { ...b, number } : b));
    setImageBadges(next);
    persist({ image_badges: next });
  }

  function handleBadgeMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    e.preventDefault();
    setDraggingBadgeId(id);
  }

  useEffect(() => {
    if (!draggingBadgeId) return;

    function handleMouseMove(e: MouseEvent) {
      if (!imageContainerRef.current) return;
      const rect = imageContainerRef.current.getBoundingClientRect();
      const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
      setImageBadges((prev) => prev.map((b) => (b.id === draggingBadgeId ? { ...b, x, y } : b)));
    }

    function handleMouseUp() {
      setDraggingBadgeId(null);
      persist({ image_badges: imageBadgesRef.current });
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingBadgeId]);

  function addDescriptionRow() {
    const next = [...descriptionItems, ""];
    setDescriptionItems(next);
    persist({ description_items: next });
  }

  function removeDescriptionRow(index: number) {
    const next = descriptionItems.filter((_, i) => i !== index);
    setDescriptionItems(next);
    persist({ description_items: next });
  }

  function updateDescriptionRow(index: number, value: string) {
    setDescriptionItems((prev) => prev.map((item, i) => (i === index ? value : item)));
  }

  function handleDescriptionBlur() {
    if (JSON.stringify(descriptionItems) !== JSON.stringify(policy.description_items)) {
      persist({ description_items: descriptionItems });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold tracking-wide ${badgeStyle}`}>
          {badge}
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-ink-muted">
          {VERSION_LABEL[policy.kind]}
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title !== policy.title) persist({ title });
          }}
          readOnly={!canEdit}
          placeholder="화면 제목을 입력하세요"
          className={`flex-1 rounded-xl px-3 py-2 text-lg font-bold text-ink outline-none transition-colors placeholder:font-normal placeholder:text-ink-muted ${canEdit ? "hover:bg-white focus:bg-white focus:ring-2 focus:ring-brand/20" : ""}`}
        />
        {(policy.author_name || formatDate(policy.updated_at)) && (
          <span className="text-xs text-ink-muted">
            {[policy.author_name, formatDate(policy.updated_at)].filter(Boolean).join(" · ")}
          </span>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="기획서 삭제"
            className="rounded-full p-2 text-ink-muted transition-colors hover:bg-red-50 hover:text-red-500"
          >
            🗑
          </button>
        )}
      </div>
      <div className="flex flex-col gap-4 rounded-3xl bg-surface p-5">
        <div className="flex gap-5">
          <div className="flex w-[55%] shrink-0 flex-col gap-3">
        {policy.wireframe_url ? (
          <div
            ref={imageContainerRef}
            tabIndex={0}
            onPaste={handlePaste}
            onClick={handleImageClick}
            className={`group relative overflow-hidden rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-brand/30 ${isPlacingBadge ? "cursor-crosshair" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={policy.wireframe_url} alt="와이어프레임" className="w-full object-contain" />

            {canEdit && (
              <div className="absolute right-2 top-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowImageMenu((v) => !v);
                  }}
                  aria-label="이미지 설정"
                  className={`flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-sm text-white backdrop-blur-sm transition-opacity hover:bg-black/65 ${showImageMenu ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                >
                  ⚙️
                </button>
                {showImageMenu && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-9 z-20 flex w-36 flex-col overflow-hidden rounded-xl bg-white py-1 text-sm font-bold shadow-lg"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowImageMenu(false);
                        inputRef.current?.click();
                      }}
                      disabled={uploading}
                      className="px-3 py-2 text-left text-ink transition-colors hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {uploading ? "업로드 중..." : "이미지 교체"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowImageMenu(false);
                        setIsPlacingBadge(true);
                      }}
                      className="px-3 py-2 text-left text-ink transition-colors hover:bg-zinc-50"
                    >
                      번호배지 추가
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowImageMenu(false);
                        handleRemoveWireframe();
                      }}
                      className="px-3 py-2 text-left text-red-500 transition-colors hover:bg-red-50"
                    >
                      이미지 삭제
                    </button>
                  </div>
                )}
              </div>
            )}

            {isPlacingBadge && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10 text-sm font-bold text-white">
                클릭해서 배지를 배치하세요
              </div>
            )}

            {imageBadges.map((b) => (
              <div
                key={b.id}
                onMouseDown={canEdit ? (e) => handleBadgeMouseDown(e, b.id) : undefined}
                onDoubleClick={
                  canEdit
                    ? (e) => {
                        e.stopPropagation();
                        setEditingBadgeId(b.id);
                      }
                    : undefined
                }
                style={{ left: `${b.x}%`, top: `${b.y}%` }}
                className={`group/badge absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 select-none items-center justify-center rounded-md bg-red-500 text-sm font-bold text-white shadow-md ${canEdit ? "cursor-move" : ""}`}
              >
                {editingBadgeId === b.id ? (
                  <input
                    type="number"
                    autoFocus
                    defaultValue={b.number}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      const num = Number(e.target.value);
                      updateImageBadgeNumber(b.id, Number.isFinite(num) && num > 0 ? num : b.number);
                      setEditingBadgeId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="h-full w-full rounded-md bg-red-500 text-center text-white outline-none"
                  />
                ) : (
                  b.number
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImageBadge(b.id);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] text-red-500 opacity-0 shadow transition-opacity group-hover/badge:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div
            tabIndex={canEdit ? 0 : -1}
            onPaste={handlePaste}
            onClick={canEdit ? () => inputRef.current?.click() : undefined}
            className={`flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-zinc-200 bg-white text-sm font-medium text-ink-muted outline-none transition-colors ${canEdit ? "cursor-pointer hover:border-brand/40 hover:bg-brand/5 focus:border-brand/40 focus:bg-brand/5 focus:ring-2 focus:ring-brand/20" : ""}`}
          >
            <span>{uploading ? "업로드 중..." : "와이어프레임 이미지가 없습니다."}</span>
            {canEdit && (
              <span className="text-xs text-ink-muted">클릭해서 업로드하거나 Ctrl+V로 캡쳐본을 붙여넣을 수 있어요.</span>
            )}
          </div>
        )}
        {canEdit && (
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <div className="flex flex-1 flex-col gap-3">
        <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto rounded-2xl bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-ink-muted">디스크립션</span>
            {canEdit && (
              <button
                type="button"
                onClick={addDescriptionRow}
                className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-ink-muted transition-colors hover:bg-zinc-200 hover:text-ink"
              >
                + 행 추가
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {descriptionItems.map((item, index) => (
              <div key={index} className="flex gap-2">
                <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-bold text-ink-muted">
                  {index + 1}
                </span>
                <textarea
                  value={item}
                  onChange={(e) => updateDescriptionRow(index, e.target.value)}
                  onBlur={handleDescriptionBlur}
                  readOnly={!canEdit}
                  placeholder="디스크립션을 입력하세요."
                  className="min-h-[60px] flex-1 resize-none rounded-xl bg-surface px-3 py-2 text-sm leading-relaxed text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20"
                />
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeDescriptionRow(index)}
                    className="self-start rounded-full px-2 py-1 text-xs font-bold text-ink-muted transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {canEdit && (!showPolicy || !showUiNote || !showConsideration) && (
          <div className="flex gap-2">
            {!showPolicy && (
              <button
                type="button"
                onClick={() => setShowPolicy(true)}
                className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-ink-muted transition-colors hover:bg-zinc-200 hover:text-ink"
              >
                + 정책
              </button>
            )}
            {!showUiNote && (
              <button
                type="button"
                onClick={() => setShowUiNote(true)}
                className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-ink-muted transition-colors hover:bg-zinc-200 hover:text-ink"
              >
                + UI 참고사항
              </button>
            )}
            {!showConsideration && (
              <button
                type="button"
                onClick={() => setShowConsideration(true)}
                className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-ink-muted transition-colors hover:bg-zinc-200 hover:text-ink"
              >
                + 고려사항
              </button>
            )}
          </div>
        )}

        {showPolicy && (
          <div className="rounded-2xl bg-red-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-red-500">정책</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowPolicy(false)}
                  className="rounded-full px-2 py-0.5 text-xs font-bold text-red-300 transition-colors hover:bg-red-100 hover:text-red-500"
                >
                  ✕
                </button>
              )}
            </div>
            <textarea
              value={policyNote}
              onChange={(e) => setPolicyNote(e.target.value)}
              onBlur={() => {
                if (policyNote !== policy.policy_note) persist({ policy_note: policyNote });
              }}
              readOnly={!canEdit}
              placeholder="정책을 입력하세요."
              className="min-h-[80px] w-full resize-none bg-transparent text-sm leading-relaxed text-red-600 outline-none placeholder:text-red-300"
            />
          </div>
        )}

        {showUiNote && (
          <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-amber-600">★ UI 참고사항</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowUiNote(false)}
                  className="rounded-full px-2 py-0.5 text-xs font-bold text-amber-400 transition-colors hover:bg-amber-100 hover:text-amber-600"
                >
                  ✕
                </button>
              )}
            </div>
            <textarea
              value={uiNote}
              onChange={(e) => setUiNote(e.target.value)}
              onBlur={() => {
                if (uiNote !== policy.ui_note) persist({ ui_note: uiNote });
              }}
              readOnly={!canEdit}
              placeholder="내용을 입력하세요."
              className="min-h-[80px] w-full resize-none bg-transparent text-sm leading-relaxed text-amber-800 outline-none placeholder:text-amber-300"
            />
          </div>
        )}

        {showConsideration && (
          <div className="rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-emerald-600">★ 고려사항</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowConsideration(false)}
                  className="rounded-full px-2 py-0.5 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-100 hover:text-emerald-600"
                >
                  ✕
                </button>
              )}
            </div>
            <textarea
              value={considerationNote}
              onChange={(e) => setConsiderationNote(e.target.value)}
              onBlur={() => {
                if (considerationNote !== policy.consideration_note) persist({ consideration_note: considerationNote });
              }}
              readOnly={!canEdit}
              placeholder="내용을 입력하세요."
              className="min-h-[80px] w-full resize-none bg-transparent text-sm leading-relaxed text-emerald-800 outline-none placeholder:text-emerald-300"
            />
          </div>
        )}
        </div>
        </div>
      </div>
    </div>
  );
}
