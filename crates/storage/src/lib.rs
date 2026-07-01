use anyhow::{Context, Result};
use arrow_array::{ArrayRef, BooleanArray, Float32Array, RecordBatch, StringArray};
use arrow_schema::{DataType, Field as ArrowField, Schema};
use parquet::arrow::arrow_writer::ArrowWriter;
use parquet::file::reader::{FileReader, SerializedFileReader};
use parquet::record::{Field, Row};
use serde::Serialize;
use sorter_core::{
    AssignmentRecord, AssignmentSummary, BucketCount, BucketPlan, DatasetColumnSummary,
    DatasetFormat, DatasetItem, DatasetManifest, DatasetPreview, DatasetProjectionConfig,
    DatasetProjectionField, DatasetProjectionRenderMode, DatasetSourceKind, DatasetSourceSummary,
    PreflightReport, RunConfig, RunDetail, RunHistoryEntry, RunManifest, RunManifestArtifacts,
    RunManifestKind, SortIntent,
};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct BucketExportFileSummary {
    pub file_name: String,
    pub relative_path: String,
    pub size_bytes: u64,
    pub text_previewable: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct BucketExportBucketSummary {
    pub bucket_dir_name: String,
    pub bucket_id: Option<String>,
    pub display_name: String,
    pub files: Vec<BucketExportFileSummary>,
}

pub fn runs_dir(outputs_root: impl AsRef<Path>) -> PathBuf {
    outputs_root.as_ref().join("runs")
}

pub fn analysis_dir(outputs_root: impl AsRef<Path>) -> PathBuf {
    outputs_root.as_ref().join("analysis")
}

pub fn history_dir(outputs_root: impl AsRef<Path>) -> PathBuf {
    outputs_root.as_ref().join("history")
}

pub fn analysis_history_dir(outputs_root: impl AsRef<Path>) -> PathBuf {
    history_dir(outputs_root).join("analysis")
}

pub fn exports_dir(outputs_root: impl AsRef<Path>) -> PathBuf {
    outputs_root.as_ref().join("exports")
}

pub fn state_dir(outputs_root: impl AsRef<Path>) -> PathBuf {
    outputs_root.as_ref().join("state")
}

pub fn ensure_app_dirs(
    input_datasets_dir: impl AsRef<Path>,
    outputs_dir: impl AsRef<Path>,
) -> Result<()> {
    fs::create_dir_all(input_datasets_dir.as_ref()).with_context(|| {
        format!(
            "failed to create input datasets dir {}",
            input_datasets_dir.as_ref().display()
        )
    })?;
    fs::create_dir_all(outputs_dir.as_ref()).with_context(|| {
        format!(
            "failed to create outputs dir {}",
            outputs_dir.as_ref().display()
        )
    })?;
    fs::create_dir_all(runs_dir(&outputs_dir))
        .with_context(|| format!("failed to create {}", runs_dir(&outputs_dir).display()))?;
    fs::create_dir_all(analysis_dir(&outputs_dir))
        .with_context(|| format!("failed to create {}", analysis_dir(&outputs_dir).display()))?;
    fs::create_dir_all(analysis_history_dir(&outputs_dir)).with_context(|| {
        format!(
            "failed to create {}",
            analysis_history_dir(&outputs_dir).display()
        )
    })?;
    fs::create_dir_all(exports_dir(&outputs_dir))
        .with_context(|| format!("failed to create {}", exports_dir(&outputs_dir).display()))?;
    fs::create_dir_all(state_dir(&outputs_dir))
        .with_context(|| format!("failed to create {}", state_dir(&outputs_dir).display()))?;
    Ok(())
}

pub fn list_output_runs(outputs_root: impl AsRef<Path>) -> Result<Vec<RunHistoryEntry>> {
    let outputs_root = outputs_root.as_ref();
    let mut runs = Vec::new();

    collect_runs_from_root(&runs_dir(outputs_root), &mut runs)?;
    collect_legacy_root_runs(outputs_root, &mut runs)?;

    runs.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(runs)
}

pub fn load_run_detail(outputs_root: impl AsRef<Path>, output_dir_name: &str) -> Result<RunDetail> {
    let run_dir = resolve_run_dir(outputs_root.as_ref(), output_dir_name)?;
    let run_config: RunConfig = read_json(&run_dir.join("run_config.json"))?;
    let preflight: PreflightReport = read_json(&run_dir.join("preflight.json"))?;
    let bucket_plan: BucketPlan = read_json(&run_dir.join("bucket_plan.json"))?;
    let assignment_summary: Option<AssignmentSummary> =
        if run_dir.join("assignment_summary.json").exists() {
            Some(read_json(&run_dir.join("assignment_summary.json"))?)
        } else {
            None
        };
    let assignments = if run_dir.join("assignments.jsonl").exists() {
        read_jsonl_assignments(&run_dir.join("assignments.jsonl"))?
    } else {
        Vec::new()
    };
    let run_manifest = if run_dir.join("run_manifest.json").exists() {
        Some(read_json(&run_dir.join("run_manifest.json"))?)
    } else {
        None
    };
    let run_summary_markdown = if run_dir.join("run_summary.md").exists() {
        Some(
            fs::read_to_string(run_dir.join("run_summary.md")).with_context(|| {
                format!(
                    "failed to read {}",
                    run_dir.join("run_summary.md").display()
                )
            })?,
        )
    } else {
        None
    };

    let history = RunHistoryEntry {
        run_id: run_config.run_id,
        output_dir_name: output_dir_name.to_string(),
        experiment_id: run_config.experiment_id.clone(),
        dataset_display_name: infer_dataset_name_from_dir(output_dir_name),
        sort_intent: run_config.sort_intent.clone(),
        bucket_genesis_mode: run_config.bucket_genesis_mode.clone(),
        requested_positive_bucket_count: run_config.requested_positive_bucket_count,
        force_override: run_config.force_override,
        junk_count: assignment_summary.as_ref().map(|value| value.junk_count),
        review_flag_count: assignment_summary
            .as_ref()
            .map(|value| value.review_flag_count),
        total_items: assignment_summary.as_ref().map(|value| value.total_items),
        created_at: run_config.created_at,
    };

    Ok(RunDetail {
        history,
        run_config,
        preflight,
        bucket_plan,
        assignment_summary,
        assignments,
        run_manifest,
        run_summary_markdown,
    })
}

pub fn load_run_artifact_text(
    outputs_root: impl AsRef<Path>,
    output_dir_name: &str,
    artifact_name: &str,
) -> Result<String> {
    let run_dir = resolve_run_dir(outputs_root.as_ref(), output_dir_name)?;
    let file_name = match artifact_name {
        "run_manifest" => "run_manifest.json",
        "run_summary" => "run_summary.md",
        "run_config" => "run_config.json",
        "preflight" => "preflight.json",
        "bucket_plan" => "bucket_plan.json",
        "dataset_projection" => "dataset_projection.json",
        "assignment_summary" => "assignment_summary.json",
        "assignments" => "assignments.jsonl",
        _ => anyhow::bail!("unsupported run artifact '{}'", artifact_name),
    };

    let path = run_dir.join(file_name);
    fs::read_to_string(&path).with_context(|| format!("failed to read {}", path.display()))
}

pub fn list_bucket_export_summaries(
    outputs_root: impl AsRef<Path>,
    output_dir_name: &str,
) -> Result<Vec<BucketExportBucketSummary>> {
    let run_dir = resolve_run_dir(outputs_root.as_ref(), output_dir_name)?;
    let exports_dir = run_dir.join("bucket_exports");
    if !exports_dir.exists() {
        return Ok(Vec::new());
    }

    let mut buckets = fs::read_dir(&exports_dir)
        .with_context(|| format!("failed to read {}", exports_dir.display()))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_dir())
        .map(|entry| {
            let bucket_dir_name = entry.file_name().to_string_lossy().to_string();
            let mut files = fs::read_dir(entry.path())
                .with_context(|| format!("failed to read {}", entry.path().display()))?
                .filter_map(|file| file.ok())
                .filter(|file| file.path().is_file())
                .map(|file| {
                    let file_name = file.file_name().to_string_lossy().to_string();
                    let size_bytes = file.metadata().map(|meta| meta.len()).unwrap_or(0);
                    BucketExportFileSummary {
                        relative_path: format!("bucket_exports/{}/{}", bucket_dir_name, file_name),
                        file_name: file_name.clone(),
                        size_bytes,
                        text_previewable: is_text_previewable_export_file_name(&file_name),
                    }
                })
                .collect::<Vec<_>>();
            files.sort_by(|left, right| left.file_name.cmp(&right.file_name));

            Ok(BucketExportBucketSummary {
                bucket_id: parse_bucket_id(&bucket_dir_name),
                display_name: humanize_bucket_export_dir_name(&bucket_dir_name),
                bucket_dir_name,
                files,
            })
        })
        .collect::<Result<Vec<_>>>()?;

    buckets.sort_by(|left, right| left.bucket_dir_name.cmp(&right.bucket_dir_name));
    Ok(buckets)
}

