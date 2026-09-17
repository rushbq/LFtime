import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  createAllianceMember,
  createAllianceMemberFromTransfer,
  deleteAllianceMember,
  joinTransferEvent,
  subscribeAlliance,
  subscribeTransferMembers,
  toTransferError,
  updateAllianceMember,
} from '../../services/transferFirebase';
import {
  hasDuplicateName,
  joinableTransfers,
  linkedMemberId,
  MemberInput,
  MemberInputError,
  normalizeMemberInput,
  sortAllianceMembers,
} from './allianceModel';
import { ALLIANCE_STRINGS, AllianceDict } from './allianceI18n';
import { HTML_LANG, LOCALE, STRINGS, TransferErrorCode } from './i18n';
import { Alliance, AllianceMember, AllianceRank, TransferMember, TransferRole, TransferSession } from './types';
import {
  CopyIcon,
  forgetInvite,
  hashUrl,
  INVALID_INVITE_CODES,
  lastInvite,
  rememberInvite,
  InfoIcon,
  MoonIcon,
  PageTabs,
  PREVIEW_TOKEN,
  SearchIcon,
  SunIcon,
  usePreferences,
  useEventWritable,
} from './ui';
import './transferTracker.css';
import './alliance.css';

type Failure = { code: TransferErrorCode; detail?: string };
type RankFilter = 'all' | AllianceRank;

const ROLE_LABELS: Record<TransferRole, string> = { r5: 'R5', r4: 'R4', adm: 'Adm' };
const RANKS: AllianceRank[] = ['r5', 'r4', 'member'];

const rankText = (rank: AllianceRank, a: AllianceDict) => rank === 'member' ? a.rankMember : rank.toUpperCase();

