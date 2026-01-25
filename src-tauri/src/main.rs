#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::UdpSocket;
use std::time::Duration;
use reqwest::Client;
use serde::Deserialize;


use tauri::{AppHandle, Manager, WindowEvent, Emitter};
use tauri::tray::TrayIconBuilder;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::image::Image;
use tauri_plugin_autostart::{init as autostart_init, ManagerExt, MacosLauncher};

#[derive(Deserialize)]
struct ApiResponse {
    status: String,
    message: String,
}

// -------------------- Commands --------------------

#[tauri::command]
fn get_local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|addr| addr.ip().to_string())
}

#[tauri::command]
async fn connect_device(app: AppHandle, ip: String) -> Result<String, String> {
    // Emit log to frontend
    app.emit("log", format!("Connecting to {}", ip))
        .map_err(|e| e.to_string())?;

    // Corrected API endpoint
    let api_url = format!("https://jsonplaceholder.typicode.com/{}", ip);

    // Make async request
    let client = Client::new();
    let response = client
        .get(&api_url)
        .header("Authorization", "Bearer YOUR_API_KEY")
        .send()
        .await
        .map_err(|e: reqwest::Error| e.to_string())?;

    // Parse JSON response
    let data: ApiResponse = response
        .json()
        .await
        .map_err(|e: reqwest::Error| e.to_string())?;

    // Emit log
    app.emit("log", format!("Device status: {}", data.status))
        .map_err(|e| e.to_string())?;

    Ok(format!("Connected: {}", data.message))
}

#[tauri::command]
async fn manual_sync(app: AppHandle) -> Result<(), String> {
    app.emit("log", "Manual sync started".to_string())
        .map_err(|e: tauri::Error| e.to_string())
}

#[tauri::command]
async fn disconnect_device(app: AppHandle) -> Result<(), String> {
    app.emit("log", "Device disconnected".to_string())
        .map_err(|e: tauri::Error| e.to_string())
}

#[tauri::command]
fn toggle_autostart(app: AppHandle, enable: bool) -> Result<(), String> {
    if enable {
        app.autolaunch().enable().map_err(|e| e.to_string())?;
    } else {
        app.autolaunch().disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn is_autostart_enabled(app: AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

// -------------------- Main --------------------

fn main() {
    tauri::Builder::default()
        // Initialize autostart plugin
        .plugin(autostart_init(MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            // --- Tray menu ---
            let show = MenuItemBuilder::new("Show").id("show").build(app)?;
            let quit = MenuItemBuilder::new("Quit").id("quit").build(app)?;
            
            let autostart_enabled = is_autostart_enabled(app.app_handle().clone());
            let toggle_text = if autostart_enabled { "Disable Autostart" } else { "Enable Autostart" };
            let toggle_autostart_item = MenuItemBuilder::new(toggle_text)
                .id("toggle-autostart")
                .build(app)?;

            let menu = MenuBuilder::new(app)
                .items(&[&show, &toggle_autostart_item, &quit])
                .build()?;

            // --- Tray icon ---
            let tray_icon_bytes = include_bytes!("../../src/assets/tray.png");
            let tray_icon = Image::from_bytes(tray_icon_bytes).expect("failed to load tray icon");

            TrayIconBuilder::new()
                .icon(tray_icon)
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        "toggle-autostart" => {
                            let currently_enabled = is_autostart_enabled(app.app_handle().clone());
                            let _ = toggle_autostart(app.app_handle().clone(), !currently_enabled);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // --- Splash screen ---
            if let (Some(splash), Some(main)) = (
                app.get_webview_window("splashscreen"),
                app.get_webview_window("main"),
            ) {
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(4)).await;
                    let _ = splash.close();
                    let _ = main.show();
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                window.hide().ok();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            connect_device,
            manual_sync,
            disconnect_device,
            get_local_ip,
            toggle_autostart,
            is_autostart_enabled
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
