// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{File, self};
use std::io::{Read, Write};
use encoding_rs::SHIFT_JIS;
use serde::{Deserialize, Serialize};
use sqlx::{Column, Row as SqlxRow, Connection};
use tiberius::{Client, Config, AuthMethod, QueryItem, EncryptionLevel};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;
use futures::StreamExt;
use chrono;
mod java_parser;
use java_parser::JavaParser;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DbConfig {
    pub id: Option<String>,
    pub name: String,
    pub db_type: String, // "mssql", "mysql", "postgres"
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub database: String,
    pub trust_server_certificate: Option<bool>,
    pub encrypt: Option<bool>,
    pub verified: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RevertTKMapping {
    pub id: String,
    pub label: String,
    pub offsets: Vec<i32>,
    pub r#type: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppSettings {
    pub connections: Vec<DbConfig>,
    pub translate_file_path: Option<String>,
    pub column_split_enabled: Option<bool>,
    pub column_split_keywords: Option<String>,
    pub revert_tk_col_config: Option<String>,
    pub column_split_apply_to_text: Option<bool>,
    pub column_split_apply_to_table: Option<bool>,
    pub revert_tk_delete_chars: Option<String>,
    pub revert_tk_mapping: Option<Vec<RevertTKMapping>>,
    pub revert_tk_header_select: Option<String>,
    pub revert_tk_header_from: Option<String>,
    pub revert_tk_header_where: Option<String>,
    pub revert_tk_header_orderby: Option<String>,
    pub revert_tk_header_groupby: Option<String>,
    pub revert_tk_header_having: Option<String>,
    pub revert_tk_header_and: Option<String>,
    pub revert_tk_line_break_select: Option<bool>,
    pub revert_tk_line_break_from: Option<bool>,
    pub revert_tk_line_break_where: Option<bool>,
    pub revert_tk_line_break_orderby: Option<bool>,
    pub revert_tk_line_break_groupby: Option<bool>,
    pub revert_tk_line_break_having: Option<bool>,
    pub revert_tk_line_break_and: Option<bool>,
    pub text_compare_delete_chars: Option<String>,
    pub text_compare_remove_append: Option<bool>,
    pub text_compare_truncate_duplicate: Option<bool>,
    pub text_compare_remove_empty_lines: Option<bool>,
    pub text_compare_sort: Option<bool>,
    pub text_compare_ordered: Option<bool>,
    pub text_compare_ignore_case: Option<bool>,
    pub text_compare_trim_whitespace: Option<bool>,
    pub text_compare_auto_compare: Option<bool>,
    pub translate_delete_chars: Option<String>,
    pub translate_truncate_duplicate: Option<bool>,
    pub excel_header_color: Option<String>,
    pub run_shortcut: Option<String>,
    pub focus_search_shortcut: Option<String>,
    pub format_remove_spaces: Option<bool>,
    pub format_sql_append: Option<bool>,
    pub search_strict: Option<bool>,
    pub ui_highlight_copied: Option<bool>,
}

#[derive(Serialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn parse_java_graph(source: String) -> Result<java_parser::CallGraph, String> {
    JavaParser::parse(&source)
}

#[tauri::command]
fn generate_mermaid_graph(
    handle: tauri::AppHandle,
    source: String,
    method_name: Option<String>,
    options: Option<java_parser::MermaidOptions>,
) -> Result<java_parser::MermaidResult, String> {
    let graph = JavaParser::parse(&source)?;

    // Load global flow settings
    let flow_settings = load_flow_settings(handle).unwrap_or_default();

    // Merge global + session ignore lists
    let opts = options.unwrap_or_default();
    let mut all_ignored_services = flow_settings.ignored_services.clone();
    for svc in &opts.session_ignore_services {
        if !all_ignored_services.contains(svc) {
            all_ignored_services.push(svc.clone());
        }
    }

    let collapse = opts.collapse_details || flow_settings.collapse_details;
    let show_source_ref = opts.show_source_reference || flow_settings.show_source_reference;

    let result = JavaParser::generate_mermaid_filtered(
        &graph,
        &source,
        method_name,
        &flow_settings.ignored_variables,
        &all_ignored_services,
        collapse,
        show_source_ref,
    );

    Ok(result)
}

