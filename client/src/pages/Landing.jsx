import { Link, useNavigate } from 'react-router';
import { errorMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import Brand from '../components/Brand.jsx';
import Icon from '../components/Icon.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';
import { Collage } from '../components/Memories.jsx';
import { Avatar } from '../components/People.jsx';
import ThemeSwitch from '../components/ThemeSwitch.jsx';
import { useToast } from '../components/Toast.jsx';
import { useI18n } from '../i18n/index.jsx';
import { usePageTitle } from '../state.jsx';

/** A print for the illustrations below (same markup as real album prints, not clickable). */
function SamplePrint({ src, title, date, index }) {
  return (
    <div className="print">
      <div className="print-film">
        <span className="tape" aria-hidden="true" />
        <span className="edge edge-top" aria-hidden="true">
          MEMORY LANE 400
        </span>
        <div className="print-photo">
          <img src={src} alt="" loading="lazy" decoding="async" />
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

/** Public home page: what the app is for, how sharing works, and its privacy promises. */
export default function Landing() {
  const { t } = useI18n();
  const { demo, demoEnabled } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  usePageTitle(null);

  async function tryDemo(who) {
    try {
      await demo(who);
      navigate('/today');
    } catch (err) {
      toast(errorMessage(t, err), 'error');
    }
  }

  const ctas = (
    <div className="cta-row">
      <Link to="/register" className="btn btn-primary">
        {t('landing.start')}
        <Icon name="arrowRight" size={16} />
      </Link>
      {demoEnabled && (
        <button type="button" className="btn btn-secondary" onClick={() => tryDemo()}>
          {t('landing.demo')}
        </button>
      )}
    </div>
  );

  return (
    <div className="landing">
      <header className="landing-top">
        <Brand />
        <nav className="landing-nav" aria-label="Memory Lane">
          <a href="#features">{t('landing.navFeatures')}</a>
          <a href="#sharing">{t('landing.navSharing')}</a>
          <a href="#privacy">{t('landing.navPrivacy')}</a>
        </nav>
        <div className="landing-tools">
          <ThemeSwitch />
          <LanguageToggle />
          <Link to="/login" className="btn btn-quiet">
            {t('landing.login')}
          </Link>
          <Link to="/register" className="btn btn-primary">
            {t('landing.start')}
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <span className="kicker">{t('landing.eyebrow')}</span>
          <h1 className="landing-title">
            {t('landing.titleA')} <span className="mark">{t('landing.titleB')}</span>
          </h1>
          <p className="landing-sub">{t('landing.sub')}</p>
          {ctas}
          {demoEnabled && (
            <button type="button" className="demo-friend" onClick={() => tryDemo('friend')}>
              {t('landing.demoFriend')}
            </button>
          )}
          <p className="promise">{t('landing.promise')}</p>
        </div>
        <Collage />
      </section>

      <section className="landing-section" id="features">
        <div className="landing-inner">
          <header className="landing-section-head">
            <span className="kicker">{t('landing.featuresEyebrow')}</span>
            <h2 className="section-title">{t('landing.featuresTitle')}</h2>
          </header>
          <div className="drawers">
            <article className="drawer">
              <div className="drawer-art" aria-hidden="true">
                <div className="mini-prints">
                  <SamplePrint src="/landing/dalat.jpg" title={t('landing.sample.frame1')} date="2019" index={1} />
                  <SamplePrint src="/landing/lop12.jpg" title={t('landing.sample.frame2')} date="2016" index={2} />
                  <SamplePrint src="/landing/vungtau.jpg" title={t('landing.sample.frame6')} date="2019" index={3} />
                </div>
              </div>
              <div>
                <span className="kicker">{t('landing.feature.albumEyebrow')}</span>
                <h3>{t('landing.feature.albumTitle')}</h3>
                <p>{t('landing.feature.albumBody')}</p>
              </div>
            </article>

            <article className="drawer">
              <div className="drawer-art" aria-hidden="true">
                <div className="mini-people">
                  <div className="person-row">
                    <Avatar name="Thu Hà" color="teal" />
                    <div style={{ display: 'grid', gap: 2 }}>
                      <span className="person-name">Thu Hà</span>
                      <span className="person-meta">{t('landing.sample.person1')}</span>
                    </div>
                    <span className="tag long">{t('landing.sample.tag1')}</span>
                  </div>
                  <div className="person-row">
                    <Avatar name="Minh Khoa" color="amber" />
                    <div style={{ display: 'grid', gap: 2 }}>
                      <span className="person-name">Minh Khoa</span>
                      <span className="person-meta">{t('landing.sample.person2')}</span>
                    </div>
                    <span className="tag soft">{t('landing.sample.tag2')}</span>
                  </div>
                </div>
              </div>
              <div>
                <span className="kicker">{t('landing.feature.peopleEyebrow')}</span>
                <h3>{t('landing.feature.peopleTitle')}</h3>
                <p>{t('landing.feature.peopleBody')}</p>
              </div>
            </article>

            <article className="drawer">
              <div className="drawer-art" aria-hidden="true">
                <div className="mini-reels">
                  <div className="reel">
                    <div className="disc d1" />
                    <div className="reel-body">
                      <span className="reel-title">Mắt biếc</span>
                      <span className="reel-meta">{t('landing.sample.reel1')}</span>
                    </div>
                  </div>
                  <div className="reel">
                    <div className="disc d2" />
                    <div className="reel-body">
                      <span className="reel-title">Diễm xưa</span>
                      <span className="reel-meta">{t('landing.sample.reel2')}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <span className="kicker">{t('landing.feature.archiveEyebrow')}</span>
                <h3>{t('landing.feature.archiveTitle')}</h3>
                <p>{t('landing.feature.archiveBody')}</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section" id="sharing">
        <div className="landing-inner share-band-inner">
          <div>
            <header className="landing-section-head" style={{ marginBottom: 0 }}>
              <span className="kicker">{t('landing.share.eyebrow')}</span>
              <h2 className="section-title">{t('landing.share.title')}</h2>
              <p className="lede">{t('landing.share.body')}</p>
            </header>
            <ol className="share-steps">
              <li>
                <div>
                  <b>{t('landing.share.step1Title')}</b>
                  <span>{t('landing.share.step1Body')}</span>
                </div>
              </li>
              <li>
                <div>
                  <b>{t('landing.share.step2Title')}</b>
                  <span>{t('landing.share.step2Body')}</span>
                </div>
              </li>
              <li>
                <div>
                  <b>{t('landing.share.step3Title')}</b>
                  <span>{t('landing.share.step3Body')}</span>
                </div>
              </li>
            </ol>
          </div>
          <div className="share-demo" aria-hidden="true">
            <div className="share-demo-head">
              <Avatar name="An" color="amber" />
              <p>{t('landing.share.demoLine')}</p>
            </div>
            <div className="share-demo-link">
              <Icon name="link" size={14} />
              {window.location.host}/join/7Qe…Xk2
            </div>
            <SamplePrint src="/landing/hoian.jpg" title={t('landing.sample.frame4')} date="2017" index={7} />
          </div>
        </div>
      </section>

      <section className="landing-section" id="privacy">
        <div className="landing-inner">
          <header className="landing-section-head">
            <span className="kicker">{t('landing.privacyEyebrow')}</span>
            <h2 className="section-title">{t('landing.principlesTitle')}</h2>
          </header>
          <div className="principles">
            {['one', 'two', 'three'].map((key, index) => (
              <article key={key} className="principle">
                <span className="principle-num">0{index + 1}</span>
                <h3>{t(`landing.principle.${key}Title`)}</h3>
                <p>{t(`landing.principle.${key}Body`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="closing">
        <h2>
          {t('landing.closingA')} <em>{t('landing.closingB')}</em>
        </h2>
        {ctas}
      </section>

      <footer className="landing-foot">
        <Brand />
        <span>{t('landing.footer')}</span>
        <nav aria-label={t('landing.footerNav')}>
          <a href="#privacy">{t('landing.navPrivacy')}</a>
          <span>{t('landing.photoCredit')}</span>
        </nav>
      </footer>
    </div>
  );
}
