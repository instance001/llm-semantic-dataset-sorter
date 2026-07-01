use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppPaths {
    pub runtime_dir: String,
    pub model_path: String,
    pub runs_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunConfig {
    pub run_id: Uuid,
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub experiment_id: Option<String>,
    pub sort_intent: SortIntent,
    #[serde(default)]
    pub bucket_genesis_mode: BucketGenesisMode,
    pub requested_positive_bucket_count: u16,
    pub custom_instructions: Option<String>,
    pub force_override: bool,
    #[serde(default)]
    pub dataset_projection: Option<DatasetProjectionConfig>,
    pub paths: AppPaths,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BucketGenesisMode {
    DataSkim,
    BlindLabel,
}

impl Default for BucketGenesisMode {
    fn default() -> Self {
        Self::DataSkim
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value")]
pub enum SortIntent {
    Preset(SortPreset),
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SortPreset {
    General,
    Code,
    LinearReasoning,
    AbstractReasoning,
    Topic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatasetFormat {
    TextFile,
    Jsonl,
    Json,
    Directory,
    Parquet,
    Unknown,
}

impl Default for DatasetFormat {
    fn default() -> Self {
        Self::Unknown
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatasetProjectionRenderMode {
    PlainText,
    FieldLabeledText,
}

impl Default for DatasetProjectionRenderMode {
    fn default() -> Self {
        Self::PlainText
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetProjectionField {
    pub field_name: String,
    #[serde(default)]
    pub display_label: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DatasetProjectionConfig {
    #[serde(default)]
    pub selected_fields: Vec<DatasetProjectionField>,
    #[serde(default)]
    pub item_id_field: Option<String>,
    #[serde(default)]
    pub render_mode: DatasetProjectionRenderMode,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DatasetColumnSummary {
    pub name: String,
    #[serde(default)]
    pub logical_type: Option<String>,
    #[serde(default)]
    pub nullable: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetItem {
    pub item_id: String,
    pub content: String,
    #[serde(default)]
    pub raw_record: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DatasetManifest {
    pub item_count: usize,
    pub sample_size: usize,
    #[serde(default)]
    pub dataset_format: DatasetFormat,
    #[serde(default)]
    pub schema_columns: Vec<DatasetColumnSummary>,
    #[serde(default)]
    pub projection: Option<DatasetProjectionConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatasetSourceKind {
    File,
    Directory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetSourceSummary {
    pub dataset_id: String,
    pub display_name: String,
    pub source_kind: DatasetSourceKind,
    #[serde(default)]
    pub dataset_format: DatasetFormat,
    pub relative_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatasetPreview {
    pub source: DatasetSourceSummary,
    pub manifest: DatasetManifest,
    pub sample: Vec<DatasetItem>,
    #[serde(default)]
    pub raw_sample_rows: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PreflightVerdictCode {
    TooLow,
    Acceptable,
    TooHigh,
    UnclearIntent,
    WeakSignal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreflightReport {
    pub requested_positive_bucket_count: u16,
    pub verdict: PreflightVerdictCode,
    pub reasoning_summary: String,
    pub recommended_bucket_min: Option<u16>,
    pub recommended_bucket_max: Option<u16>,
    pub dataset_observations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketDefinition {
    pub bucket_id: String,
    pub name: String,
    pub description: String,
    pub criteria: Vec<String>,
    pub anchor_examples: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JunkBucketDefinition {
    pub bucket_id: String,
    pub name: String,
    pub description: String,
    pub junk_reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketPlanExplanation {
    #[serde(default)]
    pub bucket_genesis_mode: BucketGenesisMode,
    pub sorting_intent_interpretation: String,
    pub bucket_shape_rationale: String,
    pub bucket_meanings: Vec<String>,
    pub signals_noticed: Vec<String>,
    pub weak_or_junk_signals: Vec<String>,
    pub bucket_count_judgment: String,
    pub surprising_groupings: Vec<String>,
    pub zoom_in_suggestions: Vec<String>,
    pub caution_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketPlan {
    pub run_id: Uuid,
    pub model_id: String,
    pub positive_bucket_count: u16,
    pub sort_intent: SortIntent,
    pub buckets: Vec<BucketDefinition>,
    pub junk_bucket: JunkBucketDefinition,
    pub explanation: BucketPlanExplanation,
    pub generation_notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignmentRecord {
    pub item_id: String,
    pub assigned_bucket_id: String,
    pub confidence: f32,
    pub rationale: String,
    pub review_flag: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssignmentSummary {
    pub total_items: usize,
    pub bucket_counts: Vec<BucketCount>,
    pub junk_count: usize,
    pub review_flag_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunManifestKind {
    PlanOnly,
    FullSort,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunManifestArtifacts {
    pub run_config: String,
    pub preflight: String,
    pub bucket_plan: String,
    #[serde(default)]
    pub dataset_projection: Option<String>,
    pub assignment_summary: Option<String>,
    pub assignments_jsonl: Option<String>,
    #[serde(default)]
    pub bucket_exports_dir: Option<String>,
    pub human_summary_markdown: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunManifest {
    pub run_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub kind: RunManifestKind,
    pub dataset: DatasetSourceSummary,
    pub experiment_id: Option<String>,
    pub sort_intent: SortIntent,
    pub bucket_genesis_mode: BucketGenesisMode,
    pub requested_positive_bucket_count: u16,
    pub positive_bucket_count: u16,
    pub force_override: bool,
    pub model_id: String,
    pub total_items: Option<usize>,
    pub junk_count: Option<usize>,
    pub review_flag_count: Option<usize>,
    pub artifacts: RunManifestArtifacts,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketCount {
    pub bucket_id: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    pub runtime_dir: String,
    pub model_path: String,
    pub input_datasets_dir: String,
    pub outputs_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunHistoryEntry {
    pub run_id: Uuid,
    pub output_dir_name: String,
    #[serde(default)]
    pub experiment_id: Option<String>,
    pub dataset_display_name: String,
    pub sort_intent: SortIntent,
    pub bucket_genesis_mode: BucketGenesisMode,
    pub requested_positive_bucket_count: u16,
    pub force_override: bool,
    pub junk_count: Option<usize>,
    pub review_flag_count: Option<usize>,
    pub total_items: Option<usize>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunDetail {
    pub history: RunHistoryEntry,
    pub run_config: RunConfig,
    pub preflight: PreflightReport,
    pub bucket_plan: BucketPlan,
    pub assignment_summary: Option<AssignmentSummary>,
    pub assignments: Vec<AssignmentRecord>,
    #[serde(default)]
    pub run_manifest: Option<RunManifest>,
    #[serde(default)]
    pub run_summary_markdown: Option<String>,
}