#[tauri::command]
fn read_log_file(path: String) -> Result<String, String> {
    // Open file in read-only mode (can read even if file is being used by other apps)
    let mut file = File::open(&path).map_err(|e| format!("Khﾃｴng th盻? m盻? file: {}", e))?;
    
    // Read file content as bytes
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| format!("Khﾃｴng th盻? ﾄ黛ｻ皇 file: {}", e))?;
    
    // Decode from Shift-JIS to UTF-8
    let (decoded, _, had_errors) = SHIFT_JIS.decode(&buffer);
    
    if had_errors {
        return Err("File cﾃｳ kﾃｽ t盻ｱ khﾃｴng h盻｣p l盻? (Shift-JIS encoding)".to_string());
    }
    
    Ok(decoded.to_string())
}

fn build_mssql_config(config: &DbConfig) -> Result<Config, String> {
    let mut c = Config::new();
    c.host(&config.host);
    c.port(config.port);
    c.database(&config.database);
    let mut tiberius_config = c;

    // Apply credentials from separate fields if provided (overrides URL if conflict)
    if !config.user.trim().is_empty() {
        tiberius_config.authentication(AuthMethod::sql_server(&config.user, &config.password));
    }

    // Handle Encryption
    if let Some(encrypt) = config.encrypt {
        if encrypt {
            tiberius_config.encryption(EncryptionLevel::Required);
        } else {
            tiberius_config.encryption(EncryptionLevel::NotSupported);
        }
    } else {
        tiberius_config.encryption(EncryptionLevel::Off);
    }

    // Handle Trust Certificate
    if config.trust_server_certificate.unwrap_or(true) {
        tiberius_config.trust_cert();
    }

    Ok(tiberius_config)
}

fn build_db_url(config: &DbConfig) -> Result<String, String> {
    let user_enc = urlencoding::encode(&config.user);
    let pass_enc = urlencoding::encode(&config.password);
    
    let mut url = match config.db_type.as_str() {
        "mssql" => format!("mssql://{}:{}@{}:{}/{}", user_enc, pass_enc, config.host, config.port, urlencoding::encode(&config.database)),
        "mysql" => format!("mysql://{}:{}@{}:{}/{}", user_enc, pass_enc, config.host, config.port, urlencoding::encode(&config.database)),
        "postgres" => format!("postgresql://{}:{}@{}:{}/{}", user_enc, pass_enc, config.host, config.port, urlencoding::encode(&config.database)),
        _ => return Err("Unsupported database type".to_string()),
    };

    if config.db_type == "mssql" {
        let mut params = Vec::new();
        if config.trust_server_certificate.unwrap_or(true) {
            params.push("trustServerCertificate=true");
        }
        if let Some(enc) = config.encrypt {
            params.push(if enc { "encrypt=true" } else { "encrypt=false" });
        }
        if !params.is_empty() {
            url = format!("{}?{}", url, params.join("&"));
        }
    }

    Ok(url)
}

