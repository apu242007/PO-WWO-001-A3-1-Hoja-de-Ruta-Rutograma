// SignaturePad — Pointer Events + setPointerCapture, ResizeObserver snapshot,
// StrictMode init guard, non-empty validation (skill §5). Never wrap in <label>.

import { useEffect, useRef } from "react";

interface Props {
  value?: string; // dataURL PNG
  onChange: (dataUrl: string | undefined) => void;
  height?: number;
}

export default function SignaturePad({ value, onChange, height = 180 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const initRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  function getCtx(): CanvasRenderingContext2D | null {
    const c = canvasRef.current;
    return c ? c.getContext("2d") : null;
  }

  function resyncCanvas(): boolean {
    const c = canvasRef.current;
    if (!c) return false;
    const rect = c.getBoundingClientRect();
    if (rect.width === 0) return false;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (c.width === targetW && c.height === targetH) return true;
    const snapshot = c.width > 0 ? c.toDataURL("image/png") : null;
    c.width = targetW;
    c.height = targetH;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0b1f2a";
      ctx.fillStyle = "#0b1f2a";
      if (snapshot && snapshot.length > 200) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = snapshot;
      }
    }
    return true;
  }

  useEffect(() => {
    if (initRef.current) return;
    if (!resyncCanvas()) return;
    initRef.current = true;
    if (value && value.length > 200) {
      const ctx = getCtx();
      const c = canvasRef.current;
      if (ctx && c) {
        const rect = c.getBoundingClientRect();
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = value;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      if (drawingRef.current) return;
      resyncCanvas();
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  function getXY(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    try {
      c.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    drawingRef.current = true;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getXY(e);
    lastRef.current = { x, y };
    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getXY(e);
    const last = lastRef.current;
    ctx.beginPath();
    if (last) ctx.moveTo(last.x, last.y);
    else ctx.moveTo(x, y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastRef.current = { x, y };
  }

  function endStroke() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    const c = canvasRef.current;
    if (!c) return;
    const dataUrl = c.toDataURL("image/png");
    if (!dataUrl || dataUrl.length < 200 || dataUrl === "data:,") return;
    onChange(dataUrl);
  }

  function clear() {
    const c = canvasRef.current;
    const ctx = getCtx();
    if (!c || !ctx) return;
    const rect = c.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    onChange(undefined);
  }

  return (
    <div className="signature-wrap">
      <canvas
        ref={canvasRef}
        className="signature-canvas"
        style={{ touchAction: "none", height }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
      />
      <button type="button" className="btn-ghost btn-clear-firma" onClick={clear}>
        Borrar firma
      </button>
    </div>
  );
}
