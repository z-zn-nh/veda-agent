/**
 * 材质测量:把"材质有没有真的在模糊"变成可复现的数字,并报出应用自身的透出比。
 *
 * ## 为什么要测
 *
 * 材质这一类改动最容易骗过肉眼:它是否生效,取决于背面是什么、以及应用自己的 scrim 有多厚。
 * 项目早期吃过这个亏:"材质开了却看不出变化",排查半天发现是底色把材质埋了。
 *
 * ## 一、材质(像素实测)
 *
 * 背衬由应用自己提供:设置里的 **Compare materials** 会建一块纹理背板(`?texture=1`,
 * 细条纹 + 等宽方块)与四个材质探针窗口。两个口径:
 *
 *   lum       平均亮度(0.2126R + 0.7152G + 0.0722B)
 *   contrast  相邻像素的水平亮度差均值 —— 高频细节还剩多少。条纹被磨平 => contrast 掉下来
 *
 * 测法:先读四个探针窗口,再把探针关掉、按**同一矩形**读背板,两者之比即"这块材质把
 * 细节磨掉了多少"。窗口层序由**创建顺序**定死(背板先建且置顶 → 探针后建且置顶),
 * 本脚本不做任何运行期摆位 —— 原因见下面"层序"一节。
 *
 * ## 二、应用自身的透出比(按 token 计算,不截屏)
 *
 * 应用主窗口那一窗"透出多少"**不能**用屏幕截图量:本项目所有窗口都是 `transparent: true`
 * 且带系统材质,而 GDI 抓取这类窗口会返回不可靠数据 —— 这一点项目文档早已写下
 * (`docs/ui-stack-plan-a-vs-plan-b.md`:"GDI 抓取亚克力窗口会返回不可靠数据")。
 * 实测也印证:同一矩形在"窗口可见 / 已隐藏 / 已挪走"三种状态下读数完全相同。
 *
 * 好在遮罩是纯 alpha 混合,透出比可以直接算:若某层遮罩为 α,它**透过**的细节就是
 * (1 − α)(混合是逐像素线性运算,而 contrast 是像素值的线性泛函,所以对比度的传递
 * 与亮度的传递是同一个系数)。多层叠加则连乘。
 *
 * 这里从**运行中的应用**读 `getComputedStyle` 的实际值(而不是解析 CSS 文件),
 * 于是报告的就是这一版 token 真正生效的数字。要调参就改 `src/ui/tokens.css` 的 alpha,
 * 再跑一遍看这张表。
 *
 * ## 层序:创建期定死,运行期一律不动
 *
 * 试过两条路,都不成立:
 *
 * - 进程外用 Win32 摆层序:`SetForegroundWindow` 对后台进程会被系统拒绝,而 `HWND_TOPMOST`
 *   对**已经在置顶组里**的窗口明确不改变其组内位置(MSDN)。同一套代码两次跑出相反结果。
 * - 让应用自己 `set_always_on_top` 摆:更糟 —— 运行期切置顶会打断透明窗口的合成,
 *   探针瞬间渲染成白底(窗内亮度 214–240),主窗口渲染成纯黑(亮度 10、对比度 0)。
 *
 * 注意:生成的 PowerShell 必须保持纯 ASCII。PS 5.1 会把无 BOM 的 .ps1 当 ANSI 读,
 * 非 ASCII 注释变乱码后会直接破坏语法。
 *
 * 前置:应用以调试模式启动(`scripts/launch-tauri-debug.ps1`,CDP 在 9222)。
 * 用法:`node scripts/measure-material.mjs`
 *      可选 `VEDA_MEASURE_OUT=smoke` 落截图、`VEDA_MEASURE_DEBUG=1` 打印每次读数。
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 顺序必须与 src-tauri/src/lib.rs 的 MATERIAL_ORDER 一致(探针窗口按这个顺序平铺)。
const MATERIALS = ['none', 'acrylic', 'system-acrylic', 'aero'];
const PROCESS = 'veda-agent';
const OUT_DIR = process.env.VEDA_MEASURE_OUT ?? '';
const DEBUG = !!process.env.VEDA_MEASURE_DEBUG;
// 要报出透出比的表面 token;顺序 = 从最外到最内,便于看叠加。
const SURFACE_TOKENS = ['--app-scrim', '--app-toolbar', '--app-surface', '--app-surface-strong', '--app-surface-glass'];
const WORK_DIR = mkdtempSync(join(tmpdir(), 'veda-material-'));
const PS = join(WORK_DIR, 'capture.ps1');

/** 读一个窗口/矩形的像素并算指标。像素全在 PowerShell 里处理,Node 只收数字。 */
writeFileSync(
  PS,
  String.raw`
param([string]$Capture = 'probe', [int]$Index = 0, [int]$X = 0, [int]$Y = 0, [int]$W = 0, [int]$H = 0, [string]$Out = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
public class Win {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
'@
if ($Capture -eq 'rect') {
  $target = [pscustomobject]@{ Left = $X; Top = $Y; W = $W; Height = $H }
} else {
  $proc = Get-Process ${PROCESS} -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $proc) { Write-Output 'MISSING process'; exit 2 }
  $pid0 = [uint32]$proc.Id
  $probes = New-Object System.Collections.Generic.List[object]
  $cb = [Win+EnumProc]{
    param($h, $l)
    $p = [uint32]0
    [void][Win]::GetWindowThreadProcessId($h, [ref]$p)
    if ($p -eq $pid0 -and [Win]::IsWindowVisible($h)) {
      $r = New-Object RECT
      [void][Win]::GetWindowRect($h, [ref]$r)
      $w = $r.Right - $r.Left
      $ht = $r.Bottom - $r.Top
      # Probe windows are 440x300 (about 455x309 with shadow). Everything else is
      # ignored: this script only reads probes and explicit rects.
      if ($w -ge 425 -and $w -le 490 -and $ht -ge 280 -and $ht -le 340) {
        $probes.Add([pscustomobject]@{ Left = $r.Left; Top = $r.Top; W = $w; Height = $ht })
      }
    }
    return $true
  }
  [void][Win]::EnumWindows($cb, [IntPtr]::Zero)
  if ($probes.Count -le $Index) { Write-Output ("MISSING probe index=" + $Index + " found=" + $probes.Count); exit 2 }
  $target = $probes | Sort-Object Left | Select-Object -Index $Index
}
$bmp = [System.Drawing.Bitmap]::new($target.W, $target.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($target.Left, $target.Top, 0, 0, $bmp.Size)
if ($Out -ne '') { $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png) }
$rect = New-Object System.Drawing.Rectangle(0, 0, $target.W, $target.Height)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $target.Height)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($data)
$g.Dispose(); $bmp.Dispose()
$sum = 0.0; $grad = 0.0; $n = 0
for ($y = 4; $y -lt $target.Height - 4; $y++) {
  for ($x = 4; $x -lt $target.W - 8; $x += 2) {
    $i = $y * $stride + $x * 4
    $lum = 0.2126 * $bytes[$i + 2] + 0.7152 * $bytes[$i + 1] + 0.0722 * $bytes[$i]
    $j = $i + 8
    $lum2 = 0.2126 * $bytes[$j + 2] + 0.7152 * $bytes[$j + 1] + 0.0722 * $bytes[$j]
    $d = $lum - $lum2
    if ($d -lt 0) { $d = -$d }
    $sum += $lum; $grad += $d; $n++
  }
}
Write-Output ("RESULT {0}|{1}|{2}|{3}|{4}|{5}" -f $target.Left, $target.Top, [math]::Round($sum / $n, 2), [math]::Round($grad / $n, 3), $n, ("{0}x{1}" -f $target.W, $target.Height))
`,
);

