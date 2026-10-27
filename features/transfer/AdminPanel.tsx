import React, { useEffect, useState } from 'react';
import {
  createExternalMembers,
  createSeason,
  deleteSeason,
  listSeasons,
  regenerateInvite,
  toTransferError,
  updateSeasonSettings,
} from '../../services/transferFirebase';
import { SeasonSettings, SeasonSummary, TransferEvent, TransferInviteSet, TransferMember, TransferRole, TransferSession } from './types';
import { Dict, TransferErrorCode } from './i18n';
import { parseBulkNames } from './allianceModel';
import { CopyIcon, hashUrl } from './ui';

const ROLE_LABELS: Record<TransferRole, string> = { r5: 'R5', r4: 'R4', adm: 'Adm' };
const ROLES: TransferRole[] = ['r5', 'r4', 'adm'];
const EVENT_ID = /^[a-z0-9-]{3,60}$/;
const CLOSE_PRESETS = [3, 7, 14];
/** 選了日期沒選時間時預設的結束時刻（轉移通常在晚上收尾） */
const DEFAULT_CLOSE_TIME = '22:00';

type Failure = { code: TransferErrorCode; detail?: string };

export const getInviteUrl = (token: string) => hashUrl(`#/transfer/${token}`);

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

/* ---------------- 共用欄位 ---------------- */

const Field: React.FC<{ label: string; hint?: string; error?: string; children: React.ReactNode }> = ({ label, hint, error, children }) => (
  <label className={`admin-field${error ? ' has-error' : ''}`}>
    <span className="admin-label">{label}</span>
    {children}
    {error ? <small className="admin-error" role="alert">{error}</small> : hint ? <small>{hint}</small> : null}
  </label>
);

/** 賽季設定欄位：目前賽季設定與建立新賽季共用 */
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

/* ---------------- 賽季列表 ---------------- */

