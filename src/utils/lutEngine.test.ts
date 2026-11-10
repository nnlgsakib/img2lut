import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rgbToLab,
  labToRgb,
  analyzeReferencePixels,
  generate3DLut,
  sampleLutTrilinear,
  applyLutToRgbaBuffer,
  serializeToCubeFormat,
  buildFastCubePreviewAndStats,
  validateCubeString,
  generateHaldClutRgba,
  DEFAULT_GRADING_PARAMS,
  type LutGradingParams,
} from './lutEngine';
import {
  DEFAULT_BULK_CONFIG,
  formatBulkLutTitle,
  processBulkImageRgba,
  buildBulkLutZipBundle,
} from './bulkLutProcessor';

test('CIE L*a*b* and sRGB round-trip conversion preserves color accuracy with lookup table acceleration', () => {
  const testColors: [number, number, number][] = [
    [0, 0, 0],
    [1, 1, 1],
    [0.5, 0.5, 0.5],
    [0.85, 0.32, 0.18],
    [0.12, 0.48, 0.64],
  ];

  for (const [r, g, b] of testColors) {
    const [L, a, bLab] = rgbToLab(r, g, b);
    const [rOut, gOut, bOut] = labToRgb(L, a, bLab);
    assert.ok(Math.abs(r - rOut) < 0.005, `Red mismatch: ${r} vs ${rOut}`);
    assert.ok(Math.abs(g - gOut) < 0.005, `Green mismatch: ${g} vs ${gOut}`);
    assert.ok(Math.abs(b - bOut) < 0.005, `Blue mismatch: ${b} vs ${bOut}`);
  }
});

test('analyzeReferencePixels extracts zones, quantiles, and 6-swatch palette', () => {
  const rgba = new Uint8ClampedArray(100 * 4);
  for (let i = 0; i < 50; i++) {
    rgba[i * 4] = 15;
    rgba[i * 4 + 1] = 55;
    rgba[i * 4 + 2] = 75;
    rgba[i * 4 + 3] = 255;
  }
  for (let i = 50; i < 100; i++) {
    rgba[i * 4] = 240;
    rgba[i * 4 + 1] = 185;
    rgba[i * 4 + 2] = 95;
    rgba[i * 4 + 3] = 255;
  }

  const analysis = analyzeReferencePixels(rgba);
  assert.equal(analysis.palette.length, 6);
  assert.ok(analysis.zones.shadows.share > 30);
  assert.ok(analysis.zones.highlights.share > 30);
  assert.ok(analysis.zones.shadows.rgb[2] > analysis.zones.shadows.rgb[0]);
  assert.ok(analysis.zones.highlights.rgb[0] > analysis.zones.highlights.rgb[2]);
});

test('generate3DLut produces identity LUT when strength=0 and clean neutral adjustments', () => {
  const rgba = new Uint8ClampedArray(64 * 4);
  for (let i = 0; i < 64; i++) {
    rgba[i * 4] = 200;
    rgba[i * 4 + 1] = 100;
    rgba[i * 4 + 2] = 50;
    rgba[i * 4 + 3] = 255;
  }
  const analysis = analyzeReferencePixels(rgba);
  const zeroParams: LutGradingParams = {
    ...DEFAULT_GRADING_PARAMS,
    size: 17,
    strength: 0,
    contrast: 0,
    saturation: 0,
    blackLift: 0,
    highlightRolloff: 0,
  };

  const lut = generate3DLut(analysis, zeroParams);
  assert.equal(lut.data.length, 17 * 17 * 17 * 3);

  const [r, g, b] = sampleLutTrilinear(lut, 0.25, 0.5, 0.75);
  assert.ok(Math.abs(r - 0.25) < 0.001);
  assert.ok(Math.abs(g - 0.5) < 0.001);
  assert.ok(Math.abs(b - 0.75) < 0.001);
});