#[tauri::command]
async fn execute_query(config: DbConfig, query: String) -> Result<QueryResult, String> {
    if config.db_type == "mssql" {
        let tiberius_config = build_mssql_config(&config)?;
        
        let tcp = TcpStream::connect(tiberius_config.get_addr()).await.map_err(|e: std::io::Error| format!("L盻擁 k蘯ｿt n盻訴 m蘯｡ng (TCP): {}", e))?;
        tcp.set_nodelay(true).map_err(|e: std::io::Error| e.to_string())?;

        let mut client = Client::connect(tiberius_config, tcp.compat_write()).await.map_err(|e: tiberius::error::Error| format!("L盻擁 ﾄ惰ハg nh蘯ｭp Database: {}", e))?;
        
        // Execute query
        let mut results = client.query(query, &[]).await.map_err(|e: tiberius::error::Error| e.to_string())?;
        
        let mut columns = Vec::new();
        let mut rows = Vec::new();
        let mut first_row = true;

        while let Some(item) = results.next().await {
            match item.map_err(|e: tiberius::error::Error| e.to_string())? {
                QueryItem::Row(row) => {
                    if first_row {
                        for col in row.columns() {
                            columns.push(col.name().to_string());
                        }
                        first_row = false;
                    }

                    let mut row_data = Vec::new();
                    for i in 0..columns.len() {
                        let val: String = match row.try_get::<&str, usize>(i) {
                            Ok(Some(s)) => s.trim_end().to_string(),
                            _ => match row.try_get::<i64, usize>(i) {
                                Ok(Some(n)) => n.to_string(),
                                _ => match row.try_get::<i32, usize>(i) {
                                    Ok(Some(n)) => n.to_string(),
                                    _ => match row.try_get::<f64, usize>(i) {
                                        Ok(Some(f)) => f.to_string(),
                                        _ => match row.try_get::<bool, usize>(i) {
                                            Ok(Some(b)) => b.to_string(),
                                            _ => match row.try_get::<chrono::NaiveDateTime, usize>(i) {
                                                Ok(Some(dt)) => dt.format("%Y-%m-%d %H:%M:%S").to_string(),
                                                _ => "[NULL]".to_string()
                                            }
                                        }
                                    }
                                }
                            }
                        };
                        row_data.push(val);
                    }
                    rows.push(row_data);
                },
                _ => {}
            }
        }

        return Ok(QueryResult { columns, rows });
    }

    // Existing SQLX logic for MySQL/Postgres
    let url = build_db_url(&config)?;
    let mut columns = Vec::new();
    let mut rows = Vec::new();

    let mut conn = sqlx::AnyConnection::connect(&url).await.map_err(|e: sqlx::Error| e.to_string())?;
    let results = sqlx::query(&query).fetch_all(&mut conn).await.map_err(|e: sqlx::Error| e.to_string())?;

    if !results.is_empty() {
        for col in results[0].columns() {
            columns.push(col.name().to_string());
        }

        for row in results {
            let mut row_data = Vec::new();
            for i in 0..columns.len() {
                let val: String = row.try_get::<Option<String>, usize>(i).map(|s| s.unwrap_or_else(|| "[NULL]".to_string())).map(|s| s.trim_end().to_string())
                    .or_else(|_| row.try_get::<Option<i64>, usize>(i).map(|v| v.map(|n| n.to_string()).unwrap_or_else(|| "[NULL]".to_string())))
                    .or_else(|_| row.try_get::<Option<i32>, usize>(i).map(|v| v.map(|n| n.to_string()).unwrap_or_else(|| "[NULL]".to_string())))
                    .or_else(|_| row.try_get::<Option<f64>, usize>(i).map(|v| v.map(|n| n.to_string()).unwrap_or_else(|| "[NULL]".to_string())))
                    .or_else(|_| row.try_get::<Option<bool>, usize>(i).map(|v| v.map(|b| b.to_string()).unwrap_or_else(|| "[NULL]".to_string())))
                    .unwrap_or_else(|_| "???".to_string());
                row_data.push(val);
            }
            rows.push(row_data);
        }
    }

    Ok(QueryResult { columns, rows })
}