/** PS 输出是 `RESULT x|y|lum|contrast|samples|WxH`;用正则取,别按竖线数下标。 */
const parseResult = (raw) => {
  const m = /RESULT (-?\d+)\|(-?\d+)\|([\d.]+)\|([\d.]+)\|(\d+)\|(\d+x\d+)/.exec(raw);
  if (!m) return null;
  return { x: +m[1], y: +m[2], lum: +m[3], contrast: +m[4], samples: +m[5], size: m[6] };
};

/** 同步小睡:采集在顶层 await 之前就会被调用,不能依赖 await。 */
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const capture = (args, label) => {
  let raw;
  try {
    raw = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS, ...args], { encoding: 'utf8' }).trim();
  } catch (error) {
    const text = String(error.stdout ?? '').trim();
    if (text.startsWith('MISSING')) return null;
    throw error;
  }
  if (raw.startsWith('MISSING')) return null;
  if (DEBUG) console.error(`RAW ${label}: ${raw}`);
  return parseResult(raw);
};

const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** 连读三次取中位数:屏幕合成结果会抖,单次读数不可信。 */
const captureMedian = (args, label) => {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const cell = capture(args, label);
    if (cell) runs.push(cell);
    sleepSync(120);
  }
  if (!runs.length) return null;
  return {
    x: runs[0].x,
    y: runs[0].y,
    size: runs[0].size,
    samples: median(runs.map((r) => r.samples)),
    lum: median(runs.map((r) => r.lum)),
    contrast: median(runs.map((r) => r.contrast)),
  };
};

