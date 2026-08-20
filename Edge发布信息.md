# Edge Add-ons 提交信息 —— 脚本合理性 / 审核说明

> 填写位置：微软合作伙伴中心（partner.microsoft.com）→ 扩展 → 提交 → 「审核说明 / Notes to certification」
> 已核对 v1.6.3 代码事实：脚本仅在用户点击图标时按需注入，无任何网络请求，无远程代码。
> Edge 后台支持中文，微软有中文审核团队，**中文版可直接提交**；英文版备用。

---

## 一、审核说明（直接粘贴，推荐中文版）

```
【扩展用途】
「网页随手改」让用户在浏览器中直接可视化编辑当前网页（改文字、调字号/颜色/行距/对齐、换图/插图/裁剪、移动模块、换主题色/字体），并将修改结果导出为 HTML 副本或 PDF。所有编辑仅在浏览器本地进行，原始网页文件不受影响。

【脚本使用说明】
本扩展仅包含两个脚本文件，全部打包在扩展包内，不使用任何远程代码：

1. background.js（Service Worker，常驻）
   仅负责两件事：响应用户点击工具栏图标，开启/关闭编辑模式并更新图标徽标；用户点击「导出」时，调用下载 API 把用户本地生成的文件保存到下载文件夹。不监听网页内容、不访问网页数据。

2. content.js（编辑器界面，按需注入）
   不在 manifest 中声明为常驻内容脚本。只有当用户主动点击工具栏图标时，才通过 chrome.scripting.executeScript 注入到当前这一个标签页，用于呈现编辑工具栏和编辑功能。用户再次点击图标或刷新页面后，注入即停止生效。不注入其他标签页、不后台常驻。

【权限使用理由】
- activeTab：仅用户点击图标时临时获得当前标签页访问权，用于开启编辑。刻意不申请 <all_urls> 等常驻主机权限，页面刷新或关闭后访问自动失效。
- scripting：用户点击图标开启编辑模式时，将打包在扩展内的 content.js 注入当前标签页以显示编辑界面。注入严格由用户手势触发。
- downloads：用户点击「导出副本」后，将用户本地编辑生成的 HTML 文件（data: URL 形式）保存到浏览器默认下载文件夹。从不下载任何远程文件。

【数据与隐私】
不收集、不存储、不传输、不分享任何用户数据。无任何网络请求（代码中无 fetch / XMLHttpRequest / WebSocket）。编辑草稿仅存于浏览器本地 localStorage，导出后清除。

【验证步骤】
1. 安装扩展后，打开任意网页（如 https://example.com 或任意 HTML 页面）
2. 点击浏览器工具栏的「网页随手改」图标 —— 页面出现底部工具栏，图标显示绿色圆点徽标，页面顶部显示版本号提示，即编辑模式已开启
3. 点击页面上的任意文字，光标进入可编辑状态，可直接修改文字；选中文字后底部工具栏可调整字号、颜色、行距、对齐
4. 鼠标悬停在页面的图片上，出现小工具条（换图/插图/删除/复制）
5. 点击底部工具栏「导出副本」，浏览器默认下载文件夹中出现修改后的 HTML 文件
6. 再次点击工具栏图标，编辑模式关闭；刷新页面，网页完全恢复原样（证明扩展未对原始页面做持久性修改）

【特别说明】
打开本地 HTML 文件（file:// 协议）使用时，需在扩展管理页勾选「允许访问文件网址」——这是浏览器对本地文件的通用安全机制，与扩展行为无关。
```

---

## 二、英文版（备用）

```
[Purpose]
"Web Page Quick Edit" lets users visually edit the current web page in the browser (edit text, font size/color/line-height/alignment, replace/insert/crop images, move modules, change theme colors/fonts) and export the modified result as an HTML copy or PDF. All editing happens locally in the browser; the original web page files are never modified.

[Script Usage]
The extension contains only two script files, both bundled in the package. No remote code is used.

1. background.js (Service Worker)
   Only responds to the user clicking the toolbar icon (toggles edit mode and updates the badge) and calls the downloads API to save the user's locally generated file when the user clicks Export. It does not monitor or access web page content.

2. content.js (editor UI, on-demand injection)
   NOT declared as a persistent content script in the manifest. It is injected into the current tab only via chrome.scripting.executeScript when the user explicitly clicks the toolbar icon. Injection stops taking effect when the user disables edit mode or refreshes the page. No other tabs are affected.

[Permission Justifications]
- activeTab: Grants temporary access to the current tab only when the user clicks the toolbar icon. The extension deliberately avoids persistent host permissions (<all_urls>); access is cleared on page refresh or tab close.
- scripting: Used to inject the bundled content.js into the current tab when the user enables edit mode. Strictly user-gesture triggered.
- downloads: Saves the user's locally generated HTML file (as a data: URL) to the browser's default Downloads folder when the user clicks Export. Never downloads anything from a remote server.

[Data & Privacy]
No user data is collected, stored, transmitted, or shared. No network requests of any kind (no fetch / XMLHttpRequest / WebSocket in the code). Editing drafts are stored only in the browser's local localStorage and cleared after export.

[Verification Steps]
1. Install the extension and open any web page
2. Click the toolbar icon — a bottom toolbar appears, the icon shows a green dot badge, and the version toast is displayed (edit mode on)
3. Click any text on the page to edit it; use the bottom toolbar to adjust font size, color, line-height and alignment
4. Hover over any image to see the floating toolbar (replace/insert/delete/duplicate)
5. Click "Export copy" — the modified HTML file appears in the browser's default Downloads folder
6. Click the toolbar icon again to disable edit mode; refresh the page — it fully restores to the original state

[Note]
When using local HTML files (file://), the "Allow access to file URLs" option must be enabled in the extension management page — a standard browser security mechanism unrelated to this extension.
```

---

## 三、Edge 与 Chrome 发布的差异速查

| 事项 | Chrome Web Store | Edge Add-ons |
|---|---|---|
| 注册费用 | 一次性 5 美元 | **免费** |
| 审核时长 | 1～7 天 | 1～7 个工作日（常更快） |
| 审核说明字段 | 隐私权规范页分项填写 | 一个综合的「审核说明」文本框（本文档第一部分直接粘贴） |
| 隐私政策 | 声明不收集数据时通常不强制 | **建议提供**（可复用已托管的 GitHub Pages 链接） |
| 测试步骤 | 不强制 | **强烈建议写清楚**（微软审核员会照步骤实测，步骤不清是最常见被拒原因） |
| 上架范围 | 全球 | 可选区域（默认全球） |

## 四、Edge 提交前自查

- [ ] 包：与 Chrome 相同的 zip 可直接复用（manifest 无 Chrome 专属字段，完全兼容 Chromium 内核）
- [ ] 商店截图：至少 1 张（可复用为 Chrome 准备的截图，Edge 建议尺寸 1366×768 以上）
- [ ] 隐私政策 URL：填 GitHub Pages 那个链接（`https://用户名.github.io/privacy/`）
- [ ] 审核说明：粘贴本文档第一部分
- [ ] 网站 URL（可选）：没有官网可留空，或填 GitHub Pages 链接