pub fn load_bucket_export_file_text(
    outputs_root: impl AsRef<Path>,
    output_dir_name: &str,
    bucket_dir_name: &str,
    file_name: &str,
) -> Result<String> {
    validate_single_path_component(bucket_dir_name, "bucket export directory")?;
    validate_single_path_component(file_name, "bucket export file")?;

    let run_dir = resolve_run_dir(outputs_root.as_ref(), output_dir_name)?;
    let path = run_dir
        .join("bucket_exports")
        .join(bucket_dir_name)
        .join(file_name);
    fs::read_to_string(&path).with_context(|| format!("failed to read {}", path.display()))
}

pub fn load_bucket_export_file_bytes(
    outputs_root: impl AsRef<Path>,
    output_dir_name: &str,
    bucket_dir_name: &str,
    file_name: &str,
) -> Result<Vec<u8>> {
    validate_single_path_component(bucket_dir_name, "bucket export directory")?;
    validate_single_path_component(file_name, "bucket export file")?;

    let run_dir = resolve_run_dir(outputs_root.as_ref(), output_dir_name)?;
    let path = run_dir
        .join("bucket_exports")
        .join(bucket_dir_name)
        .join(file_name);
    fs::read(&path).with_context(|| format!("failed to read {}", path.display()))
}

pub fn ensure_run_dir(base_dir: impl AsRef<Path>, run_id: &str) -> Result<PathBuf> {
    let run_dir = base_dir.as_ref().join(run_id);
    fs::create_dir_all(&run_dir)
        .with_context(|| format!("failed to create run dir {}", run_dir.display()))?;
    Ok(run_dir)
}

pub fn write_run_artifacts(
    run_dir: impl AsRef<Path>,
    config: &RunConfig,
    preflight: &PreflightReport,
    plan: &BucketPlan,
) -> Result<()> {
    let run_dir = run_dir.as_ref();
    write_json(run_dir.join("run_config.json"), config)?;
    write_json(run_dir.join("preflight.json"), preflight)?;
    write_json(run_dir.join("bucket_plan.json"), plan)?;
    if let Some(projection) = &config.dataset_projection {
        write_json(run_dir.join("dataset_projection.json"), projection)?;
    }
    Ok(())
}

pub fn write_run_manifest(
    run_dir: impl AsRef<Path>,
    dataset: &DatasetSourceSummary,
    config: &RunConfig,
    preflight: &PreflightReport,
    plan: &BucketPlan,
    assignment_summary: Option<&AssignmentSummary>,
) -> Result<()> {
    let run_dir = run_dir.as_ref();
    let manifest = build_run_manifest(
        run_dir,
        dataset,
        config,
        preflight,
        plan,
        assignment_summary,
    );
    write_json(run_dir.join("run_manifest.json"), &manifest)?;
    fs::write(
        run_dir.join("run_summary.md"),
        render_run_summary_markdown(&manifest, config, preflight, plan, assignment_summary),
    )
    .with_context(|| {
        format!(
            "failed to write {}",
            run_dir.join("run_summary.md").display()
        )
    })?;
    Ok(())
}

pub fn write_assignments(
    run_dir: impl AsRef<Path>,
    assignments: &[AssignmentRecord],
) -> Result<()> {
    let run_dir = run_dir.as_ref();
    let mut body = String::new();
    for assignment in assignments {
        let line = serde_json::to_string(assignment).context("failed to serialize assignment")?;
        body.push_str(&line);
        body.push('\n');
    }
    fs::write(run_dir.join("assignments.jsonl"), body).with_context(|| {
        format!(
            "failed to write {}",
            run_dir.join("assignments.jsonl").display()
        )
    })?;
    Ok(())
}

pub fn build_assignment_summary(
    plan: &BucketPlan,
    assignments: &[AssignmentRecord],
) -> AssignmentSummary {
    let bucket_counts = plan
        .buckets
        .iter()
        .map(|bucket| BucketCount {
            bucket_id: bucket.bucket_id.clone(),
            count: assignments
                .iter()
                .filter(|assignment| assignment.assigned_bucket_id == bucket.bucket_id)
                .count(),
        })
        .collect();

    AssignmentSummary {
        total_items: assignments.len(),
        bucket_counts,
        junk_count: assignments
            .iter()
            .filter(|assignment| assignment.assigned_bucket_id == plan.junk_bucket.bucket_id)
            .count(),
        review_flag_count: assignments
            .iter()
            .filter(|assignment| assignment.review_flag)
            .count(),
    }
}

pub fn write_assignment_summary(
    run_dir: impl AsRef<Path>,
    summary: &AssignmentSummary,
) -> Result<()> {
    write_json(run_dir.as_ref().join("assignment_summary.json"), summary)
}

