export type LutSize = 17 | 33 | 65;

export type ExtractionAlgorithm =
  | 'reinhard_lab'
  | 'zone_split_grade'
  | 'curve_chroma_match';

export interface LutGradingParams {
  title: string;
  size: LutSize;
  algorithm: ExtractionAlgorithm;
  strength: number; // 0 to 100
  contrast: number; // -50 to 50
  saturation: number; // -50 to 50
  blackLift: number; // 0 to 30
  highlightRolloff: number; // 0 to 50
  skinProtection: number; // 0 to 100
  tempShift: number; // -50 to 50 (cool to warm)
  tintShift: number; // -50 to 50 (green to magenta)
  shadowTintStrength: number; // 0 to 150
  highlightTintStrength: number; // 0 to 150
}

export interface TonalZoneStats {
  name: 'Shadows' | 'Midtones' | 'Highlights';
  rgb: [number, number, number]; // 0-255
  lab: [number, number, number]; // L (0-100), a, b
  hex: string;
  share: number; // percentage 0-100
}

export interface PaletteSwatch {
  hex: string;
  rgb: [number, number, number]; // 0-255
  lab: [number, number, number];
  luminance: number; // 0-1
  population: number; // percentage 0-100
  zone: 'Shadow' | 'Midtone' | 'Highlight';
}

export interface HistogramData {
  r: number[]; // 64 bins normalized 0-1
  g: number[];
  b: number[];
  luma: number[];
}

export interface ImageColorAnalysis {
  labMean: [number, number, number];
  labStd: [number, number, number];
  rgbMean: [number, number, number]; // 0-1
  rgbStd: [number, number, number]; // 0-1
  quantiles: {
    q05: number;
    q25: number;
    q50: number;
    q75: number;
    q95: number;
  };
  zones: {
    shadows: TonalZoneStats;
    midtones: TonalZoneStats;
    highlights: TonalZoneStats;
  };
  palette: PaletteSwatch[];
  histogram: HistogramData;
  temperatureIndex: number; // -100 (cool) to +100 (warm)
  saturationMean: number; // 0 to 100
  dynamicRangeStops: number; // e.g., 6.5 to 12.4
}

export interface Lut3D {
  title: string;
  size: LutSize;
  data: Float32Array; // length = size * size * size * 3
  transferCurves: {
    r: number[];
    g: number[];
    b: number[];
    luma: number[];
  };
  metrics: {
    avgDeltaE: number;
    maxChromaShift: number;
    gamutClippedPercent: number;
    totalNodes: number;
  };
}

export interface CubeValidationResult {
  valid: boolean;
  size: number;
  title: string;
  tripletCount: number;
  expectedCount: number;
  minVal: number;
  maxVal: number;
  error?: string;
}

export const DEFAULT_GRADING_PARAMS: LutGradingParams = {
  title: 'Cinema_Grade_33',
  size: 33,
  algorithm: 'reinhard_lab',
  strength: 85,
  contrast: 8,
  saturation: 5,
  blackLift: 4,
  highlightRolloff: 15,
  skinProtection: 65,
  tempShift: 0,
  tintShift: 0,
  shadowTintStrength: 100,
  highlightTintStrength: 100,
};

export function clamp01(val: number): number {
  if (Number.isNaN(val)) return 0;
  return val < 0 ? 0 : val > 1 ? 1 : val;
}

export function clamp(val: number, min: number, max: number): number {
  if (Number.isNaN(val)) return min;
  return val < min ? min : val > max ? max : val;
}

// Precomputed 4096-entry lookup tables for instant sRGB <-> Linear conversion without Math.pow
const LUT_RES = 4095;
const SRGB_TO_LINEAR_TABLE = new Float32Array(LUT_RES + 1);
const LINEAR_TO_SRGB_TABLE = new Float32Array(LUT_RES + 1);

for (let i = 0; i <= LUT_RES; i++) {
  const v = i / LUT_RES;
  SRGB_TO_LINEAR_TABLE[i] =
    v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  LINEAR_TO_SRGB_TABLE[i] =
    v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function srgbToLinear(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return SRGB_TO_LINEAR_TABLE[(c * LUT_RES + 0.5) | 0];
}

export function linearToSrgb(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 1;
  return LINEAR_TO_SRGB_TABLE[(c * LUT_RES + 0.5) | 0];
}

/**
 * Converts sRGB [0..1] to CIE L*a*b* (D65 reference white)
 * L in [0..100], a in [-128..127], b in [-128..127]
 */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  // sRGB to XYZ (D65)
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750) / 1.00000;
  const z = (lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041) / 1.08883;

  const eps = 0.008856;
  const kappa = 903.3;

  const fx = x > eps ? Math.cbrt(x) : (kappa * x + 16) / 116;
  const fy = y > eps ? Math.cbrt(y) : (kappa * y + 16) / 116;
  const fz = z > eps ? Math.cbrt(z) : (kappa * z + 16) / 116;

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);

  return [clamp(L, 0, 100), a, bVal];
}

/**
 * Converts CIE L*a*b* (D65) to sRGB [0..1]
 */
export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const eps = 0.008856;
  const kappa = 903.3;

  const x3 = fx * fx * fx;
  const y3 = fy * fy * fy;
  const z3 = fz * fz * fz;

  const xr = x3 > eps ? x3 : (116 * fx - 16) / kappa;
  const yr = L > kappa * eps ? y3 : L / kappa;
  const zr = z3 > eps ? z3 : (116 * fz - 16) / kappa;

  const x = xr * 0.95047;
  const y = yr * 1.00000;
  const z = zr * 1.08883;

  // XYZ to linear RGB
  const lr = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const lg = x * -0.9692660 + y * 1.8760108 + z * 0.0415560;
  const lb = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

