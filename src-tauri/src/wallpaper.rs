//! 读取当前桌面壁纸,给前端的自绘磨砂(`wallpaper` 材质)用。
//!
//! 为什么要自绘:系统亚克力(DWM / WinAppSDK)的模糊半径固定、带噪点、失焦会变灰,
//! 调不出 macOS 侧栏那种顺滑的磨砂。窗口背后能透出来的基本只有壁纸,那就直接把壁纸
//! 交给 WebView,用 CSS 做大半径模糊,模糊、饱和度、染色全部可控。
//!
//! 这里只负责"拿到图":优先用 `SPI_GETDESKWALLPAPER` 返回的原图;拿不到(幻灯片、
//! Windows 聚焦等情况下常见)就退到系统转码后的 `TranscodedWallpaper`。
//! 结果以 data URL 返回,不需要额外开 asset 协议和文件访问权限。

#![cfg(target_os = "windows")]

use std::path::PathBuf;

use serde::Serialize;
use windows::Win32::UI::WindowsAndMessaging::{
    SystemParametersInfoW, SPI_GETDESKWALLPAPER, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
};

#[derive(Serialize)]
pub struct Wallpaper {
    pub path: String,
    pub data_url: String,
}

fn current_path() -> Option<PathBuf> {
    let mut buf = [0u16; 1024];
    let ok = unsafe {
        SystemParametersInfoW(
            SPI_GETDESKWALLPAPER,
            buf.len() as u32,
            Some(buf.as_mut_ptr().cast()),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
    };
    if ok.is_ok() {
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        let path = PathBuf::from(String::from_utf16_lossy(&buf[..len]));
        if path.is_file() {
            return Some(path);
        }
    }
    let appdata = std::env::var_os("APPDATA")?;
    let fallback = PathBuf::from(appdata).join(r"Microsoft\Windows\Themes\TranscodedWallpaper");
    fallback.is_file().then_some(fallback)
}

fn mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png"
    } else if bytes.starts_with(b"BM") {
        "image/bmp"
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else {
        // TranscodedWallpaper 没有扩展名,但内容就是 JPEG。
        "image/jpeg"
    }
}

fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (b[0] as u32) << 16 | (b[1] as u32) << 8 | b[2] as u32;
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { TABLE[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[n as usize & 63] as char } else { '=' });
    }
    out
}

pub fn load() -> Result<Wallpaper, String> {
    let path = current_path().ok_or_else(|| "no desktop wallpaper file found".to_string())?;
    let bytes = std::fs::read(&path).map_err(|error| format!("{}: {error}", path.display()))?;
    Ok(Wallpaper {
        path: path.display().to_string(),
        data_url: format!("data:{};base64,{}", mime(&bytes), base64(&bytes)),
    })
}