const MemberForm: React.FC<{
  original: AllianceMember | null;
  live: AllianceMember | undefined;
  members: AllianceMember[];
  joinable: TransferMember[];
  a: AllianceDict;
  errorText: (failure: Failure) => string;
  powerText: (power: number | null) => string;
  onSubmit: (input: MemberInput, version: number, sourceRecordId: string) => Promise<Failure | null>;
  onCancel: () => void;
}> = ({ original, live, members, joinable, a, errorText, powerText, onSubmit, onCancel }) => {
  const [name, setName] = useState(original?.name ?? '');
  const [power, setPower] = useState(original?.power === null || !original ? '' : String(original.power));
  const [rank, setRank] = useState<AllianceRank>(original?.rank ?? 'member');
  const [sourceId, setSourceId] = useState('');
  const [baseVersion, setBaseVersion] = useState(original?.version ?? 0);
  const [inputError, setInputError] = useState<MemberInputError | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const conflict = failure?.code === 'alliance-member-conflict';
  const deleted = Boolean(original && !live);
  const duplicate = name.trim() !== '' && hasDuplicateName(members, name, original?.id);

  useEffect(() => { nameRef.current?.focus(); }, []);

  // 版本衝突後，使用者看到的是雲端最新值；再按儲存就代表確認以這個版本為基準
  useEffect(() => {
    if (conflict && live) setBaseVersion(live.version);
  }, [conflict, live]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = normalizeMemberInput({ name, power, rank });
    if (!normalized.ok) { setInputError(normalized.error); return; }
    setInputError(null);
    setSaving(true);
    const result = await onSubmit(normalized.value, baseVersion, sourceId);
    setSaving(false);
    // 失敗時保留輸入，讓使用者決定下一步
    if (result) setFailure(result);
    else onCancel();
  };

  return (
    <form className="alliance-form" onSubmit={(event) => void submit(event)} noValidate>
      <strong className="alliance-form-title">{original ? a.editTitle(original.name) : a.addTitle}</strong>

      {!original && joinable.length > 0 ? (
        <label className="alliance-field wide">
          <span>{a.fromTransfer}</span>
          <select
            value={sourceId}
            onChange={(event) => {
              setSourceId(event.target.value);
              const record = joinable.find((item) => item.id === event.target.value);
              if (record && !name.trim()) setName(record.name);
            }}
          >
            <option value="">{a.fromTransferManual}</option>
            {joinable.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
          </select>
          {sourceId ? <small>{a.fromTransferHint}</small> : null}
        </label>
      ) : null}

      <label className="alliance-field wide">
        <span>{a.fieldName}</span>
        <input ref={nameRef} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="alliance-field">
        <span>{a.fieldPower}</span>
        <input value={power} inputMode="numeric" placeholder={a.powerPlaceholder} onChange={(event) => setPower(event.target.value)} />
      </label>
      <label className="alliance-field">
        <span>{a.fieldRank}</span>
        <select value={rank} onChange={(event) => setRank(event.target.value as AllianceRank)}>
          {RANKS.map((item) => <option key={item} value={item}>{rankText(item, a)}</option>)}
        </select>
      </label>

      {inputError ? <p className="form-message error" role="alert">{a.inputError(inputError)}</p> : null}
      {duplicate ? <p className="form-message warn">{a.duplicateName}</p> : null}
      {deleted ? (
        <p className="form-message error" role="alert">{a.deletedWhileEditing}</p>
      ) : failure ? (
        <p className="form-message error" role="alert">
          {errorText(failure)}
          {conflict && live ? <span>{a.latest(live.name, powerText(live.power), rankText(live.rank, a))}</span> : null}
        </p>
      ) : null}

      <div className="alliance-form-actions">
        <button type="button" className="ghost-button" onClick={onCancel}>{a.cancel}</button>
        <button type="submit" className="primary-button" disabled={saving || deleted}>
          {saving ? a.saving : a.save}
        </button>
      </div>
    </form>
  );
};

const AlliancePage: React.FC = () => {
  // 維護權限來自這台裝置記住的邀請碼，不放在網址裡
  const [inviteToken] = useState(() => lastInvite() ?? undefined);
  const { theme, toggleTheme, lang, toggleLang } = usePreferences();
  const t = STRINGS[lang];
  const a = ALLIANCE_STRINGS[lang];
  const powerFormat = useMemo(() => new Intl.NumberFormat(LOCALE[lang]), [lang]);
  const previewRole = import.meta.env.DEV && inviteToken
    ? inviteToken.match(PREVIEW_TOKEN)?.[1] as TransferRole | undefined
    : undefined;

  const [session, setSession] = useState<TransferSession | null>(null);
  const [connecting, setConnecting] = useState(Boolean(inviteToken));
  const [alliance, setAlliance] = useState<Alliance | null>(null);
  const [members, setMembers] = useState<AllianceMember[] | null>(null);
  const [records, setRecords] = useState<TransferMember[]>([]);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [search, setSearch] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [rankFilter, setRankFilter] = useState<RankFilter>('all');
  const [editing, setEditing] = useState<AllianceMember | 'new' | null>(null);
  const [confirming, setConfirming] = useState<AllianceMember | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());

  const allianceId = session?.event.allianceId ?? 'koi';
  const writable = useEventWritable(session?.event);
  const canManage = Boolean(
    session
    && (session.role === 'adm' || session.role === 'r5')
    && writable
    && alliance?.id === session.event.allianceId
    && alliance.maintainerEventId === session.eventId,
  );

  useEffect(() => {
    if (!inviteToken) return;
    let disposed = false;
    const connect = async () => {
      try {
        if (previewRole) {
          const { getTransferPreview } = await import('./previewData');
          const preview = getTransferPreview(previewRole);
          if (disposed) return;
          setSession(preview.session);
          setAlliance(preview.alliance);
          setMembers(preview.allianceMembers);
          setRecords(preview.records);
        } else {
          const nextSession = await joinTransferEvent(inviteToken);
          if (disposed) return;
          rememberInvite(inviteToken, nextSession.event);
          setSession(nextSession);
        }
      } catch (error) {
        // 邀請失效時仍可公開查看，只是沒有維護權限；失效的邀請碼清掉，下次不再嘗試
        if (!disposed) {
          const nextFailure = toTransferError(error);
          if (INVALID_INVITE_CODES.includes(nextFailure.code)) forgetInvite(inviteToken);
          setFailure(nextFailure);
        }
      } finally {
        if (!disposed) setConnecting(false);
      }
    };
    void connect();
    return () => { disposed = true; };
  }, [inviteToken, previewRole]);

  useEffect(() => {
    if (previewRole || connecting) return;
    return subscribeAlliance(
      allianceId,
      setAlliance,
      (next) => { setMembers(next); },
      setFailure,
    );
  }, [allianceId, connecting, previewRole]);

  useEffect(() => {
    if (previewRole || !canManage || !session) return;
    return subscribeTransferMembers(session.eventId, setRecords, setFailure);
  }, [canManage, previewRole, session]);

  const sorted = useMemo(() => sortAllianceMembers(members ?? []), [members]);
  const visible = useMemo(() => sorted
    .map((member, index) => ({ member, number: index + 1 }))
    .filter(({ member }) => rankFilter === 'all' || member.rank === rankFilter)
    .filter(({ member }) => !deferredSearch || member.name.toLocaleLowerCase().includes(deferredSearch)),
  [deferredSearch, rankFilter, sorted]);
  const joinable = useMemo(
    () => session ? joinableTransfers(sorted, records, session.eventId) : [],
    [records, session, sorted],
  );
  const r5Count = sorted.filter((member) => member.rank === 'r5').length;
  const r4Count = sorted.filter((member) => member.rank === 'r4').length;

  const errorText = (item: Failure) => t.error(item.code, item.detail);
  const powerText = (power: number | null) => power === null ? '—' : powerFormat.format(power);

  const saveMember = async (original: AllianceMember | null, input: MemberInput, version: number, sourceRecordId: string) => {
    if (!session) return { code: 'not-connected' } as Failure;
    try {
      if (previewRole) {
        await new Promise((resolve) => window.setTimeout(resolve, 200));
        if (original) {
          const current = members?.find((member) => member.id === original.id);
          if (!current) throw { code: 'alliance-member-deleted' };
          if (current.version !== version) throw { code: 'alliance-member-conflict' };
          setMembers((list) => (list ?? []).map((member) => member.id === original.id
            ? { ...member, ...input, version: version + 1 } : member));
        } else {
          const id = sourceRecordId ? linkedMemberId(session.eventId, sourceRecordId) : `preview-new-${Date.now()}`;
          if (members?.some((member) => member.id === id)) throw { code: 'alliance-member-duplicate' };
          setMembers((list) => [...(list ?? []), { id, ...input, version: 1 }]);
          if (sourceRecordId) {
            setRecords((list) => list.map((record) => record.id === sourceRecordId ? { ...record, allianceMemberId: id } : record));
          }
        }
        return null;
      }
      if (original) await updateAllianceMember(allianceId, original.id, version, input);
      else if (sourceRecordId) await createAllianceMemberFromTransfer(allianceId, session.eventId, sourceRecordId, session.role, input);
      else await createAllianceMember(allianceId, input);
      return null;
    } catch (error) {
      if (previewRole && error && typeof error === 'object' && 'code' in error) return error as Failure;
      return toTransferError(error);
    }
  };

  const removeMember = async (member: AllianceMember) => {
    setDeleting(true);
    setFailure(null);
    try {
      if (previewRole) {
        const current = members?.find((item) => item.id === member.id);
        if (!current || current.version !== member.version) throw new Error('alliance-member-conflict');
        setMembers((list) => (list ?? []).filter((item) => item.id !== member.id));
      } else {
        await deleteAllianceMember(allianceId, member.id, member.version);
      }
      setConfirming(null);
    } catch (error) {
      setFailure(previewRole ? { code: 'alliance-member-conflict' } : toTransferError(error));
    } finally {
      setDeleting(false);
    }
  };

  const copyPublic = async () => {
    // 非 HTTPS 或瀏覽器拒絕權限時寫入會失敗，不顯示「已複製」
    try { await navigator.clipboard.writeText(hashUrl('#/alliance')); } catch { return; }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const rootProps = { 'data-theme': theme, lang: HTML_LANG[lang] };

  if (connecting) {
    return (
      <main className="transfer-root transfer-state" {...rootProps}>
        <div className="transfer-spinner" />
        <strong>{a.checking}</strong>
      </main>
    );
  }

  if (members === null && failure) {
    return (
      <main className="transfer-root transfer-state error-state" {...rootProps}>
        <span className="state-mark">!</span>
        <strong>{t.error(failure.code, failure.detail)}</strong>
        <a href="#">{t.backToApp}</a>
      </main>
    );
  }

  const allianceName = alliance?.name ?? 'KOi';

  return (
    <main className="transfer-root alliance-root" {...rootProps}>
      <header className="transfer-header">
        <div className="header-top">
          <PageTabs current="alliance" lang={lang} />
          <div className="session-meta">
            <button type="button" className="icon-button lang-button" onClick={toggleLang} aria-label={t.langSwitch}>
              {lang === 'zh' ? 'EN' : '中'}
            </button>
            <button type="button" className="icon-button" onClick={toggleTheme} aria-label={theme === 'dark' ? t.themeToLight : t.themeToDark}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            {session ? <span className="role-badge" title={t.yourRole}>{ROLE_LABELS[session.role]}</span> : null}
          </div>
        </div>
        <h1>{a.title(allianceName)}</h1>
        <p className="transfer-premise">
          <span>{members ? a.summary(sorted.length, r5Count, r4Count) : a.loading}</span>
          <button type="button" className="text-button" onClick={() => void copyPublic()}>
            <CopyIcon /> {copied ? a.copied : a.copyPublic}
          </button>
        </p>
      </header>

      {failure ? <div className="transfer-alert" role="alert">{t.error(failure.code, failure.detail)}</div> : null}

      <section className="transfer-workspace">
        <div className="transfer-sticky">
          {helpOpen ? <p className="list-brief" id="alliance-help">{canManage ? a.manageHint : a.readOnlyHint}</p> : null}
          <div className={`transfer-toolbar alliance-toolbar${session ? ' has-help' : ''}`}>
            <label className="search-field">
              <SearchIcon />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={a.searchPlaceholder} aria-label={a.searchPlaceholder} />
            </label>
            <label className="filter-field">
              <select value={rankFilter} onChange={(event) => setRankFilter(event.target.value as RankFilter)} aria-label={a.rankFilter}>
                <option value="all">{a.rankAll}</option>
                {RANKS.map((item) => <option key={item} value={item}>{rankText(item, a)}</option>)}
              </select>
            </label>
            {session ? (
              <button
                type="button"
                className={`icon-button help-button${helpOpen ? ' active' : ''}`}
                aria-label={helpOpen ? t.helpHide : t.helpShow}
                aria-expanded={helpOpen}
                aria-controls="alliance-help"
                onClick={() => setHelpOpen((open) => !open)}
              >
                <InfoIcon />
              </button>
            ) : null}
            {canManage ? (
              <button type="button" className="primary-button" onClick={() => { setEditing('new'); setConfirming(null); }} disabled={editing === 'new'}>
                + {a.add}
              </button>
            ) : null}
          </div>
        </div>

        <div className="transfer-list">
          {/* 表單固定放在列表最上方：編輯途中成員被刪除、列消失時，輸入內容仍保留 */}
          {canManage && editing ? (
            <MemberForm
              key={editing === 'new' ? 'new' : editing.id}
              original={editing === 'new' ? null : editing}
              live={editing === 'new' ? undefined : sorted.find((member) => member.id === editing.id)}
              members={sorted}
              joinable={editing === 'new' ? joinable : []}
              a={a}
              errorText={errorText}
              powerText={powerText}
              onSubmit={(input, version, sourceId) => saveMember(editing === 'new' ? null : editing, input, version, sourceId)}
              onCancel={() => setEditing(null)}
            />
          ) : null}

          {members === null ? (
            <div className="list-status">
              <div className="transfer-spinner" />
              <span>{a.loading}</span>
            </div>
          ) : (
            <>
              {visible.map(({ member, number }) => {
                const isConfirming = confirming?.id === member.id;
                return (
                  <article className="transfer-row alliance-row" key={member.id}>
                    <div className="member-seq mono">{String(number).padStart(2, '0')}</div>
                    <div className="member-head">
                      <strong title={member.name}>{member.name}</strong>
                      <span className="member-meta">
                        {member.rank !== 'member' ? <span className="rank-pill">{rankText(member.rank, a)}</span> : null}
                        <span className="mono">{powerText(member.power)}</span>
                      </span>
                    </div>
                    {canManage ? (
                      <div className="alliance-actions" role="group" aria-label={a.editActions(member.name)}>
                        <button type="button" className="ghost-button" onClick={() => { setEditing(member); setConfirming(null); }}>{a.edit}</button>
                        <button type="button" className="ghost-button danger" onClick={() => { setConfirming(member); setEditing(null); setFailure(null); }}>{a.delete}</button>
                      </div>
                    ) : null}
                    {isConfirming && confirming ? (
                      <div className="alliance-confirm" role="alertdialog" aria-label={a.deleteConfirm(confirming.name)}>
                        <strong>{a.deleteConfirm(confirming.name)}</strong>
                        <span>{a.deleteNote}</span>
                        <div className="alliance-form-actions">
                          <button type="button" className="ghost-button" onClick={() => setConfirming(null)}>{a.cancel}</button>
                          <button type="button" className="primary-button danger" disabled={deleting} onClick={() => void removeMember(confirming)}>
                            {a.confirmDelete}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {visible.length === 0 ? <div className="empty-list">{a.empty}</div> : null}
            </>
          )}
        </div>
      </section>
    </main>
  );
};

export default AlliancePage;