test('serializeToCubeFormat, buildFastCubePreviewAndStats, and validateCubeString verify .cube compliance', () => {
  const rgba = new Uint8ClampedArray(32 * 4);
  for (let i = 0; i < 32; i++) {
    rgba[i * 4] = 180;
    rgba[i * 4 + 1] = 130;
    rgba[i * 4 + 2] = 90;
    rgba[i * 4 + 3] = 255;
  }
  const analysis = analyzeReferencePixels(rgba);
  const lut = generate3DLut(analysis, {
    ...DEFAULT_GRADING_PARAMS,
    title: 'Anamorphic Dusk 17',
    size: 17,
    strength: 80,
  });

  const fastPreview = buildFastCubePreviewAndStats(lut, {
    algorithm: 'reinhard_lab',
    strength: 80,
  });
  assert.equal(fastPreview.validation.valid, true);
  assert.equal(fastPreview.validation.tripletCount, 4913);
  assert.ok(fastPreview.previewText.includes('TITLE "Anamorphic Dusk 17"'));

  const cubeString = serializeToCubeFormat(lut, {
    algorithm: 'reinhard_lab',
    strength: 80,
  });

  const validation = validateCubeString(cubeString);
  assert.equal(validation.valid, true, validation.error);
  assert.equal(validation.size, 17);
  assert.equal(validation.title, 'Anamorphic Dusk 17');
  assert.equal(validation.tripletCount, 4913);
});

test('applyLutToRgbaBuffer and generateHaldClutRgba transform pixels deterministically', () => {
  const rgba = new Uint8ClampedArray([128, 128, 128, 255, 40, 40, 40, 255]);
  const analysis = analyzeReferencePixels(
    new Uint8ClampedArray([230, 170, 80, 255, 220, 160, 70, 255])
  );
  const lut = generate3DLut(analysis, {
    ...DEFAULT_GRADING_PARAMS,
    size: 17,
    strength: 100,
  });

  const graded = applyLutToRgbaBuffer(rgba, lut);
  assert.equal(graded.length, 8);
  assert.equal(graded[3], 255);
  assert.ok(graded[0] > graded[2], `Expected warm shift R(${graded[0]}) > B(${graded[2]})`);

  const hald = generateHaldClutRgba(lut, 6);
  assert.equal(hald.width, 216);
  assert.equal(hald.height, 216);
  assert.equal(hald.rgba.length, 216 * 216 * 4);
});

test('bulkLutProcessor generates multiple .cube LUTs and bundles them into a valid PKZIP archive', () => {
  const title = formatBulkLutTitle('Summer Sunset 01.jpg', 'CinemaPack', 0, 17);
  assert.equal(title, 'CinemaPack_01_Summer_Sunset_01_17');

  const rgba1 = new Uint8ClampedArray(64 * 4);
  const rgba2 = new Uint8ClampedArray(64 * 4);
  for (let i = 0; i < 64; i++) {
    rgba1[i * 4] = 220;
    rgba1[i * 4 + 1] = 140;
    rgba1[i * 4 + 2] = 60;
    rgba1[i * 4 + 3] = 255;

    rgba2[i * 4] = 30;
    rgba2[i * 4 + 1] = 110;
    rgba2[i * 4 + 2] = 180;
    rgba2[i * 4 + 3] = 255;
  }

  const item1 = processBulkImageRgba(
    { id: 'b1', fileName: 'warm_frame.jpg', imageUrl: 'data:image/png;base64,', rgba: rgba1 },
    { ...DEFAULT_BULK_CONFIG, size: 17 },
    0
  );
  const item2 = processBulkImageRgba(
    { id: 'b2', fileName: 'cool_frame.jpg', imageUrl: 'data:image/png;base64,', rgba: rgba2 },
    { ...DEFAULT_BULK_CONFIG, size: 17 },
    1
  );

  assert.equal(item1.lut.size, 17);
  assert.equal(item2.lut.size, 17);
  assert.equal(item1.paletteHexes.length, 6);

  const zipBytes = buildBulkLutZipBundle([item1, item2]);
  const view = new DataView(zipBytes.buffer);
  // Check PKZIP local file header magic number 0x04034b50 ("PK\x03\x04")
  assert.equal(view.getUint32(0, true), 0x04034b50);
  // Check EOCD signature 0x06054b50 at the end of the archive (22 bytes from end)
  assert.equal(view.getUint32(zipBytes.length - 22, true), 0x06054b50);
});
