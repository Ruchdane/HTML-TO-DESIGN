/**
 * normalizer.ts
 *
 * Converts the flat Map<Element, WalkedElement> from the DOM walker into
 * a hierarchical ParsedNode tree suitable for sending to the plugin shape builder.
 *
 * Each element is classified as:
 *   - "image"     → <img> tags or elements with background-image url()
 *   - "svg"       → <svg> elements
 *   - "text"      → leaf elements containing only text
 *   - "container" → elements with child elements (may also have direct text)
 *   - "leaf"      → visible elements with no text and no children (decorative boxes)
 */

import type { ParsedNode, NodeKind, TextRun } from '../types/index';
import type { WalkedElement } from './dom-walker';
import { walkDOM } from './dom-walker';
import { extractStyles, parseTypography } from './style-extractor';

let idCounter = 0;
function nextId(): string {
  return `node-${++idCounter}`;
}

/**
 * Parse an HTML string rendered inside an iframe and return
 * the ParsedNode tree.
 *
 * @param iframeDoc  The contentDocument of the hidden iframe
 */
export function parseRenderedDOM(iframeDoc: Document): ParsedNode[] {
  idCounter = 0;

  const body = iframeDoc.body;
  if (!body) return [];

  const rootRect = body.getBoundingClientRect();
  const walked = walkDOM(body, rootRect);

  // Build the tree starting from the body's direct child elements
  const bodyWalked = walked.get(body);
  if (!bodyWalked) return [];

  // If the body itself has styling (background, borders), wrap everything in a root container
  const bodyNode = buildNode(body, walked);
  if (!bodyNode) return [];

  // If body has only one child and no styling of its own, promote the child
  if (
    bodyNode.children.length === 1 &&
    bodyNode.styles.fills.length === 0 &&
    bodyNode.styles.borders.length === 0 &&
    bodyNode.styles.shadows.length === 0
  ) {
    return bodyNode.children;
  }

  return [bodyNode];
}

function buildNode(
  el: Element,
  walked: Map<Element, WalkedElement>
): ParsedNode | null {
  const w = walked.get(el);
  if (!w) return null;

  const kind = classifyElement(el, w);
  const styles = extractStyles(w.computedStyle);

  const node: ParsedNode = {
    id: nextId(),
    kind,
    tag: el.tagName.toLowerCase(),
    name: buildName(el, kind),
    bounds: { ...w.bounds },
    styles,
    children: [],
  };

  // Handle SVG elements
  if (kind === 'svg') {
    node.svgMarkup = el.outerHTML;
    return node;
  }

  // Handle image elements
  if (kind === 'image') {
    const imgSrc = getImageSrc(el, w);
    if (imgSrc) {
      node.imageSrc = imgSrc;
    }
    return node;
  }

  // Handle text-only elements
  if (kind === 'text') {
    node.textRuns = buildTextRuns(el, w);
    return node;
  }

  // Container or leaf: recurse into children
  if (kind === 'container') {
    // If this container also has direct text alongside child elements,
    // create a synthetic text child for the direct text
    if (w.directText.length > 0) {
      const textNode = buildSyntheticTextNode(el, w);
      if (textNode) node.children.push(textNode);
    }

    for (const childEl of w.childElements) {
      const childNode = buildNode(childEl, walked);
      if (childNode) node.children.push(childNode);
    }
  }

  return node;
}

/**
 * Classify what kind of Penpot shape this element should become.
 */
function classifyElement(el: Element, w: WalkedElement): NodeKind {
  const tag = el.tagName.toUpperCase();

  // SVG elements
  if (tag === 'SVG') return 'svg';

  // Image elements
  if (tag === 'IMG') return 'image';
  if (tag === 'PICTURE') return 'image';
  if (tag === 'VIDEO') return 'image'; // treat video poster as image

  // Canvas → treat as leaf (we can't extract its content)
  if (tag === 'CANVAS') return 'leaf';

  // Check for background-image url (image fills)
  const bgImage = w.computedStyle.backgroundImage || '';
  if (bgImage.includes('url(') && !bgImage.includes('gradient')) {
    // If it has no child elements and no text, treat as an image container
    if (w.childElements.length === 0 && w.directText.length === 0) {
      return 'image';
    }
  }

  // Elements with visible child elements → container
  if (w.childElements.length > 0) return 'container';

  // Elements with only text → text
  if (w.isTextOnly) return 'text';

  // Elements with no children and no text → leaf (decorative box)
  return 'leaf';
}

/**
 * Build a readable name for the Penpot layer.
 */
function buildName(el: Element, kind: NodeKind): string {
  const tag = el.tagName.toLowerCase();

  // Use id or class for better naming
  const id = el.id;
  if (id) return `${tag}#${id}`;

  const cls = el.className;
  if (typeof cls === 'string' && cls.trim()) {
    const firstClass = cls.trim().split(/\s+/)[0];
    return `${tag}.${firstClass}`;
  }

  // Default names
  const kindNames: Record<NodeKind, string> = {
    container: `${tag} container`,
    text: `${tag} text`,
    image: `${tag} image`,
    svg: `${tag} svg`,
    leaf: `${tag} shape`,
  };

  return kindNames[kind];
}

/**
 * Get image source from an element.
 */
function getImageSrc(el: Element, w: WalkedElement): string | null {
  if (el.tagName === 'IMG') {
    // Try to get the natural src (not srcset)
    const src = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src;
    return src || null;
  }

  // Background image
  const bgImage = w.computedStyle.backgroundImage || '';
  const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
  if (urlMatch) return urlMatch[1];

  return null;
}

/**
 * Build text runs for a text-only element.
 * For simple text nodes, this creates a single run.
 * For elements with inline children (span, strong, em, a), it creates
 * multiple runs with different typography.
 */
function buildTextRuns(el: Element, w: WalkedElement): TextRun[] {
  const runs: TextRun[] = [];
  const doc = el.ownerDocument;
  if (!doc || !doc.defaultView) return runs;

  // Walk child nodes for mixed inline content
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        runs.push({
          text,
          typography: parseTypography(w.computedStyle),
        });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const childEl = node as Element;
      const childTag = childEl.tagName.toUpperCase();

      // Only handle inline-level elements inside text
      const inlineTags = new Set([
        'SPAN', 'STRONG', 'B', 'EM', 'I', 'A', 'U', 'S', 'MARK',
        'SMALL', 'SUB', 'SUP', 'CODE', 'ABBR', 'CITE',
      ]);

      if (inlineTags.has(childTag)) {
        const childText = childEl.textContent?.trim();
        if (childText) {
          const childCs = doc.defaultView!.getComputedStyle(childEl);
          runs.push({
            text: childText,
            typography: parseTypography(childCs),
          });
        }
      }
    }
  }

  // Fallback: if no runs were created, use the whole text
  if (runs.length === 0 && w.directText) {
    runs.push({
      text: w.directText,
      typography: parseTypography(w.computedStyle),
    });
  }

  return runs;
}

/**
 * Create a synthetic text child node for containers that have
 * both direct text and child elements.
 */
function buildSyntheticTextNode(
  el: Element,
  w: WalkedElement
): ParsedNode | null {
  if (!w.directText) return null;

  const typography = parseTypography(w.computedStyle);

  return {
    id: nextId(),
    kind: 'text',
    tag: 'span',
    name: 'inline text',
    bounds: { ...w.bounds }, // Same bounds as parent (best effort)
    styles: {
      fills: [],
      borders: [],
      borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
      shadows: [],
      opacity: 1,
      overflow: 'visible',
    },
    children: [],
    textRuns: [
      {
        text: w.directText,
        typography,
      },
    ],
  };
}
