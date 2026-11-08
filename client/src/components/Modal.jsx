import { useEffect, useId, useRef } from 'react';
import { useI18n } from '../i18n/index.jsx';
import Icon from './Icon.jsx';

/**
 * Accessible dialog built on the native <dialog> element: it traps focus, closes
 * with Esc, and hides the rest of the page from screen readers while open.
 * Children are only rendered while open, so every form starts fresh.
 * `locked` keeps it open (e.g. while files are uploading).
 */
export default function Modal({ open, onClose, title, kicker, wide = false, locked = false, children }) {
  const ref = useRef(null);
  const titleId = useId();
  const { t } = useI18n();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Put the cursor in the first field marked data-autofocus (instead of the close button).
      dialog.querySelector('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const requestClose = () => {
    if (!locked) onClose();
  };

  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal--wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Only the dialog's own "cancel" (the Esc key) closes it. A file <input> inside the form
        // also fires a "cancel" event when its picker is dismissed, and that event bubbles up here:
        // without this check, closing the file picker would close the whole form.
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        requestClose();
      }}
      // A click on the backdrop lands on the <dialog> itself.
      onMouseDown={(event) => event.target === ref.current && requestClose()}
    >
      {open && (
        <div className="modal-card">
          <header className="modal-head">
            <div style={{ display: 'grid', gap: 6 }}>
              {kicker && <span className="kicker">{kicker}</span>}
              <h2 className="modal-title" id={titleId}>
                {title}
              </h2>
            </div>
            <button type="button" className="icon-btn" onClick={requestClose} aria-label={t('common.close')} disabled={locked}>
              <Icon name="close" size={18} />
            </button>
          </header>
          <div className="modal-body">{children}</div>
        </div>
      )}
    </dialog>
  );
}
