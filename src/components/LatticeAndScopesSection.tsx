import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Check, Download, CheckCircle2 } from 'lucide-react';
import {
  buildFastCubePreviewAndStats,
  generateHaldClutRgba,
  serializeToCubeFormat,
  type Lut3D,
  type LutGradingParams,
} from '../utils/lutEngine';

interface LatticeAndScopesSectionProps {
  lut: Lut3D;
  params: LutGradingParams;
  onExportCube: () => void;
  onExportHaldPng: () => void;
}

export function LatticeAndScopesSection({
  lut,
  params,
  onExportCube,
  onExportHaldPng,
}: LatticeAndScopesSectionProps) {
  const sliceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [blueSliceIndex, setBlueSliceIndex] = useState<number>(Math.floor(lut.size / 2));
  const [latticeView, setLatticeView] = useState<'slice' | 'hald'>('slice');
  const [copiedCube, setCopiedCube] = useState(false);

  // Keep blueSliceIndex within bounds when LUT size changes
  useEffect(() => {
    setBlueSliceIndex(Math.floor(lut.size / 2));
  }, [lut.size]);

  // Render 3D LUT Blue Slice or Hald 6 CLUT onto canvas
  useEffect(() => {
    const canvas = sliceCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (latticeView === 'hald') {
      const hald = generateHaldClutRgba(lut, 6);
      canvas.width = hald.width;
      canvas.height = hald.height;
      const imgData = new ImageData(new Uint8ClampedArray(hald.rgba), hald.width, hald.height);
      ctx.putImageData(imgData, 0, 0);
      return;
    }

    const N = lut.size;
    const bIdx = Math.min(N - 1, Math.max(0, blueSliceIndex));
    const displaySize = 264;
    canvas.width = displaySize;
    canvas.height = displaySize;

    const cellSize = displaySize / N;
    const data = lut.data;

    for (let g = 0; g < N; g++) {
      for (let r = 0; r < N; r++) {
        const ptr = ((bIdx * N + g) * N + r) * 3;
        const r255 = Math.round(data[ptr] * 255);
        const g255 = Math.round(data[ptr + 1] * 255);
        const b255 = Math.round(data[ptr + 2] * 255);

        ctx.fillStyle = `rgb(${r255}, ${g255}, ${b255})`;
        const x = Math.floor(r * cellSize);
        const y = Math.floor((N - 1 - g) * cellSize);
        const w = Math.ceil(cellSize);
        const h = Math.ceil(cellSize);
        ctx.fillRect(x, y, w, h);
      }
    }
  }, [lut, blueSliceIndex, latticeView]);

  // O(1) sub-millisecond preview .cube snippet & validation (avoids formatting 35,937 lines on slider drag)
  const { previewText: cubePreviewText, validation } = useMemo(() => {
    return buildFastCubePreviewAndStats(lut, {
      algorithm: params.algorithm,
      strength: params.strength,
    });
  }, [lut, params.algorithm, params.strength]);

  const handleCopyFullCube = () => {
    const fullCube = serializeToCubeFormat(lut, {
      algorithm: params.algorithm,
      strength: params.strength,
    });
    navigator.clipboard?.writeText(fullCube).catch(() => {});
    setCopiedCube(true);
    setTimeout(() => setCopiedCube(false), 1800);
  };

  const buildCurvePath = (pts: number[], width = 280, height = 220) => {
    return pts
      .map((v, i) => {
        const x = (i / (pts.length - 1)) * width;
        const y = height - Math.min(1, Math.max(0, v)) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  return (
    <section
      id="lattice"
      aria-label="3D Lattice Inspector and Transfer Curves"
      className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6"
    >
      {/* Card 1: 3D Cube Lattice Slice & Hald CLUT Map */}
      <div className="p-5 bg-[#12161E] border border-slate-800/90 rounded-xl flex flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              3D Lattice Slice & Hald Map
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Inspect R×G chromatic planes across Blue axis B ∈ [0, {lut.size - 1}]
            </p>
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setLatticeView('slice')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                latticeView === 'slice'
                  ? 'bg-amber-400 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              2D Slice
            </button>
            <button
              type="button"
              onClick={() => setLatticeView('hald')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                latticeView === 'hald'
                  ? 'bg-amber-400 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Hald CLUT
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center bg-slate-950 border border-slate-800 rounded-lg p-3">
          <canvas
            ref={sliceCanvasRef}
            data-testid="lattice-slice-canvas"
            className="w-56 h-56 rounded border border-slate-800"
          />
          <div className="w-full flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2 tabular-nums">
            <span>Axis X: Red (0→1)</span>
            <span>Axis Y: Green (0→1)</span>
          </div>
        </div>

        {latticeView === 'slice' ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="blue-plane-slider" className="text-slate-300 font-medium">
                Blue Axis Depth Plane (B Index)
              </label>
              <span className="font-mono text-amber-300 text-xs tabular-nums">
                Plane {blueSliceIndex} / {lut.size - 1} (B={(blueSliceIndex / (lut.size - 1)).toFixed(2)})
              </span>
            </div>
            <input
              id="blue-plane-slider"
              type="range"
              min={0}
              max={lut.size - 1}
              value={blueSliceIndex}
              onChange={(e) => setBlueSliceIndex(Number(e.target.value))}
              className="w-full"
            />
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-slate-400">Hald 6 Pattern (216×216 px)</span>
            <button
              type="button"
              onClick={onExportHaldPng}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Hald .png
            </button>
          </div>
        )}
      </div>

      {/* Card 2: 1D RGB & Luminance Transfer Curves */}
      <div className="p-5 bg-[#12161E] border border-slate-800/90 rounded-xl flex flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              1D Neutral Axis Transfer Curves
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Input-to-output tonal response along the neutral gray ramp (R=G=B)
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-mono shrink-0">
            <span className="text-red-400">R</span>
            <span className="text-slate-600">·</span>
            <span className="text-emerald-400">G</span>
            <span className="text-slate-600">·</span>
            <span className="text-blue-400">B</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-200">Y</span>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col items-center">
          <svg
            viewBox="0 0 280 220"
            className="w-full h-56 overflow-visible"
            aria-label="1D RGB Transfer Curve Plot"
          >
            {/* Grid quarters */}
            <line x1="70" y1="0" x2="70" y2="220" stroke="#1E293B" strokeDasharray="3 3" />
            <line x1="140" y1="0" x2="140" y2="220" stroke="#1E293B" strokeDasharray="3 3" />
            <line x1="210" y1="0" x2="210" y2="220" stroke="#1E293B" strokeDasharray="3 3" />
            <line x1="0" y1="55" x2="280" y2="55" stroke="#1E293B" strokeDasharray="3 3" />
            <line x1="0" y1="110" x2="280" y2="110" stroke="#1E293B" strokeDasharray="3 3" />
            <line x1="0" y1="165" x2="280" y2="165" stroke="#1E293B" strokeDasharray="3 3" />

            {/* Diagonal 1:1 Identity reference line */}
            <line x1="0" y1="220" x2="280" y2="0" stroke="#475569" strokeDasharray="4 4" />

            <polyline
              fill="none"
              stroke="#EF4444"
              strokeWidth="2"
              points={buildCurvePath(lut.transferCurves.r)}
            />
            <polyline
              fill="none"
              stroke="#22C55E"
              strokeWidth="2"
              points={buildCurvePath(lut.transferCurves.g)}
            />
            <polyline
              fill="none"
              stroke="#3B82F6"
              strokeWidth="2"
              points={buildCurvePath(lut.transferCurves.b)}
            />
            <polyline
              fill="none"
              stroke="#F8FAFC"
              strokeWidth="1.5"
              strokeDasharray="2 2"
              points={buildCurvePath(lut.transferCurves.luma)}
            />
          </svg>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
          <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800/80">
            <div className="text-[11px] text-slate-400">Mean ΔE Shift</div>
            <div className="text-sm font-semibold text-slate-100 mt-0.5">
              {lut.metrics.avgDeltaE}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800/80">
            <div className="text-[11px] text-slate-400">Peak Chroma</div>
            <div className="text-sm font-semibold text-slate-100 mt-0.5">
              {lut.metrics.maxChromaShift}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800/80">
            <div className="text-[11px] text-slate-400">Black Point</div>
            <div className="text-sm font-semibold text-slate-100 mt-0.5">
              {(lut.transferCurves.luma[0] * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* Card 3: Live .cube Code & Specification Validator */}
      <div className="p-5 bg-[#12161E] border border-slate-800/90 rounded-xl flex flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Adobe .cube Specification Audit
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Verified IRIDAS / Adobe Cube 1.0 floating-point table
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopyFullCube}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedCube ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                Copied All
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy .cube
              </>
            )}
          </button>
        </div>

        <pre
          data-testid="cube-code-preview"
          className="text-[11px] font-mono text-slate-300 bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-x-auto max-h-56 leading-relaxed select-all tabular-nums"
        >
          {cubePreviewText}
        </pre>

        <div className="flex items-center justify-between gap-2 pt-1 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-mono text-[11px] tabular-nums">
              {validation.valid
                ? `Valid .cube · ${validation.tripletCount.toLocaleString()} triplets [${validation.minVal.toFixed(2)}..${validation.maxVal.toFixed(2)}]`
                : validation.error}
            </span>
          </div>
          <button
            type="button"
            onClick={onExportCube}
            className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Download File →
          </button>
        </div>
      </div>
    </section>
  );
}
