import { Bot, Circle, Send } from 'lucide-react';
import { useState } from 'react';
import { Tooltip } from '../../ui/Tooltip';
import type { PaneViewProps } from '../../layout/registry';

/**
 * Agent pane (placeholder).
 *
 * The runtime is deliberately not connected: no model, no process, no SDK. The pane
 * exists so the host layout can be exercised, and it reports 'ready' rather than
 * pretending a session is live.
 */
export function AgentPanel({ pane, onStatus }: PaneViewProps) {
  const [prompt, setPrompt] = useState('');
  const [staged, setStaged] = useState(false);

  const submit = () => {
    if (!prompt.trim()) return;
    setStaged(true);
    setPrompt('');
    onStatus('ready');
  };

  return (
    <div className="agent-pane">
      <div className="agent-empty">
        <Bot size={26} strokeWidth={1.2} />
        <span className={`agent-dot ${staged ? 'is-live' : ''}`} aria-hidden="true">
          <Circle size={6} fill="currentColor" strokeWidth={0} />
        </span>
      </div>
      <div className="agent-composer">
        <textarea
          className="v-input v-composer-input"
          rows={2}
          aria-label={`Message Agent (${pane.target.entityId || 'new session'})`}
          placeholder="Message"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
          }}
        />
        <Tooltip label="Send">
          <button type="button" className="v-icon" aria-label="Send" onClick={submit}>
            <Send size={16} strokeWidth={1.7} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
