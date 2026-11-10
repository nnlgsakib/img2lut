import {
  analyzeReferencePixels,
  generate3DLut,
  serializeToCubeFormat,
  type ExtractionAlgorithm,
  type ImageColorAnalysis,
  type Lut3D,
  type LutGradingParams,
  type LutSize,
} from './lutEngine';

export interface BulkBatchConfig {
  size: LutSize;
  algorithm: ExtractionAlgorithm;
  strength: number;
  skinProtection: number;
  contrast: number;
  saturation: number;
  prefix: string;
}

export interface BulkLutResultItem {
  id: string;
  fileName: string;
  lutTitle: string;
  imageUrl: string;
  analysis: ImageColorAnalysis;
  params: LutGradingParams;
  lut: Lut3D;
  paletteHexes: string[];
  processingMs: number;
  cubeSizeBytes: number;
}

export const DEFAULT_BULK_CONFIG: BulkBatchConfig = {
  size: 33,
  algorithm: 'reinhard_lab',
  strength: 85,
  skinProtection: 68,
  contrast: 8,
  saturation: 5,
  prefix: 'BulkGrade',
};

/**
 * Sanitizes an arbitrary image filename into a clean Adobe .cube LUT identifier.
 */
export function formatBulkLutTitle(
  fileName: string,
  prefix: string,
  index: number,
  size: LutSize
): string {
  const base = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  const idxStr = String(index + 1).padStart(2, '0');
  return [cleanPrefix || 'LUT', idxStr, base || 'Photo', `${size}`].join('_');
}

/**
 * Processes a single image's RGBA buffer into a complete 3D LUT item for the bulk processor.
 */
export function processBulkImageRgba(
  input: {
    id: string;
    fileName: string;
    imageUrl: string;
    rgba: Uint8ClampedArray | number[];
  },
  config: BulkBatchConfig,
  index: number
): BulkLutResultItem {
  const t0 = performance.now();
  const lutTitle = formatBulkLutTitle(input.fileName, config.prefix, index, config.size);

  const analysis = analyzeReferencePixels(input.rgba, 6000);
  const params: LutGradingParams = {
    title: lutTitle,
    size: config.size,
    algorithm: config.algorithm,
    strength: config.strength,
    contrast: config.contrast,
    saturation: config.saturation,
    blackLift: 4,
    highlightRolloff: 15,
    skinProtection: config.skinProtection,
    tempShift: 0,
    tintShift: 0,
    shadowTintStrength: 100,
    highlightTintStrength: 100,
  };

  const lut = generate3DLut(analysis, params);
  const processingMs = Number(Math.max(0.2, performance.now() - t0).toFixed(2));
  // Estimate .cube byte size (~29 bytes per node + 220 bytes header)
  const cubeSizeBytes = lut.metrics.totalNodes * 29 + 220;

  return {
    id: input.id,
    fileName: input.fileName,
    lutTitle,
    imageUrl: input.imageUrl,
    analysis,
    params,
    lut,
    paletteHexes: analysis.palette.map((p) => p.hex),
    processingMs,
    cubeSizeBytes,
  };
}

// Precomputed CRC-32 IEEE 802.3 table for standard PKZIP archive generation
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Builds a standards-compliant PKZIP archive (Uint8Array) from a list of text/binary files.
 * Allows downloading 10+ bulk-generated .cube LUT files in a single one-click .zip download.
 */
