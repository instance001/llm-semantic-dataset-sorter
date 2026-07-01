use anyhow::{Context, Result, bail};
use serde_json::Value;
use sorter_core::{
    AssignmentRecord, BucketDefinition, BucketGenesisMode, BucketPlan, BucketPlanExplanation,
    DatasetItem, DatasetManifest, JunkBucketDefinition, PreflightReport, PreflightVerdictCode,
    RunConfig, SortIntent, SortPreset,
};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use tokio::process::Command;

#[derive(Debug, Clone)]
pub struct LlamaCliAdapter {
    runtime_dir: PathBuf,
    model_path: PathBuf,
    executable: PathBuf,
    settings: LlamaCliSettings,
}

#[derive(Debug, Clone, Default)]
pub struct MockLlmAdapter;

#[derive(Debug, Clone)]
struct LlamaCliSettings {
    n_gpu_layers: String,
    ctx_size: String,
    temperature: String,
    preflight_predict_tokens: String,
    plan_predict_tokens: String,
    assignment_predict_tokens: String,
    assignment_batch_size: usize,
}

impl MockLlmAdapter {
    pub async fn run_preflight(
        &self,
        config: &RunConfig,
        manifest: &DatasetManifest,
        _sample: &[DatasetItem],
    ) -> Result<PreflightReport> {
        let verdict = match config.requested_positive_bucket_count {
            0..=2 => PreflightVerdictCode::TooLow,
            3..=6 => PreflightVerdictCode::Acceptable,
            _ => PreflightVerdictCode::TooHigh,
        };

        Ok(PreflightReport {
            requested_positive_bucket_count: config.requested_positive_bucket_count,
            verdict,
            reasoning_summary: format!(
                "Mock preflight judged {} items against the requested semantic budget.",
                manifest.item_count
            ),
            recommended_bucket_min: Some(3),
            recommended_bucket_max: Some(6),
            dataset_observations: vec![
                "Dataset appears mixed but text-oriented.".to_string(),
                "A tighter positive bucket budget is easier to validate early.".to_string(),
            ],
        })
    }

    pub async fn generate_bucket_plan(
        &self,
        config: &RunConfig,
        _manifest: &DatasetManifest,
        sample: &[DatasetItem],
    ) -> Result<BucketPlan> {
        let definitions = mock_bucket_templates(&config.sort_intent, &config.bucket_genesis_mode);
        let count = usize::from(config.requested_positive_bucket_count);
        let mut buckets = Vec::with_capacity(count);

        for index in 0..count {
            let template = &definitions[index % definitions.len()];
            let anchor_examples = match config.bucket_genesis_mode {
                BucketGenesisMode::BlindLabel => template.2.clone(),
                BucketGenesisMode::DataSkim => sample
                    .get(index % sample.len().max(1))
                    .map(|item| vec![item.content.clone()])
                    .unwrap_or_else(|| template.2.clone()),
            };
            buckets.push(BucketDefinition {
                bucket_id: format!("B{}", index + 1),
                name: template.0.to_string(),
                description: template.1.to_string(),
                criteria: template.2.clone(),
                anchor_examples,
            });
        }

        let explanation = build_mock_explanation(config, sample, &buckets);

        Ok(BucketPlan {
            run_id: config.run_id,
            model_id: "mock-llm".to_string(),
            positive_bucket_count: config.requested_positive_bucket_count,
            sort_intent: config.sort_intent.clone(),
            buckets,
            junk_bucket: JunkBucketDefinition {
                bucket_id: "JUNK".to_string(),
                name: "junk".to_string(),
                description:
                    "Overflow bucket for weak fit, ambiguous items, mixed records, and does-not-fit material."
                        .to_string(),
                junk_reasons: vec![
                    "does_not_fit".to_string(),
                    "ambiguous".to_string(),
                    "weak_signal".to_string(),
                    "mixed_content".to_string(),
                ],
            },
            explanation,
            generation_notes: vec![
                "Mock plan generated for pipeline and filesystem testing.".to_string(),
                "Bucket labels are intent-shaped placeholders, not model-authored semantics."
                    .to_string(),
            ],
        })
    }

    pub async fn assign_items(
        &self,
        _config: &RunConfig,
        plan: &BucketPlan,
        items: &[DatasetItem],
    ) -> Result<Vec<AssignmentRecord>> {
        let mut records = Vec::with_capacity(items.len());

        for item in items {
            let lower = item.content.to_ascii_lowercase();
            let assigned_bucket_id = if looks_like_junk(&lower) {
                plan.junk_bucket.bucket_id.clone()
            } else {
                choose_mock_bucket(plan, &lower)
            };

            let review_flag = assigned_bucket_id == plan.junk_bucket.bucket_id
                || item.content.len() < 50
                || contains_ambiguous_language(&lower);

            let rationale = if assigned_bucket_id == plan.junk_bucket.bucket_id {
                "Mock assignment routed this item to junk because the signal looked weak, mixed, or outside the strongest bucket criteria.".to_string()
            } else {
                format!(
                    "Mock assignment routed this item into {} based on simple intent-shaped keyword overlap.",
                    assigned_bucket_id
                )
            };

            let confidence = if assigned_bucket_id == plan.junk_bucket.bucket_id {
                0.42
            } else if review_flag {
                0.62
            } else {
                0.81
            };

            records.push(AssignmentRecord {
                item_id: item.item_id.clone(),
                assigned_bucket_id,
                confidence,
                rationale,
                review_flag,
            });
        }

        Ok(records)
    }
}

impl LlamaCliAdapter {
    pub fn new(runtime_dir: impl AsRef<Path>, model_path: impl AsRef<Path>) -> Result<Self> {
        let runtime_dir = fs::canonicalize(runtime_dir.as_ref()).with_context(|| {
            format!(
                "failed to resolve runtime dir {}",
                runtime_dir.as_ref().display()
            )
        })?;
        let model_path = fs::canonicalize(model_path.as_ref()).with_context(|| {
            format!(
                "failed to resolve model path {}",
                model_path.as_ref().display()
            )
        })?;
        let executable = runtime_dir.join("llama-cli.exe");

        if !executable.exists() {
            bail!("missing llama-cli.exe at {}", executable.display());
        }
        if !model_path.exists() {
            bail!("missing model file at {}", model_path.display());
        }

        Ok(Self {
            runtime_dir,
            model_path,
            executable,
            settings: LlamaCliSettings::from_env(),
        })
    }

