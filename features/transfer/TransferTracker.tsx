import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
import './transferTracker.css';

interface TransferTrackerProps {
  inviteToken: string;
}

type Filter = 'all' | 'kick' | 'backup' | 'pending' | 'done' | 'noted';
type Theme = 'light' | 'dark';

const ROLE_LABELS: Record<TransferRole, string> = { r5: 'R5', r4: 'R4', adm: 'Adm' };
const PREVIEW_TOKEN = /^preview-(r5|r4|adm)-local-only-2609$/;
const THEME_KEY = 'lftime-transfer-theme';
const POWER_FORMAT = new Intl.NumberFormat('en-US');
const TIME_FORMAT = new Intl.DateTimeFormat('zh-TW', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

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

const stampOf = (member: TransferMember) =>
  member.updatedAt && member.updatedBy
    ? `${ROLE_LABELS[member.updatedBy]} · ${TIME_FORMAT.format(member.updatedAt)}`
    : '';

const NoteEditor: React.FC<{
  member: TransferMember;
  disabled: boolean;
  onSave: (note: string) => Promise<boolean>;
  onClose: () => void;
}> = ({ member, disabled, onSave, onClose }) => {
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
      placeholder="輸入備註，點其他地方即儲存"
      aria-label={`${member.name} 的備註`}
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
      <p className="note-error" role="alert">沒有存起來，你打的字還在。點一下外面可以再試一次。</p>
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
}> = ({ checked, disabled, label, tone, name, onChange }) => (
  <label className={`transfer-toggle ${tone}${checked ? ' checked' : ''}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={`${name}：${label}`}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span>{label}</span>
  </label>
);

/** 執行結果：他真的走了／他真的進來了。核取方塊造型。 */
const DoneCheck: React.FC<{
  checked: boolean;
  disabled: boolean;
  label: string;
  name: string;
  onChange: (checked: boolean) => void;
}> = ({ checked, disabled, label, name, onChange }) => (
  <label className={`done-check${checked ? ' checked' : ''}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={`${name}：${label}`}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span className="check-box" aria-hidden="true">{checked ? '✓' : ''}</span>
    <span>{label}</span>
  </label>
);

const MemberRow: React.FC<{
  member: TransferMember;
  saving: boolean;
  onSave: (changes: TransferMemberChanges) => Promise<boolean>;
}> = ({ member, saving, onSave }) => {
  const [editing, setEditing] = useState(false);
  const hasNote = member.note.length > 0;
  const stamp = stampOf(member);
  const done = member.list === 'koi' ? member.removed : member.transferred;

  return (
    <article className={`transfer-row${done ? ' completed' : ''}`}>
      <div className="member-seq mono">{String(member.number).padStart(2, '0')}</div>

      <div className="member-head">
        <strong title={member.name}>{member.name}</strong>
        <span className="member-meta">
          {member.rank ? <span className="rank-pill">{member.rank}</span> : null}
          {member.power ? <span className="mono">{POWER_FORMAT.format(member.power)}</span> : null}
        </span>
      </div>

      {stamp && !hasNote ? <div className="member-stamp">更新：{stamp}</div> : null}

      <div className={`member-actions ${member.list}`}>
        {member.list === 'koi' ? (
          <>
            <div className="decision-group" role="group" aria-label={`${member.name} 的去留判斷`}>
              <DecisionToggle checked={member.kick} disabled={saving} label="踢除" tone="kick" name={member.name} onChange={(kick) => void onSave({ kick })} />
              <DecisionToggle checked={member.backup} disabled={saving} label="候補" tone="backup" name={member.name} onChange={(backup) => void onSave({ backup })} />
            </div>
            <DoneCheck checked={member.removed} disabled={saving} label="已離開" name={member.name} onChange={(removed) => void onSave({ removed })} />
          </>
        ) : (
          <DoneCheck checked={member.transferred} disabled={saving} label="已加入" name={member.name} onChange={(transferred) => void onSave({ transferred })} />
        )}
        <button
          type="button"
          className={`note-button${hasNote ? ' has-note' : ''}`}
          aria-label={hasNote ? `編輯 ${member.name} 的備註` : `新增 ${member.name} 的備註`}
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
          {stamp ? <span className="note-stamp">更新：{stamp}</span> : null}
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
  const [copied, setCopied] = useState<TransferRole | null>(null);

  const copy = async (role: TransferRole) => {
    await navigator.clipboard.writeText(getInviteUrl(invites[role]));
    setCopied(role);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <details className="invite-panel">
      <summary>管理邀請連結</summary>
      <p>每種身分共用一條連結。連結本身就是存取權限，請只傳給對應幹部。</p>
      <div className="invite-links">
        {(['r5', 'r4', 'adm'] as TransferRole[]).map((role) => (
          <div className="invite-link" key={role}>
            <span className="role-badge">{ROLE_LABELS[role]}</span>
            <code>{getInviteUrl(invites[role])}</code>
            <button type="button" className="ghost-button" onClick={() => void copy(role)}>
              <CopyIcon /> {copied === role ? '已複製' : '複製'}
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
  const [error, setError] = useState('');
  const [pinnedTheme, setPinnedTheme] = useState<Theme | null>(storedTheme);
  const [followTheme, setFollowTheme] = useState<Theme>(systemTheme);
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());
  const previewRole = import.meta.env.DEV ? inviteToken.match(PREVIEW_TOKEN)?.[1] as TransferRole | undefined : undefined;
  const theme = pinnedTheme ?? followTheme;

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
          setError('這次轉移活動已關閉');
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
          (message) => {
            if (!disposed) {
              window.clearTimeout(watchdog);
              setError(message);
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
          setError(toTransferError(connectError));
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
    setError('');
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
    stage === 1 ? `還要再選 ${kickGap} 人請離開`
    : stage === 2 ? `名單已選滿，還有 ${pendingLeave} 人尚未離開`
    : stage === 3 ? `空出 ${freeSlots} 個位子，BDK 還有 ${pendingJoin} 人沒進來`
    : '轉移完成，所有人都就定位了';
  const hint =
    stage === 1 ? `到 KOi 名單勾「踢除」，不確定的先放「候補」。目前候補 ${backupCount} 人。`
    : stage === 2 ? '請已勾踢除的人退盟，退掉後回來勾「已離開」。'
    : stage === 3 ? '通知 BDK 的人進來，進來後到 BDK 名單勾「已加入」。'
    : `KOi ${koiStaying} 人 + BDK ${transferredCount} 人，共 ${occupancy} / ${capacity}。`;

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
    setError('');
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
      setError(toTransferError(saveError));
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
      <main className="transfer-root transfer-state" data-theme={theme}>
        <div className="transfer-spinner" />
        <strong>正在驗證邀請連結</strong>
        <span>連線至轉移名單…</span>
      </main>
    );
  }

  if (!session || (error && members.length === 0)) {
    return (
      <main className="transfer-root transfer-state error-state" data-theme={theme}>
        <span className="state-mark">!</span>
        <strong>無法開啟轉移名單</strong>
        <span>{error || '邀請連結無效'}</span>
        <a href="#">返回七號小幫手</a>
      </main>
    );
  }

  return (
    <main className="transfer-root" data-theme={theme}>
      <header className="transfer-header">
        <div className="header-top">
          <a className="transfer-back" href="#"><BackIcon /> 七號小幫手</a>
          <div className="session-meta">
            <button
              type="button"
              className="icon-button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? '切換成淺色主題' : '切換成深色主題'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <span className="role-badge" title="你的身分">{ROLE_LABELS[session.role]}</span>
            <span className={`sync-badge${savingIds.size > 0 ? ' saving' : ''}`}>
              <CloudIcon /> {savingIds.size > 0 ? `儲存中 ${savingIds.size}` : '已同步'}
            </span>
          </div>
        </div>
        <h1>{session.event.title}</h1>
        <p className="transfer-premise">
          <span><b className="premise-koi">KOi</b> 是我們，共 <b>{capacity}</b> 個位子、現有 <b>{koiMembers.length}</b> 人</span>
          <span><b className="premise-bdk">BDK</b> 有 <b>{bdkMembers.length}</b> 人要搬進來</span>
        </p>
      </header>

      {error ? <div className="transfer-alert" role="alert">{error}</div> : null}

      <section className="transfer-status" aria-label="轉移進度">
        <span className="status-now">現在要做的事</span>
        <strong className="status-headline">{headline}</strong>
        <span className="status-hint">{hint}</span>

        <div className="stage-track">
          <Stage tone="kick" step={1} name="選人" value={kickCount} total={requiredKicks} current={stage === 1} />
          <Stage tone="remove" step={2} name="KOi 離開" value={removedCount} total={kickCount} current={stage === 2} />
          <Stage tone="join" step={3} name="BDK 加入" value={transferredCount} total={bdkMembers.length} current={stage === 3} />
        </div>

        <p className="seat-line">
          <span>KOi 留下 <b>{koiStaying}</b></span>
          <span>＋ BDK 已進 <b>{transferredCount}</b></span>
          <span className={`seat-total${freeSlots < 0 ? ' negative' : ''}`}>
            目前 <b>{occupancy} / {capacity}</b>　{freeSlots >= 0 ? `空 ${freeSlots} 位` : `超出 ${-freeSlots} 位`}
          </span>
        </p>
      </section>

      {session.role === 'adm' && invites ? <InvitePanel invites={invites} /> : null}

      <section className="transfer-workspace">
        <div className="transfer-sticky">
          <div className="transfer-tabs" role="tablist" aria-label="名單切換">
            <button
              className={`tab-koi${list === 'koi' ? ' active' : ''}`}
              role="tab"
              aria-selected={list === 'koi'}
              onClick={() => { setList('koi'); setFilter('all'); }}
            >
              <span className="tab-tag">KOi</span>
              <span className="tab-role">我方 · 誰要走</span>
              <em>{koiMembers.length}</em>
            </button>
            <button
              className={`tab-bdk${list === 'bdk' ? ' active' : ''}`}
              role="tab"
              aria-selected={list === 'bdk'}
              onClick={() => { setList('bdk'); setFilter('all'); }}
            >
              <span className="tab-tag">BDK</span>
              <span className="tab-role">對方 · 誰要來</span>
              <em>{bdkMembers.length}</em>
            </button>
          </div>

          <p className="list-brief">
            {list === 'koi'
              ? <>這是 <b>我們自己的 {koiMembers.length} 人</b>。勾「踢除」決定誰離開，不確定的放「候補」；對方退盟後再勾「已離開」。</>
              : <>這是 <b>BDK 要搬進來的 {bdkMembers.length} 人</b>。他們進盟後勾「已加入」，這裡不做踢除判斷。</>}
          </p>

          <div className="transfer-toolbar">
            <label className="search-field">
              <SearchIcon />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋玩家名稱" aria-label="搜尋玩家名稱" />
            </label>
            <label className="filter-field">
              <span>顯示</span>
              <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} aria-label="篩選名單">
                <option value="all">全部</option>
                {list === 'koi' ? <option value="kick">已勾踢除</option> : null}
                {list === 'koi' ? <option value="backup">候補</option> : null}
                <option value="pending">{list === 'koi' ? '還沒離開' : '還沒加入'}</option>
                <option value="done">{list === 'koi' ? '已離開' : '已加入'}</option>
                <option value="noted">有備註</option>
              </select>
            </label>
          </div>
        </div>

        <div className="transfer-list">
          {listLoading ? (
            <div className="list-status">
              {listStuck ? (
                <>
                  <strong>名單一直沒有回應</strong>
                  <span>邀請連結是有效的，但名單資料沒有傳回來。可能是網路不穩，或雲端權限設定有異動。</span>
                  <button type="button" className="ghost-button" onClick={retry}>重新連線</button>
                </>
              ) : (
                <>
                  <div className="transfer-spinner" />
                  <span>載入名單中…</span>
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
              {visibleMembers.length === 0 ? <div className="empty-list">沒有符合條件的玩家</div> : null}
            </>
          )}
        </div>
      </section>

      <footer className="transfer-footer">
        <span><b>踢除</b>：確定請他離開</span>
        <span><b>候補</b>：不夠再踢他</span>
        <span>勾選與備註會自動同步給其他幹部</span>
      </footer>
    </main>
  );
};

export default TransferTracker;
