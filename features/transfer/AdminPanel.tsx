import React, { useState } from 'react';
import {
  createExternalMembers,
  createSeason,
  regenerateInvite,
  toTransferError,
  updateSeasonSettings,
} from '../../services/transferFirebase';
import { SeasonSettings, TransferEvent, TransferInviteSet, TransferMember, TransferRole, TransferSession } from './types';
import { Dict, TransferErrorCode } from './i18n';
import { parseBulkNames } from './allianceModel';
import { CopyIcon, hashUrl } from './ui';

const ROLE_LABELS: Record<TransferRole, string> = { r5: 'R5', r4: 'R4', adm: 'Adm' };
const ROLES: TransferRole[] = ['r5', 'r4', 'adm'];
const EVENT_ID = /^[a-z0-9-]{3,60}$/;

type Failure = { code: TransferErrorCode; detail?: string };

export const getInviteUrl = (token: string) => hashUrl(`#/transfer/${token}`);

/** 毫秒 ↔ 本機時區的 date/time 欄位值（不用 datetime-local，理由見維護指南 3.1） */
const toParts = (ms: number | null | undefined) => {
  if (ms == null) return { date: '', time: '' };
  const local = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
};
const fromParts = (date: string, time: string) => {
  if (!date) return null;
  const ms = new Date(`${date}T${time || '00:00'}`).getTime();
  return Number.isNaN(ms) ? undefined : ms;
};

/** 賽季設定表單：管理區的設定與建立新賽季共用 */
const SettingsFields: React.FC<{
  t: Dict;
  value: SettingsDraft;
  onChange: (next: SettingsDraft) => void;
}> = ({ t, value, onChange }) => {
  const set = (patch: Partial<SettingsDraft>) => onChange({ ...value, ...patch });
  return (
    <>
      <label className="admin-field">
        <span>{t.fieldTitle}</span>
        <input value={value.title} maxLength={100} onChange={(event) => set({ title: event.target.value })} />
      </label>
      <label className="admin-field">
        <span>{t.fieldTitleEn}</span>
        <input value={value.titleEn} maxLength={100} onChange={(event) => set({ titleEn: event.target.value })} />
      </label>
      <div className="admin-pair">
        <label className="admin-field">
          <span>{t.fieldExternal}</span>
          <input value={value.externalName} maxLength={40} onChange={(event) => set({ externalName: event.target.value })} />
        </label>
        <label className="admin-field narrow">
          <span>{t.fieldCapacity}</span>
          <input inputMode="numeric" value={value.capacity} onChange={(event) => set({ capacity: event.target.value })} />
        </label>
      </div>
      <div className="admin-field">
        <span>{t.fieldClosesAt}</span>
        <div className="admin-datetime">
          <input type="date" aria-label={t.fieldClosesAt} value={value.closeDate} onChange={(event) => set({ closeDate: event.target.value })} />
          <input type="time" aria-label={t.fieldClosesAt} value={value.closeTime} onChange={(event) => set({ closeTime: event.target.value })} />
          <button type="button" className="ghost-button" onClick={() => set({ closeDate: '', closeTime: '' })}>{t.clear}</button>
        </div>
        <small>{t.fieldClosesHint}</small>
      </div>
    </>
  );
};

interface SettingsDraft {
  title: string;
  titleEn: string;
  externalName: string;
  capacity: string;
  closeDate: string;
  closeTime: string;
}

const draftOf = (event: TransferEvent): SettingsDraft => {
  const { date, time } = toParts(event.closesAt);
  return {
    title: event.title,
    titleEn: event.titleEn ?? '',
    externalName: event.externalName,
    capacity: String(event.capacity),
    closeDate: date,
    closeTime: time,
  };
};

/** 驗證規則與 firestore.rules 的 validEventSettings 一致 */
const parseDraft = (draft: SettingsDraft): SeasonSettings | null => {
  const title = draft.title.trim();
  const titleEn = draft.titleEn.trim();
  const externalName = draft.externalName.trim();
  const capacity = Number(draft.capacity);
  const closesAt = fromParts(draft.closeDate, draft.closeTime);
  if (!title || title.length > 100 || titleEn.length > 100) return null;
  if (!externalName || externalName.length > 40) return null;
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 500) return null;
  if (closesAt === undefined) return null;
  return { title, ...(titleEn ? { titleEn } : {}), externalName, capacity, closesAt };
};

