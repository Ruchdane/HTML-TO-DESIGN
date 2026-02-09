<script lang="ts">
  import HtmlInput from './lib/components/HtmlInput.svelte';
  import CssInput from './lib/components/CssInput.svelte';
  import ViewportSelector from './lib/components/ViewportSelector.svelte';
  import Preview from './lib/components/Preview.svelte';
  import ConvertButton from './lib/components/ConvertButton.svelte';
  import { prefetchTailwind } from './lib/parser/tailwind-loader';
  import type { ParsedNode, PluginToUiMessage, ConvertMessage } from './lib/types/index';

  // ── State ────────────────────────────────────────────────────

  let htmlCode = $state('');
  let customCss = $state('');
  let viewportWidth = $state(500);
  let loading = $state(false);
  let progress = $state<{ completed: number; total: number; currentName: string } | null>(null);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  let statusLog = $state('Ready.');
  let parsedTree = $state<ParsedNode[]>([]);
  let theme = $state('');
  let previewRef: Preview | undefined = $state();

  // ── Theme ────────────────────────────────────────────────────

  const url = new URL(window.location.href);
  const initialTheme = url.searchParams.get('theme');
  if (initialTheme) theme = initialTheme;

  $effect(() => {
    document.body.dataset.theme = theme;
  });

  // ── Prefetch Tailwind CDN ────────────────────────────────────

  prefetchTailwind();

  // ── Plugin Message Handling ──────────────────────────────────

  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data as PluginToUiMessage;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'theme':
        theme = msg.content;
        break;
      case 'progress':
        progress = { completed: msg.completed, total: msg.total, currentName: msg.currentName };
        break;
      case 'done':
        loading = false;
        progress = null;
        error = null;
        success = `${msg.shapesCreated} shape${msg.shapesCreated !== 1 ? 's' : ''} created.`;
        setTimeout(() => { success = null; }, 8000);
        break;
      case 'error':
        loading = false;
        progress = null;
        success = null;
        error = msg.message;
        break;
    }
  });

  function sendToPlugin(message: ConvertMessage): void {
    parent.postMessage(message, '*');
  }

  // ── Conversion Flow ──────────────────────────────────────────

  async function handleConvert(): Promise<void> {
    if (!htmlCode.trim()) {
      error = 'Paste some HTML first.';
      return;
    }

    error = null;
    success = null;
    loading = true;
    statusLog = 'Rendering...';
    progress = { completed: 0, total: 0, currentName: 'Rendering HTML...' };

    try {
      if (!previewRef) throw new Error('Preview not ready');

      const tree = await previewRef.parseHtml();
      if (tree.length === 0) throw new Error('No visible elements found.');

      parsedTree = tree;
      progress = { completed: 0, total: countNodes(tree), currentName: 'Creating shapes...' };
      sendToPlugin({ type: 'convert', tree });
    } catch (err) {
      loading = false;
      progress = null;
      error = err instanceof Error ? err.message : 'Parse failed.';
    }
  }

  function countNodes(nodes: ParsedNode[]): number {
    let c = 0;
    for (const n of nodes) c += 1 + countNodes(n.children);
    return c;
  }

  function handleParsed(tree: ParsedNode[]): void {
    parsedTree = tree;
  }

  function handleStatus(msg: string): void {
    statusLog = msg;
  }
</script>

<main class="app">
  <header class="header">
    <h1 class="title">HTML TO DESIGN</h1>
  </header>

  <section class="content">
    <HtmlInput bind:value={htmlCode} disabled={loading} />
    <ViewportSelector bind:width={viewportWidth} disabled={loading} />
    <CssInput bind:value={customCss} disabled={loading} />

    <Preview
      bind:this={previewRef}
      html={htmlCode}
      customCss={customCss}
      viewportWidth={viewportWidth}
      onParsed={handleParsed}
      onStatus={handleStatus}
    />

    <ConvertButton
      {loading}
      disabled={!htmlCode.trim()}
      {progress}
      {error}
      {success}
      onclick={handleConvert}
    />
  </section>

  <footer class="footer">
    <p class="status-log">{statusLog}</p>
  </footer>
</main>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 24px;
    gap: 20px;
    background: var(--c-bg);
    color: var(--c-text);
    overflow: hidden;
  }

  .header {
    flex-shrink: 0;
  }

  .title {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.14em;
    color: var(--c-text);
    margin: 0;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 20px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .footer {
    flex-shrink: 0;
    padding-top: 12px;
    border-top: 1px solid var(--c-border);
  }

  .status-log {
    font-size: 10px;
    font-family: 'JetBrains Mono', monospace;
    color: var(--c-text-muted);
    text-align: left;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.02em;
  }
</style>
