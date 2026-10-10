#[cfg(target_os = "windows")]
mod backdrop;

#[cfg(target_os = "windows")]
mod acrylic;

#[cfg(target_os = "windows")]
mod wallpaper;

/// 自绘壁纸档的名字。它没有原生材质:窗口底层保持 `none`,画面全由前端负责。
#[cfg(target_os = "windows")]
const WALLPAPER: &str = "wallpaper";

/// 前端材质名 → 真正交给 DWM / WinAppSDK 的材质名。
#[cfg(target_os = "windows")]
fn native_material(material: &str) -> &str {
    if material == WALLPAPER {
        backdrop::NONE
    } else {
        material
    }
}

/// 读取当前桌面壁纸,交给前端做自绘模糊。读文件放到阻塞线程池,不卡主线程。
#[cfg(target_os = "windows")]
#[tauri::command]
async fn wallpaper_image() -> Result<wallpaper::Wallpaper, String> {
    tauri::async_runtime::spawn_blocking(wallpaper::load)
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(target_os = "windows")]
#[tauri::command]
fn set_backdrop(window: tauri::WebviewWindow, material: String) -> Result<String, String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    let msg = backdrop::apply_material(hwnd, native_material(&material))?;
    Ok(format!("{material}: {msg} | {}", backdrop::report(hwnd)))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn set_backdrop(_window: tauri::WebviewWindow, material: String) -> Result<String, String> {
    Ok(format!("backdrop not supported on this platform ({material})"))
}

/// 窗口外框(阴影 / 1px 描边)的开关。
///
/// 与材质分开是刻意的:这两样都画在**窗口边界上**,不属于材质,也不受 scrim 影响。
/// 之前窗外那圈"黑雾"被误当成材质问题查了很久 —— 这条命令的存在,就是让这一层
/// 能当场翻来翻去地对照。
///
/// 两个人分别走不同路径,这一点很重要:
///   - 阴影 → `backdrop::set_shadow`,改窗口样式位。**不能**用 Tauri 的
///     `set_shadow()`(实测无效,原因见 `backdrop.rs`);
///   - 描边 → `backdrop::set_border`,一个真正的 DWM 属性。
#[cfg(target_os = "windows")]
#[tauri::command]
fn set_window_frame(
    window: tauri::WebviewWindow,
    shadow: bool,
    border: bool,
) -> Result<String, String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    let shadow_msg = backdrop::set_shadow(hwnd, shadow)?;
    let border_msg = backdrop::set_border(hwnd, border)?;
    Ok(format!("{shadow_msg} | {border_msg}"))
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
fn set_window_frame(_window: tauri::WebviewWindow, shadow: bool, border: bool) -> Result<String, String> {
    Ok(format!("window frame not supported on this platform (shadow={shadow} border={border})"))
}

/// 探测系统合成材质(WinAppSDK `DesktopAcrylicController`)在本机是否可用。
///
/// 刻意跑在**独立线程**上:`RoInitialize` 是线程级的,而 Tauri 的命令线程可能已经
/// 被别的东西初始化成 MTA,直接在上面叫 STA 会拿到 `RPC_E_CHANGED_MODE`。
/// 自己起一条干净的线程,失败原因才不会被这种环境噪声盖掉。
#[cfg(target_os = "windows")]
#[tauri::command]
fn acrylic_probe() -> Result<String, String> {
    std::thread::spawn(|| acrylic::probe().map_err(|error| error.to_string()))
        .join()
        .map_err(|_| "probe thread panicked".to_string())?
}