const measureProbe = (index, material) => {
  const out = OUT_DIR ? join(OUT_DIR, `material-${material}.png`) : '';
  return captureMedian(['-Capture', 'probe', '-Index', String(index), '-Out', out], `probe/${material}`);
};

/** 背板基线:探针关掉之后按探针原来的矩形读,拿到未经材质处理的细节。 */
const measureRect = (cell, label) => {
  const [w, h] = cell.size.split('x').map(Number);
  return captureMedian(
    ['-Capture', 'rect', '-X', String(cell.x), '-Y', String(cell.y), '-W', String(w), '-H', String(h)],
    label,
  );
};

// ── CDP:找页面、发求值
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const pages = list.filter((x) => x.type === 'page');
const isWorkspace = (x) => !x.url.includes('material=') && !x.url.includes('texture=');
const workspace = pages.find(isWorkspace) ?? pages[0];
if (!workspace) {
  console.error('找不到页面。先用 scripts/launch-tauri-debug.ps1 启动应用。');
  process.exit(1);
}
const connect = async (target) => {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  };
  const send = (method, params = {}) =>
    new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await new Promise((r) => (ws.onopen = r));
  await send('Runtime.enable');
  return {
    ws,
    // awaitPromise 必须开:否则表达式返回 Promise 时,CDP 不会等它 settle,而是把
    // Promise 对象本身回给我们(拿到 `[object Object]`)—— 那样调用到底成功没有看不出来。
    ev: async (expr) =>
      (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }))
        .result?.result?.value,
  };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = await connect(workspace);
// CDP 就绪 ≠ 界面画好:等 React 把工具栏挂上去再操作。
let ready = false;
for (let i = 0; i < 60; i++) {
  ready = (await app.ev(`document.querySelectorAll('.tool-button').length`)) >= 3;
  if (ready) break;
  await sleep(500);
}
if (!ready) { console.error('界面没有就绪(工具栏未出现)'); process.exit(1); }

// ── 一、应用自身的透出比:直接读运行中 token 的实际计算值
const tokensRaw = await app.ev(
  `JSON.stringify(Object.fromEntries(${JSON.stringify(SURFACE_TOKENS)}.map((name) => [name, getComputedStyle(document.documentElement).getPropertyValue(name).trim()])))`,
);
const tokens = JSON.parse(tokensRaw);
/** `rgba(r, g, b, a)` / `rgb(r, g, b)` → alpha(缺省为 1)。 */
const alphaOf = (value) => {
  const m = /rgba?\(([^)]+)\)/.exec(value);
  if (!m) return null;
  const parts = m[1].split(',').map((p) => Number(p.trim()));
  if (parts.some((p) => Number.isNaN(p))) return null;
  return parts.length >= 4 ? parts[3] : 1;
};

const click = (expr) => app.ev(`(()=>{const b=${expr};if(!b) return false;b.click();return true;})()`);
await click(`[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='Settings')`);
await sleep(700);
if (!(await click(`[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Compare materials')`))) {
  console.error('没找到 Compare materials 按钮');
  process.exit(1);
}

// ── 二、材质:等四个探针窗口就位,逐个测量
let probes = null;
for (let attempt = 0; attempt < 30; attempt++) {
  await sleep(700);
  const measured = MATERIALS.map((material, index) => ({ material, cell: measureProbe(index, material) }));
  if (measured.every((x) => x.cell)) { probes = measured; break; }
}
if (!probes) {
  console.error(`探针窗口没有全部出现(工作目录 ${WORK_DIR})`);
  process.exit(1);
}
probes = MATERIALS.map((material, index) => ({ material, cell: measureProbe(index, material) }));

