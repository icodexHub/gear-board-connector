#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use curl::easy::{Auth, Easy};
use serde::{Deserialize, Serialize};
use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

#[derive(Debug, Serialize, Deserialize)]
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
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserInfo {
    #[serde(rename = "employeeNo")]
    pub employee_no: String,
    pub name: String,
    #[serde(rename = "userType")]
    pub user_type: String,
    #[serde(default)]
    pub valid: Valid,
    #[serde(default, rename = "doorRight")]
    pub door_right: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct Valid {
    pub enable: bool,
    #[serde(rename = "beginTime", default)]
    pub begin_time: String,
    #[serde(rename = "endTime", default)]
    pub end_time: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AttendanceRecord {
    #[serde(default)]
    pub major: u32,
    #[serde(default)]
    pub minor: u32,
    #[serde(rename = "time")]
    pub time: String,
    #[serde(rename = "employeeNoString", default)]
    pub employee_no: String,
    #[serde(rename = "name", default)]
    pub name: String,
    #[serde(rename = "cardNo", default)]
    pub card_no: String,
    #[serde(rename = "doorNo", default)]
    pub door_no: u32,
    #[serde(rename = "currentVerifyMode", default)]
    pub verify_mode: String,
}

// -------------------- Commands --------------------

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

    app.emit("log", "✓ Device connected successfully")
        .map_err(|e| e.to_string())?;

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
    let mut all_users: Vec<UserInfo> = Vec::new();
    let mut search_result_position: u32 = 0;
    const MAX_RESULTS: u32 = 100;

    loop {
        let search_body = format!(
            r#"{{
                "UserInfoSearchCond": {{
                    "searchID": "search_all",
                    "searchResultPosition": {},
                    "maxResults": {}
                }}
            }}"#,
            search_result_position, MAX_RESULTS
        );

        let mut easy = Easy::new();
        easy.url(&url).map_err(|e| e.to_string())?;
        easy.username(&username).map_err(|e| e.to_string())?;
        easy.password(&password).map_err(|e| e.to_string())?;
        easy.http_auth(Auth::new().digest(true))
            .map_err(|e| e.to_string())?;
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

        let json_response: serde_json::Value =
            serde_json::from_str(&body).map_err(|e| format!("Failed to parse JSON: {}", e))?;

        let search_result = json_response
            .get("UserInfoSearch")
            .ok_or_else(|| "Missing UserInfoSearch in response".to_string())?;

        if let Some(num_matches) = search_result.get("numOfMatches") {
            app.emit("log", format!("Found {} users in this page", num_matches))
                .map_err(|e| e.to_string())?;
        }

        let page_users = if let Some(user_info) = search_result.get("UserInfo") {
            if user_info.is_array() {
                serde_json::from_value::<Vec<UserInfo>>(user_info.clone())
                    .map_err(|e| format!("Failed to parse users array: {}", e))?
            } else {
                vec![serde_json::from_value::<UserInfo>(user_info.clone())
                    .map_err(|e| format!("Failed to parse single user: {}", e))?]
            }
        } else {
            Vec::new()
        };

        let num_returned = page_users.len();
        all_users.extend(page_users);

        let total_matches = search_result
            .get("totalMatches")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize;

        if num_returned == 0 || all_users.len() >= total_matches {
            break;
        }

        search_result_position += num_returned as u32;
    }

    app.emit(
        "log",
        format!("✓ Successfully fetched {} users", all_users.len()),
    )
    .map_err(|e| e.to_string())?;
    Ok(all_users)
}

