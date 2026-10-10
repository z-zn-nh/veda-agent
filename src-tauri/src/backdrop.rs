//! Windows 11 backdrop material.
//!
//! Why this exists: Tauri's `windowEffects` maps `acrylic`/`blur` onto the legacy
//! `SetWindowCompositionAttribute` path, which is a Windows 10 API. On Windows 11
//! that path fails and leaves the window solid black. `mica` works but Mica is an
//! *opaque* material: it samples the desktop wallpaper instead of showing what is
//! behind the window, so the window looks non-transparent.
//!
//! The modern equivalent is `DwmSetWindowAttribute` with
//! `DWMWA_SYSTEMBACKDROP_TYPE`, where `DWMSBT_TRANSIENTWINDOW` is Acrylic —
//! a genuinely translucent, blurred backdrop. That is what we want here.
//!
//! Declared via `extern "system"` on purpose: it keeps the crate free of a direct
//! `windows` dependency, so there is no version to keep in sync with Tauri.

#![cfg(target_os = "windows")]

use core::ffi::c_void;

const DWMWA_USE_IMMERSIVE_DARK_MODE: u32 = 20;
const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
const DWMWA_SYSTEMBACKDROP_TYPE: u32 = 38;

/// DWM_SYSTEMBACKDROP_TYPE values.
const DWMSBT_AUTO: i32 = 0;
const DWMSBT_NONE: i32 = 1;
const DWMSBT_MAINWINDOW: i32 = 2; // Mica — opaque, samples wallpaper
const DWMSBT_TRANSIENTWINDOW: i32 = 3; // Acrylic — translucent, blurs what is behind
const DWMSBT_TABBEDWINDOW: i32 = 4; // Tabbed

/// `DWMWCP_ROUND`
const DWMWCP_ROUND: i32 = 2;

/// Win11 给窗口画的那条 1px 描边。
const DWMWA_BORDER_COLOR: u32 = 34;

/// `DWMWA_COLOR_DEFAULT` / `DWMWA_COLOR_NONE`。它们是 COLORREF,所以是 u32。
const DWMWA_COLOR_DEFAULT: u32 = 0xFFFF_FFFF;
const DWMWA_COLOR_NONE: u32 = 0xFFFF_FFFE;

/// `GetWindowLongW` / `SetWindowLongW` 的索引,以及 DWM 判"有没有框"要看的那几个位。
const GWL_STYLE: i32 = -16;
const WS_CAPTION: u32 = 0x00C0_0000;
const WS_DLGFRAME: u32 = 0x0040_0000;
const WS_BORDER: u32 = 0x0080_0000;
const WS_THICKFRAME: u32 = 0x0004_0000;
const WS_SYSMENU: u32 = 0x0008_0000;

#[link(name = "user32")]
extern "system" {
    fn GetWindowLongW(hwnd: isize, index: i32) -> i32;
    fn SetWindowLongW(hwnd: isize, index: i32, value: i32) -> i32;
}

#[link(name = "dwmapi")]
extern "system" {
    fn DwmSetWindowAttribute(
        hwnd: isize,
        attribute: u32,
        value: *const c_void,
        value_size: u32,
    ) -> i32;
}

/// 让 DWM 用"宿主背景笔刷"绘制客户区,也就是把系统材质铺到客户区上。
///
/// 这一个开关是整件事的关键,而它不在任何一份常用示例里:只设
/// `DWMWA_SYSTEMBACKDROP_TYPE` 时,选中的材质**只作用于非客户区**,客户区照旧由
/// 应用自己绘制——表现就是"设了材质却毫无变化",很容易被误判成"Win11 上不支持"。
/// 参考实现 Pebrel 在挂载合成目标之前同样是先开这个开关。
const DWMWA_USE_HOSTBACKDROPBRUSH: u32 = 17;

/// 走 DWM 自身的材质通道:`HOSTBACKDROPBRUSH` + `SYSTEMBACKDROP_TYPE`。
///
/// 与 `acrylic` 只差上面那一个开关。它不需要任何额外运行时,是成本最低的
/// "真模糊"候选;不行再考虑 WinAppSDK 的 DesktopAcrylicController。
pub const HOST_BACKDROP: &str = "host-backdrop";

/// Acrylic: the translucent material. This is the one that lets the desktop show through.
pub const ACRYLIC: &str = "acrylic";

