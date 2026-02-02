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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DbConfig {
    pub id: String,
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
pub struct AppSettings {
    pub connections: Vec<DbConfig>,
    pub global_log_path: Option<String>,
}

#[derive(Serialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[tauri::command]
fn read_log_file(path: String) -> Result<String, String> {
    // Open file in read-only mode (can read even if file is being used by other apps)
    let mut file = File::open(&path).map_err(|e| format!("Không thể mở file: {}", e))?;
    
    // Read file content as bytes
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| format!("Không thể đọc file: {}", e))?;
    
    // Decode from Shift-JIS to UTF-8
    let (decoded, _, had_errors) = SHIFT_JIS.decode(&buffer);
    
    if had_errors {
        return Err("File có ký tự không hợp lệ (Shift-JIS encoding)".to_string());
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
        
        let tcp = TcpStream::connect(tiberius_config.get_addr()).await.map_err(|e: std::io::Error| format!("Lỗi kết nối mạng (TCP): {}", e))?;
        tcp.set_nodelay(true).map_err(|e: std::io::Error| e.to_string())?;

        let mut client = Client::connect(tiberius_config, tcp.compat_write()).await.map_err(|e: tiberius::error::Error| format!("Lỗi đăng nhập Database: {}", e))?;
        
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
        let tcp = TcpStream::connect(tiberius_config.get_addr()).await.map_err(|e: std::io::Error| format!("Lỗi kết nối mạng: {}", e))?;
        let _client = Client::connect(tiberius_config, tcp.compat_write()).await.map_err(|e: tiberius::error::Error| format!("Lỗi đăng nhập: {}", e))?;
        return Ok("Kết nối thành công (MSSQL)!".to_string());
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

    Ok("Kết nối thành công!".to_string())
}

#[tauri::command]
fn save_db_settings(handle: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = handle.path_resolver().app_config_dir().ok_or("Could not find app config dir")?;
    fs::create_dir_all(&path).map_err(|e: std::io::Error| e.to_string())?;
    let config_path = path.join("db_settings.json");
    let content = serde_json::to_string_pretty(&settings).map_err(|e: serde_json::Error| e.to_string())?;
    let mut file = File::create(config_path).map_err(|e: std::io::Error| e.to_string())?;
    file.write_all(content.as_bytes()).map_err(|e: std::io::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_db_settings(handle: tauri::AppHandle) -> Result<AppSettings, String> {
    let path = handle.path_resolver().app_config_dir().ok_or("Could not find app config dir")?;
    let config_path = path.join("db_settings.json");
    if !config_path.exists() {
        let default_id = "default".to_string();
        return Ok(AppSettings {
            connections: vec![DbConfig {
                id: default_id.clone(),
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
            global_log_path: Some("".to_string()),
        });
    }
    let mut file = File::open(config_path).map_err(|e: std::io::Error| e.to_string())?;
    let mut content = String::new();
    file.read_to_string(&mut content).map_err(|e: std::io::Error| e.to_string())?;
    let settings: AppSettings = serde_json::from_str(&content).map_err(|e: serde_json::Error| e.to_string())?;
    Ok(settings)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_log_file, 
            execute_query, 
            test_connection,
            save_db_settings, 
            load_db_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
