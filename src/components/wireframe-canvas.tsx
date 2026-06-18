"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { WireframeItem, FlowStep } from "@/types/policy";

const BADGE_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];
// 부모 핀 번호(하이픈 앞자리)로 색상 결정 — "3-1"은 "3"과 같은 색
const bc = (pin: string) => {
  const n = parseInt(pin.split("-")[0], 10) || 1;
  return BADGE_COLORS[(n - 1) % BADGE_COLORS.length];
};

type Arrow = { id: string; d: string; label: string; mx: number; my: number };

type Props = {
  wireframes: WireframeItem[];
  flowSteps: FlowStep[];
  onWireframesChange: (wfs: WireframeItem[]) => void;
  onFlowStepsChange: (steps: FlowStep[]) => void;
  onUpload: (wfId: string, file: File) => Promise<void>;
  activePinNumber?: string | null;
  hoveredPinNumber?: string | null;
  onBadgeHover?: (pin: string | null) => void;
  onBadgeClick?: (pin: string) => void;
  onBadgeCreate?: (pin: string) => void;
  onAIEnhance?: (wf: WireframeItem) => void;
  onFigmaReimport?: () => void;
  canEdit: boolean;
};

export function WireframeCanvas({
  wireframes, flowSteps, onWireframesChange, onFlowStepsChange,
  onUpload, activePinNumber, hoveredPinNumber, onBadgeHover, onBadgeClick, canEdit,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  // imgLoaded는 WireframeCard 리마운트 시에도 보존되도록 부모에서 관리
  const [imgLoadedMap, setImgLoadedMap] = useState<Record<string, boolean>>({});

  const mainWfs = wireframes.filter(w => !w.isModal);
  const modals = wireframes.filter(w => w.isModal);

  const calcArrows = () => {
    const container = containerRef.current;
    if (!container) return;
    const paths = flowSteps.map(s => {
      const fe = cardRefs.current.get(s.from);
      const te = cardRefs.current.get(s.to);
      if (!fe || !te) return null;
      const x1 = fe.offsetLeft + fe.offsetWidth;
      const y1 = fe.offsetTop + fe.offsetHeight / 2;
      const x2 = te.offsetLeft;
      const y2 = te.offsetTop + te.offsetHeight / 2;
      const cx = (x1 + x2) / 2;
      return { id: s.id, d: `M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`, label: s.label, mx: cx, my: (y1 + y2) / 2 };
    }).filter(Boolean) as Arrow[];
    setArrows(paths);
  };

  useLayoutEffect(() => { calcArrows(); }, [wireframes, flowSteps]);

  function updateWf(id: string, patch: Partial<WireframeItem>) {
    onWireframesChange(wireframes.map(w => w.id === id ? { ...w, ...patch } : w));
  }

  function deleteWf(id: string) {
    onWireframesChange(wireframes.filter(w => w.id !== id));
    onFlowStepsChange(flowSteps.filter(s => s.from !== id && s.to !== id));
  }

  function confirmConnect(toId: string) {
    if (!connectingFrom || connectingFrom === toId) { setConnectingFrom(null); return; }
    if (!flowSteps.some(s => s.from === connectingFrom && s.to === toId)) {
      onFlowStepsChange([...flowSteps, { id: crypto.randomUUID(), from: connectingFrom, to: toId, label: `Step ${flowSteps.length + 1}` }]);
    }
    setConnectingFrom(null);
  }

  // ── WireframeCard (인라인 함수 — imgLoadedMap을 부모에서 관리해 리마운트 대응) ──
  function WireframeCard({ wf }: { wf: WireframeItem }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const imgLoaded = imgLoadedMap[wf.id] ?? false;
    const setImgLoaded = (v: boolean) =>
      setImgLoadedMap(prev => ({ ...prev, [wf.id]: v }));
    const fileRef = useRef<HTMLInputElement>(null);
    const isTarget = !!connectingFrom && connectingFrom !== wf.id;

    function onClick(e: React.MouseEvent<HTMLDivElement>) {
      setMenuOpen(false);
      if (connectingFrom) { confirmConnect(wf.id); }
    }

    function onPaste(e: React.ClipboardEvent) {
      const file = Array.from(e.clipboardData.items).find(i => i.type.startsWith("image/"))?.getAsFile();
      if (!file) return;
      e.preventDefault();
      onUpload(wf.id, file);
    }

    return (
      <div className="flex shrink-0 flex-col gap-2">
        <div
          ref={el => { if (el) cardRefs.current.set(wf.id, el); else cardRefs.current.delete(wf.id); }}
          tabIndex={canEdit ? 0 : -1}
          onPaste={onPaste}
          onClick={onClick}
          className={[
            "group relative rounded-2xl bg-white shadow-sm outline-none",
            isTarget && "ring-2 ring-brand cursor-pointer",
          ].filter(Boolean).join(" ")}
        >
          {wf.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={wf.url}
              src={wf.url}
              alt={wf.name}
              className="block w-auto h-auto max-w-none rounded-2xl"
              draggable={false}
              style={{ imageRendering: "auto", backfaceVisibility: "hidden" }}
              onLoad={() => { setImgLoaded(true); calcArrows(); }}
              onError={() => setImgLoaded(false)}
            />
          ) : (
            <div
              style={{ width: 390, height: 700 }}
              onClick={canEdit ? () => fileRef.current?.click() : undefined}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl text-sm text-zinc-400 ${canEdit ? "cursor-pointer hover:bg-brand/5" : ""}`}
            >
              <span className="text-3xl">🖼️</span>
              <span className="font-medium">{wf.name}</span>
              {canEdit && <span className="text-xs opacity-60">클릭 또는 Ctrl+V</span>}
            </div>
          )}

          {/* ── 투명 핫스팟: 이미지 내 기존 배지 숫자 위에 올라가는 클릭 영역 ── */}
          {imgLoaded && wf.badges.map(b => {
            const color = bc(b.pinNumber);
            const isActive = activePinNumber === b.pinNumber;
            const isHovered = hoveredPinNumber === b.pinNumber;

            if (b.w !== undefined && b.h !== undefined) {
              // 바운딩 박스 핫스팟 — 이미지 내 영역 표시 위에 오버레이
              return (
                <div
                  key={b.id}
                  style={{
                    left: `${b.x}%`, top: `${b.y}%`,
                    width: `${b.w}%`, height: `${b.h}%`,
                    backgroundColor: isActive ? color + "20" : isHovered ? color + "10" : "transparent",
                    boxShadow: isActive
                      ? `inset 0 0 0 2px ${color}, 0 0 0 2px ${color}40`
                      : isHovered
                      ? `inset 0 0 0 1.5px ${color}80`
                      : undefined,
                    zIndex: isActive ? 20 : isHovered ? 15 : 10,
                  }}
                  onClick={e => { e.stopPropagation(); onBadgeClick?.(b.pinNumber); }}
                  onMouseEnter={() => onBadgeHover?.(b.pinNumber)}
                  onMouseLeave={() => onBadgeHover?.(null)}
                  className="absolute cursor-pointer transition-all duration-150 rounded-sm"
                />
              );
            }

            // 포인트 핫스팟 — 이미지 내 원형 배지 위에 오버레이 (투명, 링만 표시)
            return (
              <div
                key={b.id}
                onClick={e => { e.stopPropagation(); onBadgeClick?.(b.pinNumber); }}
                onMouseEnter={() => onBadgeHover?.(b.pinNumber)}
                onMouseLeave={() => onBadgeHover?.(null)}
                style={{
                  left: `${b.x}%`, top: `${b.y}%`,
                  transform: "translate(-50%, -50%)",
                  backgroundColor: "transparent",
                  boxShadow: isActive
                    ? `0 0 0 3px ${color}, 0 0 8px ${color}60`
                    : isHovered
                    ? `0 0 0 2px ${color}90`
                    : undefined,
                  zIndex: isActive ? 30 : isHovered ? 20 : 10,
                }}
                className="absolute h-9 w-9 rounded-full cursor-pointer transition-all duration-150"
              />
            );
          })}

          {/* Controls */}
          {canEdit && wf.url && (
            <div className="absolute right-2 top-2 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button type="button" onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-xs text-white backdrop-blur-sm hover:bg-black/70">⚙</button>
              {menuOpen && (
                <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
                  className="absolute right-0 top-8 z-30 flex w-36 flex-col overflow-hidden rounded-xl bg-white py-1 shadow-xl">
                  <button onClick={() => { setMenuOpen(false); fileRef.current?.click(); }} className="px-3 py-2 text-left text-sm hover:bg-zinc-50">이미지 교체</button>
                  <button onClick={() => { setMenuOpen(false); updateWf(wf.id, { url: null, badges: [] }); setImgLoaded(false); }} className="px-3 py-2 text-left text-sm text-red-500 hover:bg-red-50">이미지 삭제</button>
                </div>
              )}
            </div>
          )}

          {isTarget && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-brand/10">
              <span className="rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-white">여기로 연결</span>
            </div>
          )}
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(wf.id, f); }} />

        {/* Card footer */}
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
              <button type="button" onClick={() => deleteWf(wf.id)} className="text-[11px] font-bold text-red-400 hover:text-red-600">삭제</button>
            </>
          )}
          {modals.filter(m => m.modalFor === wf.id).map(m => (
            <button key={m.id} type="button" onClick={() => setActiveModal(m.id)}
              className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-700 hover:bg-purple-200">팝업 보기</button>
          ))}
        </div>
      </div>
    );
  }

  const activeModalData = activeModal ? wireframes.find(w => w.id === activeModal) : null;

  return (
    <>
      <div ref={containerRef} className="relative flex gap-8 pb-4">
        {arrows.length > 0 && (
          <svg className="pointer-events-none absolute inset-0 z-10 overflow-visible" style={{ width: "100%", height: "100%" }}>
            <defs>
              <marker id="arh" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0,8 3,0 6" fill="#3b82f6" />
              </marker>
            </defs>
            {arrows.map(a => (
              <g key={a.id}>
                <path d={a.d} fill="none" stroke="#3b82f6" strokeWidth={2} markerEnd="url(#arh)" />
                {a.label && (
                  <text x={a.mx} y={a.my - 8} textAnchor="middle" fontSize={10} fill="#3b82f6" fontWeight="bold" className="select-none">{a.label}</text>
                )}
              </g>
            ))}
          </svg>
        )}

        {mainWfs.map(wf => <WireframeCard key={wf.id} wf={wf} />)}

        {canEdit && (
          <div className="flex shrink-0 items-start pt-6">
            <button type="button"
              onClick={() => onWireframesChange([...wireframes, { id: crypto.randomUUID(), url: null, name: `화면 ${mainWfs.length + 1}`, badges: [], isModal: false, modalFor: null, order: wireframes.length }])}
              className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-zinc-300 text-2xl text-zinc-400 hover:border-brand/40 hover:text-brand">
              +
            </button>
          </div>
        )}
      </div>

      {flowSteps.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {flowSteps.map(s => (
            <div key={s.id} className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs">
              <span className="font-bold text-blue-700">{wireframes.find(w => w.id === s.from)?.name ?? "?"}</span>
              <span className="text-blue-400">→</span>
              <span className="font-bold text-blue-700">{wireframes.find(w => w.id === s.to)?.name ?? "?"}</span>
              {canEdit && (
                <>
                  <input value={s.label} onChange={e => onFlowStepsChange(flowSteps.map(x => x.id === s.id ? { ...x, label: e.target.value } : x))}
                    className="ml-1 w-20 bg-transparent text-blue-600 outline-none" />
                  <button type="button" onClick={() => onFlowStepsChange(flowSteps.filter(x => x.id !== s.id))} className="font-bold text-red-400 hover:text-red-600">✕</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {activeModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setActiveModal(null)}>
          <div className="relative max-w-xs overflow-hidden rounded-3xl shadow-2xl" onClick={e => e.stopPropagation()}>
            {activeModalData.url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={activeModalData.url} alt={activeModalData.name} className="w-full" />
              : <div className="flex h-48 w-64 items-center justify-center text-zinc-400">이미지 없음</div>
            }
            <button type="button" onClick={() => setActiveModal(null)} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">✕</button>
            <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">{activeModalData.name}</div>
          </div>
        </div>
      )}
    </>
  );
}