/// Aero glass: `ACCENT_ENABLE_BLURBEHIND` over a full-window glass frame.
///
/// 与 Acrylic 的关键差别:系统的 Acrylic 材质**不接受应用指定的底色**,只能跟随
/// 系统主题;这条路允许自带 tint,所以才能做到"透出八成 + 两成自定义颜色"。
/// 参考实现 Pebrel 的默认材质就是它(`blur=aero`)。
pub const AERO: &str = "aero";
/// 只设 BLURBEHIND、不铺玻璃框,保留下来做对照实验。
pub const BLUR: &str = "blur";
/// Legacy acrylic (ACCENT_ENABLE_ACRYLICBLURBEHIND + glass frame).
pub const ACRYLIC_LEGACY: &str = "acrylic-legacy";
/// Mica: opaque wallpaper sample. Kept selectable for comparison only.
pub const MICA: &str = "mica";
pub const TABBED: &str = "tabbed";
pub const NONE: &str = "none";

/// 系统合成材质:WinAppSDK `DesktopAcrylicController`,画在窗口下方的独立合成目标上。
/// 与 `acrylic` 的区别是**层级不同**——那个走 DWM 的窗口属性,这个由合成器单独出一层。
pub const SYSTEM_ACRYLIC: &str = "system-acrylic";

fn set_i32(hwnd: isize, attribute: u32, value: i32) -> Result<(), String> {
    let code = unsafe {
        DwmSetWindowAttribute(
            hwnd,
            attribute,
            &value as *const i32 as *const c_void,
            core::mem::size_of::<i32>() as u32,
        )
    };
    if code == 0 {
        Ok(())
    } else {
        Err(format!("DwmSetWindowAttribute(attr={attribute}) failed: HRESULT 0x{code:08X}"))
    }
}

/// Applies `material` to the window. Returns a human-readable report so the
/// frontend (and the dev log) can tell exactly what happened.
pub fn apply(hwnd: isize, material: &str) -> Result<String, String> {
    // Dark caption + rounded corners match the dark theme.
    let _ = set_i32(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, 1);
    let _ = set_i32(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND);

    // 客户区是否交给 DWM 绘制,必须在选材质之前决定——它只对系统材质通道生效。
    let host_brush = material == HOST_BACKDROP;
    let _ = set_i32(hwnd, DWMWA_USE_HOSTBACKDROPBRUSH, i32::from(host_brush));

    let (value, label) = match material {
        HOST_BACKDROP | ACRYLIC => (
            DWMSBT_TRANSIENTWINDOW,
            if host_brush {
                "acrylic via host backdrop brush (DWMSBT_TRANSIENTWINDOW)"
            } else {
                "acrylic (DWMSBT_TRANSIENTWINDOW)"
            },
        ),
        MICA => (DWMSBT_MAINWINDOW, "mica (DWMSBT_MAINWINDOW)"),
        TABBED => (DWMSBT_TABBEDWINDOW, "tabbed (DWMSBT_TABBEDWINDOW)"),
        NONE => (DWMSBT_NONE, "none (DWMSBT_NONE)"),
        other => (DWMSBT_AUTO, other),
    };

    set_i32(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, value)?;
    Ok(format!("backdrop applied: {label}"))
}

/// `i32` 之外的第二个 setter:少数 DWM 属性收的是 `COLORREF`(u32)而不是 i32,
/// `DWMWA_BORDER_COLOR` 就是其中之一。不能复用 `set_i32` —— 传 i32 会把 0xFFFFFFFE
/// 当成 -2,长度也对不上。
fn set_u32(hwnd: isize, attribute: u32, value: u32) -> Result<(), String> {
    let code = unsafe {
        DwmSetWindowAttribute(
            hwnd,
            attribute,
            &value as *const u32 as *const c_void,
            core::mem::size_of::<u32>() as u32,
        )
    };
    if code == 0 {
        Ok(())
    } else {
        Err(format!("DwmSetWindowAttribute(attr={attribute}) failed: HRESULT 0x{code:08X}"))
    }
}

/// Win11 画的那条 1px 窗口描边。
///
/// 它和"窗外那圈黑雾"是两套东西,别混:
///   - 1px 亮线 = `DWMWA_BORDER_COLOR`,就是这里;
///   - 窗外一圈几十像素的暗化 = **窗口阴影**,它不是 DWM 属性,见下面那段。
pub fn set_border(hwnd: isize, on: bool) -> Result<String, String> {
    let color = if on { DWMWA_COLOR_DEFAULT } else { DWMWA_COLOR_NONE };
    set_u32(hwnd, DWMWA_BORDER_COLOR, color)?;
    Ok(format!("border: {}", if on { "on" } else { "off" }))
}