const SeasonHistory: React.FC<{
  t: Dict;
  allianceId: string;
  currentId: string;
  preview: boolean;
  onFailure: (failure: Failure | null) => void;
}> = ({ t, allianceId, currentId, preview, onFailure }) => {
  const [seasons, setSeasons] = useState<SeasonSummary[] | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const load = preview
      ? Promise.resolve<SeasonSummary[]>([
        { id: currentId, title: 'KOi × BDK 賽季轉移', capacity: 90, active: true, allianceId, externalName: 'BDK', createdAt: Date.now() },
        { id: 'koi-old-2607', title: 'KOi × OLD 賽季轉移', capacity: 90, active: true, closesAt: Date.now() - 86_400_000 * 60, allianceId, externalName: 'OLD', createdAt: Date.now() - 86_400_000 * 90 },
      ])
      : listSeasons(allianceId);
    load
      .then((items) => { if (!disposed) setSeasons(items); })
      .catch((error) => { if (!disposed) { setSeasons([]); onFailure(toTransferError(error)); } });
    return () => { disposed = true; };
  }, [allianceId, currentId, preview, onFailure]);

  const remove = async (eventId: string) => {
    onFailure(null);
    setBusy(true);
    try {
      if (!preview) await deleteSeason(eventId);
      setSeasons((current) => current?.filter((season) => season.id !== eventId) ?? null);
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

  if (!seasons) return <p className="admin-muted">{t.listLoading}</p>;
  return (
    <div className="season-list">
      {deleted ? <span className="admin-status ok" role="status">{t.historyDeleted(deleted)}</span> : null}
      {seasons.map((season) => (
        <div className="season-row" key={season.id}>
          <div className="season-main">
            <strong>{season.title}</strong>
            <span className="season-meta">
              <code>{season.id}</code>
              <span>{season.externalName}</span>
              <span>{status(season)}</span>
            </span>
          </div>
          {season.id === currentId ? (
            <span className="season-current">{t.historyCurrent}</span>
          ) : (
            <button
              type="button" className="ghost-button danger" disabled={busy}
              onClick={() => { setDeleting(season.id); setTyped(''); setDeleted(null); }}
            >
              {t.historyDelete}
            </button>
          )}
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

/* ---------------- 管理頁 ---------------- */

/** 預填下個月的代碼；與目前賽季相同時再往後一個月 */
const nextSeasonId = (allianceId: string, currentId: string) => {
  const at = new Date();
  at.setDate(1);
  let id = currentId;
  while (id === currentId) {
    at.setMonth(at.getMonth() + 1);
    id = `${allianceId}-${String(at.getFullYear()).slice(2)}${pad(at.getMonth() + 1)}`;
  }
  return id;
};

const AdminPanel: React.FC<{
  t: Dict;
  us: string;
  session: TransferSession;
  invites: TransferInviteSet | null;
  externals: TransferMember[];
  writable: boolean;
  /** 這個賽季是否為聯盟目前的維護賽季，是才能建立下一季 */
  isMaintainer: boolean;
  /** 本機預覽：只模擬，不寫入雲端 */
  preview: boolean;
  onInvites: (invites: TransferInviteSet) => void;
  onEvent: (event: TransferEvent) => void;
  onFailure: (failure: Failure | null) => void;
}> = ({ t, us, session, invites, externals, writable, isMaintainer, preview, onInvites, onEvent, onFailure }) => {
  const saved = draftOf(session.event);
  const [settings, setSettings] = useState(saved);
  const [settingsErrors, setSettingsErrors] = useState<DraftErrors>({});
  const [justSaved, setJustSaved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<TransferRole | null>(null);
  const [busy, setBusy] = useState<'settings' | 'invite' | 'bulk' | 'season' | null>(null);
  const [bulk, setBulk] = useState('');
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [season, setSeason] = useState<SettingsDraft>(() => ({
    title: '', titleEn: '', externalName: '', closeDate: '', closeTime: '',
  }));
  // 標題預設跟著對方聯盟名稱自動產生，手動改過就不再覆蓋
  const [titleTouched, setTitleTouched] = useState(false);
  const [seasonErrors, setSeasonErrors] = useState<DraftErrors & { eventId?: string }>({});
  const [eventId, setEventId] = useState(() => nextSeasonId(session.event.allianceId, session.eventId));
  const [confirming, setConfirming] = useState(false);
  const [created, setCreated] = useState<{ eventId: string; invites: TransferInviteSet } | null>(null);
  const dirty = !sameDraft(settings, saved);
  const bulkParsed = parseBulkNames(bulk, externals.map((member) => member.name));

  const copy = async (key: string, text: string) => {
    // 非 HTTPS 或瀏覽器拒絕權限時寫入會失敗，不顯示「已複製」
    try { await navigator.clipboard.writeText(text); } catch { return; }
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1500);
  };

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
    const { value, errors } = validateDraft(settings, t);
    setSettingsErrors(errors);
    if (!value) return;
    const ok = await run('settings', async () => {
      if (!preview) await updateSeasonSettings(session.eventId, value);
      onEvent({ ...session.event, ...value, titleEn: value.titleEn, closesAt: value.closesAt ?? undefined });
    });
    if (ok) {
      // 存檔後以正規化後的值為準（例如去掉前後空白）
      setSettings(draftOf({ ...session.event, ...value, titleEn: value.titleEn, closesAt: value.closesAt ?? undefined }));
      setJustSaved(true);
    }
  };

  const regenerate = async (role: TransferRole) => {
    if (!invites) return;
    let next: TransferInviteSet | null = null;
    await run('invite', async () => {
      next = preview ? { ...invites, [role]: `${role}-preview-${Date.now()}` } : await regenerateInvite(session.eventId, role, invites);
    });
    setRegenerating(null);
    if (!next) return;
    onInvites(next);
    // 換掉自己用的 Adm 連結後，這台裝置要改用新連結重新進入
    if (role === 'adm' && !preview) window.location.hash = `#/transfer/${(next as TransferInviteSet).adm}/admin`;
  };

  const addBulk = async () => {
    const { names, skipped } = bulkParsed;
    if (names.length === 0) return;
    const start = externals.reduce((max, member) => Math.max(max, member.number), 0) + 1;
    const ok = await run('bulk', async () => {
      if (!preview) await createExternalMembers(session.eventId, session.role, names, start);
    });
    if (ok) {
      setBulk('');
      setBulkResult(t.bulkDone(names.length, skipped));
    }
  };

  const changeSeason = (patch: Partial<SettingsDraft>) => {
    setConfirming(false);
    setSeasonErrors({});
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
    const { value, errors } = validateDraft(season, t);
    const id = eventId.trim();
    const idError = !EVENT_ID.test(id) ? t.errEventId : id === session.eventId ? t.errEventIdSame : undefined;
    setSeasonErrors({ ...errors, ...(idError ? { eventId: idError } : {}) });
    if (!value || idError) return;
    if (!confirming) { setConfirming(true); return; }
    let result: TransferInviteSet | null = null;
    const ok = await run('season', async () => {
      result = preview
        ? { r5: 'preview-r5', r4: 'preview-r4', adm: 'preview-adm' }
        : await createSeason(session.event.allianceId, id, value);
    });
    setConfirming(false);
    if (ok && result) setCreated({ eventId: id, invites: result });
  };

  const linkList = (set: TransferInviteSet, prefix: string, withRegenerate: boolean) => (
    <div className="invite-links">
      {ROLES.map((role) => (
        <div className="invite-link-block" key={role}>
          <div className="invite-link">
            <span className="role-badge">{ROLE_LABELS[role]}</span>
            <code>{getInviteUrl(set[role])}</code>
            <span className="invite-link-actions">
              <button type="button" className="ghost-button" onClick={() => void copy(`${prefix}${role}`, getInviteUrl(set[role]))}>
                <CopyIcon /> {copied === `${prefix}${role}` ? t.copied : t.copy}
              </button>
              {withRegenerate ? (
                <button type="button" className="ghost-button" disabled={busy !== null} onClick={() => setRegenerating(role)}>
                  {t.inviteRegenerate}
                </button>
              ) : null}
            </span>
          </div>
          {regenerating === role ? (
            <div className="row-confirm" role="alertdialog" aria-label={t.inviteRegenerateConfirm(ROLE_LABELS[role])}>
              <strong>{t.inviteRegenerateConfirm(ROLE_LABELS[role])}</strong>
              <span>{role === 'adm' ? t.inviteRegenerateSelf : t.inviteRegenerateNote}</span>
              <div className="row-confirm-actions">
                <button type="button" className="ghost-button" onClick={() => setRegenerating(null)}>{t.cancel}</button>
                <button type="button" className="ghost-button danger" disabled={busy !== null} onClick={() => void regenerate(role)}>
                  {t.inviteRegenerateYes}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );

  return (
    <div className="admin-page">
      <section className="admin-card">
        <header>
          <h2>{t.settingsTitle}</h2>
          <p>{t.settingsHint(session.eventId)}</p>
        </header>
        <form className="admin-form" noValidate onSubmit={(event) => { event.preventDefault(); void saveSettings(); }}>
          <SettingsFields
            t={t} value={settings} errors={settingsErrors}
            onChange={(patch) => { setSettings((current) => ({ ...current, ...patch })); setSettingsErrors({}); setJustSaved(false); }}
          />
          <div className="admin-actions">
            <span className={`admin-status${dirty ? ' dirty' : justSaved ? ' ok' : ''}`} role="status">
              {dirty ? t.dirty : justSaved ? t.saved : t.noChange}
            </span>
            <button type="button" className="ghost-button" disabled={!dirty || busy !== null} onClick={() => { setSettings(saved); setSettingsErrors({}); }}>
              {t.reset}
            </button>
            <button type="submit" className="ghost-button primary" disabled={!dirty || busy !== null}>
              {busy === 'settings' ? t.savingNow : t.save}
            </button>
          </div>
        </form>
      </section>

      <section className="admin-card">
        <header>
          <h2>{t.bulkTitle(session.event.externalName)}</h2>
          <p>{t.bulkHint}</p>
        </header>
        {writable ? (
          <div className="admin-form">
            <textarea
              className="transfer-note admin-bulk"
              value={bulk}
              placeholder={t.bulkPlaceholder}
              aria-label={t.bulkTitle(session.event.externalName)}
              onChange={(event) => { setBulk(event.target.value); setBulkResult(null); }}
            />
            <div className="admin-actions">
              <span className={`admin-status${bulkResult ? ' ok' : ''}`} role="status">
                {bulkResult ?? (bulk.trim() ? t.bulkPreview(bulkParsed.names.length, bulkParsed.skipped) : t.bulkCurrent(externals.length))}
              </span>
              <button
                type="button" className="ghost-button primary"
                disabled={busy !== null || bulkParsed.names.length === 0}
                onClick={() => void addBulk()}
              >
                {busy === 'bulk' ? t.savingNow : t.bulkAdd(bulkParsed.names.length)}
              </button>
            </div>
          </div>
        ) : <p className="admin-muted">{t.bulkReadOnly}</p>}
      </section>

      <section className="admin-card">
        <header>
          <h2>{t.inviteTitle}</h2>
          <p>{t.inviteNote}</p>
        </header>
        {invites ? linkList(invites, '', true) : <p className="admin-muted">{t.listLoading}</p>}
      </section>

      <section className="admin-card">
        <header>
          <h2>{t.newSeasonTitle}</h2>
          <p>{t.newSeasonHint}</p>
        </header>
        {created ? (
          <div className="admin-form">
            <span className="admin-status ok">{t.newSeasonDone(created.eventId)}</span>
            {linkList(created.invites, 'new-', false)}
            <div className="admin-actions">
              <a className="ghost-button primary" href={`#/transfer/${created.invites.adm}/admin`}>{t.newSeasonGo}</a>
            </div>
          </div>
        ) : !isMaintainer ? (
          <p className="admin-muted">{t.newSeasonOnlyMaintainer}</p>
        ) : (
          <form className="admin-form" noValidate onSubmit={(event) => { event.preventDefault(); void create(); }}>
            <Field label={t.fieldEventId} hint={t.fieldEventIdHint} error={seasonErrors.eventId}>
              <input
                value={eventId}
                maxLength={60}
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => { setEventId(event.target.value.toLowerCase()); setConfirming(false); setSeasonErrors({}); }}
              />
            </Field>
            <SettingsFields t={t} value={season} errors={seasonErrors} onChange={changeSeason} />
            {confirming ? (
              <div className="row-confirm" role="alertdialog" aria-label={t.newSeasonConfirm}>
                <strong>{t.newSeasonConfirm}</strong>
                <span>{t.newSeasonConfirmNote(session.eventId, eventId.trim())}</span>
                <div className="row-confirm-actions">
                  <button type="button" className="ghost-button" onClick={() => setConfirming(false)}>{t.cancel}</button>
                  <button type="submit" className="ghost-button danger" disabled={busy !== null}>
                    {busy === 'season' ? t.savingNow : t.newSeasonCreate}
                  </button>
                </div>
              </div>
            ) : (
              <div className="admin-actions">
                {Object.keys(seasonErrors).length > 0 ? <span className="admin-status error">{t.fixErrors}</span> : null}
                <button type="submit" className="ghost-button primary" disabled={busy !== null}>{t.newSeasonCreate}</button>
              </div>
            )}
          </form>
        )}
      </section>

      {isMaintainer ? (
        <section className="admin-card">
          <header>
            <h2>{t.historyTitle}</h2>
            <p>{t.historyHint}</p>
          </header>
          <SeasonHistory t={t} allianceId={session.event.allianceId} currentId={session.eventId} preview={preview} onFailure={onFailure} />
        </section>
      ) : null}
    </div>
  );
};

export default AdminPanel;
