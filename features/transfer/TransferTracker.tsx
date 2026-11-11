import React, { createContext, useContext, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  createExternalMember,
  deleteExternalMember,
  subscribeAlliance,
  subscribeSeason,
  subscribeTransferMembers,
  toTransferError,
  updateTransferMember,
} from '../../services/transferFirebase';
import {
  AllianceMember,
  roleLabel,
  TransferEvent,
  TransferList,
  TransferMember,
  TransferMemberChanges,
} from './types';
import {
  Dict,
  HTML_LANG,
  Lang,
  LOCALE,
  STRINGS,
  TransferErrorCode,
} from './i18n';
import { mergeSeason } from './allianceModel';
import {
  CloudIcon,
  CopyIcon,
  InfoIcon,
  MoonIcon,
  PageTabs,
  SearchIcon,
  SunIcon,
  useEditor,
  usePreferences,
  useEventWritable,
} from './ui';
import './transferTracker.css';
import './alliance.css';

interface TransferTrackerProps {
  eventId: string;
}

type Filter = 'all' | 'kick' | 'backup' | 'pending' | 'done' | 'noted';
type Sort = 'default' | 'powerAsc' | 'powerDesc';

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

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2h9.2L17.5 7M10.3 10.6v5.2M13.7 10.6v5.2" />
  </svg>
);

const NoteIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 20.5v-3.2L15.6 5.7a1.8 1.8 0 0 1 2.6 0l1.1 1.1a1.8 1.8 0 0 1 0 2.6L7.7 20.5Z" />
  </svg>
);



const stampOf = (member: TransferMember, l10n: L10n) =>
  member.updatedAt && member.updatedBy
    ? l10n.t.updatedBy(roleLabel(member.updatedBy), l10n.time.format(member.updatedAt))
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
  /** 賽季已結束：只能看，不能勾選或改備註 */
  readOnly: boolean;
  onSave: (changes: TransferMemberChanges) => Promise<boolean>;
  /** 有值才顯示刪除（外部名單、可編輯、尚未建立聯盟關聯） */
  onDelete?: () => Promise<boolean>;
}> = ({ member, saving, readOnly, onSave, onDelete }) => {
  const { t, power } = useL10n();
  const l10n = useL10n();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
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

      <div className={`member-actions ${member.list}${onDelete ? ' deletable' : ''}`}>
        {member.list === 'koi' ? (
          <>
            <div className="decision-group" role="group" aria-label={t.decisionGroup(member.name)}>
              {/* 踢除與候補互斥：勾其中一個就取消另一個 */}
              <DecisionToggle checked={member.kick} disabled={saving || readOnly} label={t.kick} tone="kick" name={member.name} onChange={(kick) => void onSave(kick ? { kick, backup: false } : { kick })} />
              <DecisionToggle checked={member.backup} disabled={saving || readOnly} label={t.backup} tone="backup" name={member.name} onChange={(backup) => void onSave(backup ? { backup, kick: false } : { backup })} />
            </div>
            <DoneCheck checked={member.removed} disabled={saving || readOnly} label={t.left} name={member.name} onChange={(removed) => void onSave({ removed })} />
          </>
        ) : (
          <DoneCheck checked={member.transferred} disabled={saving || readOnly} label={t.joined} name={member.name} onChange={(transferred) => void onSave({ transferred })} />
        )}
        {readOnly ? null : <button
          type="button"
          className={`note-button${hasNote ? ' has-note' : ''}`}
          aria-label={hasNote ? t.editNote(member.name) : t.addNote(member.name)}
          aria-expanded={editing}
          onClick={() => setEditing(true)}
        >
          <NoteIcon />
        </button>}
        {onDelete ? (
          <button
            type="button"
            className="note-button delete-button"
            aria-label={t.externalDelete(member.name)}
            aria-expanded={confirming}
            disabled={saving}
            onClick={() => setConfirming(true)}
          >
            <TrashIcon />
          </button>
        ) : null}
      </div>

      {confirming && onDelete ? (
        <div className="row-confirm" role="alertdialog" aria-label={t.externalDeleteConfirm(member.name)}>
          <strong>{t.externalDeleteConfirm(member.name)}</strong>
          <span>{t.externalDeleteNote}</span>
          <div className="row-confirm-actions">
            <button type="button" className="ghost-button" onClick={() => setConfirming(false)}>{t.cancel}</button>
            <button
              type="button"
              className="ghost-button danger"
              disabled={saving}
              onClick={async () => { if (!(await onDelete())) setConfirming(false); }}
            >
              {t.externalDeleteYes}
            </button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <NoteEditor
          member={member}
          disabled={saving}
          onSave={(note) => onSave({ note })}
          onClose={() => setEditing(false)}
        />
      ) : hasNote ? (
        <button type="button" className="note-preview" disabled={readOnly} onClick={() => setEditing(true)}>
          {member.note}
          {stamp ? <span className="note-stamp">{stamp}</span> : null}
        </button>
      ) : null}
    </article>
  );
};

