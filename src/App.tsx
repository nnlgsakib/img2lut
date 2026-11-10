import React, { useEffect, useMemo, useState } from 'react';
import { TopBar, type StudioSectionId } from './components/TopBar';
import { ReferenceSourcePanel } from './components/ReferenceSourcePanel';
import { TargetViewportCanvas } from './components/TargetViewportCanvas';
import { MasteringControlsPanel } from './components/MasteringControlsPanel';
import { BulkLutGeneratorSection } from './components/BulkLutGeneratorSection';
import { LatticeAndScopesSection } from './components/LatticeAndScopesSection';
import { SavedLooksAndSpecSection } from './components/SavedLooksAndSpecSection';
import {
  DEFAULT_GRADING_PARAMS,
  analyzeReferencePixels,
  generate3DLut,
  generateHaldClutRgba,
  serializeToCubeFormat,
  type ImageColorAnalysis,
  type LutGradingParams,
} from './utils/lutEngine';
import { generateAccelerated3DLut } from './utils/gpuLutAccelerator';
import type { BulkLutResultItem } from './utils/bulkLutProcessor';
import {
  REFERENCE_PRESETS,
  TARGET_SCENE_PRESETS,
  type ReferencePreset,
  type SavedLookItem,
  type TargetScenePreset,
} from './utils/studioPresets';

const STORAGE_KEY_SAVED_LOOKS = 'chromacube_saved_looks_v1';

const INITIAL_FALLBACK_ANALYSIS: ImageColorAnalysis = (() => {
  const buf = new Uint8ClampedArray(120 * 4);
  for (let i = 0; i < 60; i++) {
    buf[i * 4] = 18;
    buf[i * 4 + 1] = 62;
    buf[i * 4 + 2] = 84;
    buf[i * 4 + 3] = 255;
  }
  for (let i = 60; i < 120; i++) {
    buf[i * 4] = 238;
    buf[i * 4 + 1] = 168;
    buf[i * 4 + 2] = 72;
    buf[i * 4 + 3] = 255;
  }
  return analyzeReferencePixels(buf);
})();

const SEED_SAVED_LOOKS: SavedLookItem[] = [
  {
    id: 'seed-look-1',
    name: 'Vision3_500T_TealAmber',
    createdAt: '2026-11-10',
    referenceName: 'Anamorphic Rain Dusk',
    params: {
      ...DEFAULT_GRADING_PARAMS,
      title: 'Vision3_500T_TealAmber',
      size: 33,
      algorithm: 'reinhard_lab',
      strength: 88,
      contrast: 12,
      saturation: 8,
      blackLift: 4,
      highlightRolloff: 18,
      skinProtection: 70,
    },
    paletteHexes: ['#0F2432', '#193E4F', '#3A5059', '#945B2C', '#D88B35', '#F4C16D'],
    avgDeltaE: 9.42,
  },
  {
    id: 'seed-look-2',
    name: 'Portra_400_GoldenHour',
    createdAt: '2026-11-10',
    referenceName: 'Mediterranean Portra Golden',
    params: {
      ...DEFAULT_GRADING_PARAMS,
      title: 'Portra_400_GoldenHour',
      size: 33,
      algorithm: 'zone_split_grade',
      strength: 85,
      contrast: 5,
      saturation: 10,
      blackLift: 9,
      highlightRolloff: 24,
      skinProtection: 75,
    },
    paletteHexes: ['#2B2623', '#5C4433', '#8E6245', '#C28A5B', '#E5B887', '#F8E3C4'],
    avgDeltaE: 8.15,
  },
];

