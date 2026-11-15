//! Facts about a folder the user attached to a session or a project.

use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FolderInfo {
    /// False when the path is missing or is a file.
    is_dir: bool,
    /// The checked-out branch when the folder is inside a git work tree, or a
    /// short commit id when HEAD is detached.
    branch: Option<String>,
}

/// The directory holding HEAD for `folder`: the `.git` of the nearest enclosing
/// work tree, or wherever a linked worktree's `.git` file points.
fn git_dir(folder: &Path) -> Option<PathBuf> {
    let (root, dot_git) = folder
        .ancestors()
        .map(|dir| (dir, dir.join(".git")))
        .find(|(_, dot_git)| dot_git.exists())?;
    if dot_git.is_dir() {
        return Some(dot_git);
    }
    let pointer = std::fs::read_to_string(&dot_git).ok()?;
    let target = Path::new(pointer.trim().strip_prefix("gitdir:")?.trim());
    Some(if target.is_absolute() { target.to_path_buf() } else { root.join(target) })
}

fn branch_from_head(head: &str) -> Option<String> {
    let head = head.trim();
    if let Some(name) = head.strip_prefix("ref: refs/heads/") {
        return (!name.is_empty()).then(|| name.to_owned());
    }
    // Detached: HEAD is a commit id.
    (head.len() >= 7 && head.chars().all(|c| c.is_ascii_hexdigit())).then(|| head[..7].to_owned())
}

/// Runs off the main thread: the folder may sit on a slow or unreachable volume.
#[tauri::command(async)]
pub fn folder_info(path: String) -> FolderInfo {
    let folder = Path::new(&path);
    let is_dir = folder.is_dir();
    let branch = if is_dir {
        git_dir(folder)
            .and_then(|dir| std::fs::read_to_string(dir.join("HEAD")).ok())
            .and_then(|head| branch_from_head(&head))
    } else {
        None
    };
    FolderInfo { is_dir, branch }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_branch_from_head() {
        assert_eq!(branch_from_head("ref: refs/heads/main\n").as_deref(), Some("main"));
        assert_eq!(branch_from_head("ref: refs/heads/feat/projects").as_deref(), Some("feat/projects"));
        assert_eq!(
            branch_from_head("8223440d1c0a5b7e9f3a2b4c6d8e0f1a2b3c4d5e").as_deref(),
            Some("8223440")
        );
        assert_eq!(branch_from_head("ref: refs/heads/"), None);
        assert_eq!(branch_from_head("garbage"), None);
    }

    #[test]
    fn a_missing_folder_is_not_a_directory() {
        let info = folder_info("/definitely/not/a/real/folder".into());
        assert_eq!(info, FolderInfo { is_dir: false, branch: None });
    }

    #[test]
    fn finds_the_repository_from_a_subfolder() {
        let root = std::env::temp_dir().join(format!("agent-desktop-folders-{}", std::process::id()));
        let nested = root.join("src").join("deep");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::write(root.join(".git").join("HEAD"), "ref: refs/heads/trunk\n").unwrap();
        let info = folder_info(nested.to_string_lossy().into_owned());
        std::fs::remove_dir_all(&root).unwrap();
        assert_eq!(info, FolderInfo { is_dir: true, branch: Some("trunk".into()) });
    }
}
