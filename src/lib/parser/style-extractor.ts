/**
 * style-extractor.ts
 *
 * Converts browser-computed CSS values into the normalized intermediate
 * format consumed by the shape builder.
 */

import type {
  NormalizedColor,
  NormalizedBorder,
  NormalizedShadow,
  NormalizedFill,
  NormalizedBorderRadius,
  NormalizedTypography,
  NormalizedFlexLayout,
  NormalizedStyles,
  NormalizedGradient,
  GradientStop,
} from '../types/index';

// ── Color Parsing ──────────────────────────────────────────────

/**
 * Parse any CSS color string (rgb, rgba, hex) into hex + opacity.
 * Falls back to transparent black on failure.
 */
function parseColor(raw: string): NormalizedColor {
  if (!raw || raw === 'transparent' || raw === 'none') {
    return { hex: '#000000', opacity: 0 };
  }

  // Modern CSS: rgb(R G B / A) or rgba(R G B / A) -- space-separated with slash
  const modernMatch = raw.match(
    /rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?))?\s*\)/
  );
  if (modernMatch) {
    const r = parseFloat(modernMatch[1]);
    const g = parseFloat(modernMatch[2]);
    const b = parseFloat(modernMatch[3]);
    let a = 1;
    if (modernMatch[4] !== undefined) {
      const alphaStr = modernMatch[4];
      a = alphaStr.endsWith('%') ? parseFloat(alphaStr) / 100 : parseFloat(alphaStr);
    }
    return {
      hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
      opacity: clamp01(a),
    };
  }

  // Legacy: rgba(R, G, B, A) or rgb(R, G, B)
  const rgbaMatch = raw.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/
  );
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10);
    const g = parseInt(rgbaMatch[2], 10);
    const b = parseInt(rgbaMatch[3], 10);
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
    return {
      hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
      opacity: clamp01(a),
    };
  }

  // #hex
  if (raw.startsWith('#')) {
    let hex = raw;
    if (hex.length === 4) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    if (hex.length === 5) {
      const a = parseInt(hex[4] + hex[4], 16) / 255;
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
      return { hex, opacity: clamp01(a) };
    }
    if (hex.length === 9) {
      const a = parseInt(hex.slice(7, 9), 16) / 255;
      return { hex: hex.slice(0, 7), opacity: clamp01(a) };
    }
    return { hex: hex.toLowerCase(), opacity: 1 };
  }

  return { hex: '#000000', opacity: 0 };
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ── Number Parsing ─────────────────────────────────────────────

/** Extract a pixel value from a CSS string like "16px", default 0 */
function parsePx(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(raw);
  return isFinite(n) ? n : 0;
}

// ── Gradient Parsing ───────────────────────────────────────────

/**
 * Parse a CSS linear-gradient() or radial-gradient() string into
 * a NormalizedGradient.  Returns null if the string isn't a gradient.
 */
function parseGradient(raw: string): NormalizedGradient | null {
  if (!raw) return null;

  const linearMatch = raw.match(/linear-gradient\((.+)\)/);
  if (linearMatch) {
    return parseLinearGradient(linearMatch[1]);
  }

  const radialMatch = raw.match(/radial-gradient\((.+)\)/);
  if (radialMatch) {
    return parseRadialGradient(radialMatch[1]);
  }

  return null;
}

function parseLinearGradient(inner: string): NormalizedGradient {
  // Default angle 180deg (top to bottom)
  let angleDeg = 180;
  let stopsStr = inner;

  // Check for angle at start
  const angleMatch = inner.match(/^([\d.]+)deg\s*,\s*/);
  if (angleMatch) {
    angleDeg = parseFloat(angleMatch[1]);
    stopsStr = inner.slice(angleMatch[0].length);
  } else {
    // Check for "to <direction>"
    const dirMatch = inner.match(/^to\s+(top|bottom|left|right)(?:\s+(top|bottom|left|right))?\s*,\s*/i);
    if (dirMatch) {
      angleDeg = directionToAngle(dirMatch[1], dirMatch[2]);
      stopsStr = inner.slice(dirMatch[0].length);
    }
  }

  const stops = parseGradientStops(stopsStr);
  const rad = ((angleDeg - 90) * Math.PI) / 180;

  return {
    type: 'linear',
    startX: 0.5 - 0.5 * Math.cos(rad),
    startY: 0.5 - 0.5 * Math.sin(rad),
    endX: 0.5 + 0.5 * Math.cos(rad),
    endY: 0.5 + 0.5 * Math.sin(rad),
    width: 1,
    stops,
  };
}