pub fn migrate_output_layout(
    outputs_root: impl AsRef<Path>,
) -> Result<OutputLayoutMigrationReport> {
    let outputs_root = outputs_root.as_ref();
    let mut report = OutputLayoutMigrationReport::default();

    migrate_path(
        &outputs_root.join("jobs-registry.json"),
        &state_dir(outputs_root).join("jobs-registry.json"),
        &mut report,
    )?;
    migrate_path(
        &outputs_root.join("analysis-state.json"),
        &analysis_dir(outputs_root).join("analysis-state.json"),
        &mut report,
    )?;
    migrate_path(
        &outputs_root.join("analysis-summary.md"),
        &analysis_dir(outputs_root).join("analysis-summary.md"),
        &mut report,
    )?;

    let legacy_analysis_history = outputs_root.join("analysis-history");
    if legacy_analysis_history.exists() && legacy_analysis_history.is_dir() {
        for entry in fs::read_dir(&legacy_analysis_history)
            .with_context(|| format!("failed to read {}", legacy_analysis_history.display()))?
        {
            let entry = entry?;
            let source = entry.path();
            let destination = analysis_history_dir(outputs_root).join(entry.file_name());
            migrate_path(&source, &destination, &mut report)?;
        }

        if is_dir_empty(&legacy_analysis_history)? {
            fs::remove_dir(&legacy_analysis_history).with_context(|| {
                format!("failed to remove {}", legacy_analysis_history.display())
            })?;
            report
                .removed_empty_dirs
                .push(path_string(&legacy_analysis_history));
        }
    }

    for entry in fs::read_dir(outputs_root)
        .with_context(|| format!("failed to read {}", outputs_root.display()))?
    {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("sorted-") {
            continue;
        }

        let source = entry.path();
        let destination = runs_dir(outputs_root).join(&name);
        migrate_path(&source, &destination, &mut report)?;
    }

    Ok(report)
}

#[derive(Debug, Clone, Default)]
pub struct OutputLayoutMigrationReport {
    pub moved_paths: Vec<String>,
    pub skipped_paths: Vec<String>,
    pub removed_empty_dirs: Vec<String>,
}

fn write_json(path: PathBuf, value: &impl Serialize) -> Result<()> {
    let body = serde_json::to_string_pretty(value).context("failed to serialize json")?;
    fs::write(&path, body + "\n").with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    let body =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    serde_json::from_str(&body).with_context(|| format!("failed to parse {}", path.display()))
}

fn read_jsonl_assignments(path: &Path) -> Result<Vec<AssignmentRecord>> {
    let body =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let mut assignments = Vec::new();

    for (index, line) in body.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let assignment = serde_json::from_str(trimmed).with_context(|| {
            format!(
                "failed to parse assignment line {} in {}",
                index + 1,
                path.display()
            )
        })?;
        assignments.push(assignment);
    }

    Ok(assignments)
}

pub fn list_dataset_sources(input_root: impl AsRef<Path>) -> Result<Vec<DatasetSourceSummary>> {
    let input_root = input_root.as_ref();
    let mut datasets = Vec::new();

    for entry in fs::read_dir(input_root)
        .with_context(|| format!("failed to read {}", input_root.display()))?
    {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;

        if file_type.is_dir() || (file_type.is_file() && is_supported_top_level_file(&path)) {
            let relative_path = entry.file_name().to_string_lossy().to_string();
            let source_kind = if file_type.is_dir() {
                DatasetSourceKind::Directory
            } else {
                DatasetSourceKind::File
            };
            datasets.push(DatasetSourceSummary {
                dataset_id: encode_dataset_id(&relative_path),
                display_name: relative_path.clone(),
                source_kind,
                dataset_format: detect_dataset_format(&path, file_type.is_dir()),
                relative_path,
            });
        }
    }

    datasets.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    Ok(datasets)
}

pub fn load_dataset_preview(
    input_root: impl AsRef<Path>,
    dataset_id: &str,
    sample_limit: usize,
    projection: Option<&DatasetProjectionConfig>,
) -> Result<DatasetPreview> {
    let sources = list_dataset_sources(&input_root)?;
    let source = sources
        .into_iter()
        .find(|item| item.dataset_id == dataset_id)
        .with_context(|| format!("dataset '{}' not found", dataset_id))?;

    let path = input_root.as_ref().join(&source.relative_path);
    let schema_columns = load_dataset_schema_columns(&path, &source.dataset_format)?;
    let effective_projection = projection
        .cloned()
        .or_else(|| default_projection_for_preview(&source.dataset_format, &schema_columns));
    let items = load_dataset_items(&path, effective_projection.as_ref())?;
    let sample: Vec<DatasetItem> = items.iter().take(sample_limit).cloned().collect();
    let raw_sample_rows = load_raw_sample_rows(&path, &source.dataset_format, sample_limit)?;
    let manifest = DatasetManifest {
        item_count: items.len(),
        sample_size: sample.len(),
        dataset_format: source.dataset_format.clone(),
        schema_columns: schema_columns.clone(),
        projection: effective_projection,
    };

    Ok(DatasetPreview {
        source,
        manifest,
        sample,
        raw_sample_rows,
    })
}

pub fn load_dataset_items_by_id(
    input_root: impl AsRef<Path>,
    dataset_id: &str,
    projection: Option<&DatasetProjectionConfig>,
) -> Result<(DatasetSourceSummary, Vec<DatasetItem>)> {
    let sources = list_dataset_sources(&input_root)?;
    let source = sources
        .into_iter()
        .find(|item| item.dataset_id == dataset_id)
        .with_context(|| format!("dataset '{}' not found", dataset_id))?;

    let path = input_root.as_ref().join(&source.relative_path);
    let items = load_dataset_items(&path, projection)?;
    Ok((source, items))
}

pub fn prepare_sorted_output_dir(
    outputs_root: impl AsRef<Path>,
    dataset_display_name: &str,
    run_id: &str,
) -> Result<PathBuf> {
    let folder_name = format!("sorted-{}-{}", sanitize_name(dataset_display_name), run_id);
    let output_dir = runs_dir(outputs_root).join(folder_name);
    fs::create_dir_all(&output_dir)
        .with_context(|| format!("failed to create {}", output_dir.display()))?;
    Ok(output_dir)
}

pub fn materialize_bucket_folders(output_dir: impl AsRef<Path>, plan: &BucketPlan) -> Result<()> {
    let output_dir = output_dir.as_ref();

    for bucket in &plan.buckets {
        let bucket_dir = output_dir.join(format!(
            "{}-{}",
            bucket.bucket_id.to_ascii_lowercase(),
            sanitize_name(&bucket.name)
        ));
        fs::create_dir_all(&bucket_dir)
            .with_context(|| format!("failed to create {}", bucket_dir.display()))?;
        write_json(bucket_dir.join("_bucket.json"), bucket)?;
    }

    let junk_dir = output_dir.join(sanitize_name(&plan.junk_bucket.name));
    fs::create_dir_all(&junk_dir)
        .with_context(|| format!("failed to create {}", junk_dir.display()))?;
    write_json(junk_dir.join("_bucket.json"), &plan.junk_bucket)?;

    Ok(())
}

pub fn materialize_assigned_items(
    output_dir: impl AsRef<Path>,
    plan: &BucketPlan,
    items: &[DatasetItem],
    assignments: &[AssignmentRecord],
) -> Result<()> {
    let output_dir = output_dir.as_ref();

    for assignment in assignments {
        let Some(item) = items.iter().find(|item| item.item_id == assignment.item_id) else {
            continue;
        };

        let target_dir = if assignment.assigned_bucket_id == plan.junk_bucket.bucket_id {
            output_dir.join(sanitize_name(&plan.junk_bucket.name))
        } else {
            let bucket = plan
                .buckets
                .iter()
                .find(|bucket| bucket.bucket_id == assignment.assigned_bucket_id)
                .with_context(|| {
                    format!(
                        "assignment referenced unknown bucket {}",
                        assignment.assigned_bucket_id
                    )
                })?;
            output_dir.join(format!(
                "{}-{}",
                bucket.bucket_id.to_ascii_lowercase(),
                sanitize_name(&bucket.name)
            ))
        };

        let file_stem = sanitize_name(&item.item_id);
        let item_path = target_dir.join(format!("{}.txt", file_stem));
        fs::write(&item_path, &item.content)
            .with_context(|| format!("failed to write {}", item_path.display()))?;

        let meta_path = target_dir.join(format!("{}.assignment.json", file_stem));
        write_json(meta_path, assignment)?;
    }

    Ok(())
}

