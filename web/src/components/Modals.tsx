import { X } from 'lucide-react';
import { useStore } from '../lib/store';
import { useT } from '../i18n';

export function PreviewModal() {
  const { preview, setPreview } = useStore();
  if (!preview) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8" onClick={() => setPreview(undefined)}>
      <button className="btn absolute right-4 top-4" onClick={() => setPreview(undefined)}>
        <X size={14} />
      </button>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-full max-w-full flex-col items-center gap-2">
        {preview.type === 'video' ? (
          <video src={preview.url} className="max-h-[85vh] max-w-full rounded-lg" controls autoPlay loop />
        ) : (
          <img src={preview.url} className="max-h-[85vh] max-w-full rounded-lg" />
        )}
        <a className="text-[12px] text-accent-2 hover:underline" href={preview.url} download={preview.filename}>
          {preview.filename}
        </a>
      </div>
    </div>
  );
}

export function ConfirmModal() {
  const t = useT();
  const { confirm, setConfirm } = useStore();
  if (!confirm) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setConfirm(undefined)}>
      <div className="float w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-base font-semibold">{confirm.title}</h3>
        <p className="mb-5 text-[13px] leading-relaxed text-muted">{confirm.body}</p>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={() => setConfirm(undefined)}>
            {t('cancel')}
          </button>
          <button
            className="btn btn-primary"
            data-testid="confirm-ok"
            onClick={() => {
              setConfirm(undefined);
              confirm.onOk();
            }}
          >
            {confirm.okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