    pub fn runtime_dir(&self) -> &Path {
        &self.runtime_dir
    }

    pub fn model_path(&self) -> &Path {
        &self.model_path
    }

    pub async fn run_preflight(
        &self,
        config: &RunConfig,
        manifest: &DatasetManifest,
        sample: &[DatasetItem],
    ) -> Result<PreflightReport> {
        let prompt = build_preflight_prompt(config, manifest, sample);
        let mut raw = self
            .run_json_prompt(&prompt, &self.settings.preflight_predict_tokens)
            .await?;
        normalize_preflight_value(&mut raw, config);
        serde_json::from_value(raw).context("failed to parse preflight response")
    }

    pub async fn generate_bucket_plan(
        &self,
        config: &RunConfig,
        manifest: &DatasetManifest,
        sample: &[DatasetItem],
    ) -> Result<BucketPlan> {
        let prompt = build_bucket_plan_prompt(config, manifest, sample);
        let mut raw = self
            .run_json_prompt(&prompt, &self.settings.plan_predict_tokens)
            .await?;
        normalize_bucket_plan_value(&mut raw, config);
        parse_bucket_plan_value(config, raw)
    }

    pub async fn assign_items(
        &self,
        config: &RunConfig,
        plan: &BucketPlan,
        items: &[DatasetItem],
    ) -> Result<Vec<AssignmentRecord>> {
        let batch_size = self.settings.assignment_batch_size.max(1);
        let mut assignments = Vec::with_capacity(items.len());

        for chunk in items.chunks(batch_size) {
            let prompt = build_assignment_prompt(config, plan, chunk);
            let raw = self
                .run_json_prompt(&prompt, &self.settings.assignment_predict_tokens)
                .await?;
            match parse_assignment_batch_value(raw)
                .and_then(|batch| validate_assignment_batch(plan, chunk, batch))
            {
                Ok(validated) => assignments.extend(validated),
                Err(_) if chunk.len() > 1 => {
                    for item in chunk {
                        let single_prompt =
                            build_assignment_prompt(config, plan, std::slice::from_ref(item));
                        let single_raw = self
                            .run_json_prompt(
                                &single_prompt,
                                &self.settings.assignment_predict_tokens,
                            )
                            .await?;
                        let single_batch = parse_assignment_batch_value(single_raw)?;
                        let validated = validate_assignment_batch(
                            plan,
                            std::slice::from_ref(item),
                            single_batch,
                        )?;
                        assignments.extend(validated);
                    }
                }
                Err(error) => return Err(error),
            }
        }

        Ok(assignments)
    }

    async fn run_json_prompt(&self, prompt: &str, predict_tokens: &str) -> Result<Value> {
        let output = Command::new(&self.executable)
            .current_dir(&self.runtime_dir)
            .arg("-m")
            .arg(&self.model_path)
            .arg("-ngl")
            .arg(&self.settings.n_gpu_layers)
            .arg("--ctx-size")
            .arg(&self.settings.ctx_size)
            .arg("--temp")
            .arg(&self.settings.temperature)
            .arg("--predict")
            .arg(predict_tokens)
            .arg("-cnv")
            .arg("-st")
            .arg("-sys")
            .arg("You are a JSON-only assistant. Return exactly one valid JSON object and no surrounding prose.")
            .arg("-p")
            .arg(prompt)
            .output()
            .await
            .context("failed to launch llama-cli")?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            bail!("llama-cli failed: {}", stderr.trim());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        extract_json_object(&stdout).with_context(|| {
            let tail = stdout
                .chars()
                .rev()
                .take(2500)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<String>();
            format!(
                "failed to parse JSON object from model output tail:\n{}",
                tail
            )
        })
    }
}

impl LlamaCliSettings {
    fn from_env() -> Self {
        Self {
            n_gpu_layers: env::var("SORTER_LLM_N_GPU_LAYERS").unwrap_or_else(|_| "999".to_string()),
            ctx_size: env::var("SORTER_LLM_CTX_SIZE").unwrap_or_else(|_| "8192".to_string()),
            temperature: env::var("SORTER_LLM_TEMPERATURE").unwrap_or_else(|_| "0.2".to_string()),
            preflight_predict_tokens: env::var("SORTER_LLM_PREFLIGHT_PREDICT_TOKENS")
                .or_else(|_| env::var("SORTER_LLM_PREDICT_TOKENS"))
                .unwrap_or_else(|_| "384".to_string()),
            plan_predict_tokens: env::var("SORTER_LLM_PLAN_PREDICT_TOKENS")
                .or_else(|_| env::var("SORTER_LLM_PREDICT_TOKENS"))
                .unwrap_or_else(|_| "1400".to_string()),
            assignment_predict_tokens: env::var("SORTER_LLM_ASSIGNMENT_PREDICT_TOKENS")
                .or_else(|_| env::var("SORTER_LLM_PREDICT_TOKENS"))
                .unwrap_or_else(|_| "320".to_string()),
            assignment_batch_size: env::var("SORTER_LLM_ASSIGNMENT_BATCH_SIZE")
                .ok()
                .and_then(|value| value.parse::<usize>().ok())
                .filter(|value| *value > 0)
                .unwrap_or(12),
        }
    }
}

fn build_intent_label(intent: &SortIntent) -> String {
    match intent {
        SortIntent::Preset(preset) => serde_json::to_string(preset)
            .unwrap_or_else(|_| "\"general\"".to_string())
            .trim_matches('"')
            .to_string(),
        SortIntent::Custom(value) => value.clone(),
    }
}