pub fn write_bucket_machine_exports(
    output_dir: impl AsRef<Path>,
    plan: &BucketPlan,
    items: &[DatasetItem],
    assignments: &[AssignmentRecord],
) -> Result<()> {
    let output_dir = output_dir.as_ref();
    let exports_dir = output_dir.join("bucket_exports");
    fs::create_dir_all(&exports_dir)
        .with_context(|| format!("failed to create {}", exports_dir.display()))?;

    for (bucket_id, bucket_dir_name, bucket_name) in iter_bucket_export_targets(output_dir, plan) {
        let export_dir = exports_dir.join(bucket_dir_name);
        fs::create_dir_all(&export_dir)
            .with_context(|| format!("failed to create {}", export_dir.display()))?;

        let mut jsonl_body = String::new();
        let mut csv_rows = vec![
            "item_id,assigned_bucket_id,assigned_bucket_name,confidence,review_flag,rationale,content,raw_record_json"
                .to_string(),
        ];
        let mut parquet_rows = Vec::new();

        for assignment in assignments
            .iter()
            .filter(|assignment| assignment.assigned_bucket_id == bucket_id)
        {
            let Some(item) = items.iter().find(|item| item.item_id == assignment.item_id) else {
                continue;
            };

            let export_record = serde_json::json!({
                "item_id": item.item_id,
                "assigned_bucket_id": assignment.assigned_bucket_id,
                "assigned_bucket_name": bucket_name,
                "confidence": assignment.confidence,
                "review_flag": assignment.review_flag,
                "rationale": assignment.rationale,
                "content": item.content,
                "raw_record": item.raw_record,
            });
            parquet_rows.push(export_record.clone());
            jsonl_body.push_str(
                &serde_json::to_string(&export_record)
                    .context("failed to serialize bucket export record")?,
            );
            jsonl_body.push('\n');

            csv_rows.push(
                [
                    csv_escape(&item.item_id),
                    csv_escape(&assignment.assigned_bucket_id),
                    csv_escape(bucket_name),
                    csv_escape(&assignment.confidence.to_string()),
                    csv_escape(if assignment.review_flag {
                        "true"
                    } else {
                        "false"
                    }),
                    csv_escape(&assignment.rationale),
                    csv_escape(&item.content),
                    csv_escape(
                        &item
                            .raw_record
                            .as_ref()
                            .map(serde_json::Value::to_string)
                            .unwrap_or_default(),
                    ),
                ]
                .join(","),
            );
        }

        fs::write(export_dir.join("items.jsonl"), jsonl_body).with_context(|| {
            format!(
                "failed to write {}",
                export_dir.join("items.jsonl").display()
            )
        })?;
        fs::write(export_dir.join("items.csv"), csv_rows.join("\n") + "\n").with_context(|| {
            format!("failed to write {}", export_dir.join("items.csv").display())
        })?;
        write_bucket_parquet_export(export_dir.join("items.parquet"), &parquet_rows)?;
    }

    Ok(())
}

fn write_bucket_parquet_export(path: PathBuf, rows: &[serde_json::Value]) -> Result<()> {
    let raw_keys = collect_raw_record_keys(rows);
    let mut fields = vec![
        ArrowField::new("item_id", DataType::Utf8, false),
        ArrowField::new("assigned_bucket_id", DataType::Utf8, false),
        ArrowField::new("assigned_bucket_name", DataType::Utf8, false),
        ArrowField::new("confidence", DataType::Float32, false),
        ArrowField::new("review_flag", DataType::Boolean, false),
        ArrowField::new("rationale", DataType::Utf8, false),
        ArrowField::new("content", DataType::Utf8, false),
        ArrowField::new("raw_record_json", DataType::Utf8, true),
    ];
    fields.extend(
        raw_keys
            .iter()
            .map(|key| ArrowField::new(format!("raw__{key}"), DataType::Utf8, true)),
    );
    let schema = std::sync::Arc::new(Schema::new(fields));

    let mut columns: Vec<ArrayRef> = vec![
        std::sync::Arc::new(StringArray::from(
            rows.iter()
                .map(|row| json_string_field(row, "item_id"))
                .collect::<Vec<_>>(),
        )),
        std::sync::Arc::new(StringArray::from(
            rows.iter()
                .map(|row| json_string_field(row, "assigned_bucket_id"))
                .collect::<Vec<_>>(),
        )),
        std::sync::Arc::new(StringArray::from(
            rows.iter()
                .map(|row| json_string_field(row, "assigned_bucket_name"))
                .collect::<Vec<_>>(),
        )),
        std::sync::Arc::new(Float32Array::from(
            rows.iter()
                .map(|row| json_f32_field(row, "confidence"))
                .collect::<Vec<_>>(),
        )),
        std::sync::Arc::new(BooleanArray::from(
            rows.iter()
                .map(|row| json_bool_field(row, "review_flag"))
                .collect::<Vec<_>>(),
        )),
        std::sync::Arc::new(StringArray::from(
            rows.iter()
                .map(|row| json_string_field(row, "rationale"))
                .collect::<Vec<_>>(),
        )),
        std::sync::Arc::new(StringArray::from(
            rows.iter()
                .map(|row| json_string_field(row, "content"))
                .collect::<Vec<_>>(),
        )),
        std::sync::Arc::new(StringArray::from(
            rows.iter()
                .map(|row| json_optional_field_as_string(row, "raw_record"))
                .collect::<Vec<_>>(),
        )),
    ];

    for key in &raw_keys {
        columns.push(std::sync::Arc::new(StringArray::from(
            rows.iter()
                .map(|row| raw_record_value_for_key(row, key))
                .collect::<Vec<_>>(),
        )));
    }

    let batch = RecordBatch::try_new(schema.clone(), columns)
        .context("failed to build parquet record batch for bucket export")?;
    let file =
        fs::File::create(&path).with_context(|| format!("failed to create {}", path.display()))?;
    let mut writer =
        ArrowWriter::try_new(file, schema, None).context("failed to create parquet writer")?;
    writer
        .write(&batch)
        .with_context(|| format!("failed to write {}", path.display()))?;
    writer
        .close()
        .with_context(|| format!("failed to finalize {}", path.display()))?;
    Ok(())
}

fn collect_raw_record_keys(rows: &[serde_json::Value]) -> Vec<String> {
    let mut keys = rows
        .iter()
        .filter_map(|row| row.get("raw_record")?.as_object())
        .flat_map(|record| record.keys().cloned())
        .collect::<Vec<_>>();
    keys.sort();
    keys.dedup();
    keys
}

