//! Windows App SDK 的 `DesktopAcrylicController` —— 系统合成级亚克力。
//!
//! # 它和 `backdrop.rs` 那条路的区别
//!
//! `backdrop.rs` 走 DWM 的窗口属性(`DWMWA_SYSTEMBACKDROP_TYPE` / 旧 AccentPolicy),
//! 画出来的东西挂在**窗口自己**的背景层上。这里走 WinAppSDK 的
//! `Microsoft.UI.Composition.SystemBackdrops.DesktopAcrylicController`,它把材质画成
//! 窗口下方一个**独立的合成目标**,窗口内容(含 WebView)浮在它上面。
//!
//! 三个前置条件,顺序不能反:
//!
//! 1. `DWMWA_USE_HOSTBACKDROPBRUSH` 打开 —— 否则系统材质没有可绘制的承载层;
//! 2. `SetTarget` 先挂上;
//! 3. `SystemBackdropConfiguration` 再下发 —— 先配后挂会被控制器自己的焦点策略覆盖,
//!    窗口一旦失焦就退回不透明灰。
//!
//! # 为什么所有调用都挤在一条线程上
//!
//! Composition 对象有 **STA 线程亲和性**:在哪条线程创建就得在哪条线程用和释放。
//! Tauri 的命令跑在线程池上,线程不固定,直接在那儿创建等于把对象交给一个可能消失的
//! 租户。所以这里起一条常驻 STA 线程持有全部原生资源,外部只递命令进去。
//!
//! # 为什么不用 `windows` crate 里现成的接口
//!
//! `DesktopAcrylicController` 属于 Windows App SDK,不在操作系统的
//! `Windows.UI.Composition` 投影里,`windows` crate 不提供它。下面按 winmd 的元数据
//! (接口 IID 与虚表槽位顺序)声明最小 ABI —— 这些是接口契约,不是实现细节。
//!
//! # 降级
//!
//! 任何一步失败都返回 `Err`,由调用方回落到 `backdrop.rs` 的 Accent 路径,
//! 而不是把窗口变成一块不透明灰板。

#![cfg(target_os = "windows")]

use std::ffi::c_void;
use std::ptr::{null, null_mut};
use std::sync::mpsc::{self, Sender, SyncSender};
use std::sync::{Mutex, OnceLock};

use windows::core::{w, Error, HSTRING, IInspectable, IInspectable_Vtbl, Interface, PCSTR, Result, HRESULT};
use windows::System::{DispatcherQueue, DispatcherQueueController};
use windows::UI::Color;
use windows::UI::Composition::Compositor;
use windows::UI::Composition::Desktop::DesktopWindowTarget;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_HOSTBACKDROPBRUSH};
use windows::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
use windows::Win32::System::Memory::{GetProcessHeap, HeapFree, HEAP_FLAGS};
use windows::Win32::System::WinRT::Composition::ICompositorDesktopInterop;
use windows::Win32::System::WinRT::{
    CreateDispatcherQueueController, DQTAT_COM_NONE, DQTYPE_THREAD_CURRENT,
    DispatcherQueueOptions, RoActivateInstance, RoInitialize, RoUninitialize,
    RO_INIT_SINGLETHREADED,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, MsgWaitForMultipleObjectsEx, PeekMessageW, TranslateMessage, MSG,
    MWMO_INPUTAVAILABLE, PM_REMOVE, QS_ALLINPUT,
};


