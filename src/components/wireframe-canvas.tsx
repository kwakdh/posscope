"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WireframeItem, FlowStep, BadgeMark } from "@/types/policy";

const BADGE_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];
const badgeColor = (n: number) => BADGE_COLORS[(n - 1) % BADGE_COLORS.length];

type ArrowPath = { id: string; d: string; label: string; mx: number; my: number };

type Props = {
  wireframes: WireframeItem[];
  flowSteps: FlowStep[];
  onWireframesChange: (wfs: WireframeItem[]) => void;
  onFlowStepsChange: (steps: FlowStep[]) => void;
  onUpload: (wireframeId: string, file: File) => Promise<void>;
  hoveredBadgeNumber?: number | null;
  onBadgeHover?: (n: number | null) => void;
  canEdit: boolean;
};

export function WireframeCanvas({
  wireframes, flowSteps,
  onWireframesChange, onFlowStepsChange,
  onUpload, hoveredBadgeNumber, onBadgeHover, canEdit,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [arrowPaths, setArrowPaths] = useState<ArrowPath[]>([]);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [pinModeId, setPinModeId] = useState<string | null>(null);
  const [drawModeId, setDrawModeId] = useState<string | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [draggingBadge, setDraggingBadge] = useState<{ wfId: string; badgeId: string } | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);

  const mainWfs = wireframes.filter(w => !w.isModal);
  const modals = wireframes.filter(w => w.isModal);

  // ── Arrow SVG calculation ──────────────────────────────
  const calcArrows = () => {
    if (!innerRef.current) return;
    const cr = innerRef.current.getBoundingClientRect();
    const paths = flowSteps.map(step => {
      const fe = cardRefs.current.get(step.from);
      const te = cardRefs.current.get(step.to);
      if (!fe || !te) return null;
      const fr = fe.getBoundingClientRect();
      const tr = te.getBoundingClientRect();
      const x1 = fr.right - cr.left, y1 = fr.top + fr.height / 2 - cr.top;
      const x2 = tr.left - cr.left, y2 = tr.top + tr.height / 2 - cr.top;
      const cx = (x1 + x2) / 2;
      return {
        id: step.id,
        d: `M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`,
        label: step.label,
        mx: cx, my: (y1 + y2) / 2,
      };
    }).filter(Boolean) as ArrowPath[];
    setArrowPaths(paths);
  };

  useLayoutEffect(() => { calcArrows(); }, [wireframes, flowSteps]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", calcArrows);
    return () => el.removeEventListener("scroll", calcArrows);
  }, [flowSteps, wireframes]);

  // ── Helpers ──────────────────────────────────────────
  function updateWf(id: string, patch: Partial<WireframeItem>) {
    onWireframesChange(wireframes.map(w => w.id === id ? { ...w, ...patch } : w));
  }

  function deleteWf(id: string) {
    onWireframesChange(wireframes.filter(w => w.id !== id));
    onFlowStepsChange(flowSteps.filter(s => s.from !== id && s.to !== id));
  }

  function addWireframe() {
    onWireframesChange([...wireframes, {
      id: crypto.randomUUID(), url: null, name: `화면 ${mainWfs.length + 1}`,
      badges: [], isModal: false, modalFor: null, order: wireframes.length,
    }]);
  }

  function confirmConnect(toId: string) {
    if (!connectingFrom || connectingFrom === toId) { setConnectingFrom(null); return; }
    if (!flowSteps.some(s => s.from === connectingFrom && s.to === toId)) {
      onFlowStepsChange([...flowSteps, {
        id: crypto.randomUUID(), from: connectingFrom, to: toId,
        label: `Step ${flowSteps.length + 1}`,
      }]);
    }
    setConnectingFrom(null);
  }

  function getRelPos(el: HTMLElement, e: MouseEvent | React.MouseEvent): { x: number; y: number } {
    const r = el.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  }

  // ── Badge drag ────────────────────────────────────────
  useEffect(() => {
    if (!draggingBadge) return;
    const { wfId, badgeId } = draggingBadge;
    const el = cardRefs.current.get(wfId);
    if (!el) return;

    function move(e: MouseEvent) {
      const pos = getRelPos(el!, e);
      const wf = wireframes.find(w => w.id === wfId);
      if (!wf) return;
      updateWf(wfId, { badges: wf.badges.map(b => b.id === badgeId ? { ...b, ...pos } : b) });
    }
    function up() { setDraggingBadge(null); }
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
  }, [draggingBadge, wireframes]);

  // ── Bounding box draw ─────────────────────────────────
  useEffect(() => {
    if (!drawModeId) return;
    const el = cardRefs.current.get(drawModeId);
    if (!el) return;

    function move(e: MouseEvent) {
      if (!drawStart.current) return;
      const pos = getRelPos(el!, e);
      const { x: sx, y: sy } = drawStart.current;
      setDrawRect({ x: Math.min(sx, pos.x), y: Math.min(sy, pos.y), w: Math.abs(pos.x - sx), h: Math.abs(pos.y - sy) });
    }
    function up(e: MouseEvent) {
      const start = drawStart.current;
      drawStart.current = null;
      if (start) {
        const pos = getRelPos(el!, e);
        const x = Math.min(start.x, pos.x), y = Math.min(start.y, pos.y);
        const w = Math.abs(pos.x - start.x), h = Math.abs(pos.y - start.y);
        if (w > 2 && h > 2) {
          const wfId = drawModeId!;
          const wf = wireframes.find(wf => wf.id === wfId);
          if (wf) {
            const nextNum = wf.badges.length ? Math.max(...wf.badges.map(b => b.number)) + 1 : 1;
            updateWf(wfId, { badges: [...wf.badges, { id: crypto.randomUUID(), number: nextNum, x, y, w, h }] });
          }
        }
      }
      setDrawRect(null);
      setDrawModeId(null);
    }
    function esc(e: KeyboardEvent) { if (e.key === "Escape") { drawStart.current = null; setDrawRect(null); setDrawModeId(null); } }
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.removeEventListener("keydown", esc); };
  }, [drawModeId, wireframes]);

  // ── Image card ────────────────────────────────────────
  function WireframeCard({ wf }: { wf: WireframeItem }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const isConnectTarget = !!connectingFrom && connectingFrom !== wf.id;
    const isPinMode = pinModeId === wf.id;
    const isDrawMode = drawModeId === wf.id;

    function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
      setMenuOpen(false);
      if (connectingFrom) { confirmConnect(wf.id); return; }
      if (isPinMode) {
        const pos = getRelPos(e.currentTarget, e);
        const nextNum = wf.badges.length ? Math.max(...wf.badges.map(b => b.number)) + 1 : 1;
        updateWf(wf.id, { badges: [...wf.badges, { id: crypto.randomUUID(), number: nextNum, ...pos }] });
        setPinModeId(null);
      }
    }

    function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
      if (isDrawMode) {
        e.preventDefault();
        drawStart.current = getRelPos(e.currentTarget, e);
      }
    }

    function handlePaste(e: React.ClipboardEvent) {
      const file = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"))?.getAsFile();
      if (!file) return;
      e.preventDefault();
      onUpload(wf.id, file);
    }

    return (
      <div className="flex shrink-0 flex-col gap-2" style={{ width: 272 }}>
        {/* 이미지 영역 */}
        <div
          ref={el => { if (el) cardRefs.current.set(wf.id, el); else cardRefs.current.delete(wf.id); }}
          tabIndex={canEdit ? 0 : -1}
          onPaste={handlePaste}
          onClick={handleImageClick}
          onMouseDown={handleMouseDown}
          className={[
            "group relative overflow-hidden rounded-2xl bg-white shadow-sm outline-none transition-all",
            isConnectTarget && "ring-2 ring-brand cursor-pointer",
            isPinMode && "cursor-crosshair",
            isDrawMode && "cursor-crosshair select-none",
          ].filter(Boolean).join(" ")}
        >
          {wf.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wf.url} alt={wf.name} className="w-full object-contain" draggable={false} />
          ) : (
            <div
              onClick={canEdit ? () => fileRef.current?.click() : undefined}
              className={`flex aspect-[9/16] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 text-sm text-zinc-400 ${canEdit ? "cursor-pointer hover:border-brand/40 hover:bg-brand/5" : ""}`}
            >
              <span className="text-2xl">🖼️</span>
              <span className="font-medium">{wf.name}</span>
              {canEdit && <span className="text-xs">클릭 또는 Ctrl+V</span>}
            </div>
          )}

          {/* 배지 */}
          {wf.badges.map(b =>
            b.w !== undefined && b.h !== undefined ? (
              <div key={b.id}
                style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`, borderColor: badgeColor(b.number), backgroundColor: hoveredBadgeNumber === b.number ? badgeColor(b.number) + "18" : undefined }}
                onMouseEnter={() => onBadgeHover?.(b.number)} onMouseLeave={() => onBadgeHover?.(null)}
                className="absolute border-2 border-dashed transition-colors">
                <span style={{ backgroundColor: badgeColor(b.number) }} className="absolute -left-px -top-px px-1 py-0.5 text-[10px] font-bold text-white">{b.number}</span>
                {canEdit && (
                  <button type="button" onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); updateWf(wf.id, { badges: wf.badges.filter(x => x.id !== b.id) }); }}
                    style={{ color: badgeColor(b.number) }} className="absolute -right-2 -top-2 hidden h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] shadow group-hover:flex">✕</button>
                )}
              </div>
            ) : (
              <div key={b.id}
                onMouseDown={canEdit ? e => { e.stopPropagation(); setDraggingBadge({ wfId: wf.id, badgeId: b.id }); } : undefined}
                onMouseEnter={() => onBadgeHover?.(b.number)} onMouseLeave={() => onBadgeHover?.(null)}
                style={{ left: `${b.x}%`, top: `${b.y}%`, backgroundColor: badgeColor(b.number) }}
                className={`group/badge absolute -translate-x-1/2 -translate-y-1/2 flex h-7 w-7 select-none items-center justify-center rounded-md text-sm font-bold text-white shadow-md ${canEdit ? "cursor-move" : ""}`}>
                {b.number}
                {canEdit && (
                  <button type="button" onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); updateWf(wf.id, { badges: wf.badges.filter(x => x.id !== b.id) }); }}
                    className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] text-red-500 shadow group-hover/badge:flex">✕</button>
                )}
              </div>
            )
          )}

          {/* 드로우 임시 박스 */}
          {isDrawMode && drawRect && (
            <div className="pointer-events-none absolute z-20 border-2 border-dashed border-brand bg-brand/10"
              style={{ left: `${drawRect.x}%`, top: `${drawRect.y}%`, width: `${drawRect.w}%`, height: `${drawRect.h}%` }} />
          )}

          {/* 컨트롤 버튼 (이미지 있을 때) */}
          {canEdit && wf.url && (
            <div className="absolute right-2 top-2 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button type="button" onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-xs text-white backdrop-blur-sm hover:bg-black/70">⚙</button>
              {menuOpen && (
                <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
                  className="absolute right-0 top-8 z-30 flex w-40 flex-col overflow-hidden rounded-xl bg-white py-1 text-sm shadow-xl">
                  <button type="button" onClick={() => { setMenuOpen(false); fileRef.current?.click(); }}
                    className="px-3 py-2 text-left font-medium text-ink hover:bg-zinc-50">이미지 교체</button>
                  <button type="button" onClick={() => { setMenuOpen(false); setPinModeId(wf.id); }}
                    className={`px-3 py-2 text-left font-medium hover:bg-zinc-50 ${isPinMode ? "text-brand" : "text-ink"}`}>번호 찍기</button>
                  <button type="button" onClick={() => { setMenuOpen(false); setDrawModeId(wf.id); }}
                    className="px-3 py-2 text-left font-medium text-ink hover:bg-zinc-50">영역 표시 추가</button>
                  <button type="button" onClick={() => { setMenuOpen(false); updateWf(wf.id, { url: null, badges: [] }); }}
                    className="px-3 py-2 text-left font-medium text-red-500 hover:bg-red-50">이미지 삭제</button>
                </div>
              )}
            </div>
          )}

          {/* 힌트 메시지 */}
          {(isPinMode || isDrawMode) && (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-3">
              <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-sm">
                {isPinMode ? "클릭해서 번호를 찍으세요 · ESC 취소" : "드래그로 영역을 지정하세요 · ESC 취소"}
              </span>
            </div>
          )}
          {isConnectTarget && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-brand/10">
              <span className="rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white">여기로 연결</span>
            </div>
          )}
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(wf.id, f); }} />

        {/* 카드 하단 */}
        <div className="flex flex-wrap items-center gap-1 px-1">
          <input value={wf.name} readOnly={!canEdit}
            onChange={e => updateWf(wf.id, { name: e.target.value })}
            className="min-w-0 flex-1 bg-transparent text-xs font-bold text-zinc-500 outline-none" />
          {canEdit && (
            <>
              {connectingFrom === wf.id ? (
                <button type="button" onClick={() => setConnectingFrom(null)}
                  className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">연결 중...</button>
              ) : (
                <button type="button" onClick={() => setConnectingFrom(wf.id)}
                  className="rounded-full border border-brand/40 px-2 py-0.5 text-[11px] font-bold text-brand hover:bg-brand/10">→연결</button>
              )}
              <button type="button" onClick={() => deleteWf(wf.id)}
                className="text-[11px] font-bold text-red-400 hover:text-red-600">삭제</button>
            </>
          )}
          {/* 연관 모달 버튼 */}
          {modals.filter(m => m.modalFor === wf.id).map(m => (
            <button key={m.id} type="button" onClick={() => setActiveModal(m.id)}
              className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-700 hover:bg-purple-200">
              팝업 보기
            </button>
          ))}
        </div>
      </div>
    );
  }

  const activeModalData = activeModal ? wireframes.find(w => w.id === activeModal) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* 가로 스크롤 캔버스 */}
      <div ref={scrollRef} className="overflow-x-auto">
        <div ref={innerRef} className="relative flex min-w-max gap-8 pb-2">
          {/* SVG 플로우차트 화살표 */}
          {arrowPaths.length > 0 && (
            <svg className="pointer-events-none absolute inset-0 z-10 h-full overflow-visible" style={{ width: "100%" }}>
              <defs>
                <marker id="ah" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0,8 3,0 6" fill="#3b82f6" />
                </marker>
              </defs>
              {arrowPaths.map(a => (
                <g key={a.id}>
                  <path d={a.d} fill="none" stroke="#3b82f6" strokeWidth={2} markerEnd="url(#ah)" />
                  {a.label && (
                    <text x={a.mx} y={a.my - 8} textAnchor="middle" fontSize={10} fill="#3b82f6" fontWeight="bold"
                      className="select-none">{a.label}</text>
                  )}
                </g>
              ))}
            </svg>
          )}

          {/* 와이어프레임 카드들 */}
          {mainWfs.map(wf => <WireframeCard key={wf.id} wf={wf} />)}

          {/* 추가 버튼 */}
          {canEdit && (
            <div className="flex shrink-0 items-center">
              <button type="button" onClick={addWireframe}
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-zinc-300 text-2xl text-zinc-400 transition-colors hover:border-brand/40 hover:text-brand">
                +
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 플로우 스텝 편집 */}
      {flowSteps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {flowSteps.map(step => (
            <div key={step.id} className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs">
              <span className="font-bold text-blue-700">{wireframes.find(w => w.id === step.from)?.name ?? "?"}</span>
              <span className="text-blue-400">→</span>
              <span className="font-bold text-blue-700">{wireframes.find(w => w.id === step.to)?.name ?? "?"}</span>
              {canEdit && (
                <>
                  <input value={step.label}
                    onChange={e => onFlowStepsChange(flowSteps.map(s => s.id === step.id ? { ...s, label: e.target.value } : s))}
                    className="ml-1 w-20 bg-transparent text-blue-600 outline-none" />
                  <button type="button" onClick={() => onFlowStepsChange(flowSteps.filter(s => s.id !== step.id))}
                    className="font-bold text-red-400 hover:text-red-600">✕</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 모달 오버레이 */}
      {activeModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setActiveModal(null)}>
          <div className="relative max-w-xs overflow-hidden rounded-3xl shadow-2xl"
            onClick={e => e.stopPropagation()}>
            {activeModalData.url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={activeModalData.url} alt={activeModalData.name} className="w-full" />
              : <div className="flex h-48 w-64 items-center justify-center text-zinc-400">이미지 없음</div>
            }
            <button type="button" onClick={() => setActiveModal(null)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">✕</button>
            <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">
              {activeModalData.name}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
