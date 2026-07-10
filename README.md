# 七號小幫手
https://rushbq.github.io/LFtime/

## 工具包含
- 軍備任務
- 時間計算

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