fn json_string_field(row: &serde_json::Value, key: &str) -> String {
    row.get(key)
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn json_f32_field(row: &serde_json::Value, key: &str) -> f32 {
    row.get(key)
        .and_then(serde_json::Value::as_f64)
        .unwrap_or_default() as f32
}

fn json_bool_field(row: &serde_json::Value, key: &str) -> bool {
    row.get(key)
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

fn json_optional_field_as_string(row: &serde_json::Value, key: &str) -> Option<String> {
    row.get(key).and_then(json_value_to_string_option)
}

fn raw_record_value_for_key(row: &serde_json::Value, key: &str) -> Option<String> {
    row.get("raw_record")
        .and_then(serde_json::Value::as_object)
        .and_then(|record| record.get(key))
        .and_then(json_value_to_string_option)
}

fn json_value_to_string_option(value: &serde_json::Value) -> Option<String> {
    if value.is_null() {
        return None;
    }
    value
        .as_str()
        .map(ToOwned::to_owned)
        .or_else(|| Some(value.to_string()))
}

fn load_dataset_items(
    path: &Path,
    projection: Option<&DatasetProjectionConfig>,
) -> Result<Vec<DatasetItem>> {
    if path.is_dir() {
        load_items_from_directory(path)
    } else {
        load_items_from_file(path, projection)
    }
}

fn load_items_from_directory(root: &Path) -> Result<Vec<DatasetItem>> {
    let mut files = Vec::new();
    collect_supported_files(root, &mut files)?;
    files.sort();

    let mut items = Vec::new();
    for file_path in files {
        let relative = file_path
            .strip_prefix(root)
            .unwrap_or(&file_path)
            .to_string_lossy()
            .replace('\\', "/");
        let content = fs::read_to_string(&file_path)
            .with_context(|| format!("failed to read {}", file_path.display()))?;
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            items.push(DatasetItem {
                item_id: relative.clone(),
                content: trimmed.to_string(),
                raw_record: None,
            });
        }
    }

    Ok(items)
}

fn collect_supported_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
    for entry in fs::read_dir(dir).with_context(|| format!("failed to read {}", dir.display()))? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;

        if file_type.is_dir() {
            collect_supported_files(&path, out)?;
        } else if file_type.is_file() && is_supported_document_file(&path) {
            out.push(path);
        }
    }
    Ok(())
}

fn load_items_from_file(
    path: &Path,
    projection: Option<&DatasetProjectionConfig>,
) -> Result<Vec<DatasetItem>> {
    match extension(path).as_deref() {
        Some("parquet") => load_parquet_items(path, projection),
        Some("jsonl") => load_jsonl_items(path),
        Some("json") => load_json_items(path),
        Some(_) => {
            let content = fs::read_to_string(path)
                .with_context(|| format!("failed to read {}", path.display()))?;
            let trimmed = content.trim();
            if trimmed.is_empty() {
                Ok(Vec::new())
            } else {
                Ok(vec![DatasetItem {
                    item_id: file_name_string(path),
                    content: trimmed.to_string(),
                    raw_record: None,
                }])
            }
        }
        None => Ok(Vec::new()),
    }
}

fn load_jsonl_items(path: &Path) -> Result<Vec<DatasetItem>> {
    let body =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let mut items = Vec::new();

    for (index, line) in body.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let value: serde_json::Value = serde_json::from_str(trimmed).with_context(|| {
            format!(
                "failed to parse jsonl line {} in {}",
                index + 1,
                path.display()
            )
        })?;
        if let Some(item) = dataset_item_from_json_value(value, index + 1) {
            items.push(item);
        }
    }

    Ok(items)
}

fn load_json_items(path: &Path) -> Result<Vec<DatasetItem>> {
    let body =
        fs::read_to_string(path).with_context(|| format!("failed to read {}", path.display()))?;
    let value: serde_json::Value = serde_json::from_str(&body)
        .with_context(|| format!("failed to parse {}", path.display()))?;

    let mut items = Vec::new();
    match value {
        serde_json::Value::Array(values) => {
            for (index, value) in values.into_iter().enumerate() {
                if let Some(item) = dataset_item_from_json_value(value, index + 1) {
                    items.push(item);
                }
            }
        }
        other => {
            if let Some(item) = dataset_item_from_json_value(other, 1) {
                items.push(item);
            }
        }
    }
    Ok(items)
}

fn dataset_item_from_json_value(value: serde_json::Value, index: usize) -> Option<DatasetItem> {
    match value {
        serde_json::Value::String(content) => {
            let trimmed = content.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(DatasetItem {
                    item_id: index.to_string(),
                    content: trimmed.to_string(),
                    raw_record: None,
                })
            }
        }
        serde_json::Value::Object(map) => {
            let content = map
                .get("content")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())?;
            let item_id = map
                .get("item_id")
                .and_then(|value| value.as_str())
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| index.to_string());
            Some(DatasetItem {
                item_id,
                content: content.to_string(),
                raw_record: Some(serde_json::Value::Object(map)),
            })
        }
        _ => None,
    }
}

fn load_parquet_items(
    path: &Path,
    projection: Option<&DatasetProjectionConfig>,
) -> Result<Vec<DatasetItem>> {
    let file =
        fs::File::open(path).with_context(|| format!("failed to open {}", path.display()))?;
    let reader = SerializedFileReader::new(file)
        .with_context(|| format!("failed to read parquet {}", path.display()))?;
    let row_iter = reader
        .get_row_iter(None)
        .with_context(|| format!("failed to iterate parquet rows in {}", path.display()))?;

    let mut items = Vec::new();
    for (index, row) in row_iter.enumerate() {
        let row = row.with_context(|| {
            format!(
                "failed to read parquet row {} in {}",
                index + 1,
                path.display()
            )
        })?;
        let content = render_parquet_row(&row, projection);
        let trimmed = content.trim();
        if trimmed.is_empty() {
            continue;
        }
        let item_id = parquet_row_item_id(&row, projection)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| format!("row-{}", index + 1));
        items.push(DatasetItem {
            item_id,
            content: trimmed.to_string(),
            raw_record: Some(parquet_row_to_json(&row)),
        });
    }

    Ok(items)
}

fn load_dataset_schema_columns(
    path: &Path,
    dataset_format: &DatasetFormat,
) -> Result<Vec<DatasetColumnSummary>> {
    if !matches!(dataset_format, DatasetFormat::Parquet) {
        return Ok(Vec::new());
    }

    let file =
        fs::File::open(path).with_context(|| format!("failed to open {}", path.display()))?;
    let reader = SerializedFileReader::new(file)
        .with_context(|| format!("failed to read parquet {}", path.display()))?;
    let schema = reader.metadata().file_metadata().schema_descr_ptr();

    let mut columns = Vec::new();
    for column in schema.columns() {
        columns.push(DatasetColumnSummary {
            name: column.path().string(),
            logical_type: Some(format!("{:?}", column.physical_type())),
            nullable: None,
        });
    }

    Ok(columns)
}

fn default_projection_for_preview(
    dataset_format: &DatasetFormat,
    schema_columns: &[DatasetColumnSummary],
) -> Option<DatasetProjectionConfig> {
    if !matches!(dataset_format, DatasetFormat::Parquet) {
        return None;
    }

    Some(DatasetProjectionConfig {
        selected_fields: schema_columns
            .iter()
            .map(|column| DatasetProjectionField {
                field_name: column.name.clone(),
                display_label: None,
            })
            .collect(),
        item_id_field: None,
        render_mode: DatasetProjectionRenderMode::FieldLabeledText,
    })
}

