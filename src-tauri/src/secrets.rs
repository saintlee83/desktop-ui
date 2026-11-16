//! Provider API keys, kept in the OS credential store (Keychain on macOS, Credential
//! Manager on Windows, Secret Service on Linux) instead of the webview's storage.
//!
//! The webview can store and remove a key, but never read one back: whatever talks to a
//! provider reads it here, on the Rust side, with `secret`.

/// Keychain service the keys are filed under (the app's bundle identifier).
const SERVICE: &str = "dev.saintlee.agentdesktop";

fn entry(name: &str) -> Result<keyring::Entry, String> {
    if name.is_empty() || name.len() > 64 || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(format!("invalid key name: {name:?}"));
    }
    keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

/// Stores `value` under `name`, or removes the key when `value` is empty.
#[tauri::command(async)]
pub fn secret_set(name: String, value: String) -> Result<(), String> {
    let entry = entry(&name)?;
    let value = value.trim();
    if value.is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        };
    }
    entry.set_password(value).map_err(|e| e.to_string())
}

/// The key stored under `name`, for the code that calls a provider.
#[allow(dead_code)] // read by real providers
pub fn secret(name: &str) -> Option<String> {
    entry(name).ok()?.get_password().ok()
}

#[cfg(test)]
mod tests {
    use super::entry;

    #[test]
    fn key_names_are_plain_identifiers() {
        assert!(entry("anthropic").is_ok());
        assert!(entry("google-ai").is_ok());
        assert!(entry("").is_err());
        assert!(entry("../x").is_err());
        assert!(entry("a b").is_err());
    }
}
