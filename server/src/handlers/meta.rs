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
    // One call that carries each breach's details (lane 151: the separate catalogue fetch kept failing on the Worker,
    // so every breach showed no date, no description and "0" accounts). Shared Cloudflare egress IPs get throttled
    // now and then: up to three tries, 0.8 s apart.
    let path = format!("/breach-analytics?email={enc}");
    let mut res = xon_get(&path, None).await;
    for _ in 0..2 {
        if matches!(res, Ok((200 | 404, _))) {
            break;
        }
        worker::Delay::from(std::time::Duration::from_millis(800)).await;
        res = xon_get(&path, None).await;
    }
    let (status, found) = res?;
    if status == 404 {
        return Ok(Json(json!([])));
    }
    if status != 200 || !found.is_object() {
        return Err(AppError::BadRequest(format!(
            "The breach database did not answer (HTTP {status}). Try again in a minute."
        )));
    }
    // "ExposedBreaches": null = this address is in no known breach
    let out: Vec<Value> = found["ExposedBreaches"]["breaches_details"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .map(|d| {
            let s = |k: &str| d[k].as_str().unwrap_or("");
            json!({
                "Name": s("breach"),
                "Title": s("breach"),
                "Domain": s("domain"),
                "BreachDate": Value::Null, // upstream gives the year only; the description says when
                "AddedDate": d["added"],
                "ModifiedDate": d["added"],
                "PwnCount": d["xposed_records"].as_i64().or_else(|| s("xposed_records").parse().ok()).unwrap_or(0),
                "Description": s("details"),
                "LogoPath": s("logo"),
                "DataClasses": s("xposed_data").split(';').filter(|x| !x.is_empty()).collect::<Vec<_>>(),
                "IsVerified": s("verified") == "Yes",
                "IsFabricated": false,
                "IsSensitive": false,
                "IsRetired": false,
                "IsSpamList": false,
            })
        })
        .collect();
    Ok(Json(Value::Array(out)))
}
