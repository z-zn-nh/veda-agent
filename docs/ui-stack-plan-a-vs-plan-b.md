# UI 技术栈:方案 A / 方案 B 对照

> **结论(已定型):选用方案 B(Tauri + React)。**
> 定案依据:用户在实机确认 Tauri 侧毛玻璃效果成立,而方案 A 需要自行维护 Compose 生态与 JNA 原生调用,
> 且与 pi(TS 生态)的接入成本过高。方案 A 骨架已删除,本文保留作为选型记录与实测数据来源。

## 触发这次对比的原因

组件库清单里的 **Haze**(`chrisbanes.github.io/haze`)核实结果是:

> Haze is a library providing visual effects (such as blur) for **Compose Multiplatform**.

依赖坐标是 Gradle 形式:`dev.chrisbanes.haze:haze:<version>`。

**它是 Kotlin / Compose Multiplatform 库,不能用在任何 React / HTML 界面里。** 所以"Haze 是否必须"直接决定整个 UI 层的技术栈,这不是加一个依赖能调和的分歧。

## 两套方案

| | 方案 A | 方案 B |
| --- | --- | --- |
| 位置 | `D:\Veda Agent Compose` | `D:\Veda Agent`(现有) |
| 语言 | Kotlin 2.4.20 | TypeScript |
| UI 框架 | Compose Multiplatform 1.12.1 (Desktop/JVM) | React 19.3 + Vite |
| 组件库 | Material 3(Compose 自带) | **Mantine 9.7** |
| 图标 | material-icons-core 1.7.3 | Lucide |
| 玻璃材质 | **Haze 2.0.1** | Tauri `windowEffects: acrylic`(底层 window-vibrancy 0.8.1) |
| 桌面外壳 | Compose Desktop 窗口 | Tauri 2.12.1 |
| 构建 | Gradle 9.8.0 | Vite |
| 构建验证 | `gradlew build` 通过 | `npm run typecheck` + `npm run build` 通过 |

## 亚克力怎么实现(关键差异)

**方案 B:能拿到真正的系统级模糊。**
Tauri 2.12.1 已直接依赖 `window-vibrancy` 0.8.1,`windowEffects` 就是它的封装。
当前配置:

```json
"transparent": true,
"decorations": false,
"windowEffects": { "effects": ["acrylic"], "state": "active", "radius": 18 }
```

需要更细控制时可在 Rust 侧直接调用 `apply_acrylic` / `apply_blur` / `apply_mica` / `apply_tabbed`。

**方案 A:Haze 只模糊应用内部内容,不是桌面背景。**
Haze 采样的是同一窗口内已经绘制的像素(`hazeSource` 标记的层),面板在其上做磨砂。
要得到"能看见壁纸"的窗口级亚克力,必须在 Kotlin 侧用 JNA 调 Windows 原生 API
(`SetWindowCompositionAttribute` 或 `DwmEnableBlurBehindWindow`)。
window-vibrancy 是 Rust 库,Kotlin 侧无法复用。

**这条已经实测走通**:A 方案已实现 `ui/win/WindowsAcrylic.kt`(76 行 JNA),
调用 `SetWindowCompositionAttribute` + `ACCENT_ENABLE_ACRYLICBLURBEHIND`,
运行日志确认 `window acrylic applied=true (os=Windows 11)`。

**但两者成本不同**:
- B:框架自带,零额外代码。
- A:需要自己写原生调用,并且 Haze 的磨砂需要"背后有结构可模糊"才看得出来
  ——骨架初版背后是一条纯色渐变,所以完全看不出材质效果,这是演示缺陷而非 Haze 限制。

## 修正记录

骨架初版 A 方案"看不出材质"的两个原因,均已在最新版本修正:

1. **面板背后没有可模糊的内容**。原背景是近乎纯色的暗色渐变,Haze 模糊纯色等于没有效果。
   现改为多段彩色背景(暗蓝 → 钢蓝 → 灰绿 → 陶土色),磨砂质感立刻可见。
2. **没有窗口级材质**。现已补上 JNA 调用,并已实测生效。

