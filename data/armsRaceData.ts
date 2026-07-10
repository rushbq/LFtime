// 軍備競賽資料 payload —— 由原 arms-race.html 內嵌 JSON 抽取為獨立模組
// 台灣時間 = 遊戲時間 + twOffsetHours 小時

export interface ArmsSlot {
  game: string;   // 遊戲時間起點，如 "00:00"
  tw: string;     // 對應台灣時間區間，如 "10:00–14:00"
  nextDay: boolean; // 台灣時間是否跨到隔日
}

/** 明細項目：[名稱, 分數] */
export type ScoreItem = [string, number];

export interface ScoreGroup {
  title: string | null;
  chips?: boolean;    // 以 chip 網格呈現（等級類）
  collapse?: boolean; // 預設收合
  summary?: string;   // 等差階梯的精簡摘要（收合時顯示，取代逐項列出）
  items: ScoreItem[];
}

/** 建議取分的單一步驟：做什麼、幾次、每次幾分（pts 可省略） */
export interface SuggestionStep {
  label: string;
  qty: number;
  pts?: number;
}

/** 建議取分：可用 steps 條列，或只放一段 note 文字說明 */
export interface Suggestion {
  steps?: SuggestionStep[];
  note?: string;
}

/** 單一資源的建議提前採集時間；系統會用「本場開始時間 − hours」推算最晚開始採集時刻 */
export interface GatherResource {
  name: string;
  hours: number;   // 建議提前幾小時開始採集（可填小數，如 12.75）
  detail?: string; // 試算依據，避免把單車採滿時間與滿箱時間混為一談
}

/** 提前開採計畫（目前用於瘋狂採集）；改設定檔即可、免後台 */
export interface GatherPlan {
  resources: GatherResource[];
  assumption?: string;
  notes?: string[];
  note?: string;
}

export interface Activity {
  name: string;
  code: string;   // 單字代號，如 "採"
  color: string;  // 主題色
  boxes: number[]; // 寶箱分數門檻
  gatherPlan?: GatherPlan; // 提前開採推算（可自由編輯）
  suggestion?: Suggestion; // 建議取分（可自由編輯，改設定檔即可、免後台）
  groups: ScoreGroup[];
}

export interface ArmsMeta {
  title: string;
  twOffsetHours: number;
  note: string;
  timezone: string;
}

export interface ArmsRaceData {
  meta: ArmsMeta;
  slots: ArmsSlot[];
  schedule: Record<number, string[]>; // dow(0-6) -> 6 個時段代號
  codeToId: Record<string, string>;
  activities: Record<string, Activity>;
}

