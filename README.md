# Sudoku.com Candidate Helper

这个工作区里放了一个给 `https://sudoku.com/zh/evil/` 用的候选数助手脚本：

- `sudoku-helper.user.js`

用法：

1. 打开 Sudoku 页面，等棋盘加载完成。
2. 直接把 `sudoku-helper.user.js` 的全部内容粘到浏览器控制台执行，或装到 Tampermonkey 作为 Userscript。
3. 页面右下角会出现“数独候选助手”面板，棋盘上会叠加候选数。

Tampermonkey 自动更新地址：

- 安装/下载：`https://raw.githubusercontent.com/SeptYagu/sudoku-helper/main/sudoku-helper.user.js`
- 脚本头里已经配置了 `@updateURL` 和 `@downloadURL`。

提示规则：

- 小号蓝色数字：这个空格当前合法的候选数。
- 绿色大号数字：唯一候选，可以确定填写。
- 黄色大号数字：隐藏单，也可以确定填写。
- 红色边框或感叹号：当前盘面有冲突，或某空格没有合法候选数。

如果页面以后改版导致自动读取失败：

1. 先点助手面板里的“刷新”。
2. 仍失败就点“诊断”，把控制台里的 `[SudokuCandidateHelper] diagnostics` 发回来。
3. 临时兜底可以打开“手动盘面”，粘贴 81 位盘面，`0` 或 `.` 表示空格。
