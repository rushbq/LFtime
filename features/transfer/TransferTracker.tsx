import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
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

const ROLE_LABELS: Record<TransferRole, string> = { r5: 'R5', r4: 'R4', adm: 'Adm' };
const PREVIEW_TOKEN = /^preview-(r5|r4|adm)-local-only-2609$/;
const POWER_FORMAT = new Intl.NumberFormat('en-US');
const TIME_FORMAT = new Intl.DateTimeFormat('zh-TW', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

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

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" />
  </svg>
);

const getInviteUrl = (token: string) =>
  `${window.location.origin}${window.location.pathname}#/transfer/${token}`;

const csvCell = (value: string | number | boolean | undefined) => {
  let text = value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

const exportMembers = (members: TransferMember[]) => {
  const header = ['名單', '序號', '名稱', '戰力', '階級', 'Kick', 'Backup', '已移出', '已轉入', '備註', '最後修改身分', '最後修改時間'];
  const rows = members.map((member) => [
    member.list.toUpperCase(),
    member.number,
    member.name,
    member.power,
    member.rank,
    member.kick,
    member.backup,
    member.removed,
    member.transferred,
    member.note,
    member.updatedBy ? ROLE_LABELS[member.updatedBy] : '',
    member.updatedAt ? TIME_FORMAT.format(member.updatedAt) : '',
  ]);
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `transfer-status-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const MemberNote: React.FC<{
  member: TransferMember;
  disabled: boolean;
  onSave: (note: string) => Promise<void>;
}> = ({ member, disabled, onSave }) => {
  const [draft, setDraft] = useState(member.note);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(member.note);
  }, [focused, member.note]);

  return (
    <textarea
      className="transfer-note"
      value={draft}
      disabled={disabled}
      maxLength={500}
      rows={1}
      placeholder="新增備註…"
      aria-label={`${member.name} 的備註`}
      onFocus={() => setFocused(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setFocused(false);
        if (draft !== member.note) void onSave(draft.trim());
      }}
    />
  );
};

const StatusToggle: React.FC<{
  checked: boolean;
  disabled: boolean;
  label: string;
  tone: 'kick' | 'backup' | 'done';
  onChange: (checked: boolean) => void;
}> = ({ checked, disabled, label, tone, onChange }) => (
  <label className={`transfer-toggle ${tone}${checked ? ' checked' : ''}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span className="toggle-box" aria-hidden="true">{checked ? '✓' : ''}</span>
    <span>{label}</span>
  </label>
);

const MemberRow: React.FC<{
  member: TransferMember;
  saving: boolean;
  onSave: (changes: TransferMemberChanges) => Promise<void>;
}> = ({ member, saving, onSave }) => (
  <article className={`transfer-row${member.removed || member.transferred ? ' completed' : ''}`}>
    <div className="member-seq mono">{String(member.number).padStart(2, '0')}</div>
    <div className="member-main">
      <strong>{member.name}</strong>
      <div className="member-meta">
        {member.rank ? <span className="rank-pill">{member.rank}</span> : null}
        {member.power ? <span className="mono">{POWER_FORMAT.format(member.power)}</span> : null}
        {member.updatedAt && member.updatedBy ? (
          <span>更新：{ROLE_LABELS[member.updatedBy]} · {TIME_FORMAT.format(member.updatedAt)}</span>
        ) : null}
      </div>
    </div>
    <div className="member-actions">
      {member.list === 'koi' ? (
        <>
          <StatusToggle checked={member.kick} disabled={saving} label="Kick" tone="kick" onChange={(kick) => void onSave({ kick })} />
          <StatusToggle checked={member.backup} disabled={saving} label="Backup" tone="backup" onChange={(backup) => void onSave({ backup })} />
          <StatusToggle checked={member.removed} disabled={saving} label="已移出" tone="done" onChange={(removed) => void onSave({ removed })} />
        </>
      ) : (
        <StatusToggle checked={member.transferred} disabled={saving} label="已轉入" tone="done" onChange={(transferred) => void onSave({ transferred })} />
      )}
    </div>
    <MemberNote member={member} disabled={saving} onSave={(note) => onSave({ note })} />
  </article>
);

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
            <span className={`role-badge role-${role}`}>{ROLE_LABELS[role]}</span>
            <code>{getInviteUrl(invites[role])}</code>
            <button type="button" onClick={() => void copy(role)}>
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
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());
  const previewRole = import.meta.env.DEV ? inviteToken.match(PREVIEW_TOKEN)?.[1] as TransferRole | undefined : undefined;

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => undefined;

    const connect = async () => {
      try {
        if (previewRole) {
          const { getTransferPreview } = await import('./previewData');
          const preview = getTransferPreview(previewRole);
          if (!disposed) {
            setSession(preview.session);
            setMembers(preview.members);
            setInvites(preview.invites);
            setLoading(false);
          }
          return;
        }

        const nextSession = await joinTransferEvent(inviteToken);
        if (disposed) return;
        setSession(nextSession);
        if (!nextSession.event.active) {
          setError('這次轉移活動已關閉');
          setLoading(false);
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
            setMembers(nextMembers);
            setLoading(false);
          },
          (message) => {
            if (!disposed) {
              setError(message);
              setLoading(false);
            }
          },
        );
      } catch (connectError) {
        if (!disposed) {
          setError(toTransferError(connectError));
          setLoading(false);
        }
      }
    };

    void connect();
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [inviteToken, previewRole]);

  const koiMembers = useMemo(() => members.filter((member) => member.list === 'koi'), [members]);
  const bdkMembers = useMemo(() => members.filter((member) => member.list === 'bdk'), [members]);
  const kickCount = koiMembers.reduce((count, member) => count + Number(member.kick), 0);
  const backupCount = koiMembers.reduce((count, member) => count + Number(member.backup), 0);
  const removedCount = koiMembers.reduce((count, member) => count + Number(member.removed), 0);
  const transferredCount = bdkMembers.reduce((count, member) => count + Number(member.transferred), 0);
  const requiredKicks = Math.max(0, koiMembers.length + bdkMembers.length - (session?.event.capacity ?? 90));
  const plannedGap = Math.max(0, requiredKicks - kickCount);
  const currentOccupancy = koiMembers.length - removedCount + transferredCount;
  const freeSlots = (session?.event.capacity ?? 90) - currentOccupancy;

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
  }, [backupCount, bdkMembers, deferredSearch, filter, koiMembers, list]);

  const saveMember = async (member: TransferMember, changes: TransferMemberChanges) => {
    if (!session) return;
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
        return;
      }
      await updateTransferMember(session.eventId, member.id, session.role, changes, member.updatedAt);
    } catch (saveError) {
      setMembers((current) => current.map((item) => item.id === member.id ? previous : item));
      setError(toTransferError(saveError));
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(member.id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <main className="transfer-root transfer-state">
        <div className="transfer-spinner" />
        <strong>正在驗證邀請連結</strong>
        <span>連線至轉移名單…</span>
      </main>
    );
  }

  if (!session || (error && members.length === 0)) {
    return (
      <main className="transfer-root transfer-state error-state">
        <span className="state-mark">!</span>
        <strong>無法開啟轉移名單</strong>
        <span>{error || '邀請連結無效'}</span>
        <a href="#">返回七號小幫手</a>
      </main>
    );
  }

  return (
    <main className="transfer-root">
      <header className="transfer-header">
        <div>
          <a className="transfer-brand" href="#">LF / 07</a>
          <span className="transfer-kicker">SEASON TRANSFER · 2609</span>
          <h1>{session.event.title}</h1>
          <p>KOi 移出討論與 BDK 轉入確認</p>
        </div>
        <div className="session-meta">
          <span className={`role-badge role-${session.role}`}>{ROLE_LABELS[session.role]}</span>
          <span className={`sync-badge${savingIds.size > 0 ? ' saving' : ''}`}>
            <CloudIcon /> {savingIds.size > 0 ? `儲存中 ${savingIds.size}` : '雲端已同步'}
          </span>
        </div>
      </header>

      {error ? <div className="transfer-alert" role="alert">{error}</div> : null}

      <section className="transfer-summary" aria-label="轉移進度總覽">
        <div className={`summary-card primary${plannedGap > 0 ? ' warning' : ''}`}>
          <span>尚需確認踢除</span>
          <strong className="mono">{plannedGap}</strong>
          <small>預計需踢 {requiredKicks} 人，Kick 已選 {kickCount} 人</small>
        </div>
        <div className="summary-card">
          <span>Kick / Backup</span>
          <strong className="mono">{kickCount}<i>/</i>{backupCount}</strong>
          <small>確定名單／候補名單</small>
        </div>
        <div className="summary-card">
          <span>實際移出 / 轉入</span>
          <strong className="mono">{removedCount}<i>/</i>{transferredCount}</strong>
          <small>目前聯盟 {currentOccupancy} / {session.event.capacity}</small>
        </div>
        <div className={`summary-card${freeSlots < 0 ? ' danger' : ''}`}>
          <span>目前可用名額</span>
          <strong className="mono">{freeSlots}</strong>
          <small>BDK 尚有 {bdkMembers.length - transferredCount} 人待轉入</small>
        </div>
      </section>

      {session.role === 'adm' && invites ? <InvitePanel invites={invites} /> : null}

      <section className="transfer-workspace">
        <div className="transfer-tabs" role="tablist" aria-label="名單切換">
          <button className={list === 'koi' ? 'active' : ''} role="tab" aria-selected={list === 'koi'} onClick={() => { setList('koi'); setFilter('all'); }}>
            <span>KOi</span> 移出名單 <em>{koiMembers.length}</em>
          </button>
          <button className={list === 'bdk' ? 'active' : ''} role="tab" aria-selected={list === 'bdk'} onClick={() => { setList('bdk'); setFilter('all'); }}>
            <span>BDK</span> 轉入名單 <em>{bdkMembers.length}</em>
          </button>
        </div>

        <div className="transfer-toolbar">
          <label className="search-field">
            <SearchIcon />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋玩家名稱" aria-label="搜尋玩家名稱" />
          </label>
          <label className="filter-field">
            <span>顯示</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
              <option value="all">全部</option>
              {list === 'koi' ? <option value="kick">Kick</option> : null}
              {list === 'koi' ? <option value="backup">Backup</option> : null}
              <option value="pending">待完成</option>
              <option value="done">已完成</option>
              <option value="noted">有備註</option>
            </select>
          </label>
          <button className="export-button" type="button" onClick={() => exportMembers(members)}>
            <DownloadIcon /> 匯出 CSV
          </button>
        </div>

        <div className="transfer-list-head">
          <span>#</span><span>玩家資料</span><span>狀態</span><span>備註</span>
        </div>
        <div className="transfer-list">
          {visibleMembers.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              saving={savingIds.has(member.id)}
              onSave={(changes) => saveMember(member, changes)}
            />
          ))}
          {visibleMembers.length === 0 ? <div className="empty-list">沒有符合條件的玩家</div> : null}
        </div>
      </section>

      <footer className="transfer-footer">
        <span>Kick：確定踢除</span>
        <span>Backup：備選踢除</span>
        <span>勾選與備註會自動同步</span>
      </footer>
    </main>
  );
};

export default TransferTracker;
