import React from 'react';
import { Trash2, Download, Play } from 'lucide-react';
import type { SavedLookItem } from '../utils/studioPresets';

interface SavedLooksAndSpecSectionProps {
  savedLooks: SavedLookItem[];
  onApplySavedLook: (look: SavedLookItem) => void;
  onDeleteSavedLook: (id: string) => void;
  onExportSavedLookCube: (look: SavedLookItem) => void;
}

const COMPATIBILITY_MATRIX = [
  {
    software: 'DaVinci Resolve Studio / Free',
    format: '.cube (33×33×33 or 65×65×65)',
    colorSpace: 'Rec.709 Gamma 2.4 / DaVinci Wide Gamut (with CST)',
    installPath: 'Project Settings → Color Management → Open LUT Folder → Update Lists',
  },
  {
    software: 'Adobe Premiere Pro & After Effects',
    format: '.cube (33×33×33 Recommended)',
    colorSpace: 'Rec.709 (Lumetri Color Creative / Basic Correction)',
    installPath: 'Lumetri Color Panel → Creative → Look → Browse (.cube)',
  },
  {
    software: 'Adobe Photoshop & Camera Raw',
    format: '.cube (33×33×33)',
    colorSpace: 'sRGB / Adobe RGB (8-bit or 16-bit RGB Mode)',
    installPath: 'Layer → New Adjustment Layer → Color Lookup → Load 3D LUT',
  },
  {
    software: 'Final Cut Pro & Motion',
    format: '.cube (33×33×33 or 65×65×65)',
    colorSpace: 'Standard Rec.709 / Wide Gamut HDR',
    installPath: 'Effects Browser → Color → Custom LUT → Choose Custom LUT',
  },
  {
    software: 'OBS Studio / Darktable / RawTherapee',
    format: 'Hald CLUT .png or 17³ .cube',
    colorSpace: 'sRGB Full Range (0–255)',
    installPath: 'Filters → Apply LUT → Browse Hald .png or .cube file',
  },
];

export function SavedLooksAndSpecSection({
  savedLooks,
  onApplySavedLook,
  onDeleteSavedLook,
  onExportSavedLookCube,
}: SavedLooksAndSpecSectionProps) {
  return (
    <div className="space-y-8 pt-6">
      {/* Saved Looks Library */}
      <section
        id="library"
        aria-label="Saved Looks Library"
        className="p-6 bg-[#12161E] border border-slate-800/90 rounded-xl"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Saved 3D LUT Library
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Compare, re-load, or export custom looks captured during your grading session
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 tabular-nums">
            {savedLooks.length} {savedLooks.length === 1 ? 'Look' : 'Looks'} Stored
          </span>
        </div>

        {savedLooks.length === 0 ? (
          <div className="py-10 px-4 text-center border border-dashed border-slate-800 rounded-lg">
            <p className="text-sm text-slate-300 font-medium">
              No custom looks saved in your library yet
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Click "Save to Library" in the LUT Mastering panel to store any extracted grade for instant recall.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {savedLooks.map((look) => (
              <div
                key={look.id}
                className="p-4 rounded-lg bg-slate-900/70 border border-slate-800/90 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-100 font-mono truncate">
                      {look.name}
                    </h3>
                    <span className="text-[11px] font-mono text-slate-400 tabular-nums shrink-0">
                      {look.params.size}³ · {look.params.strength}%
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                    <span className="truncate">Ref: {look.referenceName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-[11px] tabular-nums">
                      ΔE {look.avgDeltaE}
                    </span>
                  </div>

                  {/* Swatch Strip */}
                  <div className="grid grid-cols-6 gap-1 mt-3">
                    {look.paletteHexes.map((hex, i) => (
                      <div
                        key={`${look.id}-sw-${i}`}
                        className="h-4 rounded-sm border border-white/10"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => onApplySavedLook(look)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md hover:bg-amber-500/20 transition-colors cursor-pointer"
                  >
                    <Play className="w-3 h-3" />
                    Load Grade
                  </button>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onExportSavedLookCube(look)}
                      aria-label={`Export ${look.name} as .cube`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      .cube
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSavedLook(look.id)}
                      aria-label={`Delete ${look.name}`}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* NLE & Camera Compatibility Specification Table */}
      <section
        id="spec"
        aria-label="NLE Compatibility Matrix"
        className="p-6 bg-[#12161E] border border-slate-800/90 rounded-xl"
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-100">
            NLE & Monitor LUT Deployment Specification
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            All exported files conform to Adobe Cube LUT Specification 1.0 (IRIDAS) with Red-fastest, Green-middle, Blue-slowest ordering
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 pr-4 font-medium">Host Application / Hardware</th>
                <th className="py-2.5 px-4 font-medium">Recommended Lattice</th>
                <th className="py-2.5 px-4 font-medium">Working Color Space</th>
                <th className="py-2.5 pl-4 font-medium">Import Workflow</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-slate-300">
              {COMPATIBILITY_MATRIX.map((row) => (
                <tr key={row.software} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-3 pr-4 font-semibold text-slate-100 whitespace-nowrap">
                    {row.software}
                  </td>
                  <td className="py-3 px-4 font-mono text-amber-300 whitespace-nowrap tabular-nums">
                    {row.format}
                  </td>
                  <td className="py-3 px-4 text-slate-300">{row.colorSpace}</td>
                  <td className="py-3 pl-4 text-slate-400 font-mono text-[11px]">
                    {row.installPath}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
