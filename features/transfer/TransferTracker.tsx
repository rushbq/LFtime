import React, { createContext, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  joinTransferEvent,
  loadTransferInvites,
  subscribeTransferMembers,
  toTransferError,
  updateTransferMember,
} from '../../services/transferFirebase';
import {
  TransferInviteSet,
  TransferList,
  TransferMember,
  TransferMemberChanges,
  TransferRole,
  TransferSession,
} from './types';
import {
  Dict,
  detectLang,
  HTML_LANG,
  Lang,
  LOCALE,
  STRINGS,
  TransferErrorCode,
} from './i18n';
import './transferTracker.css';

interface TransferTrackerProps {
  inviteToken: string;
}

type Filter = 'all' | 'kick' | 'backup' | 'pending' | 'done' | 'noted';
type Theme = 'light' | 'dark';

const ROLE_LABELS: Record<TransferRole, string> = { r5: 'R5', r4: 'R4', adm: 'Adm' };
const PREVIEW_TOKEN = /^preview-(r5|r4|adm)-local-only-2609$/;
const THEME_KEY = 'lftime-transfer-theme';
const LANG_KEY = 'lftime-transfer-lang';

interface L10n {
  lang: Lang;
  t: Dict;
  time: Intl.DateTimeFormat;
  power: Intl.NumberFormat;
}
const L10nContext = createContext<L10n | null>(null);
const useL10n = () => {
  const value = useContext(L10nContext);
  if (!value) throw new Error('L10nContext missing');
  return value;
};

const BackIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15 5.5 8.5 12l6.5 6.5" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.2 4.2" />
  </svg>
);

const CloudIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 18.5h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.2 9.2 4.7 4.7 0 0 0 7 18.5Z" />
    <path d="m9.2 13.3 2 2 3.9-4.1" />
  </svg>
);

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="8" y="8" width="11" height="11" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
);

const NoteIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 20.5v-3.2L15.6 5.7a1.8 1.8 0 0 1 2.6 0l1.1 1.1a1.8 1.8 0 0 1 0 2.6L7.7 20.5Z" />
  </svg>
);

const SunIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.6v2.1M12 19.3v2.1M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M2.6 12h2.1M19.3 12h2.1M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
  </svg>
);

const getInviteUrl = (token: string) =>
  `${window.location.origin}${window.location.pathname}#/transfer/${token}`;

const systemTheme = (): Theme =>
  window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

const storedTheme = (): Theme | null => {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
};

const storedLang = (): Lang | null => {
  try {
    const value = window.localStorage.getItem(LANG_KEY);
    return value === 'zh' || value === 'en' ? value : null;
  } catch {
    return null;
  }
};

const stampOf = (member: TransferMember, l10n: L10n) =>
  member.updatedAt && member.updatedBy
    ? l10n.t.updatedBy(ROLE_LABELS[member.updatedBy], l10n.time.format(member.updatedAt))
    : '';

const NoteEditor: React.FC<{
  member: TransferMember;
  disabled: boolean;
  onSave: (note: string) => Promise<boolean>;
  onClose: () => void;
}> = ({ member, disabled, onSave, onClose }) => {
  const { t } = useL10n();
  const [draft, setDraft] = useState(member.note);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div className="note-editor">
    <textarea
      ref={ref}
      className="transfer-note"
      value={draft}
      disabled={disabled}
      maxLength={500}
      placeholder={t.notePlaceholder}
      aria-label={t.noteFieldLabel(member.name)}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDraft(member.note);
          onClose();
        }
      }}
      onBlur={async () => {
        if (draft.trim() === member.note) { onClose(); return; }
        // 存失敗就把編輯框留著，不要把使用者剛打的字丟掉
        const saved = await onSave(draft.trim());
        setFailed(!saved);
        if (saved) onClose();
      }}
    />
    {failed ? (
      <p className="note-error" role="alert">{t.noteFailed}</p>
    ) : null}
    </div>
  );
};

