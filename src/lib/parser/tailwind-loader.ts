/**
 * tailwind-loader.ts
 *
 * Fetches the Tailwind CSS Play CDN script at runtime and caches it.
 * We inject it as inline JS in the render iframe to avoid CSP issues
 * that come from loading external scripts in nested sandboxed iframes.
 */

let cachedScript: string | null = null;
let loadingPromise: Promise<string | null> | null = null;

// Primary CDN URL (Tailwind v3 Play CDN)
const TAILWIND_CDN_URL = 'https://cdn.tailwindcss.com/3.4.17';
// Fallback URL
const TAILWIND_CDN_FALLBACK = 'https://cdn.tailwindcss.com';

/**
 * Fetch and cache the Tailwind CDN script content.
 * Returns the script text, or null if fetching fails.
 */
export async function getTailwindScript(): Promise<string | null> {
  if (cachedScript) return cachedScript;
  if (loadingPromise) return loadingPromise;

  loadingPromise = fetchWithFallback();
  const result = await loadingPromise;
  loadingPromise = null;
  return result;
}

async function fetchWithFallback(): Promise<string | null> {
  // Try primary URL first
  try {
    const resp = await fetch(TAILWIND_CDN_URL, { mode: 'cors' });
    if (resp.ok) {
      cachedScript = await resp.text();
      console.log(`[html-to-design] Tailwind CDN loaded (${Math.round(cachedScript.length / 1024)}KB)`);
      return cachedScript;
    }
  } catch (e) {
    console.warn('[html-to-design] Primary Tailwind CDN fetch failed:', e);
  }

  // Try fallback URL
  try {
    const resp = await fetch(TAILWIND_CDN_FALLBACK, { mode: 'cors' });
    if (resp.ok) {
      cachedScript = await resp.text();
      console.log(`[html-to-design] Tailwind CDN fallback loaded (${Math.round(cachedScript.length / 1024)}KB)`);
      return cachedScript;
    }
  } catch (e) {
    console.warn('[html-to-design] Fallback Tailwind CDN fetch failed:', e);
  }

  console.error('[html-to-design] Could not load Tailwind CDN. Tailwind classes will not be resolved.');
  return null;
}

/**
 * Check if the Tailwind script has already been fetched and cached.
 */
function isTailwindCached(): boolean {
  return cachedScript !== null;
}

/**
 * Pre-fetch the Tailwind script in the background.
 * Call this on plugin load so it's ready when the user clicks convert.
 */
export function prefetchTailwind(): void {
  getTailwindScript().catch(() => {});
}