export function buildZipArchiveBytes(
  files: { filename: string; content: string | Uint8Array }[]
): Uint8Array {
  const encoder = new TextEncoder();
  const prepared = files.map((f) => {
    const nameBytes = encoder.encode(f.filename);
    const dataBytes =
      typeof f.content === 'string' ? encoder.encode(f.content) : f.content;
    const crc = crc32(dataBytes);
    return { nameBytes, dataBytes, crc };
  });

  // Calculate total byte size
  let localAreaSize = 0;
  let centralDirSize = 0;
  for (const item of prepared) {
    localAreaSize += 30 + item.nameBytes.length + item.dataBytes.length;
    centralDirSize += 46 + item.nameBytes.length;
  }
  const totalSize = localAreaSize + centralDirSize + 22;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  let offset = 0;
  const localHeaderOffsets: number[] = [];

  // 1. Write Local File Headers + File Data
  for (const item of prepared) {
    localHeaderOffsets.push(offset);
    view.setUint32(offset, 0x04034b50, true); // Local file header signature
    view.setUint16(offset + 4, 20, true); // Version needed to extract (2.0)
    view.setUint16(offset + 6, 0, true); // General purpose bit flag
    view.setUint16(offset + 8, 0, true); // Compression method (0 = store)
    view.setUint16(offset + 10, 0, true); // Last mod file time
    view.setUint16(offset + 12, 0x596a, true); // Last mod file date
    view.setUint32(offset + 14, item.crc, true); // CRC-32
    view.setUint32(offset + 18, item.dataBytes.length, true); // Compressed size
    view.setUint32(offset + 22, item.dataBytes.length, true); // Uncompressed size
    view.setUint16(offset + 26, item.nameBytes.length, true); // File name length
    view.setUint16(offset + 28, 0, true); // Extra field length
    offset += 30;

    out.set(item.nameBytes, offset);
    offset += item.nameBytes.length;

    out.set(item.dataBytes, offset);
    offset += item.dataBytes.length;
  }

  const centralDirStart = offset;

  // 2. Write Central Directory Headers
  for (let i = 0; i < prepared.length; i++) {
    const item = prepared[i];
    view.setUint32(offset, 0x02014b50, true); // Central directory file header signature
    view.setUint16(offset + 4, 20, true); // Version made by
    view.setUint16(offset + 6, 20, true); // Version needed to extract
    view.setUint16(offset + 8, 0, true); // General purpose bit flag
    view.setUint16(offset + 10, 0, true); // Compression method (0 = store)
    view.setUint16(offset + 12, 0, true); // Last mod file time
    view.setUint16(offset + 14, 0x596a, true); // Last mod file date
    view.setUint32(offset + 16, item.crc, true); // CRC-32
    view.setUint32(offset + 20, item.dataBytes.length, true); // Compressed size
    view.setUint32(offset + 24, item.dataBytes.length, true); // Uncompressed size
    view.setUint16(offset + 28, item.nameBytes.length, true); // File name length
    view.setUint16(offset + 30, 0, true); // Extra field length
    view.setUint16(offset + 32, 0, true); // File comment length
    view.setUint16(offset + 34, 0, true); // Disk number start
    view.setUint16(offset + 36, 0, true); // Internal file attributes
    view.setUint32(offset + 38, 0, true); // External file attributes
    view.setUint32(offset + 42, localHeaderOffsets[i], true); // Relative offset of local header
    offset += 46;

    out.set(item.nameBytes, offset);
    offset += item.nameBytes.length;
  }

  const centralDirLength = offset - centralDirStart;

  // 3. Write End of Central Directory Record (EOCD)
  view.setUint32(offset, 0x06054b50, true); // EOCD signature
  view.setUint16(offset + 4, 0, true); // Number of this disk
  view.setUint16(offset + 6, 0, true); // Disk where central directory starts
  view.setUint16(offset + 8, prepared.length, true); // Number of central directory records on this disk
  view.setUint16(offset + 10, prepared.length, true); // Total number of central directory records
  view.setUint32(offset + 12, centralDirLength, true); // Size of central directory
  view.setUint32(offset + 16, centralDirStart, true); // Offset of start of central directory
  view.setUint16(offset + 20, 0, true); // Comment length

  return out;
}

/**
 * Serializes all bulk items into a single PKZIP Uint8Array containing all .cube LUT files
 * plus a manifest summary text file.
 */
export function buildBulkLutZipBundle(items: BulkLutResultItem[]): Uint8Array {
  const files = items.map((item) => ({
    filename: `${item.lutTitle}.cube`,
    content: serializeToCubeFormat(item.lut, {
      algorithm: item.params.algorithm,
      strength: item.params.strength,
    }),
  }));

  const manifestLines = [
    'ChromaCube Studio — Bulk 3D LUT Pack Manifest',
    `Generated Count: ${items.length} .cube LUTs`,
    '------------------------------------------------------------',
    ...items.map(
      (it, idx) =>
        `${idx + 1}. ${it.lutTitle}.cube | Source: ${it.fileName} | Grid: ${it.lut.size}^3 | Mode: ${it.params.algorithm} | Mean dE: ${it.lut.metrics.avgDeltaE} | Palette: ${it.paletteHexes.join(' ')}`
    ),
  ];

  files.push({
    filename: 'LUT_Pack_Manifest.txt',
    content: manifestLines.join('\n') + '\n',
  });

  return buildZipArchiveBytes(files);
}
