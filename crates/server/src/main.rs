use anyhow::Context;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{Html, IntoResponse},
    routing::{get, post},
};
use chrono::Utc;
use llm::{LlamaCliAdapter, MockLlmAdapter};
use pipeline::{should_allow_plan_generation, validate_bucket_plan, validate_run_config};
use serde::{Deserialize, Serialize};
use sorter_core::{
    AppPaths, AssignmentRecord, BucketGenesisMode, BucketPlan, DatasetPreview,
    DatasetProjectionConfig, HealthResponse, RunConfig, RunDetail, RunHistoryEntry, SortIntent,
    SortPreset,
};
use std::{
    collections::HashMap,
    env, fs,
    net::SocketAddr,
    path::PathBuf,
    process::Command,
    sync::{Arc, Mutex},
};
use storage::{
    analysis_dir, analysis_history_dir as storage_analysis_history_dir, build_assignment_summary,
    ensure_app_dirs, list_bucket_export_summaries, list_dataset_sources, list_output_runs,
    load_bucket_export_file_bytes, load_bucket_export_file_text, load_dataset_items_by_id,
    load_dataset_preview, load_run_artifact_text, load_run_detail, materialize_assigned_items,
    materialize_bucket_folders, migrate_output_layout, prepare_sorted_output_dir, runs_dir,
    state_dir, write_assignment_summary, write_assignments, write_bucket_machine_exports,
    write_run_artifacts, write_run_manifest,
};
use tokio::time::{Duration, timeout};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    runtime_dir: String,
    model_path: String,
    llm_driver: String,
    input_datasets_dir: String,
    outputs_dir: String,
    jobs: Arc<Mutex<HashMap<String, SortJobSnapshot>>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct PreflightRequest {
    sort_intent: Option<SortIntent>,
    bucket_genesis_mode: Option<BucketGenesisMode>,
    requested_positive_bucket_count: Option<u16>,
    custom_instructions: Option<String>,
    force_override: Option<bool>,
    dataset_projection: Option<DatasetProjectionConfig>,
    sample_limit: Option<usize>,
    experiment_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SortJobStatus {
    Queued,
    Running,
    Blocked,
    Cancelled,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum SortJobStage {
    Queued,
    LoadingData,
    Preflight,
    Planning,
    Assigning,
    Materializing,
    Cancelled,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SortJobProgressNote {
    created_at: chrono::DateTime<Utc>,
    stage: SortJobStage,
    progress_percent: u8,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SortJobSnapshot {
    job_id: String,
    dataset_id: String,
    dataset_display_name: String,
    driver: String,
    status: SortJobStatus,
    stage: SortJobStage,
    message: String,
    progress_percent: u8,
    created_at: chrono::DateTime<Utc>,
    started_at: Option<chrono::DateTime<Utc>>,
    finished_at: Option<chrono::DateTime<Utc>>,
    run_id: Option<Uuid>,
    output_dir: Option<String>,
    error_message: Option<String>,
    #[serde(default)]
    archived: bool,
    #[serde(default)]
    cancel_requested: bool,
    #[serde(default)]
    request: PreflightRequest,
    #[serde(default)]
    progress_notes: Vec<SortJobProgressNote>,
    result: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
struct JobRetentionResult {
    affected_job_ids: Vec<String>,
    jobs: Vec<SortJobSnapshot>,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
struct RunArtifactResponse {
    artifact_name: String,
    body: String,
}

#[derive(Debug, Clone, Serialize)]
struct BucketExportBrowserResponse {
    buckets: Vec<storage::BucketExportBucketSummary>,
}

#[derive(Debug, Clone, Serialize)]
struct BucketExportFileResponse {
    bucket_dir_name: String,
    file_name: String,
    body: String,
}

#[derive(Debug, Clone, Serialize)]
struct SortJobPairLaunchResult {
    experiment_id: String,
    jobs: Vec<SortJobSnapshot>,
    message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedAnalysisWatchTarget {
    watch_key: String,
    dataset_display_name: String,
    sort_intent: SortIntent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedTrendSnapshot {
    watch_key: String,
    dataset_display_name: String,
    sort_intent: SortIntent,
    latest_experiment_id: Option<String>,
    latest_interestingness: Option<i64>,
    delta_score: Option<i64>,
    complete_experiment_count: usize,
    regression_kind: Option<String>,
    summary_note: String,
    structural_drift_note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedExperimentInsight {
    experiment_id: String,
    bucket_name_drift: i64,
    projection_drift: i64,
    bucket_distribution_drift: i64,
    junk_drift: i64,
    review_drift: i64,
    explanation_drift: i64,
    interestingness_score: i64,
    summary_note: String,
    structural_drift_note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedRunReview {
    output_dir_name: String,
    verdict: String,
    note: String,
    updated_at: Option<chrono::DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedExperimentReview {
    experiment_id: String,
    verdict: String,
    note: String,
    updated_at: Option<chrono::DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedAnalysisSnapshot {
    snapshot_id: String,
    name: String,
    #[serde(default)]
    note: String,
    #[serde(default)]
    tags: Vec<String>,
    created_at: chrono::DateTime<Utc>,
    state: AnalysisStateSnapshotBody,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct AnalysisStateSnapshotBody {
    #[serde(default)]
    watch_targets: Vec<PersistedAnalysisWatchTarget>,
    #[serde(default)]
    alerted_experiment_ids: Vec<String>,
    #[serde(default)]
    trend_snapshots: Vec<PersistedTrendSnapshot>,
    #[serde(default)]
    run_reviews: Vec<PersistedRunReview>,
    #[serde(default)]
    experiment_reviews: Vec<PersistedExperimentReview>,
    #[serde(default)]
    experiment_insights: Vec<PersistedExperimentInsight>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct AnalysisStatePayload {
    #[serde(default)]
    watch_targets: Vec<PersistedAnalysisWatchTarget>,
    #[serde(default)]
    alerted_experiment_ids: Vec<String>,
    #[serde(default)]
    trend_snapshots: Vec<PersistedTrendSnapshot>,
    #[serde(default)]
    run_reviews: Vec<PersistedRunReview>,
    #[serde(default)]
    experiment_reviews: Vec<PersistedExperimentReview>,
    #[serde(default)]
    experiment_insights: Vec<PersistedExperimentInsight>,
    #[serde(default)]
    snapshots: Vec<PersistedAnalysisSnapshot>,
    updated_at: Option<chrono::DateTime<Utc>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let runtime_dir = env::var("SORTER_RUNTIME_DIR").unwrap_or_else(|_| "./runtime".to_string());
    let model_path = env::var("SORTER_MODEL_PATH")
        .unwrap_or_else(|_| "./models/Qwen3-VL-8B-Instruct-abliterated-v2.Q4_K_M.gguf".to_string());
    let llm_driver = env::var("SORTER_LLM_DRIVER").unwrap_or_else(|_| "mock".to_string());
    let input_datasets_dir =
        env::var("SORTER_INPUT_DATASETS_DIR").unwrap_or_else(|_| "./input-datasets".to_string());
    let outputs_dir = env::var("SORTER_OUTPUTS_DIR").unwrap_or_else(|_| "./outputs".to_string());

    ensure_app_dirs(&input_datasets_dir, &outputs_dir)?;
    let migration_report = migrate_output_layout(&outputs_dir)?;
    log_output_layout_migration(&migration_report);
    let mut persisted_jobs = load_job_registry(&outputs_dir)?;
    reconcile_persisted_jobs(&mut persisted_jobs);
    persist_job_map(&outputs_dir, &persisted_jobs)?;

    let state = Arc::new(AppState {
        runtime_dir,
        model_path,
        llm_driver,
        input_datasets_dir,
        outputs_dir,
        jobs: Arc::new(Mutex::new(persisted_jobs)),
    });

    let app = Router::new()
        .route("/", get(index))
        .route("/app.js", get(app_js))
        .route("/styles.css", get(styles_css))
        .route(
            "/assets/branding/fmi-splash-wordmark.png",
            get(fmi_splash_wordmark),
        )
        .route("/health", get(health))
        .route("/api/datasets", get(datasets))
        .route("/api/runs", get(runs))
        .route("/api/runs/{output_dir_name}", get(run_detail))
        .route(
            "/api/runs/{output_dir_name}/artifacts/{artifact_name}",
            get(run_artifact),
        )
        .route(
            "/api/runs/{output_dir_name}/bucket-exports",
            get(run_bucket_exports),
        )
        .route(
            "/api/runs/{output_dir_name}/bucket-exports/{bucket_dir_name}/{file_name}",
            get(run_bucket_export_file),
        )
        .route(
            "/api/runs/{output_dir_name}/bucket-exports/{bucket_dir_name}/{file_name}/download",
            get(download_bucket_export_file),
        )
        .route(
            "/api/datasets/{dataset_id}/preview",
            get(dataset_preview).post(dataset_preview_configured),
        )
        .route(
            "/api/datasets/{dataset_id}/preflight",
            post(dataset_preflight),
        )
        .route("/api/datasets/{dataset_id}/plan", post(dataset_plan))
        .route("/api/datasets/{dataset_id}/sort", post(dataset_sort))
        .route(
            "/api/datasets/{dataset_id}/sort-jobs",
            post(create_sort_job),
        )
        .route(
            "/api/datasets/{dataset_id}/sort-job-pair",
            post(create_sort_job_pair),
        )
        .route("/api/jobs", get(list_jobs))
        .route("/api/jobs/{job_id}", get(job_detail))
        .route("/api/jobs/{job_id}/cancel", post(cancel_job))
        .route("/api/jobs/{job_id}/archive", post(toggle_job_archive))
        .route("/api/jobs/{job_id}/rerun", post(rerun_job))
        .route("/api/jobs/archive-completed", post(archive_completed_jobs))
        .route("/api/jobs/delete-archived", post(delete_archived_jobs))
        .route(
            "/api/analysis-state",
            get(get_analysis_state).post(save_analysis_state),
        )
        .route("/api/preflight-smoke", post(preflight_smoke))
        .with_state(state);

    let addr: SocketAddr = "127.0.0.1:3000".parse()?;
    let dashboard_url = format!("http://{}", addr);
    println!("server listening on http://{}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    if should_auto_open_browser() {
        if let Err(error) = open_dashboard_in_browser(&dashboard_url) {
            eprintln!("warning: failed to open browser automatically: {error}");
        }
    }
    axum::serve(listener, app).await?;
    Ok(())
}

fn should_auto_open_browser() -> bool {
    env::var("SORTER_AUTO_OPEN_BROWSER")
        .map(|value| {
            !matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "0" | "false" | "no"
            )
        })
        .unwrap_or(true)
}

fn open_dashboard_in_browser(url: &str) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd").args(["/C", "start", "", url]).spawn()?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(url).spawn()?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open").arg(url).spawn()?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Ok(())
}

async fn index() -> Html<&'static str> {
    Html(include_str!("../../../ui/index.html"))
}

async fn app_js() -> (
    [(axum::http::header::HeaderName, &'static str); 1],
    &'static str,
) {
    (
        [(
            axum::http::header::CONTENT_TYPE,
            "application/javascript; charset=utf-8",
        )],
        include_str!("../../../ui/app.js"),
    )
}

async fn styles_css() -> (
    [(axum::http::header::HeaderName, &'static str); 1],
    &'static str,
) {
    (
        [(axum::http::header::CONTENT_TYPE, "text/css; charset=utf-8")],
        include_str!("../../../ui/styles.css"),
    )
}

async fn fmi_splash_wordmark() -> (
    [(axum::http::header::HeaderName, &'static str); 1],
    &'static [u8],
) {
    (
        [(axum::http::header::CONTENT_TYPE, "image/png")],
        include_bytes!("../../../ui/assets/branding/fmi-splash-wordmark.png"),
    )
}

async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: format!("ok:{}", state.llm_driver),
        runtime_dir: state.runtime_dir.clone(),
        model_path: state.model_path.clone(),
        input_datasets_dir: state.input_datasets_dir.clone(),
        outputs_dir: state.outputs_dir.clone(),
    })
}

async fn datasets(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<sorter_core::DatasetSourceSummary>>, (StatusCode, String)> {
    let datasets = list_dataset_sources(&state.input_datasets_dir).map_err(internal_error)?;
    Ok(Json(datasets))
}

async fn runs(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<RunHistoryEntry>>, (StatusCode, String)> {
    let runs = list_output_runs(&state.outputs_dir).map_err(internal_error)?;
    Ok(Json(runs))
}

async fn get_analysis_state(
    State(state): State<Arc<AppState>>,
) -> Result<Json<AnalysisStatePayload>, (StatusCode, String)> {
    let analysis_state = load_analysis_state(&state.outputs_dir).map_err(internal_error)?;
    Ok(Json(analysis_state))
}

async fn save_analysis_state(
    State(state): State<Arc<AppState>>,
    Json(mut payload): Json<AnalysisStatePayload>,
) -> Result<Json<AnalysisStatePayload>, (StatusCode, String)> {
    payload.updated_at = Some(Utc::now());
    persist_analysis_state(&state.outputs_dir, &payload).map_err(internal_error)?;
    Ok(Json(payload))
}

async fn list_jobs(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<SortJobSnapshot>>, (StatusCode, String)> {
    let mut jobs = state
        .jobs
        .lock()
        .map_err(|_| internal_error(anyhow::anyhow!("failed to lock jobs registry")))?
        .values()
        .cloned()
        .collect::<Vec<_>>();
    jobs.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    Ok(Json(jobs))
}

async fn job_detail(
    State(state): State<Arc<AppState>>,
    Path(job_id): Path<String>,
) -> Result<Json<SortJobSnapshot>, (StatusCode, String)> {
    let jobs = state
        .jobs
        .lock()
        .map_err(|_| internal_error(anyhow::anyhow!("failed to lock jobs registry")))?;
    let job = jobs
        .get(&job_id)
        .cloned()
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("job '{}' not found", job_id)))?;
    Ok(Json(job))
}

async fn cancel_job(
    State(state): State<Arc<AppState>>,
    Path(job_id): Path<String>,
) -> Result<Json<SortJobSnapshot>, (StatusCode, String)> {
    let snapshot = mutate_job(&state, &job_id, |job| {
        if matches!(job.status, SortJobStatus::Queued | SortJobStatus::Running) {
            job.cancel_requested = true;
            job.message = "Cancellation requested. Finishing current safe checkpoint.".to_string();
            job.progress_notes.push(SortJobProgressNote {
                created_at: Utc::now(),
                stage: job.stage.clone(),
                progress_percent: job.progress_percent,
                message: "Cancellation requested by user.".to_string(),
            });
        }
    })?;
    Ok(Json(snapshot))
}

async fn toggle_job_archive(
    State(state): State<Arc<AppState>>,
    Path(job_id): Path<String>,
) -> Result<Json<SortJobSnapshot>, (StatusCode, String)> {
    let snapshot = mutate_job(&state, &job_id, |job| {
        job.archived = !job.archived;
        job.progress_notes.push(SortJobProgressNote {
            created_at: Utc::now(),
            stage: job.stage.clone(),
            progress_percent: job.progress_percent,
            message: if job.archived {
                "Job archived.".to_string()
            } else {
                "Job restored from archive.".to_string()
            },
        });
    })?;
    Ok(Json(snapshot))
}

async fn rerun_job(
    State(state): State<Arc<AppState>>,
    Path(job_id): Path<String>,
) -> Result<Json<SortJobSnapshot>, (StatusCode, String)> {
    let source_job = {
        let jobs = state
            .jobs
            .lock()
            .map_err(|_| internal_error(anyhow::anyhow!("failed to lock jobs registry")))?;
        jobs.get(&job_id)
            .cloned()
            .ok_or_else(|| (StatusCode::NOT_FOUND, format!("job '{}' not found", job_id)))?
    };

    let rerun_request = source_job.request.clone();
    let rerun_dataset_id = source_job.dataset_id.clone();
    let rerun_driver = source_job.driver.clone();
    let new_job_id = Uuid::new_v4().to_string();
    let snapshot = SortJobSnapshot {
        job_id: new_job_id.clone(),
        dataset_id: rerun_dataset_id.clone(),
        dataset_display_name: source_job.dataset_display_name.clone(),
        driver: rerun_driver,
        status: SortJobStatus::Queued,
        stage: SortJobStage::Queued,
        message: format!("Queued rerun from job {}.", job_id),
        progress_percent: 0,
        created_at: Utc::now(),
        started_at: None,
        finished_at: None,
        run_id: None,
        output_dir: None,
        error_message: None,
        archived: false,
        cancel_requested: false,
        request: rerun_request.clone(),
        progress_notes: vec![SortJobProgressNote {
            created_at: Utc::now(),
            stage: SortJobStage::Queued,
            progress_percent: 0,
            message: format!("Queued rerun from job {}.", job_id),
        }],
        result: None,
    };
    upsert_job(&state, snapshot.clone())?;

    let state_for_task = state.clone();
    tokio::spawn(async move {
        let started_at = Utc::now();
        let _ = update_job(&state_for_task, &new_job_id, |job| {
            job.status = SortJobStatus::Running;
            job.stage = SortJobStage::LoadingData;
            job.message = "Starting rerun.".to_string();
            job.progress_percent = 2;
            job.started_at = Some(started_at);
            job.progress_notes.push(SortJobProgressNote {
                created_at: Utc::now(),
                stage: SortJobStage::LoadingData,
                progress_percent: 2,
                message: "Starting rerun.".to_string(),
            });
        });

        let result = execute_sort_pipeline(
            &state_for_task,
            &rerun_dataset_id,
            rerun_request,
            Some(&new_job_id),
            |stage, progress, message| {
                let note_message = message.clone();
                let note_stage = stage.clone();
                let _ = update_job(&state_for_task, &new_job_id, |job| {
                    job.stage = stage.clone();
                    job.progress_percent = progress;
                    job.message = message;
                    job.progress_notes.push(SortJobProgressNote {
                        created_at: Utc::now(),
                        stage: note_stage,
                        progress_percent: progress,
                        message: note_message,
                    });
                });
            },
        )
        .await;

        finalize_job_result(&state_for_task, &new_job_id, result);
    });

    Ok(Json(snapshot))
}

async fn archive_completed_jobs(
    State(state): State<Arc<AppState>>,
) -> Result<Json<JobRetentionResult>, (StatusCode, String)> {
    let result = mutate_jobs(&state, |jobs| {
        let mut affected_job_ids = Vec::new();
        for job in jobs.values_mut() {
            if !job.archived
                && matches!(
                    job.status,
                    SortJobStatus::Completed
                        | SortJobStatus::Failed
                        | SortJobStatus::Cancelled
                        | SortJobStatus::Blocked
                )
            {
                job.archived = true;
                job.progress_notes.push(SortJobProgressNote {
                    created_at: Utc::now(),
                    stage: job.stage.clone(),
                    progress_percent: job.progress_percent,
                    message: "Job archived by bulk retention action.".to_string(),
                });
                affected_job_ids.push(job.job_id.clone());
            }
        }

        let count = affected_job_ids.len();
        let message = if count == 0 {
            "No finished jobs needed archiving.".to_string()
        } else if count == 1 {
            "Archived 1 finished job.".to_string()
        } else {
            format!("Archived {} finished jobs.", count)
        };

        JobRetentionResult {
            affected_job_ids,
            jobs: sorted_jobs(jobs),
            message,
        }
    })?;
    Ok(Json(result))
}

async fn delete_archived_jobs(
    State(state): State<Arc<AppState>>,
) -> Result<Json<JobRetentionResult>, (StatusCode, String)> {
    let result = mutate_jobs(&state, |jobs| {
        let affected_job_ids = jobs
            .iter()
            .filter(|(_, job)| job.archived)
            .map(|(job_id, _)| job_id.clone())
            .collect::<Vec<_>>();

        jobs.retain(|_, job| !job.archived);

        let count = affected_job_ids.len();
        let message = if count == 0 {
            "No archived jobs to delete.".to_string()
        } else if count == 1 {
            "Deleted 1 archived job.".to_string()
        } else {
            format!("Deleted {} archived jobs.", count)
        };

        JobRetentionResult {
            affected_job_ids,
            jobs: sorted_jobs(jobs),
            message,
        }
    })?;
    Ok(Json(result))
}

async fn run_detail(
    State(state): State<Arc<AppState>>,
    Path(output_dir_name): Path<String>,
) -> Result<Json<RunDetail>, (StatusCode, String)> {
    let detail =
        load_run_detail(&state.outputs_dir, &output_dir_name).map_err(map_storage_error)?;
    Ok(Json(detail))
}

async fn run_artifact(
    State(state): State<Arc<AppState>>,
    Path((output_dir_name, artifact_name)): Path<(String, String)>,
) -> Result<Json<RunArtifactResponse>, (StatusCode, String)> {
    let body = load_run_artifact_text(&state.outputs_dir, &output_dir_name, &artifact_name)
        .map_err(map_storage_error)?;
    Ok(Json(RunArtifactResponse {
        artifact_name,
        body,
    }))
}

async fn run_bucket_exports(
    State(state): State<Arc<AppState>>,
    Path(output_dir_name): Path<String>,
) -> Result<Json<BucketExportBrowserResponse>, (StatusCode, String)> {
    let buckets = list_bucket_export_summaries(&state.outputs_dir, &output_dir_name)
        .map_err(map_storage_error)?;
    Ok(Json(BucketExportBrowserResponse { buckets }))
}

async fn run_bucket_export_file(
    State(state): State<Arc<AppState>>,
    Path((output_dir_name, bucket_dir_name, file_name)): Path<(String, String, String)>,
) -> Result<Json<BucketExportFileResponse>, (StatusCode, String)> {
    let body = load_bucket_export_file_text(
        &state.outputs_dir,
        &output_dir_name,
        &bucket_dir_name,
        &file_name,
    )
    .map_err(map_storage_error)?;
    Ok(Json(BucketExportFileResponse {
        bucket_dir_name,
        file_name,
        body,
    }))
}

async fn download_bucket_export_file(
    State(state): State<Arc<AppState>>,
    Path((output_dir_name, bucket_dir_name, file_name)): Path<(String, String, String)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let body = load_bucket_export_file_bytes(
        &state.outputs_dir,
        &output_dir_name,
        &bucket_dir_name,
        &file_name,
    )
    .map_err(map_storage_error)?;
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(bucket_export_content_type(&file_name)),
    );
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"{}\"", file_name))
            .map_err(|error| internal_error(anyhow::anyhow!(error.to_string())))?,
    );
    Ok((headers, body))
}

async fn dataset_preview(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
) -> Result<Json<DatasetPreview>, (StatusCode, String)> {
    let preview = load_dataset_preview(&state.input_datasets_dir, &dataset_id, 10, None)
        .map_err(map_storage_error)?;
    Ok(Json(preview))
}

async fn dataset_preview_configured(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
    Json(request): Json<PreflightRequest>,
) -> Result<Json<DatasetPreview>, (StatusCode, String)> {
    let sample_limit = request.sample_limit.unwrap_or(10).max(1);
    let preview = load_dataset_preview(
        &state.input_datasets_dir,
        &dataset_id,
        sample_limit,
        request.dataset_projection.as_ref(),
    )
    .map_err(map_storage_error)?;
    Ok(Json(preview))
}

async fn dataset_preflight(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
    Json(request): Json<PreflightRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let sample_limit = request.sample_limit.unwrap_or(12).max(1);
    let preview = load_dataset_preview(
        &state.input_datasets_dir,
        &dataset_id,
        sample_limit,
        request.dataset_projection.as_ref(),
    )
    .map_err(map_storage_error)?;

    let config = RunConfig {
        run_id: Uuid::new_v4(),
        created_at: Utc::now(),
        experiment_id: request.experiment_id.clone(),
        sort_intent: request
            .sort_intent
            .unwrap_or(SortIntent::Preset(SortPreset::General)),
        bucket_genesis_mode: request
            .bucket_genesis_mode
            .unwrap_or(BucketGenesisMode::DataSkim),
        requested_positive_bucket_count: request.requested_positive_bucket_count.unwrap_or(4),
        custom_instructions: request.custom_instructions,
        force_override: request.force_override.unwrap_or(false),
        dataset_projection: request.dataset_projection,
        paths: AppPaths {
            runtime_dir: state.runtime_dir.clone(),
            model_path: state.model_path.clone(),
            runs_dir: runs_root_path(&state.outputs_dir)
                .to_string_lossy()
                .to_string(),
        },
    };

    validate_run_config(&config).map_err(|err| (StatusCode::BAD_REQUEST, err.to_string()))?;

    let report = run_preflight_with_driver(&state, &config, &preview).await?;
    let body = serde_json::json!({
        "dataset": preview.source,
        "driver": state.llm_driver,
        "run_id": config.run_id,
        "preflight": report,
    });
    Ok(Json(body))
}

async fn dataset_plan(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
    Json(request): Json<PreflightRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let sample_limit = request.sample_limit.unwrap_or(12).max(1);
    let preview = load_dataset_preview(
        &state.input_datasets_dir,
        &dataset_id,
        sample_limit,
        request.dataset_projection.as_ref(),
    )
    .map_err(map_storage_error)?;

    let config = RunConfig {
        run_id: Uuid::new_v4(),
        created_at: Utc::now(),
        experiment_id: request.experiment_id.clone(),
        sort_intent: request
            .sort_intent
            .unwrap_or(SortIntent::Preset(SortPreset::General)),
        bucket_genesis_mode: request
            .bucket_genesis_mode
            .unwrap_or(BucketGenesisMode::DataSkim),
        requested_positive_bucket_count: request.requested_positive_bucket_count.unwrap_or(4),
        custom_instructions: request.custom_instructions,
        force_override: request.force_override.unwrap_or(false),
        dataset_projection: request.dataset_projection,
        paths: AppPaths {
            runtime_dir: state.runtime_dir.clone(),
            model_path: state.model_path.clone(),
            runs_dir: runs_root_path(&state.outputs_dir)
                .to_string_lossy()
                .to_string(),
        },
    };

    validate_run_config(&config).map_err(|err| (StatusCode::BAD_REQUEST, err.to_string()))?;

    let preflight = run_preflight_with_driver(&state, &config, &preview).await?;
    if !should_allow_plan_generation(&config, &preflight) {
        let body = serde_json::json!({
            "dataset": preview.source,
            "driver": state.llm_driver,
            "run_id": config.run_id,
            "preflight": preflight,
            "blocked": true,
            "reason": "model_preflight_objected_and_force_override_is_false",
        });
        return Ok(Json(body));
    }

    let plan = run_bucket_plan_with_driver(&state, &config, &preview).await?;
    validate_bucket_plan(&config, &plan)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;

    let output_dir = prepare_sorted_output_dir(
        &state.outputs_dir,
        &preview.source.display_name,
        &config.run_id.to_string(),
    )
    .map_err(internal_error)?;
    materialize_bucket_folders(&output_dir, &plan).map_err(internal_error)?;
    write_run_artifacts(&output_dir, &config, &preflight, &plan).map_err(internal_error)?;
    write_run_manifest(
        &output_dir,
        &preview.source,
        &config,
        &preflight,
        &plan,
        None,
    )
    .map_err(internal_error)?;

    let body = serde_json::json!({
        "dataset": preview.source,
        "driver": state.llm_driver,
        "run_id": config.run_id,
        "preflight": preflight,
        "bucket_plan": plan,
        "output_dir": output_dir.to_string_lossy(),
        "blocked": false,
    });
    Ok(Json(body))
}

async fn dataset_sort(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
    Json(request): Json<PreflightRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let body = execute_sort_pipeline(&state, &dataset_id, request, None, |_, _, _| {}).await?;
    Ok(Json(body))
}

async fn create_sort_job(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
    Json(request): Json<PreflightRequest>,
) -> Result<Json<SortJobSnapshot>, (StatusCode, String)> {
    let snapshot = queue_sort_job(&state, dataset_id, request, "Queued sort job.".to_string())?;
    Ok(Json(snapshot))
}

async fn create_sort_job_pair(
    State(state): State<Arc<AppState>>,
    Path(dataset_id): Path<String>,
    Json(request): Json<PreflightRequest>,
) -> Result<Json<SortJobPairLaunchResult>, (StatusCode, String)> {
    let experiment_id = Uuid::new_v4().to_string();

    let mut skim_request = request.clone();
    skim_request.bucket_genesis_mode = Some(BucketGenesisMode::DataSkim);
    skim_request.experiment_id = Some(experiment_id.clone());

    let mut blind_request = request;
    blind_request.bucket_genesis_mode = Some(BucketGenesisMode::BlindLabel);
    blind_request.experiment_id = Some(experiment_id.clone());

    let skim_job = queue_sort_job(
        &state,
        dataset_id.clone(),
        skim_request,
        format!(
            "Queued matched-pair sort job {} (Data Skim).",
            &experiment_id
        ),
    )?;
    let blind_job = queue_sort_job(
        &state,
        dataset_id,
        blind_request,
        format!(
            "Queued matched-pair sort job {} (Blind Label).",
            &experiment_id
        ),
    )?;

    Ok(Json(SortJobPairLaunchResult {
        experiment_id: experiment_id.clone(),
        jobs: vec![skim_job, blind_job],
        message: format!(
            "Queued matched experiment {} with Data Skim and Blind Label jobs.",
            experiment_id
        ),
    }))
}

async fn execute_sort_pipeline<F>(
    state: &AppState,
    dataset_id: &str,
    request: PreflightRequest,
    job_id: Option<&str>,
    mut on_stage: F,
) -> Result<serde_json::Value, (StatusCode, String)>
where
    F: FnMut(SortJobStage, u8, String),
{
    let sample_limit = request.sample_limit.unwrap_or(12).max(1);
    check_for_cancel(state, job_id)?;
    on_stage(
        SortJobStage::LoadingData,
        8,
        "Loading dataset preview and source items.".to_string(),
    );
    let preview = load_dataset_preview(
        &state.input_datasets_dir,
        dataset_id,
        sample_limit,
        request.dataset_projection.as_ref(),
    )
    .map_err(map_storage_error)?;
    let projection = request.dataset_projection.clone();
    let (source, items) =
        load_dataset_items_by_id(&state.input_datasets_dir, dataset_id, projection.as_ref())
            .map_err(map_storage_error)?;

    on_stage(
        SortJobStage::LoadingData,
        15,
        format!("Loaded {} items from {}.", items.len(), source.display_name),
    );
    check_for_cancel(state, job_id)?;

    let config = build_run_config(state, request);
    validate_run_config(&config).map_err(|err| (StatusCode::BAD_REQUEST, err.to_string()))?;

    on_stage(
        SortJobStage::Preflight,
        25,
        "Running semantic preflight.".to_string(),
    );
    let preflight = run_preflight_with_driver(state, &config, &preview).await?;
    check_for_cancel(state, job_id)?;
    if !should_allow_plan_generation(&config, &preflight) {
        let body = serde_json::json!({
            "dataset": source,
            "driver": state.llm_driver,
            "run_id": config.run_id,
            "preflight": preflight,
            "blocked": true,
            "reason": "model_preflight_objected_and_force_override_is_false",
        });
        return Ok(body);
    }

    on_stage(
        SortJobStage::Planning,
        45,
        "Generating frozen bucket plan.".to_string(),
    );
    let plan = run_bucket_plan_with_driver(state, &config, &preview).await?;
    validate_bucket_plan(&config, &plan)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;
    check_for_cancel(state, job_id)?;

    on_stage(
        SortJobStage::Assigning,
        60,
        format!("Assigning {} items into frozen buckets.", items.len()),
    );
    let assignment_chunk_size = if state.llm_driver == "llama_cli" {
        4
    } else {
        items.len().max(1)
    };
    let mut assignments = Vec::with_capacity(items.len());
    for (index, chunk) in items.chunks(assignment_chunk_size).enumerate() {
        check_for_cancel(state, job_id)?;
        let assigned_chunk = run_assignment_with_driver(state, &config, &plan, chunk).await?;
        assignments.extend(assigned_chunk);
        let progress =
            60_u8 + (((index + 1) * 25) / items.chunks(assignment_chunk_size).len()) as u8;
        on_stage(
            SortJobStage::Assigning,
            progress.min(85),
            format!(
                "Assigned batch {} of {} ({} items total processed).",
                index + 1,
                items.chunks(assignment_chunk_size).len(),
                assignments.len()
            ),
        );
    }
    let summary = build_assignment_summary(&plan, &assignments);
    check_for_cancel(state, job_id)?;

    on_stage(
        SortJobStage::Materializing,
        90,
        "Writing bucket folders and assignment artifacts.".to_string(),
    );
    let output_dir = prepare_sorted_output_dir(
        &state.outputs_dir,
        &source.display_name,
        &config.run_id.to_string(),
    )
    .map_err(internal_error)?;
    materialize_bucket_folders(&output_dir, &plan).map_err(internal_error)?;
    materialize_assigned_items(&output_dir, &plan, &items, &assignments).map_err(internal_error)?;
    write_bucket_machine_exports(&output_dir, &plan, &items, &assignments)
        .map_err(internal_error)?;
    write_run_artifacts(&output_dir, &config, &preflight, &plan).map_err(internal_error)?;
    write_assignments(&output_dir, &assignments).map_err(internal_error)?;
    write_assignment_summary(&output_dir, &summary).map_err(internal_error)?;
    write_run_manifest(
        &output_dir,
        &source,
        &config,
        &preflight,
        &plan,
        Some(&summary),
    )
    .map_err(internal_error)?;
    check_for_cancel(state, job_id)?;

    on_stage(
        SortJobStage::Completed,
        100,
        "Sort run completed and artifacts saved.".to_string(),
    );
    Ok(serde_json::json!({
        "dataset": source,
        "driver": state.llm_driver,
        "run_id": config.run_id,
        "preflight": preflight,
        "bucket_plan": plan,
        "assignment_summary": summary,
        "output_dir": output_dir.to_string_lossy(),
        "blocked": false,
    }))
}

fn build_run_config(state: &AppState, request: PreflightRequest) -> RunConfig {
    RunConfig {
        run_id: Uuid::new_v4(),
        created_at: Utc::now(),
        experiment_id: request.experiment_id.clone(),
        sort_intent: request
            .sort_intent
            .unwrap_or(SortIntent::Preset(SortPreset::General)),
        bucket_genesis_mode: request
            .bucket_genesis_mode
            .unwrap_or(BucketGenesisMode::DataSkim),
        requested_positive_bucket_count: request.requested_positive_bucket_count.unwrap_or(4),
        custom_instructions: request.custom_instructions,
        force_override: request.force_override.unwrap_or(false),
        dataset_projection: request.dataset_projection,
        paths: AppPaths {
            runtime_dir: state.runtime_dir.clone(),
            model_path: state.model_path.clone(),
            runs_dir: runs_root_path(&state.outputs_dir)
                .to_string_lossy()
                .to_string(),
        },
    }
}

fn finalize_job_result(
    state: &AppState,
    job_id: &str,
    result: Result<serde_json::Value, (StatusCode, String)>,
) {
    match result {
        Ok(body) => {
            let blocked = body
                .get("blocked")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false);
            let run_id = body
                .get("run_id")
                .and_then(serde_json::Value::as_str)
                .and_then(|value| Uuid::parse_str(value).ok());
            let output_dir = body
                .get("output_dir")
                .and_then(serde_json::Value::as_str)
                .map(ToString::to_string);
            let message = if blocked {
                "Model preflight objected and the run was blocked.".to_string()
            } else {
                "Sort run completed.".to_string()
            };
            let status = if blocked {
                SortJobStatus::Blocked
            } else {
                SortJobStatus::Completed
            };
            let stage = if blocked {
                SortJobStage::Preflight
            } else {
                SortJobStage::Completed
            };
            let note_stage = stage.clone();
            let _ = update_job(state, job_id, |job| {
                job.status = status;
                job.stage = stage;
                job.progress_percent = 100;
                job.message = message;
                job.finished_at = Some(Utc::now());
                job.run_id = run_id;
                job.output_dir = output_dir;
                job.progress_notes.push(SortJobProgressNote {
                    created_at: Utc::now(),
                    stage: note_stage,
                    progress_percent: 100,
                    message: job.message.clone(),
                });
                job.result = Some(body);
            });
        }
        Err((_, message)) => {
            let cancelled = message == "sort job cancelled";
            let _ = update_job(state, job_id, |job| {
                job.status = if cancelled {
                    SortJobStatus::Cancelled
                } else {
                    SortJobStatus::Failed
                };
                job.stage = if cancelled {
                    SortJobStage::Cancelled
                } else {
                    SortJobStage::Failed
                };
                job.progress_percent = 100;
                job.message = if cancelled {
                    "Sort run cancelled.".to_string()
                } else {
                    "Sort run failed.".to_string()
                };
                job.finished_at = Some(Utc::now());
                job.error_message = Some(message.clone());
                job.progress_notes.push(SortJobProgressNote {
                    created_at: Utc::now(),
                    stage: job.stage.clone(),
                    progress_percent: 100,
                    message: job.message.clone(),
                });
            });
        }
    }
}

async fn preflight_smoke(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let config = RunConfig {
        run_id: Uuid::new_v4(),
        created_at: Utc::now(),
        experiment_id: None,
        sort_intent: SortIntent::Preset(SortPreset::General),
        bucket_genesis_mode: BucketGenesisMode::DataSkim,
        requested_positive_bucket_count: 4,
        custom_instructions: None,
        force_override: false,
        dataset_projection: None,
        paths: AppPaths {
            runtime_dir: state.runtime_dir.clone(),
            model_path: state.model_path.clone(),
            runs_dir: runs_root_path(&state.outputs_dir)
                .to_string_lossy()
                .to_string(),
        },
    };

    validate_run_config(&config).map_err(|err| (StatusCode::BAD_REQUEST, err.to_string()))?;

    let preview = DatasetPreview {
        source: sorter_core::DatasetSourceSummary {
            dataset_id: "smoke".to_string(),
            display_name: "smoke".to_string(),
            source_kind: sorter_core::DatasetSourceKind::File,
            dataset_format: sorter_core::DatasetFormat::TextFile,
            relative_path: "smoke".to_string(),
        },
        manifest: sorter_core::DatasetManifest {
            item_count: 3,
            sample_size: 3,
            dataset_format: sorter_core::DatasetFormat::TextFile,
            schema_columns: Vec::new(),
            projection: None,
        },
        sample: vec![
            sorter_core::DatasetItem {
                item_id: "1".to_string(),
                content: "Rust ownership rules help prevent memory bugs at compile time."
                    .to_string(),
                raw_record: None,
            },
            sorter_core::DatasetItem {
                item_id: "2".to_string(),
                content: "The parser fails when the closing brace is missing from the JSON object."
                    .to_string(),
                raw_record: None,
            },
            sorter_core::DatasetItem {
                item_id: "3".to_string(),
                content: "A linear proof should show each premise and inference in sequence."
                    .to_string(),
                raw_record: None,
            },
        ],
        raw_sample_rows: Vec::new(),
    };
    let report = run_preflight_with_driver(&state, &config, &preview).await?;

    let body = serde_json::json!({
        "run_id": config.run_id,
        "driver": state.llm_driver,
        "preflight": report,
    });
    Ok(Json(body))
}

fn queue_sort_job(
    state: &Arc<AppState>,
    dataset_id: String,
    request: PreflightRequest,
    queued_message: String,
) -> Result<SortJobSnapshot, (StatusCode, String)> {
    let job_id = Uuid::new_v4().to_string();
    let snapshot = SortJobSnapshot {
        job_id: job_id.clone(),
        dataset_id: dataset_id.clone(),
        dataset_display_name: dataset_id.clone(),
        driver: state.llm_driver.clone(),
        status: SortJobStatus::Queued,
        stage: SortJobStage::Queued,
        message: queued_message.clone(),
        progress_percent: 0,
        created_at: Utc::now(),
        started_at: None,
        finished_at: None,
        run_id: None,
        output_dir: None,
        error_message: None,
        archived: false,
        cancel_requested: false,
        request: request.clone(),
        progress_notes: vec![SortJobProgressNote {
            created_at: Utc::now(),
            stage: SortJobStage::Queued,
            progress_percent: 0,
            message: queued_message,
        }],
        result: None,
    };
    upsert_job(state, snapshot.clone())?;

    let state_for_task = state.clone();
    tokio::spawn(async move {
        let started_at = Utc::now();
        let _ = update_job(&state_for_task, &job_id, |job| {
            job.status = SortJobStatus::Running;
            job.stage = SortJobStage::LoadingData;
            job.message = "Starting sort run.".to_string();
            job.progress_percent = 2;
            job.started_at = Some(started_at);
            job.progress_notes.push(SortJobProgressNote {
                created_at: Utc::now(),
                stage: SortJobStage::LoadingData,
                progress_percent: 2,
                message: "Starting sort run.".to_string(),
            });
        });

        let result = execute_sort_pipeline(
            &state_for_task,
            &dataset_id,
            request,
            Some(&job_id),
            |stage, progress, message| {
                let note_message = message.clone();
                let note_stage = stage.clone();
                let _ = update_job(&state_for_task, &job_id, |job| {
                    job.stage = stage.clone();
                    job.progress_percent = progress;
                    job.message = message;
                    job.progress_notes.push(SortJobProgressNote {
                        created_at: Utc::now(),
                        stage: note_stage,
                        progress_percent: progress,
                        message: note_message,
                    });
                });
            },
        )
        .await;

        finalize_job_result(&state_for_task, &job_id, result);
    });

    Ok(snapshot)
}

fn internal_error(error: anyhow::Error) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
}

fn map_storage_error(error: anyhow::Error) -> (StatusCode, String) {
    let message = error.to_string();
    if message.contains("not found") {
        (StatusCode::NOT_FOUND, message)
    } else {
        (StatusCode::INTERNAL_SERVER_ERROR, message)
    }
}

fn bucket_export_content_type(file_name: &str) -> &'static str {
    match file_name.rsplit('.').next() {
        Some("jsonl" | "json") => "application/json",
        Some("csv") => "text/csv; charset=utf-8",
        Some("txt" | "md") => "text/plain; charset=utf-8",
        Some("parquet") => "application/octet-stream",
        _ => "application/octet-stream",
    }
}

fn upsert_job(state: &AppState, snapshot: SortJobSnapshot) -> Result<(), (StatusCode, String)> {
    let mut jobs = state
        .jobs
        .lock()
        .map_err(|_| internal_error(anyhow::anyhow!("failed to lock jobs registry")))?;
    jobs.insert(snapshot.job_id.clone(), snapshot);
    persist_job_map(&state.outputs_dir, &jobs).map_err(internal_error)?;
    Ok(())
}

fn mutate_jobs<F, T>(state: &AppState, updater: F) -> Result<T, (StatusCode, String)>
where
    F: FnOnce(&mut HashMap<String, SortJobSnapshot>) -> T,
{
    let mut jobs = state
        .jobs
        .lock()
        .map_err(|_| internal_error(anyhow::anyhow!("failed to lock jobs registry")))?;
    let result = updater(&mut jobs);
    persist_job_map(&state.outputs_dir, &jobs).map_err(internal_error)?;
    Ok(result)
}

fn update_job<F>(state: &AppState, job_id: &str, updater: F) -> Result<(), (StatusCode, String)>
where
    F: FnOnce(&mut SortJobSnapshot),
{
    let mut jobs = state
        .jobs
        .lock()
        .map_err(|_| internal_error(anyhow::anyhow!("failed to lock jobs registry")))?;
    let job = jobs
        .get_mut(job_id)
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("job '{}' not found", job_id)))?;
    updater(job);
    persist_job_map(&state.outputs_dir, &jobs).map_err(internal_error)?;
    Ok(())
}

fn mutate_job<F>(
    state: &AppState,
    job_id: &str,
    updater: F,
) -> Result<SortJobSnapshot, (StatusCode, String)>
where
    F: FnOnce(&mut SortJobSnapshot),
{
    let mut jobs = state
        .jobs
        .lock()
        .map_err(|_| internal_error(anyhow::anyhow!("failed to lock jobs registry")))?;
    let snapshot = {
        let job = jobs
            .get_mut(job_id)
            .ok_or_else(|| (StatusCode::NOT_FOUND, format!("job '{}' not found", job_id)))?;
        updater(job);
        job.clone()
    };
    persist_job_map(&state.outputs_dir, &jobs).map_err(internal_error)?;
    Ok(snapshot)
}

fn check_for_cancel(state: &AppState, job_id: Option<&str>) -> Result<(), (StatusCode, String)> {
    let Some(job_id) = job_id else {
        return Ok(());
    };
    let jobs = state
        .jobs
        .lock()
        .map_err(|_| internal_error(anyhow::anyhow!("failed to lock jobs registry")))?;
    let cancel_requested = jobs
        .get(job_id)
        .map(|job| job.cancel_requested)
        .unwrap_or(false);
    if cancel_requested {
        return Err((StatusCode::CONFLICT, "sort job cancelled".to_string()));
    }
    Ok(())
}

fn log_output_layout_migration(report: &storage::OutputLayoutMigrationReport) {
    if report.moved_paths.is_empty()
        && report.skipped_paths.is_empty()
        && report.removed_empty_dirs.is_empty()
    {
        return;
    }

    println!(
        "output layout migration: moved={}, skipped={}, removed_empty_dirs={}",
        report.moved_paths.len(),
        report.skipped_paths.len(),
        report.removed_empty_dirs.len()
    );
}

fn jobs_registry_path(outputs_dir: &str) -> PathBuf {
    state_dir(outputs_dir).join("jobs-registry.json")
}

fn legacy_jobs_registry_path(outputs_dir: &str) -> PathBuf {
    PathBuf::from(outputs_dir).join("jobs-registry.json")
}

fn analysis_state_path(outputs_dir: &str) -> PathBuf {
    analysis_dir(outputs_dir).join("analysis-state.json")
}

fn legacy_analysis_state_path(outputs_dir: &str) -> PathBuf {
    PathBuf::from(outputs_dir).join("analysis-state.json")
}

fn analysis_summary_markdown_path(outputs_dir: &str) -> PathBuf {
    analysis_dir(outputs_dir).join("analysis-summary.md")
}

fn analysis_history_dir(outputs_dir: &str) -> PathBuf {
    storage_analysis_history_dir(outputs_dir)
}

fn runs_root_path(outputs_dir: &str) -> PathBuf {
    runs_dir(outputs_dir)
}

fn load_job_registry(outputs_dir: &str) -> anyhow::Result<HashMap<String, SortJobSnapshot>> {
    let path = jobs_registry_path(outputs_dir);
    let legacy_path = legacy_jobs_registry_path(outputs_dir);
    let read_path = if path.exists() {
        path
    } else if legacy_path.exists() {
        legacy_path
    } else {
        return Ok(HashMap::new());
    };

    let body = fs::read_to_string(&read_path)
        .map_err(anyhow::Error::from)
        .with_context(|| format!("failed to read {}", read_path.display()))?;
    serde_json::from_str(&body)
        .map_err(anyhow::Error::from)
        .with_context(|| format!("failed to parse {}", read_path.display()))
}

fn persist_job_map(
    outputs_dir: &str,
    jobs: &HashMap<String, SortJobSnapshot>,
) -> anyhow::Result<()> {
    let path = jobs_registry_path(outputs_dir);
    let body = serde_json::to_string_pretty(jobs).context("failed to serialize job registry")?;
    fs::write(&path, body + "\n")
        .map_err(anyhow::Error::from)
        .with_context(|| format!("failed to write {}", path.display()))
}

fn load_analysis_state(outputs_dir: &str) -> anyhow::Result<AnalysisStatePayload> {
    let path = analysis_state_path(outputs_dir);
    let legacy_path = legacy_analysis_state_path(outputs_dir);
    let read_path = if path.exists() {
        path
    } else if legacy_path.exists() {
        legacy_path
    } else {
        return Ok(AnalysisStatePayload::default());
    };

    let body = fs::read_to_string(&read_path)
        .map_err(anyhow::Error::from)
        .with_context(|| format!("failed to read {}", read_path.display()))?;
    serde_json::from_str(&body)
        .map_err(anyhow::Error::from)
        .with_context(|| format!("failed to parse {}", read_path.display()))
}

fn persist_analysis_state(outputs_dir: &str, payload: &AnalysisStatePayload) -> anyhow::Result<()> {
    let path = analysis_state_path(outputs_dir);
    let body =
        serde_json::to_string_pretty(payload).context("failed to serialize analysis state")?;
    fs::write(&path, body + "\n")
        .map_err(anyhow::Error::from)
        .with_context(|| format!("failed to write {}", path.display()))?;

    persist_analysis_summary_markdown(outputs_dir, payload)?;
    persist_analysis_history_entry(outputs_dir, payload)?;
    Ok(())
}

fn persist_analysis_summary_markdown(
    outputs_dir: &str,
    payload: &AnalysisStatePayload,
) -> anyhow::Result<()> {
    let path = analysis_summary_markdown_path(outputs_dir);
    let body = render_analysis_summary_markdown(payload);
    fs::write(&path, body)
        .map_err(anyhow::Error::from)
        .with_context(|| format!("failed to write {}", path.display()))
}

fn persist_analysis_history_entry(
    outputs_dir: &str,
    payload: &AnalysisStatePayload,
) -> anyhow::Result<()> {
    let history_dir = analysis_history_dir(outputs_dir);
    fs::create_dir_all(&history_dir)
        .map_err(anyhow::Error::from)
        .with_context(|| format!("failed to create {}", history_dir.display()))?;

    let stamp = payload
        .updated_at
        .unwrap_or_else(Utc::now)
        .format("%Y%m%d-%H%M%S")
        .to_string();

    let json_path = history_dir.join(format!("analysis-state-{}.json", stamp));
    let md_path = history_dir.join(format!("analysis-summary-{}.md", stamp));

    let json_body =
        serde_json::to_string_pretty(payload).context("failed to serialize analysis history")?;
    fs::write(&json_path, json_body + "\n")
        .map_err(anyhow::Error::from)
        .with_context(|| format!("failed to write {}", json_path.display()))?;

    let md_body = render_analysis_summary_markdown(payload);
    fs::write(&md_path, md_body)
        .map_err(anyhow::Error::from)
        .with_context(|| format!("failed to write {}", md_path.display()))
}

fn render_analysis_summary_markdown(payload: &AnalysisStatePayload) -> String {
    let updated_at = payload
        .updated_at
        .map(|value| value.to_rfc3339())
        .unwrap_or_else(|| "unknown".to_string());

    let mut body = String::new();
    body.push_str("# Analysis Summary\n\n");
    body.push_str(&format!("- Updated at: {}\n", updated_at));
    body.push_str(&format!(
        "- Watch targets: {}\n",
        payload.watch_targets.len()
    ));
    body.push_str(&format!(
        "- Alerted experiments: {}\n",
        payload.alerted_experiment_ids.len()
    ));
    body.push_str(&format!(
        "- Trend snapshots: {}\n",
        payload.trend_snapshots.len()
    ));
    body.push_str(&format!("- Run reviews: {}\n", payload.run_reviews.len()));
    body.push_str(&format!(
        "- Experiment reviews: {}\n\n",
        payload.experiment_reviews.len()
    ));
    body.push_str(&format!(
        "- Experiment insights: {}\n\n",
        payload.experiment_insights.len()
    ));
    body.push_str(&format!(
        "- Named snapshots: {}\n\n",
        payload.snapshots.len()
    ));

    body.push_str("## Watch Targets\n\n");
    if payload.watch_targets.is_empty() {
        body.push_str("- No watch targets saved.\n\n");
    } else {
        for target in &payload.watch_targets {
            body.push_str(&format!(
                "- {} | {}\n",
                target.dataset_display_name,
                format_sort_intent(&target.sort_intent)
            ));
        }
        body.push('\n');
    }

    body.push_str("## Trend Snapshots\n\n");
    if payload.trend_snapshots.is_empty() {
        body.push_str("- No trend snapshots saved.\n");
    } else {
        for snapshot in &payload.trend_snapshots {
            body.push_str(&format!(
                "### {} | {}\n\n",
                snapshot.dataset_display_name,
                format_sort_intent(&snapshot.sort_intent)
            ));
            body.push_str(&format!(
                "- Latest experiment: {}\n",
                snapshot.latest_experiment_id.as_deref().unwrap_or("none")
            ));
            body.push_str(&format!(
                "- Latest interestingness: {}\n",
                snapshot
                    .latest_interestingness
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "n/a".to_string())
            ));
            body.push_str(&format!(
                "- Delta score: {}\n",
                snapshot
                    .delta_score
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "n/a".to_string())
            ));
            body.push_str(&format!(
                "- Complete experiment count: {}\n",
                snapshot.complete_experiment_count
            ));
            body.push_str(&format!(
                "- Regression kind: {}\n",
                snapshot.regression_kind.as_deref().unwrap_or("none")
            ));
            body.push_str(&format!("- Summary: {}\n\n", snapshot.summary_note));
            if let Some(note) = &snapshot.structural_drift_note {
                body.push_str(&format!("- Structural drift note: {}\n\n", note));
            }
        }
    }

    body.push_str("\n## Run Reviews\n\n");
    if payload.run_reviews.is_empty() {
        body.push_str("- No run reviews saved.\n\n");
    } else {
        for review in &payload.run_reviews {
            body.push_str(&format!("### {}\n\n", review.output_dir_name));
            body.push_str(&format!("- Verdict: {}\n", review.verdict));
            body.push_str(&format!(
                "- Updated at: {}\n",
                review
                    .updated_at
                    .map(|value| value.to_rfc3339())
                    .unwrap_or_else(|| "unknown".to_string())
            ));
            body.push_str(&format!("- Note: {}\n\n", review.note));
        }
    }

    body.push_str("\n## Named Snapshots\n\n");
    if payload.snapshots.is_empty() {
        body.push_str("- No named snapshots saved.\n\n");
    } else {
        for snapshot in &payload.snapshots {
            body.push_str(&format!("### {}\n\n", snapshot.name));
            body.push_str(&format!("- Snapshot id: {}\n", snapshot.snapshot_id));
            body.push_str(&format!(
                "- Created at: {}\n",
                snapshot.created_at.to_rfc3339()
            ));
            body.push_str(&format!(
                "- Note: {}\n",
                if snapshot.note.is_empty() {
                    "none"
                } else {
                    snapshot.note.as_str()
                }
            ));
            body.push_str(&format!(
                "- Tags: {}\n",
                if snapshot.tags.is_empty() {
                    "none".to_string()
                } else {
                    snapshot.tags.join(", ")
                }
            ));
            body.push_str(&format!(
                "- Watch targets: {}\n",
                snapshot.state.watch_targets.len()
            ));
            body.push_str(&format!(
                "- Alerted experiments: {}\n",
                snapshot.state.alerted_experiment_ids.len()
            ));
            body.push_str(&format!(
                "- Run reviews: {}\n",
                snapshot.state.run_reviews.len()
            ));
            body.push_str(&format!(
                "- Experiment reviews: {}\n\n",
                snapshot.state.experiment_reviews.len()
            ));
            body.push_str(&format!(
                "- Experiment insights: {}\n\n",
                snapshot.state.experiment_insights.len()
            ));
        }
    }

    body.push_str("## Experiment Reviews\n\n");
    if payload.experiment_reviews.is_empty() {
        body.push_str("- No experiment reviews saved.\n");
    } else {
        for review in &payload.experiment_reviews {
            body.push_str(&format!("### {}\n\n", review.experiment_id));
            body.push_str(&format!("- Verdict: {}\n", review.verdict));
            body.push_str(&format!(
                "- Updated at: {}\n",
                review
                    .updated_at
                    .map(|value| value.to_rfc3339())
                    .unwrap_or_else(|| "unknown".to_string())
            ));
            body.push_str(&format!("- Note: {}\n\n", review.note));
        }
    }

    body.push_str("## Experiment Insights\n\n");
    if payload.experiment_insights.is_empty() {
        body.push_str("- No experiment insights saved.\n");
    } else {
        for insight in &payload.experiment_insights {
            body.push_str(&format!("### {}\n\n", insight.experiment_id));
            body.push_str(&format!(
                "- Interestingness score: {}\n",
                insight.interestingness_score
            ));
            body.push_str(&format!(
                "- Bucket name drift: {}\n",
                insight.bucket_name_drift
            ));
            body.push_str(&format!(
                "- Projection drift: {}\n",
                insight.projection_drift
            ));
            body.push_str(&format!(
                "- Bucket distribution drift: {}\n",
                insight.bucket_distribution_drift
            ));
            body.push_str(&format!("- Junk drift: {}\n", insight.junk_drift));
            body.push_str(&format!("- Review drift: {}\n", insight.review_drift));
            body.push_str(&format!(
                "- Explanation drift: {}\n",
                insight.explanation_drift
            ));
            body.push_str(&format!("- Summary: {}\n", insight.summary_note));
            body.push_str(&format!(
                "- Structural drift note: {}\n\n",
                insight.structural_drift_note.as_deref().unwrap_or("none")
            ));
        }
    }

    body
}

fn format_sort_intent(intent: &SortIntent) -> String {
    match intent {
        SortIntent::Preset(value) => match value {
            SortPreset::General => "general".to_string(),
            SortPreset::Code => "code".to_string(),
            SortPreset::LinearReasoning => "linear_reasoning".to_string(),
            SortPreset::AbstractReasoning => "abstract_reasoning".to_string(),
            SortPreset::Topic => "topic".to_string(),
        },
        SortIntent::Custom(value) => format!("custom: {}", value),
    }
}

fn reconcile_persisted_jobs(jobs: &mut HashMap<String, SortJobSnapshot>) {
    for job in jobs.values_mut() {
        if matches!(job.status, SortJobStatus::Queued | SortJobStatus::Running) {
            job.status = SortJobStatus::Failed;
            job.stage = SortJobStage::Failed;
            job.progress_percent = 100;
            job.finished_at = Some(Utc::now());
            job.cancel_requested = false;
            job.message =
                "Server restarted while this job was active. Stored state was preserved, but the run was interrupted."
                    .to_string();
            job.error_message = Some("job interrupted by server restart".to_string());
            job.progress_notes.push(SortJobProgressNote {
                created_at: Utc::now(),
                stage: SortJobStage::Failed,
                progress_percent: 100,
                message: "Job marked interrupted after server restart.".to_string(),
            });
        }
    }
}

fn sorted_jobs(jobs: &HashMap<String, SortJobSnapshot>) -> Vec<SortJobSnapshot> {
    let mut snapshots = jobs.values().cloned().collect::<Vec<_>>();
    snapshots.sort_by(|left, right| right.created_at.cmp(&left.created_at));
    snapshots
}

async fn run_preflight_with_driver(
    state: &AppState,
    config: &RunConfig,
    preview: &DatasetPreview,
) -> Result<sorter_core::PreflightReport, (StatusCode, String)> {
    match state.llm_driver.as_str() {
        "llama_cli" => {
            let adapter = LlamaCliAdapter::new(&state.runtime_dir, &state.model_path)
                .map_err(internal_error)?;
            timeout(
                Duration::from_secs(90),
                adapter.run_preflight(config, &preview.manifest, &preview.sample),
            )
            .await
            .map_err(|_| {
                (
                    StatusCode::GATEWAY_TIMEOUT,
                    "llama-cli preflight timed out".to_string(),
                )
            })?
            .map_err(internal_error)
        }
        _ => {
            let adapter = MockLlmAdapter;
            adapter
                .run_preflight(config, &preview.manifest, &preview.sample)
                .await
                .map_err(internal_error)
        }
    }
}

async fn run_bucket_plan_with_driver(
    state: &AppState,
    config: &RunConfig,
    preview: &DatasetPreview,
) -> Result<BucketPlan, (StatusCode, String)> {
    match state.llm_driver.as_str() {
        "llama_cli" => {
            let adapter = LlamaCliAdapter::new(&state.runtime_dir, &state.model_path)
                .map_err(internal_error)?;
            timeout(
                Duration::from_secs(120),
                adapter.generate_bucket_plan(config, &preview.manifest, &preview.sample),
            )
            .await
            .map_err(|_| {
                (
                    StatusCode::GATEWAY_TIMEOUT,
                    "llama-cli bucket plan generation timed out".to_string(),
                )
            })?
            .map_err(internal_error)
        }
        _ => {
            let adapter = MockLlmAdapter;
            adapter
                .generate_bucket_plan(config, &preview.manifest, &preview.sample)
                .await
                .map_err(internal_error)
        }
    }
}

async fn run_assignment_with_driver(
    state: &AppState,
    config: &RunConfig,
    plan: &BucketPlan,
    items: &[sorter_core::DatasetItem],
) -> Result<Vec<AssignmentRecord>, (StatusCode, String)> {
    match state.llm_driver.as_str() {
        "llama_cli" => {
            let adapter = LlamaCliAdapter::new(&state.runtime_dir, &state.model_path)
                .map_err(internal_error)?;
            let assignment_timeout_secs = 120_u64 + ((items.len() as u64 / 12) * 45);
            timeout(
                Duration::from_secs(assignment_timeout_secs),
                adapter.assign_items(config, plan, items),
            )
            .await
            .map_err(|_| {
                (
                    StatusCode::GATEWAY_TIMEOUT,
                    "llama-cli assignment timed out".to_string(),
                )
            })?
            .map_err(internal_error)
        }
        _ => {
            let adapter = MockLlmAdapter;
            adapter
                .assign_items(config, plan, items)
                .await
                .map_err(internal_error)
        }
    }
}