/// 当前生效的材质。
///
/// 前端不该自己写一份默认值 —— 那样和 Rust 侧的 `initial_material()` 迟早会分叉,
/// 表现为"面板显示 DWM,实际跑的是 System"。这里把唯一来源暴露出去,由它回填状态。
#[cfg(target_os = "windows")]
#[tauri::command]
fn current_material() -> String {
    initial_material()
}
#[cfg(target_os = "windows")]
fn initial_material() -> String {
    // 默认 system-acrylic(WinAppSDK DesktopAcrylicController)。
    //
    // 这是**用户拍板**的结果(2026-10-07),别按"哪个参数更保守"改回去。选它的过程:
    // 实测磨平度 none 14% / acrylic(DWM) 43% / aero 79% / system-acrylic 88%,
    // 中途一度按"更像染了一层而不是糊掉"选了 DWM;但用户对着同一张壁纸来回翻过之后
    // 要的是模糊更强的一档,并明确说"采用系统配置,就这个吧"。逐档切换已实测:
    // 六档来回切 webview 全程存活,不会把窗口画成黑块。
    //
    // 想临时对比:VEDA_BACKDROP=acrylic,或在设置里切。
    std::env::var("VEDA_BACKDROP").unwrap_or_else(|_| backdrop::SYSTEM_ACRYLIC.to_string())
}

/// 已知材质的固定顺序,只用来给对比窗口排位置。
#[cfg(target_os = "windows")]
const MATERIAL_ORDER: [&str; 5] = ["none", "acrylic", "system-acrylic", "aero", "tabbed"];
/// 纹理背板的窗口标识、尺寸与位置。
///
/// 纵向必须从探针窗口**上方**留出顶栏空间:探针在 y=90 开始,而背板自带一条 30px 顶栏
/// (说明 + 关闭 + 拖拽),顶栏被盖住的话这块窗口就既看不出用途、也关不掉了。
#[cfg(target_os = "windows")]
const TEXTURE_LABEL: &str = "material-texture";
#[cfg(target_os = "windows")]
const TEXTURE_X: f64 = 56.0;
#[cfg(target_os = "windows")]
const TEXTURE_Y: f64 = 44.0;
#[cfg(target_os = "windows")]
const TEXTURE_WIDTH: f64 = 1860.0;
#[cfg(target_os = "windows")]
const TEXTURE_HEIGHT: f64 = 420.0;