const ExternalAddForm: React.FC<{
  ext: string;
  onAdd: (name: string) => Promise<boolean>;
}> = ({ ext, onAdd }) => {
  const { t } = useL10n();
  const [name, setName] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="external-add"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || trimmed.length > 100) { setInvalid(true); return; }
        setInvalid(false);
        setSaving(true);
        // 失敗時保留輸入，錯誤訊息由頁面上方的提示顯示
        if (await onAdd(trimmed)) setName('');
        setSaving(false);
      }}
    >
      <input
        value={name}
        maxLength={120}
        placeholder={t.externalAddPlaceholder(ext)}
        aria-label={t.externalAddPlaceholder(ext)}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" className="ghost-button" disabled={saving}>+ {t.externalAdd}</button>
      {invalid ? <p className="note-error" role="alert">{t.externalNameInvalid}</p> : null}
    </form>
  );
};

const Stage: React.FC<{
  tone: 'kick' | 'remove' | 'join';
  step: number;
  name: string;
  value: number;
  total: number;
  current: boolean;
  /** 取代「value / total」的文字，例如不需請人時 */
  countLabel?: string;
  title?: string;
  children?: React.ReactNode;
}> = ({ tone, step, name, value, total, current, countLabel, title, children }) => {
  const complete = total > 0 && value >= total;
  return (
    <div className={`stage s-${tone}${current ? ' current' : ''}${complete ? ' done' : ''}`} title={title}>
      <span className="stage-name"><i>{complete ? '✓' : step}</i>{name}</span>
      <span className="stage-body">
        <span className="stage-count mono">{countLabel ?? <>{value}<s> / {total}</s></>}</span>
        {title ? <span className="stage-note">{title}</span> : null}
        {children}
      </span>
      <span className="stage-bar">
        <i style={{ transform: `scaleX(${total > 0 ? Math.min(1, value / total) : 1})` }} />
      </span>
    </div>
  );
};

/** 查看模式：只列我方被勾踢除或候補的人，不顯示備註、離開／加入狀態與外部名單 */
const ViewList: React.FC<{ members: TransferMember[] }> = ({ members }) => {
  const { t, power } = useL10n();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'kick' | 'backup'>('all');
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());
  const marked = members.filter((member) => member.kick || member.backup);
  const visible = marked
    .filter((member) => filter === 'all' || (filter === 'kick' ? member.kick : member.backup))
    .filter((member) => !deferredSearch || member.name.toLocaleLowerCase().includes(deferredSearch))
    // 踢除在前、候補在後，組內維持階級 → 戰力的原序
    .sort((left, right) => Number(right.kick) - Number(left.kick) || left.number - right.number);

  return (
    <section className="transfer-workspace">
      <div className="transfer-sticky">
        <div className="transfer-toolbar">
          <label className="search-field">
            <SearchIcon />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchLabel} />
          </label>
          <label className="filter-field">
            <span>{t.show}</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label={t.filterLabel}>
              <option value="all">{t.viewFilterAll}</option>
              <option value="kick">{t.kick}</option>
              <option value="backup">{t.backup}</option>
            </select>
          </label>
        </div>
      </div>
      <div className="transfer-list">
        {visible.map((member, index) => (
          <article className="transfer-row view-row" key={member.id}>
            <div className="member-seq mono">{String(index + 1).padStart(2, '0')}</div>
            <div className="member-head">
              <strong title={member.name}>{member.name}</strong>
              <span className="member-meta">
                {member.rank ? <span className="rank-pill">{member.rank}</span> : null}
                {member.power ? <span className="mono">{power.format(member.power)}</span> : null}
              </span>
            </div>
            <span className={`view-tag ${member.kick ? 'kick' : 'backup'}`}>{member.kick ? t.kick : t.backup}</span>
          </article>
        ))}
        {visible.length === 0 ? <div className="empty-list">{marked.length === 0 ? t.viewEmpty : t.emptyList}</div> : null}
      </div>
    </section>
  );
};