function parseRadialGradient(inner: string): NormalizedGradient {
  // Simplified: ignore shape/size keywords, just extract stops
  const stops = parseGradientStops(inner);

  return {
    type: 'radial',
    startX: 0.5,
    startY: 0.5,
    endX: 1,
    endY: 0.5,
    width: 1,
    stops,
  };
}

function directionToAngle(d1: string, d2?: string): number {
  const dir = d2 ? `${d1} ${d2}` : d1;
  const map: Record<string, number> = {
    'top': 0, 'right': 90, 'bottom': 180, 'left': 270,
    'top right': 45, 'right top': 45,
    'bottom right': 135, 'right bottom': 135,
    'bottom left': 225, 'left bottom': 225,
    'top left': 315, 'left top': 315,
  };
  return map[dir.toLowerCase()] ?? 180;
}

/**
 * Parse gradient color stops from a comma-separated CSS string.
 * E.g. "rgb(255,0,0) 0%, rgb(0,0,255) 100%"
 */
function parseGradientStops(raw: string): GradientStop[] {
  const stops: GradientStop[] = [];

  // Split on commas that are NOT inside parentheses
  const parts = splitOutsideParens(raw);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Skip keywords like "circle", "ellipse", "closest-side", etc.
    if (/^(circle|ellipse|closest|farthest|at\s)/i.test(trimmed)) continue;

    // Try to extract color and optional percentage
    const percentMatch = trimmed.match(/([\d.]+)%\s*$/);
    let colorStr = trimmed;
    let offset: number | null = null;

    if (percentMatch) {
      offset = parseFloat(percentMatch[1]) / 100;
      colorStr = trimmed.slice(0, trimmed.length - percentMatch[0].length).trim();
    }

    if (!colorStr) continue;

    const color = parseColor(colorStr);
    if (color.opacity === 0 && color.hex === '#000000' && !colorStr.includes('0,')) {
      // Likely not a valid color, skip
      continue;
    }

    stops.push({
      color: color.hex,
      opacity: color.opacity,
      offset: offset ?? -1, // placeholder, we'll distribute evenly below
    });
  }

  // Distribute offsets evenly for stops that don't have explicit ones
  if (stops.length > 0) {
    // If first has no offset, set to 0
    if (stops[0].offset < 0) stops[0].offset = 0;
    // If last has no offset, set to 1
    if (stops[stops.length - 1].offset < 0) stops[stops.length - 1].offset = 1;

    // Fill in gaps linearly
    let lastIdx = 0;
    for (let i = 1; i < stops.length; i++) {
      if (stops[i].offset >= 0) {
        const gap = i - lastIdx;
        if (gap > 1) {
          const startOff = stops[lastIdx].offset;
          const endOff = stops[i].offset;
          for (let j = 1; j < gap; j++) {
            stops[lastIdx + j].offset = startOff + (endOff - startOff) * (j / gap);
          }
        }
        lastIdx = i;
      }
    }
  }

  return stops;
}

