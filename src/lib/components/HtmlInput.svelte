<script lang="ts">
  let { value = $bindable(''), disabled = false } = $props();

  const placeholder = `<div style="display: flex; gap: 16px; padding: 24px;">
  <h2>Hello World</h2>
  <p>Paste your HTML here.</p>
</div>`;
</script>

<div class="html-input">
  <span class="label">code</span>
  <textarea
    class="code-area"
    bind:value={value}
    {placeholder}
    {disabled}
    spellcheck="false"
    autocomplete="off"
    aria-label="HTML Code"
  ></textarea>
</div>

<style>
  .html-input {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-height: 0;
  }

  .label {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--c-text-muted);
  }

  .code-area {
    flex: 1;
    min-height: 140px;
    padding: 14px;
    border: 1px solid var(--c-border);
    border-radius: 2px;
    background: var(--c-surface);
    color: var(--c-text);
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 11px;
    line-height: 1.6;
    resize: none;
    outline: none;
    tab-size: 2;
    white-space: pre;
    overflow: auto;
    transition: border-color 0.15s ease;
  }

  .code-area::placeholder {
    color: var(--c-text-muted);
    opacity: 0.5;
  }

  .code-area:focus {
    border-color: var(--c-accent);
  }

  .code-area:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