const AdminPanel: React.FC<{
  t: Dict;
  session: TransferSession;
  invites: TransferInviteSet;
  externals: TransferMember[];
  writable: boolean;
  /** 這個賽季是否為聯盟目前的維護賽季，是才能建立下一季 */
  isMaintainer: boolean;
  /** 本機預覽：只模擬，不寫入雲端 */
  preview: boolean;
  onInvites: (invites: TransferInviteSet) => void;
  onEvent: (event: TransferEvent) => void;
  onFailure: (failure: Failure | null) => void;
}> = ({ t, session, invites, externals, writable, isMaintainer, preview, onInvites, onEvent, onFailure }) => {
  const [settings, setSettings] = useState(() => draftOf(session.event));
  const [settingsState, setSettingsState] = useState<'idle' | 'saving' | 'saved' | 'invalid'>('idle');
  const [copied, setCopied] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<TransferRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState('');
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [season, setSeason] = useState<SettingsDraft>(() => ({
    ...draftOf(session.event), title: '', titleEn: '', externalName: '', closeDate: '', closeTime: '',
  }));
  const [eventId, setEventId] = useState('');
  const [seasonState, setSeasonState] = useState<'idle' | 'confirm' | 'invalid'>('idle');
  const [created, setCreated] = useState<{ eventId: string; invites: TransferInviteSet } | null>(null);
  const ext = session.event.externalName;

  const copy = async (key: string, text: string) => {
    // 非 HTTPS 或瀏覽器拒絕權限時寫入會失敗，不顯示「已複製」
    try { await navigator.clipboard.writeText(text); } catch { return; }
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1500);
  };

  const run = async (task: () => Promise<void>) => {
    onFailure(null);
    setBusy(true);
    try {
      await task();
      return true;
    } catch (error) {
      onFailure(toTransferError(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    const parsed = parseDraft(settings);
    if (!parsed) { setSettingsState('invalid'); return; }
    setSettingsState('saving');
    const ok = await run(async () => {
      if (!preview) await updateSeasonSettings(session.eventId, parsed);
      onEvent({ ...session.event, ...parsed, titleEn: parsed.titleEn, closesAt: parsed.closesAt ?? undefined });
    });
    setSettingsState(ok ? 'saved' : 'idle');
  };

  const regenerate = async (role: TransferRole) => {
    let next: TransferInviteSet | null = null;
    await run(async () => {
      next = preview ? { ...invites, [role]: `${role}-preview-${Date.now()}` } : await regenerateInvite(session.eventId, role, invites);
    });
    setRegenerating(null);
    if (!next) return;
    onInvites(next);
    // 換掉自己用的 Adm 連結後，這台裝置要改用新連結重新進入
    if (role === 'adm' && !preview) window.location.hash = `#/transfer/${(next as TransferInviteSet).adm}`;
  };

  const addBulk = async () => {
    const { names, skipped } = parseBulkNames(bulk, externals.map((member) => member.name));
    if (names.length === 0) { setBulkResult(t.bulkNothing(skipped)); return; }
    const start = externals.reduce((max, member) => Math.max(max, member.number), 0) + 1;
    const ok = await run(async () => {
      if (!preview) await createExternalMembers(session.eventId, session.role, names, start);
    });
    if (ok) {
      setBulk('');
      setBulkResult(t.bulkDone(names.length, skipped));
    }
  };

  const create = async () => {
    const parsed = parseDraft(season);
    const id = eventId.trim();
    if (!parsed || !EVENT_ID.test(id) || id === session.eventId) { setSeasonState('invalid'); return; }
    if (seasonState !== 'confirm') { setSeasonState('confirm'); return; }
    let result: TransferInviteSet | null = null;
    const ok = await run(async () => {
      result = preview
        ? { r5: 'preview-r5', r4: 'preview-r4', adm: 'preview-adm' }
        : await createSeason(session.event.allianceId, id, parsed);
    });
    setSeasonState('idle');
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
                <button type="button" className="ghost-button" disabled={busy} onClick={() => setRegenerating(role)}>
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

  return (
    <details className="invite-panel admin-panel">
      <summary>{t.adminTitle}</summary>

      <section className="admin-section">
        <h3>{t.inviteTitle}</h3>
        <p>{t.inviteNote}</p>
        {linkList(invites, '', true)}
      </section>

      <section className="admin-section">
        <h3>{t.settingsTitle}</h3>
        <form
          className="admin-form"
          noValidate
          onSubmit={(event) => { event.preventDefault(); void saveSettings(); }}
        >
          <SettingsFields t={t} value={settings} onChange={(next) => { setSettings(next); setSettingsState('idle'); }} />
          <div className="admin-actions">
            {settingsState === 'invalid' ? <p className="note-error" role="alert">{t.settingsInvalid}</p> : null}
            {settingsState === 'saved' ? <span className="admin-ok">{t.saved}</span> : null}
            <button type="submit" className="ghost-button primary" disabled={busy}>{t.save}</button>
          </div>
        </form>
      </section>

      <section className="admin-section">
        <h3>{t.bulkTitle(ext)}</h3>
        <p>{t.bulkHint}</p>
        {writable ? (
          <div className="admin-form">
            <textarea
              className="transfer-note admin-bulk"
              value={bulk}
              placeholder={t.bulkPlaceholder}
              aria-label={t.bulkTitle(ext)}
              onChange={(event) => { setBulk(event.target.value); setBulkResult(null); }}
            />
            <div className="admin-actions">
              {bulkResult ? <span className="admin-ok" role="status">{bulkResult}</span> : null}
              <button type="button" className="ghost-button primary" disabled={busy || !bulk.trim()} onClick={() => void addBulk()}>
                {t.bulkAdd(parseBulkNames(bulk, externals.map((member) => member.name)).names.length)}
              </button>
            </div>
          </div>
        ) : <p className="admin-muted">{t.bulkReadOnly}</p>}
      </section>

      <section className="admin-section">
        <h3>{t.newSeasonTitle}</h3>
        <p>{t.newSeasonHint}</p>
        {created ? (
          <div className="admin-form">
            <span className="admin-ok">{t.newSeasonDone(created.eventId)}</span>
            {linkList(created.invites, 'new-', false)}
            <div className="admin-actions">
              <a className="ghost-button primary" href={`#/transfer/${created.invites.adm}`}>{t.newSeasonGo}</a>
            </div>
          </div>
        ) : !isMaintainer ? (
          <p className="admin-muted">{t.newSeasonOnlyMaintainer}</p>
        ) : (
          <form className="admin-form" noValidate onSubmit={(event) => { event.preventDefault(); void create(); }}>
            <label className="admin-field">
              <span>{t.fieldEventId}</span>
              <input
                value={eventId}
                maxLength={60}
                placeholder="koi-2612"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => { setEventId(event.target.value.toLowerCase()); setSeasonState('idle'); }}
              />
              <small>{t.fieldEventIdHint}</small>
            </label>
            <SettingsFields t={t} value={season} onChange={(next) => { setSeason(next); setSeasonState('idle'); }} />
            {seasonState === 'confirm' ? (
              <div className="row-confirm" role="alertdialog" aria-label={t.newSeasonConfirm}>
                <strong>{t.newSeasonConfirm}</strong>
                <span>{t.newSeasonConfirmNote(session.eventId, eventId.trim())}</span>
                <div className="row-confirm-actions">
                  <button type="button" className="ghost-button" onClick={() => setSeasonState('idle')}>{t.cancel}</button>
                  <button type="submit" className="ghost-button danger" disabled={busy}>{t.newSeasonCreate}</button>
                </div>
              </div>
            ) : (
              <div className="admin-actions">
                {seasonState === 'invalid' ? <p className="note-error" role="alert">{t.newSeasonInvalid}</p> : null}
                <button type="submit" className="ghost-button primary" disabled={busy}>{t.newSeasonCreate}</button>
              </div>
            )}
          </form>
        )}
      </section>
    </details>
  );
};

export default AdminPanel;
