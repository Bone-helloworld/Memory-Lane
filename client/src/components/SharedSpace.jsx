import { Avatar } from './People.jsx';
import { useI18n } from '../i18n/index.jsx';

/** A print for the shared-space picture (same markup as a real album print, not clickable). */
function SamplePrint({ src, title, date, index }) {
  return (
    <div className="print">
      <div className="print-film">
        <span className="tape" aria-hidden="true" />
        <div className="print-photo">
          <img src={src} alt="" />
        </div>
        <span className="edge edge-bottom" aria-hidden="true">
          {String(index).padStart(2, '0')} ▸ {String(index).padStart(2, '0')}A
        </span>
      </div>
      <div className="print-cap">
        <span className="print-date">{date}</span>
        <span className="print-title">{title}</span>
      </div>
    </div>
  );
}

/**
 * One album, three people adding to it. Shown on the landing page and the login screen
 * so a first visit makes the shared space obvious.
 */
export default function SharedSpace() {
  const { t } = useI18n();
  return (
    <div className="space-stage">
      <div className="space-card">
        <div className="space-card-head">
          <span className="kicker">{t('landing.space.kicker')}</span>
          <strong>{t('landing.space.name')}</strong>
        </div>
        <div className="space-faces" aria-hidden="true">
          <Avatar name="An" color="amber" />
          <Avatar name="Thu Hà" color="teal" />
          <Avatar name="Minh Khoa" color="rose" />
          <span className="space-plus">+</span>
        </div>
        <div className="space-prints">
          <SamplePrint src="/landing/hoian.jpg" title={t('landing.sample.frame4')} date="2017" index={7} />
          <SamplePrint src="/landing/lop12.jpg" title={t('landing.sample.frame2')} date="2016" index={2} />
        </div>
        <ul className="space-feed">
          <li>
            <Avatar name="Thu Hà" color="teal" />
            <span>{t('landing.space.added1')}</span>
          </li>
          <li>
            <Avatar name="Minh Khoa" color="rose" />
            <span>{t('landing.space.added2')}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