/** 決策：要不要請他走。踢除／候補圈在同一個外框裡。 */
const DecisionToggle: React.FC<{
  checked: boolean;
  disabled: boolean;
  label: string;
  tone: 'kick' | 'backup';
  name: string;
  onChange: (checked: boolean) => void;
}> = ({ checked, disabled, label, tone, name, onChange }) => {
  const { t } = useL10n();
  return (
  <label className={`transfer-toggle ${tone}${checked ? ' checked' : ''}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={t.toggleLabel(name, label)}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span>{label}</span>
  </label>
  );
};

/** 執行結果：他真的走了／他真的進來了。核取方塊造型。 */
const DoneCheck: React.FC<{
  checked: boolean;
  disabled: boolean;
  label: string;
  name: string;
  onChange: (checked: boolean) => void;
}> = ({ checked, disabled, label, name, onChange }) => {
  const { t } = useL10n();
  return (
  <label className={`done-check${checked ? ' checked' : ''}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={t.toggleLabel(name, label)}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span className="check-box" aria-hidden="true">{checked ? '✓' : ''}</span>
    <span>{label}</span>
  </label>
  );
};

const MemberRow: React.FC<{
  member: TransferMember;
  saving: boolean;
  onSave: (changes: TransferMemberChanges) => Promise<boolean>;
}> = ({ member, saving, onSave }) => {
  const { t, power } = useL10n();
  const l10n = useL10n();
  const [editing, setEditing] = useState(false);
  const hasNote = member.note.length > 0;
  const stamp = stampOf(member, l10n);
  const done = member.list === 'koi' ? member.removed : member.transferred;

  return (
    <article className={`transfer-row${done ? ' completed' : ''}`}>
      <div className="member-seq mono">{String(member.number).padStart(2, '0')}</div>

      <div className="member-head">
        <strong title={member.name}>{member.name}</strong>
        <span className="member-meta">
          {member.rank ? <span className="rank-pill">{member.rank}</span> : null}
          {member.power ? <span className="mono">{power.format(member.power)}</span> : null}
        </span>
      </div>

      {stamp && !hasNote ? <div className="member-stamp">{stamp}</div> : null}

      <div className={`member-actions ${member.list}`}>
        {member.list === 'koi' ? (
          <>
            <div className="decision-group" role="group" aria-label={t.decisionGroup(member.name)}>
              <DecisionToggle checked={member.kick} disabled={saving} label={t.kick} tone="kick" name={member.name} onChange={(kick) => void onSave({ kick })} />
              <DecisionToggle checked={member.backup} disabled={saving} label={t.backup} tone="backup" name={member.name} onChange={(backup) => void onSave({ backup })} />
            </div>
            <DoneCheck checked={member.removed} disabled={saving} label={t.left} name={member.name} onChange={(removed) => void onSave({ removed })} />
          </>
        ) : (
          <DoneCheck checked={member.transferred} disabled={saving} label={t.joined} name={member.name} onChange={(transferred) => void onSave({ transferred })} />
        )}
        <button
          type="button"
          className={`note-button${hasNote ? ' has-note' : ''}`}
          aria-label={hasNote ? t.editNote(member.name) : t.addNote(member.name)}
          aria-expanded={editing}
          onClick={() => setEditing(true)}
        >
          <NoteIcon />
        </button>
      </div>

      {editing ? (
        <NoteEditor
          member={member}
          disabled={saving}
          onSave={(note) => onSave({ note })}
          onClose={() => setEditing(false)}
        />
      ) : hasNote ? (
        <button type="button" className="note-preview" onClick={() => setEditing(true)}>
          {member.note}
          {stamp ? <span className="note-stamp">{stamp}</span> : null}
        </button>
      ) : null}
    </article>
  );
};

const Stage: React.FC<{
  tone: 'kick' | 'remove' | 'join';
  step: number;
  name: string;
  value: number;
  total: number;
  current: boolean;
}> = ({ tone, step, name, value, total, current }) => {
  const complete = total > 0 && value >= total;
  return (
    <div className={`stage s-${tone}${current ? ' current' : ''}${complete ? ' done' : ''}`}>
      <span className="stage-name"><i>{complete ? '✓' : step}</i>{name}</span>
      <span className="stage-count mono">{value}<s> / {total}</s></span>
      <span className="stage-bar">
        <i style={{ transform: `scaleX(${total > 0 ? Math.min(1, value / total) : 1})` }} />
      </span>
    </div>
  );
};

const InvitePanel: React.FC<{ invites: TransferInviteSet }> = ({ invites }) => {
  const { t } = useL10n();
  const [copied, setCopied] = useState<TransferRole | null>(null);

  const copy = async (role: TransferRole) => {
    await navigator.clipboard.writeText(getInviteUrl(invites[role]));
    setCopied(role);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <details className="invite-panel">
      <summary>{t.inviteTitle}</summary>
      <p>{t.inviteNote}</p>
      <div className="invite-links">
        {(['r5', 'r4', 'adm'] as TransferRole[]).map((role) => (
          <div className="invite-link" key={role}>
            <span className="role-badge">{ROLE_LABELS[role]}</span>
            <code>{getInviteUrl(invites[role])}</code>
            <button type="button" className="ghost-button" onClick={() => void copy(role)}>
              <CopyIcon /> {copied === role ? t.copied : t.copy}
            </button>
          </div>
        ))}
      </div>
    </details>
  );
};

const TransferTracker: React.FC<TransferTrackerProps> = ({ inviteToken }) => {
  const [session, setSession] = useState<TransferSession | null>(null);
  const [members, setMembers] = useState<TransferMember[]>([]);
  const [invites, setInvites] = useState<TransferInviteSet | null>(null);
  const [list, setList] = useState<TransferList>('koi');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [connecting, setConnecting] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [listStuck, setListStuck] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [failure, setFailure] = useState<{ code: TransferErrorCode; detail?: string } | null>(null);
  const [pinnedTheme, setPinnedTheme] = useState<Theme | null>(storedTheme);
  const [followTheme, setFollowTheme] = useState<Theme>(systemTheme);
  const [lang, setLang] = useState<Lang>(() => storedLang() ?? detectLang());
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());
  const previewRole = import.meta.env.DEV ? inviteToken.match(PREVIEW_TOKEN)?.[1] as TransferRole | undefined : undefined;
  const theme = pinnedTheme ?? followTheme;

  const l10n = useMemo<L10n>(() => ({
    lang,
    t: STRINGS[lang],
    time: new Intl.DateTimeFormat(LOCALE[lang], {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }),
    power: new Intl.NumberFormat(LOCALE[lang]),
  }), [lang]);
  const t = l10n.t;

  const toggleLang = () => {
    const next: Lang = lang === 'zh' ? 'en' : 'zh';
    setLang(next);
    try { window.localStorage.setItem(LANG_KEY, next); } catch { /* 隱私模式下不記住就算了 */ }
  };

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => setFollowTheme(query.matches ? 'light' : 'dark');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setPinnedTheme(next);
    try { window.localStorage.setItem(THEME_KEY, next); } catch { /* 隱私模式下不記住就算了 */ }
  };

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => undefined;
    let watchdog = 0;

    const connect = async () => {
      try {
        if (previewRole) {
          const { getTransferPreview } = await import('./previewData');
          const preview = getTransferPreview(previewRole);
          if (!disposed) {
            setSession(preview.session);
            setMembers(preview.members);
            setInvites(preview.invites);
            setConnecting(false);
            setListLoading(false);
          }
          return;
        }

        const nextSession = await joinTransferEvent(inviteToken);
        if (disposed) return;
        // 邀請碼驗證完就放行到主畫面，名單自己在列表區載入，
        // 不要整頁卡在驗證畫面等第一個 snapshot。
        setSession(nextSession);
        setConnecting(false);
        if (!nextSession.event.active) {
          setFailure({ code: 'event-closed' });
          setListLoading(false);
          return;
        }

        if (nextSession.role === 'adm') {
          void loadTransferInvites(nextSession.eventId)
            .then((nextInvites) => { if (!disposed) setInvites(nextInvites); })
            .catch(() => undefined);
        }

        unsubscribe = subscribeTransferMembers(
          nextSession.eventId,
          (nextMembers) => {
            if (disposed) return;
            window.clearTimeout(watchdog);
            setMembers(nextMembers);
            setListLoading(false);
            setListStuck(false);
          },
          (nextFailure) => {
            if (!disposed) {
              window.clearTimeout(watchdog);
              setFailure(nextFailure);
              setListLoading(false);
            }
          },
        );

        // 監聽若一直沒有回應，給出可操作的出口，而不是無限轉圈
        watchdog = window.setTimeout(() => {
          if (!disposed) setListStuck(true);
        }, 8000);
      } catch (connectError) {
        if (!disposed) {
          setFailure(toTransferError(connectError));
          setConnecting(false);
          setListLoading(false);
        }
      }
    };

    void connect();
    return () => {
      disposed = true;
      window.clearTimeout(watchdog);
      unsubscribe();
    };
  }, [inviteToken, previewRole, reconnectKey]);

  const retry = () => {
    setFailure(null);
    setListStuck(false);
    setListLoading(true);
    setReconnectKey((key) => key + 1);
  };

  const koiMembers = useMemo(() => members.filter((member) => member.list === 'koi'), [members]);
  const bdkMembers = useMemo(() => members.filter((member) => member.list === 'bdk'), [members]);
  const kickCount = koiMembers.reduce((count, member) => count + Number(member.kick), 0);
  const backupCount = koiMembers.reduce((count, member) => count + Number(member.backup), 0);
  const removedCount = koiMembers.reduce((count, member) => count + Number(member.removed), 0);
  const transferredCount = bdkMembers.reduce((count, member) => count + Number(member.transferred), 0);

  const capacity = session?.event.capacity ?? 90;
  // KOi 是容器：現有人數 + 要進來的人 - 名額 = 必須請走的人數
  const requiredKicks = Math.max(0, koiMembers.length + bdkMembers.length - capacity);
  const kickGap = Math.max(0, requiredKicks - kickCount);
  const koiStaying = koiMembers.length - removedCount;
  const occupancy = koiStaying + transferredCount;
  const freeSlots = capacity - occupancy;
  const pendingLeave = Math.max(0, kickCount - removedCount);
  const pendingJoin = bdkMembers.length - transferredCount;

  // 三關：選人 → 請人離開 → 對方進駐。指出目前卡在哪一關。
  const stage = kickGap > 0 ? 1 : pendingLeave > 0 ? 2 : pendingJoin > 0 ? 3 : 4;
  const headline =
    stage === 1 ? t.headlinePick(kickGap)
    : stage === 2 ? t.headlineLeave(pendingLeave)
    : stage === 3 ? t.headlineJoin(freeSlots, pendingJoin)
    : t.headlineDone;
  const hint =
    stage === 1 ? t.hintPick(backupCount)
    : stage === 2 ? t.hintLeave
    : stage === 3 ? t.hintJoin
    : t.hintDone(koiStaying, transferredCount, occupancy, capacity);

  const visibleMembers = useMemo(() => {
    const source = list === 'koi' ? koiMembers : bdkMembers;
    return source.filter((member) => {
      if (deferredSearch && !member.name.toLocaleLowerCase().includes(deferredSearch)) return false;
      if (filter === 'kick' && !member.kick) return false;
      if (filter === 'backup' && !member.backup) return false;
      if (filter === 'pending' && (member.list === 'koi' ? member.removed : member.transferred)) return false;
      if (filter === 'done' && !(member.list === 'koi' ? member.removed : member.transferred)) return false;
      if (filter === 'noted' && !member.note) return false;
      return true;
    });
  }, [bdkMembers, deferredSearch, filter, koiMembers, list]);

  const saveMember = async (member: TransferMember, changes: TransferMemberChanges): Promise<boolean> => {
    if (!session) return false;
    const previous = member;
    setFailure(null);
    setMembers((current) => current.map((item) => item.id === member.id ? { ...item, ...changes } : item));
    setSavingIds((current) => new Set(current).add(member.id));

    try {
      if (previewRole) {
        await new Promise((resolve) => window.setTimeout(resolve, 180));
        setMembers((current) => current.map((item) => item.id === member.id ? {
          ...item,
          updatedAt: Date.now(),
          updatedBy: session.role,
        } : item));
        return true;
      }
      await updateTransferMember(session.eventId, member.id, session.role, changes, member.note);
      return true;
    } catch (saveError) {
      setMembers((current) => current.map((item) => item.id === member.id ? previous : item));
      setFailure(toTransferError(saveError));
      return false;
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(member.id);
        return next;
      });
    }
  };

  if (connecting) {
    return (
      <L10nContext.Provider value={l10n}>
        <main className="transfer-root transfer-state" data-theme={theme} lang={HTML_LANG[lang]}>
          <div className="transfer-spinner" />
          <strong>{t.checkingTitle}</strong>
          <span>{t.checkingBody}</span>
        </main>
      </L10nContext.Provider>
    );
  }

  if (!session || (failure && members.length === 0)) {
    return (
      <L10nContext.Provider value={l10n}>
        <main className="transfer-root transfer-state error-state" data-theme={theme} lang={HTML_LANG[lang]}>
          <span className="state-mark">!</span>
          <strong>{t.blockedTitle}</strong>
          <span>{failure ? t.error(failure.code, failure.detail) : t.error('invite-not-found')}</span>
          <a href="#">{t.backToApp}</a>
        </main>
      </L10nContext.Provider>
    );
  }

  return (
    <L10nContext.Provider value={l10n}>
    <main className="transfer-root" data-theme={theme} lang={HTML_LANG[lang]}>
      <header className="transfer-header">
        <div className="header-top">
          <a className="transfer-back" href="#"><BackIcon /> {t.back}</a>
          <div className="session-meta">
            <button type="button" className="icon-button lang-button" onClick={toggleLang} aria-label={t.langSwitch}>
              {lang === 'zh' ? 'EN' : '中'}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? t.themeToLight : t.themeToDark}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <span className="role-badge" title={t.yourRole}>{ROLE_LABELS[session.role]}</span>
            <span className={`sync-badge${savingIds.size > 0 ? ' saving' : ''}`}>
              <CloudIcon /> {savingIds.size > 0 ? t.saving(savingIds.size) : t.synced}
            </span>
          </div>
        </div>
        <h1>{lang === 'en' && session.event.titleEn ? session.event.titleEn : session.event.title}</h1>
        <p className="transfer-premise">
          <span><b className="premise-koi">KOi</b> {t.premiseUs(capacity, koiMembers.length)}</span>
          <span><b className="premise-bdk">BDK</b> {t.premiseThem(bdkMembers.length)}</span>
        </p>
      </header>

      {failure ? <div className="transfer-alert" role="alert">{t.error(failure.code, failure.detail)}</div> : null}

      <section className="transfer-status" aria-label={t.nextStep}>
        <span className="status-now">{t.nextStep}</span>
        <strong className="status-headline">{headline}</strong>
        <span className="status-hint">{hint}</span>

        <div className="stage-track">
          <Stage tone="kick" step={1} name={t.stagePick} value={kickCount} total={requiredKicks} current={stage === 1} />
          <Stage tone="remove" step={2} name={t.stageOut} value={removedCount} total={kickCount} current={stage === 2} />
          <Stage tone="join" step={3} name={t.stageIn} value={transferredCount} total={bdkMembers.length} current={stage === 3} />
        </div>

        <p className="seat-line">
          <span>{t.seatStay(koiStaying)}</span>
          <span>{t.seatJoined(transferredCount)}</span>
          <span className={`seat-total${freeSlots < 0 ? ' negative' : ''}`}>
            {t.seatNow} <b>{occupancy} / {capacity}</b>　{freeSlots >= 0 ? t.seatFree(freeSlots) : t.seatOver(-freeSlots)}
          </span>
        </p>
      </section>

      {session.role === 'adm' && invites ? <InvitePanel invites={invites} /> : null}

      <section className="transfer-workspace">
        <div className="transfer-sticky">
          <div className="transfer-tabs" role="tablist" aria-label={`${t.tabUs} / ${t.tabThem}`}>
            <button
              className={`tab-koi${list === 'koi' ? ' active' : ''}`}
              role="tab"
              aria-selected={list === 'koi'}
              onClick={() => { setList('koi'); setFilter('all'); }}
            >
              <span className="tab-tag">KOi</span>
              <span className="tab-role">{t.tabUs}</span>
              <em>{koiMembers.length}</em>
            </button>
            <button
              className={`tab-bdk${list === 'bdk' ? ' active' : ''}`}
              role="tab"
              aria-selected={list === 'bdk'}
              onClick={() => { setList('bdk'); setFilter('all'); }}
            >
              <span className="tab-tag">BDK</span>
              <span className="tab-role">{t.tabThem}</span>
              <em>{bdkMembers.length}</em>
            </button>
          </div>

          <p className="list-brief">
            {(() => {
              const brief = list === 'koi' ? t.briefKoi(koiMembers.length) : t.briefBdk(bdkMembers.length);
              return <>{brief.lead}<b>{brief.strong}</b>{brief.tail}</>;
            })()}
          </p>

          <div className="transfer-toolbar">
            <label className="search-field">
              <SearchIcon />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchLabel} />
            </label>
            <label className="filter-field">
              <span>{t.show}</span>
              <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} aria-label={t.filterLabel}>
                <option value="all">{t.filterAll}</option>
                {list === 'koi' ? <option value="kick">{t.filterKick}</option> : null}
                {list === 'koi' ? <option value="backup">{t.filterBackup}</option> : null}
                <option value="pending">{list === 'koi' ? t.filterPendingKoi : t.filterPendingBdk}</option>
                <option value="done">{list === 'koi' ? t.filterDoneKoi : t.filterDoneBdk}</option>
                <option value="noted">{t.filterNoted}</option>
              </select>
            </label>
          </div>
        </div>

        <div className="transfer-list">
          {listLoading ? (
            <div className="list-status">
              {listStuck ? (
                <>
                  <strong>{t.listStuckTitle}</strong>
                  <span>{t.listStuckBody}</span>
                  <button type="button" className="ghost-button" onClick={retry}>{t.reconnect}</button>
                </>
              ) : (
                <>
                  <div className="transfer-spinner" />
                  <span>{t.listLoading}</span>
                </>
              )}
            </div>
          ) : (
            <>
              {visibleMembers.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  saving={savingIds.has(member.id)}
                  onSave={(changes) => saveMember(member, changes)}
                />
              ))}
              {visibleMembers.length === 0 ? <div className="empty-list">{t.emptyList}</div> : null}
            </>
          )}
        </div>
      </section>

      <footer className="transfer-footer">
        <span><b>{t.legendKick}</b>{t.legendKickBody}</span>
        <span><b>{t.legendBackup}</b>{t.legendBackupBody}</span>
        <span>{t.legendSync}</span>
      </footer>
    </main>
    </L10nContext.Provider>
  );
};

export default TransferTracker;
