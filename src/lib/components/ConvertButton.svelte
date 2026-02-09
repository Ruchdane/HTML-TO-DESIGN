<script lang="ts">
  let {
    loading = false,
    disabled = false,
    progress = null as { completed: number; total: number; currentName: string } | null,
    error = null as string | null,
    success = null as string | null,
    onclick,
  }: {
    loading?: boolean;
    disabled?: boolean;
    progress?: { completed: number; total: number; currentName: string } | null;
    error?: string | null;
    success?: string | null;
    onclick: () => void;
  } = $props();

  const progressPercent = $derived(
    progress ? Math.round((progress.completed / Math.max(1, progress.total)) * 100) : 0
  );
</script>

<div class="convert-section">
  <button
    class="convert-btn"
    onclick={onclick}
    disabled={disabled || loading}
    type="button"
  >
    {#if loading}
      <span class="spinner"></span>
      <span>Converting</span>
    {:else}
      <span>Convert to Design</span>
    {/if}
  </button>

  {#if loading && progress}
    <div class="progress-track">
      <div class="progress-bar" style="width: {progressPercent}%"></div>
    </div>
    <p class="progress-text">
      {progress.completed} / {progress.total}
    </p>
  {/if}

  {#if error}
    <p class="message error-msg">{error}</p>
  {/if}

  {#if success}
    <p class="message success-msg">{success}</p>
  {/if}
</div>

<style>
  .convert-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .convert-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 12px 20px;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--c-surface);
    background: var(--c-accent);
    border: none;
    border-radius: 2px;
    cursor: pointer;
    transition: opacity 0.15s ease;
  }

  .convert-btn:hover:not(:disabled) {
    opacity: 0.85;
  }

  .convert-btn:active:not(:disabled) {
    opacity: 0.75;
  }

  .convert-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1.5px solid rgba(255, 255, 255, 0.3);
    border-top-color: var(--c-surface);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .progress-track {
    width: 100%;
    height: 2px;
    background: var(--c-border);
    border-radius: 1px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: var(--c-accent);
    border-radius: 1px;
    transition: width 0.2s ease;
  }

  .progress-text {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--c-text-muted);
    text-align: center;
    margin: 0;
  }

  .message {
    padding: 10px 14px;
    border-radius: 2px;
    font-size: 11px;
    letter-spacing: 0.02em;
    margin: 0;
  }

  .error-msg {
    background: rgba(196, 80, 80, 0.08);
    color: var(--c-error);
    border: 1px solid rgba(196, 80, 80, 0.2);
  }

  .success-msg {
    background: rgba(74, 140, 106, 0.08);
    color: var(--c-success);
    border: 1px solid rgba(74, 140, 106, 0.2);
  }
</style>
