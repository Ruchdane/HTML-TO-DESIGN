// ============================================================
// Intermediate representation for parsed HTML nodes
// ============================================================

/** The kind of Penpot shape a parsed node maps to */
export type NodeKind = 'container' | 'text' | 'image' | 'svg' | 'leaf';

/** Absolute bounding box in pixels, relative to the HTML root */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** RGBA color in a format ready for Penpot */
export interface NormalizedColor {
  hex: string;      // e.g. "#ff5733"
  opacity: number;  // 0‒1
}

/** Border / stroke info */
export interface NormalizedBorder {
  color: NormalizedColor;
  width: number;
  style: 'solid' | 'dashed' | 'dotted' | 'none';
  side: 'all' | 'top' | 'right' | 'bottom' | 'left';
}

/** Shadow (from box-shadow) */
export interface NormalizedShadow {
  color: NormalizedColor;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  inset: boolean;
}

/** Gradient stop */
export interface GradientStop {
  color: string;   // hex
  opacity: number;
  offset: number;  // 0‒1
}

/** Linear or radial gradient */
export interface NormalizedGradient {
  type: 'linear' | 'radial';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  width: number;
  stops: GradientStop[];
}

/** Background fill – either solid, gradient, or image URL */
export interface NormalizedFill {
  kind: 'solid' | 'gradient' | 'image';
  color?: NormalizedColor;
  gradient?: NormalizedGradient;
  imageUrl?: string;
}

/** Per‐corner border radius */
export interface NormalizedBorderRadius {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

/** Typography properties extracted from computed style */
export interface NormalizedTypography {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: 'normal' | 'italic';
  lineHeight: number;
  letterSpacing: number;
  textDecoration: 'none' | 'underline' | 'line-through';
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textAlign: 'left' | 'center' | 'right' | 'justify';
  color: NormalizedColor;
}

/** Flex layout properties (when display is flex) */
export interface NormalizedFlexLayout {
  direction: 'row' | 'row-reverse' | 'column' | 'column-reverse';
  wrap: 'wrap' | 'nowrap';
  alignItems: 'start' | 'end' | 'center' | 'stretch';
  justifyContent: 'start' | 'end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  gap: { row: number; column: number };
  padding: { top: number; right: number; bottom: number; left: number };
}

/** The full set of visual styles for a parsed node */
export interface NormalizedStyles {
  fills: NormalizedFill[];
  borders: NormalizedBorder[];
  borderRadius: NormalizedBorderRadius;
  shadows: NormalizedShadow[];
  opacity: number;
  overflow: 'visible' | 'hidden' | 'scroll' | 'auto';
  flexLayout?: NormalizedFlexLayout;
}

/** A single inline text run (for mixed-style text) */
export interface TextRun {
  text: string;
  typography: NormalizedTypography;
}

/** A fully parsed DOM node ready to send to plugin.ts */
export interface ParsedNode {
  /** Unique id for progress tracking */
  id: string;
  /** What kind of shape this maps to */
  kind: NodeKind;
  /** Tag name for debugging (div, p, img…) */
  tag: string;
  /** Readable name hint */
  name: string;
  /** Absolute position and size */
  bounds: Bounds;
  /** Visual styles */
  styles: NormalizedStyles;
  /** Children (for containers) */
  children: ParsedNode[];
  /** Text runs (for text nodes) */
  textRuns?: TextRun[];
  /** Image source URL (for image nodes) */
  imageSrc?: string;
  /** Raw SVG markup (for svg nodes) */
  svgMarkup?: string;
}

// ============================================================
// Message types for UI ↔ plugin.ts communication
// ============================================================

/** UI → plugin: convert this parsed tree into Penpot shapes */
export interface ConvertMessage {
  type: 'convert';
  tree: ParsedNode[];
}

/** plugin → UI: report progress */
export interface ProgressMessage {
  type: 'progress';
  completed: number;
  total: number;
  currentName: string;
}

/** plugin → UI: conversion finished */
export interface DoneMessage {
  type: 'done';
  shapesCreated: number;
}

/** plugin → UI: an error occurred */
export interface ErrorMessage {
  type: 'error';
  message: string;
}

/** plugin → UI: theme changed */
export interface ThemeMessage {
  type: 'theme';
  content: string;
}

export type PluginToUiMessage = ProgressMessage | DoneMessage | ErrorMessage | ThemeMessage;
export type UiToPluginMessage = ConvertMessage;
