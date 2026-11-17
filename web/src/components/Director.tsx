import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Clapperboard, Loader2, MessageSquarePlus, Play, Plus, X } from 'lucide-react';
import { TEMPLATES } from '@zsi/shared';
import { useT } from '../i18n';
import { confirmAndRun, money, planCost, sendToDirector } from '../lib/director';
import { effectiveModel, modelOptions, useStore, type ChatMessage } from '../lib/store';
import { NODE_META } from '../nodes/nodes';

function PlanCard({ msg, onAdded }: { msg: ChatMessage; onAdded(ids: string[]): void }) {
  const t = useT();
  const { applyPlan, patchChat } = useStore();
  useStore((s) => s.providers);
  const plan = msg.plan!;
  const applied = !!msg.appliedNodeIds;
  return (
    <div className="mt-2 rounded-xl border border-line bg-panel p-3">
      <div className="font-semibold">{plan.title}</div>
      {plan.summary && <div className="mt-0.5 text-[11px] leading-snug text-muted">{plan.summary}</div>}
      <div className="mt-2 space-y-1">
        {plan.nodes.map((n) => (
          <div key={n.ref} className="flex items-center gap-2 text-[12px]">
            <span style={{ color: NODE_META[n.type].color }}>{NODE_META[n.type].icon(12)}</span>
            <span className="truncate">{n.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        {applied ? (
          <>
            <span className="flex items-center gap-1 text-[11px] text-emerald-300">
              <Check size={12} /> {t('director.applied')}
            </span>
            <button className="btn btn-primary ml-auto py-1" onClick={() => confirmAndRun(t, msg.appliedNodeIds)}>
              <Play size={12} /> {t('director.runPlan')}
            </button>
          </>
        ) : (
          <>
            <span className="text-[11px] text-muted">
              {plan.nodes.length} {t('director.nodes')} · {t('director.est')} {money(planCost(plan), t)}
            </span>
            <button
              className="btn btn-primary ml-auto py-1"
              onClick={() => {
                const ids = applyPlan(plan);
                patchChat(msg.id, { appliedNodeIds: ids });
                onAdded(ids);
              }}
            >
              <Plus size={12} /> {t('director.apply')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Floating chat panel: the Director proposes plans, the user applies and runs them. */
export function Director({ onAdded }: { onAdded(ids: string[]): void }) {
  const t = useT();
  const { directorOpen, setDirectorOpen, chat, directorBusy, clearChat, providers, directorModelKey, setDirectorModelKey, lang, brief, pushChat } = useStore();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const opts = modelOptions(providers, 'text');
  const cur = effectiveModel(providers, 'text', directorModelKey);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [chat.length, directorBusy]);

  if (!directorOpen) return null;
  const send = () => {
    sendToDirector(text, t);
    setText('');
  };

  return (
    <aside className="float absolute bottom-3 right-3 top-16 z-20 flex w-[380px] flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Clapperboard size={15} className="text-accent-2" />
        <span className="font-semibold">{t('director.title')}</span>
        <button className="icon-btn ml-auto" title={t('director.new')} onClick={clearChat}>
          <MessageSquarePlus size={15} />
        </button>
        <button className="icon-btn" onClick={() => setDirectorOpen(false)}>
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-4">
        {chat.length === 0 && (
          <div>
            <p className="text-[13px] leading-relaxed text-muted">{t('director.hello')}</p>
            <p className="mb-1.5 mt-4 text-[11px] text-muted">{t('director.tryTemplates')}</p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATES.map((tp) => (
                <button
                  key={tp.id}
                  className="chip"
                  onClick={() => {
                    pushChat({ role: 'user', content: lang === 'vi' ? tp.nameVi : tp.name });
                    pushChat({ role: 'assistant', content: lang === 'vi' ? tp.descVi : tp.desc, plan: tp.build(brief) });
                  }}
                >
                  {lang === 'vi' ? tp.nameVi : tp.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent/25 px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="text-[13px] leading-relaxed">
              <div className={`whitespace-pre-wrap ${m.error ? 'rounded-lg bg-rose-500/10 p-2 text-rose-300' : ''}`}>{m.content}</div>
              {m.plan && <PlanCard msg={m} onAdded={onAdded} />}
            </div>
          ),
        )}
        {directorBusy && (
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <Loader2 size={13} className="animate-spin" /> {t('director.thinking')}
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="m-3 rounded-2xl border border-line bg-bg p-2.5">
        <textarea
          className="block h-16 w-full resize-none bg-transparent text-[13px] outline-none"
          placeholder={t('director.placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="flex items-center gap-2">
          {opts.length ? (
            <select className="chip max-w-[230px] truncate" value={cur?.key} onChange={(e) => setDirectorModelKey(e.target.value)}>
              {opts.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.model.label ?? o.model.id} · {o.providerName}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[11px] text-amber-300">{t('field.noModel')}</span>
          )}
          <button className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-2 disabled:opacity-40" disabled={directorBusy || !text.trim()} onClick={send} data-testid="director-send">
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
