# 轉移名單 Firebase 設定

轉移名單頁面使用 Firebase Anonymous Authentication 與 Cloud Firestore。三種身分各有一條不可猜測的邀請連結，點入後直接開啟同一個活動。

## 1. 建立 Firebase 專案

1. 在 Firebase Console 建立專案與 Web App。
2. Authentication 的 Sign-in method 啟用 Anonymous。
3. 建立 Cloud Firestore，建議區域使用 `asia-east1`。
4. 將 `.env.example` 複製為 `.env.local`，填入 Web App 設定。

## 2. 聯盟名單（一次性移轉）

我方成員改存在 `alliances/koi/members`，任何人都能在 `#/alliance` 查看；各賽季只保存自己的踢除、候補、已離開、已加入與備註。

```powershell
npx firebase-tools login
npm run migrate:alliance            # 預覽：寫本機備份到 .transfer-backup/ 並印出摘要
npm run migrate:alliance -- --apply # 確認摘要後實際寫入
```

- 完整複製 `koi-bdk-2609` 的 KOi 清單並沿用 ID；R1～R3 轉為一般成員，不帶入私人備註或轉移狀態。
- 聯盟文件的 `maintainerEventId` 決定哪個賽季的 Adm／R5 可以維護名單，只由腳本修改。
- 賽季只補缺少的 `allianceId`、`externalName`，不重建邀請碼、不改既有判斷與備註。
- 重跑安全：聯盟文件已存在就不再寫入主檔。

## 3. 建立新賽季

```powershell
npm run prepare:transfer -- "D:/Download/XYZ namelist.xlsx" --event-id=koi-xyz-2612 --title="KOi × XYZ 賽季轉移" --external-name=XYZ --capacity=90
npm run seed:transfer -- --set-maintainer
```

外部名單 Excel 為 A 欄序號、B 欄名稱；我方成員即時讀取聯盟主檔，不需要匯入。產生的 `.transfer-seed.local.json` 含邀請碼，已加入 `.gitignore`，不可提交或公開傳送。建立時若活動已存在會停止；`--set-maintainer` 才會把聯盟維護權限移到新賽季。

## 4. 部署 Security Rules

安裝並登入 Firebase CLI 後：

```powershell
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools deploy --only firestore:rules
```

Rules 會限制：

- 邀請碼只能精確讀取，不能列出全部邀請。
- 匿名使用者必須以有效邀請建立自己的活動身分。
- R5、R4、Adm 都可修改狀態與備註；Adm 可額外讀取三條邀請連結。
- 聯盟名單公開讀取；新增、修改、刪除限維護賽季中持有效邀請的 Adm／R5，並檢查欄位與版本。
- R4 可為聯盟新成員建立本季紀錄，但不能修改聯盟主檔。
- 停用邀請後，使用該邀請建立的既有匿名身分也會立即失去權限。

## 5. 驗證與發布

```powershell
npm test            # 排序、驗證、賽季合併
npm run test:rules  # Rules 測試，需 Java 11+（Firestore Emulator）
```

發布順序：先 `migrate:alliance -- --apply`，再部署 Rules，最後發布前端（舊前端不讀聯盟主檔，新前端需要主檔存在）。

```powershell
npm run build
npm run dev
```

分別以不同瀏覽器或無痕視窗開啟 R5、R4、Adm 連結，確認：

1. 三條連結都直接進入轉移頁，並顯示正確身分。
2. 任一視窗勾選或填寫備註後，其他視窗即時更新。
3. R5、R4 看不到管理邀請連結區塊；Adm 可以複製三條連結。
4. 任意亂碼邀請無法讀取活動或名單。

確認後再執行 `npm run deploy` 發布 GitHub Pages。
