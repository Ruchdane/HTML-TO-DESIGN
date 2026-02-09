<script lang="ts">
  let { value = $bindable(''), disabled = false } = $props();
  let expanded = $state(false);

  const placeholder = [
    '/* Custom CSS or Tailwind config */',
    '',
    'tailwind.config = {',
    '  theme: { extend: { colors: {',
    "    brand: { dark: '#2C2C34' }",
    '  } } }',
    '}',
  ].join('\n');
</script>

<div class="css-input">
  <button
    class="toggle-btn"
    onclick={() => (expanded = !expanded)}
    type="button"
  >
    <span class="toggle-label">custom styles</span>
    <span class="toggle-indicator">{expanded ? '--' : '+'}</span>
  </button>

  {#if expanded}
    <textarea
      class="css-area"
      bind:value={value}
      {placeholder}
      {disabled}
      spellcheck="false"
      autocomplete="off"
      aria-label="Custom CSS or Tailwind config"
    ></textarea>
  {/if}
</div>

<style>
  .css-input {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .toggle-btn {
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

  .toggle-btn:hover {
    color: var(--c-text);
  }

  .toggle-indicator {
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0;
  }

  .css-area {
    min-height: 80px;
    max-height: 120px;
    padding: 14px;
    border: 1px solid var(--c-border);
    border-radius: 2px;
    background: var(--c-surface);
    color: var(--c-text);
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 11px;
    line-height: 1.6;
    resize: vertical;
    outline: none;
    tab-size: 2;
    white-space: pre;
    overflow: auto;
    transition: border-color 0.15s ease;
  }

  .css-area::placeholder {
    color: var(--c-text-muted);
    opacity: 0.5;
    white-space: pre;
  }

  .css-area:focus {
    border-color: var(--c-accent);
  }

  .css-area:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