fn load_raw_sample_rows(
    path: &Path,
    dataset_format: &DatasetFormat,
    sample_limit: usize,
) -> Result<Vec<serde_json::Value>> {
    if !matches!(dataset_format, DatasetFormat::Parquet) {
        return Ok(Vec::new());
    }

    let file =
        fs::File::open(path).with_context(|| format!("failed to open {}", path.display()))?;
    let reader = SerializedFileReader::new(file)
        .with_context(|| format!("failed to read parquet {}", path.display()))?;
    let row_iter = reader
        .get_row_iter(None)
        .with_context(|| format!("failed to iterate parquet rows in {}", path.display()))?;

    let mut rows = Vec::new();
    for (index, row) in row_iter.enumerate() {
        if index >= sample_limit {
            break;
        }
        let row = row.with_context(|| {
            format!(
                "failed to read parquet row {} in {}",
                index + 1,
                path.display()
            )
        })?;
        rows.push(parquet_row_to_json(&row));
    }

    Ok(rows)
}

fn render_parquet_row(row: &Row, projection: Option<&DatasetProjectionConfig>) -> String {
    let columns = parquet_row_columns(row);
    let field_names = projection
        .map(|config| {
            config
                .selected_fields
                .iter()
                .map(|field| field.field_name.as_str())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let render_mode = projection
        .map(|config| config.render_mode.clone())
        .unwrap_or(DatasetProjectionRenderMode::FieldLabeledText);

    let selected_columns = if field_names.is_empty() {
        columns.clone()
    } else {
        field_names
            .iter()
            .filter_map(|name| {
                columns
                    .iter()
                    .find(|(column_name, _)| column_name == name)
                    .cloned()
            })
            .collect::<Vec<_>>()
    };

    match render_mode {
        DatasetProjectionRenderMode::PlainText => selected_columns
            .into_iter()
            .map(|(_, value)| value)
            .collect::<Vec<_>>()
            .join("\n"),
        DatasetProjectionRenderMode::FieldLabeledText => selected_columns
            .into_iter()
            .map(|(name, value)| format!("{}: {}", name, value))
            .collect::<Vec<_>>()
            .join("\n"),
    }
}

fn render_parquet_field(field: &Field) -> String {
    match field {
        Field::Null => String::new(),
        Field::Bool(value) => value.to_string(),
        Field::Byte(value) => value.to_string(),
        Field::Short(value) => value.to_string(),
        Field::Int(value) => value.to_string(),
        Field::Long(value) => value.to_string(),
        Field::UByte(value) => value.to_string(),
        Field::UShort(value) => value.to_string(),
        Field::UInt(value) => value.to_string(),
        Field::ULong(value) => value.to_string(),
        Field::Float16(value) => value.to_string(),
        Field::Float(value) => value.to_string(),
        Field::Double(value) => value.to_string(),
        Field::Decimal(value) => format!("{value:?}"),
        Field::Str(value) => value.clone(),
        Field::Bytes(value) => value
            .as_utf8()
            .map(|text| text.to_string())
            .unwrap_or_else(|_| format!("{:?}", value.data())),
        Field::Date(value) => value.to_string(),
        Field::TimestampMillis(value) => value.to_string(),
        Field::TimestampMicros(value) => value.to_string(),
        Field::Group(row) => parquet_row_to_json(row).to_string(),
        Field::ListInternal(list) => format!("{list:?}"),
        Field::MapInternal(map) => format!("{map:?}"),
    }
}

fn parquet_row_columns(row: &Row) -> Vec<(String, String)> {
    row.get_column_iter()
        .map(|(name, field)| (name.to_string(), render_parquet_field(field)))
        .collect()
}

fn parquet_row_item_id(row: &Row, projection: Option<&DatasetProjectionConfig>) -> Option<String> {
    let id_field = projection?.item_id_field.as_deref()?;
    parquet_row_columns(row)
        .into_iter()
        .find(|(name, _)| name == id_field)
        .map(|(_, value)| value)
}

fn parquet_row_to_json(row: &Row) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for (name, value) in parquet_row_columns(row) {
        map.insert(name, serde_json::Value::String(value));
    }
    serde_json::Value::Object(map)
}

fn encode_dataset_id(relative_path: &str) -> String {
    relative_path
        .replace('\\', "--")
        .replace('/', "--")
        .replace(' ', "-")
}

fn detect_dataset_format(path: &Path, is_dir: bool) -> sorter_core::DatasetFormat {
    if is_dir {
        return DatasetFormat::Directory;
    }

    match extension(path).as_deref() {
        Some("jsonl") => DatasetFormat::Jsonl,
        Some("json") => DatasetFormat::Json,
        Some("parquet") => DatasetFormat::Parquet,
        Some("txt" | "md") => DatasetFormat::TextFile,
        _ => DatasetFormat::Unknown,
    }
}

fn infer_dataset_name_from_dir(output_dir_name: &str) -> String {
    let Some(rest) = output_dir_name.strip_prefix("sorted-") else {
        return output_dir_name.to_string();
    };

    let parts: Vec<&str> = rest.split('-').collect();
    if parts.len() >= 6 {
        let tail = &parts[parts.len() - 5..];
        let looks_like_uuid = tail[0].len() == 8
            && tail[1].len() == 4
            && tail[2].len() == 4
            && tail[3].len() == 4
            && tail[4].len() == 12;
        if looks_like_uuid {
            return parts[..parts.len() - 5].join("-");
        }
    }

    rest.to_string()
}

fn build_run_manifest(
    run_dir: &Path,
    dataset: &DatasetSourceSummary,
    config: &RunConfig,
    _preflight: &PreflightReport,
    plan: &BucketPlan,
    assignment_summary: Option<&AssignmentSummary>,
) -> RunManifest {
    let kind = if assignment_summary.is_some() {
        RunManifestKind::FullSort
    } else {
        RunManifestKind::PlanOnly
    };

    RunManifest {
        run_id: config.run_id,
        created_at: config.created_at,
        kind,
        dataset: dataset.clone(),
        experiment_id: config.experiment_id.clone(),
        sort_intent: config.sort_intent.clone(),
        bucket_genesis_mode: config.bucket_genesis_mode.clone(),
        requested_positive_bucket_count: config.requested_positive_bucket_count,
        positive_bucket_count: plan.positive_bucket_count,
        force_override: config.force_override,
        model_id: plan.model_id.clone(),
        total_items: assignment_summary.map(|summary| summary.total_items),
        junk_count: assignment_summary.map(|summary| summary.junk_count),
        review_flag_count: assignment_summary.map(|summary| summary.review_flag_count),
        artifacts: RunManifestArtifacts {
            run_config: relative_artifact_path(run_dir, "run_config.json"),
            preflight: relative_artifact_path(run_dir, "preflight.json"),
            bucket_plan: relative_artifact_path(run_dir, "bucket_plan.json"),
            dataset_projection: config
                .dataset_projection
                .as_ref()
                .map(|_| relative_artifact_path(run_dir, "dataset_projection.json")),
            assignment_summary: assignment_summary
                .map(|_| relative_artifact_path(run_dir, "assignment_summary.json")),
            assignments_jsonl: assignment_summary
                .map(|_| relative_artifact_path(run_dir, "assignments.jsonl")),
            bucket_exports_dir: assignment_summary
                .map(|_| relative_artifact_path(run_dir, "bucket_exports")),
            human_summary_markdown: relative_artifact_path(run_dir, "run_summary.md"),
        },
    }
}

fn render_run_summary_markdown(
    manifest: &RunManifest,
    config: &RunConfig,
    preflight: &PreflightReport,
    plan: &BucketPlan,
    assignment_summary: Option<&AssignmentSummary>,
) -> String {
    let mut body = String::new();
    body.push_str("# Run Summary\n\n");
    body.push_str(&format!("- Run ID: {}\n", manifest.run_id));
    body.push_str(&format!(
        "- Created at: {}\n",
        manifest.created_at.to_rfc3339()
    ));
    body.push_str(&format!("- Dataset: {}\n", manifest.dataset.display_name));
    body.push_str(&format!(
        "- Dataset source: {}\n",
        manifest.dataset.relative_path
    ));
    body.push_str(&format!(
        "- Dataset format: {:?}\n",
        manifest.dataset.dataset_format
    ));
    if let Some(projection) = &config.dataset_projection {
        let selected_fields = projection
            .selected_fields
            .iter()
            .map(|field| field.field_name.as_str())
            .collect::<Vec<_>>();
        body.push_str(&format!(
            "- Projection fields: {}\n",
            if selected_fields.is_empty() {
                "none".to_string()
            } else {
                selected_fields.join(", ")
            }
        ));
        body.push_str(&format!(
            "- Projection id field: {}\n",
            projection
                .item_id_field
                .as_deref()
                .unwrap_or("implicit_row_index")
        ));
        body.push_str(&format!(
            "- Projection render mode: {:?}\n",
            projection.render_mode
        ));
    }
    body.push_str(&format!(
        "- Sort intent: {}\n",
        format_sort_intent(&manifest.sort_intent)
    ));
    body.push_str(&format!(
        "- Bucket genesis mode: {}\n",
        format_bucket_genesis_mode(&manifest.bucket_genesis_mode)
    ));
    body.push_str(&format!(
        "- Requested positive buckets: {}\n",
        manifest.requested_positive_bucket_count
    ));
    body.push_str(&format!(
        "- Planned positive buckets: {}\n",
        manifest.positive_bucket_count
    ));
    body.push_str(&format!("- Model: {}\n", manifest.model_id));
    body.push_str(&format!(
        "- Override used: {}\n\n",
        if manifest.force_override { "yes" } else { "no" }
    ));

    body.push_str("## Preflight\n\n");
    body.push_str(&format!("- Verdict: {:?}\n", preflight.verdict));
    body.push_str(&format!(
        "- Reasoning summary: {}\n",
        preflight.reasoning_summary
    ));
    if let Some(min) = preflight.recommended_bucket_min {
        body.push_str(&format!("- Recommended bucket minimum: {}\n", min));
    }
    if let Some(max) = preflight.recommended_bucket_max {
        body.push_str(&format!("- Recommended bucket maximum: {}\n", max));
    }
    body.push('\n');

    body.push_str("## Bucket Shape\n\n");
    body.push_str(&format!(
        "- Intent interpretation: {}\n",
        plan.explanation.sorting_intent_interpretation
    ));
    body.push_str(&format!(
        "- Shape rationale: {}\n",
        plan.explanation.bucket_shape_rationale
    ));
    body.push_str(&format!(
        "- Bucket count judgment: {}\n\n",
        plan.explanation.bucket_count_judgment
    ));

    body.push_str("## Buckets\n\n");
    for bucket in &plan.buckets {
        body.push_str(&format!(
            "- {} ({}) : {}\n",
            bucket.name, bucket.bucket_id, bucket.description
        ));
    }
    body.push_str(&format!(
        "- {} ({}) : {}\n\n",
        plan.junk_bucket.name, plan.junk_bucket.bucket_id, plan.junk_bucket.description
    ));

    if let Some(summary) = assignment_summary {
        body.push_str("## Assignment Outcome\n\n");
        body.push_str(&format!("- Total items: {}\n", summary.total_items));
        body.push_str(&format!("- Junk count: {}\n", summary.junk_count));
        body.push_str(&format!(
            "- Review flag count: {}\n\n",
            summary.review_flag_count
        ));
    }

    body.push_str("## Artifacts\n\n");
    body.push_str(&format!("- Run manifest: {}\n", "run_manifest.json"));
    body.push_str(&format!(
        "- Run config: {}\n",
        manifest.artifacts.run_config
    ));
    body.push_str(&format!("- Preflight: {}\n", manifest.artifacts.preflight));
    body.push_str(&format!(
        "- Bucket plan: {}\n",
        manifest.artifacts.bucket_plan
    ));
    if let Some(path) = &manifest.artifacts.dataset_projection {
        body.push_str(&format!("- Dataset projection: {}\n", path));
    }
    if let Some(path) = &manifest.artifacts.assignment_summary {
        body.push_str(&format!("- Assignment summary: {}\n", path));
    }
    if let Some(path) = &manifest.artifacts.assignments_jsonl {
        body.push_str(&format!("- Assignments: {}\n", path));
    }
    if let Some(path) = &manifest.artifacts.bucket_exports_dir {
        body.push_str(&format!("- Bucket exports: {}\n", path));
        body.push_str(
            "- Bucket export lane: assignment-enriched JSONL/CSV with normalized content and raw structured payload when available.\n",
        );
    }
    if matches!(manifest.dataset.dataset_format, DatasetFormat::Parquet) {
        body.push_str("\n## Parquet Export Notes\n\n");
        body.push_str(
            "- Each bucket folder includes `items.parquet`, `items.jsonl`, and `items.csv`.\n",
        );
        body.push_str(
            "- `items.parquet` preserves assignment metadata plus flattened source-row fields as `raw__*` columns.\n",
        );
        body.push_str(
            "- `content` is the exact model-facing projected text used during sorting, while `raw_record_json` mirrors the structured row payload.\n",
        );
        body.push_str(
            "- Empty buckets still receive export files so downstream workflows can tell \"zero assigned\" apart from \"missing export\".\n",
        );
    }
    body
}

fn iter_bucket_export_targets<'a>(
    _output_dir: &Path,
    plan: &'a BucketPlan,
) -> Vec<(String, String, &'a str)> {
    let mut targets = plan
        .buckets
        .iter()
        .map(|bucket| {
            (
                bucket.bucket_id.clone(),
                format!(
                    "{}-{}",
                    bucket.bucket_id.to_ascii_lowercase(),
                    sanitize_name(&bucket.name)
                ),
                bucket.name.as_str(),
            )
        })
        .collect::<Vec<_>>();
    targets.push((
        plan.junk_bucket.bucket_id.clone(),
        sanitize_name(&plan.junk_bucket.name),
        plan.junk_bucket.name.as_str(),
    ));
    targets
}

