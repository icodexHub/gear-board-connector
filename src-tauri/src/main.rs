#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use curl::easy::{Auth, Easy};
use serde::{Deserialize, Serialize};
use std::net::UdpSocket;
use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::{init as autostart_init, MacosLauncher, ManagerExt};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename = "DeviceInfo")]
struct DeviceInfo {
    #[serde(rename = "deviceName")]
    device_name: String,
    #[serde(rename = "deviceID")]
    device_id: String,
    model: String,
    #[serde(rename = "serialNumber")]
    serial_number: String,
    #[serde(rename = "macAddress")]
    mac_address: String,
    #[serde(rename = "firmwareVersion")]
    firmware_version: String,
    #[serde(rename = "firmwareReleasedDate")]
    firmware_released_date: String,
    #[serde(rename = "deviceType")]
    device_type: String,
    #[serde(rename = "subDeviceType")]
    sub_device_type: String,
    manufacturer: String,
    #[serde(rename = "productionDate")]
    production_date: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename = "UserInfo")]
pub struct UserInfo {
    #[serde(rename = "employeeNo")]
    pub employee_no: String,
    pub name: String,
    #[serde(rename = "userType")]
    pub user_type: String,
    #[serde(default)]
    pub valid: Valid,
    #[serde(default)]
    #[serde(rename = "doorRight")]
    pub door_right: String,
    #[serde(default)]
    #[serde(rename = "RightPlan")]
    pub right_plan: Vec<RightPlan>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct Valid {
    pub enable: bool,
    #[serde(rename = "beginTime", default)]
    pub begin_time: String,
    #[serde(rename = "endTime", default)]
    pub end_time: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RightPlan {
    #[serde(rename = "doorNo")]
    pub door_no: String,
    #[serde(rename = "planTemplateNo")]
    pub plan_template_no: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename = "UserInfoSearchList")]
struct UserInfoSearchList {
    #[serde(rename = "UserInfo", default)]
    users: Vec<UserInfo>,
}

// -------------------- Commands --------------------

#[tauri::command]
fn get_local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|addr| addr.ip().to_string())
}

#[tauri::command]
fn connect_device(
    app: AppHandle,
    ip: String,
    username: String,
    password: String,
) -> Result<DeviceInfo, String> {
    app.emit("log", format!("Connecting to device {}", ip))
        .map_err(|e| e.to_string())?;

    let url = format!("http://{}/ISAPI/System/deviceInfo", ip);

    let mut easy = Easy::new();
    easy.url(&url).map_err(|e| e.to_string())?;
    easy.username(&username).map_err(|e| e.to_string())?;
    easy.password(&password).map_err(|e| e.to_string())?;

    // ✅ THIS is the correct Digest auth usage
    easy.http_auth(Auth::new().digest(true))
        .map_err(|e| e.to_string())?;

    let mut response = Vec::new();
    {
        let mut transfer = easy.transfer();
        transfer
            .write_function(|data| {
                response.extend_from_slice(data);
                Ok(data.len())
            })
            .map_err(|e| e.to_string())?;

        transfer.perform().map_err(|e| e.to_string())?;
    }

    let body = String::from_utf8(response).map_err(|_| "Invalid UTF-8 response".to_string())?;

    app.emit("log", "Device connected successfully")
        .map_err(|e| e.to_string())?;

    // Parse XML response
    let device_info: DeviceInfo =
        serde_xml_rs::from_str(&body).map_err(|e| format!("Failed to parse device info: {}", e))?;

    Ok(device_info)
}

#[tauri::command]
fn get_users(
    app: AppHandle,
    ip: String,
    username: String,
    password: String,
) -> Result<Vec<UserInfo>, String> {
    app.emit("log", format!("Fetching users from device {}", ip))
        .map_err(|e| e.to_string())?;

    let url = format!(
        "http://{}/ISAPI/AccessControl/UserInfo/Search?format=json",
        ip
    );

    // Search parameters (get all users)
    let search_body = r#"<?xml version="1.0" encoding="UTF-8"?>
    <UserInfoSearchCond>
        <searchID>1</searchID>
        <maxResults>100</maxResults>
        <searchResultPosition>0</searchResultPosition>
    </UserInfoSearchCond>"#;

    let mut easy = Easy::new();
    easy.url(&url).map_err(|e| e.to_string())?;
    easy.username(&username).map_err(|e| e.to_string())?;
    easy.password(&password).map_err(|e| e.to_string())?;
    easy.http_auth(Auth::new().digest(true))
        .map_err(|e| e.to_string())?;

    // POST request
    easy.post(true).map_err(|e| e.to_string())?;
    easy.post_fields_copy(search_body.as_bytes())
        .map_err(|e| e.to_string())?;

    let mut headers = curl::easy::List::new();
    headers
        .append("Content-Type: application/json")
        .map_err(|e| e.to_string())?;
    easy.http_headers(headers).map_err(|e| e.to_string())?;

    let mut response = Vec::new();
    {
        let mut transfer = easy.transfer();
        transfer
            .write_function(|data| {
                response.extend_from_slice(data);
                Ok(data.len())
            })
            .map_err(|e| e.to_string())?;

        transfer.perform().map_err(|e| e.to_string())?;
    }

    let body = String::from_utf8(response).map_err(|_| "Invalid UTF-8 response".to_string())?;

    app.emit("log", format!("Received user data response"))
        .map_err(|e| e.to_string())?;

    // Try to parse as XML first
    let users = if body.trim().starts_with("<?xml") || body.trim().starts_with("<") {
        app.emit("log", "Parsing XML response")
            .map_err(|e| e.to_string())?;

        let user_list: UserInfoSearchList = serde_xml_rs::from_str(&body)
            .map_err(|e| format!("Failed to parse user list XML: {}", e))?;

        user_list.users
    } else {
        app.emit("log", "Parsing JSON response")
            .map_err(|e| e.to_string())?;

        // Try parsing as JSON
        let json_response: serde_json::Value =
            serde_json::from_str(&body).map_err(|e| format!("Failed to parse JSON: {}", e))?;

        // Extract users from JSON response
        if let Some(search_list) = json_response.get("UserInfoSearchList") {
            if let Some(user_info) = search_list.get("UserInfo") {
                serde_json::from_value(user_info.clone())
                    .map_err(|e| format!("Failed to parse user info: {}", e))?
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        }
    };

    app.emit("log", format!("Found {} users", users.len()))
        .map_err(|e| e.to_string())?;

    Ok(users)
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
            let toggle_text = if autostart_enabled {
                "Disable Autostart"
            } else {
                "Enable Autostart"
            };
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
                .on_menu_event(|app, event| match event.id().as_ref() {
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
            get_users,
            manual_sync,
            disconnect_device,
            get_local_ip,
            toggle_autostart,
            is_autostart_enabled
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