#[tauri::command]
async fn test_connection(config: DbConfig) -> Result<String, String> {
    if config.db_type == "mssql" {
        let tiberius_config = build_mssql_config(&config)?;
        let tcp = TcpStream::connect(tiberius_config.get_addr()).await.map_err(|e: std::io::Error| format!("L盻擁 k蘯ｿt n盻訴 m蘯｡ng: {}", e))?;
        let _client = Client::connect(tiberius_config, tcp.compat_write()).await.map_err(|e: tiberius::error::Error| format!("L盻擁 ﾄ惰ハg nh蘯ｭp: {}", e))?;
        return Ok("K蘯ｿt n盻訴 thﾃ?nh cﾃｴng (MSSQL)!".to_string());
    }

    let url = build_db_url(&config)?;
    match config.db_type.as_str() {
        "mysql" => {
            sqlx::mysql::MySqlConnection::connect(&url).await.map_err(|e: sqlx::Error| e.to_string())?;
        },
        "postgres" => {
            sqlx::postgres::PgConnection::connect(&url).await.map_err(|e: sqlx::Error| e.to_string())?;
        },
        _ => return Err("Unsupported database type".to_string()),
    }

    Ok("K蘯ｿt n盻訴 thﾃ?nh cﾃｴng!".to_string())
}