export default function App() {
  const [activeSection, setActiveSection] = useState<StudioSectionId>('workspace');

  // Reference Image State
  const [activeReferenceId, setActiveReferenceId] = useState<string>(
    REFERENCE_PRESETS[0].id
  );
  const [referenceName, setReferenceName] = useState<string>(
    REFERENCE_PRESETS[0].name
  );
  const [referenceSubtitle, setReferenceSubtitle] = useState<string>(
    REFERENCE_PRESETS[0].subtitle
  );
  const [referenceImageUrl, setReferenceImageUrl] = useState<string>(
    REFERENCE_PRESETS[0].imageUrl
  );
  const [analysis, setAnalysis] = useState<ImageColorAnalysis>(
    INITIAL_FALLBACK_ANALYSIS
  );
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // Target Preview Scene State
  const [activeTargetId, setActiveTargetId] = useState<string>(
    TARGET_SCENE_PRESETS[0].id
  );
  const [targetImageUrl, setTargetImageUrl] = useState<string>(
    TARGET_SCENE_PRESETS[0].imageUrl
  );
  const [isProceduralTarget, setIsProceduralTarget] = useState<boolean>(false);

  // Grading & LUT Parameters
  const [params, setParams] = useState<LutGradingParams>({
    ...DEFAULT_GRADING_PARAMS,
    ...REFERENCE_PRESETS[0].recommendedParams,
  });

  // Saved Looks Library
  const [savedLooks, setSavedLooks] = useState<SavedLookItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SAVED_LOOKS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return SEED_SAVED_LOOKS;
  });
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [exportToast, setExportToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setExportToast(msg);
    setTimeout(() => setExportToast(null), 3500);
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SAVED_LOOKS, JSON.stringify(savedLooks));
    } catch {
      // ignore storage errors
    }
  }, [savedLooks]);

  // Decode & analyze reference image whenever `referenceImageUrl` changes
  useEffect(() => {
    let cancelled = false;
    setIsAnalyzing(true);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const sampleCanvas = document.createElement('canvas');
      const sw = 200;
      const sh = 135;
      sampleCanvas.width = sw;
      sampleCanvas.height = sh;
      const ctx = sampleCanvas.getContext('2d');
      if (!ctx) {
        setIsAnalyzing(false);
        return;
      }
      ctx.drawImage(img, 0, 0, sw, sh);
      const imgData = ctx.getImageData(0, 0, sw, sh);
      const extracted = analyzeReferencePixels(imgData.data, 8000);
      setAnalysis(extracted);
      setIsAnalyzing(false);
    };
    img.onerror = () => {
      if (!cancelled) setIsAnalyzing(false);
    };
    img.src = referenceImageUrl;

    return () => {
      cancelled = true;
    };
  }, [referenceImageUrl]);

  // Compute the 3D LUT in real time using our lookup-table-accelerated engine
  const { lut, computeMs } = useMemo(() => {
    return generateAccelerated3DLut(analysis, params);
  }, [analysis, params]);

  // Handlers
  const handleSelectReferencePreset = (preset: ReferencePreset) => {
    setActiveReferenceId(preset.id);
    setReferenceName(preset.name);
    setReferenceSubtitle(preset.subtitle);
    setReferenceImageUrl(preset.imageUrl);
    setParams((prev) => ({
      ...prev,
      ...preset.recommendedParams,
      size: prev.size,
    }));
  };

  const handleUploadCustomReference = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const cleanBase = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      setActiveReferenceId('custom-reference');
      setReferenceName(file.name);
      setReferenceSubtitle(`Custom uploaded reference (${Math.round(file.size / 1024)} KB)`);
      setReferenceImageUrl(dataUrl);
      setParams((prev) => ({
        ...prev,
        title: `${cleanBase || 'Custom_Look'}_${prev.size}`,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSelectTargetPreset = (scene: TargetScenePreset) => {
    setActiveTargetId(scene.id);
    setTargetImageUrl(scene.imageUrl);
    setIsProceduralTarget(Boolean(scene.isProceduralChart));
  };

  const handleUploadCustomTarget = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setActiveTargetId('custom-target');
      setTargetImageUrl(dataUrl);
      setIsProceduralTarget(false);
    };
    reader.readAsDataURL(file);
  };

  const handleResetParams = () => {
    setParams((prev) => ({
      ...DEFAULT_GRADING_PARAMS,
      title: prev.title,
      size: prev.size,
      algorithm: prev.algorithm,
      strength: 85,
      contrast: 0,
      saturation: 0,
      blackLift: 0,
      highlightRolloff: 0,
      skinProtection: 65,
      tempShift: 0,
      tintShift: 0,
      shadowTintStrength: 100,
      highlightTintStrength: 100,
    }));
  };

  const triggerCubeDownload = (targetLut = lut, targetParams = params) => {
    const cubeContent = serializeToCubeFormat(targetLut, {
      algorithm: targetParams.algorithm,
      strength: targetParams.strength,
    });
    const blob = new Blob([cubeContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const safeFilename =
      (targetLut.title || 'ChromaCube_LUT').replace(/[^a-zA-Z0-9_-]/g, '_') + '.cube';
    const a = document.createElement('a');
    a.href = url;
    a.download = safeFilename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    showToast(
      `Exported ${safeFilename} (${targetLut.size}×${targetLut.size}×${targetLut.size} · ${targetLut.metrics.totalNodes.toLocaleString()} nodes)`
    );
  };

  const handleExportHaldPng = () => {
    const hald = generateHaldClutRgba(lut, 6);
    const canvas = document.createElement('canvas');
    canvas.width = hald.width;
    canvas.height = hald.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = new ImageData(new Uint8ClampedArray(hald.rgba), hald.width, hald.height);
    ctx.putImageData(imgData, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    const safeFilename =
      (lut.title || 'ChromaCube_LUT').replace(/[^a-zA-Z0-9_-]/g, '_') + '_Hald6.png';
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = safeFilename;
    a.click();

    showToast(`Exported ${safeFilename} (216×216 Hald 6 CLUT)`);
  };

  const handleSaveLook = () => {
    const newItem: SavedLookItem = {
      id: `look-${Date.now()}`,
      name: params.title.trim() || `Custom_Look_${savedLooks.length + 1}`,
      createdAt: new Date().toISOString().slice(0, 10),
      referenceName,
      params: { ...params },
      paletteHexes: analysis.palette.map((p) => p.hex),
      avgDeltaE: lut.metrics.avgDeltaE,
    };
    setSavedLooks((prev) => [newItem, ...prev]);
    setSaveFeedback('Saved ✓');
    setTimeout(() => setSaveFeedback(null), 1800);
  };

  const handlePreviewBulkItemOnMonitor = (item: BulkLutResultItem) => {
    setActiveReferenceId(item.id);
    setReferenceName(item.fileName);
    setReferenceSubtitle(`Bulk batch reference · ${item.lutTitle}`);
    setReferenceImageUrl(item.imageUrl);
    setAnalysis(item.analysis);
    setParams({ ...item.params });
    showToast(`Loaded "${item.lutTitle}" into GPU Grading Monitor`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveBulkItemsToLibrary = (items: BulkLutResultItem[]) => {
    const today = new Date().toISOString().slice(0, 10);
    const converted: SavedLookItem[] = items.map((item, idx) => ({
      id: `bulk-saved-${Date.now()}-${idx}`,
      name: item.lutTitle,
      createdAt: today,
      referenceName: item.fileName,
      params: { ...item.params },
      paletteHexes: item.paletteHexes,
      avgDeltaE: item.lut.metrics.avgDeltaE,
    }));
    setSavedLooks((prev) => [...converted, ...prev]);
    showToast(`Saved ${converted.length} bulk LUTs to Library`);
  };

  const handleApplySavedLook = (look: SavedLookItem) => {
    setParams({ ...look.params });
    showToast(`Loaded look "${look.name}" into Grading Bay`);
  };

  const handleDeleteSavedLook = (id: string) => {
    setSavedLooks((prev) => prev.filter((item) => item.id !== id));
  };

  const handleExportSavedLookCube = (look: SavedLookItem) => {
    const customLut = generate3DLut(analysis, look.params);
    triggerCubeDownload(customLut, look.params);
  };

  const scrollToSection = (section: StudioSectionId) => {
    setActiveSection(section);
    if (section === 'workspace') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const el = document.getElementById(section);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D11] text-[#F1F5F9]">
      <TopBar
        activeSection={activeSection}
        onSelectSection={scrollToSection}
        onExportCube={() => triggerCubeDownload()}
        savedCount={savedLooks.length}
      />

      {/* Export Confirmation Banner */}
      {exportToast && (
        <div
          role="status"
          className="bg-amber-500/15 border-b border-amber-400/30 px-6 py-2 text-xs font-mono text-amber-200 flex items-center justify-between"
        >
          <span>{exportToast}</span>
          <button
            type="button"
            onClick={() => setExportToast(null)}
            className="text-amber-300 hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 py-6 space-y-6">
        {/* Studio Header Intro */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-slate-800/80">
          <div>
            <h1
              className="text-2xl md:text-3xl font-bold text-slate-100 tracking-tight font-display"
              style={{ textWrap: 'balance' }}
            >
              Image-to-3D LUT Color Science Studio
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl">
              Hardware-accelerated WebGPU & WebGL2 <code className="text-amber-300 font-mono text-xs">sampler3D</code> trilinear grading monitor + bulk multi-photo <code className="text-amber-300 font-mono text-xs">.cube</code> batch generator.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono tabular-nums shrink-0">
            <span>Grid: {lut.size}×{lut.size}×{lut.size}</span>
            <span aria-hidden="true">·</span>
            <span>Nodes: {lut.metrics.totalNodes.toLocaleString()}</span>
            <span aria-hidden="true">·</span>
            <span>LUT Compute: {computeMs}ms</span>
            <span aria-hidden="true">·</span>
            <span>Mean ΔE: {lut.metrics.avgDeltaE}</span>
          </div>
        </div>

        {/* Main 3-Column Color Grading Bay */}
        <div
          id="workspace"
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
        >
          {/* Left Column (4 cols): Reference Image & Extracted Colorimetry */}
          <div className="lg:col-span-4">
            <ReferenceSourcePanel
              activeReferenceId={activeReferenceId}
              referenceName={referenceName}
              referenceSubtitle={referenceSubtitle}
              referenceImageUrl={referenceImageUrl}
              analysis={analysis}
              isAnalyzing={isAnalyzing}
              onSelectPreset={handleSelectReferencePreset}
              onUploadCustomReference={handleUploadCustomReference}
            />
          </div>

          {/* Center Column (5 cols): Live GPU 3D-LUT Target Viewport & RGB Scopes */}
          <div className="lg:col-span-5">
            <TargetViewportCanvas
              lut={lut}
              lutComputeMs={computeMs}
              referenceHistogram={analysis.histogram}
              activeTargetId={activeTargetId}
              targetImageUrl={targetImageUrl}
              isProceduralTarget={isProceduralTarget}
              onSelectTargetPreset={handleSelectTargetPreset}
              onUploadCustomTarget={handleUploadCustomTarget}
            />
          </div>

          {/* Right Column (3 cols): LUT Mastering Controls & Export */}
          <div className="lg:col-span-3">
            <MasteringControlsPanel
              params={params}
              onChangeParams={setParams}
              onResetParams={handleResetParams}
              onExportCube={() => triggerCubeDownload()}
              onExportHaldPng={handleExportHaldPng}
              onSaveLook={handleSaveLook}
              saveFeedback={saveFeedback}
            />
          </div>
        </div>

        {/* Bulk Photo-to-LUT Batch Processor Section */}
        <BulkLutGeneratorSection
          onPreviewBulkItemOnMonitor={handlePreviewBulkItemOnMonitor}
          onSaveBulkItemsToLibrary={handleSaveBulkItemsToLibrary}
          onShowToast={showToast}
        />

        {/* 3D Lattice Slice, Hald CLUT, 1D Curves, and .cube Code Audit */}
        <LatticeAndScopesSection
          lut={lut}
          params={params}
          onExportCube={() => triggerCubeDownload()}
          onExportHaldPng={handleExportHaldPng}
        />

        {/* Saved Looks Library & NLE Compatibility Specification */}
        <SavedLooksAndSpecSection
          savedLooks={savedLooks}
          onApplySavedLook={handleApplySavedLook}
          onDeleteSavedLook={handleDeleteSavedLook}
          onExportSavedLookCube={handleExportSavedLookCube}
        />
      </main>

      <footer className="mt-12 border-t border-slate-800/80 py-6 px-6 text-xs text-slate-500">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>ChromaCube Studio · GPU-Accelerated 3D Color Lookup Table Generator</span>
          <div className="flex items-center gap-4">
            <a href="#workspace" className="hover:text-slate-300 transition-colors">
              Grading Bay
            </a>
            <span aria-hidden="true">·</span>
            <a href="#bulk" className="hover:text-slate-300 transition-colors">
              Bulk Generator
            </a>
            <span aria-hidden="true">·</span>
            <a href="#lattice" className="hover:text-slate-300 transition-colors">
              Lattice Inspector
            </a>
            <span aria-hidden="true">·</span>
            <a href="#spec" className="hover:text-slate-300 transition-colors">
              Adobe Cube 1.0 Specification
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
