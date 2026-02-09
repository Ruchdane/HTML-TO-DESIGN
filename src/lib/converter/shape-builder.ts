/**
 * shape-builder.ts
 *
 * Converts a ParsedNode tree into Penpot shapes.
 *
 * CRITICAL: Penpot shape.x / shape.y are ABSOLUTE CANVAS coordinates.
 * When a shape is appended to a board, it does NOT become relative to
 * the board. So every child must be placed at:
 *   shape.x = parentBoardCanvasX + relativeOffsetX
 *   shape.y = parentBoardCanvasY + relativeOffsetY
 */

import type {
  ParsedNode,
  NormalizedFill,
  NormalizedBorder,
  NormalizedShadow,
  NormalizedBorderRadius,
  NormalizedFlexLayout,
  ProgressMessage,
} from '../types/index';

type Shape = import('@penpot/plugin-types').Shape;
type Board = import('@penpot/plugin-types').Board;
type Fill = import('@penpot/plugin-types').Fill;
type Stroke = import('@penpot/plugin-types').Stroke;
type Shadow = import('@penpot/plugin-types').Shadow;

function countNodes(nodes: ParsedNode[]): number {
  let c = 0;
  for (const n of nodes) c += 1 + countNodes(n.children);
  return c;
}

/**
 * Build all Penpot shapes from the parsed tree.
 */
export async function buildShapes(
  tree: ParsedNode[],
  onProgress: (msg: ProgressMessage) => void
): Promise<number> {
  const total = countNodes(tree);
  let completed = 0;

  const center = penpot.viewport.center;

  // Calculate bounds of all root nodes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of tree) {
    minX = Math.min(minX, node.bounds.x);
    minY = Math.min(minY, node.bounds.y);
    maxX = Math.max(maxX, node.bounds.x + node.bounds.width);
    maxY = Math.max(maxY, node.bounds.y + node.bounds.height);
  }

  const totalW = Math.max(1, maxX - minX);
  const totalH = Math.max(1, maxY - minY);

  // Root board: absolute position on the canvas
  const rootBoard = penpot.createBoard();
  rootBoard.name = 'HTML Import';
  rootBoard.resize(totalW, totalH);
  rootBoard.x = center.x - totalW / 2;
  rootBoard.y = center.y - totalH / 2;
  rootBoard.fills = [{ fillColor: '#ffffff', fillOpacity: 1 }];

  // Build children.
  // `canvasBaseX/Y` is the absolute canvas position of the parent board.
  // `htmlBaseX/Y` is the origin of the HTML coordinate space for this level.
  const canvasBaseX = rootBoard.x;
  const canvasBaseY = rootBoard.y;

  for (const node of tree) {
    await buildNodeShape(
      node,
      rootBoard,
      canvasBaseX, canvasBaseY,
      minX, minY,
      () => {
        completed++;
        onProgress({ type: 'progress', completed, total, currentName: node.name });
      }
    );
  }

  return completed;
}

/**
 * Recursively create a shape and append it to parentBoard.
 *
 * @param canvasBaseX  Absolute canvas X of the parent board
 * @param canvasBaseY  Absolute canvas Y of the parent board
 * @param htmlBaseX    The HTML-space X origin (what 0 means for this level)
 * @param htmlBaseY    The HTML-space Y origin
 */
async function buildNodeShape(
  node: ParsedNode,
  parentBoard: Board,
  canvasBaseX: number,
  canvasBaseY: number,
  htmlBaseX: number,
  htmlBaseY: number,
  onComplete: () => void
): Promise<void> {
  try {
    // The relative offset from the parent's origin (in HTML space)
    const relX = node.bounds.x - htmlBaseX;
    const relY = node.bounds.y - htmlBaseY;
    // The absolute canvas position for this shape
    const absX = canvasBaseX + relX;
    const absY = canvasBaseY + relY;
    const w = Math.max(1, node.bounds.width);
    const h = Math.max(1, node.bounds.height);

    switch (node.kind) {
      case 'container':
        await buildContainer(node, parentBoard, absX, absY, w, h);
        break;
      case 'text':
        buildText(node, parentBoard, absX, absY);
        break;
      case 'image':
        await buildImage(node, parentBoard, absX, absY, w, h);
        break;
      case 'svg':
        buildSvg(node, parentBoard, absX, absY);
        break;
      case 'leaf':
        buildLeaf(node, parentBoard, absX, absY, w, h);
        break;
    }
  } catch (err) {
    console.warn(`[html-to-design] Failed: ${node.name}`, err);
  }

  onComplete();
}

