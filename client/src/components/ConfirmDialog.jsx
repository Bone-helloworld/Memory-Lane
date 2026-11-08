import { useState } from 'react';
import { errorMessage } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import Modal from './Modal.jsx';

/** "Are you sure?" dialog for destructive actions. onConfirm may be async. */
export default function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onClose }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={() => {
        if (!busy) {
          setError(null);
          onClose();
        }
      }}
    >
      <div className="form">
        <p className="confirm-text">{body}</p>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-danger" onClick={confirm} disabled={busy}>
            {busy && <span className="spinner" />}
            {busy ? t('common.deleting') : (confirmLabel ?? t('common.delete'))}
          </button>
        </div>
      </div>
    </Modal>
  );
}
