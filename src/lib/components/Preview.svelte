<script lang="ts">
  import { parseRenderedDOM } from '../parser/normalizer';
  import { getTailwindScript } from '../parser/tailwind-loader';
  import type { ParsedNode } from '../types/index';

  let {
    html = '',
    customCss = '',
    viewportWidth = 390,
    onParsed,
    onStatus,
  }: {
    html: string;
    customCss?: string;
    viewportWidth?: number;
    onParsed: (tree: ParsedNode[]) => void;
    onStatus?: (msg: string) => void;
  } = $props();

  let renderFrame: HTMLIFrameElement | undefined = $state();
  let previewFrame: HTMLIFrameElement | undefined = $state();
  let showPreview = $state(false);

  function log(msg: string) {
    console.log(`[html-to-design] ${msg}`);
    onStatus?.(msg);
  }

  $effect(() => {
    if (showPreview && previewFrame && html) {
      buildDocument(html).then((doc) => {
        if (previewFrame) previewFrame.srcdoc = doc;
      });
    }
  });

  /**
   * Parse the HTML: render in iframe, wait for styles, walk DOM.
   */
  export async function parseHtml(): Promise<ParsedNode[]> {
    if (!renderFrame) {
      throw new Error('Render iframe not available');
    }

    log('Building document...');
    const fullHtml = await buildDocument(html);

    const needsTailwind = detectTailwind(html);
    const frame = renderFrame;

    // Resize the render frame to the chosen viewport width
    frame.style.width = viewportWidth + 'px';

    return new Promise((resolve, reject) => {
      frame.onload = () => {
        const waitMs = needsTailwind ? 2500 : 500;
        log(needsTailwind
          ? `Waiting ${waitMs}ms for Tailwind to compile...`
          : `Waiting ${waitMs}ms for styles to settle...`);

        if (needsTailwind) {
          waitForTailwind(frame, waitMs).then(() => {
            extractTree(frame, resolve, reject);
          });
        } else {
          setTimeout(() => extractTree(frame, resolve, reject), waitMs);
        }
      };

      frame.onerror = () => reject(new Error('Iframe failed to load'));
      frame.srcdoc = fullHtml;
    });
  }

  function waitForTailwind(frame: HTMLIFrameElement, maxWait: number): Promise<void> {
    return new Promise((resolve) => {
      const start = Date.now();

      function check() {
        if (Date.now() - start >= maxWait) {
          log('Tailwind wait timed out, proceeding anyway.');
          resolve();
          return;
        }

        try {
          const doc = frame.contentDocument;
          if (doc) {
            const styles = doc.querySelectorAll('style');
            for (const s of styles) {
              const text = s.textContent || '';
              if (text.length > 500 && (text.includes('.flex') || text.includes('.bg-') || text.includes('.text-'))) {
                log(`Tailwind styles detected (${Math.round(text.length / 1024)}KB generated).`);
                setTimeout(resolve, 400);
                return;
              }
            }
          }
        } catch { /* ignore */ }

        setTimeout(check, 200);
      }

      check();
    });
  }

  function extractTree(
    frame: HTMLIFrameElement,
    resolve: (tree: ParsedNode[]) => void,
    reject: (err: Error) => void
  ) {
    try {
      const doc = frame.contentDocument;
      if (!doc) {
        reject(new Error('Cannot access iframe document'));
        return;
      }

      // Debug: log what we can see
      const body = doc.body;
      if (body) {
        const cs = doc.defaultView?.getComputedStyle(body);
        log(`Body bg: ${cs?.backgroundColor}, size: ${body.scrollWidth}x${body.scrollHeight}`);
      }

      const tree = parseRenderedDOM(doc);
      log(`Parsed ${countNodes(tree)} elements.`);
      onParsed(tree);
      resolve(tree);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  function countNodes(nodes: ParsedNode[]): number {
    let c = 0;
    for (const n of nodes) c += 1 + countNodes(n.children);
    return c;
  }

  // ── Tailwind Detection ───────────────────────────────────────

  const TAILWIND_PATTERNS = [
    /\bflex\b/, /\bgrid\b/, /\bhidden\b/,
    /\bbg-\w/, /\btext-\w/, /\bborder-\w/,
    /\brounded(?:-\w)?/, /\bp[xytrbl]?-\d/, /\bm[xytrbl]?-\d/,
    /\bw-\d/, /\bh-\d/, /\bgap-\d/, /\bjustify-/, /\bitems-/,
    /\bfont-(?:bold|semibold|medium|light|serif|mono)/,
    /\btext-(?:xs|sm|base|lg|xl|\dxl)/,
    /\bshadow/, /\bopacity-/, /\brelative\b/, /\babsolute\b/,
    /\btracking-/, /\bleading-/, /\buppercase\b/,
  ];

  function detectTailwind(htmlStr: string): boolean {
    if (htmlStr.includes('tailwindcss') || htmlStr.includes('cdn.tailwindcss.com')) return true;
    let matches = 0;
    for (const p of TAILWIND_PATTERNS) {
      if (p.test(htmlStr)) { matches++; if (matches >= 3) return true; }
    }
    return false;
  }

  // ── Document Builder ─────────────────────────────────────────

  // Build tag strings to avoid Svelte parser issues with closing tags
  const SO = '<' + 'script>';
  const SC = '<' + '/script>';
  const SRC_OPEN = '<' + 'script ';

  async function buildDocument(userHtml: string): Promise<string> {
    const needsTailwind = detectTailwind(userHtml);
    let doc = userHtml;

    // ── Step 1: Replace external Tailwind CDN scripts with our inline version ──
    // The external CDN can't load inside sandboxed nested iframes.
    if (needsTailwind) {
      const twScript = await getTailwindScript();

      if (twScript) {
        // Remove ALL external tailwindcss script tags
        doc = doc.replace(
          new RegExp(SRC_OPEN.replace('<', '&lt;').replace('<', '<') + '[^>]*cdn\\.tailwindcss\\.com[^>]*>[\\s\\S]*?' + SC, 'gi'),
          ''
        );
        // Also try the un-escaped version
        doc = doc.replace(
          /<script[^>]*cdn\.tailwindcss\.com[^>]*>[\s\S]*?<\/script>/gi,
          ''
        );

        // Inject our inline Tailwind right after <head> (must come BEFORE the config)
        const twInline = SO + twScript + SC;
        if (/<head[^>]*>/i.test(doc)) {
          doc = doc.replace(/<head[^>]*>/i, '$&\n' + twInline + '\n');
        }
        log('Tailwind CDN replaced with inline (' + Math.round(twScript.length / 1024) + 'KB).');
      } else {
        log('WARNING: Could not fetch Tailwind CDN. Custom classes will not resolve.');
      }
    }

    // ── Step 2: Strip external Google Fonts / icon font links ──
    // These will timeout in the sandboxed iframe and delay rendering.
    // We keep the font-family CSS so text still gets sized correctly.
    doc = doc.replace(/<link[^>]*fonts\.googleapis\.com[^>]*\/?>/gi, '');
    doc = doc.replace(/<link[^>]*fonts\.gstatic\.com[^>]*\/?>/gi, '');

    // ── Step 3: Convert <style type="text/tailwindcss"> to <style> ──
    // Tailwind CDN processes these automatically when present.
    // But we need the type attribute removed if Tailwind didn't load.
    // With inline Tailwind, this should work as-is, but normalize just in case.
    doc = doc.replace(/<style\s+type=["']text\/tailwindcss["']/gi, '<style');

    // ── Step 4: Hide the splash overlay so we see the actual content ──
    // Look for elements with id="splash" and force them hidden.
    doc = doc.replace(
      /(<div[^>]*id=["']splash["'][^>]*)(>)/gi,
      '$1 style="display:none!important"$2'
    );

    // ── Step 5: Inject custom CSS from the user ──
    if (customCss.trim()) {
      const isConfig = customCss.includes('tailwind.config') || customCss.includes('theme');
      const injection = isConfig
        ? SO + customCss + SC
        : '<style>' + customCss + '</style>';
      if (/<\/head>/i.test(doc)) {
        doc = doc.replace(/<\/head>/i, injection + '\n$&');
      }
    }

    // ── Step 6: Wrap in a document if it's a fragment ──
    if (!/<html[\s>]/i.test(doc)) {
      doc = '<!doctype html>\n<html>\n<head>\n<meta charset="UTF-8">\n</head>\n<body style="margin:0;padding:0;">\n' + doc + '\n</body>\n</html>';
    }

    return doc;
  }
</script>

<div class="preview-container">
  <button
    class="toggle-preview"
    onclick={() => (showPreview = !showPreview)}
    type="button"
  >
    <span class="toggle-label">preview</span>
    <span class="toggle-indicator">{showPreview ? '--' : '+'}</span>
  </button>

  {#if showPreview}
    <div class="preview-frame-wrapper">
      <iframe
        bind:this={previewFrame}
        class="preview-frame"
        title="HTML Preview"
        sandbox="allow-same-origin allow-scripts"
        style="width: {viewportWidth}px"
      ></iframe>
    </div>
  {/if}

  <!-- Off-screen iframe for rendering + DOM walking -->
  <iframe
    bind:this={renderFrame}
    class="render-frame"
    title="Render frame"
    sandbox="allow-same-origin allow-scripts"
    style="width: {viewportWidth}px"
  ></iframe>
</div>

<style>
  .preview-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
  }

  .toggle-preview {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--c-text-muted);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .toggle-preview:hover {
    color: var(--c-text);
  }

  .toggle-indicator {
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0;
  }

  .preview-frame-wrapper {
    border: 1px solid var(--c-border);
    border-radius: 2px;
    overflow: auto;
    background: var(--c-surface);
    height: 200px;
  }

  .preview-frame {
    height: 100%;
    border: none;
  }

  .render-frame {
    position: absolute;
    height: 2000px;
    left: -9999px;
    top: -9999px;
    border: none;
    opacity: 0;
    pointer-events: none;
  }
</style>
