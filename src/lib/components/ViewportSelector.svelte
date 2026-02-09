<script lang="ts">
  let { width = $bindable(500), disabled = false } = $props();

  const presets = [
    { label: 'Phone', value: 390 },
    { label: 'Mockup', value: 500 },
    { label: 'Tablet', value: 768 },
    { label: 'Desktop', value: 1280 },
  ];

  let customMode = $state(false);
</script>

<div class="viewport-selector">
  <span class="label">viewport</span>
  <div class="options">
    {#each presets as preset}
      <button
        class="preset-btn"
        class:active={!customMode && width === preset.value}
        onclick={() => { customMode = false; width = preset.value; }}
        {disabled}
        type="button"
      >
        {preset.label}
      </button>
    {/each}
    <button
      class="preset-btn"
      class:active={customMode}
      onclick={() => { customMode = true; }}
      {disabled}
      type="button"
    >
      Custom
    </button>
  </div>
  {#if customMode}
    <div class="custom-input">
      <input
        type="number"
        bind:value={width}
        min="200"
        max="2560"
        {disabled}
        aria-label="Custom viewport width"
      />
      <span class="unit">px</span>
    </div>
  {/if}
</div>

<style>
  .viewport-selector {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .label {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--c-text-muted);
  }

  .options {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .preset-btn {
    padding: 6px 14px;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.03em;
    color: var(--c-text);
    background: transparent;
    border: 1px solid var(--c-border);
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .preset-btn:hover:not(:disabled) {
    border-color: var(--c-text-muted);
  }

  .preset-btn.active {
    color: var(--c-surface);
    background: var(--c-accent);
    border-color: var(--c-accent);
  }

  .preset-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .custom-input {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .custom-input input {
    width: 80px;
    padding: 6px 10px;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 12px;
    color: var(--c-text);
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: 2px;
    outline: none;
    transition: border-color 0.15s ease;
  }

  .custom-input input:focus {
    border-color: var(--c-accent);
  }

  .unit {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--c-text-muted);
  }
</style>
