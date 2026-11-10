import type { LutGradingParams } from './lutEngine';

export interface ReferencePreset {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  filmStock: string;
  imageUrl: string;
  recommendedParams: Partial<LutGradingParams>;
}

export interface TargetScenePreset {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  isProceduralChart?: boolean;
}

export interface SavedLookItem {
  id: string;
  name: string;
  createdAt: string;
  referenceName: string;
  params: LutGradingParams;
  paletteHexes: string[];
  avgDeltaE: number;
}

export const REFERENCE_PRESETS: ReferencePreset[] = [
  {
    id: 'cinema-teal-orange',
    name: 'Anamorphic Rain Dusk',
    subtitle: 'Tungsten amber highlights · Deep cyan-teal twilight shadows',
    category: 'Cinema Blockbuster',
    filmStock: 'Kodak Vision3 500T 5219',
    imageUrl: '/src/assets/images/cinema_teal_orange_ref_1794298126283.jpg',
    recommendedParams: {
      title: 'Vision3_500T_TealAmber',
      algorithm: 'reinhard_lab',
      strength: 88,
      contrast: 12,
      saturation: 8,
      blackLift: 4,
      highlightRolloff: 18,
      skinProtection: 70,
      shadowTintStrength: 110,
      highlightTintStrength: 105,
    },
  },
  {
    id: 'kodak-gold-terrace',
    name: 'Mediterranean Portra Golden',
    subtitle: 'Honey-warm highlights · Soft matte lifted shadows · Terracotta warmth',
    category: 'Analog Film Stock',
    filmStock: 'Kodak Portra 400 (+1 Stop)',
    imageUrl: '/src/assets/images/kodak_gold_portrait_ref_1794298128793.jpg',
    recommendedParams: {
      title: 'Portra_400_GoldenHour',
      algorithm: 'zone_split_grade',
      strength: 85,
      contrast: 5,
      saturation: 10,
      blackLift: 9,
      highlightRolloff: 24,
      skinProtection: 75,
      shadowTintStrength: 95,
      highlightTintStrength: 115,
    },
  },
  {
    id: 'moody-nordic-fjord',
    name: 'Nordic Fjord Bleach Bypass',
    subtitle: 'Muted sage foliage · Cool slate shadows · Crisp silver fog roll-off',
    category: 'Editorial Documentary',
    filmStock: 'Fuji Eterna 250D Bleach',
    imageUrl: '/src/assets/images/moody_nordic_forest_ref_1794298129202.jpg',
    recommendedParams: {
      title: 'Eterna_250D_NordicSlate',
      algorithm: 'curve_chroma_match',
      strength: 82,
      contrast: 16,
      saturation: -14,
      blackLift: 3,
      highlightRolloff: 14,
      skinProtection: 60,
      shadowTintStrength: 105,
      highlightTintStrength: 90,
    },
  },
];

export const TARGET_SCENE_PRESETS: TargetScenePreset[] = [
  {
    id: 'target-daylight-villa',
    name: 'Daylight Road & Stone Villa',
    description: 'Balanced Rec.709 daylight exposure with crimson car paint, foliage, sky, and warm stone',
    imageUrl: '/src/assets/images/neutral_target_daylight_1794298129467.jpg',
  },
  {
    id: 'target-terrace-portrait',
    name: 'Coastal Terrace Portrait',
    description: 'Skin tones, linen fabric, sea horizon, and warm afternoon light',
    imageUrl: '/src/assets/images/kodak_gold_portrait_ref_1794298128793.jpg',
  },
  {
    id: 'target-nordic-landscape',
    name: 'Misty Mountain Fjord',
    description: 'High dynamic range mist, deep forest greens, and water reflections',
    imageUrl: '/src/assets/images/moody_nordic_forest_ref_1794298129202.jpg',
  },
  {
    id: 'target-colorchecker-chart',
    name: '24-Patch ColorChecker & Grayscale Ramp',
    description: 'Synthetic Macbeth calibration chart + continuous step wedge & hue sweep',
    imageUrl: 'procedural://colorchecker',
    isProceduralChart: true,
  },
];

/**
 * Renders a crisp 24-Patch Macbeth ColorChecker + Continuous Luminance & Hue Test Chart
 * onto an HTMLCanvasElement for evaluating LUT gamut behavior and gradient smoothness.
 */
export function drawProceduralTestChart(canvas: HTMLCanvasElement, width = 960, height = 540): void {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Neutral 18% gray surround background
  ctx.fillStyle = '#3A3D42';
  ctx.fillRect(0, 0, width, height);

  // Classic 24 Macbeth ColorChecker sRGB approximations (4 rows x 6 cols)
  const patches = [
    // Row 1: Natural / Skin / Sky / Foliage
    '#735244', '#C29682', '#627A9D', '#576C43', '#8580B1', '#67BDAA',
    // Row 2: Secondary & Warm/Cool Saturated
    '#D67E2C', '#505BA6', '#C15A63', '#5E3C6C', '#9DBC40', '#E0A32E',
    // Row 3: Primary RGBCMY
    '#383D96', '#469449', '#AF363C', '#E7C71F', '#BB5695', '#0885A1',
    // Row 4: 6-step Neutral Grayscale from White to Black
    '#F3F3F2', '#C8C8C8', '#A0A0A0', '#7A7A79', '#555555', '#343434',
  ];

  const padX = 42;
  const padY = 32;
  const chartW = width - padX * 2;
  const chartH = Math.floor(height * 0.68);
  const cols = 6;
  const rows = 4;
  const gap = 10;
  const cellW = Math.floor((chartW - gap * (cols - 1)) / cols);
  const cellH = Math.floor((chartH - gap * (rows - 1)) / rows);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padX + c * (cellW + gap);
      const y = padY + r * (cellH + gap);
      ctx.fillStyle = patches[r * cols + c];
      ctx.fillRect(x, y, cellW, cellH);
      ctx.strokeStyle = '#1E2024';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cellW, cellH);
    }
  }

  // Bottom 1: Continuous Full-Spectrum Hue Gradient Ramp
  const rampY1 = padY + chartH + 22;
  const rampH = 38;
  for (let x = 0; x < chartW; x++) {
    const hue = Math.round((x / chartW) * 360);
    ctx.fillStyle = `hsl(${hue}, 82%, 52%)`;
    ctx.fillRect(padX + x, rampY1, 1, rampH);
  }

  // Bottom 2: Continuous 0..255 Linear Grayscale Ramp (to inspect LUT banding or toe/shoulder)
  const rampY2 = rampY1 + rampH + 14;
  for (let x = 0; x < chartW; x++) {
    const v = Math.round((x / chartW) * 255);
    ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
    ctx.fillRect(padX + x, rampY2, 1, rampH);
  }
}
