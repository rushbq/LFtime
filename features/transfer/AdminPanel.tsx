import React, { useCallback, useEffect, useState } from 'react';
import {
  createExternalMembers,
  createSeason,
  deleteSeason,
  listSeasons,
  loadExternalMembers,
  loadInvites,
  regenerateInvite,
  toTransferError,
  updateSeasonSettings,
} from '../../services/transferFirebase';
import { EditorSession, ROLE_LABELS, ROLES, SeasonSettings, SeasonSummary, TransferEvent, TransferInviteSet, TransferMember, TransferRole } from './types';
import { Dict, HTML_LANG, STRINGS, TransferErrorCode } from './i18n';
import { parseBulkNames } from './allianceModel';
import { CopyIcon, hashUrl, MoonIcon, PageTabs, SunIcon, useEditor, useEventWritable, usePreferences } from './ui';
import './transferTracker.css';

const EVENT_ID = /^[a-z0-9-]{3,60}$/;
const CLOSE_PRESETS = [3, 7, 14];
/** 選了日期沒選時間時預設的結束時刻（轉移通常在晚上收尾） */
const DEFAULT_CLOSE_TIME = '22:00';
/** 目前只有一個聯盟；以密碼進入（沒有邀請碼）時管理這個聯盟 */
const DEFAULT_ALLIANCE = 'koi';
/**
 * 管理頁密碼只是防君子：寫在前端、任何人看原始碼都拿得到，不是權限。
 * 真正的權限在 firestore.rules：修改設定、刪除賽季與邀請連結都要編輯邀請。
 */
const ADMIN_PASSWORD = 'lovelyEnstar';
const UNLOCK_KEY = 'lftime-season-admin-unlocked';

type Failure = { code: TransferErrorCode; detail?: string };

export const getInviteUrl = (token: string) => hashUrl(`#/transfer/join/${token}`);

const isUnlocked = () => {
  try { return window.localStorage.getItem(UNLOCK_KEY) === '1'; } catch { return false; }
};

/* ---------------- 表單資料 ---------------- */

interface SettingsDraft {
  title: string;
  titleEn: string;
  externalName: string;
  closeDate: string;
  closeTime: string;
}

type DraftErrors = Partial<Record<keyof SettingsDraft, string>>;

const pad = (value: number) => String(value).padStart(2, '0');