// ── Container ──────────────────────────────────────────────────

async function buildContainer(
  node: ParsedNode,
  parentBoard: Board,
  absX: number,
  absY: number,
  w: number,
  h: number,
): Promise<void> {
  const board = penpot.createBoard();
  board.name = node.name;
  board.x = absX;
  board.y = absY;
  board.resize(w, h);

  applyFills(board, node.styles.fills);
  applyStrokes(board, node.styles.borders);
  applyShadows(board, node.styles.shadows);
  applyBorderRadius(board, node.styles.borderRadius);
  applyOpacity(board, node.styles.opacity);

  if (node.styles.overflow === 'hidden') {
    board.clipContent = true;
  }

  const hasFlex = !!node.styles.flexLayout;
  if (hasFlex && node.styles.flexLayout) {
    applyFlexLayout(board, node.styles.flexLayout);
  }

  // Append to parent first
  parentBoard.appendChild(board);

  // Now build children.
  // Children's HTML coords are relative to THIS node's position.
  // Their canvas coords = this board's canvas position + (child HTML pos - this HTML pos)
  for (const child of node.children) {
    await buildNodeShape(
      child,
      board,
      absX,        // this board's absolute canvas X
      absY,        // this board's absolute canvas Y
      node.bounds.x, // HTML-space origin = this node's HTML position
      node.bounds.y,
      () => {}
    );
  }
}

// ── Text ───────────────────────────────────────────────────────

function buildText(
  node: ParsedNode,
  parentBoard: Board,
  absX: number,
  absY: number
): void {
  const runs = node.textRuns;
  if (!runs || runs.length === 0) return;

  const fullText = runs.map((r) => r.text).join(' ');
  if (!fullText.trim()) return;

  const text = penpot.createText(fullText);
  if (!text) return;

  text.name = node.name;
  text.x = absX;
  text.y = absY;

  const t = runs[0].typography;
  text.fontFamily = t.fontFamily;
  text.fontSize = String(Math.round(t.fontSize));
  text.fontWeight = t.fontWeight;
  text.fontStyle = t.fontStyle;
  text.lineHeight = String(Math.round(t.lineHeight * 100) / 100);
  text.letterSpacing = String(Math.round(t.letterSpacing * 100) / 100);
  text.textDecoration = t.textDecoration === 'none' ? null : t.textDecoration;
  text.textTransform = t.textTransform === 'none' ? null : t.textTransform;
  text.align = t.textAlign;
  text.fills = [{ fillColor: t.color.hex, fillOpacity: t.color.opacity || 1 }];
  text.growType = 'auto-width';

  // Multi-run styling
  if (runs.length > 1) {
    let off = 0;
    for (const run of runs) {
      const end = off + run.text.length;
      try {
        const range = text.getRange(off, end);
        if (range) {
          range.fontSize = String(Math.round(run.typography.fontSize));
          range.fontWeight = run.typography.fontWeight;
          range.fontStyle = run.typography.fontStyle;
          range.fontFamily = run.typography.fontFamily;
          range.fills = [{
            fillColor: run.typography.color.hex,
            fillOpacity: run.typography.color.opacity || 1,
          }];
        }
      } catch { /* skip */ }
      off = end + 1;
    }
  }

  parentBoard.appendChild(text);
}

// ── Image ──────────────────────────────────────────────────────

async function buildImage(
  node: ParsedNode,
  parentBoard: Board,
  absX: number,
  absY: number,
  w: number,
  h: number
): Promise<void> {
  const rect = penpot.createRectangle();
  rect.name = node.name;
  rect.x = absX;
  rect.y = absY;
  rect.resize(w, h);

  applyBorderRadius(rect, node.styles.borderRadius);
  applyStrokes(rect, node.styles.borders);
  applyShadows(rect, node.styles.shadows);
  applyOpacity(rect, node.styles.opacity);

  if (node.imageSrc) {
    try {
      const img = await penpot.uploadMediaUrl(node.name, node.imageSrc);
      if (img) { rect.fills = [{ fillOpacity: 1, fillImage: img }]; }
    } catch { /* fallback */ }
  }
  if (!rect.fills || (Array.isArray(rect.fills) && rect.fills.length === 0)) {
    rect.fills = [{ fillColor: '#E0E0E0', fillOpacity: 1 }];
  }

  parentBoard.appendChild(rect);
}

