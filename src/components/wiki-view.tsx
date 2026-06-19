"use client";

import { useState, useEffect, useRef, useLayoutEffect } from "react";
import type { WikiMenu, WikiDoc, Block, BlockType } from "@/types/wiki";

// ── 슬래시 커맨드 목록 ────────────────────────────────────────────────────────

const SLASH_COMMANDS: { type: BlockType; icon: string; label: string; desc: string }[] = [
  { type: "paragraph", icon: "📝", label: "텍스트",        desc: "일반 텍스트 블록" },
  { type: "h1",        icon: "H1", label: "제목 1",        desc: "큰 섹션 제목" },
  { type: "h2",        icon: "H2", label: "제목 2",        desc: "중간 섹션 제목" },
  { type: "h3",        icon: "H3", label: "제목 3",        desc: "작은 섹션 제목" },
  { type: "bullet",    icon: "•",  label: "글머리 기호",    desc: "순서 없는 목록" },
  { type: "numbered",  icon: "1.", label: "번호 목록",      desc: "번호가 있는 목록" },
  { type: "quote",     icon: "❝",  label: "인용",           desc: "텍스트를 인용 블록으로" },
  { type: "callout",   icon: "💡", label: "콜아웃",         desc: "중요 내용 강조 박스" },
  { type: "divider",   icon: "—",  label: "구분선",         desc: "섹션을 나누는 선" },
];

const BLOCK_PLACEHOLDER: Record<BlockType, string> = {
  paragraph: "내용 입력 (/ 로 블록 유형 변경)",
  h1: "제목 1",
  h2: "제목 2",
  h3: "제목 3",
  bullet: "목록 항목",
  numbered: "목록 항목",
  quote: "인용구...",
  divider: "",
  callout: "중요 내용...",
};

const BLOCK_TEXT_CLS: Partial<Record<BlockType, string>> = {
  paragraph: "text-sm text-ink leading-[1.8]",
  h1:        "text-[1.75rem] font-bold text-ink leading-tight",
  h2:        "text-xl font-bold text-ink leading-snug",
  h3:        "text-base font-semibold text-ink leading-snug",
  bullet:    "text-sm text-ink leading-[1.8]",
  numbered:  "text-sm text-ink leading-[1.8]",
  quote:     "text-sm text-ink-muted italic leading-relaxed",
  callout:   "text-sm text-ink leading-[1.8]",
};

// ── WikiView ──────────────────────────────────────────────────────────────────

