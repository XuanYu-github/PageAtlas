#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      ai::diagnose_ai_connection,
      ai::invoke_openai_compatible_text,
      ai::invoke_openai_compatible_vision,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
