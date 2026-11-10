import React from 'react';
import { Download, RotateCcw, BookmarkPlus, Grid } from 'lucide-react';
import type {
  ExtractionAlgorithm,
  LutGradingParams,
  LutSize,
} from '../utils/lutEngine';

interface MasteringControlsPanelProps {
  params: LutGradingParams;
  onChangeParams: (updater: (prev: LutGradingParams) => LutGradingParams) => void;
  onResetParams: () => void;
  onExportCube: () => void;
  onExportHaldPng: () => void;
  onSaveLook: () => void;
  saveFeedback: string | null;
}

const ALGORITHMS: {
  id: ExtractionAlgorithm;
  label: string;
  desc: string;
}[] = [
  {
    id: 'reinhard_lab',
    label: 'Reinhard LAB Transfer',
    desc: 'Perceptual CIE L*a*b* mean & standard deviation transfer with extremity roll-off',
  },
  {
    id: 'zone_split_grade',
    label: '3-Way Zone Split-Tone',
    desc: 'Preserves native contrast while injecting shadow, midtone, and highlight vectors',
  },
  {
    id: 'curve_chroma_match',
    label: 'Quantile Curve & Chroma',
    desc: 'Matches 5-point cumulative luminance curve and harmonic saturation balance',
  },
];

const GRID_SIZES: { size: LutSize; label: string; useCase: string }[] = [
  { size: 17, label: '17³ Grid', useCase: '4,913 nodes · WebGL / OBS' },
  { size: 33, label: '33³ Grid', useCase: '35,937 nodes · Resolve / Premiere' },
  { size: 65, label: '65³ Grid', useCase: '274,625 nodes · Cinema DI' },
];

export function MasteringControlsPanel({
  params,
  onChangeParams,
  onResetParams,
  onExportCube,
  onExportHaldPng,
  onSaveLook,
  saveFeedback,
}: MasteringControlsPanelProps) {
  const updateField = <K extends keyof LutGradingParams>(
    key: K,
    value: LutGradingParams[K]
  ) => {
    onChangeParams((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <section
      aria-label="3D LUT Mastering Controls"
      className="flex flex-col gap-5 p-5 bg-[#12161E] border border-slate-800/90 rounded-xl"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-100 tracking-tight">
            03. LUT Mastering & Export
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Fine-tune transfer math, skin protection, and 3D lattice density
          </p>
        </div>
        <button
          type="button"
          onClick={onResetParams}
          title="Reset fine-tuning sliders to neutral"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 rounded-lg hover:text-white hover:border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      {/* LUT Title & 3D Lattice Grid Size */}
      <div className="space-y-3">
        <div>
          <label
            htmlFor="lut-title-input"
            className="block text-xs font-medium text-slate-300 mb-1"
          >
            LUT Identifier (`TITLE` Header & Filename)
          </label>
          <input
            id="lut-title-input"
            type="text"
            value={params.title}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder="e.g. Vision3_500T_TealAmber"
            className="w-full px-3 py-1.5 text-xs font-mono text-slate-100 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-amber-400"
          />
        </div>

        <div>
          <span className="block text-xs font-medium text-slate-300 mb-1.5">
            3D Cube Lattice Precision (`LUT_3D_SIZE`)
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {GRID_SIZES.map((item) => {
              const active = params.size === item.size;
              return (
                <button
                  key={item.size}
                  type="button"
                  onClick={() => updateField('size', item.size)}
                  className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-amber-400 bg-amber-500/10 text-slate-100'
                      : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="text-xs font-semibold font-mono tabular-nums">
                    {item.label}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {item.useCase}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Color Science Extraction Algorithm */}
      <div className="pt-3 border-t border-slate-800/80">
        <span className="block text-xs font-medium text-slate-300 mb-1.5">
          Color Transfer Model
        </span>
        <div className="space-y-1.5">
          {ALGORITHMS.map((alg) => {
            const active = params.algorithm === alg.id;
            return (
              <button
                key={alg.id}
                type="button"
                onClick={() => updateField('algorithm', alg.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                  active
                    ? 'border-amber-400/80 bg-amber-500/10 text-slate-100'
                    : 'border-slate-800/90 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-semibold text-slate-200">
                  {alg.label}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  {alg.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary Grading Sliders in a Compact 2-Column Studio Matrix */}
      <div className="pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-x-3.5 gap-y-2.5">
        {[
          {
            id: 'slider-strength',
            label: 'LUT Mix',
            key: 'strength' as const,
            min: 0,
            max: 100,
            unit: '%',
          },
          {
            id: 'slider-skin',
            label: 'Skin Protect',
            key: 'skinProtection' as const,
            min: 0,
            max: 100,
            unit: '%',
          },
          {
            id: 'slider-contrast',
            label: 'Contrast',
            key: 'contrast' as const,
            min: -40,
            max: 40,
            unit: '',
          },
          {
            id: 'slider-saturation',
            label: 'Chroma',
            key: 'saturation' as const,
            min: -40,
            max: 40,
            unit: '',
          },
          {
            id: 'slider-shadow-tint',
            label: 'Shadow Tint',
            key: 'shadowTintStrength' as const,
            min: 0,
            max: 150,
            unit: '%',
          },
          {
            id: 'slider-highlight-tint',
            label: 'Highlight Tint',
            key: 'highlightTintStrength' as const,
            min: 0,
            max: 150,
            unit: '%',
          },
          {
            id: 'slider-black-lift',
            label: 'Matte Toe',
            key: 'blackLift' as const,
            min: 0,
            max: 30,
            unit: '',
          },
          {
            id: 'slider-rolloff',
            label: 'Shoulder Roll',
            key: 'highlightRolloff' as const,
            min: 0,
            max: 45,
            unit: '',
          },
          {
            id: 'slider-temp',
            label: 'Temp (B*)',
            key: 'tempShift' as const,
            min: -40,
            max: 40,
            unit: '',
          },
          {
            id: 'slider-tint',
            label: 'Tint (A*)',
            key: 'tintShift' as const,
            min: -40,
            max: 40,
            unit: '',
          },
        ].map((ctrl) => {
          const val = params[ctrl.key];
          return (
            <div key={ctrl.id} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <label htmlFor={ctrl.id} className="text-slate-300 font-medium truncate">
                  {ctrl.label}
                </label>
                <span className="font-mono text-[11px] text-amber-300 tabular-nums shrink-0">
                  {val > 0 && ctrl.min < 0 ? `+${val}` : val}
                  {ctrl.unit}
                </span>
              </div>
              <input
                id={ctrl.id}
                type="range"
                min={ctrl.min}
                max={ctrl.max}
                value={val}
                onChange={(e) => updateField(ctrl.key, Number(e.target.value))}
                className="w-full bg-slate-800 rounded-lg"
              />
            </div>
          );
        })}
      </div>

      {/* Primary Export & Library Actions */}
      <div className="pt-3 border-t border-slate-800/80 flex flex-col gap-2">
        <button
          type="button"
          onClick={onExportCube}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap cursor-pointer"
        >
          <Download className="w-4 h-4" />
          Download .cube 3D LUT ({params.size}³)
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onExportHaldPng}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Grid className="w-3.5 h-3.5 text-amber-400" />
            Hald CLUT .png
          </button>
          <button
            type="button"
            onClick={onSaveLook}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-amber-400" />
            {saveFeedback || 'Save to Library'}
          </button>
        </div>
      </div>
    </section>
  );
}