/// 窗口阴影的开关 —— 也就是用户看到的那圈"黑雾"。
///
/// # 为什么不能直接用 Tauri 的 `set_shadow()`
///
/// 试过两条更省事的路,都不行,记在这里免得下次再走一遍:
///
/// 1. `DWMWA_NCRENDERING_POLICY = DWMNCRP_DISABLED`。实测**无效**:开关两态抓同一块
///    屏幕区域,剖面逐点相同。它管的是"非客户区要不要 DWM 参与渲染",不是阴影。
/// 2. `WebviewWindow::set_shadow(false)`(tao 的 `MARKER_UNDECORATED_SHADOW`)。
///    实测也**无效**,原因很明确:tao 只翻内部标记,不碰窗口样式 —— 关掉前后
///    `GWL_STYLE` 都是 `0x14cf0000`,一个位都没变。那个标记只影响三件事:
///    创建时的尺寸估算、`WM_NCCALCSIZE` 的 insets、`WM_NCHITTEST` 的顶边拖拽区。
///
/// # 阴影到底由什么决定
///
/// 由**窗口样式**决定。tao 为了自己实现拖拽与缩放,对无边框窗口也始终保留
/// `WS_CAPTION | WS_SYSMENU`(`to_window_styles()` 里无条件加),再用 `WM_NCCALCSIZE`
/// 把这条边框藏起来 —— 框看不见了,DWM 却仍按"这是有框窗口"给它画阴影。
/// 所以要关阴影,只能把"有框"这几个位真的去掉,并且 `SWP_FRAMECHANGED` 让 DWM 重算框。
///
/// # 副作用与为什么可以这么做
///
/// 去掉 `WS_THICKFRAME` 会连带丢掉系统提供的缩放边框。本项目不受影响:窗口是
/// `decorations: false`,拖拽与缩放本来就由 Tauri 自己按 `WindowFlags` 处理
/// (窗口上确实挂着 `TAURI_DRAG_RESIZE_WINDOW` 元素),不依赖系统边框。
pub fn set_shadow(hwnd: isize, on: bool) -> Result<String, String> {
    const FRAME_BITS: u32 = WS_CAPTION | WS_DLGFRAME | WS_BORDER | WS_THICKFRAME | WS_SYSMENU;
    let before = unsafe { GetWindowLongW(hwnd, GWL_STYLE) } as u32;
    let after = if on { before | FRAME_BITS } else { before & !FRAME_BITS };
    unsafe {
        SetWindowLongW(hwnd, GWL_STYLE, after as i32);
        SetWindowPos(
            hwnd,
            0,
            0,
            0,
            0,
            0,
            SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
        );
    }
    let readback = unsafe { GetWindowLongW(hwnd, GWL_STYLE) } as u32;
    Ok(format!(
        "shadow: {} (style 0x{before:08X} -> 0x{readback:08X})",
        if on { "on" } else { "off" }
    ))
}

/// Lists what the OS actually reports for the backdrop attributes, so callers can
/// verify the setting instead of assuming it took effect.
pub fn report(hwnd: isize) -> String {
    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmGetWindowAttribute(
            hwnd: isize,
            attribute: u32,
            value: *mut c_void,
            value_size: u32,
        ) -> i32;
    }
    let mut backdrop: i32 = -1;
    let mut corners: i32 = -1;
    let mut dark: i32 = -1;
    unsafe {
        let _ = DwmGetWindowAttribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            &mut backdrop as *mut i32 as *mut c_void,
            4,
        );
        let _ = DwmGetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &mut corners as *mut i32 as *mut c_void,
            4,
        );
        let _ = DwmGetWindowAttribute(
            hwnd,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
            &mut dark as *mut i32 as *mut c_void,
            4,
        );
    }
    // 只回读 DWM 真的支持回读的属性。阴影 / 描边那两个属性**只写不读**:
    // 试着回读会一直拿到初值(-1 / 0),看起来像"没设上",实际是 DWM 不提供这个查询。
    // 把不可靠的读数摆进报告比不写更糟 —— 所以报告里只报 backdrop / corners / dark,
    // 外框状态一律以 set_frame 的返回值为准(它报的是"我们请求了什么")。
    format!("backdrop={backdrop} corners={corners} dark={dark}")
}

