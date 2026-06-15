"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ItemType = "category" | "feature";

type Policy = {
  id: string;
  item_type: ItemType;
  item_id: string;
  kind: "current" | "proposal";
  title: string;
  content: string;
  wireframe_url: string | null;
  sort_order: number;
  author_name: string | null;
  updated_at: string | null;
};

type FeatureDetailProps = {
  itemType: ItemType;
  itemId: string;
  currentUserName: string;
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
    content: "",
    wireframe_url: null,
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

export function FeatureDetail({ itemType, itemId, currentUserName }: FeatureDetailProps) {
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
        <button
          type="button"
          onClick={handleAddProposal}
          className="rounded-full px-4 py-2 text-sm font-bold text-ink-muted transition-colors hover:text-brand"
        >
          + 추가
        </button>
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
          onDelete={selectedTab !== "current" ? () => handleDeleteProposal(selectedPolicy.id) : undefined}
          currentUserName={currentUserName}
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
};

function PolicyCard({ policy, badge, onSaved, onDelete, currentUserName }: PolicyCardProps) {
  const [title, setTitle] = useState(policy.title);
  const [content, setContent] = useState(policy.content);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const badgeStyle =
    badge === "현행" ? "bg-white text-ink-muted" : "bg-brand/10 text-brand";

  async function persist(changes: Partial<Pick<Policy, "title" | "content" | "wireframe_url">>) {
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
          content,
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
          content,
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

  return (
    <div className="flex gap-5 rounded-3xl bg-surface p-5">
      <div className="flex w-[55%] shrink-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold tracking-wide ${badgeStyle}`}>
            {badge}
          </span>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-ink-muted">
            {VERSION_LABEL[policy.kind]}
          </span>
          {(policy.author_name || formatDate(policy.updated_at)) && (
            <span className="text-xs text-ink-muted">
              {[policy.author_name, formatDate(policy.updated_at)].filter(Boolean).join(" · ")}
            </span>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="ml-auto rounded-full px-2.5 py-1 text-xs font-bold text-ink-muted transition-colors hover:bg-red-50 hover:text-red-500"
            >
              삭제
            </button>
          )}
        </div>
        {policy.wireframe_url ? (
          <div
            tabIndex={0}
            onPaste={handlePaste}
            className="group relative overflow-hidden rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-brand/30"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={policy.wireframe_url} alt="와이어프레임" className="w-full object-contain" />
            <button
              type="button"
              onClick={handleRemoveWireframe}
              className="absolute right-2 top-2 rounded-full bg-black/45 px-2.5 py-1 text-xs font-bold text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/65 group-hover:opacity-100"
            >
              이미지 삭제
            </button>
          </div>
        ) : (
          <div
            tabIndex={0}
            onPaste={handlePaste}
            onClick={() => inputRef.current?.click()}
            className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-zinc-200 bg-white text-sm font-medium text-ink-muted outline-none transition-colors hover:border-brand/40 hover:bg-brand/5 focus:border-brand/40 focus:bg-brand/5 focus:ring-2 focus:ring-brand/20"
          >
            <span>{uploading ? "업로드 중..." : "와이어프레임 이미지가 없습니다."}</span>
            <span className="text-xs text-ink-muted">클릭해서 업로드하거나 Ctrl+V로 캡쳐본을 붙여넣을 수 있어요.</span>
          </div>
        )}
        {policy.wireframe_url && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="self-start rounded-full bg-white px-4 py-2 text-xs font-bold text-ink shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-50"
          >
            {uploading ? "업로드 중..." : "이미지 교체"}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <div className="flex flex-1 flex-col gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title !== policy.title) persist({ title });
          }}
          placeholder="화면 제목을 입력하세요"
          className="rounded-xl px-3 py-2 text-lg font-bold text-ink outline-none transition-colors hover:bg-white focus:bg-white focus:ring-2 focus:ring-brand/20 placeholder:font-normal placeholder:text-ink-muted"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={() => {
            if (content !== policy.content) persist({ content });
          }}
          placeholder="정책 및 디스크립션을 입력하세요."
          className="min-h-[240px] flex-1 resize-none rounded-2xl bg-white px-3.5 py-2.5 text-sm leading-relaxed text-ink outline-none transition-colors focus:ring-2 focus:ring-brand/20"
        />
      </div>
    </div>
  );
}