fn csv_escape(value: &str) -> String {
    let escaped = value.replace('"', "\"\"");
    format!("\"{}\"", escaped)
}

fn format_sort_intent(sort_intent: &SortIntent) -> String {
    match sort_intent {
        SortIntent::Preset(preset) => format!("{preset:?}"),
        SortIntent::Custom(value) => value.clone(),
    }
}

fn format_bucket_genesis_mode(mode: &sorter_core::BucketGenesisMode) -> &'static str {
    match mode {
        sorter_core::BucketGenesisMode::DataSkim => "data_skim",
        sorter_core::BucketGenesisMode::BlindLabel => "blind_label",
    }
}

fn relative_artifact_path(_run_dir: &Path, name: &str) -> String {
    name.to_string()
}

fn migrate_path(
    source: &Path,
    destination: &Path,
    report: &mut OutputLayoutMigrationReport,
) -> Result<()> {
    if !source.exists() {
        return Ok(());
    }
    if destination.exists() {
        report.skipped_paths.push(format!(
            "{} -> {}",
            path_string(source),
            path_string(destination)
        ));
        return Ok(());
    }

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }

    fs::rename(source, destination).with_context(|| {
        format!(
            "failed to move {} to {}",
            source.display(),
            destination.display()
        )
    })?;
    report.moved_paths.push(format!(
        "{} -> {}",
        path_string(source),
        path_string(destination)
    ));
    Ok(())
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn is_dir_empty(path: &Path) -> Result<bool> {
    let mut entries =
        fs::read_dir(path).with_context(|| format!("failed to read {}", path.display()))?;
    Ok(entries.next().is_none())
}