fn build_preflight_prompt(
    config: &RunConfig,
    manifest: &DatasetManifest,
    sample: &[DatasetItem],
) -> String {
    let sample_json = serde_json::to_string_pretty(sample).unwrap_or_else(|_| "[]".to_string());
    format!(
        "You are evaluating a semantic dataset sorting run.\n\
Return JSON only.\n\
Decide whether the requested positive bucket count is too low, acceptable, too high, unclear_intent, or weak_signal.\n\
Be honest. The user may override you later, but you must report your actual semantic judgment.\n\n\
Return this exact JSON shape:\n\
{{\n\
  \"requested_positive_bucket_count\": 0,\n\
  \"verdict\": \"too_low\",\n\
  \"reasoning_summary\": \"string\",\n\
  \"recommended_bucket_min\": 0,\n\
  \"recommended_bucket_max\": 0,\n\
  \"dataset_observations\": [\"string\"]\n\
}}\n\n\
Sort intent: {intent}\n\
Requested positive bucket count: {count}\n\
Dataset item count: {item_count}\n\
Dataset sample size: {sample_size}\n\
Dataset sample:\n{sample}",
        intent = build_intent_label(&config.sort_intent),
        count = config.requested_positive_bucket_count,
        item_count = manifest.item_count,
        sample_size = manifest.sample_size,
        sample = sample_json,
    )
}

fn build_bucket_plan_prompt(
    config: &RunConfig,
    manifest: &DatasetManifest,
    sample: &[DatasetItem],
) -> String {
    let sample_json = serde_json::to_string_pretty(sample).unwrap_or_else(|_| "[]".to_string());
    let genesis_mode = match config.bucket_genesis_mode {
        BucketGenesisMode::DataSkim => "data_skim",
        BucketGenesisMode::BlindLabel => "blind_label",
    };
    let dataset_visibility_rules = match config.bucket_genesis_mode {
        BucketGenesisMode::DataSkim => format!(
            "Bucket genesis mode: data_skim.\n\
You may inspect the dataset sample before naming and shaping the buckets.\n\
Dataset sample:\n{}",
            sample_json
        ),
        BucketGenesisMode::BlindLabel => "Bucket genesis mode: blind_label.\n\
You must define the bucket labels and semantic criteria from the requested sort intent and bucket budget alone.\n\
Do not use dataset sample contents when naming or shaping buckets.\n\
You may still assume the downstream runtime will later force assignments into the frozen buckets plus junk."
            .to_string(),
    };
    format!(
        "You are generating a semantic bucket plan for a dataset sorting run.\n\
Return JSON only.\n\
You must return exactly {count} positive buckets plus one mandatory junk bucket.\n\
Do not change the positive bucket count.\n\
Use the junk bucket for overflow, ambiguity, weak fit, and does-not-fit cases.\n\n\
Return this exact JSON shape:\n\
{{\n\
  \"run_id\": \"{run_id}\",\n\
  \"model_id\": \"string\",\n\
  \"positive_bucket_count\": {count},\n\
  \"sort_intent\": {intent_json},\n\
  \"buckets\": [\n\
    {{\n\
      \"bucket_id\": \"B1\",\n\
      \"name\": \"string\",\n\
      \"description\": \"string\",\n\
      \"criteria\": [\"string\"],\n\
      \"anchor_examples\": [\"string\"]\n\
    }}\n\
  ],\n\
  \"junk_bucket\": {{\n\
    \"bucket_id\": \"JUNK\",\n\
    \"name\": \"junk\",\n\
    \"description\": \"string\",\n\
      \"junk_reasons\": [\"string\"]\n\
  }},\n\
  \"explanation\": {{\n\
    \"sorting_intent_interpretation\": \"string\",\n\
    \"bucket_shape_rationale\": \"string\",\n\
    \"bucket_meanings\": [\"string\"],\n\
    \"signals_noticed\": [\"string\"],\n\
    \"weak_or_junk_signals\": [\"string\"],\n\
    \"bucket_count_judgment\": \"string\",\n\
    \"surprising_groupings\": [\"string\"],\n\
    \"zoom_in_suggestions\": [\"string\"],\n\
    \"caution_notes\": [\"string\"]\n\
  }},\n\
  \"generation_notes\": [\"string\"]\n\
}}\n\n\
Sort intent: {intent_label}\n\
Bucket genesis mode: {genesis_mode}\n\
Requested positive bucket count: {count}\n\
Dataset item count: {item_count}\n\
Dataset sample size: {sample_size}\n\
{dataset_visibility_rules}",
        run_id = config.run_id,
        count = config.requested_positive_bucket_count,
        intent_json = serde_json::to_string(&config.sort_intent)
            .unwrap_or_else(|_| "{\"kind\":\"Preset\",\"value\":\"general\"}".to_string()),
        intent_label = build_intent_label(&config.sort_intent),
        genesis_mode = genesis_mode,
        item_count = manifest.item_count,
        sample_size = manifest.sample_size,
        dataset_visibility_rules = dataset_visibility_rules,
    )
}

fn build_assignment_prompt(config: &RunConfig, plan: &BucketPlan, items: &[DatasetItem]) -> String {
    let allowed_buckets = plan
        .buckets
        .iter()
        .map(|bucket| format!("{} = {}", bucket.bucket_id, bucket.name))
        .chain(std::iter::once(format!(
            "{} = {}",
            plan.junk_bucket.bucket_id, plan.junk_bucket.name
        )))
        .collect::<Vec<_>>()
        .join("; ");
    let plan_json = serde_json::to_string_pretty(plan).unwrap_or_else(|_| "{}".to_string());
    let items_json = serde_json::to_string_pretty(items).unwrap_or_else(|_| "[]".to_string());
    let custom_instructions = config.custom_instructions.as_deref().unwrap_or("none");

    format!(
        "You are assigning dataset items into a frozen semantic bucket plan.\n\
Return JSON only.\n\
You must not rename, add, remove, or reinterpret bucket ids.\n\
Every item must be assigned to exactly one existing bucket id from this allowed set: {allowed_buckets}.\n\
Use {junk_bucket_id} when the item is weak fit, mixed, ambiguous, or genuinely outside the frozen positive buckets.\n\
Set review_flag to true when the fit is weak, close, mixed, or low-confidence.\n\
Keep rationale brief and concrete.\n\n\
Return this exact JSON shape:\n\
{{\n\
  \"assignments\": [\n\
    {{\n\
      \"item_id\": \"string\",\n\
      \"assigned_bucket_id\": \"B1\",\n\
      \"confidence\": 0.0,\n\
      \"rationale\": \"string\",\n\
      \"review_flag\": false\n\
    }}\n\
  ]\n\
}}\n\n\
The assignments array must contain exactly {item_count} records, one for each item_id provided, with no duplicates and no omissions.\n\
Sort intent: {intent_label}\n\
Bucket genesis mode: {genesis_mode}\n\
User custom instructions: {custom_instructions}\n\
Frozen bucket plan:\n{plan_json}\n\n\
Items to assign:\n{items_json}",
        allowed_buckets = allowed_buckets,
        junk_bucket_id = plan.junk_bucket.bucket_id,
        item_count = items.len(),
        intent_label = build_intent_label(&config.sort_intent),
        genesis_mode = match config.bucket_genesis_mode {
            BucketGenesisMode::DataSkim => "data_skim",
            BucketGenesisMode::BlindLabel => "blind_label",
        },
        custom_instructions = custom_instructions,
        plan_json = plan_json,
        items_json = items_json,
    )
}