export function rgbToHex(r255: number, g255: number, b255: number): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r255)}${toHex(g255)}${toHex(b255)}`.toUpperCase();
}

/**
 * Calculates how strongly a pixel in sRGB [0..1] matches natural human skin tones.
 * Returns a weight in [0..1] (1 = core skin tone locus, 0 = non-skin).
 */
export function computeSkinToneWeight(r: number, g: number, b: number): number {
  const [h, s, l] = rgbToHsl(r, g, b);
  // Skin hues sit roughly around 8 deg to 42 deg (h in 0.022 to 0.116)
  const hueDeg = h * 360;
  const hueCenter = 24;
  let hueDist = Math.abs(hueDeg - hueCenter);
  if (hueDist > 180) hueDist = 360 - hueDist;

  if (hueDist > 32 || s < 0.12 || s > 0.78 || l < 0.15 || l > 0.88) {
    return 0;
  }

  const hueWeight = Math.max(0, 1 - (hueDist / 32) ** 2);
  const satWeight = 1 - Math.abs(s - 0.42) / 0.4;
  const lumaWeight = 1 - Math.abs(l - 0.54) / 0.42;

  return clamp01(hueWeight * clamp01(satWeight) * clamp01(lumaWeight));
}

/**
 * Computes 64-bin normalized histograms for R, G, B, and Rec.709 Luminance
 */
export function computeHistogram(rgba: Uint8ClampedArray | number[], step = 1): HistogramData {
  const bins = 64;
  const rHist = new Array(bins).fill(0);
  const gHist = new Array(bins).fill(0);
  const bHist = new Array(bins).fill(0);
  const lHist = new Array(bins).fill(0);

  const totalPixels = Math.floor(rgba.length / 4);
  const stride = Math.max(1, step) * 4;

  for (let i = 0; i < rgba.length; i += stride) {
    const a = rgba[i + 3];
    if (a < 32) continue;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    rHist[Math.min(bins - 1, Math.floor((r / 256) * bins))]++;
    gHist[Math.min(bins - 1, Math.floor((g / 256) * bins))]++;
    bHist[Math.min(bins - 1, Math.floor((b / 256) * bins))]++;
    lHist[Math.min(bins - 1, Math.floor((luma / 256) * bins))]++;
  }

  const maxCount = Math.max(
    1,
    ...rHist.slice(1, bins - 1),
    ...gHist.slice(1, bins - 1),
    ...bHist.slice(1, bins - 1),
    ...lHist.slice(1, bins - 1),
    totalPixels > 0 ? 1 : 1
  );

  return {
    r: rHist.map((v) => clamp01(v / maxCount)),
    g: gHist.map((v) => clamp01(v / maxCount)),
    b: bHist.map((v) => clamp01(v / maxCount)),
    luma: lHist.map((v) => clamp01(v / maxCount)),
  };
}

/**
 * Extracts comprehensive color grading statistics, tonal zones, quantiles, and palette
 * from an RGBA image buffer.
 */
export function analyzeReferencePixels(
  rgba: Uint8ClampedArray | number[],
  maxSamples = 16000
): ImageColorAnalysis {
  const pixelCount = Math.floor(rgba.length / 4);
  const step = Math.max(1, Math.floor(pixelCount / maxSamples));

  let sumL = 0,
    sumA = 0,
    sumB = 0;
  let sumR = 0,
    sumG = 0,
    sumBl = 0;
  let sumSat = 0;

  const samplesLab: [number, number, number][] = [];
  const samplesRgb: [number, number, number][] = [];
  const lumaValues: number[] = [];

  // Zone accumulators: Shadows (L < 38), Midtones (38 <= L <= 70), Highlights (L > 70)
  const zoneAcc = {
    shadows: { r: 0, g: 0, b: 0, L: 0, a: 0, bLab: 0, count: 0 },
    midtones: { r: 0, g: 0, b: 0, L: 0, a: 0, bLab: 0, count: 0 },
    highlights: { r: 0, g: 0, b: 0, L: 0, a: 0, bLab: 0, count: 0 },
  };

  // 18 quantized hue/luminance buckets for palette extraction
  const buckets = Array.from({ length: 18 }, () => ({
    r: 0,
    g: 0,
    b: 0,
    L: 0,
    a: 0,
    bLab: 0,
    count: 0,
  }));

  for (let i = 0; i < rgba.length; i += step * 4) {
    const alpha = rgba[i + 3];
    if (alpha < 64) continue;

    const r = rgba[i] / 255;
    const g = rgba[i + 1] / 255;
    const b = rgba[i + 2] / 255;

    const [L, a, bLab] = rgbToLab(r, g, b);
    const [h, s, l] = rgbToHsl(r, g, b);

    samplesLab.push([L, a, bLab]);
    samplesRgb.push([r, g, b]);
    lumaValues.push(L / 100);

    sumL += L;
    sumA += a;
    sumB += bLab;
    sumR += r;
    sumG += g;
    sumBl += b;
    sumSat += s;

    if (L < 38) {
      zoneAcc.shadows.r += r;
      zoneAcc.shadows.g += g;
      zoneAcc.shadows.b += b;
      zoneAcc.shadows.L += L;
      zoneAcc.shadows.a += a;
      zoneAcc.shadows.bLab += bLab;
      zoneAcc.shadows.count++;
    } else if (L <= 70) {
      zoneAcc.midtones.r += r;
      zoneAcc.midtones.g += g;
      zoneAcc.midtones.b += b;
      zoneAcc.midtones.L += L;
      zoneAcc.midtones.a += a;
      zoneAcc.midtones.bLab += bLab;
      zoneAcc.midtones.count++;
    } else {
      zoneAcc.highlights.r += r;
      zoneAcc.highlights.g += g;
      zoneAcc.highlights.b += b;
      zoneAcc.highlights.L += L;
      zoneAcc.highlights.a += a;
      zoneAcc.highlights.bLab += bLab;
      zoneAcc.highlights.count++;
    }

    // Assign to palette bucket: 6 hue sectors * 3 lightness tiers
    const hueSector = s < 0.08 ? 0 : Math.min(5, Math.floor(h * 6));
    const lTier = l < 0.35 ? 0 : l < 0.7 ? 1 : 2;
    const bucketIdx = hueSector * 3 + lTier;
    buckets[bucketIdx].r += r;
    buckets[bucketIdx].g += g;
    buckets[bucketIdx].b += b;
    buckets[bucketIdx].L += L;
    buckets[bucketIdx].a += a;
    buckets[bucketIdx].bLab += bLab;
    buckets[bucketIdx].count++;
  }

  const n = Math.max(1, samplesLab.length);
  const meanL = sumL / n;
  const meanA = sumA / n;
  const meanB = sumB / n;
  const meanR = sumR / n;
  const meanG = sumG / n;
  const meanBl = sumBl / n;

  let varL = 0,
    varA = 0,
    varB = 0;
  let varR = 0,
    varG = 0,
    varBl = 0;

  for (let i = 0; i < samplesLab.length; i++) {
    const [L, a, bLab] = samplesLab[i];
    const [r, g, b] = samplesRgb[i];
    varL += (L - meanL) ** 2;
    varA += (a - meanA) ** 2;
    varB += (bLab - meanB) ** 2;
    varR += (r - meanR) ** 2;
    varG += (g - meanG) ** 2;
    varBl += (b - meanBl) ** 2;
  }

  const stdL = Math.max(4, Math.sqrt(varL / n));
  const stdA = Math.max(2, Math.sqrt(varA / n));
  const stdB = Math.max(2, Math.sqrt(varB / n));

  lumaValues.sort((x, y) => x - y);
  const pickQuantile = (q: number) => {
    if (lumaValues.length === 0) return q;
    const idx = clamp(Math.floor(q * (lumaValues.length - 1)), 0, lumaValues.length - 1);
    return lumaValues[idx];
  };

  const q05 = pickQuantile(0.05);
  const q25 = pickQuantile(0.25);
  const q50 = pickQuantile(0.5);
  const q75 = pickQuantile(0.75);
  const q95 = pickQuantile(0.95);

  const buildZone = (
    name: 'Shadows' | 'Midtones' | 'Highlights',
    acc: typeof zoneAcc.shadows,
    defaultL: number
  ): TonalZoneStats => {
    if (acc.count === 0) {
      const v = Math.round((defaultL / 100) * 255);
      return {
        name,
        rgb: [v, v, v],
        lab: [defaultL, 0, 0],
        hex: rgbToHex(v, v, v),
        share: 0,
      };
    }
    const r255 = Math.round((acc.r / acc.count) * 255);
    const g255 = Math.round((acc.g / acc.count) * 255);
    const b255 = Math.round((acc.b / acc.count) * 255);
    return {
      name,
      rgb: [r255, g255, b255],
      lab: [
        Number((acc.L / acc.count).toFixed(1)),
        Number((acc.a / acc.count).toFixed(1)),
        Number((acc.bLab / acc.count).toFixed(1)),
      ],
      hex: rgbToHex(r255, g255, b255),
      share: Number(((acc.count / n) * 100).toFixed(1)),
    };
  };

  const shadows = buildZone('Shadows', zoneAcc.shadows, 20);
  const midtones = buildZone('Midtones', zoneAcc.midtones, 50);
  const highlights = buildZone('Highlights', zoneAcc.highlights, 85);

  // Extract top 6 non-empty buckets and sort by luminance
  const activeBuckets = buckets
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .sort((a, b) => a.L / a.count - b.L / b.count);

  const palette: PaletteSwatch[] = activeBuckets.map((b) => {
    const r255 = Math.round((b.r / b.count) * 255);
    const g255 = Math.round((b.g / b.count) * 255);
    const b255 = Math.round((b.b / b.count) * 255);
    const lAvg = b.L / b.count;
    return {
      hex: rgbToHex(r255, g255, b255),
      rgb: [r255, g255, b255],
      lab: [
        Number(lAvg.toFixed(1)),
        Number((b.a / b.count).toFixed(1)),
        Number((b.bLab / b.count).toFixed(1)),
      ],
      luminance: Number((lAvg / 100).toFixed(2)),
      population: Number(((b.count / n) * 100).toFixed(1)),
      zone: lAvg < 38 ? 'Shadow' : lAvg <= 70 ? 'Midtone' : 'Highlight',
    };
  });

  // Pad palette if single-color test image
  while (palette.length < 6) {
    const r255 = Math.round(meanR * 255);
    const g255 = Math.round(meanG * 255);
    const b255 = Math.round(meanBl * 255);
    palette.push({
      hex: rgbToHex(r255, g255, b255),
      rgb: [r255, g255, b255],
      lab: [Number(meanL.toFixed(1)), Number(meanA.toFixed(1)), Number(meanB.toFixed(1))],
      luminance: Number((meanL / 100).toFixed(2)),
      population: 0,
      zone: 'Midtone',
    });
  }

  const histogram = computeHistogram(rgba, step);
  const temperatureIndex = clamp(Math.round(meanB * 2.2 + meanA * 0.6), -100, 100);
  const saturationMean = clamp(Math.round((sumSat / n) * 100), 0, 100);
  const dynamicRangeStops = Number(
    clamp(6.0 + (q95 - q05) * 6.5, 4.0, 14.0).toFixed(1)
  );

  return {
    labMean: [meanL, meanA, meanB],
    labStd: [stdL, stdA, stdB],
    rgbMean: [meanR, meanG, meanBl],
    rgbStd: [
      Math.max(0.05, Math.sqrt(varR / n)),
      Math.max(0.05, Math.sqrt(varG / n)),
      Math.max(0.05, Math.sqrt(varBl / n)),
    ],
    quantiles: { q05, q25, q50, q75, q95 },
    zones: { shadows, midtones, highlights },
    palette,
    histogram,
    temperatureIndex,
    saturationMean,
    dynamicRangeStops,
  };
}

/**
 * Evaluates the color transformation for a single normalized sRGB triplet [r, g, b] in [0..1]
 * based on the extracted reference image statistics and mastering parameters.
 */
export function transformColorNode(
  rIn: number,
  gIn: number,
  bIn: number,
  analysis: ImageColorAnalysis,
  params: LutGradingParams
): [number, number, number] {
  const [L0, a0, b0] = rgbToLab(rIn, gIn, bIn);
  const lNorm = clamp01(L0 / 100);

  // Neutral canonical dataset statistics (standard balanced daylight image in LAB)
  const canonicalMeanL = 52;
  const canonicalStdL = 24;
  const canonicalStdChroma = 16;

  const [refMeanL, refMeanA, refMeanB] = analysis.labMean;
  const [refStdL, refStdA, refStdB] = analysis.labStd;

  // Tonal zone weights (smooth cosine/polynomial curves summing to 1)
  const shadowWeight = Math.pow(1 - lNorm, 2.2);
  const highlightWeight = Math.pow(lNorm, 2.2);
  const midtoneWeight = Math.max(0, 1 - shadowWeight - highlightWeight);

  const shadowScale = params.shadowTintStrength / 100;
  const highlightScale = params.highlightTintStrength / 100;

  let L1 = L0;
  let a1 = a0;
  let b1 = b0;

  if (params.algorithm === 'reinhard_lab') {
    // Regulated Reinhard statistical transfer in perceptual LAB space
    // Damp luminance gain so LUT remains smooth and monotonic
    const lGain = clamp(refStdL / canonicalStdL, 0.72, 1.32);
    const lShift = clamp((refMeanL - canonicalMeanL) * 0.45, -18, 18);
    L1 = (L0 - canonicalMeanL) * (0.45 + 0.55 * lGain) + canonicalMeanL + lShift;

    // Chroma scaling + zone-aware chromaticity injection
    const aGain = clamp(refStdA / canonicalStdChroma, 0.65, 1.45);
    const bGain = clamp(refStdB / canonicalStdChroma, 0.65, 1.45);

    // Taper color cast near pure black (L=0) and pure white (L=100) so black/white points stay clean
    const extremityTaper = Math.sin(Math.pow(lNorm, 0.85) * Math.PI);
    const zoneA =
      analysis.zones.shadows.lab[1] * shadowWeight * shadowScale +
      analysis.zones.midtones.lab[1] * midtoneWeight +
      analysis.zones.highlights.lab[1] * highlightWeight * highlightScale;
    const zoneB =
      analysis.zones.shadows.lab[2] * shadowWeight * shadowScale +
      analysis.zones.midtones.lab[2] * midtoneWeight +
      analysis.zones.highlights.lab[2] * highlightWeight * highlightScale;

    a1 = a0 * (0.4 + 0.6 * aGain) + (refMeanA * 0.45 + zoneA * 0.55) * (0.35 + 0.65 * extremityTaper);
    b1 = b0 * (0.4 + 0.6 * bGain) + (refMeanB * 0.45 + zoneB * 0.55) * (0.35 + 0.65 * extremityTaper);
  } else if (params.algorithm === 'zone_split_grade') {
    // 3-Way Cinema Zone Split-Tone Grade: preserves input contrast structure while imparting
    // the reference's shadow/midtone/highlight color harmony and tonal pivot
    const midPivotShift = clamp((analysis.quantiles.q50 - 0.5) * 28, -14, 14);
    L1 = L0 + midPivotShift * Math.sin(lNorm * Math.PI);

    const sA = analysis.zones.shadows.lab[1] * shadowScale;
    const sB = analysis.zones.shadows.lab[2] * shadowScale;
    const mA = analysis.zones.midtones.lab[1];
    const mB = analysis.zones.midtones.lab[2];
    const hA = analysis.zones.highlights.lab[1] * highlightScale;
    const hB = analysis.zones.highlights.lab[2] * highlightScale;

    const extremityGuard = 0.25 + 0.75 * Math.sin(lNorm * Math.PI);
    a1 = a0 + (sA * shadowWeight + mA * midtoneWeight + hA * highlightWeight) * 0.85 * extremityGuard;
    b1 = b0 + (sB * shadowWeight + mB * midtoneWeight + hB * highlightWeight) * 0.85 * extremityGuard;
  } else {
    // 'curve_chroma_match': Matches cumulative luminance quantile curve + harmonic chroma
    const { q05, q25, q50, q75, q95 } = analysis.quantiles;
    // Piecewise smooth quantile interpolation
    let mappedLuma = lNorm;
    if (lNorm < 0.25) {
      const t = lNorm / 0.25;
      mappedLuma = q05 * 0.4 + t * (q25 - q05 * 0.4);
    } else if (lNorm < 0.5) {
      const t = (lNorm - 0.25) / 0.25;
      mappedLuma = q25 + t * (q50 - q25);
    } else if (lNorm < 0.75) {
      const t = (lNorm - 0.5) / 0.25;
      mappedLuma = q50 + t * (q75 - q50);
    } else {
      const t = (lNorm - 0.75) / 0.25;
      mappedLuma = q75 + t * (Math.max(0.88, q95) - q75);
    }
    L1 = (0.35 * lNorm + 0.65 * mappedLuma) * 100;

    const chromaRatio = clamp(analysis.saturationMean / 38, 0.7, 1.4);
    const zoneA =
      analysis.zones.shadows.lab[1] * shadowWeight * shadowScale +
      analysis.zones.midtones.lab[1] * midtoneWeight +
      analysis.zones.highlights.lab[1] * highlightWeight * highlightScale;
    const zoneB =
      analysis.zones.shadows.lab[2] * shadowWeight * shadowScale +
      analysis.zones.midtones.lab[2] * midtoneWeight +
      analysis.zones.highlights.lab[2] * highlightWeight * highlightScale;

    a1 = a0 * chromaRatio + zoneA * 0.65;
    b1 = b0 * chromaRatio + zoneB * 0.65;
  }

  // Mastering: Contrast S-Curve in L (0..100)
  let lMaster = clamp(L1, 0, 100) / 100;
  if (params.contrast !== 0) {
    const cFactor = params.contrast / 100; // -0.5 to +0.5
    const centered = lMaster - 0.5;
    // Smooth sigmoid-like S-curve that fixes endpoints 0 and 1
    lMaster = clamp01(lMaster + cFactor * 1.4 * centered * (1 - 4 * centered * centered));
  }

  // Mastering: Black Lift (matte film toe)
  if (params.blackLift > 0) {
    const lift = (params.blackLift / 100) * 0.22;
    lMaster = lift + lMaster * (1 - lift * 0.65);
  }

  // Mastering: Highlight Roll-off (film shoulder compression)
  if (params.highlightRolloff > 0 && lMaster > 0.6) {
    const roll = (params.highlightRolloff / 100) * 0.25;
    const t = (lMaster - 0.6) / 0.4;
    lMaster = lMaster - roll * (t * t);
  }

  L1 = clamp(lMaster * 100, 0, 100);

  // Mastering: Temperature (b* axis) and Tint (a* axis) shifts
  if (params.tempShift !== 0) {
    b1 += params.tempShift * 0.45;
  }
  if (params.tintShift !== 0) {
    a1 += params.tintShift * 0.45;
  }

  // Mastering: Saturation multiplier in CIE a*b*
  if (params.saturation !== 0) {
    const satMult = Math.max(0, 1 + params.saturation / 65);
    a1 *= satMult;
    b1 *= satMult;
  }

  // Skin-Tone Protection: preserve natural skin chromaticity & prevent alien casts
  if (params.skinProtection > 0) {
    const skinWeight = computeSkinToneWeight(rIn, gIn, bIn) * (params.skinProtection / 100);
    if (skinWeight > 0.01) {
      L1 = L1 * (1 - skinWeight * 0.45) + L0 * (skinWeight * 0.45);
      a1 = a1 * (1 - skinWeight * 0.82) + a0 * (skinWeight * 0.82);
      b1 = b1 * (1 - skinWeight * 0.82) + b0 * (skinWeight * 0.82);
    }
  }

  const [rGraded, gGraded, bGraded] = labToRgb(L1, a1, b1);

  // Blend with Identity LUT using Strength (0..100%)
  const mix = clamp01(params.strength / 100);
  const rOut = clamp01(rIn + (rGraded - rIn) * mix);
  const gOut = clamp01(gIn + (gGraded - gIn) * mix);
  const bOut = clamp01(bIn + (bGraded - bIn) * mix);

  return [rOut, gOut, bOut];
}

interface PrecomputedLatticeCache {
  rIn: Float32Array;
  gIn: Float32Array;
  bIn: Float32Array;
  L0: Float32Array;
  a0: Float32Array;
  b0: Float32Array;
  lNorm: Float32Array;
  shadowWeight: Float32Array;
  midtoneWeight: Float32Array;
  highlightWeight: Float32Array;
  extremityTaper: Float32Array;
  extremityGuard: Float32Array;
  sinLNormPi: Float32Array;
  skinBase: Float32Array;
}

const LATTICE_CACHE = new Map<LutSize, PrecomputedLatticeCache>();

function getLatticeCache(size: LutSize): PrecomputedLatticeCache {
  const existing = LATTICE_CACHE.get(size);
  if (existing) return existing;

  const totalNodes = size * size * size;
  const rInArr = new Float32Array(totalNodes);
  const gInArr = new Float32Array(totalNodes);
  const bInArr = new Float32Array(totalNodes);
  const L0Arr = new Float32Array(totalNodes);
  const a0Arr = new Float32Array(totalNodes);
  const b0Arr = new Float32Array(totalNodes);
  const lNormArr = new Float32Array(totalNodes);
  const shadowWArr = new Float32Array(totalNodes);
  const midtoneWArr = new Float32Array(totalNodes);
  const highlightWArr = new Float32Array(totalNodes);
  const taperArr = new Float32Array(totalNodes);
  const guardArr = new Float32Array(totalNodes);
  const sinArr = new Float32Array(totalNodes);
  const skinArr = new Float32Array(totalNodes);

  const denom = size - 1;
  let idx = 0;
  for (let b = 0; b < size; b++) {
    const bVal = b / denom;
    for (let g = 0; g < size; g++) {
      const gVal = g / denom;
      for (let r = 0; r < size; r++) {
        const rVal = r / denom;
        const [L0, a0, b0] = rgbToLab(rVal, gVal, bVal);
        const lNorm = clamp01(L0 / 100);
        const sw = Math.pow(1 - lNorm, 2.2);
        const hw = Math.pow(lNorm, 2.2);
        const mw = Math.max(0, 1 - sw - hw);
        const sinL = Math.sin(lNorm * Math.PI);

        rInArr[idx] = rVal;
        gInArr[idx] = gVal;
        bInArr[idx] = bVal;
        L0Arr[idx] = L0;
        a0Arr[idx] = a0;
        b0Arr[idx] = b0;
        lNormArr[idx] = lNorm;
        shadowWArr[idx] = sw;
        midtoneWArr[idx] = mw;
        highlightWArr[idx] = hw;
        taperArr[idx] = Math.sin(Math.pow(lNorm, 0.85) * Math.PI);
        guardArr[idx] = 0.25 + 0.75 * sinL;
        sinArr[idx] = sinL;
        skinArr[idx] = computeSkinToneWeight(rVal, gVal, bVal);
        idx++;
      }
    }
  }

  const cache: PrecomputedLatticeCache = {
    rIn: rInArr,
    gIn: gInArr,
    bIn: bInArr,
    L0: L0Arr,
    a0: a0Arr,
    b0: b0Arr,
    lNorm: lNormArr,
    shadowWeight: shadowWArr,
    midtoneWeight: midtoneWArr,
    highlightWeight: highlightWArr,
    extremityTaper: taperArr,
    extremityGuard: guardArr,
    sinLNormPi: sinArr,
    skinBase: skinArr,
  };
  LATTICE_CACHE.set(size, cache);
  return cache;
}

/**
 * Generates a complete 3D LUT Lattice in standard .cube memory order
 * (Red changes fastest, Green middle, Blue slowest) using pre-cached SIMD-friendly Float32Arrays.
 */
export function generate3DLut(
  analysis: ImageColorAnalysis,
  params: LutGradingParams
): Lut3D {
  const size = params.size;
  const totalNodes = size * size * size;
  const data = new Float32Array(totalNodes * 3);
  const cache = getLatticeCache(size);

  const canonicalMeanL = 52;
  const canonicalStdL = 24;
  const canonicalStdChroma = 16;

  const [refMeanL, refMeanA, refMeanB] = analysis.labMean;
  const [refStdL, refStdA, refStdB] = analysis.labStd;

  const shadowScale = params.shadowTintStrength / 100;
  const highlightScale = params.highlightTintStrength / 100;

  const sLabA = analysis.zones.shadows.lab[1] * shadowScale;
  const sLabB = analysis.zones.shadows.lab[2] * shadowScale;
  const mLabA = analysis.zones.midtones.lab[1];
  const mLabB = analysis.zones.midtones.lab[2];
  const hLabA = analysis.zones.highlights.lab[1] * highlightScale;
  const hLabB = analysis.zones.highlights.lab[2] * highlightScale;

  const lGain = clamp(refStdL / canonicalStdL, 0.72, 1.32);
  const lShift = clamp((refMeanL - canonicalMeanL) * 0.45, -18, 18);
  const aGain = 0.4 + 0.6 * clamp(refStdA / canonicalStdChroma, 0.65, 1.45);
  const bGain = 0.4 + 0.6 * clamp(refStdB / canonicalStdChroma, 0.65, 1.45);

  const midPivotShift = clamp((analysis.quantiles.q50 - 0.5) * 28, -14, 14);
  const chromaRatio = clamp(analysis.saturationMean / 38, 0.7, 1.4);
  const { q05, q25, q50, q75, q95 } = analysis.quantiles;
  const q95Clamped = Math.max(0.88, q95);

  const cFactor = params.contrast / 100;
  const lift = (params.blackLift / 100) * 0.22;
  const roll = (params.highlightRolloff / 100) * 0.25;
  const tempAdd = params.tempShift * 0.45;
  const tintAdd = params.tintShift * 0.45;
  const satMult = params.saturation !== 0 ? Math.max(0, 1 + params.saturation / 65) : 1;
  const skinScale = params.skinProtection / 100;
  const mix = clamp01(params.strength / 100);
  const algMode =
    params.algorithm === 'reinhard_lab'
      ? 0
      : params.algorithm === 'zone_split_grade'
      ? 1
      : 2;

  let sumDeltaE = 0;
  let maxChromaShift = 0;
  let clippedCount = 0;
  let sampledCount = 0;

  const {
    rIn: rInArr,
    gIn: gInArr,
    bIn: bInArr,
    L0: L0Arr,
    a0: a0Arr,
    b0: b0Arr,
    lNorm: lNormArr,
    shadowWeight: swArr,
    midtoneWeight: mwArr,
    highlightWeight: hwArr,
    extremityTaper: taperArr,
    extremityGuard: guardArr,
    sinLNormPi: sinArr,
    skinBase: skinArr,
  } = cache;

  for (let idx = 0, ptr = 0; idx < totalNodes; idx++, ptr += 3) {
    const rIn = rInArr[idx];
    const gIn = gInArr[idx];
    const bIn = bInArr[idx];
    const L0 = L0Arr[idx];
    const a0 = a0Arr[idx];
    const b0 = b0Arr[idx];
    const lNorm = lNormArr[idx];
    const sw = swArr[idx];
    const mw = mwArr[idx];
    const hw = hwArr[idx];

    const zoneA = sLabA * sw + mLabA * mw + hLabA * hw;
    const zoneB = sLabB * sw + mLabB * mw + hLabB * hw;

    let L1: number;
    let a1: number;
    let b1: number;

    if (algMode === 0) {
      L1 = (L0 - canonicalMeanL) * (0.45 + 0.55 * lGain) + canonicalMeanL + lShift;
      const taper = 0.35 + 0.65 * taperArr[idx];
      a1 = a0 * aGain + (refMeanA * 0.45 + zoneA * 0.55) * taper;
      b1 = b0 * bGain + (refMeanB * 0.45 + zoneB * 0.55) * taper;
    } else if (algMode === 1) {
      L1 = L0 + midPivotShift * sinArr[idx];
      const guard = guardArr[idx] * 0.85;
      a1 = a0 + zoneA * guard;
      b1 = b0 + zoneB * guard;
    } else {
      let mappedLuma: number;
      if (lNorm < 0.25) {
        mappedLuma = q05 * 0.4 + (lNorm * 4) * (q25 - q05 * 0.4);
      } else if (lNorm < 0.5) {
        mappedLuma = q25 + ((lNorm - 0.25) * 4) * (q50 - q25);
      } else if (lNorm < 0.75) {
        mappedLuma = q50 + ((lNorm - 0.5) * 4) * (q75 - q50);
      } else {
        mappedLuma = q75 + ((lNorm - 0.75) * 4) * (q95Clamped - q75);
      }
      L1 = (0.35 * lNorm + 0.65 * mappedLuma) * 100;
      a1 = a0 * chromaRatio + zoneA * 0.65;
      b1 = b0 * chromaRatio + zoneB * 0.65;
    }

    let lMaster = clamp(L1, 0, 100) * 0.01;
    if (cFactor !== 0) {
      const centered = lMaster - 0.5;
      lMaster = clamp01(lMaster + cFactor * 1.4 * centered * (1 - 4 * centered * centered));
    }
    if (lift > 0) {
      lMaster = lift + lMaster * (1 - lift * 0.65);
    }
    if (roll > 0 && lMaster > 0.6) {
      const t = (lMaster - 0.6) * 2.5;
      lMaster = lMaster - roll * (t * t);
    }
    L1 = clamp(lMaster * 100, 0, 100);

    a1 = (a1 + tintAdd) * satMult;
    b1 = (b1 + tempAdd) * satMult;

    if (skinScale > 0) {
      const skinWeight = skinArr[idx] * skinScale;
      if (skinWeight > 0.01) {
        L1 = L1 * (1 - skinWeight * 0.45) + L0 * (skinWeight * 0.45);
        a1 = a1 * (1 - skinWeight * 0.82) + a0 * (skinWeight * 0.82);
        b1 = b1 * (1 - skinWeight * 0.82) + b0 * (skinWeight * 0.82);
      }
    }

    const [rGraded, gGraded, bGraded] = labToRgb(L1, a1, b1);
    const rOut = clamp01(rIn + (rGraded - rIn) * mix);
    const gOut = clamp01(gIn + (gGraded - gIn) * mix);
    const bOut = clamp01(bIn + (bGraded - bIn) * mix);

    data[ptr] = rOut;
    data[ptr + 1] = gOut;
    data[ptr + 2] = bOut;

    if ((idx & 31) === 0) {
      const lOut = L0 + (L1 - L0) * mix;
      const aOut = a0 + (a1 - a0) * mix;
      const bOutLab = b0 + (b1 - b0) * mix;
      const dL = lOut - L0;
      const dA = aOut - a0;
      const dB = bOutLab - b0;
      const dChromaSq = dA * dA + dB * dB;
      sumDeltaE += Math.sqrt(dL * dL + dChromaSq);
      const dChroma = Math.sqrt(dChromaSq);
      if (dChroma > maxChromaShift) maxChromaShift = dChroma;
      sampledCount++;
    }

    if (
      rOut <= 0.0001 ||
      rOut >= 0.9999 ||
      gOut <= 0.0001 ||
      gOut >= 0.9999 ||
      bOut <= 0.0001 ||
      bOut >= 0.9999
    ) {
      if (rIn > 0.02 && rIn < 0.98 && gIn > 0.02 && gIn < 0.98 && bIn > 0.02 && bIn < 0.98) {
        clippedCount++;
      }
    }
  }

  // Sample 64-point 1D transfer curves along the neutral diagonal (R=G=B=t)
  const curveSteps = 64;
  const rCurve: number[] = [];
  const gCurve: number[] = [];
  const bCurve: number[] = [];
  const lumaCurve: number[] = [];

  const tempLut: Lut3D = {
    title: params.title,
    size,
    data,
    transferCurves: { r: [], g: [], b: [], luma: [] },
    metrics: { avgDeltaE: 0, maxChromaShift: 0, gamutClippedPercent: 0, totalNodes },
  };

  for (let i = 0; i < curveSteps; i++) {
    const t = i / (curveSteps - 1);
    const [ro, go, bo] = sampleLutTrilinear(tempLut, t, t, t);
    rCurve.push(Number(ro.toFixed(4)));
    gCurve.push(Number(go.toFixed(4)));
    bCurve.push(Number(bo.toFixed(4)));
    lumaCurve.push(Number((0.2126 * ro + 0.7152 * go + 0.0722 * bo).toFixed(4)));
  }

  const sampledNodes = Math.max(1, sampledCount);
  return {
    title: params.title,
    size,
    data,
    transferCurves: {
      r: rCurve,
      g: gCurve,
      b: bCurve,
      luma: lumaCurve,
    },
    metrics: {
      avgDeltaE: Number((sumDeltaE / sampledNodes).toFixed(2)),
      maxChromaShift: Number(maxChromaShift.toFixed(2)),
      gamutClippedPercent: Number(((clippedCount / totalNodes) * 100).toFixed(2)),
      totalNodes,
    },
  };
}

/**
 * Evaluates a 3D LUT at any continuous sRGB input [r, g, b] in [0..1]
 * using hardware-equivalent 8-corner Trilinear Interpolation.
 */
export function sampleLutTrilinear(
  lut: Lut3D,
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const size = lut.size;
  const maxIdx = size - 1;
  const data = lut.data;

  const rx = clamp01(r) * maxIdx;
  const gx = clamp01(g) * maxIdx;
  const bx = clamp01(b) * maxIdx;

  const r0 = Math.floor(rx);
  const g0 = Math.floor(gx);
  const b0 = Math.floor(bx);

  const r1 = Math.min(maxIdx, r0 + 1);
  const g1 = Math.min(maxIdx, g0 + 1);
  const b1 = Math.min(maxIdx, b0 + 1);

  const fr = rx - r0;
  const fg = gx - g0;
  const fb = bx - b0;

  const idx = (ri: number, gi: number, bi: number) => ((bi * size + gi) * size + ri) * 3;

  const c000 = idx(r0, g0, b0);
  const c100 = idx(r1, g0, b0);
  const c010 = idx(r0, g1, b0);
  const c110 = idx(r1, g1, b0);
  const c001 = idx(r0, g0, b1);
  const c101 = idx(r1, g0, b1);
  const c011 = idx(r0, g1, b1);
  const c111 = idx(r1, g1, b1);

  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    const v00 = data[c000 + ch] * (1 - fr) + data[c100 + ch] * fr;
    const v01 = data[c001 + ch] * (1 - fr) + data[c101 + ch] * fr;
    const v10 = data[c010 + ch] * (1 - fr) + data[c110 + ch] * fr;
    const v11 = data[c011 + ch] * (1 - fr) + data[c111 + ch] * fr;

    const v0 = v00 * (1 - fg) + v10 * fg;
    const v1 = v01 * (1 - fg) + v11 * fg;

    out[ch] = clamp01(v0 * (1 - fb) + v1 * fb);
  }

  return out;
}

/**
 * Applies a 3D LUT via trilinear interpolation to an RGBA pixel buffer
 * and returns a new graded RGBA buffer.
 */
export function applyLutToRgbaBuffer(
  srcRgba: Uint8ClampedArray,
  lut: Lut3D
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(srcRgba.length);
  const size = lut.size;
  const maxIdx = size - 1;
  const data = lut.data;
  const sizeSq = size * size;

  for (let i = 0; i < srcRgba.length; i += 4) {
    const rx = (srcRgba[i] / 255) * maxIdx;
    const gx = (srcRgba[i + 1] / 255) * maxIdx;
    const bx = (srcRgba[i + 2] / 255) * maxIdx;

    const r0 = rx | 0;
    const g0 = gx | 0;
    const b0 = bx | 0;

    const r1 = r0 < maxIdx ? r0 + 1 : maxIdx;
    const g1 = g0 < maxIdx ? g0 + 1 : maxIdx;
    const b1 = b0 < maxIdx ? b0 + 1 : maxIdx;

    const fr = rx - r0;
    const fg = gx - g0;
    const fb = bx - b0;
    const ifr = 1 - fr;
    const ifg = 1 - fg;
    const ifb = 1 - fb;

    const b0Offset = b0 * sizeSq;
    const b1Offset = b1 * sizeSq;
    const g0Offset = g0 * size;
    const g1Offset = g1 * size;

    const c000 = (b0Offset + g0Offset + r0) * 3;
    const c100 = (b0Offset + g0Offset + r1) * 3;
    const c010 = (b0Offset + g1Offset + r0) * 3;
    const c110 = (b0Offset + g1Offset + r1) * 3;
    const c001 = (b1Offset + g0Offset + r0) * 3;
    const c101 = (b1Offset + g0Offset + r1) * 3;
    const c011 = (b1Offset + g1Offset + r0) * 3;
    const c111 = (b1Offset + g1Offset + r1) * 3;

    // Unrolled trilinear weights
    const w000 = ifr * ifg * ifb;
    const w100 = fr * ifg * ifb;
    const w010 = ifr * fg * ifb;
    const w110 = fr * fg * ifb;
    const w001 = ifr * ifg * fb;
    const w101 = fr * ifg * fb;
    const w011 = ifr * fg * fb;
    const w111 = fr * fg * fb;

    const rOut =
      data[c000] * w000 +
      data[c100] * w100 +
      data[c010] * w010 +
      data[c110] * w110 +
      data[c001] * w001 +
      data[c101] * w101 +
      data[c011] * w011 +
      data[c111] * w111;

    const gOut =
      data[c000 + 1] * w000 +
      data[c100 + 1] * w100 +
      data[c010 + 1] * w010 +
      data[c110 + 1] * w110 +
      data[c001 + 1] * w001 +
      data[c101 + 1] * w101 +
      data[c011 + 1] * w011 +
      data[c111 + 1] * w111;

    const bOut =
      data[c000 + 2] * w000 +
      data[c100 + 2] * w100 +
      data[c010 + 2] * w010 +
      data[c110 + 2] * w110 +
      data[c001 + 2] * w001 +
      data[c101 + 2] * w101 +
      data[c011 + 2] * w011 +
      data[c111 + 2] * w111;

    dst[i] = Math.round(clamp01(rOut) * 255);
    dst[i + 1] = Math.round(clamp01(gOut) * 255);
    dst[i + 2] = Math.round(clamp01(bOut) * 255);
    dst[i + 3] = srcRgba[i + 3];
  }

  return dst;
}

/**
 * Serializes a Lut3D object into an Adobe/Resolve-compliant .cube file string.
 */
export function serializeToCubeFormat(
  lut: Lut3D,
  metadata?: { algorithm?: string; strength?: number }
): string {
  const cleanTitle = (lut.title || 'ChromaCube_LUT')
    .replace(/["\r\n]/g, '')
    .trim()
    .slice(0, 80);

  const lines: string[] = [
    '# Created by ChromaCube Studio — 3D Color Science Engine',
    `# Grid Size: ${lut.size}x${lut.size}x${lut.size} (${lut.metrics.totalNodes} nodes)`,
  ];

  if (metadata?.algorithm) {
    lines.push(`# Extraction Mode: ${metadata.algorithm} | Intensity: ${metadata.strength ?? 100}%`);
  }

  lines.push(
    `TITLE "${cleanTitle}"`,
    `LUT_3D_SIZE ${lut.size}`,
    'DOMAIN_MIN 0.000000 0.000000 0.000000',
    'DOMAIN_MAX 1.000000 1.000000 1.000000'
  );

  const data = lut.data;
  for (let i = 0; i < data.length; i += 3) {
    const r = clamp01(data[i]).toFixed(6);
    const g = clamp01(data[i + 1]).toFixed(6);
    const b = clamp01(data[i + 2]).toFixed(6);
    lines.push(`${r} ${g} ${b}`);
  }

  return lines.join('\n') + '\n';
}