// ── 阶段 2:关掉四个探针 —— 背板仍在(它一直是置顶的),按同一矩形再测一遍
const probeTargets = (await (await fetch('http://127.0.0.1:9222/json/list')).json())
  .filter((x) => x.type === 'page' && x.url.includes('material='));
for (const target of probeTargets) {
  const probePage = await connect(target);
  await probePage.ev(`(()=>{const b=document.querySelector('.probe-close');if(b){b.click();return true;}return false;})()`);
  probePage.ws.close();
}
await sleep(900);
// 探针关掉后就取不到探针窗口了,所以基线按它们原来的矩形读。
const rectBaselines = probes.map(({ material, cell }) => ({
  material,
  cell: measureRect(cell, `backdrop/${material}`),
}));
if (rectBaselines.some((b) => !b.cell)) {
  console.error('拿不到背板基线');
  process.exit(1);
}

// ── 结果
console.log('一、应用自身透出比(由 token 的 alpha 直接决定,不截屏)');
console.log('token                    值                              α       透出');
let cumulative = 1;
for (const name of SURFACE_TOKENS) {
  const value = tokens[name];
  const alpha = alphaOf(value);
  if (alpha === null) {
    console.log(`${name.padEnd(24)}${String(value).padEnd(32)}(无法解析)`);
    continue;
  }
  // scrim 铺满整窗,是唯一"全窗叠加"的一层;其余是各自区域上的局部遮罩。
  if (name === '--app-scrim') cumulative = 1 - alpha;
  console.log(
    `${name.padEnd(24)}${String(value).padEnd(32)}${alpha.toFixed(2).padStart(5)}${((1 - alpha) * 100).toFixed(1).padStart(8)}%`,
  );
}
console.log(`\n全窗透出(桌面细节透过 .app-scrim 之后):${(cumulative * 100).toFixed(1)}%`);
console.log('说明:面板/工具栏等遮罩叠在 scrim 之上,会再按 (1−α) 连乘;要调参就改 src/ui/tokens.css。\n');

console.log('二、材质:高频细节被磨平多少(像素实测)');
console.log('材质             亮度      背板亮度   条纹对比   背板对比   压掉');
const rows = probes.map((p, i) => {
  const base = rectBaselines[i].cell;
  const flattened = 1 - p.cell.contrast / base.contrast;
  console.log(
    `${p.material.padEnd(17)}${String(p.cell.lum).padStart(7)}${String(base.lum).padStart(11)}${String(p.cell.contrast).padStart(10)}${String(base.contrast).padStart(11)}${(flattened * 100).toFixed(1).padStart(8)}%`,
  );
  return { material: p.material, probe: p.cell, base, flattened };
});
if (OUT_DIR) console.log(`\n截图:${OUT_DIR}/material-*.png`);

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};
const row = (m) => rows.find((r) => r.material === m);

// 这些断言只针对**方法本身**是否可信;数值大小留给上面两张表。
const baseContrasts = rows.map((r) => r.base.contrast);
check('背板有高频细节(对比度足够高)', row('none').base.contrast > 15, `base=${row('none').base.contrast}`);
check(
  '四块基线来自同一张背板(最小值 / 最大值 > 0.8)',
  Math.min(...baseContrasts) > Math.max(...baseContrasts) * 0.8,
  baseContrasts.map((c) => c.toFixed(1)).join(' / '),
);
// 噪声底不是零:探针窗口自带顶栏/文字/色阶,每种材质下都一样,会把整窗对比度拉低
// 约 15–25%。所以自检只要求"没被磨掉太多",而不是"完全不变"。
check('方法自检:none 不显著改变背板', row('none').flattened < 0.3, `压掉 ${(row('none').flattened * 100).toFixed(1)}%`);
check('透出比可解析(至少 scrim 是 rgba)', alphaOf(tokens['--app-scrim']) !== null, String(tokens['--app-scrim']));
const blurred = rows.filter((r) => r.flattened > 0.5).map((r) => r.material);
console.log(`\n明显在模糊的材质:${blurred.length ? blurred.join(', ') : '(无)'}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
