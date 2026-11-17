import { useState } from 'react';
import { ArrowUp, Folder, Pencil, Plus, Settings, Trash2 } from 'lucide-react';
import { TEMPLATES } from '@zsi/shared';
import { useT } from '../i18n';
import { sendToDirector } from '../lib/director';
import { useStore } from '../lib/store';
import { LangToggle } from '../components/Chrome';

/** Start screen: describe an idea to open a project with the Director, or pick an existing project. */
export function Home() {
  const t = useT();
  const { projects, openProject, newProject, renameProject, deleteProject, setSettingsOpen, setDirectorOpen, setConfirm, lang } = useStore();
  const [idea, setIdea] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async (text: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const prompt = text.trim();
      await newProject(prompt ? prompt.slice(0, 48) : 'Untitled project');
      if (prompt) {
        setDirectorOpen(true);
        void sendToDirector(prompt, t);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative h-full overflow-auto" style={{ background: 'radial-gradient(1200px 500px at 50% -10%, rgba(124,92,255,.22), transparent 70%), var(--color-bg)' }}>
      <div className="flex items-center justify-between p-4">
        <button className="btn" onClick={() => setSettingsOpen(true)}>
          <Settings size={14} /> {t('app.settings')}
        </button>
        <LangToggle />
      </div>

      <div className="mx-auto max-w-3xl px-6 pb-20 pt-10">
        <div className="mb-2 flex items-center justify-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg font-bold">Z</span>
          <h1 className="text-4xl font-semibold tracking-tight">zsicreative</h1>
        </div>
        <p className="mb-8 text-center text-[14px] text-muted">{t('home.tagline')}</p>

        <div className="float p-4">
          <textarea
            className="block h-28 w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none"
            placeholder={t('home.placeholder')}
            value={idea}
            autoFocus
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                start(idea);
              }
            }}
          />
          <div className="flex items-center gap-1.5 border-t border-line pt-3">
            <div className="flex flex-1 flex-wrap gap-1.5">
              {TEMPLATES.map((tp) => (
                <button key={tp.id} className="chip" onClick={() => setIdea(`${lang === 'vi' ? tp.nameVi : tp.name}: `)}>
                  {lang === 'vi' ? tp.nameVi : tp.name}
                </button>
              ))}
            </div>
            <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-2 disabled:opacity-40" disabled={busy || !idea.trim()} title={t('home.start')} onClick={() => start(idea)} data-testid="home-start">
              <ArrowUp size={18} />
            </button>
          </div>
        </div>

        <div className="mb-3 mt-12 flex items-center justify-between border-b border-line pb-3">
          <h2 className="text-base font-semibold">{t('app.projects')}</h2>
          <button className="btn" disabled={busy} onClick={() => start('')}>
            <Plus size={14} /> {t('home.blank')}
          </button>
        </div>

        {projects.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted">{t('home.empty')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {projects.map((p) => (
              <div key={p.id} className="group cursor-pointer overflow-hidden rounded-xl border border-line bg-panel hover:border-accent" onClick={() => openProject(p.id)}>
                <div className="flex aspect-video items-center justify-center bg-panel-2">
                  {p.coverUrl ? <img src={p.coverUrl} className="h-full w-full object-cover" loading="lazy" /> : <Folder size={26} className="text-line" />}
                </div>
                <div className="flex items-start gap-1 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-[11px] text-muted">
                      {t('home.opened')} {new Date(p.updatedAt).toLocaleDateString()} · ${p.totalCost.toFixed(2)}
                    </div>
                  </div>
                  <button
                    className="icon-btn h-6 min-w-6 px-1 opacity-0 group-hover:opacity-100"
                    title={t('app.rename')}
                    onClick={(e) => {
                      e.stopPropagation();
                      const name = prompt(t('app.rename'), p.name);
                      if (name) renameProject(p.id, name);
                    }}
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    className="icon-btn h-6 min-w-6 px-1 text-rose-300 opacity-0 group-hover:opacity-100"
                    title={t('app.delete')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirm({ title: p.name, body: t('app.confirmDelete'), okLabel: t('app.delete'), onOk: () => void deleteProject(p.id) });
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
