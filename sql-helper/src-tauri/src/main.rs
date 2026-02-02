// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::File;
use std::io::Read;
use encoding_rs::SHIFT_JIS;

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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_log_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
