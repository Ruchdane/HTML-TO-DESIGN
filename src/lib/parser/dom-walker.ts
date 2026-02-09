/**
 * dom-walker.ts
 *
 * Recursively walks a rendered DOM tree inside a hidden iframe, extracting
 * bounding boxes and computed styles for every visible element.
 * Produces a flat list of { element, bounds, computedStyle } records that
 * the normalizer then converts into a ParsedNode tree.
 */

import type { Bounds } from '../types/index';

export interface WalkedElement {
  element: Element;
  bounds: Bounds;
  computedStyle: CSSStyleDeclaration;
  /** Direct element children that are also visible */
  childElements: Element[];
  /** Direct text node content (trimmed, concatenated) */
  directText: string;
  /** Whether this element has only text children (no child elements) */
  isTextOnly: boolean;
  /** Depth in the tree (0 = root) */
  depth: number;
}

/** Tags that we should completely skip */
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'NOSCRIPT', 'BR', 'WBR',
]);

/** Tags that are considered invisible wrappers */
const INVISIBLE_TAGS = new Set(['HTML']);

/**
 * Walk the DOM tree starting from the given root element.
 * Returns a Map from Element → WalkedElement for every visible element.
 *
 * @param root      The root element (usually iframe body)
 * @param rootRect  The bounding rect of the root element (to compute relative positions)
 */
export function walkDOM(
  root: Element,
  rootRect?: DOMRect
): Map<Element, WalkedElement> {
  const result = new Map<Element, WalkedElement>();

  if (!rootRect) {
    rootRect = root.getBoundingClientRect();
  }

  walkRecursive(root, rootRect, 0, result);
  return result;
}

function walkRecursive(
  el: Element,
  rootRect: DOMRect,
  depth: number,
  result: Map<Element, WalkedElement>
): void {
  // Skip invisible tags
  if (SKIP_TAGS.has(el.tagName) || INVISIBLE_TAGS.has(el.tagName)) {
    // Still walk children of HTML
    if (el.tagName === 'HTML') {
      for (const child of Array.from(el.children)) {
        walkRecursive(child, rootRect, depth, result);
      }
    }
    return;
  }

  const ownerDoc = el.ownerDocument;
  if (!ownerDoc || !ownerDoc.defaultView) return;

  const cs = ownerDoc.defaultView.getComputedStyle(el);

  // Skip hidden elements
  if (cs.display === 'none' || cs.visibility === 'hidden') return;

  const rect = el.getBoundingClientRect();

  // Skip zero-size elements (unless they are the body itself or contain text)
  if (rect.width <= 0 && rect.height <= 0 && el.tagName !== 'BODY') return;

  const bounds: Bounds = {
    x: rect.left - rootRect.left,
    y: rect.top - rootRect.top,
    width: rect.width,
    height: rect.height,
  };

  // Collect direct text content
  const directText = getDirectText(el);

  // Collect visible child elements
  const childElements: Element[] = [];
  for (const child of Array.from(el.children)) {
    if (SKIP_TAGS.has(child.tagName)) continue;
    const childCs = ownerDoc.defaultView!.getComputedStyle(child);
    if (childCs.display === 'none' || childCs.visibility === 'hidden') continue;
    const childRect = child.getBoundingClientRect();
    if (childRect.width <= 0 && childRect.height <= 0) continue;
    childElements.push(child);
  }

  const isTextOnly = childElements.length === 0 && directText.length > 0;

  result.set(el, {
    element: el,
    bounds,
    computedStyle: cs,
    childElements,
    directText,
    isTextOnly,
    depth,
  });

  // Recurse into child elements
  for (const child of childElements) {
    walkRecursive(child, rootRect, depth + 1, result);
  }
}

/**
 * Get the concatenated direct text content of an element
 * (only text nodes that are direct children, not descendants).
 */
function getDirectText(el: Element): string {
  let text = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent?.trim();
      if (t) {
        text += (text.length > 0 ? ' ' : '') + t;
      }
    }
  }
  return text;
}