export const armsRaceData: ArmsRaceData = {
  meta: {
    title: "軍備競賽",
    twOffsetHours: 10,
    note: "台灣時間 = 遊戲時間 + 10 小時；⁺¹ 表跨隔日",
    timezone: "Asia/Taipei",
  },
  slots: [
    { game: "00:00", tw: "10:00–14:00", nextDay: false },
    { game: "04:00", tw: "14:00–18:00", nextDay: false },
    { game: "08:00", tw: "18:00–22:00", nextDay: false },
    { game: "12:00", tw: "22:00–02:00", nextDay: true },
    { game: "16:00", tw: "02:00–06:00", nextDay: true },
    { game: "20:00", tw: "06:00–10:00", nextDay: true },
  ],
  schedule: {
    0: ["建", "研", "英", "戰", "採", "建"],
    1: ["採", "建", "研", "英", "戰", "採"],
    2: ["建", "研", "英", "戰", "採", "建"],
    3: ["研", "英", "戰", "採", "建", "研"],
    4: ["英", "戰", "採", "建", "研", "英"],
    5: ["戰", "採", "建", "研", "英", "戰"],
    6: ["採", "建", "研", "英", "戰", "採"],
  },
  codeToId: {
    採: "gather",
    建: "build",
    研: "research",
    英: "hero",
    戰: "war",
  },
  activities: {
    gather: {
      name: "瘋狂採集",
      code: "採",
      color: "#f0a020",
      boxes: [5000, 12500, 25000],
      gatherPlan: {
        // 鐵／石頭以 4 台車同採、第三箱 25,000 分試算，並將時間向上取整。
        // Z 幣的量較少，難以支撐到 10 小時以上，故不列入建議事項。
        resources: [
          { name: "鋁土 10 級", hours: 12, detail: "尚未測試有沒有計分" },
          { name: "鋁土 11 級", hours: 18, detail: "尚未測試有沒有計分" },
          { name: "鐵", hours: 13, detail: "4 台同採約 25,116 分" },
          { name: "石頭", hours: 14, detail: "4 台同採約 25,088 分" },
        ],
        assumption: "右側時間為台灣時間。",
        notes: [
          "若 4 台混採鐵／石頭，請統一以最慢的 14 小時估算。",
          "這是用一般的車隊估算，採集車會更快。",
        ],
      },
      suggestion: {
        steps: [
          { label: "擊殺變異喪屍", qty: 25, pts: 1000 },
        ],
        note: "以擊殺變異喪屍（每隻 +1000）為主力最快滿箱。",
      },
      groups: [
        {
          title: null,
          items: [
            ["採集 1 鐵", 3],
            ["採集 1 Z幣", 4],
            ["採集 1 石頭", 2],
            ["提升 1 點科技戰鬥力", 3],
            ["購買 1 鑽石", 30],
            ["領取 1 次雷達獎勵", 500],
            ["擊殺 1 個喪屍", 250],
            ["擊殺 1 個變異喪屍", 1000],
          ],
        },
      ],
    },
    build: {
      name: "避難所建設",
      code: "建",
      color: "#17b6a3",
      boxes: [3000, 7500, 15000],
      suggestion: {
        note: "以「建築隊列加速（每分鐘 +10）」為主力，搭配交易中心交易（每次 +60）湊滿箱。",
      },
      groups: [
        {
          title: null,
          items: [
            ["花費 1 鑽石", 3],
            ["提升 1 點科技戰鬥力", 3],
            ["購買 1 鑽石", 30],
            ["在建築隊列中使用 1 分鐘加速", 10],
            ["提升 1 點建築戰鬥力", 1],
            ["在交易中心進行一次交易", 60],
          ],
        },
      ],
    },
    research: {
      name: "研究科技",
      code: "研",
      color: "#4d8bff",
      boxes: [6000, 15000, 30000],
      suggestion: {
        steps: [
          { label: "集結擊殺 8 級變異喪屍", qty: 18, pts: 1600 },
          { label: "集結擊殺 3 級變異喪屍", qty: 2, pts: 1000 },
        ],
      },
      groups: [
        {
          title: "通用",
          items: [
            ["提升 1 點科技戰鬥力", 3],
            ["購買 1 鑽石", 30],
            ["在科技隊列中使用 1 分鐘加速", 10],
            ["在建築隊列中使用 1 分鐘加速", 6],
            ["在訓練隊列中使用 1 分鐘加速", 6],
          ],
        },
        {
          title: "集結擊殺 · 頭目",
          items: [
            ["集結擊殺卡婭", 900],
            ["集結擊殺比弗隆斯", 1000],
          ],
        },
        {
          title: "集結擊殺 · 變異喪屍 (1–8 級)",
          chips: true,
          items: [
            ["1 級", 800],
            ["2 級", 850],
            ["3 級", 1000],
            ["4 級", 1100],
            ["5 級", 1200],
            ["6 級", 1400],
            ["7 級", 1500],
            ["8 級", 1600],
          ],
        },
      ],
    },
    hero: {
      name: "英雄培養",
      code: "英",
      color: "#b56bff",
      boxes: [2400, 6000, 12000],
      suggestion: {
        steps: [
          { label: "戰鬥招募", qty: 30, pts: 400 },
        ],
      },
      groups: [
        {
          title: null,
          items: [
            ["提升 1 點科技戰鬥力", 3],
            ["購買 1 鑽石", 30],
            ["消耗 1 枚綠色技能勳章", 50],
            ["消耗 1 枚藍色技能勳章", 100],
            ["消耗 1 枚紫色技能勳章", 200],
            ["戰鬥招募 1 次", 400],
            ["陣營招募 1 次", 800],
            ["巔峰招募 1 次", 800],
            ["巔峰新秀招募 1 次", 800],
          ],
        },
      ],
    },
    war: {
      name: "戰前準備",
      code: "戰",
      color: "#ff5a52",
      boxes: [8000, 20000, 40000],
      suggestion: {
        steps: [
          { label: "訓練並收取 10 級士兵", qty: 7, pts: 6000 },
        ],
        note: "以最高階士兵（每隻 +6000）為主；也可搭配橙色裝備（每件 +3000）。",
      },
      groups: [
        {
          title: "通用",
          items: [
            ["花費 1 鑽石", 3],
            ["提升 1 點科技戰鬥力", 3],
            ["購買 1 鑽石", 30],
            ["在訓練隊列中使用 1 分鐘加速", 10],
          ],
        },
        {
          title: "訓練並收取士兵 (1–10 級)",
          chips: true,
          items: [
            ["1 級", 1],
            ["2 級", 5],
            ["3 級", 25],
            ["4 級", 125],
            ["5 級", 360],
            ["6 級", 540],
            ["7 級", 780],
            ["8 級", 1440],
            ["9 級", 2160],
            ["10 級", 6000],
          ],
        },
        {
          title: "生產或獲得裝備",
          items: [
            ["紫色裝備", 1500],
            ["橙色裝備", 3000],
          ],
        },
        {
          title: "擊殺喪屍 (1–35 級)",
          chips: true,
          collapse: true,
          summary: "1–35 級：150 → 490，每級 +10",
          items: [
            ["1 級", 150],
            ["2 級", 160],
            ["3 級", 170],
            ["4 級", 180],
            ["5 級", 190],
            ["6 級", 200],
            ["7 級", 210],
            ["8 級", 220],
            ["9 級", 230],
            ["10 級", 240],
            ["11 級", 250],
            ["12 級", 260],
            ["13 級", 270],
            ["14 級", 280],
            ["15 級", 290],
            ["16 級", 300],
            ["17 級", 310],
            ["18 級", 320],
            ["19 級", 330],
            ["20 級", 340],
            ["21 級", 350],
            ["22 級", 360],
            ["23 級", 370],
            ["24 級", 380],
            ["25 級", 390],
            ["26 級", 400],
            ["27 級", 410],
            ["28 級", 420],
            ["29 級", 430],
            ["30 級", 440],
            ["31 級", 450],
            ["32 級", 460],
            ["33 級", 470],
            ["34 級", 480],
            ["35 級", 490],
          ],
        },
      ],
    },
  },
};
