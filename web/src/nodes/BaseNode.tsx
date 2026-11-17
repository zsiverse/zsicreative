import { Handle, Position } from '@xyflow/react';
import type { ReactNode } from 'react';
import { Loader2, Play, Square, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { JobStatus } from '@zsi/shared';
import { useT } from '../i18n';

export const HANDLE_COLORS = { text: '#38bdf8', image: '#f472b6', video: '#fbbf24' } as const;
export type HandleKind = keyof typeof HANDLE_COLORS;

interface Props {
  title: string;
  icon: ReactNode;
  accent: string;
  selected?: boolean;
  inputs?: HandleKind[];
  output?: HandleKind;
  status?: JobStatus;
  progress?: number;
  error?: string;
  cost?: number;
  onRun?: () => void;
  onCancel?: () => void;
  width?: number;
  children: ReactNode;
}

export function BaseNode({ title, icon, accent, selected, inputs = [], output, status, progress, error, cost, onRun, onCancel, width = 280, children }: Props) {
  const t = useT();
  const busy = status === 'queued' || status === 'running';
  return (
    <div
      className="rounded-xl border bg-panel shadow-xl shadow-black/40"
      style={{ width, borderColor: selected ? accent : 'var(--color-line)' }}
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-md" style={{ background: accent + '33', color: accent }}>
          {icon}
        </span>
        <span className="font-semibold">{title}</span>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted">
          {busy && <Loader2 size={12} className="animate-spin" />}
          {status === 'done' && <CheckCircle2 size={12} className="text-emerald-400" />}
          {status === 'failed' && <AlertTriangle size={12} className="text-rose-400" />}
          {status && t(`status.${status}` as any)}
          {busy && progress ? ` ${Math.round(progress * 100)}%` : ''}
        </span>
      </div>

      {busy && (
        <div className="h-0.5 bg-line">
          <div className="h-full transition-all" style={{ width: `${Math.max(5, (progress ?? 0) * 100)}%`, background: accent }} />
        </div>
      )}

      <div className="space-y-2 p-3">{children}</div>

      {error && status === 'failed' && <div className="mx-3 mb-2 rounded-md bg-rose-500/10 p-2 text-[11px] text-rose-300 break-words">{error}</div>}

      {onRun && (
        <div className="flex items-center justify-between border-t border-line px-3 py-2">
          <span className="text-[11px] text-muted">{cost != null ? (cost > 0 ? `~$${cost.toFixed(cost < 0.1 ? 3 : 2)}` : 'free') : ''}</span>
          {busy ? (
            <button className="btn nodrag py-1" onClick={onCancel}>
              <Square size={12} /> {t('cancel')}
            </button>
          ) : (
            <button className="btn btn-primary nodrag py-1" onClick={onRun}>
              <Play size={12} /> {t('run')}
            </button>
          )}
        </div>
      )}

      {inputs.map((kind, i) => (
        <Handle
          key={kind}
          id={kind}
          type="target"
          position={Position.Left}
          style={{ top: 52 + i * 26, background: HANDLE_COLORS[kind] }}
          title={t(`input.${kind}` as any)}
        />
      ))}
      {inputs.map((kind, i) => (
        <span key={kind + 'l'} className="pointer-events-none absolute -left-12 w-10 text-right text-[10px] text-muted" style={{ top: 45 + i * 26 }}>
          {t(`input.${kind}` as any)}
        </span>
      ))}
      {output && <Handle id={output} type="source" position={Position.Right} style={{ top: 52, background: HANDLE_COLORS[output] }} />}
    </div>
  );
}