#[tauri::command]
fn get_attendance_records(
    app: AppHandle,
    ip: String,
    username: String,
    password: String,
    hours: Option<u32>,
) -> Result<Vec<AttendanceRecord>, String> {
    app.emit(
        "log",
        format!(
            "Fetching attendance records{}",
            if let Some(h) = hours {
                format!(" (last {} hours)", h)
            } else {
                "".to_string()
            }
        ),
    )
    .map_err(|e| e.to_string())?;

    let url = format!("http://{}/ISAPI/AccessControl/AcsEvent?format=json", ip);
    let mut all_records: Vec<AttendanceRecord> = Vec::new();
    let mut search_result_position: u32 = 0;
    const MAX_RESULTS: u32 = 100;

    let (start_time, end_time) = if let Some(h) = hours {
        let now = chrono::Local::now();
        let start = now - chrono::Duration::hours(h as i64);
        (
            start.format("%Y-%m-%dT%H:%M:%S%:z").to_string(),
            now.format("%Y-%m-%dT%H:%M:%S%:z").to_string(),
        )
    } else {
        (
            "2020-01-01T00:00:00+08:00".to_string(),
            "2030-12-31T23:59:59+08:00".to_string(),
        )
    };

    loop {
        let search_body = format!(
            r#"{{
                "AcsEventCond": {{
                    "searchID": "att_all",
                    "searchResultPosition": {},
                    "maxResults": {},
                    "major": 5,
                    "minor": 0,
                    "startTime": "{}",
                    "endTime": "{}"
                }}
            }}"#,
            search_result_position, MAX_RESULTS, start_time, end_time
        );

        let mut easy = Easy::new();
        easy.url(&url).map_err(|e| e.to_string())?;
        easy.username(&username).map_err(|e| e.to_string())?;
        easy.password(&password).map_err(|e| e.to_string())?;
        easy.http_auth(Auth::new().digest(true))
            .map_err(|e| e.to_string())?;
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

        let json_response: serde_json::Value =
            serde_json::from_str(&body).map_err(|e| format!("Failed to parse JSON: {}", e))?;

        let acs_event = json_response
            .get("AcsEvent")
            .ok_or_else(|| "Missing AcsEvent in response".to_string())?;

        if let Some(num_matches) = acs_event.get("numOfMatches") {
            app.emit("log", format!("Found {} records in this page", num_matches))
                .map_err(|e| e.to_string())?;
        }

        let page_records = if let Some(info_list) = acs_event.get("InfoList") {
            if info_list.is_array() {
                serde_json::from_value::<Vec<AttendanceRecord>>(info_list.clone())
                    .map_err(|e| format!("Failed to parse attendance records: {}", e))?
            } else {
                vec![
                    serde_json::from_value::<AttendanceRecord>(info_list.clone())
                        .map_err(|e| format!("Failed to parse single record: {}", e))?,
                ]
            }
        } else {
            Vec::new()
        };

        let num_returned = page_records.len();
        all_records.extend(page_records);

        let total_matches = acs_event
            .get("totalMatches")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize;

        if num_returned == 0 || all_records.len() >= total_matches {
            break;
        }

        search_result_position += num_returned as u32;
    }

    app.emit(
        "log",
        format!("✓ Successfully fetched {} records", all_records.len()),
    )
    .map_err(|e| e.to_string())?;
    Ok(all_records)
}

#[tauri::command]
fn add_user(
    app: AppHandle,
    ip: String,
    username: String,
    password: String,
    employee_no: String,
    name: String,
    user_type: String,
    enable: bool,
    begin_time: String,
    end_time: String,
    door_right: String,
) -> Result<String, String> {
    app.emit(
        "log",
        format!("Adding new user: {} ({})", name, employee_no),
    )
    .map_err(|e| e.to_string())?;

    let url = format!(
        "http://{}/ISAPI/AccessControl/UserInfo/Record?format=json",
        ip
    );

    let request_body = serde_json::json!({
        "UserInfo": {
            "employeeNo": employee_no,
            "name": name,
            "userType": user_type,
            "Valid": {
                "enable": enable,
                "beginTime": begin_time,
                "endTime": end_time
            },
            "doorRight": door_right
        }
    });

    let body_str = serde_json::to_string(&request_body).map_err(|e| e.to_string())?;

    let mut easy = Easy::new();
    easy.url(&url).map_err(|e| e.to_string())?;
    easy.username(&username).map_err(|e| e.to_string())?;
    easy.password(&password).map_err(|e| e.to_string())?;
    easy.http_auth(Auth::new().digest(true))
        .map_err(|e| e.to_string())?;
    easy.post(true).map_err(|e| e.to_string())?;
    easy.post_fields_copy(body_str.as_bytes())
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

    let json_response: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    if let Some(status_code) = json_response.get("statusCode") {
        if status_code == 1 {
            app.emit(
                "log",
                format!("✓ Successfully added user: {} ({})", name, employee_no),
            )
            .map_err(|e| e.to_string())?;
            Ok("User added successfully".to_string())
        } else {
            let error_msg = json_response
                .get("statusString")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown error");
            Err(format!("Failed to add user: {}", error_msg))
        }
    } else {
        Err("Invalid response from device".to_string())
    }
}

#[tauri::command]
async fn disconnect_device(app: AppHandle) -> Result<(), String> {
    app.emit("log", "Device disconnected".to_string())
        .map_err(|e: tauri::Error| e.to_string())
}

// -------------------- Main --------------------

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let show = MenuItemBuilder::new("Show").id("show").build(app)?;
            let quit = MenuItemBuilder::new("Quit").id("quit").build(app)?;

            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

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
                    _ => {}
                })
                .build(app)?;

            if let (Some(splash), Some(main)) = (
                app.get_webview_window("splashscreen"),
                app.get_webview_window("main"),
            ) {
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(3)).await;
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
            get_attendance_records,
            add_user,
            disconnect_device,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
