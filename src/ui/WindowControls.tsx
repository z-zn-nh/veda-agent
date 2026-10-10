import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';

/**
 * Native window buttons for the frameless desktop shell.
 * Renders nothing in a plain browser so `npm run dev` keeps working.
 */
export function WindowControls() {
  if (!isTauri()) return null;
  const appWindow = getCurrentWindow();

  return (
    <div className="window-controls">
      <button className="window-button" onClick={() => void appWindow.minimize()} title="Minimize" type="button">
        <Minus size={14} />
      </button>
      <button className="window-button" onClick={() => void appWindow.toggleMaximize()} title="Maximize" type="button">
        <Square size={11} />
      </button>
      <button className="window-button window-button-close" onClick={() => void appWindow.close()} title="Close" type="button">
        <X size={14} />
      </button>
    </div>
  );
}
