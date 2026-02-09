/**
 * plugin.ts
 *
 * Runs in the Penpot plugin sandbox (NOT inside the UI iframe).
 * Receives parsed HTML tree from the UI and creates Penpot shapes.
 */

import type {
  UiToPluginMessage,
  PluginToUiMessage,
  ProgressMessage,
} from './lib/types/index';
import { buildShapes } from './lib/converter/shape-builder';

// ── Open the Plugin UI ─────────────────────────────────────────

penpot.ui.open('HTML TO DESIGN', `?theme=${penpot.theme}`, {
  width: 480,
  height: 600,
});

// ── Listen for Messages from the UI ────────────────────────────

penpot.ui.onMessage(async (message: UiToPluginMessage) => {
  if (message.type === 'convert') {
    try {
      const shapesCreated = await buildShapes(
        message.tree,
        (progress: ProgressMessage) => {
          sendToUI(progress);
        }
      );

      sendToUI({
        type: 'done',
        shapesCreated,
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown error during conversion';
      sendToUI({
        type: 'error',
        message: errorMessage,
      });
    }
  }
});

// ── Theme Change Listener ──────────────────────────────────────

penpot.on('themechange', (theme) => {
  sendToUI({ type: 'theme', content: theme });
});

// ── Helper ─────────────────────────────────────────────────────

function sendToUI(message: PluginToUiMessage): void {
  penpot.ui.sendMessage(message);
}
