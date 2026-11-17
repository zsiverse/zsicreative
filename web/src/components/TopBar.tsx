import { useState } from 'react';
import { ChevronDown, Plus, Settings, Trash2, Pencil, Check } from 'lucide-react';
import { useStore } from '../lib/store';
import { useT } from '../i18n';

export function TopBar() {
  const t = useT();
  const { project, projects, saveState, lang, setLang, openProject, newProject, renameProject, deleteProject, setSettingsOpen } = useStore();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <div className="flex items-center gap-2 font-semibold tracking-tight">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-[12px] font-bold">Z</span>
        zsicreative
      </div>
      <span className="text-line">/</span>

      {editing != null ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            renameProject(editing);
            setEditing(null);
          }}
        >
          <input autoFocus className="field w-56 py-1" value={editing} onChange={(e) => setEditing(e.target.value)} onBlur={() => setEditing(null)} />
          <button className="btn py-1" onMouseDown={(e) => e.preventDefault()}>
            <Check size={14} />
          </button>
        </form>
      ) : (
        <div className="relative">
          <button className="btn border-transparent bg-transparent py-1" onClick={() => setMenu(!menu)}>
            {project?.name ?? '…'} <ChevronDown size={14} />
          </button>
          {menu && (
            <div className="absolute left-0 top-9 w-72 rounded-xl border border-line bg-panel-2 p-1 shadow-2xl" onMouseLeave={() => setMenu(false)}>
              <div className="px-2 py-1 text-[11px] text-muted">{t('app.projects')}</div>
              <div className="max-h-72 overflow-auto">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-line ${p.id === project?.id ? 'text-accent-2' : ''}`}
                    onClick={() => {
                      openProject(p.id);
                      setMenu(false);
                    }}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-[11px] text-muted">${p.totalCost.toFixed(2)}</span>
                  </button>
                ))}
              </div>
              <div className="my-1 border-t border-line" />
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-line" onClick={() => { newProject('Untitled project'); setMenu(false); }}>
                <Plus size={14} /> {t('app.newProject')}
              </button>
              <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-line" onClick={() => { setEditing(project?.name ?? ''); setMenu(false); }}>
                <Pencil size={14} /> {t('app.rename')}
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-rose-300 hover:bg-line"
                onClick={() => {
                  setMenu(false);
                  if (confirm(t('app.confirmDelete'))) deleteProject();
                }}
              >
                <Trash2 size={14} /> {t('app.delete')}
              </button>
            </div>
          )}
        </div>
      )}

      <span className="text-[11px] text-muted">{saveState === 'saving' ? t('app.saving') : t('app.saved')}</span>

      <div className="ml-auto flex items-center gap-2">
        <span className="rounded-lg border border-line px-2 py-1 text-[12px]">
          <span className="text-muted">{t('app.spent')}:</span> ~${(project?.totalCost ?? 0).toFixed(2)}
        </span>
        <div className="flex overflow-hidden rounded-lg border border-line">
          {(['en', 'vi'] as const).map((l) => (
            <button key={l} className={`px-2 py-1 text-[12px] uppercase ${lang === l ? 'bg-accent text-white' : 'text-muted hover:text-white'}`} onClick={() => setLang(l)}>
              {l}
            </button>
          ))}
        </div>
        <button className="btn py-1" onClick={() => setSettingsOpen(true)}>
          <Settings size={14} /> {t('app.settings')}
        </button>
      </div>
    </header>
  );
}