// ---------------------------------------------------------------------------
// Legacy SetWindowCompositionAttribute path (Windows 10 API).
// Tauri's `windowEffects` uses this for `acrylic`/`blur`. On Windows 11 the
// acrylic variant is known to fail and paint the window black, but `blur`
// sometimes still works and is the most transparent material available.
// ---------------------------------------------------------------------------

const WCA_ACCENT_POLICY: i32 = 19;
const ACCENT_ENABLE_BLURBEHIND: i32 = 3;
const ACCENT_ENABLE_ACRYLICBLURBEHIND: i32 = 4;
const ACCENT_FLAG_DRAW_ALL_BORDERS: i32 = 2;

/// Acrylic 的染色。
///
/// 两条约束把它夹在一个很窄的区间里:
///  - **alpha 不能是 0**——部分 DWM 版本会因此直接跳过 Acrylic,什么都不画;
///  - **alpha 也不能给厚**——它是"染色强度",给重了模糊就被自己的颜色盖住,
///    看上去和一块不透明的板子没有区别。
/// `0x0100_0000` 是 ABGR(a=1, 黑),也就是"几乎不染色"。
const ACCENT_ACRYLIC_TINT: u32 = 0x0100_0000;

/// Aero 的染色:ABGR(a=0x98≈60%, B/G/R=0x2B) → 六成深的灰玻璃。
const ACCENT_AERO_TINT: u32 = 0x982B_2B2B;

#[repr(C)]
struct AccentPolicy {
    accent_state: i32,
    accent_flags: i32,
    gradient_color: u32,
    animation_id: i32,
}

#[repr(C)]
struct WindowCompositionAttributeData {
    attribute: i32,
    data: *mut c_void,
    size: usize,
}

// `SetWindowCompositionAttribute` is an undocumented API: it has no import-library
// entry, so it must be resolved at runtime via GetProcAddress.
type SetWindowCompositionAttributeFn =
    unsafe extern "system" fn(isize, *mut WindowCompositionAttributeData) -> i32;

#[link(name = "kernel32")]
extern "system" {
    fn GetModuleHandleA(name: *const u8) -> isize;
    fn GetProcAddress(module: isize, name: *const u8) -> *const c_void;
}

fn resolve_composition_attr() -> Option<SetWindowCompositionAttributeFn> {
    static NAME: &[u8] = b"SetWindowCompositionAttribute ";
    unsafe {
        let module = GetModuleHandleA(b"user32.dll ".as_ptr());
        if module == 0 {
            return None;
        }
        let proc = GetProcAddress(module, NAME.as_ptr());
        if proc.is_null() {
            return None;
        }
        Some(core::mem::transmute::<
            *const c_void,
            SetWindowCompositionAttributeFn,
        >(proc))
    }
}

// ---------------------------------------------------------------------------
// DwmEnableBlurBehindWindow —— Aero 的"公开 API"那一半
// ---------------------------------------------------------------------------

const DWM_BB_ENABLE: u32 = 0x1;

#[repr(C)]
struct BlurBehind {
    flags: u32,
    enable: i32,
    region: *mut c_void,
    transition_on_maximized: i32,
}

#[link(name = "dwmapi")]
extern "system" {
    fn DwmEnableBlurBehindWindow(hwnd: isize, params: *const BlurBehind) -> i32;
}

/// 对所有 legacy 档位都显式 enable/disable,避免从 Aero 热切走后残留一层玻璃。
fn enable_blur_behind(hwnd: isize, enabled: bool) -> Result<(), String> {
    let params = BlurBehind {
        flags: DWM_BB_ENABLE,
        enable: i32::from(enabled),
        region: core::ptr::null_mut(),
        transition_on_maximized: 0,
    };
    let code = unsafe { DwmEnableBlurBehindWindow(hwnd, &params) };
    if code >= 0 {
        Ok(())
    } else {
        Err(format!(
            "DwmEnableBlurBehindWindow(enable={enabled}) failed: HRESULT 0x{code:08X}"
        ))
    }
}

// ---------------------------------------------------------------------------
// Frame refresh
// ---------------------------------------------------------------------------

const SWP_NOSIZE: u32 = 0x0001;
const SWP_NOMOVE: u32 = 0x0002;
const SWP_NOZORDER: u32 = 0x0004;
const SWP_NOACTIVATE: u32 = 0x0010;
const SWP_FRAMECHANGED: u32 = 0x0020;

#[link(name = "user32")]
extern "system" {
    fn SetWindowPos(
        hwnd: isize,
        insert_after: isize,
        x: i32,
        y: i32,
        cx: i32,
        cy: i32,
        flags: u32,
    ) -> i32;
}

