import React, { useRef, useState } from 'react';
import { Upload, Check, Copy, Image as ImageIcon } from 'lucide-react';
import type { ImageColorAnalysis } from '../utils/lutEngine';
import { REFERENCE_PRESETS, type ReferencePreset } from '../utils/studioPresets';

interface ReferenceSourcePanelProps {
  activeReferenceId: string;
  referenceName: string;
  referenceSubtitle: string;
  referenceImageUrl: string;
  analysis: ImageColorAnalysis;
  isAnalyzing: boolean;
  onSelectPreset: (preset: ReferencePreset) => void;
  onUploadCustomReference: (file: File) => void;
}

export function ReferenceSourcePanel({
  activeReferenceId,
  referenceName,
  referenceSubtitle,
  referenceImageUrl,
  analysis,
  isAnalyzing,
  onSelectPreset,
  onUploadCustomReference,
}: ReferenceSourcePanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImgError(false);
      onUploadCustomReference(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setImgError(false);
      onUploadCustomReference(file);
    }
  };

  const handleCopyHex = (hex: string) => {
    navigator.clipboard?.writeText(hex).catch(() => {});
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 1500);
  };

  return (
    <section
      aria-label="Reference Look Extraction"
      className="flex flex-col gap-5 p-5 bg-[#12161E] border border-slate-800/90 rounded-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100 tracking-tight">
            01. Reference Look Source
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Upload any film frame or photo to extract its 3D color profile
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Reference
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          aria-label="Upload Reference Image"
          className="hidden"
        />
      </div>

      {/* Reference Image Dropzone & Active Preview */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative overflow-hidden rounded-lg border transition-colors ${
          isDragging
            ? 'border-amber-400 bg-amber-500/10'
            : 'border-slate-800 bg-slate-950'
        }`}
      >
        <div className="aspect-video w-full relative overflow-hidden bg-slate-900">
          {!imgError ? (
            <img
              src={referenceImageUrl}
              alt={`Reference look: ${referenceName}`}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950/40 p-4 text-center">
              <ImageIcon className="w-8 h-8 text-amber-400/70 mb-2" />
              <span className="text-xs font-medium text-slate-200">{referenceName}</span>
              <span className="text-[11px] text-slate-400 mt-0.5">Color matrix active</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />
          <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-white leading-tight">
                {referenceName}
              </div>
              <div className="text-[11px] text-slate-300 mt-0.5 line-clamp-1">
                {referenceSubtitle}
              </div>
            </div>
            {isAnalyzing && (
              <span className="text-[11px] font-mono text-amber-300">
                Sampling...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Curated Reference Presets */}
      <div>
        <div className="text-xs font-medium text-slate-300 mb-2">
          Studio Reference Masters
        </div>
        <div className="grid grid-cols-3 gap-2">
          {REFERENCE_PRESETS.map((preset) => {
            const isSelected = activeReferenceId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setImgError(false);
                  onSelectPreset(preset);
                }}
                className={`group text-left p-2 rounded-lg border transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-amber-400/80 bg-amber-500/10 text-slate-100'
                    : 'border-slate-800/90 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-medium text-slate-200 truncate">
                  {preset.name}
                </div>
                <div className="text-[11px] text-slate-400 truncate mt-0.5">
                  {preset.filmStock}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Extracted 6-Swatch Chromatic Palette */}
      <div className="pt-3 border-t border-slate-800/80">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-medium text-slate-300">Extracted Chromatic Swatches</span>
          <span className="text-slate-400 font-mono text-[11px] tabular-nums">
            {copiedHex ? `Copied ${copiedHex}` : 'Click swatch to copy HEX'}
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {analysis.palette.map((swatch, idx) => (
            <button
              key={`${swatch.hex}-${idx}`}
              type="button"
              onClick={() => handleCopyHex(swatch.hex)}
              title={`${swatch.hex} · L*${swatch.lab[0]} a*${swatch.lab[1]} b*${swatch.lab[2]} (${swatch.zone})`}
              aria-label={`Copy swatch ${swatch.hex}`}
              className="group flex flex-col items-center cursor-pointer focus:outline-none"
            >
              <div
                className="w-full h-8 rounded-md border border-white/15 relative flex items-center justify-center transition-transform group-hover:scale-105"
                style={{ backgroundColor: swatch.hex }}
              >
                {copiedHex === swatch.hex ? (
                  <Check className="w-3.5 h-3.5 text-white drop-shadow" />
                ) : (
                  <Copy className="w-3 h-3 text-white/0 group-hover:text-white/90 drop-shadow transition-opacity" />
                )}
              </div>
              <span className="text-[10px] font-mono text-slate-400 mt-1 tabular-nums">
                {swatch.hex}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 3-Way Tonal Zone Vector Analysis */}
      <div className="pt-3 border-t border-slate-800/80">
        <div className="flex items-center justify-between text-xs mb-2.5">
          <span className="font-medium text-slate-300">Tonal Zone Colorimetry (CIE L*a*b*)</span>
          <span className="text-[11px] text-slate-400 font-mono tabular-nums">
            DR {analysis.dynamicRangeStops} Stops · Sat {analysis.saturationMean}%
          </span>
        </div>
        <div className="space-y-2">
          {(
            [
              analysis.zones.shadows,
              analysis.zones.midtones,
              analysis.zones.highlights,
            ] as const
          ).map((zone) => (
            <div
              key={zone.name}
              className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-slate-900/60 border border-slate-800/60 text-xs"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="w-4 h-4 rounded border border-white/20 shrink-0"
                  style={{ backgroundColor: zone.hex }}
                />
                <span className="font-medium text-slate-200">{zone.name}</span>
                <span className="text-slate-500" aria-hidden="true">·</span>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {zone.share}%
                </span>
              </div>
              <div className="font-mono text-[11px] text-slate-300 tabular-nums">
                L*{zone.lab[0]} · a*{zone.lab[1] >= 0 ? `+${zone.lab[1]}` : zone.lab[1]} · b*{zone.lab[2] >= 0 ? `+${zone.lab[2]}` : zone.lab[2]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