#[tauri::command]
fn get_setting_path() -> Result<String, String> {
    let mut exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    exe_path.pop(); // Remove exe name
    let config_path = exe_path.join("data").join("settings.json");
    Ok(config_path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_db_settings(settings: AppSettings) -> Result<(), String> {
    let path_str = get_setting_path()?;
    let config_path = std::path::Path::new(&path_str);
    
    // Ensure the data directory exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(&settings).map_err(|e: serde_json::Error| e.to_string())?;
    let mut file = File::create(config_path).map_err(|e: std::io::Error| e.to_string())?;
    file.write_all(content.as_bytes()).map_err(|e: std::io::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_db_settings() -> Result<AppSettings, String> {
    let path_str = get_setting_path()?;
    let config_path = std::path::Path::new(&path_str);
    
    let default_translate_path = std::env::current_exe()
        .map(|p| p.parent().unwrap_or(&p).join("data").join("translate.xlsx").to_string_lossy().to_string())
        .unwrap_or_else(|_| "".to_string());

    let default_settings = AppSettings {
        connections: vec![DbConfig {
            id: Some("default".to_string()),
            name: "Default Connection".to_string(),
            db_type: "mssql".to_string(),
            host: "localhost".to_string(),
            port: 1433,
            user: "sa".to_string(),
            password: "".to_string(),
            database: "".to_string(),
            trust_server_certificate: Some(true),
            encrypt: Some(false),
            verified: Some(false),
        }],
        translate_file_path: Some(default_translate_path.clone()),
        column_split_enabled: Some(true),
        column_split_keywords: None,
        revert_tk_col_config: None,
        column_split_apply_to_text: None,
        column_split_apply_to_table: None,
        revert_tk_delete_chars: None,
        revert_tk_mapping: None,
        revert_tk_header_select: Some("■ 抽出項目".to_string()),
        revert_tk_header_from: Some("■ 対象テーブル".to_string()),
        revert_tk_header_where: Some("■ 抽出条件".to_string()),
        revert_tk_header_orderby: Some("■ ソート条件".to_string()),
        revert_tk_header_groupby: Some("■ グループ条件".to_string()),
        revert_tk_header_having: Some("■ HAVING条件".to_string()),
        revert_tk_header_and: Some("AND ".to_string()),
        revert_tk_line_break_select: Some(true),
        revert_tk_line_break_from: Some(true),
        revert_tk_line_break_where: Some(true),
        revert_tk_line_break_orderby: Some(true),
        revert_tk_line_break_groupby: Some(true),
        revert_tk_line_break_having: Some(true),
        revert_tk_line_break_and: Some(false),
        text_compare_delete_chars: None,
        text_compare_remove_append: None,
        text_compare_truncate_duplicate: None,
        text_compare_remove_empty_lines: None,
        text_compare_sort: None,
        text_compare_ordered: None,
        text_compare_ignore_case: None,
        text_compare_trim_whitespace: None,
        text_compare_auto_compare: None,
        translate_delete_chars: None,
        translate_truncate_duplicate: None,
        excel_header_color: None,
        run_shortcut: None,
        focus_search_shortcut: None,
        format_remove_spaces: None,
        format_sql_append: None,
        search_strict: None,
        ui_highlight_copied: None,
    };

    if !config_path.exists() {
        // Nếu không tồn tại file có nghĩa là cài mới -> tạo setting.json mới
        save_db_settings(default_settings.clone())?;
        return Ok(default_settings);
    }
    
    // Nếu tồn tại file, load và check key mới
    let mut file = File::open(config_path).map_err(|e: std::io::Error| e.to_string())?;
    let mut content = String::new();
    file.read_to_string(&mut content).map_err(|e: std::io::Error| e.to_string())?;
    
    // Parse as Value to check for missing keys
    let mut settings_json: serde_json::Value = serde_json::from_str(&content).map_err(|e: serde_json::Error| e.to_string())?;
    let default_json = serde_json::to_value(&default_settings).map_err(|e| e.to_string())?;
    
    let mut changed = false;
    if let (Some(settings_obj), Some(default_obj)) = (settings_json.as_object_mut(), default_json.as_object()) {
        for (key, default_val) in default_obj {
            // Check nếu key thiếu hoặc null thì add vào
            if !settings_obj.contains_key(key) || settings_obj.get(key).unwrap().is_null() {
                settings_obj.insert(key.clone(), default_val.clone());
                changed = true;
            }
        }
    }

    // Convert ngược lại AppSettings struct
    let mut settings: AppSettings = serde_json::from_value(settings_json).map_err(|e: serde_json::Error| e.to_string())?;
    
    // Fill in missing IDs cho connections (giữ nguyên logic cũ)
    for conn in &mut settings.connections {
        if conn.id.is_none() {
            conn.id = Some(chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0).to_string());
            changed = true;
        }
    }
    
    // Đảm bảo translate_file_path không trống
    if settings.translate_file_path.as_ref().map_or(true, |s| s.is_empty()) {
        settings.translate_file_path = Some(default_translate_path);
        changed = true;
    }
    
    // Nếu có sự thay đổi (add key mới) thì lưu lại file
    if changed {
        save_db_settings(settings.clone())?;
    }
    
    Ok(settings)
}

#[tauri::command]
fn save_flow_settings(handle: tauri::AppHandle, settings: java_parser::FlowSettings) -> Result<(), String> {
    let path = handle.path_resolver().app_config_dir().ok_or("Could not find app config dir")?;
    fs::create_dir_all(&path).map_err(|e: std::io::Error| e.to_string())?;
    let config_path = path.join("flow_settings.json");
    let content = serde_json::to_string_pretty(&settings).map_err(|e: serde_json::Error| e.to_string())?;
    let mut file = File::create(config_path).map_err(|e: std::io::Error| e.to_string())?;
    file.write_all(content.as_bytes()).map_err(|e: std::io::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_flow_settings(handle: tauri::AppHandle) -> Result<java_parser::FlowSettings, String> {
    let path = handle.path_resolver().app_config_dir().ok_or("Could not find app config dir")?;
    let config_path = path.join("flow_settings.json");
    if !config_path.exists() {
        return Ok(java_parser::FlowSettings::default());
    }
    let mut file = File::open(config_path).map_err(|e: std::io::Error| e.to_string())?;
    let mut content = String::new();
    file.read_to_string(&mut content).map_err(|e: std::io::Error| e.to_string())?;
    serde_json::from_str(&content).map_err(|e: serde_json::Error| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_log_file,
            execute_query,
            test_connection,
            parse_java_graph,
            generate_mermaid_graph,
            save_db_settings,
            load_db_settings,
            open_file,
            get_setting_path,
            save_flow_settings,
            load_flow_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
