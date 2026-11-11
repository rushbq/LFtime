# 轉移名單 Firebase 設定

賽季轉移與聯盟名單使用 Firebase Anonymous Authentication 與 Cloud Firestore。

- **查看**：任何人都能看賽季列表、各賽季我方的踢除／候補名單與聯盟名單，不需要連結。
- **編輯**：聯盟有兩條編輯邀請連結（呆萌小星、聰明的史努比，權限相同），點過一次後這台裝置可編輯所有賽季。

## 1. 建立 Firebase 專案

1. 在 Firebase Console 建立專案與 Web App。
2. Authentication 的 Sign-in method 啟用 Anonymous。
3. 建立 Cloud Firestore，建議區域使用 `asia-east1`。
4. 將 Web App 設定填入專案根目錄的 `.env`（已納入版控，多台電腦 `git pull` 即同步）。
   這些是前端公開設定，build 後本來就會出現在 JS 裡，不是秘密；存取權限由 `firestore.rules` 控管。
   建議在 Google Cloud Console 將此 API Key 限制 HTTP referrer 為 `rushbq.github.io/*` 與 `localhost:*`。
   需要暫時改連其他專案時，建立 `.env.local` 覆寫（不進版控，優先權高於 `.env`）。

## 2. 資料結構

| 路徑 | 內容 | 讀取 | 寫入 |
|---|---|---|---|
| `alliances/{聯盟}` | 聯盟名稱 | 公開 | 只能用腳本 |
| `alliances/{聯盟}/members/*` | 聯盟主檔（名稱、戰力、階級） | 公開 | 編輯者 |
| `alliances/{聯盟}/editors/{uid}` | 這台裝置的編輯身分（邀請碼、身分） | 本人 | 本人，需有效邀請 |
| `alliances/{聯盟}/admin/invites` | 兩條編輯邀請碼 | 編輯者 | 編輯者換新 |
| `allianceInvites/{邀請碼}` | 邀請所屬聯盟、身分、是否有效 | 匿名登入者精確讀取 | 編輯者換新 |
| `transferEvents/{賽季}` | 賽季設定 | 公開 | 建立：匿名登入；修改、刪除：編輯者 |
| `transferEvents/{賽季}/members/*` | 踢除、候補、已離開、已加入、備註；外部轉入名單 | 公開 | 編輯者，賽季未結束 |

查看模式只在前端隱藏備註與離開／加入狀態，資料本身公開可讀（已確認可接受）。

## 3. 編輯邀請連結

第一次切換到新權限模型，或連結外洩需要全部換新時：

```powershell
npx firebase-tools login
npm run setup:invites                                     # 預覽
npm run setup:invites -- --apply --cleanup-legacy         # 建立兩條邀請，並清除舊版每季邀請資料
npm run setup:invites -- --apply --renew                  # 兩條都換新，舊連結立即失效
```

- 印出的兩條連結格式為 `https://rushbq.github.io/LFtime/#/transfer/join/<邀請碼>`，分別傳給對應的人。邀請碼就是編輯權限，不要公開貼出。
- `--cleanup-legacy` 會刪除舊版 `transferInvites`、各賽季的 `participants`、`admin`，以及聯盟文件的 `maintainerEventId`；賽季紀錄與聯盟主檔不受影響。
- 平常只換其中一條時，用賽季管理頁的「換新」即可。

## 4. 建立新賽季

一般情況用網頁：賽季管理頁 `#/transfer/admin`「建立新賽季」，再到賽季列表展開「設定」貼上對方名單。以下腳本保留給需要從 Excel 匯入時使用，名額固定 90，`--capacity` 可省略。

```powershell
npm run prepare:transfer -- "D:/Download/XYZ namelist.xlsx" --event-id=koi-xyz-2612 --title="KOi × XYZ 賽季轉移" --external-name=XYZ
npm run seed:transfer
```

外部名單 Excel 為 A 欄序號、B 欄名稱；我方成員即時讀取聯盟主檔，不需要匯入。賽季已存在時腳本會停止，不覆蓋雲端資料。

### 結束賽季（自動唯讀）

平常在賽季管理頁的賽季「設定」調整即可。腳本方式：

```powershell
npm run close:transfer -- --event-id=koi-xyz-2612 --at="2026-12-20T22:00+08:00"
npm run close:transfer -- --event-id=koi-xyz-2612 --at=now   # 立即結束
```

超過結束時間後名單仍可查看，但勾選、備註、外部名單新增都會停止（前端隱藏、Rules 同步擋寫入）。頁面開著時到點也會自動切換。

## 5. 部署 Security Rules

```powershell
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools deploy --only firestore:rules
```

## 6. 驗證與發布

```powershell
npm test            # 排序、驗證、賽季合併
npm run test:rules  # Rules 測試，需 Java 11+（Firestore Emulator）
```

本機整合驗證可用 Emulator，不碰正式資料：`npm run emulator` → `npm run seed:emulator` → `npm run dev:emulator`。

**發布順序**（新舊權限模型不相容，三步要連著做）：

1. `npm run setup:invites -- --apply --cleanup-legacy`：先建立新邀請（舊 Rules 不會讀這些資料，不影響現有使用者）。
2. 部署 Rules：舊版每季邀請連結從這一刻起失效，查看改為公開。
3. `npm run deploy` 發布前端，把兩條新連結傳給對應的人。