/**
 * O(1) sub-millisecond preview snippet and validation summary for live UI updates
 * without formatting all 35,937+ lines on every slider movement.
 */
export function buildFastCubePreviewAndStats(
  lut: Lut3D,
  metadata?: { algorithm?: string; strength?: number }
): { previewText: string; validation: CubeValidationResult } {
  const cleanTitle = (lut.title || 'ChromaCube_LUT')
    .replace(/["\r\n]/g, '')
    .trim()
    .slice(0, 80);

  const headLines: string[] = [
    '# Created by ChromaCube Studio — 3D Color Science Engine',
    `# Grid Size: ${lut.size}x${lut.size}x${lut.size} (${lut.metrics.totalNodes} nodes)`,
  ];

  if (metadata?.algorithm) {
    headLines.push(
      `# Extraction Mode: ${metadata.algorithm} | Intensity: ${metadata.strength ?? 100}%`
    );
  }

  headLines.push(
    `TITLE "${cleanTitle}"`,
    `LUT_3D_SIZE ${lut.size}`,
    'DOMAIN_MIN 0.000000 0.000000 0.000000',
    'DOMAIN_MAX 1.000000 1.000000 1.000000'
  );

  const data = lut.data;
  const totalTriplets = data.length / 3;
  const headCount = Math.min(14, totalTriplets);
  for (let t = 0; t < headCount; t++) {
    const i = t * 3;
    headLines.push(
      `${clamp01(data[i]).toFixed(6)} ${clamp01(data[i + 1]).toFixed(6)} ${clamp01(data[i + 2]).toFixed(6)}`
    );
  }

  const tailLines: string[] = [];
  const tailStart = Math.max(headCount, totalTriplets - 8);
  for (let t = tailStart; t < totalTriplets; t++) {
    const i = t * 3;
    tailLines.push(
      `${clamp01(data[i]).toFixed(6)} ${clamp01(data[i + 1]).toFixed(6)} ${clamp01(data[i + 2]).toFixed(6)}`
    );
  }

  const omitted = Math.max(0, totalTriplets - headCount - tailLines.length);
  const previewText = `${headLines.join('\n')}\n# ... [${omitted.toLocaleString()} intermediate R-G-B lattice nodes omitted in preview] ...\n${tailLines.join('\n')}`;

  return {
    previewText,
    validation: {
      valid: totalTriplets === lut.size ** 3,
      size: lut.size,
      title: cleanTitle,
      tripletCount: totalTriplets,
      expectedCount: lut.size ** 3,
      minVal: 0,
      maxVal: 1,
    },
  };
}

/**
 * Parses and validates an Adobe .cube 3D LUT file string.
 */
export function validateCubeString(cubeText: string): CubeValidationResult {
  const rawLines = cubeText.split(/\r?\n/);
  let size = 0;
  let title = 'Untitled';
  let tripletCount = 0;
  let minVal = Infinity;
  let maxVal = -Infinity;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('TITLE')) {
      const match = line.match(/TITLE\s+"([^"]*)"/i);
      if (match) title = match[1];
      continue;
    }
    if (line.startsWith('LUT_3D_SIZE')) {
      const parts = line.split(/\s+/);
      size = parseInt(parts[1], 10);
      if (Number.isNaN(size) || size < 2 || size > 256) {
        return {
          valid: false,
          size: 0,
          title,
          tripletCount,
          expectedCount: 0,
          minVal: 0,
          maxVal: 0,
          error: `Invalid LUT_3D_SIZE: ${parts[1]}`,
        };
      }
      continue;
    }
    if (line.startsWith('DOMAIN_MIN') || line.startsWith('DOMAIN_MAX') || line.startsWith('LUT_1D_SIZE')) {
      continue;
    }

    // Parse R G B triplet
    const parts = line.split(/\s+/);
    if (parts.length !== 3) {
      return {
        valid: false,
        size,
        title,
        tripletCount,
        expectedCount: size ** 3,
        minVal,
        maxVal,
        error: `Malformed data line ${i + 1}: "${line}"`,
      };
    }

    const r = parseFloat(parts[0]);
    const g = parseFloat(parts[1]);
    const b = parseFloat(parts[2]);

    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return {
        valid: false,
        size,
        title,
        tripletCount,
        expectedCount: size ** 3,
        minVal,
        maxVal,
        error: `NaN value on line ${i + 1}`,
      };
    }

    minVal = Math.min(minVal, r, g, b);
    maxVal = Math.max(maxVal, r, g, b);
    tripletCount++;
  }

  const expectedCount = size > 0 ? size * size * size : 0;
  const valid =
    size > 0 &&
    tripletCount === expectedCount &&
    minVal >= -0.0001 &&
    maxVal <= 1.0001;

  return {
    valid,
    size,
    title,
    tripletCount,
    expectedCount,
    minVal: minVal === Infinity ? 0 : minVal,
    maxVal: maxVal === -Infinity ? 0 : maxVal,
    error: valid
      ? undefined
      : `Expected ${expectedCount} triplets for size ${size}, found ${tripletCount}`,
  };
}

