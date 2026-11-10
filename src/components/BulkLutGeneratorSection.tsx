import React, { useRef, useState } from 'react';
import {
  Upload,
  FolderArchive,
  Play,
  Download,
  Trash2,
  Layers,
  BookmarkPlus,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';
import {
  DEFAULT_BULK_CONFIG,
  buildBulkLutZipBundle,
  processBulkImageRgba,
  type BulkBatchConfig,
  type BulkLutResultItem,
} from '../utils/bulkLutProcessor';
import {
  serializeToCubeFormat,
  type ExtractionAlgorithm,
  type LutSize,
} from '../utils/lutEngine';
import { REFERENCE_PRESETS } from '../utils/studioPresets';

interface BulkLutGeneratorSectionProps {
  onPreviewBulkItemOnMonitor: (item: BulkLutResultItem) => void;
  onSaveBulkItemsToLibrary: (items: BulkLutResultItem[]) => void;
  onShowToast: (msg: string) => void;
}

export function BulkLutGeneratorSection({
  onPreviewBulkItemOnMonitor,
  onSaveBulkItemsToLibrary,
  onShowToast,
}: BulkLutGeneratorSectionProps) {
  const multiFileInputRef = useRef<HTMLInputElement | null>(null);
  const [config, setConfig] = useState<BulkBatchConfig>(DEFAULT_BULK_CONFIG);
  const [bulkItems, setBulkItems] = useState<BulkLutResultItem[]>([]);
  const [rawSources, setRawSources] = useState<
    { id: string; fileName: string; imageUrl: string; rgba: Uint8ClampedArray }[]
  >([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [totalBatchMs, setTotalBatchMs] = useState<number>(0);

  // Re-run batch LUT generation whenever batch config changes on existing sources
  const recomputeBatchFromSources = (
    sources: { id: string; fileName: string; imageUrl: string; rgba: Uint8ClampedArray }[],
    nextConfig: BulkBatchConfig
  ) => {
    const t0 = performance.now();
    const results = sources.map((src, idx) =>
      processBulkImageRgba(src, nextConfig, idx)
    );
    const elapsed = Number((performance.now() - t0).toFixed(1));
    setBulkItems(results);
    setTotalBatchMs(elapsed);
  };

  const updateBatchConfig = <K extends keyof BulkBatchConfig>(
    key: K,
    val: BulkBatchConfig[K]
  ) => {
    const next = { ...config, [key]: val };
    setConfig(next);
    if (rawSources.length > 0) {
      recomputeBatchFromSources(rawSources, next);
    }
  };

  // Decode an image URL into a 180x120 RGBA buffer for fast batch colorimetry extraction
  const decodeImageToRgba = (url: string): Promise<Uint8ClampedArray> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 180;
        c.height = 120;
        const ctx = c.getContext('2d');
        if (!ctx) {
          resolve(new Uint8ClampedArray(180 * 120 * 4));
          return;
        }
        ctx.drawImage(img, 0, 0, 180, 120);
        resolve(ctx.getImageData(0, 0, 180, 120).data);
      };
      img.onerror = () => {
        const fallback = new Uint8ClampedArray(64 * 4);
        for (let i = 0; i < 64; i++) {
          fallback[i * 4] = 180;
          fallback[i * 4 + 1] = 130;
          fallback[i * 4 + 2] = 90;
          fallback[i * 4 + 3] = 255;
        }
        resolve(fallback);
      };
      img.src = url;
    });
  };

  const handleBulkFilesSelected = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;

    setIsProcessing(true);
    const t0 = performance.now();

    const newRawSources: {
      id: string;
      fileName: string;
      imageUrl: string;
      rgba: Uint8ClampedArray;
    }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const dataUrl = await new Promise<string>((res) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string) || '');
        reader.onerror = () => res('');
        reader.readAsDataURL(file);
      });
      if (!dataUrl) continue;
      const rgba = await decodeImageToRgba(dataUrl);
      newRawSources.push({
        id: `bulk-${Date.now()}-${i}`,
        fileName: file.name,
        imageUrl: dataUrl,
        rgba,
      });
    }

    const mergedSources = [...rawSources, ...newRawSources];
    setRawSources(mergedSources);

    const results = mergedSources.map((src, idx) =>
      processBulkImageRgba(src, config, idx)
    );
    const elapsed = Number((performance.now() - t0).toFixed(1));
    setBulkItems(results);
    setTotalBatchMs(elapsed);
    setIsProcessing(false);
    onShowToast(
      `Generated ${newRawSources.length} .cube LUTs from bulk upload in ${elapsed}ms`
    );
  };

  // Load 4 distinct cinema/analog sample frames into the bulk processor with 1 click
  const handleLoadSampleCinemaBatch = async () => {
    setIsProcessing(true);
    const t0 = performance.now();

    const demoInputs = [
      {
        fileName: 'Anamorphic_Rain_Dusk.jpg',
        imageUrl: REFERENCE_PRESETS[0].imageUrl,
      },
      {
        fileName: 'Portra_400_Terrace.jpg',
        imageUrl: REFERENCE_PRESETS[1].imageUrl,
      },
      {
        fileName: 'Nordic_Fjord_Bleach.jpg',
        imageUrl: REFERENCE_PRESETS[2].imageUrl,
      },
      {
        fileName: 'Mediterranean_Daylight_Villa.jpg',
        imageUrl: '/src/assets/images/neutral_target_daylight_1794298129467.jpg',
      },
    ];

    const decodedSources: {
      id: string;
      fileName: string;
      imageUrl: string;
      rgba: Uint8ClampedArray;
    }[] = [];

    for (let i = 0; i < demoInputs.length; i++) {
      const item = demoInputs[i];
      const rgba = await decodeImageToRgba(item.imageUrl);
      decodedSources.push({
        id: `demo-bulk-${Date.now()}-${i}`,
        fileName: item.fileName,
        imageUrl: item.imageUrl,
        rgba,
      });
    }

    setRawSources(decodedSources);
    const results = decodedSources.map((src, idx) =>
      processBulkImageRgba(src, config, idx)
    );
    const elapsed = Number((performance.now() - t0).toFixed(1));
    setBulkItems(results);
    setTotalBatchMs(elapsed);
    setIsProcessing(false);
    onShowToast(
      `Batch generated ${results.length} .cube 3D LUTs (${config.size}³) in ${elapsed}ms`
    );
  };

  const handleDownloadSingleCube = (item: BulkLutResultItem) => {
    const cubeStr = serializeToCubeFormat(item.lut, {
      algorithm: item.params.algorithm,
      strength: item.params.strength,
    });
    const blob = new Blob([cubeStr], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.lutTitle}.cube`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    onShowToast(`Downloaded ${item.lutTitle}.cube`);
  };

  const handleDownloadAllZip = () => {
    if (bulkItems.length === 0) return;
    const zipBytes = buildBulkLutZipBundle(bulkItems);
    const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.prefix || 'ChromaCube'}_${bulkItems.length}_LUTs_${config.size}cube.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    onShowToast(
      `Exported ZIP archive containing ${bulkItems.length} .cube LUTs + Manifest`
    );
  };

  const handleRemoveBulkItem = (id: string) => {
    const nextSources = rawSources.filter((s) => s.id !== id);
    setRawSources(nextSources);
    recomputeBatchFromSources(nextSources, config);
  };

  const handleClearBatch = () => {
    setRawSources([]);
    setBulkItems([]);
    setTotalBatchMs(0);
  };

  return (
    <section
      id="bulk"
      aria-label="Bulk Photo to 3D LUT Batch Generator"
      className="p-6 bg-[#12161E] border border-slate-800/90 rounded-xl space-y-5"
    >
      {/* Header & Top Actions */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 tracking-tight flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400 shrink-0" />
            <span>Bulk Photo-to-LUT Batch Processor</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Upload multiple reference photos simultaneously to extract an individual <code className="text-amber-300 font-mono">.cube</code> 3D LUT from each image and export as a single <code className="text-amber-300 font-mono">.zip</code> pack
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleLoadSampleCinemaBatch}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Load 4-Photo Cinema Batch
          </button>

          <button
            type="button"
            onClick={() => multiFileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Select Bulk Photos
          </button>
          <input
            ref={multiFileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleBulkFilesSelected(e.target.files);
                e.target.value = '';
              }
            }}
            aria-label="Upload Bulk Reference Photos"
            className="hidden"
          />
        </div>
      </div>

      {/* Shared Batch Mastering Configuration Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3.5 bg-slate-950/90 border border-slate-800/90 rounded-lg">
        <div>
          <label
            htmlFor="bulk-prefix-input"
            className="block text-[11px] font-medium text-slate-400 mb-1"
          >
            Pack Naming Prefix
          </label>
          <input
            id="bulk-prefix-input"
            type="text"
            value={config.prefix}
            onChange={(e) => updateBatchConfig('prefix', e.target.value)}
            placeholder="e.g. CinemaPack"
            className="w-full px-2.5 py-1.5 text-xs font-mono text-slate-100 bg-slate-900 border border-slate-800 rounded-md focus:outline-none focus:border-amber-400"
          />
        </div>

        <div>
          <label
            htmlFor="bulk-grid-select"
            className="block text-[11px] font-medium text-slate-400 mb-1"
          >
            Batch Lattice Size
          </label>
          <select
            id="bulk-grid-select"
            value={config.size}
            onChange={(e) => updateBatchConfig('size', Number(e.target.value) as LutSize)}
            className="w-full px-2.5 py-1.5 text-xs font-mono text-slate-100 bg-slate-900 border border-slate-800 rounded-md focus:outline-none focus:border-amber-400"
          >
            <option value={17}>17×17×17 (4,913 nodes · Fast)</option>
            <option value={33}>33×33×33 (35,937 nodes · Broadcast)</option>
            <option value={65}>65×65×65 (274,625 nodes · Cinema DI)</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="bulk-algo-select"
            className="block text-[11px] font-medium text-slate-400 mb-1"
          >
            Transfer Model
          </label>
          <select
            id="bulk-algo-select"
            value={config.algorithm}
            onChange={(e) =>
              updateBatchConfig('algorithm', e.target.value as ExtractionAlgorithm)
            }
            className="w-full px-2.5 py-1.5 text-xs text-slate-100 bg-slate-900 border border-slate-800 rounded-md focus:outline-none focus:border-amber-400"
          >
            <option value="reinhard_lab">Reinhard LAB Transfer</option>
            <option value="zone_split_grade">3-Way Zone Split-Tone</option>
            <option value="curve_chroma_match">Quantile Curve & Chroma</option>
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <label htmlFor="bulk-strength-slider" className="text-slate-400 font-medium">
              Batch Intensity
            </label>
            <span className="font-mono text-amber-300 tabular-nums">{config.strength}%</span>
          </div>
          <input
            id="bulk-strength-slider"
            type="range"
            min={10}
            max={100}
            value={config.strength}
            onChange={(e) => updateBatchConfig('strength', Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <label htmlFor="bulk-skin-slider" className="text-slate-400 font-medium">
              Skin Protection
            </label>
            <span className="font-mono text-amber-300 tabular-nums">
              {config.skinProtection}%
            </span>
          </div>
          <input
            id="bulk-skin-slider"
            type="range"
            min={0}
            max={100}
            value={config.skinProtection}
            onChange={(e) => updateBatchConfig('skinProtection', Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      {/* Multi-Photo Dropzone or Populated Batch Queue */}
      {bulkItems.length === 0 ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleBulkFilesSelected(e.dataTransfer.files);
            }
          }}
          onClick={() => multiFileInputRef.current?.click()}
          className={`py-10 px-6 text-center border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
            isDragging
              ? 'border-amber-400 bg-amber-500/10'
              : 'border-slate-800 hover:border-slate-700 bg-slate-950/50'
          }`}
        >
          <Upload className="w-7 h-7 text-amber-400 mx-auto mb-2.5" />
          <p className="text-sm font-semibold text-slate-200">
            Drop multiple reference photos here, or click to select bulk images
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-xl mx-auto">
            Each image is analyzed in CIE L*a*b* color space to synthesize its own standalone <code className="font-mono text-slate-300">.cube</code> 3D LUT file. Or click "Load 4-Photo Cinema Batch" above to test immediately.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Batch Summary & Bulk Export Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-900/90 border border-slate-800 rounded-lg">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-300 tabular-nums">
              <span className="font-semibold text-amber-300">
                {bulkItems.length} .cube LUTs Ready
              </span>
              <span aria-hidden="true">·</span>
              <span>Grid {config.size}³</span>
              <span aria-hidden="true">·</span>
              <span>Total Compute {totalBatchMs}ms</span>
              {isProcessing && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-400">Processing...</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onSaveBulkItemsToLibrary(bulkItems);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <BookmarkPlus className="w-3.5 h-3.5 text-amber-400" />
                Save All to Library
              </button>

              <button
                type="button"
                onClick={handleDownloadAllZip}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <FolderArchive className="w-3.5 h-3.5" />
                Download All .cube LUTs (.zip)
              </button>

              <button
                type="button"
                onClick={handleClearBatch}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Clear Batch
              </button>
            </div>
          </div>

          {/* Grid of Generated Bulk LUT Cards */}
          <div
            data-testid="bulk-lut-results-grid"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {bulkItems.map((item) => (
              <div
                key={item.id}
                className="bg-slate-900/75 border border-slate-800/90 rounded-lg overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Source Thumbnail */}
                  <div className="aspect-video w-full bg-slate-950 relative overflow-hidden">
                    <img
                      src={item.imageUrl}
                      alt={item.fileName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute bottom-2 left-2.5 right-2.5 flex items-end justify-between gap-2 text-[11px] font-mono text-slate-200 tabular-nums">
                      <span className="truncate font-semibold text-white">
                        {item.lutTitle}.cube
                      </span>
                      <span className="text-amber-300 shrink-0">
                        {item.processingMs}ms
                      </span>
                    </div>
                  </div>

                  {/* Extracted Palette & Telemetry */}
                  <div className="p-3 space-y-2.5">
                    <div className="grid grid-cols-6 gap-1">
                      {item.paletteHexes.map((hex, idx) => (
                        <div
                          key={`${item.id}-hex-${idx}`}
                          title={hex}
                          className="h-3.5 rounded-sm border border-white/15"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>

                    <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between tabular-nums">
                      <span>ΔE {item.lut.metrics.avgDeltaE}</span>
                      <span aria-hidden="true">·</span>
                      <span>DR {item.analysis.dynamicRangeStops} Stops</span>
                      <span aria-hidden="true">·</span>
                      <span>{Math.round(item.cubeSizeBytes / 1024)} KB</span>
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="px-3 py-2 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => onPreviewBulkItemOnMonitor(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded hover:bg-amber-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Play className="w-3 h-3" />
                    Preview on Monitor
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDownloadSingleCube(item)}
                      aria-label={`Download ${item.lutTitle}.cube`}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      .cube
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveBulkItem(item.id)}
                      aria-label={`Remove ${item.fileName} from batch`}
                      className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