/// 为**一种**材质单开一个窗口。
///
/// 这几种材质并不是同一机制的参数变体:DWM 窗口属性、旧 AccentPolicy、WinAppSDK 合成
/// 目标各有各的刷新时机与焦点策略。全挤在同一个窗口里来回切,等于让互不知情的几套机制
/// 轮流抢同一块背景层——表现就是"切换那一瞬间、以及点一下页面都在变"。
///
/// 所以对比方式是:一个窗口只用一种,建好就不再改。各自稳定,也才能并排看差异。
#[cfg(target_os = "windows")]
#[tauri::command]
async fn open_material_window(app: tauri::AppHandle, material: String) -> Result<String, String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    // 先把纹理背板建好(只建一次)。它提供高频细节,模糊才看得出来——
    // 均匀壁纸会让四种材质压上去几乎一样。
    //
    // 它建在探针窗口之前、但必须**置顶**:主窗口建得更早,而主窗口(1440x920 居中)
    // 会把这块背板几乎整块盖住 —— 实测只有主窗口左边缘之外那约 77px 露出来
    // (沿 y=250 采样:x=80 处条纹对比 45.2,x=380 掉到 7.5,x=680 是 0.0),
    // 于是"材质对比"量到的其实是主窗口自己的内容。
    //
    // 置顶标记只在**创建时**设一次,运行期一律不动。实测在这类透明窗口上调
    // `set_always_on_top`:探针会瞬间渲染成白底(窗内亮度 214–240)、主窗口渲染成纯黑
    // (亮度 10、对比度 0) —— 合成被打断,那之后的读数全是假的。
    // 层序靠创建顺序定:背板先建(置顶)、探针后建(置顶) => 稳定压在背板之上。
    if app.get_webview_window(TEXTURE_LABEL).is_none() {
        WebviewWindowBuilder::new(
            &app,
            TEXTURE_LABEL,
            WebviewUrl::App("index.html?texture=1".into()),
        )
        .title("Veda material texture")
        .inner_size(TEXTURE_WIDTH, TEXTURE_HEIGHT)
        .position(TEXTURE_X, TEXTURE_Y)
        .decorations(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .build()
        .map_err(|error| error.to_string())?;
    }

    let label = format!("material-{material}");
    // 重复点同一个就聚焦已有的那个,不要堆出一排同样的窗口。
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.set_focus();
        return Ok(format!("focused existing {label}"));
    }
    let index = MATERIAL_ORDER.iter().position(|known| *known == material).unwrap_or(0);
    WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App(format!("index.html?material={material}").into()),
    )
    .title(format!("Veda material - {material}"))
    .inner_size(440.0, 300.0)
    .position(70.0 + index as f64 * 460.0, 90.0)
    .decorations(false)
    .transparent(true)
    .shadow(true)
    // 与背板同为置顶窗口,且创建在它之后 => 稳定压在背板之上。
    // 不置顶的话,这条对比链会被主窗口插在中间(见上面背板处的说明)。
    .always_on_top(true)
    .build()
    .map_err(|error| error.to_string())?;

    // 材质必须放到阻塞线程池上去挂。
    //
    // 系统合成材质的 `SetTarget` 会往窗口的合成器投递工作,而窗口本身归主线程管;
    // 如果命令同步跑在主线程上、主线程又阻塞着等材质线程回话,两边就会互相等——
    // 实测表现为命令整个卡死。`spawn_blocking` 让这次等待离开主线程,主线程照常泵
    // 消息,材质线程才走得完。
    let app = app.clone();
    let label_for_task = label.clone();
    let material_for_task = material.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let window = app
            .get_webview_window(&label_for_task)
            .ok_or_else(|| "comparison window vanished before its material was applied".to_string())?;
        let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as isize;
        let report = backdrop::apply_material(hwnd, native_material(&material_for_task))?;
        println!("[veda] {label_for_task}: {report}");
        Ok::<String, String>(report)
    })
    .await
    .map_err(|error| error.to_string())?
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    let builder = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            set_backdrop,
            set_window_frame,
            acrylic_probe,
            open_material_window,
            current_material,
            wallpaper_image
        ]);
    #[cfg(not(target_os = "windows"))]
    let builder =
        tauri::Builder::default().invoke_handler(tauri::generate_handler![set_backdrop]);

    #[cfg(target_os = "windows")]
    let builder = builder.setup(|app| {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            let hwnd = window.hwnd()?.0 as isize;
            let material = initial_material();
            match backdrop::apply_material(hwnd, native_material(&material)) {
                Ok(msg) => println!("[veda] {msg}"),
                Err(err) => eprintln!("[veda] backdrop failed: {err}"),
            }
            // 外框默认全关 —— 这两样都是"看得见但说不清"的那类瑕疵:
            //   - 阴影:透明窗四周那圈黑雾。它由窗口样式位决定,见 backdrop::set_shadow;
            //   - 描边:1px 亮线,挨着深色内容读成灰白光晕。
            // 真实观感取舍,所以留了 VEDA_FRAME 环境变量,不用改代码重编译:
            //   VEDA_FRAME=on   两个都开(等于改动前的样子,用来回退对照)
            //   其它/不设       两个都关(默认)
            let frame_on = std::env::var("VEDA_FRAME").map(|v| v == "on").unwrap_or(false);
            match backdrop::set_shadow(hwnd, frame_on) {
                Ok(msg) => println!("[veda] {msg}"),
                Err(err) => eprintln!("[veda] shadow failed: {err}"),
            }
            match backdrop::set_border(hwnd, frame_on) {
                Ok(msg) => println!("[veda] {msg}"),
                Err(err) => eprintln!("[veda] border failed: {err}"),
            }
            println!("[veda] {}", backdrop::report(hwnd));
        }
        Ok(())
    });

    builder
        .run(tauri::generate_context!())
        .expect("error while running Veda Agent");
}