面板底色同时调整为"半透明但足够暗"(0.55–0.62),保证浅色文字压在明亮背景上仍可读。

## 本机构建环境的两个坑(都已解决并记录)

1. **`dl.google.com` 不可达**(HTTP 000)。
   Compose Multiplatform 传递依赖需要 `androidx.compose.runtime`、`androidx.lifecycle`、
   `androidx.savedstate` 等,这些只托管在 Google Maven。
   → `settings.gradle.kts` 已配置阿里云 Google Maven 镜像。

2. **`services.gradle.org` 会把分发包重定向到 `github.com`,而 github 不可达。**
   → wrapper 的 `distributionUrl` 指向华为云镜像。
   腾讯云镜像同样可用。

另外 `material-icons-extended` 只发布到 1.7.3,CMP 1.12 上已不可用,
因此 A 方案只使用 Material 核心图标集。

## 组件库选择的理由(方案 B)

在清单的 React 全家桶里选 **Mantine 9.7**:

- 组件覆盖面广(100+),树 / 表格 / 命令面板 / 通知都有。
- 主题全部走 CSS 变量,**能整套覆盖**成"无边框 / 无阴影 / 无卡片岛"的规范——
  这一点最关键,组件库的默认视觉必须能被压掉。
- peer 依赖要求 `react ^19.2.0`,本项目实际安装 19.3.0,直接匹配。
- 旧项目已经在用 Mantine 9.5.2,集成经验与踩坑记录可复用。

`Ant Design 6.6` 作为备选:表格与复杂表单最强,但默认视觉最强势,压规范成本最高。
无头路线(`Ark UI`)自由度最高,但等于自己造设计系统,不作为起点。

## 尚未验证的部分

- 方案 A 的窗口只做到"编译通过 + 可启动",没有做窗口级亚克力(需 JNA)。
- 方案 B 的系统亚克力模糊无法用截图确证:GDI 抓取亚克力窗口会返回不可靠数据。
  能证明的是窗口底色为半透明、无遮挡层、圆角为 0。
- 两套都还没有真实数据层(笔记存储、白板持久化、Agent 运行时)。


## 亚克力实测记录（两方案）

用"同一屏幕区域、有窗口 / 无窗口"的对照截图做像素测量，结论如下。

### 关键算术：透明度会被叠加

桌面透出比例 = (1 − 材质染色) × (1 − 面板 tint)。修正前：

```text
方案 A   JNA 染色 0.70 × 面板 0.55  →  只透出 13.5%
方案 B   面板 0.55 再叠顶栏 0.50     →  只透出 22.5%
```

这就是"看不出材质"的直接原因。修正后约为 38%，实测与理论吻合（见下）。

### 方案 A 实测（修正后）

```text
整窗相关 r = 0.72
窗内亮度 35.1   /   背景亮度 49.6
锐度比 0.58            ← 比背景明显平滑，说明确实被模糊
理论值 0.385×49.6 + 0.615×27 = 35.7   ← 实测 35.1
```

即：JNA 亚克力确实生效，桌面透出约 38% 且已被模糊。

### 方案 B 的两个发现

1. **Windows 11 上 `windowEffects.color` 无效**。Tauri 官方 schema 原文：
   "Affects WindowEffect::Blur and WindowEffect::Acrylic only on Windows 10 v1903+.
   Doesn't have any effect on Windows 7 or Windows 11."
   所以材质染色只能由 CSS 承担。

2. **Win11 上 `acrylic` 渲染偏亮**（实测窗口亮度 113，比暗色背景 49.6 还亮），
   与暗色主题冲突。已改为 `["micaDark", "acrylic"]`：
   Win11 用原生暗色 micaDark，Win10 自动回退 acrylic。
   改后实测窗口亮度 66.1、背景 90.7（窗口暗于背景，符合暗色主题），r = 0.75。

### 可调开关

方案 A（`ui/win/WindowsAcrylic.kt` 的 `DEFAULT_TINT`，ABGR）+ `ui/Theme.kt` 的 Panel* 四个 alpha。
方案 B（`src-tauri/tauri.conf.json` 的 `windowEffects.effects`）+ `src/styles.css` 的面板 tint。