fn normalize_preflight_value(raw: &mut Value, config: &RunConfig) {
    let Some(object) = raw.as_object_mut() else {
        return;
    };

    object.insert(
        "requested_positive_bucket_count".to_string(),
        Value::from(config.requested_positive_bucket_count),
    );
}

fn normalize_bucket_plan_value(raw: &mut Value, config: &RunConfig) {
    let Some(object) = raw.as_object_mut() else {
        return;
    };

    object.insert(
        "run_id".to_string(),
        Value::String(config.run_id.to_string()),
    );
    object.insert(
        "positive_bucket_count".to_string(),
        Value::from(config.requested_positive_bucket_count),
    );
    object.insert(
        "sort_intent".to_string(),
        serde_json::to_value(&config.sort_intent).unwrap_or(Value::Null),
    );

    let explanation = object
        .entry("explanation".to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    if let Some(explanation_object) = explanation.as_object_mut() {
        explanation_object.insert(
            "bucket_genesis_mode".to_string(),
            serde_json::to_value(&config.bucket_genesis_mode).unwrap_or(Value::Null),
        );
    }
}

fn parse_bucket_plan_value(config: &RunConfig, raw: Value) -> Result<BucketPlan> {
    let object = raw
        .as_object()
        .context("bucket plan payload was not a JSON object")?;

    let mut buckets = object
        .get("buckets")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .enumerate()
                .map(|(index, entry)| BucketDefinition {
                    bucket_id: get_string(entry, "bucket_id")
                        .unwrap_or_else(|| format!("B{}", index + 1)),
                    name: get_string(entry, "name")
                        .unwrap_or_else(|| format!("Bucket {}", index + 1)),
                    description: get_string(entry, "description")
                        .unwrap_or_else(|| "No description provided.".to_string()),
                    criteria: get_string_array(entry, "criteria"),
                    anchor_examples: get_string_array(entry, "anchor_examples"),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    coerce_bucket_count(&mut buckets, config);

    let junk_bucket_value = object.get("junk_bucket");
    let junk_bucket = JunkBucketDefinition {
        bucket_id: junk_bucket_value
            .and_then(|value| get_string(value, "bucket_id"))
            .unwrap_or_else(|| "JUNK".to_string()),
        name: junk_bucket_value
            .and_then(|value| get_string(value, "name"))
            .unwrap_or_else(|| "junk".to_string()),
        description: junk_bucket_value
            .and_then(|value| get_string(value, "description"))
            .unwrap_or_else(|| {
                "Overflow bucket for weak fit, mixed items, ambiguity, and does-not-fit material."
                    .to_string()
            }),
        junk_reasons: junk_bucket_value
            .map(|value| get_string_array(value, "junk_reasons"))
            .unwrap_or_else(|| vec!["does_not_fit".to_string(), "weak_signal".to_string()]),
    };

    let explanation_value = object.get("explanation");
    let explanation = BucketPlanExplanation {
        bucket_genesis_mode: config.bucket_genesis_mode.clone(),
        sorting_intent_interpretation: explanation_value
            .and_then(|value| get_string(value, "sorting_intent_interpretation"))
            .unwrap_or_else(|| {
                format!(
                    "The sorting request was interpreted as '{}' semantic grouping.",
                    build_intent_label(&config.sort_intent)
                )
            }),
        bucket_shape_rationale: explanation_value
            .and_then(|value| get_string(value, "bucket_shape_rationale"))
            .unwrap_or_else(|| "No bucket shape rationale provided.".to_string()),
        bucket_meanings: explanation_value
            .map(|value| get_string_array(value, "bucket_meanings"))
            .unwrap_or_default(),
        signals_noticed: explanation_value
            .map(|value| get_string_array(value, "signals_noticed"))
            .unwrap_or_default(),
        weak_or_junk_signals: explanation_value
            .map(|value| get_string_array(value, "weak_or_junk_signals"))
            .unwrap_or_default(),
        bucket_count_judgment: explanation_value
            .and_then(|value| get_string(value, "bucket_count_judgment"))
            .unwrap_or_else(|| "No bucket count judgment provided.".to_string()),
        surprising_groupings: explanation_value
            .map(|value| get_string_array(value, "surprising_groupings"))
            .unwrap_or_default(),
        zoom_in_suggestions: explanation_value
            .map(|value| get_string_array(value, "zoom_in_suggestions"))
            .unwrap_or_default(),
        caution_notes: explanation_value
            .map(|value| get_string_array(value, "caution_notes"))
            .unwrap_or_default(),
    };

    Ok(BucketPlan {
        run_id: config.run_id,
        model_id: object
            .get("model_id")
            .and_then(Value::as_str)
            .unwrap_or("llama-cli")
            .to_string(),
        positive_bucket_count: config.requested_positive_bucket_count,
        sort_intent: config.sort_intent.clone(),
        buckets,
        junk_bucket,
        explanation,
        generation_notes: object
            .get("generation_notes")
            .and_then(Value::as_array)
            .map(|entries| {
                entries
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default(),
    })
}

fn get_string(value: &Value, field: &str) -> Option<String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn get_string_array(value: &Value, field: &str) -> Vec<String> {
    value
        .get(field)
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(Value::as_str)
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn coerce_bucket_count(buckets: &mut Vec<BucketDefinition>, config: &RunConfig) {
    let requested = usize::from(config.requested_positive_bucket_count);
    if buckets.len() > requested {
        buckets.truncate(requested);
    }

    if buckets.len() == requested {
        for (index, bucket) in buckets.iter_mut().enumerate() {
            bucket.bucket_id = format!("B{}", index + 1);
        }
        return;
    }

    let templates = mock_bucket_templates(&config.sort_intent, &config.bucket_genesis_mode);
    while buckets.len() < requested {
        let template = &templates[buckets.len() % templates.len()];
        buckets.push(BucketDefinition {
            bucket_id: format!("B{}", buckets.len() + 1),
            name: template.0.to_string(),
            description: template.1.to_string(),
            criteria: template.2.clone(),
            anchor_examples: template.2.clone(),
        });
    }

    for (index, bucket) in buckets.iter_mut().enumerate() {
        bucket.bucket_id = format!("B{}", index + 1);
    }
}

fn validate_assignment_batch(
    plan: &BucketPlan,
    items: &[DatasetItem],
    assignments: Vec<AssignmentRecord>,
) -> Result<Vec<AssignmentRecord>> {
    if assignments.len() != items.len() {
        bail!(
            "assignment batch length mismatch: expected {} records, got {}",
            items.len(),
            assignments.len()
        );
    }

    let allowed_bucket_ids = plan
        .buckets
        .iter()
        .map(|bucket| bucket.bucket_id.clone())
        .chain(std::iter::once(plan.junk_bucket.bucket_id.clone()))
        .collect::<Vec<_>>();
    let mut expected_items = items
        .iter()
        .map(|item| (item.item_id.clone(), item))
        .collect::<HashMap<_, _>>();
    let mut normalized = Vec::with_capacity(assignments.len());

    for mut assignment in assignments {
        if !allowed_bucket_ids.contains(&assignment.assigned_bucket_id) {
            bail!(
                "assignment referenced unknown bucket id {}",
                assignment.assigned_bucket_id
            );
        }

        if expected_items.remove(&assignment.item_id).is_none() {
            bail!(
                "assignment referenced duplicate or unknown item_id {}",
                assignment.item_id
            );
        }

        assignment.confidence = assignment.confidence.clamp(0.0, 1.0);
        if assignment.rationale.trim().is_empty() {
            assignment.rationale =
                "Model provided no rationale; item was normalized into the frozen bucket plan."
                    .to_string();
        }
        normalized.push(assignment);
    }

    if !expected_items.is_empty() {
        let missing = expected_items
            .keys()
            .cloned()
            .collect::<Vec<_>>()
            .join(", ");
        bail!("assignment batch omitted item ids: {}", missing);
    }

    Ok(normalized)
}

fn parse_assignment_batch_value(raw: Value) -> Result<Vec<AssignmentRecord>> {
    let entries = if raw.get("item_id").is_some() && raw.get("assigned_bucket_id").is_some() {
        vec![raw]
    } else if let Some(array) = raw.as_array() {
        array.clone()
    } else {
        raw.get("assignments")
            .and_then(Value::as_array)
            .cloned()
            .context("failed to parse assignment response")?
    };

    Ok(entries
        .into_iter()
        .filter_map(|entry| {
            let object = entry.as_object()?;
            let item_id = object.get("item_id")?.as_str()?.to_string();
            let assigned_bucket_id = object
                .get("assigned_bucket_id")
                .and_then(Value::as_str)
                .unwrap_or("JUNK")
                .to_string();
            let confidence = object
                .get("confidence")
                .and_then(value_to_f32)
                .unwrap_or(0.5);
            let rationale = object
                .get("rationale")
                .and_then(Value::as_str)
                .unwrap_or("Model provided no rationale.")
                .to_string();
            let review_flag = object
                .get("review_flag")
                .and_then(value_to_bool)
                .unwrap_or(false);

            Some(AssignmentRecord {
                item_id,
                assigned_bucket_id,
                confidence,
                rationale,
                review_flag,
            })
        })
        .collect())
}

fn value_to_f32(value: &Value) -> Option<f32> {
    value
        .as_f64()
        .map(|number| number as f32)
        .or_else(|| value.as_str().and_then(|text| text.parse::<f32>().ok()))
}

fn value_to_bool(value: &Value) -> Option<bool> {
    value
        .as_bool()
        .or_else(|| value.as_str().and_then(|text| text.parse::<bool>().ok()))
}

fn extract_json_object(text: &str) -> Result<Value> {
    let mut start_indices = text
        .char_indices()
        .filter_map(|(index, ch)| if ch == '{' { Some(index) } else { None })
        .collect::<Vec<_>>();
    start_indices.reverse();

    let mut candidates = Vec::new();

    if let Some(value) = extract_balanced_json_candidates(text) {
        candidates.push(value);
    }

    for start in start_indices {
        if let Some(value) = extract_first_balanced_json_from(text, start) {
            candidates.push(value);
        }
    }

    candidates
        .into_iter()
        .max_by_key(root_payload_score)
        .context("failed to parse JSON object from model output")
}

fn extract_balanced_json_candidates(text: &str) -> Option<Value> {
    let mut depth = 0_usize;
    let mut start = None;
    let mut in_string = false;
    let mut escape = false;
    let mut last_success = None;

    for (index, ch) in text.char_indices() {
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            match ch {
                '\\' => escape = true,
                '"' => in_string = false,
                _ => {}
            }
            continue;
        }

        match ch {
            '"' => in_string = true,
            '{' => {
                if depth == 0 {
                    start = Some(index);
                }
                depth += 1;
            }
            '}' => {
                if depth == 0 {
                    continue;
                }
                depth -= 1;
                if depth == 0 {
                    if let Some(begin) = start {
                        let slice = &text[begin..=index];
                        if let Ok(value) = serde_json::from_str::<Value>(slice) {
                            last_success = Some(value);
                        }
                    }
                    start = None;
                }
            }
            _ => {}
        }
    }

    last_success
}

fn extract_first_balanced_json_from(text: &str, start_index: usize) -> Option<Value> {
    let mut depth = 0_usize;
    let mut in_string = false;
    let mut escape = false;
    let slice = &text[start_index..];

    for (offset, ch) in slice.char_indices() {
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            match ch {
                '\\' => escape = true,
                '"' => in_string = false,
                _ => {}
            }
            continue;
        }

        match ch {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                if depth == 0 {
                    return None;
                }
                depth -= 1;
                if depth == 0 {
                    let candidate = &slice[..=offset];
                    if let Ok(value) = serde_json::from_str::<Value>(candidate) {
                        return Some(value);
                    }
                    return None;
                }
            }
            _ => {}
        }
    }

    None
}

fn root_payload_score(value: &Value) -> usize {
    let Some(object) = value.as_object() else {
        return 0;
    };

    let mut score = object.len();
    if object.contains_key("verdict") && object.contains_key("reasoning_summary") {
        score += 1000;
    }
    if object.contains_key("buckets")
        && object.contains_key("junk_bucket")
        && object.contains_key("explanation")
    {
        score += 2000;
    }
    if object.contains_key("assignments") {
        score += 1500;
    }

    score
}

fn mock_bucket_templates(
    intent: &SortIntent,
    mode: &BucketGenesisMode,
) -> Vec<(&'static str, &'static str, Vec<String>)> {
    if matches!(mode, BucketGenesisMode::BlindLabel) {
        return match intent {
            SortIntent::Preset(SortPreset::Code) => vec![
                (
                    "language-shape",
                    "Code-oriented items grouped by syntax, declarations, and language structure.",
                    vec![
                        "syntax".to_string(),
                        "declaration".to_string(),
                        "structure".to_string(),
                    ],
                ),
                (
                    "execution-and-state",
                    "Code-oriented items grouped by runtime behavior, state changes, and execution flow.",
                    vec![
                        "runtime".to_string(),
                        "state".to_string(),
                        "execution".to_string(),
                    ],
                ),
                (
                    "failure-and-repair",
                    "Code-oriented items grouped by breakage, diagnosis, and repair semantics.",
                    vec![
                        "failure".to_string(),
                        "debug".to_string(),
                        "repair".to_string(),
                    ],
                ),
                (
                    "architecture-and-abstraction",
                    "Code-oriented items grouped by boundaries, design, and abstraction choices.",
                    vec![
                        "architecture".to_string(),
                        "abstraction".to_string(),
                        "design".to_string(),
                    ],
                ),
            ],
            SortIntent::Preset(SortPreset::LinearReasoning) => vec![
                (
                    "given-state",
                    "Reasoning items grouped by givens, premises, and setup conditions.",
                    vec![
                        "premise".to_string(),
                        "given".to_string(),
                        "setup".to_string(),
                    ],
                ),
                (
                    "transform-steps",
                    "Reasoning items grouped by ordered steps and explicit transformations.",
                    vec![
                        "step".to_string(),
                        "transform".to_string(),
                        "sequence".to_string(),
                    ],
                ),
                (
                    "validation-boundaries",
                    "Reasoning items grouped by rule checks, constraints, and consistency tests.",
                    vec![
                        "constraint".to_string(),
                        "rule".to_string(),
                        "check".to_string(),
                    ],
                ),
                (
                    "result-state",
                    "Reasoning items grouped by outcomes, conclusions, and final states.",
                    vec![
                        "result".to_string(),
                        "conclusion".to_string(),
                        "outcome".to_string(),
                    ],
                ),
            ],
            SortIntent::Preset(SortPreset::AbstractReasoning) => vec![
                (
                    "forms-and-patterns",
                    "Abstract items grouped by recurring forms, patterns, and conceptual shapes.",
                    vec![
                        "pattern".to_string(),
                        "form".to_string(),
                        "shape".to_string(),
                    ],
                ),
                (
                    "mapping-and-analogy",
                    "Abstract items grouped by analogy, correspondence, and cross-domain mapping.",
                    vec![
                        "analogy".to_string(),
                        "mapping".to_string(),
                        "correspondence".to_string(),
                    ],
                ),
                (
                    "frames-and-lenses",
                    "Abstract items grouped by interpretive frames, conceptual lenses, and abstractions.",
                    vec![
                        "frame".to_string(),
                        "lens".to_string(),
                        "abstraction".to_string(),
                    ],
                ),
                (
                    "open-space-and-speculation",
                    "Abstract items grouped by unresolved, exploratory, or speculative content.",
                    vec![
                        "open".to_string(),
                        "speculation".to_string(),
                        "exploratory".to_string(),
                    ],
                ),
            ],
            SortIntent::Preset(SortPreset::Topic) => vec![
                (
                    "mechanisms-and-systems",
                    "Topic buckets framed around mechanisms, systems, and concrete operational structures.",
                    vec![
                        "system".to_string(),
                        "mechanism".to_string(),
                        "structure".to_string(),
                    ],
                ),
                (
                    "analysis-and-judgment",
                    "Topic buckets framed around analysis, judgment, and interpretive reasoning.",
                    vec![
                        "analysis".to_string(),
                        "judgment".to_string(),
                        "reasoning".to_string(),
                    ],
                ),
                (
                    "coordination-and-action",
                    "Topic buckets framed around planning, coordination, and execution realities.",
                    vec![
                        "planning".to_string(),
                        "coordination".to_string(),
                        "execution".to_string(),
                    ],
                ),
                (
                    "concepts-and-theory",
                    "Topic buckets framed around ideas, theory, and abstract conceptual material.",
                    vec![
                        "concept".to_string(),
                        "theory".to_string(),
                        "idea".to_string(),
                    ],
                ),
            ],
            _ => vec![
                (
                    "concrete-mechanics",
                    "General buckets framed around concrete mechanisms and how things work.",
                    vec![
                        "mechanic".to_string(),
                        "system".to_string(),
                        "implementation".to_string(),
                    ],
                ),
                (
                    "interpretation-and-reasoning",
                    "General buckets framed around analysis, interpretation, and reasoning.",
                    vec![
                        "analysis".to_string(),
                        "interpretation".to_string(),
                        "logic".to_string(),
                    ],
                ),
                (
                    "workflow-and-activity",
                    "General buckets framed around process, action, and operational movement.",
                    vec![
                        "workflow".to_string(),
                        "activity".to_string(),
                        "process".to_string(),
                    ],
                ),
                (
                    "ideas-and-context",
                    "General buckets framed around concepts, context, and framing language.",
                    vec![
                        "concept".to_string(),
                        "context".to_string(),
                        "framing".to_string(),
                    ],
                ),
            ],
        };
    }

    match intent {
        SortIntent::Preset(SortPreset::Code) => vec![
            (
                "syntax-and-structure",
                "Code items about syntax shape, parsing, declarations, and structural correctness.",
                vec![
                    "syntax".to_string(),
                    "structure".to_string(),
                    "parsing".to_string(),
                ],
            ),
            (
                "bugs-and-failures",
                "Code items about failures, breakage, missing pieces, and incorrect behavior.",
                vec![
                    "bug".to_string(),
                    "failure".to_string(),
                    "error".to_string(),
                ],
            ),
            (
                "tooling-and-runtime",
                "Code items about runtime behavior, build systems, execution, and tooling.",
                vec![
                    "runtime".to_string(),
                    "build".to_string(),
                    "tooling".to_string(),
                ],
            ),
            (
                "architecture-and-design",
                "Code items about boundaries, design choices, abstractions, and system shape.",
                vec![
                    "architecture".to_string(),
                    "design".to_string(),
                    "abstraction".to_string(),
                ],
            ),
        ],
        SortIntent::Preset(SortPreset::LinearReasoning) => vec![
            (
                "premises-and-inputs",
                "Items that establish starting assumptions, given facts, or setup conditions.",
                vec![
                    "premise".to_string(),
                    "given".to_string(),
                    "input".to_string(),
                ],
            ),
            (
                "steps-and-inference",
                "Items focused on ordered steps, transitions, and inference chains.",
                vec![
                    "step".to_string(),
                    "sequence".to_string(),
                    "inference".to_string(),
                ],
            ),
            (
                "constraints-and-checks",
                "Items about validation, consistency checks, and rule boundaries.",
                vec![
                    "constraint".to_string(),
                    "check".to_string(),
                    "validation".to_string(),
                ],
            ),
            (
                "outcomes-and-conclusions",
                "Items that state results, conclusions, or terminal judgments.",
                vec![
                    "outcome".to_string(),
                    "conclusion".to_string(),
                    "result".to_string(),
                ],
            ),
        ],
        SortIntent::Preset(SortPreset::AbstractReasoning) => vec![
            (
                "patterns-and-analogy",
                "Items about analogies, recurring forms, and structural resemblance.",
                vec![
                    "pattern".to_string(),
                    "analogy".to_string(),
                    "mapping".to_string(),
                ],
            ),
            (
                "conceptual-frames",
                "Items defining broad conceptual lenses, abstractions, and interpretive frames.",
                vec![
                    "concept".to_string(),
                    "frame".to_string(),
                    "abstraction".to_string(),
                ],
            ),
            (
                "relations-and-transforms",
                "Items about correspondences, transformations, and cross-domain relations.",
                vec![
                    "relation".to_string(),
                    "transform".to_string(),
                    "correspondence".to_string(),
                ],
            ),
            (
                "speculation-and-open-space",
                "Items that are exploratory, unresolved, or still semantically loose.",
                vec![
                    "speculation".to_string(),
                    "open".to_string(),
                    "exploratory".to_string(),
                ],
            ),
        ],
        SortIntent::Preset(SortPreset::Topic) => vec![
            (
                "technical-systems",
                "Items centered on software, infrastructure, implementation, or technical mechanics.",
                vec![
                    "technical".to_string(),
                    "system".to_string(),
                    "implementation".to_string(),
                ],
            ),
            (
                "reasoning-and-logic",
                "Items about inference, proof, argument structure, or analytical thinking.",
                vec![
                    "reasoning".to_string(),
                    "logic".to_string(),
                    "analysis".to_string(),
                ],
            ),
            (
                "operations-and-delivery",
                "Items about process, planning, release work, coordination, or execution.",
                vec![
                    "operations".to_string(),
                    "delivery".to_string(),
                    "planning".to_string(),
                ],
            ),
            (
                "ideas-and-abstractions",
                "Items focused on high-level concepts, theories, or abstract interpretations.",
                vec![
                    "ideas".to_string(),
                    "theory".to_string(),
                    "abstraction".to_string(),
                ],
            ),
        ],
        _ => vec![
            (
                "core-technical",
                "Items with direct technical, implementation, or mechanism-oriented content.",
                vec![
                    "technical".to_string(),
                    "implementation".to_string(),
                    "mechanism".to_string(),
                ],
            ),
            (
                "reasoning-and-analysis",
                "Items focused on analysis, logical structure, and interpretive thinking.",
                vec![
                    "analysis".to_string(),
                    "reasoning".to_string(),
                    "logic".to_string(),
                ],
            ),
            (
                "workflow-and-operations",
                "Items about work coordination, process, planning, and execution flow.",
                vec![
                    "workflow".to_string(),
                    "process".to_string(),
                    "planning".to_string(),
                ],
            ),
            (
                "concepts-and-context",
                "Items that define broad ideas, framing, or contextual interpretation.",
                vec![
                    "concept".to_string(),
                    "context".to_string(),
                    "framing".to_string(),
                ],
            ),
        ],
    }
}

fn build_mock_explanation(
    config: &RunConfig,
    sample: &[DatasetItem],
    buckets: &[BucketDefinition],
) -> BucketPlanExplanation {
    let bucket_meanings = buckets
        .iter()
        .map(|bucket| format!("{}: {}", bucket.name, bucket.description))
        .collect();

    let signals_noticed = sample
        .iter()
        .take(4)
        .map(|item| {
            let snippet: String = item.content.chars().take(90).collect();
            format!("Observed signal in {}: {}", item.item_id, snippet)
        })
        .collect();

    BucketPlanExplanation {
        bucket_genesis_mode: config.bucket_genesis_mode.clone(),
        sorting_intent_interpretation: format!(
            "The sorting request was interpreted as '{}' semantic grouping over the dataset items.",
            build_intent_label(&config.sort_intent)
        ),
        bucket_shape_rationale: match config.bucket_genesis_mode {
            BucketGenesisMode::DataSkim => format!(
                "The bucket shape was chosen after a data skim to cover the strongest recurring semantic regions while preserving junk for overflow. {} positive buckets were treated as the active semantic budget.",
                config.requested_positive_bucket_count
            ),
            BucketGenesisMode::BlindLabel => format!(
                "The bucket shape was chosen blind from the requested sort intent and bucket budget before inspecting the dataset contents. {} positive buckets were locked in first, and the downstream sorter is expected to live inside that reality plus junk.",
                config.requested_positive_bucket_count
            ),
        },
        bucket_meanings,
        signals_noticed: match config.bucket_genesis_mode {
            BucketGenesisMode::DataSkim => signals_noticed,
            BucketGenesisMode::BlindLabel => vec![
                "Blind mode intentionally withheld dataset content during bucket genesis.".to_string(),
                "Signals will matter during assignment, but not while naming or shaping the buckets.".to_string(),
            ],
        },
        weak_or_junk_signals: match config.bucket_genesis_mode {
            BucketGenesisMode::DataSkim => vec![
                "Mixed items that blend technical content with planning language may belong in junk if no single bucket dominates.".to_string(),
                "Short records with too little context should be treated as weak-signal candidates.".to_string(),
                "Items that do not clearly fit the requested sort intent should fall into junk rather than forced assignment.".to_string(),
            ],
            BucketGenesisMode::BlindLabel => vec![
                "Blind mode increases the risk that some real dataset signals will not align cleanly with the predeclared bucket shape.".to_string(),
                "Unexpected or domain-specific material is more likely to land in junk when buckets are defined before data exposure.".to_string(),
                "If too much falls into junk, rerun with data_skim or a narrower intent rather than forcing bad semantic fit.".to_string(),
            ],
        },
        bucket_count_judgment: match config.requested_positive_bucket_count {
            0..=2 => "The requested bucket count looks too low for stable semantic separation, so coarse grouping or heavy junk use is likely.".to_string(),
            3..=6 => "The requested bucket count looks plausible for a first-pass semantic partition of this dataset sample.".to_string(),
            _ => "The requested bucket count may be too high for the available dataset signal, so bucket overlap or thin categories are likely.".to_string(),
        },
        surprising_groupings: match config.bucket_genesis_mode {
            BucketGenesisMode::DataSkim => vec![
                "Operational and analytical language can sit closer together than expected when records discuss process failures.".to_string(),
                "Abstract reasoning items may cluster with technical systems when they describe structure rather than pure theory.".to_string(),
            ],
            BucketGenesisMode::BlindLabel => vec![
                "Blind mode may create bucket names that feel semantically clean before the data arrives, then reveal unexpected collisions during assignment.".to_string(),
                "The interesting result in blind mode is often the mismatch between the declared bucket reality and the dataset that had to live inside it.".to_string(),
            ],
        },
        zoom_in_suggestions: vec![
            "Inspect junk first to see whether the current sort intent is leaving too much value on the floor.".to_string(),
            "If one bucket feels overloaded, rerun with a narrower intent rather than just increasing bucket count blindly.".to_string(),
            match config.bucket_genesis_mode {
                BucketGenesisMode::DataSkim => "Compare bucket anchor examples against actual assigned items to check whether the semantic shape is holding.".to_string(),
                BucketGenesisMode::BlindLabel => "Compare the predeclared bucket meanings against actual assignments to see where the dataset resisted the imposed semantic shape.".to_string(),
            },
        ],
        caution_notes: match config.bucket_genesis_mode {
            BucketGenesisMode::DataSkim => vec![
                "These buckets are semantic compression aids, not objective truth categories.".to_string(),
                "Do not overread small differences between neighboring buckets when the dataset is sparse or mixed.".to_string(),
                "A good bucket name can still hide weak evidence underneath, so review representative items before trusting the grouping.".to_string(),
            ],
            BucketGenesisMode::BlindLabel => vec![
                "Blind mode is useful when you want the model to declare an inherent bucket ontology before data exposure, but that also increases mismatch risk.".to_string(),
                "A neat blind bucket scheme can still be a poor fit for the real dataset, so junk and review counts matter more here.".to_string(),
                "Do not mistake blind-label coherence for evidence that the dataset itself naturally partitions that way.".to_string(),
            ],
        },
    }
}

fn choose_mock_bucket(plan: &BucketPlan, lower: &str) -> String {
    let intent_specific = plan
        .buckets
        .iter()
        .find(|bucket| bucket.criteria.iter().any(|term| lower.contains(term)));
    if let Some(bucket) = intent_specific {
        return bucket.bucket_id.clone();
    }

    if lower.contains("rust")
        || lower.contains("parser")
        || lower.contains("json")
        || lower.contains("compile")
    {
        return plan
            .buckets
            .first()
            .map(|bucket| bucket.bucket_id.clone())
            .unwrap_or_else(|| plan.junk_bucket.bucket_id.clone());
    }
    if lower.contains("reason")
        || lower.contains("proof")
        || lower.contains("logic")
        || lower.contains("inference")
    {
        return plan
            .buckets
            .get(1)
            .or_else(|| plan.buckets.first())
            .map(|bucket| bucket.bucket_id.clone())
            .unwrap_or_else(|| plan.junk_bucket.bucket_id.clone());
    }
    if lower.contains("team")
        || lower.contains("release")
        || lower.contains("deploy")
        || lower.contains("process")
        || lower.contains("checklist")
    {
        return plan
            .buckets
            .get(2)
            .or_else(|| plan.buckets.first())
            .map(|bucket| bucket.bucket_id.clone())
            .unwrap_or_else(|| plan.junk_bucket.bucket_id.clone());
    }
    if lower.contains("abstract")
        || lower.contains("analogy")
        || lower.contains("theory")
        || lower.contains("structure")
    {
        return plan
            .buckets
            .get(3)
            .or_else(|| plan.buckets.first())
            .map(|bucket| bucket.bucket_id.clone())
            .unwrap_or_else(|| plan.junk_bucket.bucket_id.clone());
    }

    plan.junk_bucket.bucket_id.clone()
}

fn looks_like_junk(lower: &str) -> bool {
    lower.trim().is_empty()
        || lower.contains("todo")
        || lower.contains("misc")
        || lower.contains("unknown")
        || lower.contains("n/a")
}

fn contains_ambiguous_language(lower: &str) -> bool {
    lower.contains("maybe")
        || lower.contains("could")
        || lower.contains("might")
        || lower.contains("perhaps")
}