const TransferTracker: React.FC<TransferTrackerProps> = ({ eventId }) => {
  const { editor, state: editorState } = useEditor();
  const [event, setEvent] = useState<TransferEvent | null | undefined>(undefined);
  const [records, setRecords] = useState<TransferMember[]>([]);
  const [allianceMembers, setAllianceMembers] = useState<AllianceMember[]>([]);
  const [allianceName, setAllianceName] = useState('KOi');
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [allianceLoaded, setAllianceLoaded] = useState(false);
  const [list, setList] = useState<TransferList>('koi');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('default');
  const [copiedLeaving, setCopiedLeaving] = useState(false);
  const [search, setSearch] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [listStuck, setListStuck] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const watchdogRef = useRef(0);
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [failure, setFailure] = useState<{ code: TransferErrorCode; detail?: string } | null>(null);
  const { theme, toggleTheme, lang, toggleLang } = usePreferences();
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase());
  // 聯盟主檔與賽季紀錄都完成初次載入才顯示，避免人數與階段在載入途中誤判
  const listLoading = !(recordsLoaded && allianceLoaded) && !failure;
  const allianceId = event?.allianceId;
  // 邀請碼屬於其他聯盟時，這個賽季仍是查看模式
  const canEdit = Boolean(editor && event && editor.allianceId === event.allianceId);

  const l10n = useMemo<L10n>(() => ({
    lang,
    t: STRINGS[lang],
    time: new Intl.DateTimeFormat(LOCALE[lang], {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }),
    power: new Intl.NumberFormat(LOCALE[lang]),
  }), [lang]);
  const t = l10n.t;

  useEffect(() => subscribeSeason(eventId, setEvent, setFailure), [eventId, reconnectKey]);

  useEffect(() => {
    if (!allianceId) return;
    const onFailure = (nextFailure: { code: TransferErrorCode; detail?: string }) => {
      window.clearTimeout(watchdogRef.current);
      setFailure(nextFailure);
    };
    const stopRecords = subscribeTransferMembers(
      eventId,
      (nextRecords) => { setRecords(nextRecords); setRecordsLoaded(true); },
      onFailure,
    );
    const stopAlliance = subscribeAlliance(
      allianceId,
      (alliance) => setAllianceName(alliance.name),
      (nextMembers) => { setAllianceMembers(nextMembers); setAllianceLoaded(true); },
      onFailure,
    );
    // 監聽若一直沒有回應，給出可操作的出口，而不是無限轉圈
    watchdogRef.current = window.setTimeout(() => setListStuck(true), 8000);
    return () => {
      window.clearTimeout(watchdogRef.current);
      stopRecords();
      stopAlliance();
    };
  }, [allianceId, eventId, reconnectKey]);

  const retry = () => {
    setFailure(null);
    setListStuck(false);
    setRecordsLoaded(false);
    setAllianceLoaded(false);
    setReconnectKey((key) => key + 1);
  };

  useEffect(() => {
    if (!listLoading) {
      window.clearTimeout(watchdogRef.current);
      setListStuck(false);
    }
  }, [listLoading]);

  // 所有人數與名額都從同一份合併結果計算
  const { koi: koiMembers, bdk: bdkMembers } = useMemo(
    () => mergeSeason(allianceMembers, records),
    [allianceMembers, records],
  );
  const us = allianceName;
  const ext = event?.externalName ?? 'BDK';
  const kickCount = koiMembers.reduce((count, member) => count + Number(member.kick), 0);
  const backupCount = koiMembers.reduce((count, member) => count + Number(member.backup), 0);
  const removedCount = koiMembers.reduce((count, member) => count + Number(member.removed), 0);
  const transferredCount = bdkMembers.reduce((count, member) => count + Number(member.transferred), 0);

  const capacity = event?.capacity ?? 90;
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
    : stage === 3 ? t.headlineJoin(freeSlots, pendingJoin, ext)
    : t.headlineDone;
  const hint =
    stage === 1 ? t.hintPick(backupCount, us, kickGap)
    : stage === 2 ? t.hintLeave
    : stage === 3 ? t.hintJoin(ext)
    : t.hintDone(koiStaying, transferredCount, occupancy, capacity, us, ext);

  const visibleMembers = useMemo(() => {
    const source = list === 'koi' ? koiMembers : bdkMembers;
    const filtered = source.filter((member) => {
      if (deferredSearch && !member.name.toLocaleLowerCase().includes(deferredSearch)) return false;
      if (filter === 'kick' && !member.kick) return false;
      if (filter === 'backup' && !member.backup) return false;
      if (filter === 'pending' && (member.list === 'koi' ? member.removed : member.transferred)) return false;
      if (filter === 'done' && !(member.list === 'koi' ? member.removed : member.transferred)) return false;
      if (filter === 'noted' && !member.note) return false;
      return true;
    });
    // 依戰力排序方便挑人；未填戰力一律墊底，同戰力維持原序號
    if (list !== 'koi' || sort === 'default') return filtered;
    const direction = sort === 'powerAsc' ? 1 : -1;
    return [...filtered].sort((left, right) =>
      (left.power == null ? 1 : 0) - (right.power == null ? 1 : 0)
      || direction * ((left.power ?? 0) - (right.power ?? 0))
      || left.number - right.number);
  }, [bdkMembers, deferredSearch, filter, koiMembers, list, sort]);

  // 已勾踢除但還沒離開的人，複製後可直接貼到遊戲聊天通知
  const leavingNames = koiMembers.filter((member) => member.kick && !member.removed).map((member) => member.name);
  const copyLeaving = async () => {
    try { await navigator.clipboard.writeText(leavingNames.join('\n')); } catch { return; }
    setCopiedLeaving(true);
    window.setTimeout(() => setCopiedLeaving(false), 1500);
  };

  // 篩選或搜尋時，目前分頁顯示「符合 / 全部」
  const filtering = filter !== 'all' || deferredSearch !== '';
  const tabCount = (tab: TransferList, total: number) =>
    tab === list && filtering ? `${visibleMembers.length}/${total}` : total;

  const saveMember = async (member: TransferMember, changes: TransferMemberChanges): Promise<boolean> => {
    if (!editor || !canEdit) return false;
    const previous = records.find((item) => item.id === member.id);
    setFailure(null);
    setRecords((current) => current.some((item) => item.id === member.id)
      ? current.map((item) => item.id === member.id ? { ...item, ...changes } : item)
      : [...current, { ...member, ...changes }]);
    setSavingIds((current) => new Set(current).add(member.id));

    try {
      await updateTransferMember(
        eventId, member.id, editor.role, changes, member.note, member.hasRecord !== false,
      );
      return true;
    } catch (saveError) {
      setRecords((current) => previous
        ? current.map((item) => item.id === member.id ? previous : item)
        : current.filter((item) => item.id !== member.id));
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

  const writable = useEventWritable(event ?? undefined);
  const canEditExternal = canEdit && writable;

  const addExternal = async (name: string): Promise<boolean> => {
    if (!editor) return false;
    setFailure(null);
    // 新人排在最後；連同已隱藏的關聯紀錄一起算，避免序號重複
    const number = records.reduce((max, record) => record.list === 'bdk' ? Math.max(max, record.number) : max, 0) + 1;
    try {
      await createExternalMember(eventId, editor.role, name, number);
      return true;
    } catch (addError) {
      setFailure(toTransferError(addError));
      return false;
    }
  };

  const deleteExternal = async (member: TransferMember): Promise<boolean> => {
    const previous = records;
    setFailure(null);
    setRecords((current) => current.filter((item) => item.id !== member.id));
    try {
      await deleteExternalMember(eventId, member.id);
      return true;
    } catch (deleteError) {
      setRecords(previous);
      setFailure(toTransferError(deleteError));
      return false;
    }
  };

  if ((event === undefined && !failure) || editorState.status === 'checking') {
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

  if (!event || (failure && records.length === 0 && allianceMembers.length === 0)) {
    return (
      <L10nContext.Provider value={l10n}>
        <main className="transfer-root transfer-state error-state" data-theme={theme} lang={HTML_LANG[lang]}>
          <span className="state-mark">!</span>
          <strong>{t.blockedTitle}</strong>
          <span>{failure ? t.error(failure.code, failure.detail) : t.error('event-not-found')}</span>
          <a href="#/transfer">{t.backToSeasons}</a>
        </main>
      </L10nContext.Provider>
    );
  }

  return (
    <L10nContext.Provider value={l10n}>
    <main className="transfer-root" data-theme={theme} lang={HTML_LANG[lang]}>
      <header className="transfer-header">
        <div className="header-top">
          <PageTabs current="season" lang={lang} />
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
            {canEdit && editor ? (
              <>
                <a className="ghost-button admin-link" href="#/transfer/admin">{t.adminOpen}</a>
                <span className="role-badge" title={t.yourRole}>{roleLabel(editor.role)}</span>
                <span className={`sync-badge${savingIds.size > 0 ? ' saving' : ''}`}>
                  <CloudIcon /> {savingIds.size > 0 ? t.saving(savingIds.size) : t.synced}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <h1>{lang === 'en' && event.titleEn ? event.titleEn : event.title}</h1>
        {canEdit ? (
          <p className="transfer-premise">
            <span><b className="premise-koi">{us}</b> {t.premiseUs(capacity, koiMembers.length)}</span>
            <span><b className="premise-bdk">{ext}</b> {t.premiseThem(bdkMembers.length)}</span>
          </p>
        ) : listLoading ? null : (
          <p className="transfer-premise">
            <span><b className="premise-koi">{us}</b> {t.viewSummary(kickCount, backupCount)}</span>
          </p>
        )}
      </header>

      {editorState.status === 'none' && editorState.failure ? (
        <div className="transfer-alert" role="alert">{t.inviteFailed(t.error(editorState.failure.code, editorState.failure.detail))}</div>
      ) : null}
      {!writable && event.closesAt != null ? (
        <div className="transfer-alert closed-notice">{t.closedNotice(new Date(event.closesAt))}</div>
      ) : null}
      {failure ? <div className="transfer-alert" role="alert">{t.error(failure.code, failure.detail)}</div> : null}

      {!canEdit ? (
        listLoading ? (
          <div className="list-status">
            <div className="transfer-spinner" />
            <span>{t.listLoading}</span>
          </div>
        ) : <ViewList members={koiMembers} />
      ) : (
      <>
      {listLoading ? null : (
      <section className="transfer-status" aria-label={t.nextStep}>
        <span className="status-now">{t.nextStep}</span>
        <strong className="status-headline">{headline}</strong>
        <span className="status-hint">{hint}</span>

        <div className="stage-track">
          <Stage
            tone="kick" step={1} name={t.stagePick} value={kickCount} total={requiredKicks} current={stage === 1}
            countLabel={requiredKicks === 0 ? t.stageNoKick : undefined}
            title={requiredKicks === 0 ? t.stageNoKickHint(koiMembers.length + bdkMembers.length, capacity) : undefined}
          >
            {/* 踢除＝確定請走；候補＝位子不夠時才考慮，兩者都要看得到 */}
            <span className="stage-split">
              <span className="split-kick">{t.stageKick}<b className="mono">{kickCount}</b></span>
              <span className="split-backup">{t.stageBackup}<b className="mono">{backupCount}</b></span>
            </span>
          </Stage>
          <Stage tone="remove" step={2} name={t.stageOut(us)} value={removedCount} total={kickCount} current={stage === 2} />
          <Stage tone="join" step={3} name={t.stageIn(ext)} value={transferredCount} total={bdkMembers.length} current={stage === 3} />
        </div>

        <p className="seat-line">
          <span>{t.seatStay(koiStaying, us)}</span>
          <span>{t.seatJoined(transferredCount, ext)}</span>
          <span className={`seat-total${freeSlots < 0 ? ' negative' : ''}`}>
            {t.seatNow} <b>{occupancy} / {capacity}</b>　{freeSlots >= 0 ? t.seatFree(freeSlots) : t.seatOver(-freeSlots)}
          </span>
        </p>
        {leavingNames.length > 0 ? (
          <button type="button" className="ghost-button copy-leaving" onClick={() => void copyLeaving()}>
            <CopyIcon /> {copiedLeaving ? t.copiedLeaving : t.copyLeaving(leavingNames.length)}
          </button>
        ) : null}
      </section>
      )}


      <section className="transfer-workspace">
        <div className="transfer-sticky">
          <div className="transfer-tabs" role="tablist" aria-label={`${t.tabUs} / ${t.tabThem}`}>
            <button
              className={`tab-koi${list === 'koi' ? ' active' : ''}`}
              role="tab"
              aria-selected={list === 'koi'}
              onClick={() => { setList('koi'); setFilter('all'); }}
            >
              <span className="tab-tag">{us}</span>
              <span className="tab-role">{t.tabUs}</span>
              <em>{tabCount('koi', koiMembers.length)}</em>
            </button>
            <button
              className={`tab-bdk${list === 'bdk' ? ' active' : ''}`}
              role="tab"
              aria-selected={list === 'bdk'}
              onClick={() => { setList('bdk'); setFilter('all'); }}
            >
              <span className="tab-tag">{ext}</span>
              <span className="tab-role">{t.tabThem}</span>
              <em>{tabCount('bdk', bdkMembers.length)}</em>
            </button>
          </div>

          {/* 說明熟悉後就不必一直佔位，預設收起 */}
          {helpOpen ? (
            <p className="list-brief" id="list-brief">
              {(() => {
                const brief = list === 'koi' ? t.briefKoi(koiMembers.length) : t.briefBdk(bdkMembers.length, ext);
                return <>{brief.lead}<b>{brief.strong}</b>{brief.tail}</>;
              })()}
            </p>
          ) : null}

          <div className={`transfer-toolbar has-help${list === 'koi' ? ' has-sort' : ''}`}>
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
            {list === 'koi' ? (
              <label className="filter-field">
                <span>{t.sortLabel}</span>
                <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label={t.sortLabel}>
                  <option value="default">{t.sortDefault}</option>
                  <option value="powerAsc">{t.sortPowerAsc}</option>
                  <option value="powerDesc">{t.sortPowerDesc}</option>
                </select>
              </label>
            ) : null}
            <button
              type="button"
              className={`icon-button help-button${helpOpen ? ' active' : ''}`}
              aria-label={helpOpen ? t.helpHide : t.helpShow}
              aria-expanded={helpOpen}
              aria-controls="list-brief"
              onClick={() => setHelpOpen((open) => !open)}
            >
              <InfoIcon />
            </button>
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
              {list === 'bdk' && canEditExternal ? <ExternalAddForm ext={ext} onAdd={addExternal} /> : null}
              {visibleMembers.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  saving={savingIds.has(member.id)}
                  readOnly={!writable}
                  onSave={(changes) => saveMember(member, changes)}
                  onDelete={member.list === 'bdk' && canEditExternal && !member.allianceMemberId
                    ? () => deleteExternal(member)
                    : undefined}
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
      </>
      )}
    </main>
    </L10nContext.Provider>
  );
};

export default TransferTracker;