fn collect_runs_from_root(root: &Path, runs: &mut Vec<RunHistoryEntry>) -> Result<()> {
    if !root.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(root).with_context(|| format!("failed to read {}", root.display()))? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }

        let run_dir = entry.path();
        let run_config_path = run_dir.join("run_config.json");
        if !run_config_path.exists() {
            continue;
        }

        let run_config: RunConfig = read_json(&run_config_path)?;
        let assignment_summary_path = run_dir.join("assignment_summary.json");
        let assignment_summary: Option<AssignmentSummary> = if assignment_summary_path.exists() {
            Some(read_json(&assignment_summary_path)?)
        } else {
            None
        };

        let output_dir_name = entry.file_name().to_string_lossy().to_string();
        let dataset_display_name = infer_dataset_name_from_dir(&output_dir_name);
        runs.push(RunHistoryEntry {
            run_id: run_config.run_id,
            output_dir_name,
            experiment_id: run_config.experiment_id.clone(),
            dataset_display_name,
            sort_intent: run_config.sort_intent.clone(),
            bucket_genesis_mode: run_config.bucket_genesis_mode.clone(),
            requested_positive_bucket_count: run_config.requested_positive_bucket_count,
            force_override: run_config.force_override,
            junk_count: assignment_summary.as_ref().map(|value| value.junk_count),
            review_flag_count: assignment_summary
                .as_ref()
                .map(|value| value.review_flag_count),
            total_items: assignment_summary.as_ref().map(|value| value.total_items),
            created_at: run_config.created_at,
        });
    }

    Ok(())
}

fn collect_legacy_root_runs(outputs_root: &Path, runs: &mut Vec<RunHistoryEntry>) -> Result<()> {
    for entry in fs::read_dir(outputs_root)
        .with_context(|| format!("failed to read {}", outputs_root.display()))?
    {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        if entry.file_name().to_string_lossy() == "runs" {
            continue;
        }

        let run_config_path = entry.path().join("run_config.json");
        if !run_config_path.exists() {
            continue;
        }

        let output_dir_name = entry.file_name().to_string_lossy().to_string();
        let already_collected = runs
            .iter()
            .any(|existing| existing.output_dir_name == output_dir_name);
        if already_collected {
            continue;
        }

        let run_dir = entry.path();
        let run_config: RunConfig = read_json(&run_config_path)?;
        let assignment_summary_path = run_dir.join("assignment_summary.json");
        let assignment_summary: Option<AssignmentSummary> = if assignment_summary_path.exists() {
            Some(read_json(&assignment_summary_path)?)
        } else {
            None
        };

        let dataset_display_name = infer_dataset_name_from_dir(&output_dir_name);
        runs.push(RunHistoryEntry {
            run_id: run_config.run_id,
            output_dir_name,
            experiment_id: run_config.experiment_id.clone(),
            dataset_display_name,
            sort_intent: run_config.sort_intent.clone(),
            bucket_genesis_mode: run_config.bucket_genesis_mode.clone(),
            requested_positive_bucket_count: run_config.requested_positive_bucket_count,
            force_override: run_config.force_override,
            junk_count: assignment_summary.as_ref().map(|value| value.junk_count),
            review_flag_count: assignment_summary
                .as_ref()
                .map(|value| value.review_flag_count),
            total_items: assignment_summary.as_ref().map(|value| value.total_items),
            created_at: run_config.created_at,
        });
    }

    Ok(())
}

fn resolve_run_dir(outputs_root: &Path, output_dir_name: &str) -> Result<PathBuf> {
    let primary = runs_dir(outputs_root).join(output_dir_name);
    if primary.join("run_config.json").exists() {
        return Ok(primary);
    }

    let legacy = outputs_root.join(output_dir_name);
    if legacy.join("run_config.json").exists() {
        return Ok(legacy);
    }

    Err(anyhow::anyhow!("run '{}' not found", output_dir_name))
}

fn validate_single_path_component(value: &str, kind: &str) -> Result<()> {
    let path = Path::new(value);
    if path.components().count() != 1 || path.file_name() != Some(OsStr::new(value)) {
        anyhow::bail!("invalid {} '{}'", kind, value);
    }
    Ok(())
}

fn parse_bucket_id(bucket_dir_name: &str) -> Option<String> {
    let prefix = bucket_dir_name.split('-').next()?;
    if prefix.starts_with('b') && prefix[1..].chars().all(|ch| ch.is_ascii_digit()) {
        return Some(prefix.to_ascii_uppercase());
    }
    if bucket_dir_name.eq_ignore_ascii_case("junk") {
        return Some("JUNK".to_string());
    }
    None
}

fn humanize_bucket_export_dir_name(bucket_dir_name: &str) -> String {
    bucket_dir_name
        .split('-')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_text_previewable_export_file_name(file_name: &str) -> bool {
    Path::new(file_name)
        .extension()
        .and_then(OsStr::to_str)
        .map(|ext| matches!(ext, "jsonl" | "json" | "csv" | "txt" | "md"))
        .unwrap_or(false)
}

fn sanitize_name(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            result.push(ch.to_ascii_lowercase());
        } else {
            result.push('-');
        }
    }
    result.trim_matches('-').to_string()
}

fn extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(OsStr::to_str)
        .map(|value| value.to_ascii_lowercase())
}

fn file_name_string(path: &Path) -> String {
    path.file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("item")
        .to_string()
}

fn is_supported_top_level_file(path: &Path) -> bool {
    matches!(
        extension(path).as_deref(),
        Some("jsonl" | "json" | "txt" | "md" | "parquet")
    )
}

fn is_supported_document_file(path: &Path) -> bool {
    matches!(
        extension(path).as_deref(),
        Some(
            "txt"
                | "md"
                | "rs"
                | "py"
                | "js"
                | "ts"
                | "tsx"
                | "jsx"
                | "json"
                | "jsonl"
                | "toml"
                | "yaml"
                | "yml"
                | "html"
                | "css"
                | "sql"
        )
    )
}
