import React, { useEffect, useState } from 'react';
import { listSeasons, toTransferError } from '../../services/transferFirebase';
import { HTML_LANG, STRINGS, TransferErrorCode } from './i18n';
import { roleLabel, SeasonSummary } from './types';
import { MoonIcon, PageTabs, SunIcon, useEditor, usePreferences } from './ui';
import './transferTracker.css';

/** 目前只有一個聯盟；邀請碼綁聯盟，編輯者以自己的聯盟為準 */
const DEFAULT_ALLIANCE = 'koi';

/** 賽季轉移入口：公開列出所有賽季，點入查看；持編輯邀請者點入即可編輯 */
const SeasonsPage: React.FC = () => {
  const { theme, toggleTheme, lang, toggleLang } = usePreferences();
  const t = STRINGS[lang];
  const { editor, state } = useEditor();
  const [seasons, setSeasons] = useState<SeasonSummary[] | null>(null);
  const [failure, setFailure] = useState<{ code: TransferErrorCode; detail?: string } | null>(null);
  const allianceId = editor?.allianceId ?? DEFAULT_ALLIANCE;

  useEffect(() => {
    let disposed = false;
    listSeasons(allianceId)
      .then((items) => { if (!disposed) setSeasons(items); })
      .catch((error) => { if (!disposed) { setSeasons([]); setFailure(toTransferError(error)); } });
    return () => { disposed = true; };
  }, [allianceId]);

  const status = (season: SeasonSummary) => {
    if (!season.active) return t.historyClosed;
    if (season.closesAt == null) return t.seasonOngoing;
    return season.closesAt > Date.now() ? t.historyEnds(new Date(season.closesAt)) : t.historyEnded(new Date(season.closesAt));
  };

  return (
    <main className="transfer-root" data-theme={theme} lang={HTML_LANG[lang]}>
      <header className="transfer-header">
        <div className="header-top">
          <PageTabs current="season" lang={lang} />
          <div className="session-meta">
            <button type="button" className="icon-button lang-button" onClick={toggleLang} aria-label={t.langSwitch}>
              {lang === 'zh' ? 'EN' : '中'}
            </button>
            <button type="button" className="icon-button" onClick={toggleTheme} aria-label={theme === 'dark' ? t.themeToLight : t.themeToDark}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <a className="ghost-button admin-link" href="#/transfer/admin">{t.adminOpen}</a>
            {editor ? <span className="role-badge" title={t.yourRole}>{roleLabel(editor.role)}</span> : null}
          </div>
        </div>
        <h1>{t.seasonsTitle}</h1>
        <p className="admin-intro">{editor ? t.seasonsIntroEditor : t.seasonsIntro}</p>
      </header>

      {state.status === 'none' && state.failure ? (
        <div className="transfer-alert" role="alert">{t.inviteFailed(t.error(state.failure.code, state.failure.detail))}</div>
      ) : null}
      {failure ? <div className="transfer-alert" role="alert">{t.error(failure.code, failure.detail)}</div> : null}

      <section className="admin-card">
        {seasons === null ? (
          <p className="admin-muted">{t.seasonsLoading}</p>
        ) : seasons.length === 0 ? (
          <p className="admin-muted">{t.seasonsEmpty}</p>
        ) : (
          <div className="season-list">
            {seasons.map((season) => (
              <a className="season-row season-link" key={season.id} href={`#/transfer/season/${season.id}`}>
                <span className="season-main">
                  <strong>{lang === 'en' && season.titleEn ? season.titleEn : season.title}</strong>
                  <span className="season-meta">
                    <span>{season.externalName}</span>
                    <span>{status(season)}</span>
                  </span>
                </span>
                <span className="season-go" aria-hidden="true">›</span>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
};

export default SeasonsPage;