/** Split a string on commas, but not inside parentheses */
function splitOutsideParens(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

// ── Shadow Parsing ─────────────────────────────────────────────

/**
 * Parse a CSS box-shadow string into an array of NormalizedShadow.
 * Supports multiple shadows separated by commas.
 */
function parseShadows(raw: string): NormalizedShadow[] {
  if (!raw || raw === 'none') return [];

  const shadows: NormalizedShadow[] = [];
  const parts = splitOutsideParens(raw);

  for (const part of parts) {
    const shadow = parseSingleShadow(part.trim());
    if (shadow) shadows.push(shadow);
  }

  return shadows;
}

function parseSingleShadow(raw: string): NormalizedShadow | null {
  const inset = raw.includes('inset');
  const cleaned = raw.replace('inset', '').trim();

  // Extract the color part (either at the start or end)
  let colorStr = 'rgba(0, 0, 0, 1)';
  let numericPart = cleaned;

  // Try to find rgb/rgba at start or end
  const rgbMatch = cleaned.match(/rgba?\([^)]+\)/);
  if (rgbMatch) {
    colorStr = rgbMatch[0];
    numericPart = cleaned.replace(rgbMatch[0], '').trim();
  } else {
    // Check for hex color
    const hexMatch = cleaned.match(/#[0-9a-fA-F]{3,8}/);
    if (hexMatch) {
      colorStr = hexMatch[0];
      numericPart = cleaned.replace(hexMatch[0], '').trim();
    }
  }

  // Parse the numeric values (offsetX, offsetY, blur, spread)
  const nums = numericPart.match(/-?[\d.]+px/g);
  if (!nums || nums.length < 2) return null;

  const values = nums.map((n) => parsePx(n));

  return {
    color: parseColor(colorStr),
    offsetX: values[0],
    offsetY: values[1],
    blur: values[2] ?? 0,
    spread: values[3] ?? 0,
    inset,
  };
}

// ── Border Parsing ─────────────────────────────────────────────

/** Extract all four borders from computed styles */
function parseBorders(cs: CSSStyleDeclaration): NormalizedBorder[] {
  const borders: NormalizedBorder[] = [];

  const sides = ['top', 'right', 'bottom', 'left'] as const;
  const widths = sides.map((s) => parsePx(cs.getPropertyValue(`border-${s}-width`)));
  const colors = sides.map((s) => parseColor(cs.getPropertyValue(`border-${s}-color`)));
  const styles = sides.map(
    (s) => cs.getPropertyValue(`border-${s}-style`) as NormalizedBorder['style']
  );

  // Check if all four sides are the same
  const allSame =
    widths.every((w) => w === widths[0]) &&
    colors.every((c) => c.hex === colors[0].hex && c.opacity === colors[0].opacity) &&
    styles.every((s) => s === styles[0]);

  if (allSame) {
    if (widths[0] > 0 && styles[0] !== 'none') {
      borders.push({
        color: colors[0],
        width: widths[0],
        style: mapBorderStyle(styles[0]),
        side: 'all',
      });
    }
  } else {
    sides.forEach((side, i) => {
      if (widths[i] > 0 && styles[i] !== 'none') {
        borders.push({
          color: colors[i],
          width: widths[i],
          style: mapBorderStyle(styles[i]),
          side,
        });
      }
    });
  }

  return borders;
}

function mapBorderStyle(raw: string): NormalizedBorder['style'] {
  if (raw === 'dashed') return 'dashed';
  if (raw === 'dotted') return 'dotted';
  if (raw === 'none' || raw === 'hidden') return 'none';
  return 'solid';
}

// ── Border Radius ──────────────────────────────────────────────

function parseBorderRadius(cs: CSSStyleDeclaration): NormalizedBorderRadius {
  return {
    topLeft: parsePx(cs.getPropertyValue('border-top-left-radius')),
    topRight: parsePx(cs.getPropertyValue('border-top-right-radius')),
    bottomRight: parsePx(cs.getPropertyValue('border-bottom-right-radius')),
    bottomLeft: parsePx(cs.getPropertyValue('border-bottom-left-radius')),
  };
}

// ── Typography ─────────────────────────────────────────────────

export function parseTypography(cs: CSSStyleDeclaration): NormalizedTypography {
  const fontSize = parsePx(cs.fontSize);
  const rawLineHeight = cs.lineHeight;
  let lineHeight: number;
  if (rawLineHeight === 'normal') {
    lineHeight = 1.2;
  } else if (rawLineHeight.endsWith('px')) {
    lineHeight = fontSize > 0 ? parsePx(rawLineHeight) / fontSize : 1.2;
  } else {
    lineHeight = parseFloat(rawLineHeight) || 1.2;
  }

  let textDecoration: NormalizedTypography['textDecoration'] = 'none';
  const decLine = cs.getPropertyValue('text-decoration-line') || cs.textDecoration || '';
  if (decLine.includes('underline')) textDecoration = 'underline';
  else if (decLine.includes('line-through')) textDecoration = 'line-through';

  let textTransform = (cs.textTransform || 'none') as NormalizedTypography['textTransform'];
  if (!['none', 'uppercase', 'lowercase', 'capitalize'].includes(textTransform)) {
    textTransform = 'none';
  }

  const rawAlign = cs.textAlign || 'left';
  let textAlign: NormalizedTypography['textAlign'] = 'left';
  if (rawAlign === 'center') textAlign = 'center';
  else if (rawAlign === 'right' || rawAlign === 'end') textAlign = 'right';
  else if (rawAlign === 'justify') textAlign = 'justify';
  else textAlign = 'left';

  return {
    fontFamily: cleanFontFamily(cs.fontFamily),
    fontSize,
    fontWeight: cs.fontWeight || '400',
    fontStyle: cs.fontStyle === 'italic' ? 'italic' : 'normal',
    lineHeight,
    letterSpacing: parsePx(cs.letterSpacing),
    textDecoration,
    textTransform,
    textAlign,
    color: parseColor(cs.color),
  };
}

/** Clean up font-family: strip quotes, take the first family */
function cleanFontFamily(raw: string): string {
  if (!raw) return 'Work Sans';
  const first = raw.split(',')[0].trim().replace(/['"]/g, '');
  return first || 'Work Sans';
}

// ── Fills (background) ─────────────────────────────────────────

/**
 * Extract fills from the computed background styles.
 * Returns an array of fills (solid, gradient, and/or image).
 */
function parseFills(cs: CSSStyleDeclaration): NormalizedFill[] {
  const fills: NormalizedFill[] = [];

  // 1. Check background-image for gradients or url()
  const bgImage = cs.backgroundImage || '';
  if (bgImage && bgImage !== 'none') {
    // Check for gradient
    const gradient = parseGradient(bgImage);
    if (gradient) {
      fills.push({ kind: 'gradient', gradient });
    }
    // Check for image URL
    const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (urlMatch && !gradient) {
      fills.push({ kind: 'image', imageUrl: urlMatch[1] });
    }
  }

  // 2. Check background-color (only add if no gradient/image fills)
  const bgColor = cs.backgroundColor || '';
  if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
    const color = parseColor(bgColor);
    if (color.opacity > 0) {
      fills.push({ kind: 'solid', color });
    }
  }

  return fills;
}

// ── Flex Layout ────────────────────────────────────────────────

function parseFlexLayout(cs: CSSStyleDeclaration): NormalizedFlexLayout | undefined {
  const display = cs.display;
  if (display !== 'flex' && display !== 'inline-flex') return undefined;

  const dirRaw = cs.flexDirection || 'row';
  let direction: NormalizedFlexLayout['direction'] = 'row';
  if (dirRaw === 'column') direction = 'column';
  else if (dirRaw === 'row-reverse') direction = 'row-reverse';
  else if (dirRaw === 'column-reverse') direction = 'column-reverse';

  const wrapRaw = cs.flexWrap || 'nowrap';
  const wrap: NormalizedFlexLayout['wrap'] = wrapRaw === 'wrap' ? 'wrap' : 'nowrap';

  const alignMap: Record<string, NormalizedFlexLayout['alignItems']> = {
    'flex-start': 'start', 'start': 'start',
    'flex-end': 'end', 'end': 'end',
    'center': 'center',
    'stretch': 'stretch',
  };
  const alignItems = alignMap[cs.alignItems || 'stretch'] ?? 'stretch';

  const justifyMap: Record<string, NormalizedFlexLayout['justifyContent']> = {
    'flex-start': 'start', 'start': 'start',
    'flex-end': 'end', 'end': 'end',
    'center': 'center',
    'space-between': 'space-between',
    'space-around': 'space-around',
    'space-evenly': 'space-evenly',
  };
  const justifyContent = justifyMap[cs.justifyContent || 'flex-start'] ?? 'start';

  const rowGap = parsePx(cs.rowGap);
  const columnGap = parsePx(cs.columnGap);

  return {
    direction,
    wrap,
    alignItems,
    justifyContent,
    gap: { row: rowGap, column: columnGap },
    padding: {
      top: parsePx(cs.paddingTop),
      right: parsePx(cs.paddingRight),
      bottom: parsePx(cs.paddingBottom),
      left: parsePx(cs.paddingLeft),
    },
  };
}

// ── Full Style Extraction ──────────────────────────────────────

/**
 * Extract all normalized visual styles from a computed style declaration.
 */
export function extractStyles(cs: CSSStyleDeclaration): NormalizedStyles {
  return {
    fills: parseFills(cs),
    borders: parseBorders(cs),
    borderRadius: parseBorderRadius(cs),
    shadows: parseShadows(cs.boxShadow || ''),
    opacity: parseFloat(cs.opacity || '1') || 1,
    overflow: mapOverflow(cs.overflow || 'visible'),
    flexLayout: parseFlexLayout(cs),
  };
}

function mapOverflow(raw: string): NormalizedStyles['overflow'] {
  if (raw === 'hidden') return 'hidden';
  if (raw === 'scroll') return 'scroll';
  if (raw === 'auto') return 'auto';
  return 'visible';
}
