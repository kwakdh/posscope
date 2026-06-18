"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const MIN_SCALE = 0.1;
const MAX_SCALE = 5.0;
const GRID = 24;

type Transform = { x: number; y: number; scale: number };

export function InfiniteCanvas({
  children,
  className,
  initialScale = 1,
  toolMode,
  onToolChange,
}: {
  children: ReactNode;
  className?: string;
  initialScale?: number;
  toolMode?: "hand" | "move";
  onToolChange?: (t: "hand" | "move") => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<Transform>({ x: 40, y: 32, scale: initialScale });
  const [isPanning, setIsPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const effectiveHandMode = toolMode === "hand" || spaceDown;

  // Ctrl + Wheel → zoom toward cursor
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setT(prev => {
        const factor = e.deltaY < 0 ? 1.1 : 0.909;
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor));
        const r = next / prev.scale;
        return { x: mx - r * (mx - prev.x), y: my - r * (my - prev.y), scale: next };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Space → temporary hand; H / V keys → persistent tool switch
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      const isEditing = tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable;
      if (e.code === "Space" && !e.repeat) {
        if (isEditing) return;
        e.preventDefault();
        setSpaceDown(true);
        return;
      }
      if (isEditing) return;
      if (e.code === "KeyH") onToolChange?.("hand");
      if (e.code === "KeyV") onToolChange?.("move");
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceDown(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [onToolChange]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 1 && !(e.button === 0 && effectiveHandMode)) return;
    e.preventDefault();
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y };
  }, [effectiveHandMode, t.x, t.y]);

  useEffect(() => {
    if (!isPanning) return;
    const move = (e: MouseEvent) => {
      if (!panStart.current) return;
      setT(prev => ({
        ...prev,
        x: panStart.current!.tx + e.clientX - panStart.current!.x,
        y: panStart.current!.ty + e.clientY - panStart.current!.y,
      }));
    };
    const up = () => { setIsPanning(false); panStart.current = null; };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
  }, [isPanning]);

  const gridPx = GRID * t.scale;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className ?? ""}`}
      style={{
        background: "#f0f0f0",
        cursor: effectiveHandMode ? (isPanning ? "grabbing" : "grab") : "default",
      }}
      onMouseDown={onMouseDown}
    >
      {/* Dot grid background — hidden below 25% to avoid moiré artifacts */}
      {t.scale > 0.25 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, #c4c4c4 1px, transparent 1px)",
            backgroundSize: `${gridPx}px ${gridPx}px`,
            backgroundPosition: `${t.x % gridPx}px ${t.y % gridPx}px`,
            willChange: "background-position, background-size",
          }}
        />
      )}

      {/* Transformed canvas — pointer-events disabled in hand mode so children don't intercept pan */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`,
          transformOrigin: "0 0",
          willChange: "transform",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          pointerEvents: effectiveHandMode ? "none" : undefined,
        }}
      >
        {children}
      </div>

      {/* Zoom + Tool HUD */}
      <div className="pointer-events-auto absolute bottom-3 right-3 flex items-center gap-1 rounded-xl bg-white/90 px-3 py-1.5 text-xs shadow-sm backdrop-blur-sm select-none">
        <button
          type="button"
          className="w-5 text-center font-bold text-zinc-500 hover:text-zinc-900"
          onClick={() => setT(p => ({ ...p, scale: Math.max(MIN_SCALE, p.scale / 1.25) }))}
        >−</button>
        <span className="w-10 text-center font-bold text-zinc-600">{Math.round(t.scale * 100)}%</span>
        <button
          type="button"
          className="w-5 text-center font-bold text-zinc-500 hover:text-zinc-900"
          onClick={() => setT(p => ({ ...p, scale: Math.min(MAX_SCALE, p.scale * 1.25) }))}
        >+</button>
        <span className="mx-0.5 text-zinc-200">|</span>
        <button
          type="button"
          className="font-bold text-zinc-400 hover:text-zinc-700"
          onClick={() => setT({ x: 40, y: 32, scale: 1 })}
          title="초기화 (100%)"
        >↺</button>
        {onToolChange && (
          <>
            <span className="mx-0.5 text-zinc-200">|</span>
            <button
              type="button"
              title={toolMode === "hand" ? "이동 모드로 전환 (V)" : "패닝 모드로 전환 (H)"}
              onClick={() => onToolChange(toolMode === "hand" ? "move" : "hand")}
              className={`w-5 text-center font-bold transition-colors ${toolMode === "hand" ? "text-brand" : "text-zinc-400 hover:text-zinc-700"}`}
            >{toolMode === "hand" ? "H" : "V"}</button>
          </>
        )}
      </div>

      {/* Mode hint */}
      {effectiveHandMode && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/60 px-2 py-1 text-xs font-bold text-white backdrop-blur-sm">
          {toolMode === "hand" && !spaceDown ? "H — 패닝 모드 · V로 이동 모드 전환" : "Space + 드래그로 이동"}
        </div>
      )}
    </div>
  );
}
