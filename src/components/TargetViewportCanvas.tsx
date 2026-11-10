import React, { useEffect, useRef, useState } from 'react';
import { Upload, Download, Zap } from 'lucide-react';
import {
  applyLutToRgbaBuffer,
  computeHistogram,
  type HistogramData,
  type Lut3D,
} from '../utils/lutEngine';
import {
  HardwareLutRenderer,
  type AcceleratorBackend,
} from '../utils/gpuLutAccelerator';
import {
  TARGET_SCENE_PRESETS,
  drawProceduralTestChart,
  type TargetScenePreset,
} from '../utils/studioPresets';

export type PreviewMode = 'split' | 'side_by_side' | 'graded' | 'original';

interface TargetViewportCanvasProps {
  lut: Lut3D;
  lutComputeMs: number;
  referenceHistogram: HistogramData;
  activeTargetId: string;
  targetImageUrl: string;
  isProceduralTarget: boolean;
  onSelectTargetPreset: (preset: TargetScenePreset) => void;
  onUploadCustomTarget: (file: File) => void;
}

export function TargetViewportCanvas({
  lut,
  lutComputeMs,
  referenceHistogram,
  activeTargetId,
  targetImageUrl,
  isProceduralTarget,
  onSelectTargetPreset,
  onUploadCustomTarget,
}: TargetViewportCanvasProps) {
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gpuRendererRef = useRef<HardwareLutRenderer | null>(null);
  const sourceRgbaRef = useRef<{
    width: number;
    height: number;
    rgba: Uint8ClampedArray;
  } | null>(null);
  // Small 160x90 subsample buffer for sub-millisecond live scope calculation
  const scopeSampleRgbaRef = useRef<Uint8ClampedArray | null>(null);
  const targetInputRef = useRef<HTMLInputElement | null>(null);

  const [previewMode, setPreviewMode] = useState<PreviewMode>('split');
  const [splitPos, setSplitPos] = useState<number>(52);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [gradedHistogram, setGradedHistogram] = useState<HistogramData | null>(null);
  const [scopeChannel, setScopeChannel] = useState<'rgb' | 'luma' | 'reference'>('rgb');
  const [backendName, setBackendName] = useState<AcceleratorBackend>('WebGL2 Hardware 3D-LUT');
  const [frameRenderMs, setFrameRenderMs] = useState<number>(0.4);

  // Initialize GPU 3D Texture Renderer once
  useEffect(() => {
    const renderer = new HardwareLutRenderer();
    gpuRendererRef.current = renderer;
    setBackendName(renderer.getBackendName());
  }, []);

  // 1. Load target image (or procedural chart) into offscreen RGBA buffer + upload to GPU 2D texture
  useEffect(() => {
    let cancelled = false;
    const offscreen = document.createElement('canvas');
    const W = 800;
    const H = 450;
    offscreen.width = W;
    offscreen.height = H;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    const finalizeSourceBuffer = () => {
      if (cancelled) return;
      const imgData = ctx.getImageData(0, 0, W, H);
      sourceRgbaRef.current = {
        width: W,
        height: H,
        rgba: imgData.data,
      };

      // Extract a tiny 120x68 subsample for 0.2ms live histogram scopes
      const subStride = 28; // every 7th pixel
      const subLen = Math.floor(imgData.data.length / subStride) * 4;
      const subBuf = new Uint8ClampedArray(subLen);
      for (let i = 0, j = 0; j < subLen && i < imgData.data.length - 4; i += subStride, j += 4) {
        subBuf[j] = imgData.data[i];
        subBuf[j + 1] = imgData.data[i + 1];
        subBuf[j + 2] = imgData.data[i + 2];
        subBuf[j + 3] = 255;
      }
      scopeSampleRgbaRef.current = subBuf;

      if (gpuRendererRef.current) {
        gpuRendererRef.current.uploadSourceImage(W, H, imgData.data);
        gpuRendererRef.current.upload3DLut(lut);
      }

      const gradedSub = applyLutToRgbaBuffer(subBuf, lut);
      setGradedHistogram(computeHistogram(gradedSub, 1));
      renderCompositeCanvas();
    };

    if (isProceduralTarget || targetImageUrl.startsWith('procedural://')) {
      drawProceduralTestChart(offscreen, W, H);
      finalizeSourceBuffer();
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const scale = Math.max(W / img.width, H / img.height);
      const sw = img.width * scale;
      const sh = img.height * scale;
      const dx = (W - sw) / 2;
      const dy = (H - sh) / 2;
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, dx, dy, sw, sh);
      finalizeSourceBuffer();
    };
    img.onerror = () => {
      if (cancelled) return;
      drawProceduralTestChart(offscreen, W, H);
      finalizeSourceBuffer();
    };
    img.src = targetImageUrl;

    return () => {
      cancelled = true;
    };
  }, [targetImageUrl, isProceduralTarget]);

  // 2. Upload updated 3D LUT texture to GPU & render frame in < 0.5ms
  useEffect(() => {
    if (!sourceRgbaRef.current) return;
    if (gpuRendererRef.current) {
      gpuRendererRef.current.upload3DLut(lut);
    }
    if (scopeSampleRgbaRef.current) {
      const gradedSub = applyLutToRgbaBuffer(scopeSampleRgbaRef.current, lut);
      setGradedHistogram(computeHistogram(gradedSub, 1));
    }
    renderCompositeCanvas();
  }, [lut]);

  // 3. Re-draw composite canvas when previewMode or splitPos changes
  useEffect(() => {
    renderCompositeCanvas();
  }, [previewMode, splitPos]);

  const drawOverlayHandles = (
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number
  ) => {
    if (previewMode === 'split') {
      const splitX = Math.floor((splitPos / 100) * W);
      ctx.save();
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, H);
      ctx.stroke();

      const cy = H / 2;
      ctx.fillStyle = '#0B0D11';
      ctx.beginPath();
      ctx.arc(splitX, cy, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#FBBF24';
      ctx.beginPath();
      ctx.moveTo(splitX - 8, cy);
      ctx.lineTo(splitX - 3, cy - 4);
      ctx.lineTo(splitX - 3, cy + 4);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(splitX + 8, cy);
      ctx.lineTo(splitX + 3, cy - 4);
      ctx.lineTo(splitX + 3, cy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (previewMode === 'side_by_side') {
      const halfW = Math.floor(W / 2);
      ctx.save();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(halfW, 0);
      ctx.lineTo(halfW, H);
      ctx.stroke();
      ctx.restore();
    }
  };

  const renderCompositeCanvas = () => {
    const canvas = displayCanvasRef.current;
    const src = sourceRgbaRef.current;
    if (!canvas || !src) return;

    const W = src.width;
    const H = src.height;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fast path: Hardware WebGL2 3D Texture (`sampler3D`) Trilinear Evaluation
    if (gpuRendererRef.current && gpuRendererRef.current.isHardwareAccelerated()) {
      const gpuMs = gpuRendererRef.current.renderToCanvas(
        ctx,
        W,
        H,
        previewMode,
        splitPos / 100,
        lut.size
      );
      if (gpuMs >= 0) {
        drawOverlayHandles(ctx, W, H);
        setFrameRenderMs(Math.max(0.1, gpuMs));
        return;
      }
    }

    // Fallback CPU TypedArray path
    const t0 = performance.now();
    const grdData = applyLutToRgbaBuffer(src.rgba, lut);
    const outImg = ctx.createImageData(W, H);
    const dst = outImg.data;
    const origData = src.rgba;

    if (previewMode === 'graded') {
      dst.set(grdData);
    } else if (previewMode === 'original') {
      dst.set(origData);
    } else if (previewMode === 'split') {
      const splitX = Math.floor((splitPos / 100) * W);
      for (let y = 0; y < H; y++) {
        const rowOffset = y * W * 4;
        for (let x = 0; x < W; x++) {
          const i = rowOffset + x * 4;
          const s = x < splitX ? origData : grdData;
          dst[i] = s[i];
          dst[i + 1] = s[i + 1];
          dst[i + 2] = s[i + 2];
          dst[i + 3] = 255;
        }
      }
    } else {
      const halfW = Math.floor(W / 2);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dstIdx = (y * W + x) * 4;
          const isLeft = x < halfW;
          const srcX = isLeft
            ? Math.min(W - 1, Math.floor((x / halfW) * W))
            : Math.min(W - 1, Math.floor(((x - halfW) / (W - halfW)) * W));
          const srcIdx = (y * W + srcX) * 4;
          const s = isLeft ? origData : grdData;
          dst[dstIdx] = s[srcIdx];
          dst[dstIdx + 1] = s[srcIdx + 1];
          dst[dstIdx + 2] = s[srcIdx + 2];
          dst[dstIdx + 3] = 255;
        }
      }
    }
    ctx.putImageData(outImg, 0, 0);
    drawOverlayHandles(ctx, W, H);
    setFrameRenderMs(Number((performance.now() - t0).toFixed(2)));
  };

  const handlePointerMoveOnCanvas = (clientX: number) => {
    if (previewMode !== 'split' || !displayCanvasRef.current) return;
    const rect = displayCanvasRef.current.getBoundingClientRect();
    const relX = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
    setSplitPos(Math.max(4, Math.min(96, Math.round(relX))));
  };

  const handleDownloadGradedFrame = () => {
    const src = sourceRgbaRef.current;
    if (!src) return;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = src.width;
    exportCanvas.height = src.height;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    if (gpuRendererRef.current && gpuRendererRef.current.isHardwareAccelerated()) {
      gpuRendererRef.current.renderToCanvas(ctx, src.width, src.height, 'graded', 0.5, lut.size);
    } else {
      const graded = applyLutToRgbaBuffer(src.rgba, lut);
      const imgData = new ImageData(new Uint8ClampedArray(graded), src.width, src.height);
      ctx.putImageData(imgData, 0, 0);
    }

    const dataUrl = exportCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${lut.title || 'ChromaCube'}_Graded_Preview.png`;
    a.click();
  };

  const activeHist =
    scopeChannel === 'reference'
      ? referenceHistogram
      : gradedHistogram || referenceHistogram;

  const buildSvgPolyline = (bins: number[], width = 600, height = 88) => {
    if (!bins || bins.length === 0) return '';
    return bins
      .map((val, idx) => {
        const x = (idx / (bins.length - 1)) * width;
        const y = height - Math.min(1, Math.max(0, val)) * (height - 8) - 4;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  return (
    <section
      aria-label="Target Preview and Color Scopes"
      className="flex flex-col gap-4 p-5 bg-[#12161E] border border-slate-800/90 rounded-xl"
    >
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100 tracking-tight">
            02. Real-Time GPU 3D LUT Monitor
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 font-mono tabular-nums">
            <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{backendName}</span>
            <span aria-hidden="true">·</span>
            <span>LUT {lutComputeMs}ms</span>
            <span aria-hidden="true">·</span>
            <span>GPU Draw {frameRenderMs}ms</span>
          </p>
        </div>

        {/* Interactive View Mode Selector */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setPreviewMode('split')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              previewMode === 'split'
                ? 'bg-amber-400 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Split Wipe
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode('side_by_side')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              previewMode === 'side_by_side'
                ? 'bg-amber-400 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Side-by-Side
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode('graded')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              previewMode === 'graded'
                ? 'bg-amber-400 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Graded Full
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode('original')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              previewMode === 'original'
                ? 'bg-amber-400 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Bypass
          </button>
        </div>
      </div>

      {/* Main GPU Trilinear Preview Canvas Container */}
      <div className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 select-none">
        <canvas
          ref={displayCanvasRef}
          data-testid="lut-preview-canvas"
          onMouseDown={(e) => {
            if (previewMode === 'split') {
              setIsDraggingSplit(true);
              handlePointerMoveOnCanvas(e.clientX);
            }
          }}
          onMouseMove={(e) => {
            if (isDraggingSplit && previewMode === 'split') {
              handlePointerMoveOnCanvas(e.clientX);
            }
          }}
          onMouseUp={() => setIsDraggingSplit(false)}
          onMouseLeave={() => setIsDraggingSplit(false)}
          className={`w-full aspect-video block ${
            previewMode === 'split' ? 'cursor-ew-resize' : 'cursor-default'
          }`}
        />

        {/* Measured Contrast Scrim Labels */}
        {(previewMode === 'split' || previewMode === 'side_by_side') && (
          <div className="pointer-events-none absolute top-3 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-slate-200">
            <span className="px-2 py-0.5 rounded bg-black/75 border border-white/10">
              Rec.709 Source
            </span>
            <span className="px-2 py-0.5 rounded bg-black/75 border border-amber-400/30 text-amber-300">
              3D LUT Applied ({lut.title})
            </span>
          </div>
        )}

        {/* Accessible Split Position Slider when in Split Mode */}
        {previewMode === 'split' && (
          <div className="flex items-center justify-between gap-4 px-4 py-2 bg-slate-900/95 border-t border-slate-800 text-xs">
            <label htmlFor="split-wipe-slider" className="text-slate-400 whitespace-nowrap shrink-0">
              Wipe Curtain Position
            </label>
            <input
              id="split-wipe-slider"
              type="range"
              min={5}
              max={95}
              value={splitPos}
              onChange={(e) => setSplitPos(Number(e.target.value))}
              className="w-full max-w-xs accent-amber-400"
            />
            <span className="font-mono text-slate-300 tabular-nums w-10 text-right">
              {splitPos}%
            </span>
          </div>
        )}
      </div>

      {/* Target Scene Selector & Upload Bar */}
      <div className="space-y-2 pt-1">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {TARGET_SCENE_PRESETS.map((scene) => {
            const active = activeTargetId === scene.id;
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => onSelectTargetPreset(scene)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors truncate cursor-pointer ${
                  active
                    ? 'border-amber-400/80 bg-amber-500/10 text-amber-300'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {scene.name}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">
            Test LUT on custom camera log/Rec.709 frames
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => targetInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/90 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Target Photo
            </button>
            <button
              type="button"
              onClick={handleDownloadGradedFrame}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 rounded-lg hover:text-white hover:border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Save Frame .png
            </button>
            <input
              ref={targetInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUploadCustomTarget(file);
              }}
              aria-label="Upload Target Test Image"
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Live RGB Parade & Luminance Scope */}
      <div className="pt-3 border-t border-slate-800/80">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-slate-300">Live Signal Scope (64-Bin Distribution)</span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="text-[11px] font-mono text-slate-400 tabular-nums">
              Gamut Clipping {lut.metrics.gamutClippedPercent}%
            </span>
          </div>
          <div className="flex items-center gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded-md">
            <button
              type="button"
              onClick={() => setScopeChannel('rgb')}
              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                scopeChannel === 'rgb'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Graded RGB
            </button>
            <button
              type="button"
              onClick={() => setScopeChannel('luma')}
              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                scopeChannel === 'luma'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Luminance
            </button>
            <button
              type="button"
              onClick={() => setScopeChannel('reference')}
              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                scopeChannel === 'reference'
                  ? 'bg-slate-800 text-amber-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Reference Source
            </button>
          </div>
        </div>

        <div className="h-24 w-full bg-slate-950 border border-slate-800/90 rounded-lg p-2 relative overflow-hidden">
          <svg
            viewBox="0 0 600 88"
            preserveAspectRatio="none"
            className="w-full h-full overflow-visible"
            aria-label="Color distribution scope"
          >
            <line x1="150" y1="0" x2="150" y2="88" stroke="#1E293B" strokeDasharray="3 3" />
            <line x1="300" y1="0" x2="300" y2="88" stroke="#1E293B" strokeDasharray="3 3" />
            <line x1="450" y1="0" x2="450" y2="88" stroke="#1E293B" strokeDasharray="3 3" />

            {scopeChannel !== 'luma' && (
              <>
                <polyline
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="1.75"
                  strokeOpacity="0.85"
                  points={buildSvgPolyline(activeHist.r)}
                />
                <polyline
                  fill="none"
                  stroke="#22C55E"
                  strokeWidth="1.75"
                  strokeOpacity="0.85"
                  points={buildSvgPolyline(activeHist.g)}
                />
                <polyline
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="1.75"
                  strokeOpacity="0.85"
                  points={buildSvgPolyline(activeHist.b)}
                />
              </>
            )}
            <polyline
              fill="none"
              stroke="#F8FAFC"
              strokeWidth={scopeChannel === 'luma' ? '2.2' : '1.2'}
              strokeOpacity={scopeChannel === 'luma' ? '0.95' : '0.45'}
              points={buildSvgPolyline(activeHist.luma)}
            />
          </svg>
          <div className="absolute bottom-1 left-2.5 right-2.5 flex justify-between text-[10px] font-mono text-slate-500 pointer-events-none tabular-nums">
            <span>0 IRE (Shadows)</span>
            <span>50 IRE (Midtones)</span>
            <span>100 IRE (Highlights)</span>
          </div>
        </div>
      </div>
    </section>
  );
}
