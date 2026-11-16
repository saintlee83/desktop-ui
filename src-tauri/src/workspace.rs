//! Working with the files of a session's folder: listing them (for `@` mentions in the
//! composer), opening one in an editor, and undoing a change the agent made.

use std::{
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

/// Folders never worth offering: version control, dependencies, build output, caches.
const SKIP_DIRS: &[&str] = &[
    "node_modules", "target", "dist", "build", "out", "coverage", "vendor", "__pycache__", "venv", "Pods", "DerivedData",
];

/// Most files listed; a mention picker has no use for more, and huge trees stay fast.
const LIST_LIMIT: usize = 20_000;

fn walk(root: &Path, dir: &Path, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        if out.len() >= LIST_LIMIT {
            return;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        // Hidden files and folders (.git, .DS_Store, .env…) are left out.
        if name.starts_with('.') {
            continue;
        }
        let Ok(kind) = entry.file_type() else { continue };
        let path = entry.path();
        if kind.is_dir() {
            if !SKIP_DIRS.contains(&name.as_ref()) {
                walk(root, &path, out);
            }
        } else if kind.is_file() {
            if let Ok(rel) = path.strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
}

/// Files under `root`, as paths relative to it with `/` separators, sorted by folder.
#[tauri::command(async)]
pub fn list_files(root: String) -> Result<Vec<String>, String> {
    let root = PathBuf::from(root);
    if !root.is_dir() {
        return Err(format!("{} is not a folder", root.display()));
    }
    let mut out = Vec::new();
    walk(&root, &root, &mut out);
    Ok(out)
}

/// A path the agent reported, resolved against the session's folder.
fn resolve(root: &str, path: &str) -> PathBuf {
    let p = Path::new(path);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        Path::new(root).join(p)
    }
}

/// Opens a file in `editor` (an application name, such as "Visual Studio Code"), or in
/// the system's default app for it when there is none.
#[tauri::command(async)]
pub fn open_in_editor(root: String, path: String, editor: Option<String>) -> Result<(), String> {
    let file = resolve(&root, &path);
    if !file.exists() {
        return Err(format!("{} doesn't exist", file.display()));
    }
    let editor = editor.filter(|e| !e.trim().is_empty());
    let mut cmd = if cfg!(target_os = "macos") {
        let mut c = Command::new("open");
        if let Some(app) = &editor {
            c.arg("-a").arg(app);
        }
        c
    } else if let Some(app) = &editor {
        Command::new(app)
    } else if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.args(["/C", "start", ""]);
        c
    } else {
        Command::new("xdg-open")
    };
    let status = cmd.arg(&file).status().map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err(match editor {
            Some(app) => format!("couldn't open it in {app}"),
            None => "couldn't open it".into(),
        })
    }
}

/// Writes an export (a conversation, a backup) to the path the user chose in the save dialog.
#[tauri::command(async)]
pub fn save_text(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("couldn't write {path}: {e}"))
}

/// The unified diff `git apply` takes, from a file path and the hunks of a `FileDiff`.
fn full_patch(path: &str, hunks: &str) -> String {
    let path = path.replace('\\', "/");
    let mut patch = format!("--- a/{path}\n+++ b/{path}\n{hunks}");
    if !patch.ends_with('\n') {
        patch.push('\n');
    }
    patch
}

/// Undoes one change the agent made to a file in `root` by applying its diff in reverse, or
/// (`reverse: false`) puts it back. Uses `git apply`, which works in any folder, repository or
/// not, and refuses a diff that no longer fits rather than mangling the file.
#[tauri::command(async)]
pub fn apply_patch(root: String, path: String, patch: String, reverse: bool) -> Result<(), String> {
    if !Path::new(&root).is_dir() {
        return Err(format!("{root} is not a folder"));
    }
    let mut args = vec!["apply", "--recount", "--whitespace=nowarn"];
    if reverse {
        args.push("-R");
    }
    args.push("-");
    let mut child = Command::new("git")
        .args(&args)
        .current_dir(&root)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("couldn't run git: {e}"))?;
    child
        .stdin
        .take()
        .ok_or("couldn't talk to git")?
        .write_all(full_patch(&path, &patch).as_bytes())
        .map_err(|e| e.to_string())?;
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        let msg = String::from_utf8_lossy(&out.stderr).trim().to_owned();
        Err(if msg.is_empty() { "the change no longer applies".into() } else { msg })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agent-desktop-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn lists_files_without_hidden_or_dependency_folders() {
        let root = temp_dir("list");
        for (path, body) in [("a.txt", ""), ("src/b.rs", ""), (".git/HEAD", ""), ("node_modules/x/i.js", ""), (".env", "")] {
            let p = root.join(path);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, body).unwrap();
        }
        let files = list_files(root.to_string_lossy().into_owned()).unwrap();
        std::fs::remove_dir_all(&root).unwrap();
        assert_eq!(files, vec!["a.txt".to_string(), "src/b.rs".to_string()]);
    }

    #[test]
    fn reverts_a_change_by_applying_its_diff_backwards() {
        if Command::new("git").arg("--version").output().is_err() {
            return; // no git on this machine
        }
        let root = temp_dir("revert");
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/x.ts"), "one\nTWO\nthree\n").unwrap();
        let hunks = "@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n";
        let dir = root.to_string_lossy().into_owned();
        apply_patch(dir.clone(), "src/x.ts".into(), hunks.into(), true).unwrap();
        let after = std::fs::read_to_string(root.join("src/x.ts")).unwrap();
        let again = apply_patch(dir.clone(), "src/x.ts".into(), hunks.into(), true);
        apply_patch(dir, "src/x.ts".into(), hunks.into(), false).unwrap();
        let redone = std::fs::read_to_string(root.join("src/x.ts")).unwrap();
        std::fs::remove_dir_all(&root).unwrap();
        assert_eq!(after, "one\ntwo\nthree\n");
        assert!(again.is_err(), "reverting twice must fail, not corrupt the file");
        assert_eq!(redone, "one\nTWO\nthree\n");
    }
}