/** 毫秒 ↔ 本機時區的 date/time 欄位值（不用 datetime-local，理由見維護指南 3.1） */
const toParts = (ms: number | null | undefined) => {
  if (ms == null) return { closeDate: '', closeTime: '' };
  const at = new Date(ms);
  return {
    closeDate: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    closeTime: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
};

const draftOf = (event: TransferEvent): SettingsDraft => ({
  title: event.title,
  titleEn: event.titleEn ?? '',
  externalName: event.externalName,
  ...toParts(event.closesAt),
});

const sameDraft = (left: SettingsDraft, right: SettingsDraft) =>
  (Object.keys(left) as (keyof SettingsDraft)[]).every((key) => left[key].trim() === right[key].trim());

/** 驗證規則與 firestore.rules 的 validEventSettings 一致；逐欄回報錯誤 */
const validateDraft = (draft: SettingsDraft, t: Dict): { value: SeasonSettings | null; errors: DraftErrors } => {
  const errors: DraftErrors = {};
  const title = draft.title.trim();
  const titleEn = draft.titleEn.trim();
  const externalName = draft.externalName.trim();
  if (!title) errors.title = t.errRequired;
  else if (title.length > 100) errors.title = t.errTooLong(100);
  if (titleEn.length > 100) errors.titleEn = t.errTooLong(100);
  if (!externalName) errors.externalName = t.errRequired;
  else if (externalName.length > 40) errors.externalName = t.errTooLong(40);
  // 只填時間沒填日期最容易被忽略，明確擋下，不要默默當成「不設結束」
  let closesAt: number | null = null;
  if (draft.closeTime && !draft.closeDate) errors.closeDate = t.errNeedDate;
  else if (draft.closeDate && !draft.closeTime) errors.closeTime = t.errNeedTime;
  else if (draft.closeDate) {
    closesAt = new Date(`${draft.closeDate}T${draft.closeTime}`).getTime();
    if (Number.isNaN(closesAt)) errors.closeDate = t.errNeedDate;
  }
  if (Object.keys(errors).length > 0) return { value: null, errors };
  return { value: { title, ...(titleEn ? { titleEn } : {}), externalName, closesAt }, errors };
};

const closesAtOf = (draft: SettingsDraft) => {
  if (!draft.closeDate || !draft.closeTime) return null;
  const ms = new Date(`${draft.closeDate}T${draft.closeTime}`).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/** 預填下個月的代碼；已被使用就再往後一個月 */
const nextSeasonId = (allianceId: string, existing: string[]) => {
  const taken = new Set(existing);
  const at = new Date();
  at.setDate(1);
  let id = '';
  do {
    at.setMonth(at.getMonth() + 1);
    id = `${allianceId}-${String(at.getFullYear()).slice(2)}${pad(at.getMonth() + 1)}`;
  } while (taken.has(id));
  return id;
};

/* ---------------- 共用欄位 ---------------- */

const Field: React.FC<{ label: string; hint?: string; error?: string; children: React.ReactNode }> = ({ label, hint, error, children }) => (
  <label className={`admin-field${error ? ' has-error' : ''}`}>
    <span className="admin-label">{label}</span>
    {children}
    {error ? <small className="admin-error" role="alert">{error}</small> : hint ? <small>{hint}</small> : null}
  </label>
);

/** 賽季設定欄位：修改賽季設定與建立新賽季共用 */
const SettingsFields: React.FC<{
  t: Dict;
  value: SettingsDraft;
  errors: DraftErrors;
  onChange: (patch: Partial<SettingsDraft>) => void;
}> = ({ t, value, errors, onChange }) => {
  const closesAt = closesAtOf(value);
  const presetDate = (days: number) => {
    const at = new Date();
    at.setDate(at.getDate() + days);
    return toParts(at.getTime()).closeDate;
  };
  return (
    <>
      <Field label={t.fieldExternal} hint={t.fieldExternalHint} error={errors.externalName}>
        <input value={value.externalName} maxLength={40} onChange={(event) => onChange({ externalName: event.target.value })} />
      </Field>
      <Field label={t.fieldTitle} error={errors.title}>
        <input value={value.title} maxLength={100} onChange={(event) => onChange({ title: event.target.value })} />
      </Field>
      <Field label={t.fieldTitleEn} error={errors.titleEn}>
        <input value={value.titleEn} maxLength={100} onChange={(event) => onChange({ titleEn: event.target.value })} />
      </Field>
      <div className={`admin-field${errors.closeDate || errors.closeTime ? ' has-error' : ''}`}>
        <span className="admin-label">{t.fieldClosesAt}</span>
        <div className="admin-presets">
          {CLOSE_PRESETS.map((days) => (
            <button
              type="button" key={days} className="chip-button"
              onClick={() => onChange({ closeDate: presetDate(days), closeTime: value.closeTime || DEFAULT_CLOSE_TIME })}
            >
              {t.closesPreset(days)}
            </button>
          ))}
          <button type="button" className="chip-button" onClick={() => onChange({ closeDate: '', closeTime: '' })}>{t.closesNone}</button>
        </div>
        <div className="admin-datetime">
          <input
            type="date" aria-label={t.fieldClosesDate} value={value.closeDate}
            // 選了日期還沒選時間時，先帶入預設時刻，少一次操作
            onChange={(event) => onChange({ closeDate: event.target.value, closeTime: value.closeTime || (event.target.value ? DEFAULT_CLOSE_TIME : '') })}
          />
          <input type="time" aria-label={t.fieldClosesTime} value={value.closeTime} onChange={(event) => onChange({ closeTime: event.target.value })} />
        </div>
        {errors.closeDate || errors.closeTime ? (
          <small className="admin-error" role="alert">{errors.closeDate ?? errors.closeTime}</small>
        ) : (
          <small className={closesAt != null && closesAt <= Date.now() ? 'admin-warn' : undefined}>
            {closesAt == null ? t.closesNoneNote
              : closesAt <= Date.now() ? t.closesPast(new Date(closesAt))
              : t.closesPreview(new Date(closesAt))}
          </small>
        )}
      </div>
    </>
  );
};

/* ---------------- 單一賽季：設定與批次新增（編輯者） ---------------- */

const SeasonEditor: React.FC<{
  t: Dict;
  editor: EditorSession;
  season: SeasonSummary;
  onSaved: (season: SeasonSummary) => void;
  onFailure: (failure: Failure | null) => void;
}> = ({ t, editor, season, onSaved, onFailure }) => {
  const saved = draftOf(season);
  const [settings, setSettings] = useState(saved);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [justSaved, setJustSaved] = useState(false);
  const [busy, setBusy] = useState<'settings' | 'bulk' | null>(null);
  const [externals, setExternals] = useState<TransferMember[] | null>(null);
  const [bulk, setBulk] = useState('');
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const writable = useEventWritable(season);
  const dirty = !sameDraft(settings, saved);
  const bulkParsed = parseBulkNames(bulk, (externals ?? []).map((member) => member.name));

  useEffect(() => {
    let disposed = false;
    loadExternalMembers(season.id)
      .then((items) => { if (!disposed) setExternals(items); })
      .catch((error) => { if (!disposed) { setExternals([]); onFailure(toTransferError(error)); } });
    return () => { disposed = true; };
  }, [season.id, onFailure]);

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>) => {
    onFailure(null);
    setBusy(kind);
    try {
      await task();
      return true;
    } catch (error) {
      onFailure(toTransferError(error));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = async () => {
    const { value, errors: nextErrors } = validateDraft(settings, t);
    setErrors(nextErrors);
    if (!value) return;
    const next = { ...season, ...value, titleEn: value.titleEn, closesAt: value.closesAt ?? undefined };
    if (await run('settings', () => updateSeasonSettings(season.id, value))) {
      // 存檔後以正規化後的值為準（例如去掉前後空白）
      setSettings(draftOf(next));
      setJustSaved(true);
      onSaved(next);
    }
  };

  const addBulk = async () => {
    const { names, skipped } = bulkParsed;
    if (names.length === 0 || !externals) return;
    const start = externals.reduce((max, member) => Math.max(max, member.number), 0) + 1;
    if (await run('bulk', () => createExternalMembers(season.id, editor.role, names, start))) {
      setBulk('');
      setBulkResult(t.bulkDone(names.length, skipped));
      setExternals(await loadExternalMembers(season.id).catch(() => externals));
    }
  };

  return (
    <div className="season-edit">
      <form className="admin-form" noValidate onSubmit={(event) => { event.preventDefault(); void saveSettings(); }}>
        <span className="admin-label">{t.settingsHint(season.id)}</span>
        <SettingsFields
          t={t} value={settings} errors={errors}
          onChange={(patch) => { setSettings((current) => ({ ...current, ...patch })); setErrors({}); setJustSaved(false); }}
        />
        <div className="admin-actions">
          <span className={`admin-status${dirty ? ' dirty' : justSaved ? ' ok' : ''}`} role="status">
            {dirty ? t.dirty : justSaved ? t.saved : t.noChange}
          </span>
          <button type="button" className="ghost-button" disabled={!dirty || busy !== null} onClick={() => { setSettings(saved); setErrors({}); }}>
            {t.reset}
          </button>
          <button type="submit" className="ghost-button primary" disabled={!dirty || busy !== null}>
            {busy === 'settings' ? t.savingNow : t.save}
          </button>
        </div>
      </form>

      <div className="admin-form">
        <span className="admin-label">{t.bulkTitle(season.externalName)}</span>
        {writable ? (
          <>
            <small className="admin-muted">{t.bulkHint}</small>
            <textarea
              className="transfer-note admin-bulk"
              value={bulk}
              placeholder={t.bulkPlaceholder}
              aria-label={t.bulkTitle(season.externalName)}
              onChange={(event) => { setBulk(event.target.value); setBulkResult(null); }}
            />
            <div className="admin-actions">
              <span className={`admin-status${bulkResult ? ' ok' : ''}`} role="status">
                {bulkResult ?? (externals === null ? t.listLoading
                  : bulk.trim() ? t.bulkPreview(bulkParsed.names.length, bulkParsed.skipped) : t.bulkCurrent(externals.length))}
              </span>
              <button
                type="button" className="ghost-button primary"
                disabled={busy !== null || externals === null || bulkParsed.names.length === 0}
                onClick={() => void addBulk()}
              >
                {busy === 'bulk' ? t.savingNow : t.bulkAdd(bulkParsed.names.length)}
              </button>
            </div>
          </>
        ) : <p className="admin-muted">{t.bulkReadOnly}</p>}
      </div>
    </div>
  );
};

/* ---------------- 賽季列表 ---------------- */

const SeasonList: React.FC<{
  t: Dict;
  lang: 'zh' | 'en';
  editor: EditorSession | null;
  seasons: SeasonSummary[] | null;
  onSeasons: (update: (current: SeasonSummary[]) => SeasonSummary[]) => void;
  onFailure: (failure: Failure | null) => void;
}> = ({ t, lang, editor, seasons, onSeasons, onFailure }) => {
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState<string | null>(null);

  const remove = async (eventId: string) => {
    onFailure(null);
    setBusy(true);
    try {
      await deleteSeason(eventId);
      onSeasons((current) => current.filter((season) => season.id !== eventId));
      setDeleting(null);
      setTyped('');
      setDeleted(eventId);
    } catch (error) {
      onFailure(toTransferError(error));
    } finally {
      setBusy(false);
    }
  };

  const status = (season: SeasonSummary) => {
    if (!season.active) return t.historyClosed;
    if (season.closesAt == null) return t.historyNoEnd;
    return season.closesAt > Date.now() ? t.historyEnds(new Date(season.closesAt)) : t.historyEnded(new Date(season.closesAt));
  };

  if (!seasons) return <p className="admin-muted">{t.seasonsLoading}</p>;
  if (seasons.length === 0) return <p className="admin-muted">{t.historyEmpty}</p>;
  return (
    <div className="season-list">
      {deleted ? <span className="admin-status ok" role="status">{t.historyDeleted(deleted)}</span> : null}
      {seasons.map((season) => (
        <div className="season-row" key={season.id}>
          <div className="season-main">
            <strong>{lang === 'en' && season.titleEn ? season.titleEn : season.title}</strong>
            <span className="season-meta">
              <code>{season.id}</code>
              <span>{season.externalName}</span>
              <span>{status(season)}</span>
            </span>
          </div>
          <div className="season-actions">
            <a className="ghost-button" href={`#/transfer/season/${season.id}`}>{t.historyOpen}</a>
            {editor ? (
              <>
                <button
                  type="button" className="ghost-button" aria-expanded={editing === season.id}
                  onClick={() => { setEditing((current) => current === season.id ? null : season.id); setDeleting(null); }}
                >
                  {editing === season.id ? t.historyEditClose : t.historyEdit}
                </button>
                <button
                  type="button" className="ghost-button danger" disabled={busy}
                  onClick={() => { setDeleting(season.id); setEditing(null); setTyped(''); setDeleted(null); }}
                >
                  {t.historyDelete}
                </button>
              </>
            ) : null}
          </div>
          {editor && editing === season.id ? (
            <SeasonEditor
              t={t} editor={editor} season={season} onFailure={onFailure}
              onSaved={(next) => onSeasons((current) => current.map((item) => item.id === next.id ? next : item))}
            />
          ) : null}
          {deleting === season.id ? (
            <form
              className="row-confirm season-confirm" role="alertdialog" aria-label={t.historyDeleteConfirm(season.id)}
              onSubmit={(event) => { event.preventDefault(); if (typed.trim() === season.id) void remove(season.id); }}
            >
              <strong>{t.historyDeleteConfirm(season.id)}</strong>
              <span>{t.historyDeleteNote}</span>
              <input
                value={typed} placeholder={season.id} aria-label={t.historyDeleteType}
                autoCapitalize="none" spellCheck={false}
                onChange={(event) => setTyped(event.target.value)}
              />
              <div className="row-confirm-actions">
                <button type="button" className="ghost-button" onClick={() => setDeleting(null)}>{t.cancel}</button>
                <button type="submit" className="ghost-button danger" disabled={busy || typed.trim() !== season.id}>
                  {busy ? t.savingNow : t.historyDeleteYes}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ))}
    </div>
  );
};

/* ---------------- 建立新賽季（密碼或編輯者） ---------------- */

const emptyDraft: SettingsDraft = { title: '', titleEn: '', externalName: '', closeDate: '', closeTime: '' };

const CreateSeason: React.FC<{
  t: Dict;
  us: string;
  allianceId: string;
  existingIds: string[] | null;
  onCreated: () => void;
  onFailure: (failure: Failure | null) => void;
}> = ({ t, us, allianceId, existingIds, onCreated, onFailure }) => {
  const [season, setSeason] = useState<SettingsDraft>(emptyDraft);
  // 標題預設跟著對方聯盟名稱自動產生，手動改過就不再覆蓋
  const [titleTouched, setTitleTouched] = useState(false);
  const [errors, setErrors] = useState<DraftErrors & { eventId?: string }>({});
  const [eventId, setEventId] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  // 賽季列表載入後才知道哪些代碼已被使用；使用者沒改過就跟著預填
  useEffect(() => {
    if (!idTouched && existingIds) setEventId(nextSeasonId(allianceId, existingIds));
  }, [allianceId, existingIds, idTouched]);

  const change = (patch: Partial<SettingsDraft>) => {
    setConfirming(false);
    setErrors({});
    const touched = titleTouched || patch.title !== undefined || patch.titleEn !== undefined;
    if (touched !== titleTouched) setTitleTouched(true);
    setSeason((current) => {
      const next = { ...current, ...patch };
      if (!touched && patch.externalName !== undefined) {
        const ext = patch.externalName.trim();
        next.title = ext ? t.seasonTitle(us, ext) : '';
        next.titleEn = ext ? t.seasonTitleEn(us, ext) : '';
      }
      return next;
    });
  };

  const create = async () => {
    const { value, errors: nextErrors } = validateDraft(season, t);
    const id = eventId.trim();
    const idError = !EVENT_ID.test(id) ? t.errEventId : existingIds?.includes(id) ? t.error('season-exists') : undefined;
    setErrors({ ...nextErrors, ...(idError ? { eventId: idError } : {}) });
    if (!value || idError) return;
    if (!confirming) { setConfirming(true); return; }
    onFailure(null);
    setBusy(true);
    try {
      await createSeason(allianceId, id, value);
      setCreated(id);
      onCreated();
    } catch (error) {
      onFailure(toTransferError(error));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (created) {
    return (
      <div className="admin-form">
        <span className="admin-status ok">{t.newSeasonDone(created)}</span>
        <div className="admin-actions">
          <button
            type="button" className="ghost-button"
            onClick={() => { setCreated(null); setSeason(emptyDraft); setTitleTouched(false); setIdTouched(false); }}
          >
            {t.newSeasonAnother}
          </button>
          <a className="ghost-button primary" href={`#/transfer/season/${created}`}>{t.newSeasonGo}</a>
        </div>
      </div>
    );
  }

  return (
    <form className="admin-form" noValidate onSubmit={(event) => { event.preventDefault(); void create(); }}>
      <Field label={t.fieldEventId} hint={t.fieldEventIdHint} error={errors.eventId}>
        <input
          value={eventId}
          maxLength={60}
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) => { setEventId(event.target.value.toLowerCase()); setIdTouched(true); setConfirming(false); setErrors({}); }}
        />
      </Field>
      <SettingsFields t={t} value={season} errors={errors} onChange={change} />
      {confirming ? (
        <div className="row-confirm" role="alertdialog" aria-label={t.newSeasonConfirm}>
          <strong>{t.newSeasonConfirm}</strong>
          <span>{t.newSeasonConfirmNote(eventId.trim())}</span>
          <div className="row-confirm-actions">
            <button type="button" className="ghost-button" onClick={() => setConfirming(false)}>{t.cancel}</button>
            <button type="submit" className="ghost-button primary" disabled={busy}>
              {busy ? t.savingNow : t.newSeasonCreate}
            </button>
          </div>
        </div>
      ) : (
        <div className="admin-actions">
          {Object.keys(errors).length > 0 ? <span className="admin-status error">{t.fixErrors}</span> : null}
          <button type="submit" className="ghost-button primary" disabled={busy}>{t.newSeasonCreate}</button>
        </div>
      )}
    </form>
  );
};

/* ---------------- 編輯邀請連結（編輯者） ---------------- */

const InviteLinks: React.FC<{
  t: Dict;
  editor: EditorSession;
  onSwitch: (token: string) => void;
  onFailure: (failure: Failure | null) => void;
}> = ({ t, editor, onSwitch, onFailure }) => {
  const [invites, setInvites] = useState<TransferInviteSet | null>(null);
  const [copied, setCopied] = useState<TransferRole | null>(null);
  const [regenerating, setRegenerating] = useState<TransferRole | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let disposed = false;
    loadInvites(editor.allianceId)
      .then((items) => { if (!disposed) setInvites(items); })
      .catch((error) => { if (!disposed) onFailure(toTransferError(error)); });
    return () => { disposed = true; };
  }, [editor.allianceId, onFailure]);

  const copy = async (role: TransferRole, text: string) => {
    // 非 HTTPS 或瀏覽器拒絕權限時寫入會失敗，不顯示「已複製」
    try { await navigator.clipboard.writeText(text); } catch { return; }
    setCopied(role);
    window.setTimeout(() => setCopied(null), 1500);
  };

  const regenerate = async (role: TransferRole) => {
    if (!invites) return;
    onFailure(null);
    setBusy(true);
    try {
      const next = await regenerateInvite(editor.allianceId, role, invites);
      setInvites(next);
      // 換掉自己用的連結後，這台裝置要改用新連結，否則會立即失去編輯權限
      if (role === editor.role) onSwitch(next[role]);
    } catch (error) {
      onFailure(toTransferError(error));
    } finally {
      setBusy(false);
      setRegenerating(null);
    }
  };

  if (!invites) return <p className="admin-muted">{t.listLoading}</p>;
  return (
    <div className="invite-links">
      {ROLES.map((role) => (
        <div className="invite-link-block" key={role}>
          <div className="invite-link">
            <span className="role-badge" title={role === editor.role ? t.inviteYours : undefined}>
              {ROLE_LABELS[role]}{role === editor.role ? ' ●' : ''}
            </span>
            <code>{getInviteUrl(invites[role])}</code>
            <span className="invite-link-actions">
              <button type="button" className="ghost-button" onClick={() => void copy(role, getInviteUrl(invites[role]))}>
                <CopyIcon /> {copied === role ? t.copied : t.copy}
              </button>
              <button type="button" className="ghost-button" disabled={busy} onClick={() => setRegenerating(role)}>
                {t.inviteRegenerate}
              </button>
            </span>
          </div>
          {regenerating === role ? (
            <div className="row-confirm" role="alertdialog" aria-label={t.inviteRegenerateConfirm(ROLE_LABELS[role])}>
              <strong>{t.inviteRegenerateConfirm(ROLE_LABELS[role])}</strong>
              <span>{role === editor.role ? t.inviteRegenerateSelf : t.inviteRegenerateNote}</span>
              <div className="row-confirm-actions">
                <button type="button" className="ghost-button" onClick={() => setRegenerating(null)}>{t.cancel}</button>
                <button type="button" className="ghost-button danger" disabled={busy} onClick={() => void regenerate(role)}>
                  {t.inviteRegenerateYes}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
};

/* ---------------- 密碼 ---------------- */

const Gate: React.FC<{ t: Dict; onUnlock: () => void }> = ({ t, onUnlock }) => {
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);
  return (
    <section className="admin-card">
      <header>
        <h2>{t.adminTitle}</h2>
        <p>{t.gateBody}</p>
      </header>
      <form
        className="gate-form" noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (value !== ADMIN_PASSWORD) { setWrong(true); return; }
          try { window.localStorage.setItem(UNLOCK_KEY, '1'); } catch { /* 不記住就每次輸入 */ }
          onUnlock();
        }}
      >
        <Field label={t.gatePassword} error={wrong ? t.gateWrong : undefined}>
          <input type="password" value={value} autoFocus onChange={(event) => { setValue(event.target.value); setWrong(false); }} />
        </Field>
        <button type="submit" className="ghost-button primary">{t.gateSubmit}</button>
      </form>
    </section>
  );
};

/* ---------------- 管理頁 ---------------- */

const AdminPage: React.FC = () => {
  const { theme, toggleTheme, lang, toggleLang } = usePreferences();
  const t = STRINGS[lang];
  const { editor, state, switchInvite } = useEditor();
  const [unlocked, setUnlocked] = useState(isUnlocked);
  const [seasons, setSeasons] = useState<SeasonSummary[] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const allianceId = editor?.allianceId ?? DEFAULT_ALLIANCE;
  const canEnter = Boolean(editor) || unlocked;
  const onFailure = useCallback((next: Failure | null) => setFailure(next), []);

  useEffect(() => {
    if (!canEnter) return;
    let disposed = false;
    listSeasons(allianceId)
      .then((items) => { if (!disposed) setSeasons(items); })
      .catch((error) => { if (!disposed) { setSeasons([]); setFailure(toTransferError(error)); } });
    return () => { disposed = true; };
  }, [allianceId, canEnter, reloadKey]);

  // 只用來預填新賽季標題；目前只有 KOi 一個聯盟，不另外讀聯盟主檔
  const us = allianceId === 'koi' ? 'KOi' : allianceId.toUpperCase();

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
            {editor ? <span className="role-badge" title={t.yourRole}>{ROLE_LABELS[editor.role]}</span> : null}
          </div>
        </div>
        <h1>{t.adminTitle}</h1>
        {canEnter ? <p className="admin-intro">{editor ? t.adminIntroEditor : t.adminIntroPassword}</p> : null}
      </header>

      {state.status === 'none' && state.failure ? (
        <div className="transfer-alert" role="alert">{t.inviteFailed(t.error(state.failure.code, state.failure.detail))}</div>
      ) : null}
      {failure ? <div className="transfer-alert" role="alert">{t.error(failure.code, failure.detail)}</div> : null}

      {state.status === 'checking' ? (
        <div className="list-status">
          <div className="transfer-spinner" />
          <span>{t.checkingTitle}</span>
        </div>
      ) : !canEnter ? (
        <Gate t={t} onUnlock={() => setUnlocked(true)} />
      ) : (
        <div className="admin-page">
          {editor ? (
            <section className="admin-card">
              <header>
                <h2>{t.inviteTitle}</h2>
                <p>{t.inviteNote}</p>
              </header>
              <InviteLinks t={t} editor={editor} onSwitch={switchInvite} onFailure={onFailure} />
            </section>
          ) : null}

          <section className="admin-card">
            <header>
              <h2>{t.newSeasonTitle}</h2>
              <p>{t.newSeasonHint}</p>
            </header>
            <CreateSeason
              t={t} us={us} allianceId={allianceId}
              existingIds={seasons ? seasons.map((season) => season.id) : null}
              onCreated={() => setReloadKey((key) => key + 1)}
              onFailure={onFailure}
            />
          </section>

          <section className="admin-card">
            <header>
              <h2>{t.historyTitle}</h2>
              <p>{t.historyHint}</p>
            </header>
            <SeasonList
              t={t} lang={lang} editor={editor} seasons={seasons} onFailure={onFailure}
              onSeasons={(update) => setSeasons((current) => update(current ?? []))}
            />
          </section>
        </div>
      )}
    </main>
  );
};

export default AdminPage;
