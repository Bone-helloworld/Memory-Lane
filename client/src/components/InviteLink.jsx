import { useId, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import Icon from './Icon.jsx';
import { useToast } from './Toast.jsx';

/**
 * Copies text to the clipboard → true when it worked.
 * navigator.clipboard only exists on secure pages (HTTPS, or localhost). A phone that opens the
 * dev server over Wi-Fi (http://192.168…) does not have it, so we fall back to selecting the
 * text field and the older execCommand('copy'), which iOS Safari and Android browsers still honour.
 */
export async function copyText(text, input) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!input) return false;
    input.focus();
    input.select();
    input.setSelectionRange(0, text.length); // iOS ignores select() without an explicit range
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

/**
 * A freshly created invite link: copy it, or — on phones — hand it to the share sheet,
 * which lists Zalo, Messenger, Messages… (the Web Share API; hidden where it does not exist).
 */
export default function InviteLink({ url }) {
  const { t } = useI18n();
  const toast = useToast();
  const id = useId();
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === 'function';

  async function copy() {
    if (await copyText(url, document.getElementById(id))) {
      setCopied(true);
      toast(t('invite.copied'));
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Memory Lane', text: t('invite.shareText'), url });
    } catch {
      // the user closed the share sheet
    }
  }

  return (
    <div className="link-field">
      <input
        id={id}
        className="input"
        value={url}
        readOnly
        aria-label={t('invite.linkLabel')}
        onFocus={(event) => event.target.select()}
      />
      <button type="button" className="btn btn-primary" onClick={copy}>
        <Icon name={copied ? 'check' : 'copy'} size={15} />
        {copied ? t('invite.copiedShort') : t('invite.copy')}
      </button>
      {canShare && (
        <button type="button" className="btn btn-secondary" onClick={share} aria-label={t('invite.shareVia')} title={t('invite.shareVia')}>
          <Icon name="share" size={15} />
        </button>
      )}
    </div>
  );
}