/// 换材质后刷新一次非客户区 frame。
///
/// 只重绘窗口内容**不足以**让 DWM 重新读取材质属性——没有这一步,新材质要等到
/// 窗口下一次因为别的原因重排才出现,很容易被读成"设置没生效"。
/// 材质切换是低频操作,这点成本可以接受。
fn refresh_frame(hwnd: isize) {
    unsafe {
        let _ = SetWindowPos(
            hwnd,
            0,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
}
fn apply_legacy_accent(hwnd: isize, state: i32, flags: i32, tint: u32) -> Result<(), String> {
    let mut accent = AccentPolicy {
        accent_state: state,
        accent_flags: flags,
        gradient_color: tint,
        animation_id: 0,
    };
    let mut data = WindowCompositionAttributeData {
        attribute: WCA_ACCENT_POLICY,
        data: &mut accent as *mut AccentPolicy as *mut c_void,
        size: core::mem::size_of::<AccentPolicy>(),
    };
    let func = resolve_composition_attr()
        .ok_or_else(|| "SetWindowCompositionAttribute not available".to_string())?;
    let ok = unsafe { func(hwnd, &mut data) };
    if ok != 0 {
        Ok(())
    } else {
        Err("SetWindowCompositionAttribute returned 0".to_string())
    }
}

/// 应用窗口材质。
///
/// legacy 与系统材质两条通道**必须互斥**:旧的 `ACCENT_POLICY` 会阻止 DWM 接纳新的
/// 系统材质,而反过来(先写系统材质、再清 accent)frame 不会自动重算,等于白折腾。
/// 所以每条路径都显式把另一条写回中性值。
pub fn apply_material(hwnd: isize, material: &str) -> Result<String, String> {
    // 与材质无关的两项对全部路径统一,避免换材质时标题栏深浅和窗口形状跟着跳。
    let _ = set_i32(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, 1);
    let _ = set_i32(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND);

    // 离开系统合成材质时先拆掉它,否则它会和 DWM 通道叠在一起。
    if material != SYSTEM_ACRYLIC {
        let _ = crate::acrylic::detach();
    }

    if material == SYSTEM_ACRYLIC {
        // 系统合成材质要**独占**窗口下方那层,所以先把另外两条通道全部清干净:
        // 现代材质清成 NONE、host brush 关掉、accent 与 blur-behind 复位。
        // 漏掉任何一条,叠出来的都不再是它本身的样子。
        let _ = set_i32(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, DWMSBT_NONE);
        let _ = set_i32(hwnd, DWMWA_USE_HOSTBACKDROPBRUSH, 0);
        let _ = apply_legacy_accent(hwnd, 0, ACCENT_FLAG_DRAW_ALL_BORDERS, 0);
        let _ = enable_blur_behind(hwnd, false);
        refresh_frame(hwnd);
        return crate::acrylic::attach(hwnd);
    }

    if matches!(material, AERO | BLUR | ACRYLIC_LEGACY) {
        // 先摘掉系统材质,再把 accent 清成中性,最后才写自己的配方。
        let _ = set_i32(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, DWMSBT_NONE);
        let _ = apply_legacy_accent(hwnd, 0, ACCENT_FLAG_DRAW_ALL_BORDERS, 0);

        // Aero 走"公开 API 组合":实时 BlurBehind 负责模糊,accent 只往上面压色调。
        let (state, tint, label) = match material {
            AERO => (
                ACCENT_ENABLE_BLURBEHIND,
                ACCENT_AERO_TINT,
                "aero (DwmEnableBlurBehindWindow + 约六成深灰玻璃色调)",
            ),
            BLUR => (ACCENT_ENABLE_BLURBEHIND, 0, "blur (BLURBEHIND,无色调)"),
            _ => (
                ACCENT_ENABLE_ACRYLICBLURBEHIND,
                ACCENT_ACRYLIC_TINT,
                "acrylic (ACRYLICBLURBEHIND,染色 alpha=1)",
            ),
        };
        enable_blur_behind(hwnd, material == AERO)?;
        apply_legacy_accent(hwnd, state, 0, tint)?;
        refresh_frame(hwnd);
        return Ok(format!("{label} applied, tint={tint:#010X}"));
    }

    apply(hwnd, material)?;
    refresh_frame(hwnd);
    Ok(format!("backdrop applied: {material}"))
}