// ── SVG ────────────────────────────────────────────────────────

function buildSvg(
  node: ParsedNode,
  parentBoard: Board,
  absX: number,
  absY: number
): void {
  if (!node.svgMarkup) return;
  try {
    const group = penpot.createShapeFromSvg(node.svgMarkup);
    if (group) {
      group.name = node.name;
      group.x = absX;
      group.y = absY;
      parentBoard.appendChild(group);
    }
  } catch { /* skip */ }
}

// ── Leaf ───────────────────────────────────────────────────────

function buildLeaf(
  node: ParsedNode,
  parentBoard: Board,
  absX: number,
  absY: number,
  w: number,
  h: number
): void {
  const rect = penpot.createRectangle();
  rect.name = node.name;
  rect.x = absX;
  rect.y = absY;
  rect.resize(w, h);

  applyFills(rect, node.styles.fills);
  applyStrokes(rect, node.styles.borders);
  applyShadows(rect, node.styles.shadows);
  applyBorderRadius(rect, node.styles.borderRadius);
  applyOpacity(rect, node.styles.opacity);

  parentBoard.appendChild(rect);
}

// ── Style Helpers ──────────────────────────────────────────────

function applyFills(shape: Shape, fills: NormalizedFill[]): void {
  if (!fills.length) return;
  const out: Fill[] = [];
  for (const f of fills) {
    if (f.kind === 'solid' && f.color) {
      out.push({ fillColor: f.color.hex, fillOpacity: f.color.opacity || 1 });
    } else if (f.kind === 'gradient' && f.gradient) {
      out.push({
        fillColorGradient: {
          type: f.gradient.type,
          startX: f.gradient.startX, startY: f.gradient.startY,
          endX: f.gradient.endX, endY: f.gradient.endY,
          width: f.gradient.width,
          stops: f.gradient.stops.map(s => ({
            color: s.color, opacity: s.opacity || 1, offset: s.offset,
          })),
        },
      });
    }
  }
  if (out.length) shape.fills = out;
}

function applyStrokes(shape: Shape, borders: NormalizedBorder[]): void {
  if (!borders.length) return;
  const out: Stroke[] = [];
  for (const b of borders) {
    if (b.width <= 0 || b.style === 'none') continue;
    out.push({
      strokeColor: b.color.hex,
      strokeOpacity: b.color.opacity || 1,
      strokeStyle: b.style === 'dashed' ? 'dashed' : b.style === 'dotted' ? 'dotted' : 'solid',
      strokeWidth: b.width,
      strokeAlignment: 'center',
    });
    if (b.side === 'all') break;
  }
  if (out.length) shape.strokes = out;
}

function applyShadows(shape: Shape, shadows: NormalizedShadow[]): void {
  if (!shadows.length) return;
  const out: Shadow[] = shadows.map(s => ({
    style: s.inset ? 'inner-shadow' : 'drop-shadow',
    color: { color: s.color.hex, opacity: s.color.opacity || 1 },
    offsetX: s.offsetX, offsetY: s.offsetY,
    blur: s.blur, spread: s.spread,
    hidden: false,
  }));
  if (out.length) shape.shadows = out;
}

function applyBorderRadius(shape: Shape, r: NormalizedBorderRadius): void {
  const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = r;
  if (!tl && !tr && !br && !bl) return;
  if (tl === tr && tr === br && br === bl) {
    shape.borderRadius = tl;
  } else {
    shape.borderRadiusTopLeft = tl;
    shape.borderRadiusTopRight = tr;
    shape.borderRadiusBottomRight = br;
    shape.borderRadiusBottomLeft = bl;
  }
}

function applyOpacity(shape: Shape, opacity: number): void {
  if (opacity < 1) shape.opacity = opacity;
}

function applyFlexLayout(board: Board, flex: NormalizedFlexLayout): void {
  board.horizontalSizing = 'fix';
  board.verticalSizing = 'fix';
  const layout = board.addFlexLayout();
  layout.dir = flex.direction;
  layout.wrap = flex.wrap;
  layout.alignItems = flex.alignItems;
  layout.justifyContent = flex.justifyContent;
  layout.rowGap = flex.gap.row;
  layout.columnGap = flex.gap.column;
  layout.topPadding = flex.padding.top;
  layout.rightPadding = flex.padding.right;
  layout.bottomPadding = flex.padding.bottom;
  layout.leftPadding = flex.padding.left;
}
