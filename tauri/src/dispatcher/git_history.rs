use serde::Serialize;
use std::path::Path;

pub const MAX_GIT_OUTPUT_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCapability {
    pub supported: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repository_root: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRevisionSummary {
    pub oid: String,
    pub short_oid: String,
    pub author: String,
    pub authored_at: String,
    pub subject: String,
    pub path: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRevisionSnapshot {
    pub oid: String,
    pub path: String,
    pub source: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GitCompareSide {
    Revision { oid: String, path: String },
    Current { path: String },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitComparisonSources {
    pub left_source: String,
    pub right_source: String,
    pub left_label: String,
    pub right_label: String,
}

#[derive(Debug, PartialEq, Eq)]
pub struct GitHistoryError {
    pub reason: &'static str,
    pub message: String,
}

pub fn detect_git_capability(_workspace_path: Option<&Path>) -> GitCapability {
    GitCapability { supported: false, repository_root: None, reason: Some("not-repository".into()) }
}

pub fn list_document_history(
    _workspace_path: &Path,
    _file_path: &Path,
    _limit: usize,
) -> Result<Vec<GitRevisionSummary>, GitHistoryError> {
    Err(GitHistoryError { reason: "not-implemented", message: "not implemented".into() })
}

pub fn read_git_revision(
    _workspace_path: &Path,
    _oid: &str,
    _revision_path: &str,
) -> Result<GitRevisionSnapshot, GitHistoryError> {
    Err(GitHistoryError { reason: "not-implemented", message: "not implemented".into() })
}

pub fn compare_git_sources(
    _workspace_path: &Path,
    _left: &GitCompareSide,
    _right: &GitCompareSide,
) -> Result<GitComparisonSources, GitHistoryError> {
    Err(GitHistoryError { reason: "not-implemented", message: "not implemented".into() })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempRepo(PathBuf);
    impl Drop for TempRepo {
        fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); }
    }

    fn git(repo: &Path, args: &[&str]) -> String {
        let output = Command::new("git").current_dir(repo).args(args).output().expect("git should run");
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        String::from_utf8(output.stdout).unwrap()
    }

    fn create_repo() -> TempRepo {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("md-explorer-tauri-history-{}-{nonce}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        git(&root, &["init"]);
        git(&root, &["config", "user.name", "Markdown Explorer Tests"]);
        git(&root, &["config", "user.email", "tests@example.invalid"]);
        TempRepo(root)
    }

    fn commit_file(repo: &Path, rel: &str, source: &str, subject: &str) -> String {
        let file = repo.join(rel);
        if let Some(parent) = file.parent() { fs::create_dir_all(parent).unwrap(); }
        fs::write(&file, source).unwrap();
        git(repo, &["add", "--", rel]);
        git(repo, &["commit", "-m", subject]);
        git(repo, &["rev-parse", "HEAD"]).trim().to_owned()
    }

    #[test]
    fn detects_repository_and_lists_rename_aware_history() {
        let repo = create_repo();
        commit_file(&repo.0, "old.md", "# one\n", "first");
        git(&repo.0, &["mv", "--", "old.md", "new.md"]);
        git(&repo.0, &["commit", "-m", "rename"]);

        assert_eq!(detect_git_capability(Some(&repo.0)).supported, true);
        let revisions = list_document_history(&repo.0, &repo.0.join("new.md"), 20).unwrap();
        assert_eq!(revisions.iter().map(|item| item.subject.as_str()).collect::<Vec<_>>(), vec!["rename", "first"]);
        assert_eq!(revisions.iter().map(|item| item.path.as_str()).collect::<Vec<_>>(), vec!["new.md", "old.md"]);
    }

    #[test]
    fn reads_snapshots_and_compares_to_current_working_tree() {
        let repo = create_repo();
        let oid = commit_file(&repo.0, "a.md", "# committed\n", "first");
        fs::write(repo.0.join("a.md"), "# working\n").unwrap();

        let snapshot = read_git_revision(&repo.0, &oid, "a.md").unwrap();
        assert_eq!(snapshot.source, "# committed\n");

        let comparison = compare_git_sources(
            &repo.0,
            &GitCompareSide::Revision { oid: oid.clone(), path: "a.md".into() },
            &GitCompareSide::Current { path: repo.0.join("a.md").to_string_lossy().into_owned() },
        ).unwrap();
        assert_eq!(comparison.left_source, "# committed\n");
        assert_eq!(comparison.right_source, "# working\n");
    }

    #[test]
    fn rejects_invalid_full_revision_identifiers() {
        let repo = create_repo();
        let error = read_git_revision(&repo.0, "HEAD;rm -rf .", "a.md").unwrap_err();
        assert_eq!(error.reason, "invalid-revision");
    }
}