export function WikiView({
  canEdit,
  currentUserName,
}: {
  canEdit: boolean;
  currentUserName: string;
}) {
  // 메뉴 상태
  const [menus, setMenus] = useState<WikiMenu[]>([]);
  const [menusLoading, setMenusLoading] = useState(true);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);

  // 문서 상태
  const [doc, setDoc] = useState<WikiDoc | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const cleanSnap = useRef("");
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // 슬래시 커맨드 상태
  const [slashState, setSlashState] = useState<{ blockId: string; search: string } | null>(null);
  const blockRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // 메뉴 인라인 편집 상태
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null);
  const [addingTitle, setAddingTitle] = useState("");

  // ── 메뉴 로드 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/wiki-menus")
      .then(r => r.json())
      .then(d => { setMenus(d.menus ?? []); setMenusLoading(false); })
      .catch(() => setMenusLoading(false));
  }, []);

  // ── 문서 로드 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedMenuId) {
      setDoc(null); setTitle(""); setBlocks([]); setIsDirty(false);
      return;
    }
    setDocLoading(true);
    fetch(`/api/wiki-docs?menuId=${selectedMenuId}`)
      .then(r => r.json())
      .then(async d => {
        if (d.doc) {
          initDoc(d.doc);
        } else {
          const res = await fetch("/api/wiki-docs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ menuId: selectedMenuId, authorName: currentUserName }),
          });
          const nd = await res.json();
          if (nd.doc) initDoc(nd.doc);
        }
      })
      .finally(() => setDocLoading(false));
  }, [selectedMenuId, currentUserName]);

  function initDoc(d: WikiDoc) {
    setDoc(d);
    setTitle(d.title);
    const init: Block[] = d.blocks.length > 0
      ? d.blocks
      : [{ id: crypto.randomUUID(), type: "paragraph", content: "" }];
    setBlocks(init);
    cleanSnap.current = JSON.stringify({ t: d.title, b: init });
    setIsDirty(false);
  }

  useEffect(() => {
    if (!doc) return;
    setIsDirty(JSON.stringify({ t: title, b: blocks }) !== cleanSnap.current);
  }, [title, blocks, doc]);

  // ── 저장 ───────────────────────────────────────────────────────────────────
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleSave() {
    if (!doc || !isDirty || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/wiki-docs/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, blocks, authorName: currentUserName }),
      });
      if (!res.ok) throw new Error();
      const { doc: updated } = await res.json();
      if (updated) initDoc({ ...doc, ...updated });
      showToast("저장 완료 ✓");
    } catch {
      showToast("저장 실패");
    } finally {
      setSaving(false);
    }
  }

  // Ctrl+S 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // ── 메뉴 CRUD ──────────────────────────────────────────────────────────────
  async function addMenu(parentId: string | null, t: string) {
    if (!t.trim()) return;
    const siblings = menus.filter(m => m.parent_id === parentId);
    const maxOrder = siblings.reduce((m, c) => Math.max(m, c.sort_order), -1);
    const res = await fetch("/api/wiki-menus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t.trim(), parent_id: parentId, sort_order: maxOrder + 1 }),
    });
    const { menu } = await res.json();
    if (menu) { setMenus(prev => [...prev, menu]); setSelectedMenuId(menu.id); }
    setAddingChildOf(null); setAddingTitle("");
  }

  async function renameMenu(id: string, newTitle: string) {
    if (!newTitle.trim()) { setEditingMenuId(null); return; }
    const res = await fetch(`/api/wiki-menus/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    const { menu } = await res.json();
    if (menu) setMenus(prev => prev.map(m => m.id === id ? menu : m));
    setEditingMenuId(null);
  }

  async function deleteMenu(id: string) {
    if (!confirm("이 메뉴와 연결된 문서가 모두 삭제됩니다. 계속하시겠습니까?")) return;
    const res = await fetch(`/api/wiki-menus/${id}`, { method: "DELETE" });
    if (res.ok) {
      const childIds = new Set(menus.filter(m => m.parent_id === id).map(m => m.id));
      setMenus(prev => prev.filter(m => m.id !== id && !childIds.has(m.id)));
      if (selectedMenuId === id || childIds.has(selectedMenuId ?? "")) setSelectedMenuId(null);
    }
  }

  async function moveMenu(id: string, dir: "up" | "down") {
    const menu = menus.find(m => m.id === id);
    if (!menu) return;
    const siblings = menus
      .filter(m => m.parent_id === menu.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = siblings.findIndex(m => m.id === id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const swap = siblings[swapIdx];
    const pairs = [
      { id: menu.id, sort_order: swap.sort_order },
      { id: swap.id, sort_order: menu.sort_order },
    ];
    await Promise.all(pairs.map(p =>
      fetch(`/api/wiki-menus/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: p.sort_order }),
      })
    ));
    setMenus(prev => prev.map(m => {
      const found = pairs.find(p => p.id === m.id);
      return found ? { ...m, sort_order: found.sort_order } : m;
    }));
  }

  // ── 블록 편집 ──────────────────────────────────────────────────────────────
  function updateBlock(id: string, patch: Partial<Block>) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  }

  function insertBlock(afterId: string, type: BlockType = "paragraph") {
    setSlashState(null);
    const newBlock: Block = { id: crypto.randomUUID(), type, content: "" };
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === afterId);
      const next = [...prev];
      next.splice(idx < 0 ? next.length : idx + 1, 0, newBlock);
      return next;
    });
    setTimeout(() => blockRefs.current[newBlock.id]?.focus(), 10);
  }

  function deleteBlock(id: string) {
    setBlocks(prev => {
      if (prev.length <= 1) {
        const empty: Block = { id: crypto.randomUUID(), type: "paragraph", content: "" };
        setTimeout(() => blockRefs.current[empty.id]?.focus(), 10);
        return [empty];
      }
      const idx = prev.findIndex(b => b.id === id);
      const next = prev.filter(b => b.id !== id);
      const focusId = next[Math.max(0, idx - 1)]?.id;
      setTimeout(() => {
        const el = blockRefs.current[focusId ?? ""];
        if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
      }, 10);
      return next;
    });
  }

  function convertBlock(id: string, type: BlockType) {
    const content = blocks.find(b => b.id === id)?.content.replace(/^\/\S*/, "").trimStart() ?? "";
    updateBlock(id, { type, content });
    setSlashState(null);
    setTimeout(() => blockRefs.current[id]?.focus(), 10);
  }

  function handleBlockChange(block: Block, value: string) {
    if (value === "/" && block.content === "") {
      setSlashState({ blockId: block.id, search: "" });
    } else if (slashState?.blockId === block.id) {
      setSlashState(value.startsWith("/")
        ? { blockId: block.id, search: value.slice(1).toLowerCase() }
        : null
      );
    }
    updateBlock(block.id, { content: value });
  }

  function handleBlockKeyDown(block: Block, e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const continueTypes: BlockType[] = ["bullet", "numbered"];
      const nextType = continueTypes.includes(block.type) ? block.type : "paragraph";
      // 빈 bullet/numbered에서 Enter → paragraph로 변환
      if (continueTypes.includes(block.type) && block.content === "") {
        convertBlock(block.id, "paragraph");
      } else {
        insertBlock(block.id, nextType);
      }
    } else if (e.key === "Backspace" && block.content === "") {
      e.preventDefault();
      if (block.type !== "paragraph") {
        convertBlock(block.id, "paragraph");
      } else {
        deleteBlock(block.id);
      }
    } else if (e.key === "Escape") {
      setSlashState(null);
    } else if (e.key === "ArrowUp" && !slashState) {
      const prevId = blocks[idx - 1]?.id;
      if (prevId) { e.preventDefault(); blockRefs.current[prevId]?.focus(); }
    } else if (e.key === "ArrowDown" && !slashState) {
      const nextId = blocks[idx + 1]?.id;
      if (nextId) { e.preventDefault(); blockRefs.current[nextId]?.focus(); }
    }
  }

  // ── 렌더 ───────────────────────────────────────────────────────────────────

  const rootMenus = menus.filter(m => !m.parent_id).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="flex flex-1 gap-3 overflow-hidden">

      {/* ── 위키 LNB ── */}
      <aside className="flex w-56 shrink-0 flex-col overflow-y-auto rounded-3xl bg-white px-3 py-5">
        <div className="mb-3 flex items-center justify-between px-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">위키</span>
          {canEdit && (
            <button
              onClick={() => { setAddingChildOf("__root__"); setAddingTitle(""); }}
              className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-brand transition-colors"
              title="새 최상위 문서 추가"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          )}
        </div>

        {menusLoading ? (
          <p className="px-2 text-xs text-zinc-400">불러오는 중...</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {rootMenus.map((menu, ri) => {
              const children = menus
                .filter(m => m.parent_id === menu.id)
                .sort((a, b) => a.sort_order - b.sort_order);
              const isSel = selectedMenuId === menu.id;
              const isEdit = editingMenuId === menu.id;

              return (
                <li key={menu.id}>
                  {/* 부모 메뉴 행 */}
                  <div className={`group flex items-center gap-1 rounded-2xl px-2.5 py-2 transition-colors ${isSel ? "bg-brand/10 text-brand" : "hover:bg-zinc-50"}`}>
                    {isEdit ? (
                      <input
                        autoFocus
                        value={editingTitle}
                        onChange={e => setEditingTitle(e.target.value)}
                        onBlur={() => renameMenu(menu.id, editingTitle)}
                        onKeyDown={e => {
                          if (e.key === "Enter") renameMenu(menu.id, editingTitle);
                          if (e.key === "Escape") setEditingMenuId(null);
                        }}
                        className="flex-1 bg-transparent text-sm outline-none"
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <button
                        onClick={() => setSelectedMenuId(menu.id)}
                        className="flex-1 text-left text-sm font-medium truncate"
                      >
                        {menu.icon && <span className="mr-1.5">{menu.icon}</span>}
                        {menu.title}
                      </button>
                    )}
                    {canEdit && !isEdit && (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button onClick={() => moveMenu(menu.id, "up")} disabled={ri === 0} className="px-0.5 text-[11px] text-zinc-300 hover:text-zinc-600 disabled:opacity-20">↑</button>
                        <button onClick={() => moveMenu(menu.id, "down")} disabled={ri === rootMenus.length - 1} className="px-0.5 text-[11px] text-zinc-300 hover:text-zinc-600 disabled:opacity-20">↓</button>
                        <button onClick={() => { setEditingMenuId(menu.id); setEditingTitle(menu.title); }} className="px-0.5 text-[11px] text-zinc-300 hover:text-zinc-600">✎</button>
                        <button onClick={() => deleteMenu(menu.id)} className="px-0.5 text-[11px] text-zinc-300 hover:text-red-400">✕</button>
                      </div>
                    )}
                  </div>

                  {/* 하위 메뉴 */}
                  {(children.length > 0 || addingChildOf === menu.id) && (
                    <ul className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-zinc-100 pl-2">
                      {children.map((child, ci) => {
                        const isChildSel = selectedMenuId === child.id;
                        const isChildEdit = editingMenuId === child.id;
                        return (
                          <li key={child.id}>
                            <div className={`group flex items-center gap-1 rounded-xl px-2.5 py-1.5 transition-colors ${isChildSel ? "bg-brand/10 text-brand" : "hover:bg-zinc-50"}`}>
                              {isChildEdit ? (
                                <input
                                  autoFocus
                                  value={editingTitle}
                                  onChange={e => setEditingTitle(e.target.value)}
                                  onBlur={() => renameMenu(child.id, editingTitle)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") renameMenu(child.id, editingTitle);
                                    if (e.key === "Escape") setEditingMenuId(null);
                                  }}
                                  className="flex-1 bg-transparent text-sm outline-none"
                                  onClick={e => e.stopPropagation()}
                                />
                              ) : (
                                <button
                                  onClick={() => setSelectedMenuId(child.id)}
                                  className="flex-1 text-left text-sm text-ink-muted truncate"
                                >
                                  {child.title}
                                </button>
                              )}
                              {canEdit && !isChildEdit && (
                                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                  <button onClick={() => moveMenu(child.id, "up")} disabled={ci === 0} className="px-0.5 text-[11px] text-zinc-300 hover:text-zinc-600 disabled:opacity-20">↑</button>
                                  <button onClick={() => moveMenu(child.id, "down")} disabled={ci === children.length - 1} className="px-0.5 text-[11px] text-zinc-300 hover:text-zinc-600 disabled:opacity-20">↓</button>
                                  <button onClick={() => { setEditingMenuId(child.id); setEditingTitle(child.title); }} className="px-0.5 text-[11px] text-zinc-300 hover:text-zinc-600">✎</button>
                                  <button onClick={() => deleteMenu(child.id)} className="px-0.5 text-[11px] text-zinc-300 hover:text-red-400">✕</button>
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                      {canEdit && addingChildOf === menu.id && (
                        <li>
                          <input
                            autoFocus
                            value={addingTitle}
                            onChange={e => setAddingTitle(e.target.value)}
                            onBlur={() => { if (addingTitle.trim()) addMenu(menu.id, addingTitle); else { setAddingChildOf(null); setAddingTitle(""); } }}
                            onKeyDown={e => {
                              if (e.key === "Enter") addMenu(menu.id, addingTitle);
                              if (e.key === "Escape") { setAddingChildOf(null); setAddingTitle(""); }
                            }}
                            placeholder="하위 문서 제목..."
                            className="w-full rounded-xl border border-brand/30 bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-brand/20"
                          />
                        </li>
                      )}
                      {canEdit && addingChildOf !== menu.id && (
                        <li>
                          <button
                            onClick={() => { setAddingChildOf(menu.id); setAddingTitle(""); }}
                            className="w-full rounded-xl px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-50 hover:text-brand transition-colors"
                          >
                            ＋ 하위 문서
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                  {/* 하위 없는 메뉴의 "하위 추가" 버튼 */}
                  {children.length === 0 && addingChildOf !== menu.id && canEdit && (
                    <button
                      onClick={() => { setAddingChildOf(menu.id); setAddingTitle(""); }}
                      className="ml-5 mt-0.5 block rounded-xl px-2.5 py-1 text-left text-xs text-zinc-300 hover:bg-zinc-50 hover:text-brand transition-colors"
                    >
                      ＋ 하위 문서
                    </button>
                  )}
                </li>
              );
            })}

            {/* 최상위 문서 추가 인풋 */}
            {canEdit && addingChildOf === "__root__" && (
              <li>
                <input
                  autoFocus
                  value={addingTitle}
                  onChange={e => setAddingTitle(e.target.value)}
                  onBlur={() => { if (addingTitle.trim()) addMenu(null, addingTitle); else { setAddingChildOf(null); setAddingTitle(""); } }}
                  onKeyDown={e => {
                    if (e.key === "Enter") addMenu(null, addingTitle);
                    if (e.key === "Escape") { setAddingChildOf(null); setAddingTitle(""); }
                  }}
                  placeholder="새 문서 제목..."
                  className="w-full rounded-2xl border border-brand/30 bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-brand/20"
                />
              </li>
            )}
          </ul>
        )}
      </aside>

      {/* ── 에디터 영역 ── */}
      {selectedMenuId ? (
        <main className="relative flex-1 overflow-y-auto rounded-3xl bg-white">
          {docLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">불러오는 중...</div>
          ) : doc ? (
            <div className="mx-auto max-w-3xl px-12 py-10">

              {/* 문서 메타 헤더 */}
              <div className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-100 pb-4 text-xs text-zinc-400">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-bold text-zinc-500">
                  v{doc.version_major}.{doc.version_minor}
                </span>
                {doc.updated_at && (
                  <>
                    <span>·</span>
                    <span>
                      최종 수정: {new Date(doc.updated_at).toLocaleDateString("ko-KR", {
                        year: "numeric", month: "2-digit", day: "2-digit",
                      })}
                    </span>
                  </>
                )}
                {doc.author_name && (
                  <>
                    <span>·</span>
                    <span>작성자: {doc.author_name}</span>
                  </>
                )}
                <div className="ml-auto">
                  {canEdit && (
                    <button
                      onClick={handleSave}
                      disabled={!isDirty || saving}
                      className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors disabled:opacity-40 ${
                        isDirty ? "bg-brand text-white hover:bg-brand/90" : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {saving ? "저장 중..." : isDirty ? "💾 저장" : "✓ 저장됨"}
                    </button>
                  )}
                </div>
              </div>

              {/* 문서 제목 */}
              <TitleTextarea
                value={title}
                readOnly={!canEdit}
                onChange={setTitle}
              />

              {/* 블록 목록 */}
              <div className="mt-6 flex flex-col gap-0.5">
                {blocks.map((block, bi) => {
                  // 번호 목록 순번 계산
                  let numberedIdx = 0;
                  if (block.type === "numbered") {
                    for (let i = bi; i >= 0; i--) {
                      if (blocks[i].type === "numbered") numberedIdx++;
                      else break;
                    }
                  }

                  // 슬래시 필터
                  const slashCmds = slashState?.blockId === block.id
                    ? SLASH_COMMANDS.filter(c =>
                        !slashState.search ||
                        c.label.toLowerCase().includes(slashState.search) ||
                        c.desc.toLowerCase().includes(slashState.search)
                      )
                    : [];

                  if (block.type === "divider") {
                    return (
                      <div key={block.id} className="group relative py-3">
                        <hr className="border-zinc-200" />
                        {canEdit && (
                          <button
                            onClick={() => deleteBlock(block.id)}
                            className="absolute right-0 top-1/2 -translate-y-1/2 rounded text-[10px] text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div key={block.id} className="group relative flex items-start gap-1.5">
                      {/* 드래그 핸들 */}
                      {canEdit && (
                        <span className="mt-1.5 shrink-0 cursor-grab select-none text-[13px] text-zinc-200 opacity-0 transition-opacity group-hover:opacity-100 hover:text-zinc-400">
                          ⠿
                        </span>
                      )}

                      {/* 불릿/번호 prefix */}
                      {block.type === "bullet" && (
                        <span className="mt-1 shrink-0 select-none text-sm leading-[1.8] text-zinc-400">•</span>
                      )}
                      {block.type === "numbered" && (
                        <span className="mt-1 w-5 shrink-0 select-none text-right text-sm leading-[1.8] text-zinc-400">{numberedIdx}.</span>
                      )}
                      {block.type === "quote" && (
                        <div className="mt-1 w-0.5 self-stretch shrink-0 rounded-full bg-zinc-300" />
                      )}

                      {/* 블록 컨텐츠 */}
                      <div className={`relative min-w-0 flex-1 ${block.type === "callout" ? "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" : ""}`}>
                        {block.type === "callout" && <span className="mr-2 select-none">💡</span>}
                        <BlockTextarea
                          block={block}
                          blockIndex={bi}
                          canEdit={canEdit}
                          blockRefs={blockRefs}
                          onChange={v => handleBlockChange(block, v)}
                          onKeyDown={e => handleBlockKeyDown(block, e, bi)}
                        />

                        {/* 슬래시 커맨드 드롭다운 */}
                        {slashCmds.length > 0 && (
                          <SlashMenu
                            commands={slashCmds}
                            onSelect={type => convertBlock(block.id, type)}
                            onClose={() => setSlashState(null)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* 블록 추가 */}
                {canEdit && (
                  <button
                    onClick={() => insertBlock(blocks[blocks.length - 1]?.id ?? "", "paragraph")}
                    className="mt-2 text-left text-sm text-zinc-300 transition-colors hover:text-zinc-500"
                  >
                    + 블록 추가
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {/* 토스트 */}
          {toast && (
            <div className="pointer-events-none fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900/90 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
              {toast}
            </div>
          )}
        </main>
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center rounded-3xl bg-white text-center">
          <span className="text-5xl">📄</span>
          <p className="mt-3 text-sm text-zinc-400">
            좌측에서 문서를 선택하거나
            <br />
            {canEdit && "＋ 버튼으로 새 문서를 추가하세요."}
          </p>
        </main>
      )}
    </div>
  );
}

// ── TitleTextarea ─────────────────────────────────────────────────────────────

function TitleTextarea({
  value, readOnly, onChange,
}: {
  value: string; readOnly: boolean; onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = ref.current.scrollHeight + "px";
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      readOnly={readOnly}
      onChange={e => onChange(e.target.value)}
      placeholder="제목 없음"
      rows={1}
      className="w-full resize-none bg-transparent text-[2.25rem] font-bold leading-tight text-ink outline-none placeholder:text-zinc-300"
      style={{ overflow: "hidden" }}
    />
  );
}

// ── BlockTextarea ─────────────────────────────────────────────────────────────

function BlockTextarea({
  block, blockIndex: _bi, canEdit, blockRefs, onChange, onKeyDown,
}: {
  block: Block;
  blockIndex: number;
  canEdit: boolean;
  blockRefs: React.MutableRefObject<Record<string, HTMLTextAreaElement | null>>;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    blockRefs.current[block.id] = ref.current;
    return () => { delete blockRefs.current[block.id]; };
  }, [block.id, blockRefs]);

  useLayoutEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = ref.current.scrollHeight + "px";
  }, [block.content]);

  const cls = BLOCK_TEXT_CLS[block.type] ?? BLOCK_TEXT_CLS.paragraph!;

  return (
    <textarea
      ref={ref}
      value={block.content}
      readOnly={!canEdit}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={BLOCK_PLACEHOLDER[block.type]}
      rows={1}
      className={`w-full resize-none bg-transparent outline-none placeholder:text-zinc-300 ${cls}`}
      style={{ overflow: "hidden" }}
    />
  );
}

// ── SlashMenu ─────────────────────────────────────────────────────────────────

function SlashMenu({
  commands, onSelect, onClose,
}: {
  commands: typeof SLASH_COMMANDS;
  onSelect: (type: BlockType) => void;
  onClose: () => void;
}) {
  const [focusIdx, setFocusIdx] = useState(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx(i => (i + 1) % commands.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx(i => (i - 1 + commands.length) % commands.length); }
      else if (e.key === "Enter") { e.preventDefault(); if (commands[focusIdx]) onSelect(commands[focusIdx].type); }
      else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [commands, focusIdx, onSelect, onClose]);

  if (commands.length === 0) return null;

  return (
    <div className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-2xl border border-zinc-100 bg-white py-1 shadow-xl">
      {commands.map((cmd, i) => (
        <button
          key={cmd.type}
          onMouseDown={e => { e.preventDefault(); onSelect(cmd.type); }}
          className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
            i === focusIdx ? "bg-brand/8 text-brand" : "hover:bg-zinc-50"
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-sm font-bold text-ink">
            {cmd.icon}
          </span>
          <div>
            <div className="font-medium text-ink">{cmd.label}</div>
            <div className="text-xs text-zinc-400">{cmd.desc}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
