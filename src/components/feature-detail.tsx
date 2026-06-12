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
};

type FeatureDetailProps = {
  itemType: ItemType;
  itemId: string;
};

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

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
  };
}

export function FeatureDetail({ itemType, itemId }: FeatureDetailProps) {
  const [current, setCurrent] = useState<Policy | null>(null);
  const [proposals, setProposals] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

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
      .insert({ item_type: itemType, item_id: itemId, kind: "proposal" })
      .select("*")
      .single();

    if (!error && data) {
      setProposals((prev) => [...prev, data as Policy]);
    }
  }

  async function handleDeleteProposal(id: string) {
    const supabase = createClient();
    await supabase.from("policies").delete().eq("id", id);
    setProposals((prev) => prev.filter((p) => p.id !== id));
  }

  if (loading || !current) {
    return <p className="mt-4 text-sm text-zinc-400">불러오는 중...</p>;
  }

  return (
    <div className="mt-4 flex flex-col gap-6">
      <PolicyCard policy={current} badge="현재" onSaved={setCurrent} />

      {proposals.map((proposal) => (
        <PolicyCard
          key={proposal.id}
          policy={proposal}
          badge="신규 기획"
          onSaved={(updated) =>
            setProposals((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
          }
          onDelete={() => handleDeleteProposal(proposal.id)}
        />
      ))}

      <button
        type="button"
        onClick={handleAddProposal}
        className="self-start rounded-lg border border-dashed border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
      >
        + 신규 기획 추가
      </button>
    </div>
  );
}

type PolicyCardProps = {
  policy: Policy;
  badge: "현재" | "신규 기획";
  onSaved: (policy: Policy) => void;
  onDelete?: () => void;
};

function PolicyCard({ policy, badge, onSaved, onDelete }: PolicyCardProps) {
  const [title, setTitle] = useState(policy.title);
  const [content, setContent] = useState(policy.content);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const badgeStyle =
    badge === "현재" ? "bg-zinc-100 text-zinc-600" : "bg-amber-50 text-amber-600";

  async function persist(changes: Partial<Pick<Policy, "title" | "content" | "wireframe_url">>) {
    const supabase = createClient();

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
      .update(changes)
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
      .update({ wireframe_url: wireframeUrl })
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

  return (
    <div className="flex gap-4 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex w-[55%] shrink-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${badgeStyle}`}>{badge}</span>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="ml-auto text-xs text-zinc-400 hover:text-red-500"
            >
              삭제
            </button>
          )}
        </div>
        {policy.wireframe_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={policy.wireframe_url}
            alt="와이어프레임"
            className="rounded-lg border border-zinc-200 object-contain"
          />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-zinc-300 text-sm text-zinc-400">
            와이어프레임 이미지가 없습니다.
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="self-start rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
        >
          {uploading ? "업로드 중..." : "이미지 업로드"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title !== policy.title) persist({ title });
          }}
          placeholder="화면 제목"
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium outline-none focus:border-zinc-400"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={() => {
            if (content !== policy.content) persist({ content });
          }}
          placeholder="정책 및 디스크립션을 입력하세요."
          className="min-h-[240px] flex-1 resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-zinc-400"
        />
      </div>
    </div>
  );
}