/// 清空线程消息队列。
///
/// 少了这一步,`SetTarget` 投递进来的任务永远不会被处理:线程会一直"有队列但没泵",
/// 而错误信息说的是"没有队列",两者差得很远,很值得单独记一笔。
fn drain_messages() {
    let mut message = MSG::default();
    unsafe {
        while PeekMessageW(&mut message, None, 0, 0, PM_REMOVE).as_bool() {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
}
// ---------------------------------------------------------------------------
// Windows App SDK 运行时:进程级包图租赁
// ---------------------------------------------------------------------------

type TryCreatePackageDependency = unsafe extern "system" fn(
    user: *const c_void,
    package_family_name: *const u16,
    min_version: u64,
    architecture: i32,
    options: i32,
    package_graph: *const u16,
    rank: u32,
    out_id: *mut *mut u16,
) -> i32;
type AddPackageDependency =
    unsafe extern "system" fn(*const u16, i32, u32, *mut *mut c_void, *mut *mut u16) -> i32;
type RemovePackageDependency = unsafe extern "system" fn(*mut c_void) -> i32;
type DeletePackageDependency = unsafe extern "system" fn(*const u16) -> i32;

/// 参与版本解析的最低版本:`8000.946.1701.0`(WinAppSDK 1.8 家族)。
/// 同家族内更高的补丁版可以被解析到,不必锁死具体构建号。
const MIN_RUNTIME_VERSION: u64 = (8000_u64 << 48) | (946_u64 << 32) | (1701_u64 << 16);

/// 1.8 家族的包标识。
const RUNTIME_FAMILY: &str = "Microsoft.WindowsAppRuntime.1.8_8wekyb3d8bbwe";

/// 持有一次包图租赁,进程存活期间有效。
struct PackageLease {
    context: *mut c_void,
    id: *mut u16,
    remove: RemovePackageDependency,
    delete: DeletePackageDependency,
}

impl PackageLease {
    /// 从 `kernelbase.dll` 动态取 appmodel 导出。这些入口只存在于 22621+,
    /// 所以"取不到"本身就是不支持判定,不需要再单独查一次系统版本。
    fn acquire() -> Result<Self> {
        unsafe {
            let module = GetModuleHandleW(w!("kernelbase.dll"))?;
            let load = |name: &'static std::ffi::CStr| {
                GetProcAddress(module, PCSTR(name.as_ptr().cast()))
            };
            let (Some(create), Some(add), Some(remove), Some(delete)) = (
                load(c"TryCreatePackageDependency"),
                load(c"AddPackageDependency"),
                load(c"RemovePackageDependency"),
                load(c"DeletePackageDependency"),
            ) else {
                return Err(Error::from_thread());
            };
            let create: TryCreatePackageDependency = std::mem::transmute(create);
            let add: AddPackageDependency = std::mem::transmute(add);
            let remove: RemovePackageDependency = std::mem::transmute(remove);
            let delete: DeletePackageDependency = std::mem::transmute(delete);

            let family: Vec<u16> = RUNTIME_FAMILY.encode_utf16().chain([0]).collect();
            let mut lease = Self { context: null_mut(), id: null_mut(), remove, delete };

            // rank=0 / options=0:进程生命周期、默认架构(跟随当前进程)。
            let hr = create(
                null(),
                family.as_ptr(),
                MIN_RUNTIME_VERSION,
                0,
                0,
                null(),
                0,
                &mut lease.id,
            );
            if hr < 0 {
                return Err(Error::from(HRESULT(hr)));
            }

            let mut full_name = null_mut();
            let hr = add(lease.id, 0, 0, &mut lease.context, &mut full_name);
            if !full_name.is_null() {
                // 无论成败都要还这块内存:它由 appmodel 分配,不由我们持有。
                let _ = HeapFree(GetProcessHeap()?, HEAP_FLAGS(0), Some(full_name.cast()));
            }
            if hr < 0 {
                return Err(Error::from(HRESULT(hr)));
            }
            Ok(lease)
        }
    }
}

impl Drop for PackageLease {
    fn drop(&mut self) {
        unsafe {
            // 先放掉 SDK 对象,再摘租赁条目;顺序反了会让待决回调失去激活上下文。
            if !self.context.is_null() {
                let _ = (self.remove)(self.context);
            }
            if !self.id.is_null() {
                let _ = (self.delete)(self.id);
                let _ = HeapFree(
                    GetProcessHeap().unwrap_or_default(),
                    HEAP_FLAGS(0),
                    Some(self.id.cast()),
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 最小 ABI:DesktopAcrylicController
// ---------------------------------------------------------------------------

/// 控制器的可调参数。虚表槽位顺序取自 winmd。
#[allow(non_camel_case_types)]
windows::core::imp::define_interface!(
    DesktopAcrylicController,
    DesktopAcrylicControllerVtbl,
    0x7c20a6af_8eb3_5f08_bdfc_6d35e35dfe45
);
#[repr(C)]
pub struct DesktopAcrylicControllerVtbl {
    base: IInspectable_Vtbl,
    get_fallback_color: unsafe extern "system" fn(*mut c_void, *mut Color) -> HRESULT,
    set_fallback_color: unsafe extern "system" fn(*mut c_void, Color) -> HRESULT,
    get_luminosity_opacity: unsafe extern "system" fn(*mut c_void, *mut f32) -> HRESULT,
    set_luminosity_opacity: unsafe extern "system" fn(*mut c_void, f32) -> HRESULT,
    get_tint_color: unsafe extern "system" fn(*mut c_void, *mut Color) -> HRESULT,
    set_tint_color: unsafe extern "system" fn(*mut c_void, Color) -> HRESULT,
    get_tint_opacity: unsafe extern "system" fn(*mut c_void, *mut f32) -> HRESULT,
    set_tint_opacity: unsafe extern "system" fn(*mut c_void, f32) -> HRESULT,
}

/// 把控制器挂到窗口目标上。
#[allow(non_camel_case_types)]
windows::core::imp::define_interface!(
    DesktopAcrylicTarget,
    DesktopAcrylicTargetVtbl,
    0x5632d76c_0b74_5b52_aa33_80262068aeb2
);
#[repr(C)]
pub struct DesktopAcrylicTargetVtbl {
    base: IInspectable_Vtbl,
    set_window_target:
        unsafe extern "system" fn(*mut c_void, WindowId, *mut c_void, *mut bool) -> HRESULT,
    set_core_target:
        unsafe extern "system" fn(*mut c_void, *mut c_void, *mut c_void, *mut bool) -> HRESULT,
}

#[repr(C)]
struct WindowId {
    value: u64,
}

/// 焦点/对比度策略。必须在 `SetTarget` 之后下发。
#[allow(non_camel_case_types)]
windows::core::imp::define_interface!(
    SystemBackdropConfiguration,
    SystemBackdropConfigurationVtbl,
    0xebcce1b9_0e0c_5431_ab0e_00f3f0669962
);
#[repr(C)]
pub struct SystemBackdropConfigurationVtbl {
    base: IInspectable_Vtbl,
    get_high_contrast_color: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> HRESULT,
    set_high_contrast_color: unsafe extern "system" fn(*mut c_void, *mut c_void) -> HRESULT,
    get_high_contrast: unsafe extern "system" fn(*mut c_void, *mut bool) -> HRESULT,
    set_high_contrast: unsafe extern "system" fn(*mut c_void, bool) -> HRESULT,
    get_input_active: unsafe extern "system" fn(*mut c_void, *mut bool) -> HRESULT,
    set_input_active: unsafe extern "system" fn(*mut c_void, bool) -> HRESULT,
    get_theme: unsafe extern "system" fn(*mut c_void, *mut i32) -> HRESULT,
    set_theme: unsafe extern "system" fn(*mut c_void, i32) -> HRESULT,
}

/// 能接受配置对象的控制器(同一对象的另一个接口)。
#[allow(non_camel_case_types)]
windows::core::imp::define_interface!(
    ConfigurableTarget,
    ConfigurableTargetVtbl,
    0x9c56fe7c_98eb_5f89_ad97_dad57fc30c8c
);
#[repr(C)]
pub struct ConfigurableTargetVtbl {
    base: IInspectable_Vtbl,
    get_state: unsafe extern "system" fn(*mut c_void, *mut i32) -> HRESULT,
    add_target: unsafe extern "system" fn(*mut c_void, *mut c_void, *mut bool) -> HRESULT,
    remove_all_targets: unsafe extern "system" fn(*mut c_void) -> HRESULT,
    remove_target: unsafe extern "system" fn(*mut c_void, *mut c_void, *mut bool) -> HRESULT,
    set_configuration: unsafe extern "system" fn(*mut c_void, *mut c_void) -> HRESULT,
    add_state_changed: unsafe extern "system" fn(*mut c_void, *mut c_void, *mut i64) -> HRESULT,
    remove_state_changed: unsafe extern "system" fn(*mut c_void, i64) -> HRESULT,
}

const CONTROLLER_CLASS: &str = "Microsoft.UI.Composition.SystemBackdrops.DesktopAcrylicController";
const CONFIG_CLASS: &str = "Microsoft.UI.Composition.SystemBackdrops.SystemBackdropConfiguration";

/// `RoInitialize` 的配对引用计数;不写它会在反复 attach 时把 COM 提前反初始化。
struct Apartment;

impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe { RoUninitialize() }
    }
}

// ---------------------------------------------------------------------------
// STA 工作线程
// ---------------------------------------------------------------------------

/// 挂在窗口上的全部原生资源。字段顺序即释放顺序(自顶向下),所以
/// 控制器先于目标、目标先于合成器拆掉。
struct Live {
    controller: DesktopAcrylicController,
    config: SystemBackdropConfiguration,
    target: DesktopWindowTarget,
    _compositor: Compositor,
    // 队列由 worker 线程持有,不随单个窗口的挂载/卸载进出。
}

impl Live {
    /// 在**当前**线程上完成挂载。调用者必须保证这里是那条常驻 STA 线程。
    fn attach(hwnd: isize, lease: &mut Option<PackageLease>) -> Result<Self> {
        if lease.is_none() {
            *lease = Some(PackageLease::acquire()?);
        }

        unsafe {
            // 1) 让 DWM 为系统材质留出承载层,没有这一步材质无处可画。
            let enabled: i32 = 1;
            DwmSetWindowAttribute(
                HWND(hwnd as _),
                DWMWA_USE_HOSTBACKDROPBRUSH,
                &enabled as *const i32 as *const c_void,
                size_of::<i32>() as u32,
            )?;

            // 2) 合成器与桌面窗口目标。isTopmost=false:材质占**下层**,
            //    上层留给窗口自己的内容(这里就是 WebView)。
            let compositor = Compositor::new()?;
            let interop: ICompositorDesktopInterop = compositor.cast()?;
            let target = interop.CreateDesktopWindowTarget(HWND(hwnd as _), false)?;

            // 3) 铺满整个目标的根视觉,否则材质只在左上角画一块。
            let root = compositor.CreateContainerVisual()?;
            let mut size = root.RelativeSizeAdjustment()?;
            size.X = 1.0;
            size.Y = 1.0;
            root.SetRelativeSizeAdjustment(size)?;
            target.SetRoot(&root)?;

            // 4) 控制器。DispatcherQueue 由 worker 线程在启动时统一建好并持续泵动,
            //    这里不再自建 —— 自建一条不泵消息的队列,正是 SetTarget 报
            //    E_ACCESSDENIED("caller must initialize DispatcherQueue") 的真正原因。
            if DispatcherQueue::GetForCurrentThread().is_err() {
                return Err(Error::new(
                    HRESULT(0x8007_0005_u32 as i32),
                    "worker thread has no DispatcherQueue",
                ));
            }

            let instance: IInspectable = RoActivateInstance(&HSTRING::from(CONTROLLER_CLASS))?;
            let controller: DesktopAcrylicController = instance.cast()?;

            let as_target: DesktopAcrylicTarget = controller.cast()?;
            let mut attached = false;
            let hr = (as_target.vtable().set_window_target)(
                as_target.as_raw(),
                WindowId { value: hwnd as u64 },
                target.as_raw(),
                &mut attached,
            );
            if hr.is_err() {
                return Err(Error::from(hr));
            }
            if !attached {
                return Err(Error::from_thread());
            }

            // 5) 配置必须在 SetTarget **之后**:先配后挂会被控制器的焦点策略覆盖,
            //    窗口失焦时会退回不透明灰。
            let config: SystemBackdropConfiguration =
                RoActivateInstance(&HSTRING::from(CONFIG_CLASS))?.cast()?;
            let configurable: ConfigurableTarget = controller.cast()?;
            let hr = (configurable.vtable().set_configuration)(
                configurable.as_raw(),
                config.as_raw(),
            );
            if hr.is_err() {
                return Err(Error::from(hr));
            }
            let hr = (config.vtable().set_input_active)(config.as_raw(), true);
            if hr.is_err() {
                return Err(Error::from(hr));
            }

            // 6) 染色(tint)。这里定两件事,都是观感关键:
            //
            //    tint_color   —— 色相。R = G = B,不引入色偏(色偏由 CSS token 独占)。
            //    tint_opacity —— **材质自身的"不透"强度**。Windows 没暴露模糊半径(调不了),
            //                    但"让材质自己盖得更厚"可以 —— 这是唯一还能把窗口压实的
            //                    材质级旋钮,而且它与 CSS scrim 相乘,两层一起决定最终浓度。
            //                    从 0.15 提到 0.35 的原因:窗口背后的桌面是纯白时,0.15 只把
            //                    白压到中灰,整窗读起来像"浅灰板 + 浅色文字",与深色 UI 的
            //                    观感对不上。提高后亮底/彩底/暗底都稳定落在深色区间。
            //    luminosity_opacity —— 亮度纱层。保持 0:它往浅色调,与深色 UI 相反。
            let _ = (controller.vtable().set_tint_color)(
                controller.as_raw(),
                Color { A: 255, R: 20, G: 20, B: 20 },
            );
            let _ = (controller.vtable().set_tint_opacity)(controller.as_raw(), 0.35);
            let _ = (controller.vtable().set_luminosity_opacity)(controller.as_raw(), 0.0);

            Ok(Self { controller, config, target, _compositor: compositor })
        }
    }
}

enum Command {
    Attach { hwnd: isize, reply: SyncSender<std::result::Result<String, String>> },
    Detach { reply: SyncSender<std::result::Result<String, String>> },
    Probe { reply: SyncSender<std::result::Result<String, String>> },
}

static WORKER: OnceLock<Mutex<Sender<Command>>> = OnceLock::new();

fn worker() -> &'static Mutex<Sender<Command>> {
    WORKER.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<Command>();
        std::thread::Builder::new()
            .name("veda-acrylic".to_string())
            .spawn(move || {
                unsafe {
                    let _ = RoInitialize(RO_INIT_SINGLETHREADED);
                }
                let _apartment = Apartment;

                // 队列必须在**泵起来之前**建好,而且线程必须一直泵消息。
                // `SetTarget` 会往这条队列投递任务并等它被处理;一个不跑消息循环的
                // 线程会让它等不到结果,报出来的却是 E_ACCESSDENIED
                // ("caller must initialize DispatcherQueue on this thread") —— 看着像
                // 没建队列,其实是没人处理队列。
                let _queue_guard = unsafe {
                    CreateDispatcherQueueController(DispatcherQueueOptions {
                        dwSize: size_of::<DispatcherQueueOptions>() as u32,
                        threadType: DQTYPE_THREAD_CURRENT,
                        apartmentType: DQTAT_COM_NONE,
                    })
                    .ok()
                };

                // 这两样都留在这条线程里,直到进程结束或收到 Detach。
                let mut lease: Option<PackageLease> = None;
                let mut live: Option<Live> = None;

                loop {
                    drain_messages();
                    match rx.try_recv() {
                        Ok(Command::Attach { hwnd, reply }) => {
                            live = None; // 换窗口前先拆掉旧的,顺序与 Live 的字段一致
                            let result = Live::attach(hwnd, &mut lease)
                                .map(|next| {
                                    live = Some(next);
                                    format!("system acrylic attached (hwnd={hwnd:#x})")
                                })
                                .map_err(|error| error.to_string());
                            let _ = reply.send(result);
                        }
                        Ok(Command::Detach { reply }) => {
                            live = None;
                            lease = None;
                            let _ = reply.send(Ok("system acrylic detached".to_string()));
                        }
                        Ok(Command::Probe { reply }) => {
                            let result =
                                probe_on_this_thread().map_err(|error| error.to_string());
                            let _ = reply.send(result);
                        }
                        Err(mpsc::TryRecvError::Empty) => {
                            // 既没命令又要保持泵动:等"消息到"或 40ms 超时。
                            unsafe {
                                MsgWaitForMultipleObjectsEx(
                                    None,
                                    40,
                                    QS_ALLINPUT,
                                    MWMO_INPUTAVAILABLE,
                                );
                            }
                        }
                        Err(mpsc::TryRecvError::Disconnected) => break,
                    }
                }
            })
            .expect("failed to spawn veda-acrylic thread");
        Mutex::new(tx)
    })
}
fn probe_on_this_thread() -> Result<String> {
    unsafe {
        let lease = PackageLease::acquire()?;
        let instance: IInspectable = RoActivateInstance(&HSTRING::from(CONTROLLER_CLASS))?;
        let config: IInspectable = RoActivateInstance(&HSTRING::from(CONFIG_CLASS))?;
        let controller: DesktopAcrylicController = instance.cast()?;
        let mut tint = Color::default();
        let hr = (controller.vtable().get_tint_color)(controller.as_raw(), &mut tint);
        if hr.is_err() {
            return Err(Error::from(hr));
        }
        drop(config);
        drop(lease);
        Ok(format!(
            "runtime leased, controller+config activated, default tint=({},{},{})",
            tint.R, tint.G, tint.B
        ))
    }
}

fn send<F>(build: F) -> std::result::Result<String, String>
where
    F: FnOnce(SyncSender<std::result::Result<String, String>>) -> Command,
{
    let (reply_tx, reply_rx) = mpsc::sync_channel(1);
    worker()
        .lock()
        .map_err(|_| "acrylic worker lock poisoned".to_string())?
        .send(build(reply_tx))
        .map_err(|_| "acrylic worker is gone".to_string())?;
    reply_rx
        .recv()
        .map_err(|_| "acrylic worker dropped the reply".to_string())?
}

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------

/// 把系统合成亚克力挂到窗口上。必须在 `backdrop.rs` 的清场之后调用。
pub fn attach(hwnd: isize) -> std::result::Result<String, String> {
    send(|reply| Command::Attach { hwnd, reply })
}

/// 摘掉系统合成亚克力,并释放运行时租赁。
///
/// 没装过就直接返回:切换材质时会被无条件调用,不该为此凭空起一条线程。
pub fn detach() -> std::result::Result<String, String> {
    let Some(worker) = WORKER.get() else {
        return Ok("system acrylic was not attached".to_string());
    };
    let (reply_tx, reply_rx) = mpsc::sync_channel(1);
    worker
        .lock()
        .map_err(|_| "acrylic worker lock poisoned".to_string())?
        .send(Command::Detach { reply: reply_tx })
        .map_err(|_| "acrylic worker is gone".to_string())?;
    reply_rx
        .recv()
        .map_err(|_| "acrylic worker dropped the reply".to_string())?
}

/// 可用性探测(不接触窗口)。
pub fn probe() -> std::result::Result<String, String> {
    send(|reply| Command::Probe { reply })
}
