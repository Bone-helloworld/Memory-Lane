import { useCallback, useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { useI18n } from '../i18n/index.jsx';
import { ComposerProvider, DataProvider, DiscreetModeEffect, useData } from '../state.jsx';
import MemoryForm from './forms/MemoryForm.jsx';
import InviteDialog from './InviteDialog.jsx';
import LiveUpdates from './LiveUpdates.jsx';
import Modal from './Modal.jsx';
import TopBar from './TopBar.jsx';
import { useToast } from './Toast.jsx';

/** The logged-in shell: top navigation, the current page, and the dialogs any page can open. */
export default function AppLayout() {
  const { t } = useI18n();
  const [composer, setComposer] = useState(null); // null = closed · { memory } (memory null → new)
  const [invite, setInvite] = useState(null); // null = closed · { memory?, person? }

  const composerApi = useMemo(
    () => ({
      openMemory: (memory = null) => setComposer({ memory }),
      openInvite: (context = {}) => setInvite(context),
    }),
    [],
  );

  return (
    <DataProvider>
      <ComposerProvider value={composerApi}>
        <DiscreetModeEffect />
        <LiveUpdates />
        <a className="skip-link" href="#main">
          {t('nav.skip')}
        </a>
        <div className="shell">
          <TopBar onNew={() => composerApi.openMemory()} />
          <main className="page" id="main" tabIndex={-1}>
            <Outlet />
          </main>
          <footer className="app-foot">
            <div className="app-foot-inner">
              <span>Memory Lane · {t('landing.promise')}</span>
              <span>{t('app.footerNote')}</span>
            </div>
          </footer>
        </div>
        <MemoryComposer state={composer} onClose={() => setComposer(null)} />
        <InviteDialog context={invite} onClose={() => setInvite(null)} />
      </ComposerProvider>
    </DataProvider>
  );
}

function MemoryComposer({ state, onClose }) {
  const { t } = useI18n();
  const { refresh } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const editing = Boolean(state?.memory);

  function onSaved(memory) {
    onClose();
    setBusy(false);
    toast(editing ? t('memory.updated') : t('memory.saved'));
    if (!editing) navigate(`/album/${memory.id}`);
    refresh();
  }

  // Closing after a partial save still shows what was saved.
  const close = useCallback(() => {
    onClose();
    refresh();
  }, [onClose, refresh]);

  return (
    <Modal
      open={Boolean(state)}
      onClose={close}
      locked={busy}
      wide
      title={editing ? t('memory.editTitle') : t('memory.newTitle')}
      kicker={editing ? t('memory.editEyebrow') : t('memory.newEyebrow')}
    >
      <MemoryForm memory={state?.memory} onSaved={onSaved} onCancel={close} onBusyChange={setBusy} />
    </Modal>
  );
}
