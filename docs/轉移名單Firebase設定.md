# 轉移名單 Firebase 設定

轉移名單頁面使用 Firebase Anonymous Authentication 與 Cloud Firestore。三種身分各有一條不可猜測的邀請連結，點入後直接開啟同一個活動。

## 1. 建立 Firebase 專案

1. 在 Firebase Console 建立專案與 Web App。
2. Authentication 的 Sign-in method 啟用 Anonymous。
3. 建立 Cloud Firestore，建議區域使用 `asia-east1`。
4. 將 `.env.example` 複製為 `.env.local`，填入 Web App 設定。

## 2. 產生本機種子資料與三條邀請連結

```powershell
npm run prepare:transfer
```

指令預設讀取：

- `D:/Download/KOi名單-2609.xlsx`
- `D:/Download/BDK namelist.xlsx`

產生的 `.transfer-seed.local.json` 含完整名單和邀請碼，已加入 `.gitignore`，不可提交或公開傳送。若來源檔路徑不同，可依序傳入兩個路徑：

```powershell
npm run prepare:transfer -- "D:/path/KOi.xlsx" "D:/path/BDK.xlsx"
```

## 3. 寫入 Firestore

先登入 Firebase CLI，種子程式會沿用該登入狀態：

```powershell
npx firebase-tools login
npm run seed:transfer
```

也可用 `FIREBASE_PROJECT_ID` 指定與 `.firebaserc` 不同的專案。種子程式只接受有效的 Firebase CLI 登入，且不會將登入憑證寫入專案。

初始化採單一批次寫入。若活動已存在，指令會停止，不會覆蓋既有勾選或備註。

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
- 玩家名稱、戰力、階級與名單歸屬不能從網頁修改。
- 停用邀請後，使用該邀請建立的既有匿名身分也會立即失去權限。

## 5. 驗證與發布

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
