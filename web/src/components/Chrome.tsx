import { useRef, useState } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import { ArrowLeft, Clapperboard, FileText, FolderOpen, Hand, LayoutGrid, LayoutTemplate, Map as MapIcon, Maximize, Minus, MousePointer2, Play, Plus, Settings, Upload, Video } from 'lucide-react';
import { TEMPLATES } from '@zsi/shared';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { confirmAndRun } from '../lib/director';
import { fitPadding, useStore, type NodeKind } from '../lib/store';
import { NODE_META, NODE_ORDER } from '../nodes/nodes';

export const DND_ASSET = 'application/zsi-asset';
export const DND_NODE = 'application/zsi-node';

export function LangToggle() {
  const { lang, setLang } = useStore();
  return (
    <div className="flex overflow-hidden rounded-lg border border-line">
      {(['en', 'vi'] as const).map((l) => (
        <button key={l} className={`px-2 py-1 text-[11px] uppercase ${lang === l ? 'bg-accent text-white' : 'text-muted hover:text-white'}`} onClick={() => setLang(l)}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Top-left pill: back, settings, project name. Top-center: Canvas / Brief. Top-right: spend, language, Director. */
export function TopChrome() {
  const t = useT();
  const { project, saveState, tab, setTab, goHome, renameProject, setSettingsOpen } = useStore();
  const [name, setName] = useState<string | null>(null);
  if (!project) return null;
  return (
    <>
      <div className="float absolute left-3 top-3 z-20 flex items-center gap-0.5 p-1">
        <button className="icon-btn" title={t('app.home')} onClick={goHome}>
          <ArrowLeft size={16} />
        </button>
        <button className="icon-btn" title={t('app.settings')} onClick={() => setSettingsOpen(true)}>
          <Settings size={15} />
        </button>
        <span className="mx-1 h-5 w-px bg-line" />
        {name != null ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              renameProject(project.id, name);
              setName(null);
            }}
          >
            <input autoFocus className="field w-52 py-1" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setName(null)} />
          </form>
        ) : (
          <button className="icon-btn max-w-56 truncate px-2 font-medium text-white" title={t('app.rename')} onClick={() => setName(project.name)}>
            {project.name}
          </button>
        )}
        <span className="px-2 text-[11px] text-muted">{saveState === 'saving' ? t('app.saving') : t('app.saved')}</span>
      </div>

      <div className="float absolute left-1/2 top-3 z-20 flex -translate-x-1/2 gap-0.5 p-1">
        <button className={`icon-btn px-3 ${tab === 'canvas' ? 'on' : ''}`} onClick={() => setTab('canvas')}>
          <LayoutGrid size={14} /> {t('tab.canvas')}
        </button>
        <button className={`icon-btn px-3 ${tab === 'brief' ? 'on' : ''}`} onClick={() => setTab('brief')}>
          <FileText size={14} /> {t('tab.brief')}
        </button>
      </div>

      <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
        <span className="float px-2.5 py-1.5 text-[12px]">
          <span className="text-muted">{t('app.spent')}:</span> ~${project.totalCost.toFixed(2)}
        </span>
        <LangToggle />
      </div>
    </>
  );
}

export function NodeMenu({ onPick }: { onPick(kind: NodeKind): void }) {
  const t = useT();
  return (
    <div className="float w-52 p-1">
      <div className="px-2.5 py-1 text-[11px] text-muted">{t('menu.add')}</div>
      {NODE_ORDER.map((k) => (
        <button key={k} className="menu-item" onClick={() => onPick(k)}>
          <span style={{ color: NODE_META[k].color }}>{NODE_META[k].icon(15)}</span>
          {t(`node.${k}`)}
        </button>
      ))}
    </div>
  );
}

type Pop = 'assets' | 'templates' | null;

/** Bottom-center dock: pointer tools, one button per node type, templates, assets, run all. */
export function Toolbar({ onAdd, onAddedNodes }: { onAdd(kind: NodeKind): void; onAddedNodes(ids: string[]): void }) {
  const t = useT();
  const { assets, project, addAssets, setPreview, applyPlan, brief, tool, setTool, lang } = useStore();
  const [pop, setPop] = useState<Pop>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = Object.values(assets).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const toggle = (p: Pop) => setPop(pop === p ? null : p);
  const dock = 'flex h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-xl px-2 text-[10px] text-[#b9b9c8] hover:bg-line hover:text-white';

  return (
    <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2">
      {pop && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2">
          {pop === 'templates' && (
            <div className="float w-[340px] p-1.5">
              <div className="px-2.5 pb-1 pt-1.5">
                <div className="font-semibold">{t('templates.title')}</div>
                <div className="text-[11px] text-muted">{t('templates.hint')}</div>
              </div>
              {TEMPLATES.map((tp) => (
                <button
                  key={tp.id}
                  className="menu-item items-start"
                  onClick={() => {
                    onAddedNodes(applyPlan(tp.build(brief)));
                    setPop(null);
                  }}
                >
                  <LayoutTemplate size={15} className="mt-0.5 shrink-0 text-accent-2" />
                  <span>
                    <span className="block font-medium">{lang === 'vi' ? tp.nameVi : tp.name}</span>
                    <span className="block text-[11px] leading-snug text-muted">{lang === 'vi' ? tp.descVi : tp.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {pop === 'assets' && (
            <div className="float flex max-h-[60vh] w-[340px] flex-col p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">
                  {t('assets.title')} · {list.length}
                </span>
                <button className="chip" onClick={() => input.current?.click()}>
                  <Upload size={11} /> {t('assets.upload')}
                </button>
                <input
                  ref={input}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  hidden
                  onChange={async (e) => {
                    if (project && e.target.files?.length) addAssets(await api.upload(project.id, Array.from(e.target.files)));
                    e.target.value = '';
                  }}
                />
              </div>
              <p className="mb-2 text-[11px] leading-relaxed text-muted">{list.length ? t('assets.drag') : t('assets.empty')}</p>
              <div className="grid grid-cols-4 gap-1.5 overflow-auto">
                {list.map((a) => (
                  <button
                    key={a.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData(DND_ASSET, a.id)}
                    onClick={() => setPreview(a)}
                    className="relative aspect-square overflow-hidden rounded-lg border border-line bg-black hover:border-accent"
                    title={a.filename}
                  >
                    {a.type === 'video' ? (
                      <>
                        <video src={a.url} className="h-full w-full object-cover" muted preload="metadata" />
                        <Video size={12} className="absolute right-1 top-1 text-white drop-shadow" />
                      </>
                    ) : (
                      <img src={a.url} className="h-full w-full object-cover" draggable={false} loading="lazy" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="float flex items-center gap-0.5 p-1.5">
        <button className={`icon-btn h-10 w-10 ${tool === 'select' ? 'on' : ''}`} title={t('tool.select')} onClick={() => setTool('select')}>
          <MousePointer2 size={17} />
        </button>
        <button className={`icon-btn h-10 w-10 ${tool === 'hand' ? 'on' : ''}`} title={t('tool.hand')} onClick={() => setTool('hand')}>
          <Hand size={17} />
        </button>
        <span className="mx-1.5 h-7 w-px bg-line" />
        {NODE_ORDER.map((k) => (
          <button key={k} className={dock} title={t('tool.add')} draggable onDragStart={(e) => e.dataTransfer.setData(DND_NODE, k)} onClick={() => onAdd(k)} data-node-kind={k}>
            <span style={{ color: NODE_META[k].color }}>{NODE_META[k].icon(17)}</span>
            <span className="max-w-16 truncate">{t(`node.${k}`)}</span>
          </button>
        ))}
        <span className="mx-1.5 h-7 w-px bg-line" />
        <button className={`${dock} ${pop === 'templates' ? 'bg-line text-white' : ''}`} onClick={() => toggle('templates')} data-testid="dock-templates">
          <LayoutTemplate size={17} className="text-accent-2" />
          {t('tool.templates')}
        </button>
        <button className={`${dock} ${pop === 'assets' ? 'bg-line text-white' : ''}`} onClick={() => toggle('assets')}>
          <FolderOpen size={17} />
          {t('tool.assets')}
        </button>
        <span className="mx-1.5 h-7 w-px bg-line" />
        <button className="btn btn-primary h-10 rounded-xl px-4" onClick={() => confirmAndRun(t)} data-testid="run-all">
          <Play size={14} /> {t('tool.runAll')}
        </button>
      </div>
    </div>
  );
}

/** Bottom-left: zoom out / level / zoom in, fit, mini map. */
export function ZoomControls() {
  const t = useT();
  const rf = useReactFlow();
  const { zoom } = useViewport();
  const { minimap, setMinimap } = useStore();
  return (
    <div className="float absolute bottom-3 left-3 z-20 flex items-center gap-0.5 p-1">
      <button className="icon-btn" title={t('tool.zoomOut')} onClick={() => rf.zoomOut({ duration: 150 })}>
        <Minus size={14} />
      </button>
      <span className="w-10 text-center text-[11px] text-muted">{Math.round(zoom * 100)}%</span>
      <button className="icon-btn" title={t('tool.zoomIn')} onClick={() => rf.zoomIn({ duration: 150 })}>
        <Plus size={14} />
      </button>
      <span className="mx-1 h-5 w-px bg-line" />
      <button className="icon-btn" title={t('tool.fit')} onClick={() => rf.fitView({ maxZoom: 1, padding: fitPadding(), duration: 300 })}>
        <Maximize size={14} />
      </button>
      <button className={`icon-btn ${minimap ? 'on' : ''}`} title={t('tool.minimap')} onClick={() => setMinimap(!minimap)}>
        <MapIcon size={14} />
      </button>
    </div>
  );
}

/** Bottom-right: reopen the Director when its panel is closed. */
export function AskDirector() {
  const t = useT();
  const { directorOpen, setDirectorOpen } = useStore();
  if (directorOpen) return null;
  return (
    <button className="float absolute bottom-3 right-3 z-20 flex h-11 items-center gap-2 px-4 font-medium hover:border-accent" onClick={() => setDirectorOpen(true)}>
      <Clapperboard size={15} className="text-accent-2" /> {t('tool.ask')}
    </button>
  );
}
