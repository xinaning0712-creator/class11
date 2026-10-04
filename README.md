# 最閃亮的11班 班級網

## 網址
| 頁面 | 用途 | 網址 |
|---|---|---|
| 主畫面 | 白板投影：作業燈號 | https://xinaning0712-creator.github.io/class11/ |
| 聯絡簿 | 白板投影：Canva 聯絡簿 | https://xinaning0712-creator.github.io/class11/contact.html |
| 抽籤 | 白板投影：樂透機抽座號 | https://xinaning0712-creator.github.io/class11/roll.html |
| 扭蛋頁 | 天堂／地獄扭蛋（獨立連結） | https://xinaning0712-creator.github.io/class11/gacha.html |
| 老師後台 | 需密碼 | https://xinaning0712-creator.github.io/class11/admin.html |

## 教室電腦第一次使用
1. 用瀏覽器打開主畫面，按右下角 ⚙︎ → 輸入**教室密碼** → 開啟教室模式。孩子就能點燈號、抽扭蛋。
2. 要進後台時，登入畫面**不要勾**「記住我」，關掉分頁就會自動登出。

---

## 修改網站後，怎麼更新到公開網址
1. 跟 Claude 說要改什麼，Claude 改好並存檔（commit）。
2. 打開 **GitHub Desktop**，按上方的 **Push origin**。
3. 等 1～2 分鐘，公開網址就更新了。如果看到的還是舊畫面，按 `⌘ + Shift + R` 重新整理。

## 換電腦或電腦壞掉時，怎麼把檔案拿回來
1. 在新電腦安裝 **GitHub Desktop**（https://desktop.github.com ），用同一個 GitHub 帳號登入。
2. 選 **File → Clone repository**，選這個專案，存到桌面。
3. 用 Claude Code 打開那個資料夾，就能繼續修改。

> 資料（作業、燈號、獎品、紀錄）都存在 Supabase 雲端，換電腦不會不見。

---

## 雲端資料庫（Supabase）
- 網址：https://supabase.com （用 GitHub 帳號登入）
- `supabase/` 資料夾裡的 SQL 檔，依編號在 **SQL Editor** 執行過一次即可：
  1. `01_第一階段_資料表.sql`：作業燈號
  2. `02_設定老師與教室帳號.sql`：帳號身分
  3. `03_扭蛋機.sql`：扭蛋機
  4. `04_聯絡簿.sql`：聯絡簿連結
- 登入帳號：
  - 老師 `teacher@shiny11.local`
  - 教室 `classroom@shiny11.local`
  - 忘記密碼時，到 Supabase「Authentication → Users」重設。
- 免費方案連續 7 天沒人用會暫停。GitHub 每 3 天會自動連一次，避免暫停（`.github/workflows/keep-supabase-awake.yml`）。
  - 萬一還是暫停了，到 Supabase 專案頁按 **Restore** 即可，資料不會不見。

## 安全說明
- `js/config.js` 裡的是 Supabase「公開鑰匙」，本來就可以放在網頁裡。真正的保護靠資料庫權限：
  - 沒登入：只能看燈號。
  - 教室模式：只能改綠燈、抽扭蛋。
  - 老師：全部功能。
- **secret / service_role 鑰匙、老師與教室密碼，絕對不要寫進任何檔案。**
- 網頁上只顯示座號，不放孩子姓名。