/**
 * Generates a 2D Hald CLUT RGBA buffer (e.g., level=6 -> 216x216 px, level=8 -> 512x512 px)
 * transformed through the 3D LUT.
 */
export function generateHaldClutRgba(
  lut: Lut3D,
  level: 6 | 8 = 6
): { width: number; height: number; rgba: Uint8ClampedArray } {
  const cubeSize = level * level; // 36 or 64
  const imgDim = level * level * level; // 216 or 512
  const rgba = new Uint8ClampedArray(imgDim * imgDim * 4);
  const maxC = cubeSize - 1;

  let ptr = 0;
  for (let y = 0; y < imgDim; y++) {
    for (let x = 0; x < imgDim; x++) {
      const pixelIndex = y * imgDim + x;
      const rIdx = pixelIndex % cubeSize;
      const gIdx = Math.floor(pixelIndex / cubeSize) % cubeSize;
      const bIdx = Math.floor(pixelIndex / (cubeSize * cubeSize));

      const rIn = rIdx / maxC;
      const gIn = gIdx / maxC;
      const bIn = bIdx / maxC;

      const [rOut, gOut, bOut] = sampleLutTrilinear(lut, rIn, gIn, bIn);

      rgba[ptr] = Math.round(rOut * 255);
      rgba[ptr + 1] = Math.round(gOut * 255);
      rgba[ptr + 2] = Math.round(bOut * 255);
      rgba[ptr + 3] = 255;
      ptr += 4;
    }
  }

  return { width: imgDim, height: imgDim, rgba };
}
