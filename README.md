# 七號小幫手
https://rushbq.github.io/LFtime/

## 工具包含
- 軍備競賽：每日時段、建議取分、提前採集試算
- 時間助手：倒數、時間疊加、遊戲／台灣時間換算（結果含星期）
- 聯盟名單：公開查看，Adm／R5 維護
- 賽季轉移：一次性活動，私人邀請連結進入，可設結束時間自動唯讀

轉移名單的 Firebase 設定、名單匯入與權限部署請見
👉 **[轉移名單 Firebase 設定](docs/轉移名單Firebase設定.md)**。

## 維護 / 調整
要改內容或版面（排程、分數、建議取分、提前開採、顏色、新增小工具…），先看
👉 **[docs/維護指南.md](docs/維護指南.md)**。大部分調整只要改 `data/armsRaceData.ts`，不用動程式邏輯。

## 更新流程

```bash
# 1. 修改程式碼後，推送到 GitHub
git add .
git commit -m "更新說明"
git push origin main

# 2. 重新部署
npm run deploy
```
