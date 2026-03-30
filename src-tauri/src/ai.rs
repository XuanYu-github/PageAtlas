use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAiConfig {
  pub provider: Option<String>,
  pub api_key: Option<String>,
  pub doubao_endpoint_id_text: Option<String>,
  pub doubao_endpoint_id_vision: Option<String>,
  pub openai_base_url: Option<String>,
  pub openai_model_text: Option<String>,
  pub openai_model_vision: Option<String>,
  pub openai_reasoning_effort: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeVisionMessage {
  pub image_data_url: String,
  pub page: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NativeConnectionErrorCode {
  ApiKeyMissing,
  ModelMissing,
  ModelNotFound,
  BaseUrlInvalid,
  NetworkUnreachable,
  Unauthorized,
  Forbidden,
  NotFound,
  RateLimited,
  Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeConnectionError {
  pub code: NativeConnectionErrorCode,
  pub provider: String,
  pub message: String,
  pub status: Option<u16>,
  pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeDiagnosticStage {
  pub key: String,
  pub endpoint: String,
  pub status: String,
  pub error: Option<NativeConnectionError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeDiagnosticResult {
  pub provider: String,
  pub ok: bool,
  pub stages: Vec<NativeDiagnosticStage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTextResult {
  pub provider: String,
  pub text: String,
}

fn resolve_provider(provider: Option<&str>) -> String {
  match provider.unwrap_or("gemini") {
    "qwen" | "zhipu" | "doubao" | "openai" | "gemini" => provider.unwrap_or("gemini").to_string(),
    _ => "gemini".to_string(),
  }
}

fn resolve_reasoning_effort(config: &NativeAiConfig, provider: &str) -> Option<String> {
  if provider != "openai" {
    return None;
  }

  match config.openai_reasoning_effort.as_deref().map(str::trim) {
    Some("low") => Some("low".to_string()),
    Some("medium") => Some("medium".to_string()),
    Some("high") => Some("high".to_string()),
    Some("xhigh") => Some("xhigh".to_string()),
    _ => None,
  }
}

fn create_chat_body(
  provider: &str,
  model: &str,
  messages: Vec<Value>,
  config: &NativeAiConfig,
  max_tokens: Option<u16>,
) -> Value {
  let mut body = serde_json::Map::new();
  body.insert("model".into(), Value::String(model.to_string()));
  body.insert("messages".into(), Value::Array(messages));
  body.insert("stream".into(), Value::Bool(false));

  if let Some(value) = max_tokens {
    body.insert("max_tokens".into(), Value::Number(value.into()));
  }

  if let Some(value) = resolve_reasoning_effort(config, provider) {
    body.insert("reasoning_effort".into(), Value::String(value));
  }

  Value::Object(body)
}

fn err(
  code: NativeConnectionErrorCode,
  provider: &str,
  message: impl Into<String>,
  status: Option<u16>,
  detail: Option<String>,
) -> NativeConnectionError {
  NativeConnectionError {
    code,
    provider: provider.to_string(),
    message: message.into(),
    status,
    detail,
  }
}

fn resolve_openai_compatible_settings(
  config: &NativeAiConfig,
  is_vision: bool,
) -> Result<(String, String, String, String), NativeConnectionError> {
  let provider = resolve_provider(config.provider.as_deref());
  let api_key = config.api_key.clone().unwrap_or_default().trim().to_string();
  if api_key.is_empty() {
    return Err(err(
      NativeConnectionErrorCode::ApiKeyMissing,
      &provider,
      format!("[{}] API Key is missing.", provider),
      None,
      None,
    ));
  }

  match provider.as_str() {
    "qwen" => Ok((
      provider,
      api_key,
      "https://dashscope.aliyuncs.com/compatible-mode/v1".to_string(),
      if is_vision { "qwen-vl-plus" } else { "qwen-plus" }.to_string(),
    )),
    "zhipu" => Ok((
      provider,
      api_key,
      "https://open.bigmodel.cn/api/paas/v4/".to_string(),
      if is_vision { "glm-4v-flash" } else { "glm-4-flash" }.to_string(),
    )),
    "doubao" => {
      let model = if is_vision {
        config.doubao_endpoint_id_vision.clone().unwrap_or_default()
      } else {
        config.doubao_endpoint_id_text.clone().unwrap_or_default()
      };
      if model.trim().is_empty() {
        return Err(err(
          NativeConnectionErrorCode::ModelMissing,
          &provider,
          format!("[Doubao] {} model is missing.", if is_vision { "Vision" } else { "Text" }),
          None,
          None,
        ));
      }
      Ok((
        provider,
        api_key,
        "https://ark.cn-beijing.volces.com/api/v3".to_string(),
        model.trim().to_string(),
      ))
    }
    "openai" => {
      let model = if is_vision {
        config
          .openai_model_vision
          .clone()
          .filter(|v| !v.trim().is_empty())
          .or_else(|| config.openai_model_text.clone())
          .unwrap_or_default()
      } else {
        config.openai_model_text.clone().unwrap_or_default()
      };
      if model.trim().is_empty() {
        return Err(err(
          NativeConnectionErrorCode::ModelMissing,
          &provider,
          format!(
            "[OpenAI Compatible] {} model is missing.",
            if is_vision { "Vision" } else { "Text" }
          ),
          None,
          None,
        ));
      }

      let base_url = config.openai_base_url.clone().unwrap_or_default().trim().to_string();
      if base_url.is_empty() || reqwest::Url::parse(&base_url).is_err() {
        return Err(err(
          NativeConnectionErrorCode::BaseUrlInvalid,
          &provider,
          "[OpenAI Compatible] Base URL is invalid.",
          None,
          None,
        ));
      }

      Ok((provider, api_key, base_url, model.trim().to_string()))
    }
    _ => Err(err(
      NativeConnectionErrorCode::Unknown,
      &provider,
      format!("Provider {} is not routed through the desktop backend.", provider),
      None,
      None,
    )),
  }
}

fn map_status_error(provider: &str, status: u16, message: String) -> NativeConnectionError {
  match status {
    401 => err(NativeConnectionErrorCode::Unauthorized, provider, message, Some(401), None),
    403 => err(NativeConnectionErrorCode::Forbidden, provider, message, Some(403), None),
    404 => err(NativeConnectionErrorCode::NotFound, provider, message, Some(404), None),
    429 => err(NativeConnectionErrorCode::RateLimited, provider, message, Some(429), None),
    _ => err(NativeConnectionErrorCode::Unknown, provider, message, Some(status), None),
  }
}

fn extract_message_text(content: &Value) -> String {
  if let Some(text) = content.as_str() {
    return text.to_string();
  }

  let Some(parts) = content.as_array() else {
    return String::new();
  };

  parts
    .iter()
    .filter_map(|part| {
      let part_type = part.get("type").and_then(|value| value.as_str());
      let text = part.get("text").and_then(|value| value.as_str());

      match (part_type, text) {
        (Some("text"), Some(value)) | (Some("output_text"), Some(value)) => Some(value.trim()),
        (None, Some(value)) => Some(value.trim()),
        _ => None,
      }
    })
    .filter(|value| !value.is_empty())
    .collect::<Vec<_>>()
    .join("\n")
}

async fn get_models(
  client: &Client,
  provider: &str,
  api_key: &str,
  base_url: &str,
) -> Result<Vec<String>, NativeConnectionError> {
  let url = format!("{}/models", base_url.trim_end_matches('/'));
  let response = client
    .get(&url)
    .header("Authorization", format!("Bearer {}", api_key))
    .header("Content-Type", "application/json")
    .send()
    .await
    .map_err(|error| err(NativeConnectionErrorCode::NetworkUnreachable, provider, error.to_string(), None, Some(url.clone())))?;

  let status = response.status().as_u16();
  let status_text = response.status().to_string();
  if !response.status().is_success() {
    let text = response.text().await.unwrap_or_default();
    return Err(map_status_error(
      provider,
      status,
      if text.is_empty() { format!("{} {}", status, status_text) } else { text },
    ));
  }

  let payload = response
    .json::<Value>()
    .await
    .map_err(|error| err(NativeConnectionErrorCode::Unknown, provider, error.to_string(), Some(status), Some(url.clone())))?;

  let model_ids = payload
    .get("data")
    .and_then(|data| data.as_array())
    .map(|items| {
      items
        .iter()
        .filter_map(|item| item.get("id").and_then(|id| id.as_str()).map(|id| id.to_string()))
        .collect::<Vec<_>>()
    })
    .unwrap_or_default();

  Ok(model_ids)
}

async fn post_chat(
  client: &Client,
  provider: &str,
  api_key: &str,
  base_url: &str,
  body: Value,
) -> Result<Value, NativeConnectionError> {
  let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
  let response = client
    .post(&url)
    .header("Authorization", format!("Bearer {}", api_key))
    .header("Content-Type", "application/json")
    .json(&body)
    .send()
    .await
    .map_err(|error| err(NativeConnectionErrorCode::NetworkUnreachable, provider, error.to_string(), None, Some(url.clone())))?;

  let status = response.status().as_u16();
  let status_text = response.status().to_string();
  if !response.status().is_success() {
    let text = response.text().await.unwrap_or_default();
    return Err(map_status_error(
      provider,
      status,
      if text.is_empty() { format!("{} {}", status, status_text) } else { text },
    ));
  }

  response
    .json::<Value>()
    .await
    .map_err(|error| err(NativeConnectionErrorCode::Unknown, provider, error.to_string(), Some(status), Some(url)))
}

#[tauri::command]
pub async fn diagnose_ai_connection(config: NativeAiConfig) -> Result<NativeDiagnosticResult, NativeConnectionError> {
  let provider = resolve_provider(config.provider.as_deref());

  if provider == "gemini" {
    return Err(err(
      NativeConnectionErrorCode::Unknown,
      &provider,
      "Gemini is not routed through the desktop backend yet.",
      None,
      None,
    ));
  }

  let (provider, api_key, base_url, model) = resolve_openai_compatible_settings(&config, false)?;
  let client = Client::new();

  match get_models(&client, &provider, &api_key, &base_url).await {
    Ok(model_ids) => {
      if !model_ids.is_empty() && !model_ids.iter().any(|item| item == &model) {
        let error = err(
          NativeConnectionErrorCode::ModelNotFound,
          &provider,
          format!("Model \"{}\" was not found in /models.", model),
          Some(404),
          Some(model.clone()),
        );
        return Ok(NativeDiagnosticResult {
          provider,
          ok: false,
          stages: vec![
            NativeDiagnosticStage { key: "models".into(), endpoint: "GET /models".into(), status: "error".into(), error: Some(error) },
            NativeDiagnosticStage { key: "chat".into(), endpoint: "POST /chat/completions".into(), status: "skipped".into(), error: None },
          ],
        });
      }

      let chat_body = create_chat_body(
        &provider,
        &model,
        vec![json!({"role": "user", "content": "Reply with exactly: OK"})],
        &config,
        Some(1),
      );

      match post_chat(&client, &provider, &api_key, &base_url, chat_body).await {
        Ok(_) => Ok(NativeDiagnosticResult {
          provider,
          ok: true,
          stages: vec![
            NativeDiagnosticStage { key: "models".into(), endpoint: "GET /models".into(), status: "success".into(), error: None },
            NativeDiagnosticStage { key: "chat".into(), endpoint: "POST /chat/completions".into(), status: "success".into(), error: None },
          ],
        }),
        Err(error) => Ok(NativeDiagnosticResult {
          provider,
          ok: false,
          stages: vec![
            NativeDiagnosticStage { key: "models".into(), endpoint: "GET /models".into(), status: "success".into(), error: None },
            NativeDiagnosticStage { key: "chat".into(), endpoint: "POST /chat/completions".into(), status: "error".into(), error: Some(error) },
          ],
        }),
      }
    }
    Err(error) => Ok(NativeDiagnosticResult {
      provider,
      ok: false,
      stages: vec![
        NativeDiagnosticStage { key: "models".into(), endpoint: "GET /models".into(), status: "error".into(), error: Some(error) },
        NativeDiagnosticStage { key: "chat".into(), endpoint: "POST /chat/completions".into(), status: "skipped".into(), error: None },
      ],
    }),
  }
}

#[tauri::command]
pub async fn invoke_openai_compatible_text(
  provider: String,
  prompt: String,
  system_prompt: Option<String>,
  config: NativeAiConfig,
) -> Result<NativeTextResult, NativeConnectionError> {
  let routed_config = NativeAiConfig { provider: Some(provider.clone()), ..config.clone() };
  let (_, api_key, base_url, model) = resolve_openai_compatible_settings(
    &routed_config,
    false,
  )?;
  let client = Client::new();
  let mut messages = Vec::new();

  if let Some(system) = system_prompt {
    if !system.trim().is_empty() {
      messages.push(json!({"role": "system", "content": system}));
    }
  }
  messages.push(json!({"role": "user", "content": prompt}));

  let body = create_chat_body(&provider, &model, messages, &config, None);

  let payload = post_chat(&client, &provider, &api_key, &base_url, body).await?;
  let text = extract_message_text(&payload["choices"][0]["message"]["content"]);

  Ok(NativeTextResult { provider, text })
}

#[tauri::command]
pub async fn invoke_openai_compatible_vision(
  provider: String,
  prompt: String,
  system_prompt: String,
  images: Vec<NativeVisionMessage>,
  config: NativeAiConfig,
) -> Result<NativeTextResult, NativeConnectionError> {
  let routed_config = NativeAiConfig { provider: Some(provider.clone()), ..config.clone() };
  let (_, api_key, base_url, model) = resolve_openai_compatible_settings(
    &routed_config,
    true,
  )?;
  let client = Client::new();

  let mut content = vec![json!({"type": "text", "text": prompt})];
  for image in images {
    content.push(json!({"type": "image_url", "image_url": { "url": image.image_data_url }}));
  }

  let body = create_chat_body(
    &provider,
    &model,
    vec![
      json!({"role": "system", "content": system_prompt}),
      json!({"role": "user", "content": content}),
    ],
    &config,
    None,
  );

  let payload = post_chat(&client, &provider, &api_key, &base_url, body).await?;
  let text = extract_message_text(&payload["choices"][0]["message"]["content"]);

  Ok(NativeTextResult { provider, text })
}
