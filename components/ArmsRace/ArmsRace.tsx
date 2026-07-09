import React, { useEffect, useMemo, useRef, useState } from 'react';
import './armsRace.css';
import { armsRaceData, Activity, ScoreGroup } from '../../data/armsRaceData';

const { meta, slots: SLOTS, schedule, codeToId: CODE2ID, activities: ACT } = armsRaceData;
const OFF = meta.twOffsetHours;

const dayFull = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const dayShort = ['日', '一', '二', '三', '四', '五', '六'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 週一 → 週日
const SLOT_COUNT = SLOTS.length;

const pad = (n: number) => String(n).padStart(2, '0');
const hms = (H: number, M: number, S: number) => `${pad(H)}:${pad(M)}:${pad(S)}`;
const fmt = (n: number) => n.toLocaleString();

interface GameNow {
  dow: number; h: number; m: number; s: number;
  twH: number; twM: number; twS: number;
}

/** 依 timezone 換算目前的「遊戲時間」與「台灣時間」 */
function computeGameNow(): GameNow {
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: meta.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
  let h = +p.hour; if (h === 24) h = 0;
  const tw = Date.UTC(+p.year, +p.month - 1, +p.day, h, +p.minute, +p.second);
  const g = new Date(tw - OFF * 3600 * 1000);
  return {
    dow: g.getUTCDay(), h: g.getUTCHours(), m: g.getUTCMinutes(), s: g.getUTCSeconds(),
    twH: h, twM: +p.minute, twS: +p.second,
  };
}

/** 每秒更新的遊戲時鐘 */
function useGameNow(): GameNow {
  const [now, setNow] = useState<GameNow>(computeGameNow);
  useEffect(() => {
    const id = setInterval(() => setNow(computeGameNow()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/* ---------- 明細（寶箱門檻 + 各分數群組） ---------- */

const ScoreGroupView: React.FC<{ group: ScoreGroup; gmax: number }> = ({ group, gmax }) => {
  const [collapsed, setCollapsed] = useState<boolean>(!!group.collapse);
  return (
    <div className="grp">
      {group.title && (
        <div className="grp-t">
          {group.title}
          {group.collapse && (
            <span
              className="toggle"
              onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c); }}
            >
              {collapsed ? `展開 ${group.items.length}` : '收合'}
            </span>
          )}
        </div>
      )}
      {collapsed && group.summary && <div className="grp-summary">{group.summary}</div>}
      {group.chips ? (
        <div className={'chips' + (collapsed ? ' collapsed' : '')}>
          {group.items.map(([n, pts], i) => (
            <div key={i} className={'chip' + (pts === gmax ? ' top' : '')}>
              <span className="l">{n}</span>
              <span className="v">{fmt(pts)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rows">
          {group.items.map(([n, pts], i) => (
            <div key={i} className={'row' + (pts === gmax ? ' top' : '')}>
              <span className="n">{n}</span>
              <span className="v">+{fmt(pts)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ScoreDetail: React.FC<{ activity: Activity }> = ({ activity }) => {
  const gmax = useMemo(
    () => Math.max(...activity.groups.flatMap((g) => g.items.map((i) => i[1]))),
    [activity]
  );
  return (
    <>
      <div className="box">
        {activity.boxes.map((pts, i) => (
          <div className="b" key={i}>
            <div className="d">寶箱 {i + 1}</div>
            <div className="p">{fmt(pts)}</div>
          </div>
        ))}
      </div>
      {activity.groups.map((g, gi) => (
        <ScoreGroupView key={gi} group={g} gmax={gmax} />
      ))}
    </>
  );
};

/* ---------- 上方作戰面板（現在進行 / 接著登場） ---------- */

const OpsCell: React.FC<{
  tag: string; activity: Activity; sub: string; next?: boolean;
  countdown?: string;
}> = ({ tag, activity, sub, next, countdown }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={'ops-cell' + (next ? ' next' : '')}>
      <div className="ops-tag">{tag}</div>
      <div
        className={'ops-act' + (open ? ' open' : '')}
        onClick={() => setOpen((o) => !o)}
      >
        <div className="badge" style={{ background: activity.color }}>{activity.code}</div>
        <div style={{ minWidth: 0 }}>
          <div className="ops-name" style={{ color: activity.color }}>{activity.name}</div>
          <div className="ops-sub">{sub}</div>
        </div>
        <div className="chev">▶</div>
      </div>
      {countdown && (
        <div className="ops-count">
          <div className="t">{countdown}</div>
          <div className="l">後切換</div>
        </div>
      )}
      <div className={'ops-detail' + (open ? ' show' : '')}>
        <ScoreDetail activity={activity} />
      </div>
    </div>
  );
};

/* ---------- 單一時段卡片 ---------- */

const SlotCard: React.FC<{
  slotIndex: number; activity: Activity; isNow: boolean;
  open: boolean; onToggle: () => void;
  cardRef: (el: HTMLDivElement | null) => void;
}> = ({ slotIndex, activity, isNow, open, onToggle, cardRef }) => {
  const s = SLOTS[slotIndex];
  return (
    <div className={'slot' + (isNow ? ' now' : '')} style={{ borderLeftColor: activity.color }} ref={cardRef}>
      <div className={'slot-hd' + (open ? ' open' : '')} onClick={onToggle}>
        <div className="slot-time">
          <div className="g">{s.game}</div>
          <div className={'tw' + (s.nextDay ? ' nx' : '')}>台 {s.tw}</div>
        </div>
        <div className="slot-mid">
          <span
            className="badge"
            style={{ width: 24, height: 24, fontSize: 12, borderRadius: 7, background: activity.color }}
          >{activity.code}</span>
          <span className="slot-name">{activity.name}</span>
          {isNow && <span className="now-pill">進行中</span>}
        </div>
        <span className="chev">▶</span>
      </div>
      <div className={'slot-detail' + (open ? ' show' : '')}>
        <ScoreDetail activity={activity} />
      </div>
    </div>
  );
};

/* ---------- 主元件 ---------- */

const ArmsRace: React.FC = () => {
  const now = useGameNow();
  const slot = Math.floor(now.h / 4);

  const [userPicked, setUserPicked] = useState(false);
  const [pickedDow, setPickedDow] = useState<number>(now.dow);
  const viewDow = userPicked ? pickedDow : now.dow;
  const isViewToday = viewDow === now.dow;

  // 時間軸展開狀態（提升到此，供「本週總覽」點格跳轉共用）
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([Math.floor(now.h / 4)]));
  const [focusToken, setFocusToken] = useState<{ slot: number; nonce: number } | null>(null);
  const slotRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // focus token 變動後，捲動到對應時段
  useEffect(() => {
    if (!focusToken) return;
    slotRefs.current[focusToken.slot]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusToken]);

  const selectDay = (d: number) => {
    setUserPicked(true);
    setPickedDow(d);
    setExpanded(d === now.dow ? new Set([Math.floor(now.h / 4)]) : new Set());
  };

  // 本週總覽點格 → 切到該日、展開該時段並捲入視野
  const jumpToSlot = (d: number, sIdx: number) => {
    setUserPicked(true);
    setPickedDow(d);
    setExpanded(new Set([sIdx]));
    setFocusToken({ slot: sIdx, nonce: Date.now() });
  };

  const toggleSlot = (i: number) =>
    setExpanded((prev) => {
      const nx = new Set(prev);
      if (nx.has(i)) nx.delete(i); else nx.add(i);
      return nx;
    });

  const allOpen = expanded.size >= SLOT_COUNT;
  const expandAll = () =>
    setExpanded(allOpen ? new Set() : new Set(Array.from({ length: SLOT_COUNT }, (_, i) => i)));

  // 現在進行
  const curId = CODE2ID[schedule[now.dow][slot]];
  const cur = ACT[curId];
  const rem = (slot + 1) * 4 * 3600 - (now.h * 3600 + now.m * 60 + now.s);
  const countdown = hms(Math.floor(rem / 3600), Math.floor((rem % 3600) / 60), rem % 60);

  // 接著登場
  const nslot = (slot + 1) % SLOT_COUNT;
  const ndow = slot === SLOT_COUNT - 1 ? (now.dow + 1) % 7 : now.dow;
  const nextId = CODE2ID[schedule[ndow][nslot]];
  const nx = ACT[nextId];
  const nextSub =
    (slot === SLOT_COUNT - 1 ? dayShort[ndow] + ' ' : '') +
    '台灣 ' + SLOTS[nslot].tw.split('–')[0] + (SLOTS[nslot].nextDay ? ' ⁺¹' : '') + ' 開始';

  return (
    <div className="arms-root">
      <header>
        <div className="brand"><b>軍備競賽</b><span>arms race ops</span></div>
        <div className="clock">
          遊戲 <b className="mono">{dayShort[now.dow]} {hms(now.h, now.m, now.s)}</b>
          {'　·　'}台灣 <b className="mono">{hms(now.twH, now.twM, now.twS)}</b>
        </div>
        <div className="ops">
          <div className="ops-row">
            <OpsCell
              tag="現在進行"
              activity={cur}
              sub={'台灣 ' + SLOTS[slot].tw + (SLOTS[slot].nextDay ? ' ⁺¹' : '')}
              countdown={countdown}
            />
          </div>
          <div className="ops-row" style={{ marginTop: 1 }}>
            <OpsCell tag="接著登場" activity={nx} sub={nextSub} next />
          </div>
        </div>
      </header>

      <section>
        <div className="sec-head">
          <span className="k">01</span><h2>選一天</h2><div className="rule" /><span className="hint">點日期看整日</span>
        </div>
        <div className="days">
          {WEEK_ORDER.map((d) => (
            <div
              key={d}
              className={'day' + (d === now.dow ? ' today' : '') + (d === viewDow ? ' sel' : '')}
              onClick={() => selectDay(d)}
            >
              <div className="d">{dayShort[d]}</div>
            </div>
          ))}
        </div>

        <div className="tl-top">
          <div className="lbl">
            {dayFull[viewDow]}
            <small>{(isViewToday ? '今天' : '遊戲日')} · {SLOT_COUNT} 時段</small>
          </div>
          <button className="expand-all" onClick={expandAll}>
            {allOpen ? '全部收合' : '全部展開'}
          </button>
        </div>
        <div>
          {schedule[viewDow].map((code, sIdx) => (
            <SlotCard
              key={sIdx}
              slotIndex={sIdx}
              activity={ACT[CODE2ID[code]]}
              isNow={isViewToday && sIdx === slot}
              open={expanded.has(sIdx)}
              onToggle={() => toggleSlot(sIdx)}
              cardRef={(el) => { slotRefs.current[sIdx] = el; }}
            />
          ))}
        </div>
      </section>

      <section>
        <div className="sec-head">
          <span className="k">02</span><h2>本週總覽</h2><div className="rule" /><span className="hint">遊戲時間 · 點格跳當日時段</span>
        </div>
        <div className="grid-wrap">
          <table>
            <thead>
              <tr>
                <th>遊戲<span className="tw">台灣</span></th>
                {WEEK_ORDER.map((d) => <th key={d}>{dayShort[d]}</th>)}
              </tr>
            </thead>
            <tbody>
              {SLOTS.map((s, sIdx) => (
                <tr key={sIdx}>
                  <td className="gt">
                    {s.game}
                    <span className="tw" style={{ display: 'block', fontSize: 9 }}>
                      {s.tw.split('–')[0]}{s.nextDay ? '⁺¹' : ''}
                    </span>
                  </td>
                  {WEEK_ORDER.map((d) => {
                    const a = ACT[CODE2ID[schedule[d][sIdx]]];
                    const isNow = d === now.dow && sIdx === slot;
                    return (
                      <td
                        key={d}
                        className={'cell' + (isNow ? ' now' : '')}
                        style={{ background: a.color }}
                        onClick={() => jumpToSlot(d, sIdx)}
                      >{a.code}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer>{meta.note}</footer>
    </div>
  );
};

export default ArmsRace;
