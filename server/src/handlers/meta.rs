use axum::{extract::State, Json};
use chrono::{SecondsFormat, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::Arc;
use worker::Env;

use crate::{db, error::AppError};

/// GET /api/now
///
/// Mirrors vaultwarden's `/api/now`: returns current UTC timestamp as an RFC3339 string.
#[worker::send]
pub async fn now() -> Json<String> {
    Json(Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true))
}

/// GET /api/alive
///
/// Simple healthcheck. Vaultwarden uses this to also verify DB connectivity.
#[worker::send]
pub async fn alive(State(env): State<Arc<Env>>) -> Result<Json<String>, AppError> {
    // Verify D1 binding is present + basic query works.
    let db = db::get_db(&env)?;
    db.prepare("SELECT 1 as ok")
        .first::<i32>(Some("ok"))
        .await
        .map_err(|_| AppError::Database)?;
    Ok(now().await)
}

/// GET /api/version
///
/// Returns a Bitwarden-server-like version string. Clients sometimes call this endpoint.
#[worker::send]
pub async fn version() -> Json<&'static str> {
    // Keep this in sync with `src/handlers/config.rs`'s `version`.
    Json("2026.6.0")
}

#[derive(Debug, Deserialize)]
pub struct HibpBreachQuery {
    pub username: String,
}

const XON: &str = "https://api.xposedornot.com/v1";

async fn xon_get(path: &str, cache_ttl: Option<i32>) -> Result<(u16, Value), AppError> {
    use worker::{CfProperties, Fetch, Method, Request, RequestInit};
    let mut init = RequestInit::new();
    init.with_method(Method::Get);
    if let Some(ttl) = cache_ttl {
        init.with_cf_properties(CfProperties {
            cache_everything: Some(true),
            cache_ttl: Some(ttl),
            ..Default::default()
        });
    }
    let mut req =
        Request::new_with_init(&format!("{XON}{path}"), &init).map_err(AppError::Worker)?;
    let h = req.headers_mut().map_err(AppError::Worker)?;
    h.set("User-Agent", "AZET-Pass (pass.azet.io)")
        .map_err(AppError::Worker)?;
    h.set("Accept", "application/json")
        .map_err(AppError::Worker)?;
    let mut res = Fetch::Request(req).send().await.map_err(AppError::Worker)?;
    let status = res.status_code();
    let body = res.json::<Value>().await.unwrap_or(Value::Null);
    Ok((status, body))
}

/// GET /api/hibp/breach?username=...
///
/// AZET: the web vault's free "Data breach report". HIBP's account search needs a paid key, so the lookup goes to
/// XposedOrNot (free, no key) and is reshaped into HIBP's BreachAccountResponse. Only the email address is sent.
/// Upstream failure is an error, never an empty list (an empty list reads as "no breaches").
#[worker::send]
pub async fn hibp_breach(
    _claims: crate::auth::Claims,
    axum::extract::Query(query): axum::extract::Query<HibpBreachQuery>,
) -> Result<Json<Value>, AppError> {
    let email = query.username.trim().to_lowercase();
    if !email.contains('@') || email.len() > 254 {
        return Err(AppError::BadRequest("Invalid email.".into()));
    }
    let enc: String = email
        .bytes()
        .map(|b| match b {
            b'a'..=b'z' | b'0'..=b'9' | b'.' | b'-' | b'_' | b'@' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect();
    let (status, found) = xon_get(&format!("/check-email/{enc}"), None).await?;
    if status == 404 {
        return Ok(Json(json!([])));
    }
    if status != 200 {
        return Err(AppError::BadRequest(
            "The breach database did not answer. Try again later.".into(),
        ));
    }
    let names: Vec<&str> = found["breaches"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|a| a.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();
    let (dstatus, details) = xon_get("/breaches", Some(86400)).await?;
    let all = if dstatus == 200 {
        details["exposedBreaches"]
            .as_array()
            .cloned()
            .unwrap_or_default()
    } else {
        vec![]
    };
    let out: Vec<Value> = names
        .iter()
        .map(|name| {
            let d = all
                .iter()
                .find(|b| b["breachID"].as_str() == Some(name))
                .cloned()
                .unwrap_or(Value::Null);
            let day = |k: &str| d[k].as_str().map(|s| s.get(..10).unwrap_or(s).to_string());
            json!({
                "Name": name,
                "Title": name,
                "Domain": d["domain"].as_str().unwrap_or(""),
                "BreachDate": day("breachedDate"),
                "AddedDate": d["addedDate"],
                "ModifiedDate": d["addedDate"],
                "PwnCount": d["exposedRecords"].as_i64().unwrap_or(0),
                "Description": d["exposureDescription"].as_str().unwrap_or(""),
                "LogoPath": d["logo"].as_str().unwrap_or(""),
                "DataClasses": d["exposedData"].as_array().cloned().unwrap_or_default(),
                "IsVerified": d["verified"].as_bool().unwrap_or(false),
                "IsFabricated": false,
                "IsSensitive": d["sensitive"].as_bool().unwrap_or(false),
                "IsRetired": false,
                "IsSpamList": false,
            })
        })
        .collect();
    Ok(Json(Value::Array(out)))
}
