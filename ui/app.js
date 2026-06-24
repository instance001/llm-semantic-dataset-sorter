const state = {
  datasets: [],
  selectedDatasetId: null,
  runs: [],
  jobs: [],
  runDetailsByOutputDir: {},
  experimentInsightsById: {},
  experimentStatusFilter: "all",
  experimentSort: "newest",
  experimentPreset: "all",
  experimentInterestingnessThreshold: 0,
  experimentAutoOpenTopInteresting: false,
  experimentAlertThreshold: 6,
  alertedExperimentIds: [],
  watchTargets: [],
  persistedTrendSnapshots: [],
  runReviewsByOutputDir: {},
  experimentReviewsById: {},
  runVerdictFilter: "all",
  experimentDatasetFilter: "",
  experimentVerdictFilter: "all",
  reviewTimelineFilter: "all",
  activeExperimentId: null,
  activeExperimentSuggestion: null,
  activeJobId: null,
  activeRunOutputDir: null,
  currentRunArtifact: null,
  jobPollTimer: null,
  previewRefreshTimer: null,
  jobStatusFilter: "all",
  jobDatasetFilter: "",
  showArchivedJobs: false,
  pendingAnalysisImportMode: null,
  pendingAnalysisImportPlan: null,
  analysisSnapshots: [],
  analysisSnapshotCompareMode: "all",
  analysisSnapshotFilter: "",
};

const UI_STATE_STORAGE_KEY = "llm_semantic_dataset_sorter_ui_state_v1";
const STARTUP_SPLASH_DURATION_MS = 3000;

const EXPERIMENT_RECIPES = {
  topic_balanced: {
    sortIntent: "topic",
    bucketGenesisMode: "data_skim",
    bucketCount: 4,
    forceOverride: false,
    customInstructions:
      "Balanced semantic topic audit. Prefer stable interpretable bucket names over aggressive fragmentation.",
  },
  code_strict: {
    sortIntent: "code",
    bucketGenesisMode: "data_skim",
    bucketCount: 5,
    forceOverride: true,
    customInstructions:
      "Bias toward concrete code semantics, implementation patterns, failure modes, and operational junk separation.",
  },
  reasoning_probe: {
    sortIntent: "linear_reasoning",
    bucketGenesisMode: "blind_label",
    bucketCount: 4,
    forceOverride: true,
    customInstructions:
      "Probe whether the dataset naturally separates proof steps, inference structure, evidence style, and mixed weak-signal reasoning.",
  },
  abstract_probe: {
    sortIntent: "abstract_reasoning",
    bucketGenesisMode: "blind_label",
    bucketCount: 4,
    forceOverride: true,
    customInstructions:
      "Probe structural analogies, abstraction level, conceptual compression, and mismatch into junk when abstraction is weak.",
  },
  junk_stress: {
    sortIntent: "general",
    bucketGenesisMode: "data_skim",
    bucketCount: 3,
    forceOverride: true,
    customInstructions:
      "Stress-test junk behavior. Be strict about weak fit, ambiguous records, and noisy mixed-content spillover.",
  },
};

const els = {
  datasetSelect: document.getElementById("dataset-select"),
  experimentRecipe: document.getElementById("experiment-recipe"),
  sortIntent: document.getElementById("sort-intent"),
  bucketGenesisMode: document.getElementById("bucket-genesis-mode"),
  bucketCount: document.getElementById("bucket-count"),
  forceOverride: document.getElementById("force-override"),
  customInstructions: document.getElementById("custom-instructions"),
  watchCurrentTargetBtn: document.getElementById("watch-current-target-btn"),
  healthPanel: document.getElementById("health-panel"),
  datasetMeta: document.getElementById("dataset-meta"),
  datasetProjectionControls: document.getElementById("dataset-projection-controls"),
  datasetPreview: document.getElementById("dataset-preview"),
  datasetRawPreview: document.getElementById("dataset-raw-preview"),
  preflightSummary: document.getElementById("preflight-summary"),
  preflightJson: document.getElementById("preflight-json"),
  explanationGrid: document.getElementById("explanation-grid"),
  planMeta: document.getElementById("plan-meta"),
  bucketList: document.getElementById("bucket-list"),
  jobStatusFilter: document.getElementById("job-status-filter"),
  jobDatasetFilter: document.getElementById("job-dataset-filter"),
  jobShowArchived: document.getElementById("job-show-archived"),
  jobArchiveCompletedBtn: document.getElementById("job-archive-completed-btn"),
  jobDeleteArchivedBtn: document.getElementById("job-delete-archived-btn"),
  jobRetentionNote: document.getElementById("job-retention-note"),
  jobSummary: document.getElementById("job-summary"),
  jobHistory: document.getElementById("job-history"),
  jobJson: document.getElementById("job-json"),
  assignmentSummary: document.getElementById("assignment-summary"),
  sortJson: document.getElementById("sort-json"),
  runHistory: document.getElementById("run-history"),
  runVerdictFilter: document.getElementById("run-verdict-filter"),
  runDetailMeta: document.getElementById("run-detail-meta"),
  runDetailArtifacts: document.getElementById("run-detail-artifacts"),
  runDetailSummary: document.getElementById("run-detail-summary"),
  runDetailEvidence: document.getElementById("run-detail-evidence"),
  runDetailBucketExports: document.getElementById("run-detail-bucket-exports"),
  runDetailCurrentArtifact: document.getElementById("run-detail-current-artifact"),
  runDetailJson: document.getElementById("run-detail-json"),
  runDetailDownloadBtn: document.getElementById("run-detail-download-btn"),
  runDetailCompareLeftBtn: document.getElementById("run-detail-compare-left-btn"),
  runDetailCompareRightBtn: document.getElementById("run-detail-compare-right-btn"),
  runDetailCompareNowBtn: document.getElementById("run-detail-compare-now-btn"),
  watchlistSummaryNote: document.getElementById("watchlist-summary-note"),
  watchlistHistory: document.getElementById("watchlist-history"),
  reviewInboxSummary: document.getElementById("review-inbox-summary"),
  reviewTimelineFilter: document.getElementById("review-timeline-filter"),
  reviewInboxTimeline: document.getElementById("review-inbox-timeline"),
  reviewInboxHistory: document.getElementById("review-inbox-history"),
  reviewedRunsExportBtn: document.getElementById("reviewed-runs-export-btn"),
  reviewedRunsJsonBtn: document.getElementById("reviewed-runs-json-btn"),
  reviewedRunsCsvBtn: document.getElementById("reviewed-runs-csv-btn"),
  reviewedExperimentsExportBtn: document.getElementById("reviewed-experiments-export-btn"),
  reviewedExperimentsJsonBtn: document.getElementById("reviewed-experiments-json-btn"),
  reviewedExperimentsCsvBtn: document.getElementById("reviewed-experiments-csv-btn"),
  analysisStateExportBtn: document.getElementById("analysis-state-export-btn"),
  analysisStateImportMergeBtn: document.getElementById("analysis-state-import-merge-btn"),
  analysisStateImportReplaceBtn: document.getElementById("analysis-state-import-replace-btn"),
  analysisStateImportInput: document.getElementById("analysis-state-import-input"),
  analysisStateImportStatus: document.getElementById("analysis-state-import-status"),
  analysisStateImportPreview: document.getElementById("analysis-state-import-preview"),
  analysisStateImportSnapshotName: document.getElementById("analysis-state-import-snapshot-name"),
  analysisStateImportExistingSnapshot: document.getElementById("analysis-state-import-existing-snapshot"),
  analysisStateImportDiffBtn: document.getElementById("analysis-state-import-diff-btn"),
  analysisStateImportSnapshotBtn: document.getElementById("analysis-state-import-snapshot-btn"),
  analysisStateImportUpdateSnapshotBtn: document.getElementById("analysis-state-import-update-snapshot-btn"),
  analysisStateImportConfirmBtn: document.getElementById("analysis-state-import-confirm-btn"),
  analysisStateImportCancelBtn: document.getElementById("analysis-state-import-cancel-btn"),
  analysisSnapshotName: document.getElementById("analysis-snapshot-name"),
  analysisSnapshotTags: document.getElementById("analysis-snapshot-tags"),
  analysisSnapshotNote: document.getElementById("analysis-snapshot-note"),
  analysisSnapshotSaveBtn: document.getElementById("analysis-snapshot-save-btn"),
  analysisSnapshotExportAllBtn: document.getElementById("analysis-snapshot-export-all-btn"),
  analysisSnapshotStatus: document.getElementById("analysis-snapshot-status"),
  analysisSnapshotFilter: document.getElementById("analysis-snapshot-filter"),
  analysisSnapshotHistory: document.getElementById("analysis-snapshot-history"),
  analysisSnapshotCompareLeft: document.getElementById("analysis-snapshot-compare-left"),
  analysisSnapshotCompareRight: document.getElementById("analysis-snapshot-compare-right"),
  analysisSnapshotCompareBtn: document.getElementById("analysis-snapshot-compare-btn"),
  analysisSnapshotCompareMode: document.getElementById("analysis-snapshot-compare-mode"),
  analysisSnapshotCompareSummary: document.getElementById("analysis-snapshot-compare-summary"),
  analysisSnapshotCompareGrid: document.getElementById("analysis-snapshot-compare-grid"),
  runReviewVerdict: document.getElementById("run-review-verdict"),
  runReviewNote: document.getElementById("run-review-note"),
  runReviewSaveBtn: document.getElementById("run-review-save-btn"),
  runReviewApplyBtn: document.getElementById("run-review-apply-btn"),
  runReviewStatus: document.getElementById("run-review-status"),
  experimentStatusFilter: document.getElementById("experiment-status-filter"),
  experimentSort: document.getElementById("experiment-sort"),
  experimentPreset: document.getElementById("experiment-preset"),
  experimentDatasetFilter: document.getElementById("experiment-dataset-filter"),
  experimentInterestThreshold: document.getElementById("experiment-interest-threshold"),
  experimentAutoOpen: document.getElementById("experiment-auto-open"),
  experimentAlertThreshold: document.getElementById("experiment-alert-threshold"),
  experimentVerdictFilter: document.getElementById("experiment-verdict-filter"),
  experimentSummaryNote: document.getElementById("experiment-summary-note"),
  experimentHistory: document.getElementById("experiment-history"),
  experimentExportBtn: document.getElementById("experiment-export-btn"),
  experimentExportHtmlBtn: document.getElementById("experiment-export-html-btn"),
  experimentExportBatchBtn: document.getElementById("experiment-export-batch-btn"),
  experimentApplySuggestionBtn: document.getElementById("experiment-apply-suggestion-btn"),
  experimentReviewVerdict: document.getElementById("experiment-review-verdict"),
  experimentReviewNote: document.getElementById("experiment-review-note"),
  experimentReviewSaveBtn: document.getElementById("experiment-review-save-btn"),
  experimentReviewApplyBtn: document.getElementById("experiment-review-apply-btn"),
  experimentReviewStatus: document.getElementById("experiment-review-status"),
  experimentReportMeta: document.getElementById("experiment-report-meta"),
  experimentReportGrid: document.getElementById("experiment-report-grid"),
  compareLeft: document.getElementById("compare-left"),
  compareRight: document.getElementById("compare-right"),
  compareBtn: document.getElementById("compare-btn"),
  compareBestPairBtn: document.getElementById("compare-best-pair-btn"),
  compareSummary: document.getElementById("compare-summary"),
  comparePairNote: document.getElementById("compare-pair-note"),
  compareGrid: document.getElementById("compare-grid"),
  refreshDatasets: document.getElementById("refresh-datasets"),
  refreshRuns: document.getElementById("refresh-runs"),
  previewBtn: document.getElementById("preview-btn"),
  applyRecipeBtn: document.getElementById("apply-recipe-btn"),
  preflightBtn: document.getElementById("preflight-btn"),
  planBtn: document.getElementById("plan-btn"),
  sortBtn: document.getElementById("sort-btn"),
  sortPairBtn: document.getElementById("sort-pair-btn"),
  startupSplash: document.getElementById("startup-splash"),
};

function initStartupSplash() {
  const splash = els.startupSplash;
  if (!splash) return;

  document.body.classList.add("splash-active");

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    splash.classList.add("is-hidden");
    document.body.classList.remove("splash-active");
    window.removeEventListener("keydown", handleKeydown);
    splash.removeEventListener("click", dismiss);
  };

  const handleKeydown = (event) => {
    if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
      dismiss();
    }
  };

  window.setTimeout(dismiss, STARTUP_SPLASH_DURATION_MS);
  window.addEventListener("keydown", handleKeydown);
  splash.addEventListener("click", dismiss);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(typeof data === "string" ? data : JSON.stringify(data, null, 2));
  }

  return data;
}

function buildRequestBody() {
  const projection = buildDatasetProjectionRequest();
  return {
    sort_intent: {
      kind: "Preset",
      value: els.sortIntent.value,
    },
    bucket_genesis_mode: els.bucketGenesisMode.value,
    requested_positive_bucket_count: Number(els.bucketCount.value),
    custom_instructions: els.customInstructions.value.trim() || null,
    force_override: els.forceOverride.checked,
    dataset_projection: projection,
  };
}

function applyExperimentRecipe(recipeId) {
  const recipe = EXPERIMENT_RECIPES[recipeId];
  if (!recipe) return;
  els.sortIntent.value = recipe.sortIntent;
  els.bucketGenesisMode.value = recipe.bucketGenesisMode;
  els.bucketCount.value = String(recipe.bucketCount);
  els.forceOverride.checked = Boolean(recipe.forceOverride);
  els.customInstructions.value = recipe.customInstructions;
}

function applyExperimentSuggestion(suggestion) {
  if (!suggestion) return;
  applyExperimentRecipe(suggestion.recipeId);
  if (Number.isFinite(suggestion.bucketCount)) {
    els.bucketCount.value = String(suggestion.bucketCount);
  }
  if (typeof suggestion.forceOverride === "boolean") {
    els.forceOverride.checked = suggestion.forceOverride;
  }
  if (suggestion.customInstructions) {
    els.customInstructions.value = suggestion.customInstructions;
  }
}

function parseSnapshotTags(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function saveUiState() {
  const snapshot = {
    experimentStatusFilter: state.experimentStatusFilter,
    experimentSort: state.experimentSort,
    experimentPreset: state.experimentPreset,
    experimentInterestingnessThreshold: state.experimentInterestingnessThreshold,
    experimentAutoOpenTopInteresting: state.experimentAutoOpenTopInteresting,
    experimentAlertThreshold: state.experimentAlertThreshold,
    experimentDatasetFilter: state.experimentDatasetFilter,
    experimentVerdictFilter: state.experimentVerdictFilter,
    runVerdictFilter: state.runVerdictFilter,
    reviewTimelineFilter: state.reviewTimelineFilter,
    analysisSnapshotCompareMode: state.analysisSnapshotCompareMode,
    analysisSnapshotFilter: state.analysisSnapshotFilter,
    activeExperimentId: state.activeExperimentId,
    compareLeft: els.compareLeft.value || "",
    compareRight: els.compareRight.value || "",
  };
  try {
    window.localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {}
}

function loadUiState() {
  try {
    const raw = window.localStorage.getItem(UI_STATE_STORAGE_KEY);
    if (!raw) return;
    const snapshot = JSON.parse(raw);
    state.experimentStatusFilter = snapshot.experimentStatusFilter || "all";
    state.experimentSort = snapshot.experimentSort || "newest";
    state.experimentPreset = snapshot.experimentPreset || "all";
    state.experimentInterestingnessThreshold = Number(snapshot.experimentInterestingnessThreshold ?? 0);
    state.experimentAutoOpenTopInteresting = Boolean(snapshot.experimentAutoOpenTopInteresting);
    state.experimentAlertThreshold = Number(snapshot.experimentAlertThreshold ?? 6);
    state.experimentDatasetFilter = snapshot.experimentDatasetFilter || "";
    state.experimentVerdictFilter = snapshot.experimentVerdictFilter || "all";
    state.runVerdictFilter = snapshot.runVerdictFilter || "all";
    state.reviewTimelineFilter = snapshot.reviewTimelineFilter || "all";
    state.analysisSnapshotCompareMode = snapshot.analysisSnapshotCompareMode || "all";
    state.analysisSnapshotFilter = snapshot.analysisSnapshotFilter || "";
    state.activeExperimentId = snapshot.activeExperimentId || null;
    if (snapshot.compareLeft) state.compareLeftPersisted = snapshot.compareLeft;
    if (snapshot.compareRight) state.compareRightPersisted = snapshot.compareRight;
  } catch {}
}

async function loadPersistedAnalysisState() {
  try {
    const payload = await requestJson("/api/analysis-state");
    applyNormalizedAnalysisState(normalizeAnalysisStatePayload(payload));
    renderAnalysisSnapshots();
  } catch {}
}

function buildCurrentAnalysisSnapshotBody() {
  const trendSnapshots = buildWatchTrends(state.runs).map((trend) => ({
    watch_key: trend.watchKey,
    dataset_display_name: trend.datasetDisplayName,
    sort_intent: trend.sortIntent,
    latest_experiment_id: trend.latestExperiment?.experimentId ?? null,
    latest_interestingness: trend.latestInsight?.interestingnessScore ?? null,
    delta_score: trend.deltaScore ?? null,
    complete_experiment_count: trend.completeExperimentCount,
    regression_kind: trend.regression?.kind ?? null,
    summary_note: trend.summaryNote,
    structural_drift_note: trend.structuralDriftNote ?? null,
  }));

  return {
    watch_targets: state.watchTargets.map((target) => ({
      watch_key: target.watchKey,
      dataset_display_name: target.datasetDisplayName,
      sort_intent: target.sortIntent,
    })),
    alerted_experiment_ids: state.alertedExperimentIds,
    trend_snapshots: trendSnapshots,
    run_reviews: Object.entries(state.runReviewsByOutputDir).map(([outputDirName, review]) => ({
      output_dir_name: outputDirName,
      verdict: review.verdict,
      note: review.note,
      updated_at: review.updatedAt,
    })),
    experiment_reviews: Object.entries(state.experimentReviewsById).map(([experimentId, review]) => ({
      experiment_id: experimentId,
      verdict: review.verdict,
      note: review.note,
      updated_at: review.updatedAt,
    })),
    experiment_insights: Object.entries(state.experimentInsightsById).map(([experimentId, insight]) => ({
      experiment_id: experimentId,
      bucket_name_drift: insight.bucketNameDrift ?? 0,
      projection_drift: insight.projectionDrift ?? 0,
      bucket_distribution_drift: insight.bucketDistributionDrift ?? 0,
      junk_drift: insight.junkDrift ?? 0,
      review_drift: insight.reviewDrift ?? 0,
      explanation_drift: insight.explanationDrift ?? 0,
      interestingness_score: insight.interestingnessScore ?? 0,
      summary_note: insight.summaryNote || "",
      structural_drift_note: insight.structuralDriftNote ?? null,
    })),
  };
}

function buildAnalysisStatePayload() {
  return {
    ...buildCurrentAnalysisSnapshotBody(),
    snapshots: state.analysisSnapshots.map((snapshot) => ({
      snapshot_id: snapshot.snapshotId,
      name: snapshot.name,
      note: snapshot.note || "",
      tags: snapshot.tags || [],
      created_at: snapshot.createdAt,
      state: snapshot.state,
    })),
  };
}

function normalizeTrendSnapshotEntry(trend = {}) {
  return {
    watch_key: trend.watch_key || "",
    dataset_display_name: trend.dataset_display_name || "",
    sort_intent: trend.sort_intent || "general",
    latest_experiment_id: trend.latest_experiment_id || null,
    latest_interestingness: Number.isFinite(Number(trend.latest_interestingness))
      ? Number(trend.latest_interestingness)
      : null,
    delta_score: Number.isFinite(Number(trend.delta_score)) ? Number(trend.delta_score) : null,
    complete_experiment_count: Number(trend.complete_experiment_count ?? 0),
    regression_kind: trend.regression_kind || null,
    summary_note: trend.summary_note || "",
    structural_drift_note: trend.structural_drift_note || null,
  };
}

function normalizeAnalysisStatePayload(payload = {}) {
  return {
    watch_targets: Array.isArray(payload.watch_targets)
      ? payload.watch_targets.map((target) => ({
          watch_key: target.watch_key || "",
          dataset_display_name: target.dataset_display_name || "",
          sort_intent: target.sort_intent || "general",
        }))
      : [],
    alerted_experiment_ids: Array.isArray(payload.alerted_experiment_ids)
      ? payload.alerted_experiment_ids.filter(Boolean)
      : [],
    trend_snapshots: Array.isArray(payload.trend_snapshots)
      ? payload.trend_snapshots
          .filter((trend) => trend?.watch_key)
          .map((trend) => normalizeTrendSnapshotEntry(trend))
      : [],
    run_reviews: Array.isArray(payload.run_reviews)
      ? payload.run_reviews
          .filter((review) => review?.output_dir_name)
          .map((review) => ({
            output_dir_name: review.output_dir_name,
            verdict: review.verdict || "unreviewed",
            note: review.note || "",
            updated_at: review.updated_at || null,
          }))
      : [],
    experiment_reviews: Array.isArray(payload.experiment_reviews)
      ? payload.experiment_reviews
          .filter((review) => review?.experiment_id)
          .map((review) => ({
            experiment_id: review.experiment_id,
            verdict: review.verdict || "unreviewed",
            note: review.note || "",
            updated_at: review.updated_at || null,
          }))
      : [],
    experiment_insights: Array.isArray(payload.experiment_insights)
      ? payload.experiment_insights
          .filter((insight) => insight?.experiment_id)
          .map((insight) => ({
            experiment_id: insight.experiment_id,
            bucket_name_drift: Number(insight.bucket_name_drift ?? 0),
            projection_drift: Number(insight.projection_drift ?? 0),
            bucket_distribution_drift: Number(insight.bucket_distribution_drift ?? 0),
            junk_drift: Number(insight.junk_drift ?? 0),
            review_drift: Number(insight.review_drift ?? 0),
            explanation_drift: Number(insight.explanation_drift ?? 0),
            interestingness_score: Number(insight.interestingness_score ?? 0),
            summary_note: insight.summary_note || "",
            structural_drift_note: insight.structural_drift_note || null,
          }))
      : [],
    snapshots: Array.isArray(payload.snapshots)
      ? payload.snapshots
          .filter((snapshot) => snapshot?.snapshot_id && snapshot?.name)
          .map((snapshot) => ({
            snapshot_id: snapshot.snapshot_id,
            name: snapshot.name,
            note: snapshot.note || "",
            tags: Array.isArray(snapshot.tags) ? snapshot.tags.filter(Boolean) : [],
            created_at: snapshot.created_at || null,
            state: normalizeAnalysisStatePayload(snapshot.state || {}),
          }))
      : [],
  };
}

function applyNormalizedAnalysisState(payload) {
  state.watchTargets = payload.watch_targets.map((target) => ({
    watchKey: target.watch_key,
    datasetDisplayName: target.dataset_display_name,
    sortIntent: target.sort_intent,
  }));
  state.alertedExperimentIds = payload.alerted_experiment_ids.slice();
  state.persistedTrendSnapshots = (payload.trend_snapshots || []).map((trend) => ({
    watchKey: trend.watch_key,
    datasetDisplayName: trend.dataset_display_name,
    sortIntent: trend.sort_intent,
    latestExperimentId: trend.latest_experiment_id || null,
    latestInterestingness: trend.latest_interestingness,
    deltaScore: trend.delta_score,
    completeExperimentCount: trend.complete_experiment_count,
    regressionKind: trend.regression_kind || null,
    summaryNote: trend.summary_note || "",
    structuralDriftNote: trend.structural_drift_note || null,
  }));
  state.runReviewsByOutputDir = Object.fromEntries(
    payload.run_reviews.map((review) => [
      review.output_dir_name,
      {
        verdict: review.verdict,
        note: review.note,
        updatedAt: review.updated_at,
      },
    ])
  );
  state.experimentReviewsById = Object.fromEntries(
    payload.experiment_reviews.map((review) => [
      review.experiment_id,
      {
        verdict: review.verdict,
        note: review.note,
        updatedAt: review.updated_at,
      },
    ])
  );
  state.experimentInsightsById = Object.fromEntries(
    (payload.experiment_insights || []).map((insight) => [
      insight.experiment_id,
      {
        bucketNameDrift: insight.bucket_name_drift,
        projectionDrift: insight.projection_drift,
        bucketDistributionDrift: insight.bucket_distribution_drift,
        junkDrift: insight.junk_drift,
        reviewDrift: insight.review_drift,
        explanationDrift: insight.explanation_drift,
        interestingnessScore: insight.interestingness_score,
        summaryNote: insight.summary_note || "",
        structuralDriftNote: insight.structural_drift_note || null,
      },
    ])
  );
  state.analysisSnapshots = payload.snapshots.map((snapshot) => ({
    snapshotId: snapshot.snapshot_id,
    name: snapshot.name,
    note: snapshot.note || "",
    tags: snapshot.tags || [],
    createdAt: snapshot.created_at,
    state: snapshot.state,
  }));
}

async function persistAnalysisState() {
  try {
    await requestJson("/api/analysis-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildAnalysisStatePayload()),
    });
  } catch {}
}

function renderHealth(data) {
  const status = data.status || "unknown";
  const driver = String(status).includes(":") ? status.split(":")[1] : "unknown";
  els.healthPanel.innerHTML = `
    <div><dt>Status</dt><dd>${escapeHtml(status)}</dd></div>
    <div><dt>Driver</dt><dd>${escapeHtml(driver)}</dd></div>
    <div><dt>Inputs</dt><dd>${escapeHtml(data.input_datasets_dir)}</dd></div>
    <div><dt>Outputs</dt><dd>${escapeHtml(data.outputs_dir)}</dd></div>
  `;
}

function renderDatasetList(datasets) {
  state.datasets = datasets;
  state.selectedDatasetId = datasets[0]?.dataset_id ?? null;
  els.datasetSelect.innerHTML = datasets.length
    ? datasets
        .map(
          (dataset) =>
            `<option value="${escapeHtml(dataset.dataset_id)}">${escapeHtml(dataset.display_name)}</option>`
        )
        .join("")
    : `<option value="">No datasets found</option>`;
}

function renderDatasetPreview(data) {
  state.currentDatasetPreview = data;
  els.datasetMeta.innerHTML = `
    <span class="meta-pill">Dataset: ${escapeHtml(data.source.display_name)}</span>
    <span class="meta-pill">Items: ${escapeHtml(String(data.manifest.item_count))}</span>
    <span class="meta-pill">Sample: ${escapeHtml(String(data.manifest.sample_size))}</span>
    <span class="meta-pill">Kind: ${escapeHtml(data.source.source_kind)}</span>
    <span class="meta-pill">Format: ${escapeHtml(data.manifest.dataset_format || data.source.dataset_format || "unknown")}</span>
  `;
  els.datasetPreview.innerHTML = renderNormalizedDatasetSample(data.sample || []);
  els.datasetRawPreview.innerHTML = renderRawDatasetSample(data.raw_sample_rows || [], data.sample || []);
  renderDatasetProjectionControls(data);
}

function renderNormalizedDatasetSample(sample) {
  if (!Array.isArray(sample) || sample.length === 0) {
    return `<div class="dataset-empty">No normalized sample items were available for this dataset preview.</div>`;
  }

  return sample
    .map((item, index) => {
      const meta = [
        renderMetaPill(`Item ${index + 1}`),
        item?.item_id ? renderMetaPill(`ID: ${item.item_id}`) : "",
        item?.raw_record && typeof item.raw_record === "object"
          ? renderMetaPill(`${Object.keys(item.raw_record).length} raw fields`)
          : "",
      ]
        .filter(Boolean)
        .join("");

      const content = formatPreviewValue(item?.content);
      const rawRecordFields =
        item?.raw_record && typeof item.raw_record === "object" && !Array.isArray(item.raw_record)
          ? renderFieldList(item.raw_record)
          : "";

      return `
        <article class="dataset-row-card">
          <div class="dataset-row-meta">${meta}</div>
          <div class="dataset-row-body">
            <p class="dataset-row-text">${escapeHtml(content)}</p>
            ${rawRecordFields}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderRawDatasetSample(rawSampleRows, fallbackSample) {
  if (Array.isArray(rawSampleRows) && rawSampleRows.length) {
    return rawSampleRows
      .map((row, index) => `
        <article class="dataset-row-card dataset-row-card--raw">
          <div class="dataset-row-meta">
            ${renderMetaPill(`Row ${index + 1}`)}
            ${renderMetaPill(`${countPreviewFields(row)} fields`)}
          </div>
          <div class="dataset-row-body">
            ${renderFieldList(row)}
          </div>
        </article>
      `)
      .join("");
  }

  if (Array.isArray(fallbackSample) && fallbackSample.some((item) => item?.raw_record)) {
    return fallbackSample
      .map((item, index) => `
        <article class="dataset-row-card dataset-row-card--raw">
          <div class="dataset-row-meta">
            ${renderMetaPill(`Row ${index + 1}`)}
            ${item?.item_id ? renderMetaPill(`ID: ${item.item_id}`) : ""}
          </div>
          <div class="dataset-row-body">
            ${
              item?.raw_record && typeof item.raw_record === "object"
                ? renderFieldList(item.raw_record)
                : `<div class="dataset-empty">No structured raw record was captured for this sample item.</div>`
            }
          </div>
        </article>
      `)
      .join("");
  }

  return `<div class="dataset-empty">Structured raw sample rows will appear here for Parquet datasets.</div>`;
}

function renderFieldList(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return `<div class="dataset-empty">${escapeHtml(formatPreviewValue(record))}</div>`;
  }

  const entries = Object.entries(record);
  if (!entries.length) {
    return `<div class="dataset-empty">This row has no visible fields.</div>`;
  }

  return `
    <div class="dataset-field-list">
      ${entries
        .map(
          ([key, value]) => `
            <div class="dataset-field">
              <div class="dataset-field-label">${escapeHtml(key)}</div>
              <p class="dataset-field-value">${escapeHtml(formatPreviewValue(value))}</p>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderMetaPill(text) {
  return `<span class="meta-pill">${escapeHtml(text)}</span>`;
}

function countPreviewFields(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return 1;
  }
  return Object.keys(record).length;
}

function formatPreviewValue(value) {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function resetRunSetupOutputs() {
  els.preflightSummary.className = "summary-panel muted";
  els.preflightSummary.textContent =
    "Run preflight to see whether the model thinks your requested bucket count is good, too low, or too high.";
  els.preflightJson.textContent = "";
  renderExplanation(null);
  renderBucketPlan(null);
  renderAssignmentSummary(null);
}

function renderDatasetProjectionControls(data) {
  const format = data.manifest?.dataset_format || data.source?.dataset_format;
  const columns = data.manifest?.schema_columns || [];
  const projection = data.manifest?.projection || null;
  if (format !== "parquet") {
    els.datasetProjectionControls.className = "summary-panel muted";
    els.datasetProjectionControls.innerHTML =
      "Projection controls activate for structured Parquet datasets. Text-native datasets already project directly into normalized items.";
    return;
  }

  const selected = new Set((projection?.selected_fields || []).map((field) => field.field_name));
  const idField = projection?.item_id_field || "";
  const renderMode = projection?.render_mode || "field_labeled_text";
  const rows = columns.length
    ? columns
        .map(
          (column) => `
            <label class="force-toggle">
              <span>${escapeHtml(column.name)} <small>${escapeHtml(column.logical_type || "")}</small></span>
              <input type="checkbox" data-projection-field="${escapeHtml(column.name)}" ${selected.has(column.name) ? "checked" : ""}>
            </label>
          `
        )
        .join("")
    : `<p class="muted">No schema columns detected.</p>`;

  els.datasetProjectionControls.className = "summary-panel";
  els.datasetProjectionControls.innerHTML = `
    <div class="section-heading">
      <p class="eyebrow">Projection</p>
      <h3>Parquet Row To Text View</h3>
    </div>
    <p class="muted">Choose which columns the model should see. This selection is sent with preflight, plan, and sort requests.</p>
    <div class="form-grid">
      <label>
        <span>ID Column</span>
        <select id="dataset-projection-id-field">
          <option value="">Implicit Row Index</option>
          ${columns
            .map(
              (column) =>
                `<option value="${escapeHtml(column.name)}" ${column.name === idField ? "selected" : ""}>${escapeHtml(column.name)}</option>`
            )
            .join("")}
        </select>
      </label>
      <label>
        <span>Render Mode</span>
        <select id="dataset-projection-render-mode">
          <option value="field_labeled_text" ${renderMode === "field_labeled_text" ? "selected" : ""}>Field Labeled Text</option>
          <option value="plain_text" ${renderMode === "plain_text" ? "selected" : ""}>Plain Text</option>
        </select>
      </label>
    </div>
    <div class="form-grid">
      ${rows}
    </div>
  `;

  for (const control of els.datasetProjectionControls.querySelectorAll("input, select")) {
    control.addEventListener("change", scheduleProjectionPreviewRefresh);
  }
}

function buildDatasetProjectionRequest() {
  const preview = state.currentDatasetPreview;
  const format = preview?.manifest?.dataset_format || preview?.source?.dataset_format;
  if (format !== "parquet") {
    return null;
  }

  const selectedFields = Array.from(
    els.datasetProjectionControls.querySelectorAll("input[data-projection-field]:checked")
  ).map((input) => ({
    field_name: input.getAttribute("data-projection-field"),
    display_label: null,
  }));
  const idFieldEl = document.getElementById("dataset-projection-id-field");
  const renderModeEl = document.getElementById("dataset-projection-render-mode");

  return {
    selected_fields: selectedFields,
    item_id_field: idFieldEl?.value || null,
    render_mode: renderModeEl?.value || "field_labeled_text",
  };
}

function stopPreviewRefreshTimer() {
  if (state.previewRefreshTimer) {
    clearTimeout(state.previewRefreshTimer);
    state.previewRefreshTimer = null;
  }
}

function scheduleProjectionPreviewRefresh() {
  stopPreviewRefreshTimer();
  state.previewRefreshTimer = setTimeout(async () => {
    try {
      await previewDataset(true);
    } catch (error) {
      els.datasetPreview.textContent = String(error);
    }
  }, 250);
}

function renderPreflight(data) {
  const verdict = data.preflight?.verdict ?? "unknown";
  els.preflightSummary.className = `summary-panel verdict verdict--${verdict}`;
  els.preflightSummary.innerHTML = `
    <strong>${escapeHtml(verdict)}</strong>
    <span>${escapeHtml(data.preflight.reasoning_summary)}</span>
  `;
  els.preflightJson.textContent = JSON.stringify(data, null, 2);
}

function renderExplanation(explanation) {
  if (!explanation) {
    els.explanationGrid.innerHTML = `<div class="placeholder">No explanation available yet. Generate a plan to unlock the model's human-facing reasoning.</div>`;
    return;
  }

  const blocks = [
    ["Bucket Genesis Mode", explanation.bucket_genesis_mode],
    ["Intent Interpretation", explanation.sorting_intent_interpretation],
    ["Bucket Shape Rationale", explanation.bucket_shape_rationale],
    ["Bucket Count Judgment", explanation.bucket_count_judgment],
    ["What The Buckets Mean", explanation.bucket_meanings],
    ["Signals Noticed", explanation.signals_noticed],
    ["Weak / Junk Signals", explanation.weak_or_junk_signals],
    ["Surprising Groupings", explanation.surprising_groupings],
    ["Zoom In Suggestions", explanation.zoom_in_suggestions],
    ["Caution Notes", explanation.caution_notes],
  ];

  els.explanationGrid.innerHTML = blocks
    .map(([title, value]) => {
      const content = Array.isArray(value)
        ? `<ul>${value.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : `<p>${escapeHtml(value ?? "")}</p>`;
      return `<article class="explanation-block"><h3>${escapeHtml(title)}</h3>${content}</article>`;
    })
    .join("");
}

function renderBucketPlan(plan) {
  if (!plan) {
    els.planMeta.innerHTML = "";
    els.bucketList.innerHTML = `<div class="placeholder">No frozen bucket plan yet. Generate a plan to define the bucket reality for this run.</div>`;
    return;
  }

  const mode = plan.explanation?.bucket_genesis_mode ?? "unknown";
  const anchorModeLabel =
    mode === "blind_label" ? "Blind semantic anchors" : "Dataset-derived anchors";
  const modeLabel = mode === "blind_label" ? "Blind Label" : "Data Skim";

  els.planMeta.innerHTML = `
    <span class="meta-pill ${mode === "blind_label" ? "meta-pill--warn" : ""}">Genesis Mode: ${escapeHtml(modeLabel)}</span>
    <span class="meta-pill">Positive Buckets: ${escapeHtml(String(plan.positive_bucket_count))}</span>
    <span class="meta-pill">Anchor Style: ${escapeHtml(anchorModeLabel)}</span>
    <span class="meta-pill">Model: ${escapeHtml(plan.model_id)}</span>
  `;

  const bucketCards = plan.buckets
    .map(
      (bucket) => `
        <article class="bucket-card">
          <p class="bucket-id">${escapeHtml(bucket.bucket_id)}</p>
          <h3>${escapeHtml(bucket.name)}</h3>
          <p>${escapeHtml(bucket.description)}</p>
          <p class="bucket-subtitle">Criteria</p>
          <ul>${bucket.criteria.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
          <p class="bucket-subtitle">${escapeHtml(anchorModeLabel)}</p>
          <ul>${bucket.anchor_examples.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </article>
      `
    )
    .join("");

  const junkCard = `
    <article class="bucket-card bucket-card--junk">
      <p class="bucket-id">${escapeHtml(plan.junk_bucket.bucket_id)}</p>
      <h3>${escapeHtml(plan.junk_bucket.name)}</h3>
      <p>${escapeHtml(plan.junk_bucket.description)}</p>
      <p class="bucket-subtitle">Junk Signals</p>
      <ul>${plan.junk_bucket.junk_reasons.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>
  `;

  els.bucketList.innerHTML = bucketCards + junkCard;
}

function renderAssignmentSummary(data) {
  if (!data) {
    els.assignmentSummary.className = "summary-panel muted";
    els.assignmentSummary.textContent = "Run a full sort to materialize bucket folders and item assignments.";
    els.sortJson.textContent = "";
    return;
  }

  const summary = data.assignment_summary;
  if (!summary) {
    els.assignmentSummary.className = "summary-panel muted";
    els.assignmentSummary.textContent = "No assignment summary is available yet.";
    els.sortJson.textContent = "";
    return;
  }

  const mode = data.bucket_plan?.explanation?.bucket_genesis_mode ?? "unknown";
  const blindMode = mode === "blind_label";
  const junkHeavy = summary.junk_count > 0;
  const reviewHeavy = summary.review_flag_count > 0;
  const cautionClass = blindMode || junkHeavy || reviewHeavy ? "summary-panel summary-panel--alert" : "summary-panel";

  els.assignmentSummary.className = "summary-panel";
  els.assignmentSummary.className = cautionClass;
  els.assignmentSummary.innerHTML = `
    <span class="meta-pill ${blindMode ? "meta-pill--warn" : ""}">Genesis Mode: ${escapeHtml(mode)}</span>
    <span class="meta-pill">Total Items: ${escapeHtml(String(summary.total_items))}</span>
    <span class="meta-pill ${junkHeavy ? "meta-pill--warn" : ""}">Junk: ${escapeHtml(String(summary.junk_count))}</span>
    <span class="meta-pill ${reviewHeavy ? "meta-pill--warn" : ""}">Review Flags: ${escapeHtml(String(summary.review_flag_count))}</span>
    <span class="meta-pill">Output: ${escapeHtml(data.output_dir)}</span>
  `;

  if (blindMode) {
    els.assignmentSummary.innerHTML += `
      <div class="summary-note">
        Blind-label mode locked the bucket ontology before data exposure. Pay extra attention to junk and review counts as a measure of fit resistance.
      </div>
    `;
  } else if (junkHeavy || reviewHeavy) {
    els.assignmentSummary.innerHTML += `
      <div class="summary-note">
        This run produced junk or review-heavy assignments. That usually means the current bucket shape or sort intent deserves a second look.
      </div>
    `;
  }

  els.sortJson.textContent = JSON.stringify(data, null, 2);
}

function renderJob(job) {
  if (!job) {
    els.jobSummary.className = "summary-panel muted";
    els.jobSummary.textContent = "Start a sort job to track long-running model work without blocking the dashboard.";
    els.jobJson.textContent = "No active sort job selected yet.";
    return;
  }

  const running = job.status === "running" || job.status === "queued";
  const cancellable = running && !job.cancel_requested;
  const warn = job.status === "failed" || job.status === "blocked" || job.status === "cancelled";
  const elapsedMs = getElapsedMs(job);
  const etaMs = estimateRemainingMs(job);
  const timeline = buildStageTimeline(job);
  const notes = (job.progress_notes || [])
    .slice(-6)
    .map(
      (note) => `
        <li>
          <strong>${escapeHtml(note.stage)}</strong>
          ${escapeHtml(String(note.progress_percent))}%:
          ${escapeHtml(note.message)}
        </li>
      `
    )
    .join("");
  els.jobSummary.className = warn
    ? "summary-panel summary-panel--alert"
    : running
      ? "summary-panel job-panel"
      : "summary-panel";
  els.jobSummary.innerHTML = `
    <span class="meta-pill ${running ? "meta-pill--warn" : ""}">Status: ${escapeHtml(job.status)}</span>
    <span class="meta-pill">Stage: ${escapeHtml(job.stage)}</span>
    <span class="meta-pill">Progress: ${escapeHtml(String(job.progress_percent ?? 0))}%</span>
    <span class="meta-pill">Elapsed: ${escapeHtml(formatDuration(elapsedMs))}</span>
    <span class="meta-pill">ETA: ${escapeHtml(formatEta(job, etaMs))}</span>
    <span class="meta-pill">Dataset: ${escapeHtml(job.dataset_display_name || job.dataset_id)}</span>
    <span class="meta-pill">Job: ${escapeHtml(job.job_id)}</span>
    ${job.cancel_requested ? `<span class="meta-pill meta-pill--warn">Cancel Requested</span>` : ""}
    <button id="job-load-form-btn" class="button button--ghost">Load To Form</button>
    ${cancellable ? `<button id="job-cancel-btn" class="button button--ghost">Cancel Job</button>` : ""}
    <div class="job-progress">
      <div class="job-progress__bar" style="width: ${Math.max(Math.min(job.progress_percent ?? 0, 100), 0)}%"></div>
    </div>
    <div class="summary-note">${escapeHtml(job.message || "No job message yet.")}</div>
    <div class="summary-note">Started: ${escapeHtml(formatTimestamp(job.started_at || job.created_at))}${job.finished_at ? ` | Finished: ${escapeHtml(formatTimestamp(job.finished_at))}` : ""}</div>
    <ul class="job-stage-list">${timeline}</ul>
    ${job.error_message ? `<div class="summary-note">${escapeHtml(job.error_message)}</div>` : ""}
    <ul class="job-note-list">${notes || "<li>No progress notes yet.</li>"}</ul>
  `;
  els.jobJson.textContent = JSON.stringify(job, null, 2);
  const cancelBtn = document.getElementById("job-cancel-btn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => cancelJob(job.job_id));
  }
  const loadFormBtn = document.getElementById("job-load-form-btn");
  if (loadFormBtn) {
    loadFormBtn.addEventListener("click", () => loadJobIntoForm(job));
  }
}

function renderJobHistory(jobs) {
  const filtered = jobs.filter((job) => {
    if (!state.showArchivedJobs && job.archived) return false;
    if (state.jobStatusFilter !== "all" && job.status !== state.jobStatusFilter) return false;
    if (state.jobDatasetFilter) {
      const haystack = `${job.dataset_display_name || ""} ${job.dataset_id || ""}`.toLowerCase();
      if (!haystack.includes(state.jobDatasetFilter.toLowerCase())) return false;
    }
    return true;
  });

  if (!filtered.length) {
    els.jobHistory.innerHTML = `<div class="placeholder">No jobs match the current filters.</div>`;
    return;
  }

  els.jobHistory.innerHTML = filtered
    .map((job) => {
      const running = job.status === "queued" || job.status === "running";
      const canArchive = !running;
      const archiveLabel = job.archived ? "Unarchive" : "Archive";
      const elapsedMs = getElapsedMs(job);
      const etaMs = estimateRemainingMs(job);
      return `
        <article class="run-card ${job.archived ? "run-card--archived" : ""}">
          <div class="run-card__header">
            <div>
              <p class="bucket-id">${escapeHtml(job.job_id)}</p>
              <h3>${escapeHtml(job.dataset_display_name || job.dataset_id)}</h3>
            </div>
            <div class="button-row button-row--tight">
              <button class="button button--ghost job-open-btn" data-job="${escapeHtml(job.job_id)}">Open</button>
              <button class="button button--ghost job-load-btn" data-job="${escapeHtml(job.job_id)}">Load To Form</button>
              ${running && !job.cancel_requested ? `<button class="button button--ghost job-cancel-inline-btn" data-job="${escapeHtml(job.job_id)}">Cancel</button>` : ""}
              ${canArchive ? `<button class="button button--ghost job-archive-btn" data-job="${escapeHtml(job.job_id)}">${escapeHtml(archiveLabel)}</button>` : ""}
              <button class="button button--ghost job-rerun-btn" data-job="${escapeHtml(job.job_id)}">Rerun</button>
            </div>
          </div>
          <div class="meta-strip">
            <span class="meta-pill ${running ? "meta-pill--warn" : ""}">${escapeHtml(job.status)}</span>
            <span class="meta-pill">${escapeHtml(job.stage)}</span>
            <span class="meta-pill">Progress: ${escapeHtml(String(job.progress_percent ?? 0))}%</span>
            <span class="meta-pill">Elapsed: ${escapeHtml(formatDuration(elapsedMs))}</span>
            <span class="meta-pill">ETA: ${escapeHtml(formatEta(job, etaMs))}</span>
            <span class="meta-pill">${escapeHtml(job.driver)}</span>
            ${job.archived ? `<span class="meta-pill">Archived</span>` : ""}
          </div>
          <p class="muted">${escapeHtml(job.message || "No job status message was recorded.")}</p>
          <p class="muted">Started ${escapeHtml(formatTimestamp(job.started_at || job.created_at))}</p>
        </article>
      `;
    })
    .join("");

  for (const button of document.querySelectorAll(".job-open-btn")) {
    button.addEventListener("click", () => loadJobDetail(button.dataset.job));
  }
  for (const button of document.querySelectorAll(".job-load-btn")) {
    button.addEventListener("click", () => hydrateFormFromJobId(button.dataset.job));
  }
  for (const button of document.querySelectorAll(".job-cancel-inline-btn")) {
    button.addEventListener("click", () => cancelJob(button.dataset.job));
  }
  for (const button of document.querySelectorAll(".job-archive-btn")) {
    button.addEventListener("click", () => toggleJobArchive(button.dataset.job));
  }
  for (const button of document.querySelectorAll(".job-rerun-btn")) {
    button.addEventListener("click", () => rerunJob(button.dataset.job));
  }
}

function renderRunHistory(runs) {
  state.runs = runs;
  renderWatchlist(runs);
  renderReviewInbox(runs);
  renderExperimentHistory(runs);
  renderCompareSelectors(runs);

  const filteredRuns = (runs || []).filter((run) => {
    if (state.runVerdictFilter === "all") return true;
    const verdict = state.runReviewsByOutputDir[run.output_dir_name]?.verdict || "unreviewed";
    return verdict === state.runVerdictFilter;
  });

  if (!filteredRuns.length) {
    const message = runs?.length
      ? "No runs match the current run verdict filter."
      : "No saved runs exist yet.";
    els.runHistory.innerHTML = `<div class="placeholder">${escapeHtml(message)}</div>`;
    return;
  }

  els.runHistory.innerHTML = filteredRuns
    .map((run) => {
      const mode = run.bucket_genesis_mode === "blind_label" ? "Blind Label" : "Data Skim";
      const intent = formatSortIntent(run.sort_intent);
      const experimentLabel = run.experiment_id ? `Experiment: ${run.experiment_id.slice(0, 8)}` : null;
      const review = state.runReviewsByOutputDir[run.output_dir_name] ?? null;
      return `
        <article class="run-card">
          <div class="run-card__header">
            <div>
              <p class="bucket-id">${escapeHtml(run.output_dir_name)}</p>
              <h3>${escapeHtml(run.dataset_display_name)}</h3>
            </div>
            <button class="button button--ghost run-open-btn" data-run="${escapeHtml(run.output_dir_name)}">Open</button>
          </div>
          <div class="meta-strip">
            <span class="meta-pill">${escapeHtml(intent)}</span>
            <span class="meta-pill ${run.bucket_genesis_mode === "blind_label" ? "meta-pill--warn" : ""}">${escapeHtml(mode)}</span>
            <span class="meta-pill">Buckets: ${escapeHtml(String(run.requested_positive_bucket_count))}</span>
            <span class="meta-pill">Items: ${escapeHtml(String(run.total_items ?? 0))}</span>
            <span class="meta-pill ${run.junk_count ? "meta-pill--warn" : ""}">Junk: ${escapeHtml(String(run.junk_count ?? 0))}</span>
            <span class="meta-pill ${run.review_flag_count ? "meta-pill--warn" : ""}">Review: ${escapeHtml(String(run.review_flag_count ?? 0))}</span>
            ${experimentLabel ? `<span class="meta-pill">${escapeHtml(experimentLabel)}</span>` : ""}
            ${review && review.verdict !== "unreviewed" ? `<span class="meta-pill meta-pill--warn">Analyst: ${escapeHtml(humanizeMetric(review.verdict))}</span>` : ""}
          </div>
          ${review?.note ? `<p class="muted">${escapeHtml(review.note)}</p>` : ""}
        </article>
      `;
    })
    .join("");

  for (const button of document.querySelectorAll(".run-open-btn")) {
    button.addEventListener("click", () => loadRunDetail(button.dataset.run));
  }
}

function renderReviewInbox(runs) {
  const allReviewEntries = [
    ...Object.values(state.runReviewsByOutputDir).map((review) => ({ kind: "run", review })),
    ...Object.values(state.experimentReviewsById).map((review) => ({ kind: "experiment", review })),
  ];
  const reviewedRuns = (runs || [])
    .map((run) => ({
      kind: "run",
      run,
      review: state.runReviewsByOutputDir[run.output_dir_name] ?? null,
      updatedAt: state.runReviewsByOutputDir[run.output_dir_name]?.updatedAt ?? null,
    }))
    .filter((entry) => entry.review && entry.review.verdict === "needs_followup");

  const experiments = summarizeExperiments(runs);
  const reviewedExperiments = experiments
    .map((experiment) => ({
      kind: "experiment",
      experiment,
      review: state.experimentReviewsById[experiment.experimentId] ?? null,
      updatedAt: state.experimentReviewsById[experiment.experimentId]?.updatedAt ?? null,
    }))
    .filter((entry) => entry.review && entry.review.verdict === "needs_followup");

  const inbox = [...reviewedRuns, ...reviewedExperiments].sort((left, right) => {
    return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
  });

  const runVerdictCounts = buildReviewVerdictCounts(Object.values(state.runReviewsByOutputDir));
  const experimentVerdictCounts = buildReviewVerdictCounts(Object.values(state.experimentReviewsById));
  const recent7DayReviews = countRecentReviews(
    allReviewEntries,
    7
  );
  const recent30DayReviews = countRecentReviews(
    allReviewEntries,
    30
  );
  renderReviewTimeline(allReviewEntries);

  if (!inbox.length) {
    els.reviewInboxSummary.className = "summary-panel";
    els.reviewInboxSummary.innerHTML = `
      <span class="meta-pill">Run Useful: ${escapeHtml(String(runVerdictCounts.useful))}</span>
      <span class="meta-pill">Run Surprising: ${escapeHtml(String(runVerdictCounts.surprising))}</span>
      <span class="meta-pill meta-pill--warn">Run Needs Follow-Up: ${escapeHtml(String(runVerdictCounts.needs_followup))}</span>
      <span class="meta-pill">Run Misleading: ${escapeHtml(String(runVerdictCounts.misleading))}</span>
      <span class="meta-pill">Experiment Useful: ${escapeHtml(String(experimentVerdictCounts.useful))}</span>
      <span class="meta-pill">Experiment Surprising: ${escapeHtml(String(experimentVerdictCounts.surprising))}</span>
      <span class="meta-pill meta-pill--warn">Experiment Needs Follow-Up: ${escapeHtml(String(experimentVerdictCounts.needs_followup))}</span>
      <span class="meta-pill">Experiment Misleading: ${escapeHtml(String(experimentVerdictCounts.misleading))}</span>
      <span class="meta-pill">Reviewed 7d: ${escapeHtml(String(recent7DayReviews))}</span>
      <span class="meta-pill">Reviewed 30d: ${escapeHtml(String(recent30DayReviews))}</span>
    `;
    els.reviewInboxHistory.innerHTML = `<div class="placeholder">No follow-up items are queued right now.</div>`;
    return;
  }

  els.reviewInboxSummary.className = "summary-panel";
  els.reviewInboxSummary.innerHTML = `
    <span class="meta-pill meta-pill--warn">Needs Follow-Up: ${escapeHtml(String(inbox.length))}</span>
    <span class="meta-pill">Runs: ${escapeHtml(String(reviewedRuns.length))}</span>
    <span class="meta-pill">Experiments: ${escapeHtml(String(reviewedExperiments.length))}</span>
    <span class="meta-pill">Run Useful: ${escapeHtml(String(runVerdictCounts.useful))}</span>
    <span class="meta-pill">Run Surprising: ${escapeHtml(String(runVerdictCounts.surprising))}</span>
    <span class="meta-pill meta-pill--warn">Run Needs Follow-Up: ${escapeHtml(String(runVerdictCounts.needs_followup))}</span>
    <span class="meta-pill">Run Misleading: ${escapeHtml(String(runVerdictCounts.misleading))}</span>
    <span class="meta-pill">Experiment Useful: ${escapeHtml(String(experimentVerdictCounts.useful))}</span>
    <span class="meta-pill">Experiment Surprising: ${escapeHtml(String(experimentVerdictCounts.surprising))}</span>
    <span class="meta-pill meta-pill--warn">Experiment Needs Follow-Up: ${escapeHtml(String(experimentVerdictCounts.needs_followup))}</span>
    <span class="meta-pill">Experiment Misleading: ${escapeHtml(String(experimentVerdictCounts.misleading))}</span>
    <span class="meta-pill">Reviewed 7d: ${escapeHtml(String(recent7DayReviews))}</span>
    <span class="meta-pill">Reviewed 30d: ${escapeHtml(String(recent30DayReviews))}</span>
  `;

  els.reviewInboxHistory.innerHTML = inbox
    .map((entry) => {
      if (entry.kind === "run") {
        const run = entry.run;
        return `
          <article class="run-card">
            <div class="run-card__header">
              <div>
                <p class="bucket-id">Run Follow-Up</p>
                <h3>${escapeHtml(run.dataset_display_name)}</h3>
              </div>
              <div class="button-row button-row--tight">
                <button class="button button--ghost review-inbox-open-run-btn" data-run="${escapeHtml(run.output_dir_name)}">Open Run</button>
                <button class="button button--ghost review-inbox-apply-run-btn" data-run="${escapeHtml(run.output_dir_name)}">Apply Review</button>
              </div>
            </div>
            <div class="meta-strip">
              <span class="meta-pill">${escapeHtml(formatSortIntent(run.sort_intent))}</span>
              <span class="meta-pill meta-pill--warn">Needs Followup</span>
              <span class="meta-pill">Updated ${escapeHtml(formatTimestamp(entry.updatedAt))}</span>
            </div>
            <p class="muted">${escapeHtml(entry.review.note || "No note recorded.")}</p>
          </article>
        `;
      }

      const experiment = entry.experiment;
      return `
        <article class="run-card">
          <div class="run-card__header">
            <div>
              <p class="bucket-id">Experiment Follow-Up</p>
              <h3>${escapeHtml(experiment.datasetDisplayName)}</h3>
            </div>
            <div class="button-row button-row--tight">
              <button class="button button--ghost review-inbox-open-experiment-btn" data-experiment="${escapeHtml(experiment.experimentId)}">Open Report</button>
              <button class="button button--ghost review-inbox-apply-experiment-btn" data-experiment="${escapeHtml(experiment.experimentId)}">Apply Review</button>
            </div>
          </div>
          <div class="meta-strip">
            <span class="meta-pill">${escapeHtml(formatSortIntent(experiment.sortIntent))}</span>
            <span class="meta-pill">Experiment ${escapeHtml(experiment.experimentId.slice(0, 8))}</span>
            <span class="meta-pill meta-pill--warn">Needs Followup</span>
            <span class="meta-pill">Updated ${escapeHtml(formatTimestamp(entry.updatedAt))}</span>
          </div>
          <p class="muted">${escapeHtml(entry.review.note || "No note recorded.")}</p>
        </article>
      `;
    })
    .join("");

  for (const button of document.querySelectorAll(".review-inbox-open-run-btn")) {
    button.addEventListener("click", () => loadRunDetail(button.dataset.run));
  }
  for (const button of document.querySelectorAll(".review-inbox-apply-run-btn")) {
    button.addEventListener("click", async () => {
      await loadRunDetail(button.dataset.run);
      await applyCurrentRunReviewAsNextRun();
    });
  }
  for (const button of document.querySelectorAll(".review-inbox-open-experiment-btn")) {
    button.addEventListener("click", () => openExperimentReport(button.dataset.experiment));
  }
  for (const button of document.querySelectorAll(".review-inbox-apply-experiment-btn")) {
    button.addEventListener("click", async () => {
      await openExperimentReport(button.dataset.experiment);
      await applyCurrentExperimentReviewAsNextRun();
    });
  }
}

function buildReviewVerdictCounts(reviews) {
  const counts = {
    useful: 0,
    surprising: 0,
    needs_followup: 0,
    misleading: 0,
  };

  for (const review of reviews || []) {
    if (!review || review.verdict === "unreviewed" || !(review.verdict in counts)) continue;
    counts[review.verdict] += 1;
  }

  return counts;
}

function countRecentReviews(reviews, days) {
  const now = Date.now();
  const windowMs = days * 24 * 60 * 60 * 1000;
  return (reviews || []).filter((review) => {
    const item = review?.review ?? review;
    if (!item?.updatedAt) return false;
    const timestamp = new Date(item.updatedAt).getTime();
    return Number.isFinite(timestamp) && now - timestamp <= windowMs;
  }).length;
}

function renderReviewTimeline(reviews) {
  const filteredReviews = (reviews || []).filter((entry) => {
    if (state.reviewTimelineFilter === "runs") return entry.kind === "run";
    if (state.reviewTimelineFilter === "experiments") return entry.kind === "experiment";
    return true;
  });
  const timeline = buildReviewTimeline(filteredReviews, 14);
  if (!timeline.length || timeline.every((day) => day.total === 0)) {
    els.reviewInboxTimeline.className = "summary-panel muted";
    els.reviewInboxTimeline.textContent = "Review activity over time will appear here once reviews have been saved.";
    return;
  }

  const peak = Math.max(...timeline.map((day) => day.total), 1);
  const verdictOrder = [
    ["useful", "Useful"],
    ["surprising", "Surprising"],
    ["needs_followup", "Needs Follow-Up"],
    ["misleading", "Misleading"],
  ];
  const bars = timeline
    .map((day) => {
      const height = Math.max((day.total / peak) * 54, day.total > 0 ? 10 : 4);
      const title = [
        `${day.label}: ${day.total} review${day.total === 1 ? "" : "s"}`,
        `Useful ${day.verdicts.useful}`,
        `Surprising ${day.verdicts.surprising}`,
        `Needs Follow-Up ${day.verdicts.needs_followup}`,
        `Misleading ${day.verdicts.misleading}`,
      ].join(" | ");
      const segments =
        day.total > 0
          ? verdictOrder
              .filter(([key]) => day.verdicts[key] > 0)
              .map(([key]) => {
                const ratio = day.verdicts[key] / day.total;
                const segmentHeight = Math.max(height * ratio, 6);
                return `<span class="review-timeline__segment review-timeline__segment--${escapeHtml(
                  key
                )}" style="height: ${segmentHeight}px"></span>`;
              })
              .join("")
          : `<span class="review-timeline__segment review-timeline__segment--empty" style="height: 4px"></span>`;
      return `
        <div class="review-timeline__day">
          <span class="review-timeline__bar" title="${escapeHtml(title)}">${segments}</span>
          <span class="review-timeline__label">${escapeHtml(day.shortLabel)}</span>
        </div>
      `;
    })
    .join("");

  const total = timeline.reduce((sum, day) => sum + day.total, 0);
  const activeDays = timeline.filter((day) => day.total > 0).length;
  const scopeLabel =
    state.reviewTimelineFilter === "runs"
      ? "Runs Only"
      : state.reviewTimelineFilter === "experiments"
        ? "Experiments Only"
        : "Runs + Experiments";
  els.reviewInboxTimeline.className = "summary-panel";
  els.reviewInboxTimeline.innerHTML = `
    <div class="review-timeline">
      <div class="review-timeline__meta">
        <span class="meta-pill">${escapeHtml(scopeLabel)}</span>
        <span class="meta-pill">Last 14d Reviews: ${escapeHtml(String(total))}</span>
        <span class="meta-pill">Active Days: ${escapeHtml(String(activeDays))}</span>
        <span class="meta-pill">Peak Day: ${escapeHtml(String(peak))}</span>
      </div>
      <div class="review-timeline__legend">
        <span class="review-timeline__legend-item"><span class="review-timeline__legend-swatch review-timeline__legend-swatch--useful"></span>Useful</span>
        <span class="review-timeline__legend-item"><span class="review-timeline__legend-swatch review-timeline__legend-swatch--surprising"></span>Surprising</span>
        <span class="review-timeline__legend-item"><span class="review-timeline__legend-swatch review-timeline__legend-swatch--needs_followup"></span>Needs Follow-Up</span>
        <span class="review-timeline__legend-item"><span class="review-timeline__legend-swatch review-timeline__legend-swatch--misleading"></span>Misleading</span>
      </div>
      <div class="review-timeline__bars">
        ${bars}
      </div>
    </div>
  `;
}

function buildReviewTimeline(reviews, days) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const timeline = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - index));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      shortLabel: date.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }),
      total: 0,
      verdicts: {
        useful: 0,
        surprising: 0,
        needs_followup: 0,
        misleading: 0,
      },
    };
  });

  const byKey = Object.fromEntries(timeline.map((day) => [day.key, day]));
  for (const review of reviews || []) {
    const item = review?.review ?? review;
    if (!item?.updatedAt || item.verdict === "unreviewed") continue;
    const timestamp = new Date(item.updatedAt);
    if (!Number.isFinite(timestamp.getTime())) continue;
    const key = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate())
      .toISOString()
      .slice(0, 10);
    const day = byKey[key];
    if (!day) continue;
    day.total += 1;
    if (item.verdict in day.verdicts) {
      day.verdicts[item.verdict] += 1;
    }
  }

  return timeline;
}

function renderWatchlist(runs) {
  const persistedTrendByWatchKey = new Map(
    state.persistedTrendSnapshots.map((trend) => [trend.watchKey, trend])
  );
  const trends = buildWatchTrends(runs).map((trend) => {
    const persisted = persistedTrendByWatchKey.get(trend.watchKey);
    if (!persisted) return trend;
    return {
      ...trend,
      latestInsight:
        trend.latestInsight ??
        (persisted.latestInterestingness == null
          ? null
          : { interestingnessScore: persisted.latestInterestingness }),
      deltaScore: trend.deltaScore ?? persisted.deltaScore ?? null,
      completeExperimentCount: Math.max(
        trend.completeExperimentCount,
        persisted.completeExperimentCount || 0
      ),
      regression:
        trend.regression ??
        (persisted.regressionKind
          ? { kind: persisted.regressionKind, severity: "persisted" }
          : null),
      scoreSeries:
        trend.scoreSeries.length || persisted.latestInterestingness == null
          ? trend.scoreSeries
          : [persisted.latestInterestingness],
      structuralDriftNote:
        trend.structuralDriftNote ?? persisted.structuralDriftNote ?? null,
      summaryNote:
        trend.latestExperiment || trend.latestInsight
          ? trend.summaryNote
          : persisted.summaryNote || trend.summaryNote,
    };
  });
  if (!state.watchTargets.length) {
    els.watchlistSummaryNote.className = "summary-panel muted";
    els.watchlistSummaryNote.textContent =
      "Watch dataset and intent targets to track interestingness shifts across matched experiments over time.";
    els.watchlistHistory.innerHTML = `<div class="placeholder">No watch targets yet. Add one from the run setup panel to start tracking trend drift.</div>`;
    return;
  }

  const activeTrends = trends.filter((trend) => trend.latestExperiment || trend.latestInsight);
  els.watchlistSummaryNote.className = "summary-panel";
  els.watchlistSummaryNote.innerHTML = `
    <span class="meta-pill">Watched Targets: ${escapeHtml(String(state.watchTargets.length))}</span>
    <span class="meta-pill ${activeTrends.some((trend) => trend.deltaScore > 0) ? "meta-pill--warn" : ""}">Rising Targets: ${escapeHtml(String(activeTrends.filter((trend) => trend.deltaScore > 0).length))}</span>
    <span class="meta-pill">Stable Targets: ${escapeHtml(String(activeTrends.filter((trend) => trend.deltaScore === 0).length))}</span>
  `;

  els.watchlistHistory.innerHTML = trends
    .map((trend) => {
      const latestScore = trend.latestInsight ? String(trend.latestInsight.interestingnessScore) : "n/a";
      const delta = trend.deltaScore == null ? "n/a" : `${trend.deltaScore > 0 ? "+" : ""}${trend.deltaScore}`;
      const direction = trend.deltaScore == null ? "no history" : trend.deltaScore > 0 ? "rising" : trend.deltaScore < 0 ? "cooling" : "flat";
      const sparkline = renderTrendSparkline(trend.scoreSeries);
      const regressionLabel = trend.regression
        ? `${trend.regression.kind.replaceAll("_", " ")} (${trend.regression.severity})`
        : "none";
      const recommendation = trend.recommendation
        ? `Next move: ${trend.recommendation.recipeId.replaceAll("_", " ")} | buckets ${trend.recommendation.bucketCount}. ${trend.recommendation.rationale}`
        : "No recommendation yet.";
      return `
        <article class="run-card">
          <div class="run-card__header">
            <div>
              <p class="bucket-id">${escapeHtml(formatSortIntent(trend.sortIntent))}</p>
              <h3>${escapeHtml(trend.datasetDisplayName)}</h3>
            </div>
            <div class="button-row button-row--tight">
              <button class="button button--ghost watch-focus-btn" data-dataset="${escapeHtml(trend.datasetDisplayName)}">Focus</button>
              ${trend.latestExperiment ? `<button class="button button--ghost watch-open-report-btn" data-experiment="${escapeHtml(trend.latestExperiment.experimentId)}">Open Latest</button>` : ""}
              <button class="button button--ghost watch-remove-btn" data-watch="${escapeHtml(trend.watchKey)}">Remove</button>
            </div>
          </div>
          <div class="meta-strip">
            <span class="meta-pill ${Number(trend.latestInsight?.interestingnessScore ?? 0) >= 5 ? "meta-pill--warn" : ""}">Interestingness: ${escapeHtml(latestScore)}</span>
            <span class="meta-pill ${trend.deltaScore > 0 ? "meta-pill--warn" : ""}">Delta: ${escapeHtml(delta)}</span>
            <span class="meta-pill">${escapeHtml(direction)}</span>
            <span class="meta-pill">Complete Pairs: ${escapeHtml(String(trend.completeExperimentCount))}</span>
            <span class="meta-pill ${trend.regression ? "meta-pill--warn" : ""}">Regression: ${escapeHtml(regressionLabel)}</span>
          </div>
          <div class="watch-sparkline">
            ${sparkline}
          </div>
          <p class="muted">${escapeHtml(trend.summaryNote)}</p>
          ${trend.structuralDriftNote ? `<p class="muted">${escapeHtml(trend.structuralDriftNote)}</p>` : ""}
          <p class="muted">${escapeHtml(recommendation)}</p>
        </article>
      `;
    })
    .join("");

  for (const button of document.querySelectorAll(".watch-focus-btn")) {
    button.addEventListener("click", () => {
      state.experimentDatasetFilter = button.dataset.dataset;
      els.experimentDatasetFilter.value = button.dataset.dataset;
      saveUiState();
      renderExperimentHistory(state.runs);
    });
  }
  for (const button of document.querySelectorAll(".watch-open-report-btn")) {
    button.addEventListener("click", () => openExperimentReport(button.dataset.experiment));
  }
  for (const button of document.querySelectorAll(".watch-remove-btn")) {
    button.addEventListener("click", () => removeWatchTarget(button.dataset.watch));
  }
}

function renderExperimentHistory(runs) {
  const experiments = summarizeExperiments(runs);
  const filtered = experiments
    .filter((experiment) => {
      if (state.experimentStatusFilter === "complete" && !experiment.hasBothModes) return false;
      if (state.experimentStatusFilter === "partial" && experiment.hasBothModes) return false;
      if (state.experimentDatasetFilter) {
        return experiment.datasetDisplayName
          .toLowerCase()
          .includes(state.experimentDatasetFilter.toLowerCase());
      }
      const insight = state.experimentInsightsById[experiment.experimentId] ?? null;
      if ((insight?.interestingnessScore ?? 0) < state.experimentInterestingnessThreshold) {
        return false;
      }
      if (!matchesExperimentPreset(experiment, insight)) {
        return false;
      }
      if (state.experimentVerdictFilter !== "all") {
        const verdict =
          state.experimentReviewsById[experiment.experimentId]?.verdict || "unreviewed";
        if (verdict !== state.experimentVerdictFilter) {
          return false;
        }
      }
      return true;
    })
    .sort((left, right) => compareExperiments(left, right));

  if (!filtered.length) {
    els.experimentSummaryNote.className = "summary-panel muted";
    els.experimentSummaryNote.textContent =
      experiments.length
        ? "No experiments match the current experiment filters."
        : "Matched runs let you track Data Skim and Blind Label as one experiment with shared identity and drift metrics.";
    els.experimentHistory.innerHTML = `<div class="placeholder">No matched experiments detected yet. Run a blind-vs-skim pair on the same target to create one.</div>`;
    return;
  }

  const completeCount = filtered.filter((experiment) => experiment.hasBothModes).length;
  els.experimentSummaryNote.className = "summary-panel";
  els.experimentSummaryNote.innerHTML = `
    <span class="meta-pill">Experiments: ${escapeHtml(String(filtered.length))}</span>
    <span class="meta-pill ${completeCount !== filtered.length ? "meta-pill--warn" : ""}">Complete Pairs: ${escapeHtml(String(completeCount))}/${escapeHtml(String(filtered.length))}</span>
    <span class="meta-pill">Preset: ${escapeHtml(humanizeMetric(state.experimentPreset))}</span>
    <span class="meta-pill">Best Drift Read: compare pairs with matched dataset, intent, and bucket count.</span>
  `;

  els.experimentHistory.innerHTML = filtered
    .map((experiment) => {
      const insight = state.experimentInsightsById[experiment.experimentId] ?? null;
      const skim = experiment.dataSkimRun;
      const blind = experiment.blindLabelRun;
      const pairStatus = experiment.hasBothModes ? "complete pair" : "partial pair";
      const bucketDrift = insight ? String(insight.bucketNameDrift) : experiment.hasBothModes ? "calculating" : "n/a";
      const junkDrift = insight ? String(insight.junkDrift) : experiment.hasBothModes ? "calculating" : "n/a";
      const reviewDrift = insight ? String(insight.reviewDrift) : experiment.hasBothModes ? "calculating" : "n/a";
      const projectionDrift = insight ? String(insight.projectionDrift) : experiment.hasBothModes ? "calculating" : "n/a";
      const distributionDrift = insight ? String(insight.bucketDistributionDrift) : experiment.hasBothModes ? "calculating" : "n/a";
      const explanationDrift = insight ? String(insight.explanationDrift) : experiment.hasBothModes ? "calculating" : "n/a";
      const interestingness = insight ? String(insight.interestingnessScore) : experiment.hasBothModes ? "calculating" : "n/a";
      const review = state.experimentReviewsById[experiment.experimentId] ?? null;
      return `
        <article class="run-card experiment-card ${experiment.hasBothModes ? "" : "run-card--archived"}">
          <div class="run-card__header">
            <div>
              <p class="bucket-id">Experiment ${escapeHtml(experiment.experimentId.slice(0, 8))}</p>
              <h3>${escapeHtml(experiment.datasetDisplayName)}</h3>
            </div>
            <div class="button-row button-row--tight">
              ${skim ? `<button class="button button--ghost experiment-open-run-btn" data-run="${escapeHtml(skim.output_dir_name)}">Open Skim</button>` : ""}
              ${blind ? `<button class="button button--ghost experiment-open-run-btn" data-run="${escapeHtml(blind.output_dir_name)}">Open Blind</button>` : ""}
              <button class="button button--ghost experiment-report-btn" data-experiment="${escapeHtml(experiment.experimentId)}">Open Report</button>
              ${experiment.hasBothModes ? `<button class="button button--ghost experiment-compare-btn" data-experiment="${escapeHtml(experiment.experimentId)}">Compare Pair</button>` : ""}
            </div>
          </div>
          <div class="meta-strip">
            <span class="meta-pill">${escapeHtml(formatSortIntent(experiment.sortIntent))}</span>
            <span class="meta-pill">Buckets: ${escapeHtml(String(experiment.requestedPositiveBucketCount))}</span>
            <span class="meta-pill ${experiment.hasBothModes ? "" : "meta-pill--warn"}">${escapeHtml(pairStatus)}</span>
            <span class="meta-pill ${Number(insight?.interestingnessScore ?? 0) >= 5 ? "meta-pill--warn" : ""}">Interestingness: ${escapeHtml(interestingness)}</span>
            <span class="meta-pill ${insight?.bucketNameDrift ? "meta-pill--warn" : ""}">Bucket Drift: ${escapeHtml(bucketDrift)}</span>
            <span class="meta-pill ${insight?.projectionDrift ? "meta-pill--warn" : ""}">Projection Drift: ${escapeHtml(projectionDrift)}</span>
            <span class="meta-pill ${insight?.bucketDistributionDrift ? "meta-pill--warn" : ""}">Distribution Drift: ${escapeHtml(distributionDrift)}</span>
            <span class="meta-pill ${insight?.junkDrift ? "meta-pill--warn" : ""}">Junk Drift: ${escapeHtml(junkDrift)}</span>
            <span class="meta-pill ${insight?.reviewDrift ? "meta-pill--warn" : ""}">Review Drift: ${escapeHtml(reviewDrift)}</span>
            <span class="meta-pill ${insight?.explanationDrift ? "meta-pill--warn" : ""}">Explanation Drift: ${escapeHtml(explanationDrift)}</span>
            ${review && review.verdict !== "unreviewed" ? `<span class="meta-pill meta-pill--warn">Analyst: ${escapeHtml(humanizeMetric(review.verdict))}</span>` : ""}
          </div>
          <p class="muted">${escapeHtml(insight?.summaryNote ?? experiment.summaryNote)}</p>
          ${review?.note ? `<p class="muted">${escapeHtml(review.note)}</p>` : ""}
        </article>
      `;
    })
    .join("");

  for (const button of document.querySelectorAll(".experiment-open-run-btn")) {
    button.addEventListener("click", () => loadRunDetail(button.dataset.run));
  }
  for (const button of document.querySelectorAll(".experiment-report-btn")) {
    button.addEventListener("click", () => openExperimentReport(button.dataset.experiment));
  }
  for (const button of document.querySelectorAll(".experiment-compare-btn")) {
    button.addEventListener("click", () => compareExperimentPair(button.dataset.experiment));
  }
}

function renderRunDetail(detail) {
  if (!detail) {
    state.activeRunOutputDir = null;
    state.currentRunArtifact = null;
    els.runDetailMeta.innerHTML = "";
    els.runDetailArtifacts.className = "summary-panel muted";
    els.runDetailArtifacts.textContent = "Open a saved run to inspect its saved artifacts and export surfaces.";
    els.runDetailSummary.textContent = "Open a saved run to read its human-facing summary.";
    els.runDetailEvidence.className = "run-evidence-panel muted";
    els.runDetailEvidence.textContent =
      "Open a saved run to compare its narrative summary against the underlying bucket-plan evidence.";
    els.runDetailBucketExports.innerHTML =
      '<div class="placeholder">Open a saved run to browse bucket export folders and downloadable files.</div>';
    els.runDetailCurrentArtifact.textContent = "Current artifact view: raw run detail";
    els.runReviewVerdict.value = "unreviewed";
    els.runReviewNote.value = "";
    els.runReviewStatus.textContent = "No analyst run review saved yet.";
    els.runDetailJson.textContent = "Open a saved run to inspect its stored artifacts.";
    return;
  }

  state.activeRunOutputDir = detail.history.output_dir_name;
  const mode = detail.history.bucket_genesis_mode === "blind_label" ? "Blind Label" : "Data Skim";
  const manifest = detail.run_manifest ?? null;
  els.runDetailMeta.innerHTML = `
    <span class="meta-pill">${escapeHtml(detail.history.dataset_display_name)}</span>
    <span class="meta-pill ${detail.history.bucket_genesis_mode === "blind_label" ? "meta-pill--warn" : ""}">${escapeHtml(mode)}</span>
    <span class="meta-pill">Buckets: ${escapeHtml(String(detail.history.requested_positive_bucket_count))}</span>
    ${detail.history.experiment_id ? `<span class="meta-pill">Experiment: ${escapeHtml(detail.history.experiment_id.slice(0, 8))}</span>` : ""}
    <span class="meta-pill">Run: ${escapeHtml(detail.history.output_dir_name)}</span>
  `;
  if (manifest) {
    const artifactLines = [
      ["Kind", manifest.kind, null],
      ["Run Config", manifest.artifacts?.run_config ?? "run_config.json", "run_config"],
      ["Preflight", manifest.artifacts?.preflight ?? "preflight.json", "preflight"],
      ["Bucket Plan", manifest.artifacts?.bucket_plan ?? "bucket_plan.json", "bucket_plan"],
      ["Dataset Projection", manifest.artifacts?.dataset_projection ?? "not present", manifest.artifacts?.dataset_projection ? "dataset_projection" : null],
      ["Assignment Summary", manifest.artifacts?.assignment_summary ?? "not present", manifest.artifacts?.assignment_summary ? "assignment_summary" : null],
      ["Assignments", manifest.artifacts?.assignments_jsonl ?? "not present", manifest.artifacts?.assignments_jsonl ? "assignments" : null],
      ["Bucket Exports", manifest.artifacts?.bucket_exports_dir ?? "not present", null],
      ["Run Manifest", "run_manifest.json", "run_manifest"],
      ["Human Summary", manifest.artifacts?.human_summary_markdown ?? "run_summary.md", "run_summary"],
    ];
    els.runDetailArtifacts.className = "summary-panel";
    els.runDetailArtifacts.innerHTML = artifactLines
      .map(
        ([label, value, artifactKey]) =>
          artifactKey
            ? `<button class="button button--ghost artifact-chip" data-run="${escapeHtml(detail.history.output_dir_name)}" data-artifact="${escapeHtml(artifactKey)}"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}</button>`
            : `<span class="meta-pill"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(String(value))}</span>`
      )
      .join("");
  } else {
    els.runDetailArtifacts.className = "summary-panel muted";
    els.runDetailArtifacts.textContent =
      "This legacy run does not have a first-class run manifest yet, but its core artifacts are still available below.";
  }
  els.runDetailSummary.textContent =
    detail.run_summary_markdown?.trim() ||
    "No human-facing run summary is available for this saved run yet.";
  renderRunEvidence(detail);
  renderRunBucketExportsPlaceholder(detail);
  renderRunReview(detail.history.output_dir_name);
  setCurrentRunArtifact(
    "run_detail",
    `${detail.history.output_dir_name}-run-detail.json`,
    JSON.stringify(detail, null, 2)
  );

  for (const button of document.querySelectorAll(".artifact-chip")) {
    button.addEventListener("click", () =>
      loadRunArtifact(button.dataset.run, button.dataset.artifact)
    );
  }
}

function renderRunBucketExportsPlaceholder(detail) {
  const hasExports = Boolean(detail?.run_manifest?.artifacts?.bucket_exports_dir);
  els.runDetailBucketExports.innerHTML = hasExports
    ? '<div class="placeholder">Loading bucket export folders...</div>'
    : '<div class="placeholder">This run does not have bucket export folders to browse.</div>';
}

function renderRunBucketExports(outputDirName, detail, payload) {
  if (state.activeRunOutputDir !== outputDirName) return;

  const buckets = payload?.buckets || [];
  if (!buckets.length) {
    els.runDetailBucketExports.innerHTML =
      '<div class="placeholder">No bucket export folders were found for this run.</div>';
    return;
  }

  const countMap = new Map(
    (detail?.assignment_summary?.bucket_counts || []).map((entry) => [String(entry.bucket_id || "").toUpperCase(), entry.count])
  );
  const junkCount = detail?.assignment_summary?.junk_count ?? null;
  const isParquetRun = (detail?.run_manifest?.dataset?.dataset_format || "").toLowerCase() === "parquet";

  const bucketCards = buckets
    .map((bucket) => {
      const bucketId = bucket.bucket_id || null;
      const normalizedBucketId = bucketId ? String(bucketId).toUpperCase() : null;
      const itemCount =
        normalizedBucketId === "JUNK"
          ? junkCount
          : normalizedBucketId && countMap.has(normalizedBucketId)
            ? countMap.get(normalizedBucketId)
            : null;
      const files = (bucket.files || [])
        .map(
          (file) => `
            <div class="bucket-export-file-actions">
              ${
                file.text_previewable
                  ? `<button
                      class="button button--ghost bucket-export-file-btn"
                      data-run="${escapeHtml(outputDirName)}"
                      data-bucket-dir="${escapeHtml(bucket.bucket_dir_name)}"
                      data-file="${escapeHtml(file.file_name)}"
                    >
                      Preview ${escapeHtml(file.file_name)}
                    </button>`
                  : `<span class="meta-pill">${escapeHtml(file.file_name)} (${escapeHtml(formatBytes(file.size_bytes || 0))})</span>`
              }
              <button
                class="button button--ghost bucket-export-download-btn"
                data-run="${escapeHtml(outputDirName)}"
                data-bucket-dir="${escapeHtml(bucket.bucket_dir_name)}"
                data-file="${escapeHtml(file.file_name)}"
              >
                Download (${escapeHtml(formatBytes(file.size_bytes || 0))})
              </button>
            </div>
          `
        )
        .join("");

      return `
        <article class="run-card">
          <div class="run-card__header">
            <div>
              <p class="bucket-id">${escapeHtml(bucket.bucket_dir_name)}</p>
              <h3>${escapeHtml(bucket.display_name || bucket.bucket_dir_name)}</h3>
            </div>
          </div>
          <div class="meta-strip">
            ${bucketId ? `<span class="meta-pill">${escapeHtml(bucketId)}</span>` : ""}
            ${itemCount !== null && itemCount !== undefined ? `<span class="meta-pill">Items: ${escapeHtml(String(itemCount))}</span>` : ""}
            <span class="meta-pill">Files: ${escapeHtml(String((bucket.files || []).length))}</span>
          </div>
          <div class="bucket-export-files">
            ${files || '<span class="meta-pill">No readable files found.</span>'}
          </div>
        </article>
      `;
    })
    .join("");

  const introNote = isParquetRun
    ? `
      <div class="summary-panel">
        <span class="meta-pill">Parquet Lane</span>
        <span class="meta-pill">Binary + Text Exports</span>
        <div class="summary-note">
          Each bucket includes <code>items.parquet</code>, <code>items.jsonl</code>, and <code>items.csv</code>. The Parquet file carries assignment metadata, model-facing <code>content</code>, <code>raw_record_json</code>, and flattened structured source fields as <code>raw__*</code> columns.
        </div>
      </div>
    `
    : "";

  els.runDetailBucketExports.innerHTML = introNote + bucketCards;

  for (const button of document.querySelectorAll(".bucket-export-file-btn")) {
    button.addEventListener("click", () =>
      loadBucketExportFile(button.dataset.run, button.dataset.bucketDir, button.dataset.file)
    );
  }
  for (const button of document.querySelectorAll(".bucket-export-download-btn")) {
    button.addEventListener("click", () =>
      downloadBucketExportFile(button.dataset.run, button.dataset.bucketDir, button.dataset.file)
    );
  }
}

function renderRunReview(outputDirName) {
  const review = state.runReviewsByOutputDir[outputDirName] ?? null;
  els.runReviewVerdict.value = review?.verdict || "unreviewed";
  els.runReviewNote.value = review?.note || "";
  els.runReviewStatus.textContent = review?.updatedAt
    ? `Saved ${formatTimestamp(review.updatedAt)}`
    : "No analyst run review saved yet.";
}

function renderRunEvidence(detail) {
  const explanation = detail.bucket_plan?.explanation ?? {};
  const summary = detail.assignment_summary;
  const bucketList = (detail.bucket_plan?.buckets ?? [])
    .map((bucket) => `<li><strong>${escapeHtml(bucket.bucket_id)}</strong> ${escapeHtml(bucket.name)}: ${escapeHtml(bucket.description)}</li>`)
    .join("");
  const signalList = (explanation.signals_noticed ?? [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const cautionList = (explanation.caution_notes ?? [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  els.runDetailEvidence.className = "run-evidence-panel";
  els.runDetailEvidence.innerHTML = `
    <section>
      <h3>Intent And Shape</h3>
      <p><strong>Interpretation:</strong> ${escapeHtml(explanation.sorting_intent_interpretation ?? "n/a")}</p>
      <p><strong>Rationale:</strong> ${escapeHtml(explanation.bucket_shape_rationale ?? "n/a")}</p>
      <p><strong>Bucket Count Judgment:</strong> ${escapeHtml(explanation.bucket_count_judgment ?? "n/a")}</p>
    </section>
    <section>
      <h3>Bucket Meanings</h3>
      <ul>${bucketList || "<li>No bucket definitions loaded.</li>"}</ul>
    </section>
    <section>
      <h3>Observed Signals</h3>
      <ul>${signalList || "<li>No observed signals recorded.</li>"}</ul>
    </section>
    <section>
      <h3>Outcome Checks</h3>
      <p><strong>Total Items:</strong> ${escapeHtml(String(summary?.total_items ?? "n/a"))}</p>
      <p><strong>Junk:</strong> ${escapeHtml(String(summary?.junk_count ?? "n/a"))}</p>
      <p><strong>Review Flags:</strong> ${escapeHtml(String(summary?.review_flag_count ?? "n/a"))}</p>
    </section>
    <section>
      <h3>Cautions</h3>
      <ul>${cautionList || "<li>No caution notes recorded.</li>"}</ul>
    </section>
  `;
}

async function loadRunArtifact(outputDirName, artifactName) {
  const artifact = await requestJson(
    `/api/runs/${encodeURIComponent(outputDirName)}/artifacts/${encodeURIComponent(artifactName)}`
  );
  setCurrentRunArtifact(
    artifact.artifact_name ?? artifactName,
    buildRunArtifactFileName(outputDirName, artifact.artifact_name ?? artifactName),
    artifact.body ?? ""
  );
}

async function loadBucketExportFile(outputDirName, bucketDirName, fileName) {
  const artifact = await requestJson(
    `/api/runs/${encodeURIComponent(outputDirName)}/bucket-exports/${encodeURIComponent(bucketDirName)}/${encodeURIComponent(fileName)}`
  );
  setCurrentRunArtifact(
    `bucket_export_${bucketDirName}_${fileName}`,
    `${outputDirName}-${bucketDirName}-${fileName}`,
    artifact.body ?? ""
  );
}

async function downloadBucketExportFile(outputDirName, bucketDirName, fileName) {
  const response = await fetch(
    `/api/runs/${encodeURIComponent(outputDirName)}/bucket-exports/${encodeURIComponent(bucketDirName)}/${encodeURIComponent(fileName)}/download`
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function setCurrentRunArtifact(artifactName, fileName, body) {
  state.currentRunArtifact = {
    artifactName,
    fileName,
    body,
  };
  els.runDetailCurrentArtifact.textContent = `Current artifact: ${humanizeMetric(artifactName)}`;
  els.runDetailJson.textContent = body;
}

function buildRunArtifactFileName(outputDirName, artifactName) {
  const extensionMap = {
    run_manifest: "json",
    run_summary: "md",
    run_config: "json",
    preflight: "json",
    bucket_plan: "json",
    dataset_projection: "json",
    assignment_summary: "json",
    assignments: "jsonl",
    run_detail: "json",
  };
  const extension = extensionMap[artifactName] || "txt";
  return `${outputDirName}-${artifactName}.${extension}`;
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size < 1024) {
    return `${Math.max(0, Math.round(size))} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadTextFile(fileName, body) {
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function promoteRunToCompareSlot(slot) {
  const outputDirName = state.activeRunOutputDir;
  if (!outputDirName) return;
  if (slot === "left") {
    els.compareLeft.value = outputDirName;
  } else {
    els.compareRight.value = outputDirName;
  }
  saveUiState();
}

async function compareActiveRunAgainstSelected() {
  const outputDirName = state.activeRunOutputDir;
  if (!outputDirName) return;

  const leftSelected = els.compareLeft.value;
  const rightSelected = els.compareRight.value;
  if (!leftSelected && !rightSelected) {
    els.compareLeft.value = outputDirName;
    saveUiState();
    return;
  }

  if (!leftSelected) {
    els.compareLeft.value = outputDirName;
  } else if (!rightSelected) {
    els.compareRight.value = outputDirName;
  } else if (leftSelected !== outputDirName && rightSelected !== outputDirName) {
    els.compareRight.value = outputDirName;
  }

  saveUiState();
  await compareRuns();
}

async function saveCurrentRunReview() {
  const outputDirName = state.activeRunOutputDir;
  if (!outputDirName) return;

  state.runReviewsByOutputDir[outputDirName] = {
    verdict: els.runReviewVerdict.value,
    note: els.runReviewNote.value.trim(),
    updatedAt: new Date().toISOString(),
  };
  els.runReviewStatus.textContent = "Saving run review...";
  await persistAnalysisState();
  renderRunHistory(state.runs);
  renderRunReview(outputDirName);
}

async function saveCurrentExperimentReview() {
  const experimentId = state.activeExperimentId;
  if (!experimentId) return;

  state.experimentReviewsById[experimentId] = {
    verdict: els.experimentReviewVerdict.value,
    note: els.experimentReviewNote.value.trim(),
    updatedAt: new Date().toISOString(),
  };
  els.experimentReviewStatus.textContent = "Saving experiment review...";
  await persistAnalysisState();
  renderExperimentHistory(state.runs);
  const experiment = summarizeExperiments(state.runs).find((entry) => entry.experimentId === experimentId);
  if (experiment) {
    if (!experiment.hasBothModes) {
      renderExperimentReview(experimentId);
    } else {
      const [leftDetail, rightDetail] = await Promise.all([
        fetchRunDetailCached(experiment.dataSkimRun.output_dir_name),
        fetchRunDetailCached(experiment.blindLabelRun.output_dir_name),
      ]);
      renderExperimentReport(experiment, leftDetail, rightDetail);
    }
  }
}

async function applyCurrentRunReviewAsNextRun() {
  const outputDirName = state.activeRunOutputDir;
  if (!outputDirName) return;
  const detail = await fetchRunDetailCached(outputDirName);
  const dataset = findDatasetMatch({
    datasetId: detail.run_manifest?.dataset?.dataset_id ?? null,
    displayName:
      detail.run_manifest?.dataset?.display_name ??
      detail.history.dataset_display_name,
  });
  if (dataset) {
    els.datasetSelect.value = dataset.dataset_id;
    state.selectedDatasetId = dataset.dataset_id;
  }

  const sortIntent = detail.run_config?.sort_intent ?? detail.history.sort_intent;
  if (sortIntent?.kind === "Preset" && sortIntent.value) {
    els.sortIntent.value = sortIntent.value;
  }
  els.bucketGenesisMode.value = detail.run_config?.bucket_genesis_mode || detail.history.bucket_genesis_mode;
  els.bucketCount.value = String(
    detail.run_config?.requested_positive_bucket_count ?? detail.history.requested_positive_bucket_count
  );
  els.forceOverride.checked = Boolean(detail.run_config?.force_override ?? detail.history.force_override);

  const review = state.runReviewsByOutputDir[outputDirName] ?? null;
  const reviewText = review
    ? `Analyst follow-up from ${outputDirName} (${humanizeMetric(review.verdict)}): ${review.note || "No note recorded."}`
    : "";
  const existingInstructions = detail.run_config?.custom_instructions || "";
  els.customInstructions.value = [existingInstructions, reviewText].filter(Boolean).join("\n\n");
  await previewDataset();
}

async function applyCurrentExperimentReviewAsNextRun() {
  const experimentId = state.activeExperimentId;
  if (!experimentId) return;
  const experiment = summarizeExperiments(state.runs).find((entry) => entry.experimentId === experimentId);
  if (!experiment) return;

  const dataset = findDatasetMatch({
    displayName: experiment.datasetDisplayName,
  });
  if (dataset) {
    els.datasetSelect.value = dataset.dataset_id;
    state.selectedDatasetId = dataset.dataset_id;
  }

  if (experiment.sortIntent?.kind === "Preset" && experiment.sortIntent.value) {
    els.sortIntent.value = experiment.sortIntent.value;
  }
  if (state.activeExperimentSuggestion) {
    applyExperimentSuggestion(state.activeExperimentSuggestion);
  } else {
    els.bucketCount.value = String(experiment.requestedPositiveBucketCount);
  }

  const review = state.experimentReviewsById[experimentId] ?? null;
  const followupText = review
    ? `Analyst follow-up from experiment ${experimentId.slice(0, 8)} (${humanizeMetric(review.verdict)}): ${review.note || "No note recorded."}`
    : "";
  els.customInstructions.value = [
    els.customInstructions.value.trim(),
    followupText,
  ]
    .filter(Boolean)
    .join("\n\n");

  await previewDataset();
}

function renderCompareSelectors(runs) {
  if (!runs?.length) {
    els.compareLeft.innerHTML = `<option value="">No runs</option>`;
    els.compareRight.innerHTML = `<option value="">No runs</option>`;
    els.comparePairNote.textContent = "No saved runs are available for comparison yet.";
    return;
  }

  const options = runs
    .map((run) => {
      const mode = run.bucket_genesis_mode === "blind_label" ? "blind" : "skim";
      const experiment = run.experiment_id ? ` | exp ${run.experiment_id.slice(0, 8)}` : "";
      const label = `${run.dataset_display_name} | ${formatSortIntent(run.sort_intent)} | ${mode}${experiment} | ${run.output_dir_name}`;
      return `<option value="${escapeHtml(run.output_dir_name)}">${escapeHtml(label)}</option>`;
    })
    .join("");

  els.compareLeft.innerHTML = options;
  els.compareRight.innerHTML = options;

  if (state.compareLeftPersisted && runs.some((run) => run.output_dir_name === state.compareLeftPersisted)) {
    els.compareLeft.value = state.compareLeftPersisted;
  } else if (runs[0]) {
    els.compareLeft.value = runs[0].output_dir_name;
  }
  if (state.compareRightPersisted && runs.some((run) => run.output_dir_name === state.compareRightPersisted)) {
    els.compareRight.value = state.compareRightPersisted;
  } else if (runs[1]) {
    els.compareRight.value = runs[1].output_dir_name;
  } else if (runs[0]) {
    els.compareRight.value = runs[0].output_dir_name;
  }

  const bestPair = findBestGenesisComparisonPair(runs);
  if (bestPair) {
    els.comparePairNote.textContent =
      `Suggested pair: ${bestPair.left.dataset_display_name} | ${formatSortIntent(bestPair.left.sort_intent)} | ${bestPair.left.requested_positive_bucket_count} buckets.`;
  } else {
    els.comparePairNote.textContent =
      "No strong blind-vs-skim pair found yet. Matching dataset, intent, and bucket count across both modes will make this analysis much stronger.";
  }
}

function renderComparison(left, right) {
  if (!left || !right) {
    els.compareSummary.className = "summary-panel muted";
    els.compareSummary.textContent = "Pick two saved runs to compare bucket genesis mode, bucket shape, and assignment outcomes.";
    els.compareGrid.innerHTML = `<div class="placeholder">No run comparison loaded yet. Choose two saved runs to diff bucket shape and assignment outcomes.</div>`;
    return;
  }

  const leftMode = left.history.bucket_genesis_mode;
  const rightMode = right.history.bucket_genesis_mode;
  const sameMode = leftMode === rightMode;
  const leftSummary = left.assignment_summary;
  const rightSummary = right.assignment_summary;
  const leftJunk = leftSummary?.junk_count ?? 0;
  const rightJunk = rightSummary?.junk_count ?? 0;
  const leftReview = leftSummary?.review_flag_count ?? 0;
  const rightReview = rightSummary?.review_flag_count ?? 0;
  const bucketDiffs = diffBucketNames(left.bucket_plan?.buckets ?? [], right.bucket_plan?.buckets ?? []);
  const distributionRows = buildDistributionRows(leftSummary, rightSummary);
  const bucketDistributionRows = buildBucketDistributionContrast(left, right);
  const keyDifferences = buildKeyDifferences(left, right, bucketDiffs);
  const explanationContrast = buildExplanationContrast(left, right);
  const projectionContrast = buildProjectionContrast(left, right);
  const fairnessChecks = buildComparisonFairnessChecks(left, right);
  const comparisonLens = buildComparisonLens(left, right, bucketDiffs);
  const isComparablePair = fairnessChecks.every((item) => item.ok);

  els.compareSummary.className = isComparablePair ? "summary-panel" : "summary-panel summary-panel--alert";
  els.compareSummary.innerHTML = `
    <span class="meta-pill ${sameMode ? "" : "meta-pill--warn"}">Modes: ${escapeHtml(leftMode)} vs ${escapeHtml(rightMode)}</span>
    <span class="meta-pill">Buckets: ${escapeHtml(String(left.history.requested_positive_bucket_count))} vs ${escapeHtml(String(right.history.requested_positive_bucket_count))}</span>
    <span class="meta-pill ${leftJunk !== rightJunk ? "meta-pill--warn" : ""}">Junk: ${escapeHtml(String(leftJunk))} vs ${escapeHtml(String(rightJunk))}</span>
    <span class="meta-pill ${leftReview !== rightReview ? "meta-pill--warn" : ""}">Review: ${escapeHtml(String(leftReview))} vs ${escapeHtml(String(rightReview))}</span>
  `;
  els.comparePairNote.textContent = comparisonLens;

  els.compareGrid.innerHTML = `
    <article class="compare-card compare-card--wide">
      <p class="bucket-id">Differences That Matter</p>
      <div class="compare-insight-grid">
        <section>
          <p class="bucket-subtitle">Quick Read</p>
          <ul>${renderListOrFallback(keyDifferences, "These runs are closely aligned at the headline level.")}</ul>
        </section>
        <section>
          <p class="bucket-subtitle">Bucket Name Drift</p>
          <ul>${renderListOrFallback(bucketDiffs, "Positive bucket names stayed aligned slot by slot.")}</ul>
        </section>
        <section>
          <p class="bucket-subtitle">Outcome Pressure</p>
          <div class="distribution-list">
            ${distributionRows || `<p class="muted">No assignment summary available to compare.</p>`}
          </div>
        </section>
        <section>
          <p class="bucket-subtitle">Comparison Integrity</p>
          <ul>${renderFairnessChecks(fairnessChecks)}</ul>
        </section>
        <section>
          <p class="bucket-subtitle">Projection Drift</p>
          <div class="explanation-diff-list">
            ${projectionContrast}
          </div>
        </section>
        <section>
          <p class="bucket-subtitle">Bucket Distribution Drift</p>
          <div class="distribution-list">
            ${bucketDistributionRows || `<p class="muted">No positive bucket distribution was saved for one or both runs.</p>`}
          </div>
        </section>
        <section class="compare-insight-grid__wide">
          <p class="bucket-subtitle">Explanation Drift</p>
          <div class="explanation-diff-list">
            ${explanationContrast}
          </div>
        </section>
      </div>
    </article>
    ${renderComparisonColumn("Left Run", left)}
    ${renderComparisonColumn("Right Run", right)}
  `;
}

function renderComparisonColumn(title, detail) {
  const mode = detail.history.bucket_genesis_mode === "blind_label" ? "Blind Label" : "Data Skim";
  const summary = detail.assignment_summary;
  const explanation = detail.bucket_plan.explanation;
  const bucketNames = detail.bucket_plan.buckets
    .map((bucket) => `<li>${escapeHtml(bucket.bucket_id)}: ${escapeHtml(bucket.name)}</li>`)
    .join("");
  const zoom = (explanation.zoom_in_suggestions || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  const surprises = (explanation.surprising_groupings || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

  return `
    <article class="compare-card">
      <p class="bucket-id">${escapeHtml(title)}</p>
      <h3>${escapeHtml(detail.history.dataset_display_name)}</h3>
      <div class="meta-strip">
        <span class="meta-pill ${detail.history.bucket_genesis_mode === "blind_label" ? "meta-pill--warn" : ""}">${escapeHtml(mode)}</span>
        <span class="meta-pill">${escapeHtml(formatSortIntent(detail.history.sort_intent))}</span>
      </div>
      <p><strong>Intent Interpretation:</strong> ${escapeHtml(explanation.sorting_intent_interpretation)}</p>
      <p><strong>Bucket Rationale:</strong> ${escapeHtml(explanation.bucket_shape_rationale)}</p>
      <p><strong>Bucket Count Judgment:</strong> ${escapeHtml(explanation.bucket_count_judgment)}</p>
      <p class="bucket-subtitle">Buckets</p>
      <ul>${bucketNames}</ul>
      <p class="bucket-subtitle">Surprising Groupings</p>
      <ul>${surprises || "<li>None recorded.</li>"}</ul>
      <p class="bucket-subtitle">Zoom In Suggestions</p>
      <ul>${zoom || "<li>None recorded.</li>"}</ul>
      <p class="bucket-subtitle">Assignment Outcome</p>
      <ul>
        <li>Total items: ${escapeHtml(String(summary?.total_items ?? 0))}</li>
        <li>Junk count: ${escapeHtml(String(summary?.junk_count ?? 0))}</li>
        <li>Review flags: ${escapeHtml(String(summary?.review_flag_count ?? 0))}</li>
      </ul>
      <div class="distribution-list">
        ${buildSingleRunDistribution(detail)}
      </div>
      <p class="bucket-subtitle">Run Folder</p>
      <p>${escapeHtml(detail.history.output_dir_name)}</p>
    </article>
  `;
}

function buildKeyDifferences(left, right, bucketDiffs) {
  const differences = [];
  const leftMode = left.history.bucket_genesis_mode;
  const rightMode = right.history.bucket_genesis_mode;
  const leftExplanation = left.bucket_plan?.explanation;
  const rightExplanation = right.bucket_plan?.explanation;
  const leftSummary = left.assignment_summary;
  const rightSummary = right.assignment_summary;
  const leftJunk = leftSummary?.junk_count ?? 0;
  const rightJunk = rightSummary?.junk_count ?? 0;
  const leftReview = leftSummary?.review_flag_count ?? 0;
  const rightReview = rightSummary?.review_flag_count ?? 0;
  const leftProjection = left.run_config?.dataset_projection ?? null;
  const rightProjection = right.run_config?.dataset_projection ?? null;
  const leftFields = (leftProjection?.selected_fields ?? []).map((field) => field.field_name).join("|");
  const rightFields = (rightProjection?.selected_fields ?? []).map((field) => field.field_name).join("|");
  const leftIdField = leftProjection?.item_id_field || "implicit_row_index";
  const rightIdField = rightProjection?.item_id_field || "implicit_row_index";
  const leftRenderMode = leftProjection?.render_mode || "none";
  const rightRenderMode = rightProjection?.render_mode || "none";

  if (leftMode !== rightMode) {
    differences.push(`Genesis mode changed from ${humanizeGenesisMode(leftMode)} to ${humanizeGenesisMode(rightMode)}.`);
  }
  if ((leftExplanation?.bucket_count_judgment ?? "") !== (rightExplanation?.bucket_count_judgment ?? "")) {
    differences.push("The model judged the requested bucket count differently across the two runs.");
  }
  if (bucketDiffs.length) {
    differences.push(`${bucketDiffs.length} positive bucket slots were named differently, which suggests ontology drift rather than just assignment drift.`);
  }
  if (leftJunk !== rightJunk) {
    differences.push(`Junk pressure moved from ${leftJunk} to ${rightJunk}.`);
  }
  if (leftReview !== rightReview) {
    differences.push(`Review-flag pressure moved from ${leftReview} to ${rightReview}.`);
  }
  if (leftFields !== rightFields || leftIdField !== rightIdField || leftRenderMode !== rightRenderMode) {
    differences.push("The model did not see the same projected dataset view across the two runs, so some drift may come from input framing rather than bucket planning alone.");
  }
  if ((leftExplanation?.surprising_groupings ?? []).join(" | ") !== (rightExplanation?.surprising_groupings ?? []).join(" | ")) {
    differences.push("The model reported different surprising groupings, which usually means it noticed different latent structure.");
  }

  return differences;
}

function buildComparisonFairnessChecks(left, right) {
  const leftHistory = left.history;
  const rightHistory = right.history;
  const checks = [
    {
      ok: leftHistory.dataset_display_name === rightHistory.dataset_display_name,
      label: "Dataset match",
      good: "Both runs target the same dataset.",
      bad: "These runs use different datasets, so ontology drift may reflect source changes rather than genesis mode.",
    },
    {
      ok: JSON.stringify(leftHistory.sort_intent) === JSON.stringify(rightHistory.sort_intent),
      label: "Intent match",
      good: "Both runs use the same sort intent.",
      bad: "Sort intent differs across runs, which weakens the blind-vs-skim reading.",
    },
    {
      ok: leftHistory.requested_positive_bucket_count === rightHistory.requested_positive_bucket_count,
      label: "Bucket count match",
      good: "Both runs requested the same number of positive buckets.",
      bad: "Bucket count differs, so some drift may be caused by shape pressure rather than genesis mode.",
    },
    {
      ok: leftHistory.bucket_genesis_mode !== rightHistory.bucket_genesis_mode,
      label: "Genesis contrast",
      good: "The pair isolates blind-label versus data-skim behavior.",
      bad: "Both runs use the same genesis mode, so this is not a true blind-vs-skim comparison.",
    },
  ];
  return checks;
}

function renderFairnessChecks(checks) {
  return checks
    .map(
      (item) =>
        `<li>${escapeHtml(`${item.label}: ${item.ok ? item.good : item.bad}`)}</li>`
    )
    .join("");
}

function buildComparisonLens(left, right, bucketDiffs) {
  const fairnessChecks = buildComparisonFairnessChecks(left, right);
  const allFair = fairnessChecks.every((item) => item.ok);
  const genesisSplit = left.history.bucket_genesis_mode !== right.history.bucket_genesis_mode;
  if (allFair && genesisSplit) {
    return "This is a strong blind-vs-skim pair. Read bucket-name drift, junk pressure, and explanation drift as likely consequences of when the model saw the data.";
  }
  if (genesisSplit) {
    return "This pair does contrast blind-vs-skim, but at least one other variable changed too. Treat differences as mixed-cause rather than pure genesis effects.";
  }
  if (bucketDiffs.length) {
    return "This comparison mainly shows run-to-run ontology drift within the same mode rather than blind-vs-skim contrast.";
  }
  return "This pair is useful for checking stability, but it is not isolating genesis-mode effects on its own.";
}

function findBestGenesisComparisonPair(runs) {
  if (!runs?.length) return null;
  const scoredPairs = [];

  for (let leftIndex = 0; leftIndex < runs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < runs.length; rightIndex += 1) {
      const left = runs[leftIndex];
      const right = runs[rightIndex];
      let score = 0;

      if (left.bucket_genesis_mode !== right.bucket_genesis_mode) score += 8;
      if (left.dataset_display_name === right.dataset_display_name) score += 5;
      if (JSON.stringify(left.sort_intent) === JSON.stringify(right.sort_intent)) score += 4;
      if (left.requested_positive_bucket_count === right.requested_positive_bucket_count) score += 4;
      if ((left.total_items ?? 0) === (right.total_items ?? 0)) score += 2;

      if (score > 0) {
        scoredPairs.push({ left, right, score });
      }
    }
  }

  scoredPairs.sort((a, b) => b.score - a.score);
  return scoredPairs[0] ?? null;
}

async function selectBestGenesisComparisonPair() {
  const pair = findBestGenesisComparisonPair(state.runs);
  if (!pair) {
    els.comparePairNote.textContent =
      "No blind-vs-skim pair could be suggested from current saved runs yet.";
    return;
  }

  els.compareLeft.value = pair.left.output_dir_name;
  els.compareRight.value = pair.right.output_dir_name;
  await compareRuns();
}

function summarizeExperiments(runs) {
  const grouped = new Map();
  for (const run of runs) {
    if (!run.experiment_id) continue;
    const existing = grouped.get(run.experiment_id) || [];
    existing.push(run);
    grouped.set(run.experiment_id, existing);
  }

  return [...grouped.entries()]
    .map(([experimentId, groupedRuns]) => {
      const dataSkimRun = groupedRuns.find((run) => run.bucket_genesis_mode === "data_skim") ?? null;
      const blindLabelRun = groupedRuns.find((run) => run.bucket_genesis_mode === "blind_label") ?? null;
      const representative = dataSkimRun ?? blindLabelRun ?? groupedRuns[0];
      const bucketNameDrift =
        dataSkimRun && blindLabelRun ? estimateBucketNameDriftFromRuns(dataSkimRun, blindLabelRun) : null;
      const junkDrift =
        dataSkimRun && blindLabelRun && dataSkimRun.junk_count != null && blindLabelRun.junk_count != null
          ? Math.abs((dataSkimRun.junk_count ?? 0) - (blindLabelRun.junk_count ?? 0))
          : null;
      const reviewDrift =
        dataSkimRun && blindLabelRun && dataSkimRun.review_flag_count != null && blindLabelRun.review_flag_count != null
          ? Math.abs((dataSkimRun.review_flag_count ?? 0) - (blindLabelRun.review_flag_count ?? 0))
          : null;
      const hasBothModes = Boolean(dataSkimRun && blindLabelRun);
      return {
        experimentId,
        runs: groupedRuns,
        dataSkimRun,
        blindLabelRun,
        hasBothModes,
        datasetDisplayName: representative.dataset_display_name,
        sortIntent: representative.sort_intent,
        requestedPositiveBucketCount: representative.requested_positive_bucket_count,
        bucketNameDrift,
        junkDrift,
        reviewDrift,
        summaryNote: hasBothModes
          ? "Matched pair is ready for side-by-side analysis."
          : "This experiment is missing one genesis mode, so it is not yet a full matched pair.",
        createdAt: representative.created_at,
      };
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function estimateBucketNameDriftFromRuns(leftRun, rightRun) {
  const leftSignal = `${formatSortIntent(leftRun.sort_intent)}|${leftRun.requested_positive_bucket_count}|${leftRun.dataset_display_name}`;
  const rightSignal = `${formatSortIntent(rightRun.sort_intent)}|${rightRun.requested_positive_bucket_count}|${rightRun.dataset_display_name}`;
  return leftSignal === rightSignal ? 0 : 1;
}

function compareExperiments(left, right) {
  const leftInsight = state.experimentInsightsById[left.experimentId] ?? null;
  const rightInsight = state.experimentInsightsById[right.experimentId] ?? null;
  const leftReview = state.experimentReviewsById[left.experimentId] ?? null;
  const rightReview = state.experimentReviewsById[right.experimentId] ?? null;
  const sort = state.experimentSort;
  if (sort === "analyst_priority") {
    const priorityDelta =
      reviewPriority(rightReview?.verdict) - reviewPriority(leftReview?.verdict);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return (rightInsight?.interestingnessScore ?? -1) - (leftInsight?.interestingnessScore ?? -1);
  }
  if (sort === "interestingness") {
    return (rightInsight?.interestingnessScore ?? -1) - (leftInsight?.interestingnessScore ?? -1);
  }
  if (sort === "bucket_drift") {
    return (rightInsight?.bucketNameDrift ?? -1) - (leftInsight?.bucketNameDrift ?? -1);
  }
  if (sort === "projection_drift") {
    return (rightInsight?.projectionDrift ?? -1) - (leftInsight?.projectionDrift ?? -1);
  }
  if (sort === "distribution_drift") {
    return (rightInsight?.bucketDistributionDrift ?? -1) - (leftInsight?.bucketDistributionDrift ?? -1);
  }
  if (sort === "explanation_drift") {
    return (rightInsight?.explanationDrift ?? -1) - (leftInsight?.explanationDrift ?? -1);
  }
  if (sort === "junk_drift") {
    return (rightInsight?.junkDrift ?? -1) - (leftInsight?.junkDrift ?? -1);
  }
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function reviewPriority(verdict) {
  switch (verdict) {
    case "needs_followup":
      return 4;
    case "surprising":
      return 3;
    case "useful":
      return 2;
    case "misleading":
      return 1;
    default:
      return 0;
  }
}

function getCurrentWatchTarget() {
  const datasetOption = els.datasetSelect.selectedOptions?.[0];
  return {
    watchKey: `${datasetOption?.textContent || els.datasetSelect.value}::${JSON.stringify({ kind: "Preset", value: els.sortIntent.value })}`,
    datasetDisplayName: datasetOption?.textContent || els.datasetSelect.value,
    sortIntent: { kind: "Preset", value: els.sortIntent.value },
  };
}

function addCurrentWatchTarget() {
  const target = getCurrentWatchTarget();
  if (!target.datasetDisplayName) return;
  if (state.watchTargets.some((entry) => entry.watchKey === target.watchKey)) return;
  state.watchTargets = [target, ...state.watchTargets];
  saveUiState();
  renderWatchlist(state.runs);
  persistAnalysisState();
}

function removeWatchTarget(watchKey) {
  state.watchTargets = state.watchTargets.filter((entry) => entry.watchKey !== watchKey);
  saveUiState();
  renderWatchlist(state.runs);
  persistAnalysisState();
}

function buildWatchTrends(runs) {
  const experiments = summarizeExperiments(runs);
  return state.watchTargets.map((target) => {
    const matching = experiments
      .filter(
        (experiment) =>
          experiment.datasetDisplayName === target.datasetDisplayName &&
          JSON.stringify(experiment.sortIntent) === JSON.stringify(target.sortIntent) &&
          experiment.hasBothModes
      )
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    const latestExperiment = matching[0] ?? null;
    const previousExperiment = matching[1] ?? null;
    const latestInsight = latestExperiment ? state.experimentInsightsById[latestExperiment.experimentId] ?? null : null;
    const previousInsight = previousExperiment ? state.experimentInsightsById[previousExperiment.experimentId] ?? null : null;
    const structuralDriftNote = latestExperiment
      ? summarizeExperimentStructuralDrift(latestExperiment, latestInsight)
      : null;
    const orderedOldestFirst = [...matching].reverse();
    const scoreSeries = orderedOldestFirst
      .map((experiment) => state.experimentInsightsById[experiment.experimentId]?.interestingnessScore)
      .filter((value) => Number.isFinite(value));
    const deltaScore =
      latestInsight && previousInsight
        ? latestInsight.interestingnessScore - previousInsight.interestingnessScore
        : null;
    const regression = detectTrendRegression(orderedOldestFirst, state.experimentInsightsById);
    const recommendation = buildRecommendationFromRegression({
      regression,
      latestInsight,
      target,
      latestExperiment,
    });
    return {
      ...target,
      latestExperiment,
      latestInsight,
      previousInsight,
      completeExperimentCount: matching.length,
      deltaScore,
      scoreSeries,
      regression,
      recommendation,
      structuralDriftNote,
      summaryNote: latestInsight
        ? `Latest pair scored ${latestInsight.interestingnessScore}.${regression ? ` Regression detected in ${regression.kind.replaceAll("_", " ")}.` : deltaScore == null ? " No prior pair to compare yet." : ` Change from previous pair: ${deltaScore > 0 ? "+" : ""}${deltaScore}.`}`
        : "No complete matched experiment has landed for this watch target yet.",
    };
  });
}

function renderTrendSparkline(series) {
  if (!series.length) {
    return `<div class="placeholder">No trend points yet.</div>`;
  }
  const maxValue = Math.max(...series, 1);
  return series
    .map((value) => {
      const height = Math.max((value / maxValue) * 42, 8);
      return `<span class="watch-sparkline__bar" style="height: ${height}px" title="Interestingness ${escapeHtml(String(value))}"></span>`;
    })
    .join("");
}

function detectTrendRegression(experimentsOldestFirst, insightsById) {
  if (experimentsOldestFirst.length < 2) return null;
  const latest = experimentsOldestFirst[experimentsOldestFirst.length - 1];
  const previous = experimentsOldestFirst[experimentsOldestFirst.length - 2];
  const latestInsight = insightsById[latest.experimentId];
  const previousInsight = insightsById[previous.experimentId];
  if (!latestInsight || !previousInsight) return null;

  const interestingnessJump = latestInsight.interestingnessScore - previousInsight.interestingnessScore;
  if (interestingnessJump >= 4) {
    return { kind: "interestingness_jump", severity: interestingnessJump >= 7 ? "high" : "moderate" };
  }
  if ((latestInsight.junkDrift - previousInsight.junkDrift) >= 2) {
    return { kind: "junk_pressure_jump", severity: latestInsight.junkDrift - previousInsight.junkDrift >= 4 ? "high" : "moderate" };
  }
  return null;
}

function buildRecommendationFromRegression({
  regression,
  latestInsight,
  target,
  latestExperiment,
}) {
  if (!latestExperiment) return null;

  const currentBucketCount = latestExperiment.requestedPositiveBucketCount;
  const sortIntentValue = target.sortIntent?.value ?? "topic";

  if (!regression) {
    return {
      recipeId: "topic_balanced",
      bucketCount: currentBucketCount,
      forceOverride: false,
      customInstructions:
        "Stability check. Re-run the same target to confirm whether the latest pair remains consistent.",
      rationale:
        "No regression was detected, so the next best move is a stability confirmation run rather than a large parameter change.",
    };
  }

  if (regression.kind === "junk_pressure_jump") {
    return {
      recipeId: "junk_stress",
      bucketCount: Math.max(currentBucketCount + 1, 4),
      forceOverride: true,
      customInstructions:
        `Follow-up for ${sortIntentValue}. Junk pressure jumped, so widen the semantic budget slightly and be strict about weak-fit spillover.`,
      rationale:
        "Junk pressure rose sharply. The likely next move is to stress junk separation and slightly widen the bucket budget to test whether the overflow is real structure or shape starvation.",
    };
  }

  if (regression.kind === "interestingness_jump" && latestInsight?.bucketNameDrift > 0) {
    return {
      recipeId: sortIntentValue === "code" ? "code_strict" : "topic_balanced",
      bucketCount: currentBucketCount + 1,
      forceOverride: true,
      customInstructions:
        `Follow-up for ${sortIntentValue}. Ontology drift spiked, so test whether one additional bucket stabilizes the competing semantic regions.`,
      rationale:
        "Interestingness jumped with ontology drift. The likely next move is to slightly increase bucket budget and test whether the model was compressing too many concepts into the same reality.",
    };
  }

  if (regression.kind === "interestingness_jump" && latestInsight?.explanationDrift > 0) {
    return {
      recipeId: sortIntentValue === "abstract_reasoning" ? "abstract_probe" : "reasoning_probe",
      bucketCount: currentBucketCount,
      forceOverride: true,
      customInstructions:
        `Follow-up for ${sortIntentValue}. Explanation drift spiked, so probe the latent reasoning structure with a more contrastive recipe.`,
      rationale:
        "Interestingness jumped because the model changed how it explained the dataset. The likely next move is a probe recipe that stresses latent reasoning or abstraction differences directly.",
    };
  }

  return {
    recipeId: "topic_balanced",
    bucketCount: currentBucketCount,
    forceOverride: true,
    customInstructions:
      `Follow-up for ${sortIntentValue}. Re-run with a balanced recipe to confirm whether the detected change was persistent or transient.`,
    rationale:
      "A notable change was detected, but it does not map cleanly to one specialized intervention. The safest next move is a balanced confirmation pass.",
  };
}

function getTopInterestingExperiment() {
  const experiments = summarizeExperiments(state.runs)
    .filter((experiment) => experiment.hasBothModes)
    .sort((left, right) => {
      const leftInsight = state.experimentInsightsById[left.experimentId] ?? null;
      const rightInsight = state.experimentInsightsById[right.experimentId] ?? null;
      return (rightInsight?.interestingnessScore ?? -1) - (leftInsight?.interestingnessScore ?? -1);
    });
  return experiments[0] ?? null;
}

function maybeAlertInterestingExperiments() {
  const newlyAlertable = summarizeExperiments(state.runs).filter((experiment) => {
    if (!experiment.hasBothModes) return false;
    const insight = state.experimentInsightsById[experiment.experimentId];
    if (!insight) return false;
    if (insight.interestingnessScore < state.experimentAlertThreshold) return false;
    return !state.alertedExperimentIds.includes(experiment.experimentId);
  });

  if (!newlyAlertable.length) return;

  const top = newlyAlertable.sort((left, right) => {
    const leftInsight = state.experimentInsightsById[left.experimentId];
    const rightInsight = state.experimentInsightsById[right.experimentId];
    return (rightInsight?.interestingnessScore ?? -1) - (leftInsight?.interestingnessScore ?? -1);
  })[0];
  const topInsight = state.experimentInsightsById[top.experimentId];
  const structuralDriftNote = summarizeExperimentStructuralDrift(top, topInsight);
  state.alertedExperimentIds = [...state.alertedExperimentIds, ...newlyAlertable.map((item) => item.experimentId)];
  saveUiState();
  persistAnalysisState();
  window.alert(
    `Interesting experiment detected: ${top.datasetDisplayName} (${top.experimentId.slice(0, 8)}) scored ${topInsight.interestingnessScore}.${structuralDriftNote ? ` ${structuralDriftNote}` : ""}`
  );
}

function summarizeExperimentStructuralDrift(experiment, insight) {
  if (!experiment?.hasBothModes || !insight) return null;
  const leftDetail = state.runDetailsByOutputDir[experiment.dataSkimRun?.output_dir_name];
  const rightDetail = state.runDetailsByOutputDir[experiment.blindLabelRun?.output_dir_name];
  if (!leftDetail || !rightDetail) return null;
  return buildStructuralDriftReadout(leftDetail, rightDetail, insight)[0] ?? null;
}

async function fetchRunDetailCached(outputDirName) {
  if (state.runDetailsByOutputDir[outputDirName]) {
    return state.runDetailsByOutputDir[outputDirName];
  }
  const detail = await requestJson(`/api/runs/${encodeURIComponent(outputDirName)}`);
  state.runDetailsByOutputDir[outputDirName] = detail;
  return detail;
}

async function hydrateExperimentInsights(runs) {
  const experimentsNeedingInsight = summarizeExperiments(runs).filter(
    (experiment) => experiment.hasBothModes && !state.experimentInsightsById[experiment.experimentId]
  );
  if (!experimentsNeedingInsight.length) {
    return;
  }

  await Promise.all(
    experimentsNeedingInsight.map(async (experiment) => {
      const [leftDetail, rightDetail] = await Promise.all([
        fetchRunDetailCached(experiment.dataSkimRun.output_dir_name),
        fetchRunDetailCached(experiment.blindLabelRun.output_dir_name),
      ]);
      state.experimentInsightsById[experiment.experimentId] = buildExperimentInsight(
        leftDetail,
        rightDetail
      );
    })
  );

  renderWatchlist(state.runs);
  persistAnalysisState();
  renderExperimentHistory(state.runs);
  maybeAlertInterestingExperiments();
  if (state.experimentAutoOpenTopInteresting) {
    const topExperiment = getTopInterestingExperiment();
    if (topExperiment) {
      await openExperimentReport(topExperiment.experimentId);
      return;
    }
  }
  if (state.activeExperimentId) {
    await openExperimentReport(state.activeExperimentId);
  }
}

function buildExperimentInsight(leftDetail, rightDetail) {
  const bucketDiffs = diffBucketNames(
    leftDetail.bucket_plan?.buckets ?? [],
    rightDetail.bucket_plan?.buckets ?? []
  );
  const keyDifferences = buildKeyDifferences(leftDetail, rightDetail, bucketDiffs);
  const projectionDrift = countProjectionDrift(leftDetail, rightDetail);
  const bucketDistributionDrift = countBucketDistributionDrift(leftDetail, rightDetail);
  const junkDrift = Math.abs(
    (leftDetail.assignment_summary?.junk_count ?? 0) -
      (rightDetail.assignment_summary?.junk_count ?? 0)
  );
  const reviewDrift = Math.abs(
    (leftDetail.assignment_summary?.review_flag_count ?? 0) -
      (rightDetail.assignment_summary?.review_flag_count ?? 0)
  );
  const explanationDrift = countExplanationDrift(leftDetail, rightDetail);
  const interestingnessScore = computeInterestingnessScore({
    bucketNameDrift: bucketDiffs.length,
    projectionDrift,
    bucketDistributionDrift,
    junkDrift,
    reviewDrift,
    explanationDrift,
  });
  return {
    bucketNameDrift: bucketDiffs.length,
    projectionDrift,
    bucketDistributionDrift,
    junkDrift,
    reviewDrift,
    explanationDrift,
    interestingnessScore,
    summaryNote:
      keyDifferences[0] ??
      buildComparisonLens(leftDetail, rightDetail, bucketDiffs),
  };
}

function computeInterestingnessScore({
  bucketNameDrift,
  projectionDrift,
  bucketDistributionDrift,
  junkDrift,
  reviewDrift,
  explanationDrift,
}) {
  return (
    (bucketNameDrift * 3) +
    (projectionDrift * 2) +
    bucketDistributionDrift +
    (explanationDrift * 2) +
    junkDrift +
    reviewDrift
  );
}

function matchesExperimentPreset(experiment, insight) {
  if (state.experimentPreset === "all") return true;
  if (!experiment.hasBothModes) {
    return state.experimentPreset === "most_interesting" ? false : true;
  }
  const bucketDrift = Number(insight?.bucketNameDrift ?? 0);
  const projectionDrift = Number(insight?.projectionDrift ?? 0);
  const distributionDrift = Number(insight?.bucketDistributionDrift ?? 0);
  const junkDrift = Number(insight?.junkDrift ?? 0);
  const reviewDrift = Number(insight?.reviewDrift ?? 0);
  const explanationDrift = Number(insight?.explanationDrift ?? 0);
  const interestingness = Number(insight?.interestingnessScore ?? 0);

  if (state.experimentPreset === "most_interesting") return interestingness >= 5;
  if (state.experimentPreset === "ontology_drift") return bucketDrift > 0;
  if (state.experimentPreset === "projection_drift") return projectionDrift > 0;
  if (state.experimentPreset === "assignment_drift") {
    return junkDrift > 0 || reviewDrift > 0 || distributionDrift > 0;
  }
  if (state.experimentPreset === "explanation_drift") return explanationDrift > 0;
  if (state.experimentPreset === "review_pressure") return reviewDrift > 0;
  return true;
}

function countExplanationDrift(leftDetail, rightDetail) {
  const leftExplanation = leftDetail.bucket_plan?.explanation ?? {};
  const rightExplanation = rightDetail.bucket_plan?.explanation ?? {};
  const sections = [
    leftExplanation.sorting_intent_interpretation !== rightExplanation.sorting_intent_interpretation,
    leftExplanation.bucket_shape_rationale !== rightExplanation.bucket_shape_rationale,
    leftExplanation.bucket_count_judgment !== rightExplanation.bucket_count_judgment,
    (leftExplanation.weak_or_junk_signals ?? []).join(" | ") !==
      (rightExplanation.weak_or_junk_signals ?? []).join(" | "),
    (leftExplanation.caution_notes ?? []).join(" | ") !==
      (rightExplanation.caution_notes ?? []).join(" | "),
    (leftExplanation.zoom_in_suggestions ?? []).join(" | ") !==
      (rightExplanation.zoom_in_suggestions ?? []).join(" | "),
  ];
  return sections.filter(Boolean).length;
}

function countProjectionDrift(leftDetail, rightDetail) {
  const leftProjection = leftDetail.run_config?.dataset_projection ?? null;
  const rightProjection = rightDetail.run_config?.dataset_projection ?? null;
  const leftFields = (leftProjection?.selected_fields ?? []).map((field) => field.field_name).join("|");
  const rightFields = (rightProjection?.selected_fields ?? []).map((field) => field.field_name).join("|");

  return [
    leftFields !== rightFields,
    (leftProjection?.item_id_field || "implicit_row_index") !==
      (rightProjection?.item_id_field || "implicit_row_index"),
    (leftProjection?.render_mode || "n/a") !== (rightProjection?.render_mode || "n/a"),
  ].filter(Boolean).length;
}

function countBucketDistributionDrift(leftDetail, rightDetail) {
  const leftCounts = new Map(
    (leftDetail.assignment_summary?.bucket_counts || []).map((entry) => [entry.bucket_id, entry.count])
  );
  const rightCounts = new Map(
    (rightDetail.assignment_summary?.bucket_counts || []).map((entry) => [entry.bucket_id, entry.count])
  );
  const bucketIds = [
    ...new Set([
      ...(leftDetail.bucket_plan?.buckets || []).map((bucket) => bucket.bucket_id),
      ...(rightDetail.bucket_plan?.buckets || []).map((bucket) => bucket.bucket_id),
    ]),
  ];

  return bucketIds.reduce(
    (total, bucketId) => total + Math.abs((leftCounts.get(bucketId) ?? 0) - (rightCounts.get(bucketId) ?? 0)),
    0
  );
}

function buildStructuralDriftReadout(leftDetail, rightDetail, insight) {
  const notes = [];
  const leftProjection = leftDetail.run_config?.dataset_projection ?? null;
  const rightProjection = rightDetail.run_config?.dataset_projection ?? null;
  const leftFields = (leftProjection?.selected_fields ?? []).map((field) => field.field_name);
  const rightFields = (rightProjection?.selected_fields ?? []).map((field) => field.field_name);
  const leftOnlyFields = leftFields.filter((field) => !rightFields.includes(field));
  const rightOnlyFields = rightFields.filter((field) => !leftFields.includes(field));

  if (insight.projectionDrift > 0) {
    if (leftOnlyFields.length || rightOnlyFields.length) {
      notes.push(
        `The model saw a different field slice. Left-only fields: ${leftOnlyFields.join(", ") || "none"}. Right-only fields: ${rightOnlyFields.join(", ") || "none"}.`
      );
    } else {
      notes.push("The selected fields stayed similar, but the projection setup changed through ID choice or render mode.");
    }

    const leftIdField = leftProjection?.item_id_field || "implicit_row_index";
    const rightIdField = rightProjection?.item_id_field || "implicit_row_index";
    if (leftIdField !== rightIdField) {
      notes.push(`Item identity changed from ${leftIdField} to ${rightIdField}, which can shift representative anchors and downstream joins.`);
    }

    const leftRenderMode = leftProjection?.render_mode || "n/a";
    const rightRenderMode = rightProjection?.render_mode || "n/a";
    if (leftRenderMode !== rightRenderMode) {
      notes.push(`Render mode moved from ${leftRenderMode} to ${rightRenderMode}, so some drift may come from formatting pressure rather than semantic disagreement.`);
    }
  }

  if (insight.bucketDistributionDrift > 0) {
    const leftCounts = new Map(
      (leftDetail.assignment_summary?.bucket_counts || []).map((entry) => [entry.bucket_id, entry.count])
    );
    const rightCounts = new Map(
      (rightDetail.assignment_summary?.bucket_counts || []).map((entry) => [entry.bucket_id, entry.count])
    );
    const bucketNames = new Map([
      ...(leftDetail.bucket_plan?.buckets || []).map((bucket) => [bucket.bucket_id, bucket.name]),
      ...(rightDetail.bucket_plan?.buckets || []).map((bucket) => [bucket.bucket_id, bucket.name]),
    ]);
    const bucketIds = [
      ...new Set([
        ...(leftDetail.bucket_plan?.buckets || []).map((bucket) => bucket.bucket_id),
        ...(rightDetail.bucket_plan?.buckets || []).map((bucket) => bucket.bucket_id),
      ]),
    ];
    const topShift = bucketIds
      .map((bucketId) => ({
        bucketId,
        name: bucketNames.get(bucketId) || bucketId,
        leftCount: leftCounts.get(bucketId) ?? 0,
        rightCount: rightCounts.get(bucketId) ?? 0,
        delta: Math.abs((leftCounts.get(bucketId) ?? 0) - (rightCounts.get(bucketId) ?? 0)),
      }))
      .sort((left, right) => right.delta - left.delta)[0];

    if (topShift && topShift.delta > 0) {
      notes.push(
        `The largest assignment movement landed in ${topShift.bucketId} (${topShift.name}), shifting from ${topShift.leftCount} to ${topShift.rightCount} items.`
      );
    } else {
      notes.push("Positive bucket counts shifted even though the headline junk and review totals stayed close.");
    }
  }

  if (insight.projectionDrift > 0 && insight.bucketDistributionDrift > 0) {
    notes.push("Because projection drift and bucket distribution drift both fired, treat this as a framing-sensitive semantic shift rather than a pure ontology change.");
  } else if (insight.projectionDrift === 0 && insight.bucketDistributionDrift > 0) {
    notes.push("The model saw the same projected dataset view, so the assignment drift is more likely to reflect genuine bucket-pressure instability.");
  } else if (insight.projectionDrift > 0 && insight.bucketDistributionDrift === 0) {
    notes.push("Projection changed without much bucket-count movement, which suggests the ontology stayed comparatively stable under a different framing.");
  }

  return notes;
}

async function compareExperimentPair(experimentId) {
  const experiment = summarizeExperiments(state.runs).find((entry) => entry.experimentId === experimentId);
  if (!experiment?.hasBothModes) {
    els.comparePairNote.textContent = "That experiment does not yet have both blind and skim runs available.";
    return;
  }
  els.compareLeft.value = experiment.dataSkimRun.output_dir_name;
  els.compareRight.value = experiment.blindLabelRun.output_dir_name;
  saveUiState();
  await compareRuns();
}

async function openExperimentReport(experimentId) {
  const experiment = summarizeExperiments(state.runs).find((entry) => entry.experimentId === experimentId);
  if (!experiment) {
    renderExperimentReport(null, null, null);
    return;
  }
  state.activeExperimentId = experimentId;
  saveUiState();
  if (!experiment.hasBothModes) {
    renderExperimentReport(experiment, null, null);
    return;
  }

  const [leftDetail, rightDetail] = await Promise.all([
    fetchRunDetailCached(experiment.dataSkimRun.output_dir_name),
    fetchRunDetailCached(experiment.blindLabelRun.output_dir_name),
  ]);
  renderExperimentReport(experiment, leftDetail, rightDetail);
}

function renderExperimentReport(experiment, leftDetail, rightDetail) {
  if (!experiment) {
    state.activeExperimentSuggestion = null;
    els.experimentReportMeta.innerHTML = "";
    els.experimentReviewVerdict.value = "unreviewed";
    els.experimentReviewNote.value = "";
    els.experimentReviewStatus.textContent = "No analyst experiment review saved yet.";
    els.experimentReportGrid.innerHTML = `<div class="placeholder">Open an experiment report to inspect paired drift, structural differences, and next-move guidance in one place.</div>`;
    return;
  }

  if (!experiment.hasBothModes || !leftDetail || !rightDetail) {
    state.activeExperimentSuggestion = null;
    els.experimentReportMeta.innerHTML = `
      <span class="meta-pill">Experiment: ${escapeHtml(experiment.experimentId.slice(0, 8))}</span>
      <span class="meta-pill">${escapeHtml(experiment.datasetDisplayName)}</span>
      <span class="meta-pill meta-pill--warn">Partial Pair</span>
    `;
    renderExperimentReview(experiment.experimentId);
    els.experimentReportGrid.innerHTML = `<div class="placeholder">This experiment is missing one genesis mode, so a full paired report is not available yet.</div>`;
    return;
  }

  const insight = state.experimentInsightsById[experiment.experimentId] ?? buildExperimentInsight(leftDetail, rightDetail);
  const trend = buildWatchTrends(state.runs).find((entry) => entry.latestExperiment?.experimentId === experiment.experimentId) ?? null;
  state.activeExperimentSuggestion = trend?.recommendation ?? buildRecommendationFromRegression({
    regression: null,
    latestInsight: insight,
    target: {
      datasetDisplayName: experiment.datasetDisplayName,
      sortIntent: experiment.sortIntent,
    },
    latestExperiment: experiment,
  });
  const bucketDiffs = diffBucketNames(leftDetail.bucket_plan?.buckets ?? [], rightDetail.bucket_plan?.buckets ?? []);
  const keyDifferences = buildKeyDifferences(leftDetail, rightDetail, bucketDiffs);
  const explanationContrast = buildExplanationContrast(leftDetail, rightDetail);
  const distributionRows = buildDistributionRows(leftDetail.assignment_summary, rightDetail.assignment_summary);
  const structuralDrift = buildStructuralDriftReadout(leftDetail, rightDetail, insight);

  els.experimentReportMeta.innerHTML = `
    <span class="meta-pill">Experiment: ${escapeHtml(experiment.experimentId.slice(0, 8))}</span>
    <span class="meta-pill">${escapeHtml(experiment.datasetDisplayName)}</span>
    <span class="meta-pill">${escapeHtml(formatSortIntent(experiment.sortIntent))}</span>
    <span class="meta-pill">Buckets: ${escapeHtml(String(experiment.requestedPositiveBucketCount))}</span>
    <span class="meta-pill ${insight.bucketNameDrift ? "meta-pill--warn" : ""}">Bucket Drift ${escapeHtml(String(insight.bucketNameDrift))}</span>
    <span class="meta-pill ${insight.projectionDrift ? "meta-pill--warn" : ""}">Projection Drift ${escapeHtml(String(insight.projectionDrift))}</span>
    <span class="meta-pill ${insight.bucketDistributionDrift ? "meta-pill--warn" : ""}">Distribution Drift ${escapeHtml(String(insight.bucketDistributionDrift))}</span>
    <span class="meta-pill ${insight.explanationDrift ? "meta-pill--warn" : ""}">Explanation Drift ${escapeHtml(String(insight.explanationDrift))}</span>
    ${state.experimentReviewsById[experiment.experimentId]?.verdict && state.experimentReviewsById[experiment.experimentId].verdict !== "unreviewed" ? `<span class="meta-pill meta-pill--warn">Analyst: ${escapeHtml(humanizeMetric(state.experimentReviewsById[experiment.experimentId].verdict))}</span>` : ""}
  `;
  renderExperimentReview(experiment.experimentId);

  els.experimentReportGrid.innerHTML = `
    <article class="compare-card compare-card--wide">
      <p class="bucket-id">Experiment Report</p>
      <div class="compare-insight-grid">
        <section>
          <p class="bucket-subtitle">Headline Read</p>
          <ul>${renderListOrFallback(keyDifferences, "This pair stayed tightly aligned.")}</ul>
        </section>
        <section>
          <p class="bucket-subtitle">Bucket Name Drift</p>
          <ul>${renderListOrFallback(bucketDiffs, "Positive bucket names stayed aligned slot by slot.")}</ul>
        </section>
        <section>
          <p class="bucket-subtitle">Distribution Drift</p>
          <div class="distribution-list">
            ${distributionRows || `<p class="muted">No assignment summary available to compare.</p>`}
          </div>
        </section>
        <section>
          <p class="bucket-subtitle">Suggested Next Run</p>
          <p>${escapeHtml(state.activeExperimentSuggestion?.rationale ?? "No recommendation available.")}</p>
          <p class="muted">${escapeHtml(state.activeExperimentSuggestion ? `Recipe: ${state.activeExperimentSuggestion.recipeId.replaceAll("_", " ")} | Buckets: ${state.activeExperimentSuggestion.bucketCount}` : "")}</p>
        </section>
        <section class="compare-insight-grid__wide">
          <p class="bucket-subtitle">Structural Drift Readout</p>
          <ul>${renderListOrFallback(structuralDrift, "No structural drift was detected beyond ordinary run-to-run stability.")}</ul>
        </section>
        <section class="compare-insight-grid__wide">
          <p class="bucket-subtitle">Explanation Drift</p>
          <div class="explanation-diff-list">${explanationContrast}</div>
        </section>
      </div>
    </article>
    ${renderComparisonColumn("Data Skim", leftDetail)}
    ${renderComparisonColumn("Blind Label", rightDetail)}
  `;
}

function renderExperimentReview(experimentId) {
  const review = state.experimentReviewsById[experimentId] ?? null;
  els.experimentReviewVerdict.value = review?.verdict || "unreviewed";
  els.experimentReviewNote.value = review?.note || "";
  els.experimentReviewStatus.textContent = review?.updatedAt
    ? `Saved ${formatTimestamp(review.updatedAt)}`
    : "No analyst experiment review saved yet.";
}

function buildExperimentReportMarkdown(experiment, leftDetail, rightDetail, insight) {
  const bucketDiffs = diffBucketNames(leftDetail.bucket_plan?.buckets ?? [], rightDetail.bucket_plan?.buckets ?? []);
  const keyDifferences = buildKeyDifferences(leftDetail, rightDetail, bucketDiffs);
  const structuralDrift = buildStructuralDriftReadout(leftDetail, rightDetail, insight);
  const explanation = [
    ["Intent Interpretation", leftDetail.bucket_plan?.explanation?.sorting_intent_interpretation ?? "", rightDetail.bucket_plan?.explanation?.sorting_intent_interpretation ?? ""],
    ["Bucket Shape Rationale", leftDetail.bucket_plan?.explanation?.bucket_shape_rationale ?? "", rightDetail.bucket_plan?.explanation?.bucket_shape_rationale ?? ""],
    ["Bucket Count Judgment", leftDetail.bucket_plan?.explanation?.bucket_count_judgment ?? "", rightDetail.bucket_plan?.explanation?.bucket_count_judgment ?? ""],
  ];

  const leftBuckets = (leftDetail.bucket_plan?.buckets ?? []).map((bucket) => `- ${bucket.bucket_id}: ${bucket.name}`).join("\n");
  const rightBuckets = (rightDetail.bucket_plan?.buckets ?? []).map((bucket) => `- ${bucket.bucket_id}: ${bucket.name}`).join("\n");
  const diffLines = bucketDiffs.length ? bucketDiffs.map((item) => `- ${item}`).join("\n") : "- Positive bucket names stayed aligned slot by slot.";
  const keyLines = keyDifferences.length ? keyDifferences.map((item) => `- ${item}`).join("\n") : "- This pair stayed tightly aligned.";
  const explanationLines = explanation.map(([label, leftValue, rightValue]) => `## ${label}\n\n**Data Skim**\n${leftValue || "No notable signal recorded."}\n\n**Blind Label**\n${rightValue || "No notable signal recorded."}`).join("\n\n");
  const analystReview = state.experimentReviewsById[experiment.experimentId] ?? null;
  const analystSection = analystReview
    ? `## Analyst Review\n\n- Verdict: ${humanizeMetric(analystReview.verdict)}\n- Note: ${analystReview.note || "No note recorded."}\n\n`
    : "";

  return `# Experiment Report ${experiment.experimentId.slice(0, 8)}

- Dataset: ${experiment.datasetDisplayName}
- Sort intent: ${formatSortIntent(experiment.sortIntent)}
- Requested positive buckets: ${experiment.requestedPositiveBucketCount}
- Bucket drift: ${insight.bucketNameDrift}
- Projection drift: ${insight.projectionDrift}
- Distribution drift: ${insight.bucketDistributionDrift}
- Junk drift: ${insight.junkDrift}
- Review drift: ${insight.reviewDrift}
- Explanation drift: ${insight.explanationDrift}

## Headline Read

${keyLines}

## Structural Drift Readout

${structuralDrift.length ? structuralDrift.map((item) => `- ${item}`).join("\n") : "- No structural drift was detected beyond ordinary run-to-run stability."}

${analystSection}

## Bucket Drift

${diffLines}

## Data Skim Buckets

${leftBuckets || "- None recorded."}

## Blind Label Buckets

${rightBuckets || "- None recorded."}

${explanationLines}
`;
}

function buildExperimentReportHtml(experiment, leftDetail, rightDetail, insight) {
  const bucketDiffs = diffBucketNames(leftDetail.bucket_plan?.buckets ?? [], rightDetail.bucket_plan?.buckets ?? []);
  const keyDifferences = buildKeyDifferences(leftDetail, rightDetail, bucketDiffs);
  const structuralDrift = buildStructuralDriftReadout(leftDetail, rightDetail, insight);
  const leftBuckets = (leftDetail.bucket_plan?.buckets ?? [])
    .map((bucket) => `<li><strong>${escapeHtml(bucket.bucket_id)}</strong>: ${escapeHtml(bucket.name)}</li>`)
    .join("");
  const rightBuckets = (rightDetail.bucket_plan?.buckets ?? [])
    .map((bucket) => `<li><strong>${escapeHtml(bucket.bucket_id)}</strong>: ${escapeHtml(bucket.name)}</li>`)
    .join("");
  const diffLines = bucketDiffs.length
    ? bucketDiffs.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>Positive bucket names stayed aligned slot by slot.</li>`;
  const keyLines = keyDifferences.length
    ? keyDifferences.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>This pair stayed tightly aligned.</li>`;
  const analystReview = state.experimentReviewsById[experiment.experimentId] ?? null;
  const explanationRows = [
    ["Intent Interpretation", leftDetail.bucket_plan?.explanation?.sorting_intent_interpretation ?? "", rightDetail.bucket_plan?.explanation?.sorting_intent_interpretation ?? ""],
    ["Bucket Shape Rationale", leftDetail.bucket_plan?.explanation?.bucket_shape_rationale ?? "", rightDetail.bucket_plan?.explanation?.bucket_shape_rationale ?? ""],
    ["Bucket Count Judgment", leftDetail.bucket_plan?.explanation?.bucket_count_judgment ?? "", rightDetail.bucket_plan?.explanation?.bucket_count_judgment ?? ""],
  ]
    .map(
      ([label, leftValue, rightValue]) => `
        <section class="diff-row">
          <h3>${escapeHtml(label)}</h3>
          <div class="diff-grid">
            <div><p class="eyebrow">Data Skim</p><p>${escapeHtml(leftValue || "No notable signal recorded.")}</p></div>
            <div><p class="eyebrow">Blind Label</p><p>${escapeHtml(rightValue || "No notable signal recorded.")}</p></div>
          </div>
        </section>
      `
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Experiment Report ${escapeHtml(experiment.experimentId.slice(0, 8))}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin: 32px; color: #1f1a14; background: #f7f2e8; }
    .card { background: #fffdf8; border: 1px solid #d6c7aa; border-radius: 18px; padding: 18px; margin-bottom: 18px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .pill { display: inline-block; margin: 0 8px 8px 0; padding: 6px 10px; border: 1px solid #d6c7aa; border-radius: 999px; background: #efe3ca; }
    .eyebrow { font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: #0e766e; margin: 0 0 6px; }
    .diff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    h1, h2, h3, p { margin-top: 0; }
    ul { margin: 0; padding-left: 18px; }
  </style>
</head>
<body>
  <div class="card">
    <p class="eyebrow">Experiment Report</p>
    <h1>${escapeHtml(experiment.datasetDisplayName)}</h1>
    <div>
      <span class="pill">Experiment ${escapeHtml(experiment.experimentId.slice(0, 8))}</span>
      <span class="pill">${escapeHtml(formatSortIntent(experiment.sortIntent))}</span>
      <span class="pill">Buckets ${escapeHtml(String(experiment.requestedPositiveBucketCount))}</span>
      <span class="pill">Bucket Drift ${escapeHtml(String(insight.bucketNameDrift))}</span>
      <span class="pill">Projection Drift ${escapeHtml(String(insight.projectionDrift))}</span>
      <span class="pill">Distribution Drift ${escapeHtml(String(insight.bucketDistributionDrift))}</span>
      <span class="pill">Junk Drift ${escapeHtml(String(insight.junkDrift))}</span>
      <span class="pill">Review Drift ${escapeHtml(String(insight.reviewDrift))}</span>
      <span class="pill">Explanation Drift ${escapeHtml(String(insight.explanationDrift))}</span>
    </div>
  </div>
  <div class="card">
    <p class="eyebrow">Headline Read</p>
    <ul>${keyLines}</ul>
  </div>
  <div class="card">
    <p class="eyebrow">Structural Drift Readout</p>
    <ul>${structuralDrift.length ? structuralDrift.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : "<li>No structural drift was detected beyond ordinary run-to-run stability.</li>"}</ul>
  </div>
  ${analystReview ? `
  <div class="card">
    <p class="eyebrow">Analyst Review</p>
    <p><strong>Verdict:</strong> ${escapeHtml(humanizeMetric(analystReview.verdict))}</p>
    <p>${escapeHtml(analystReview.note || "No note recorded.")}</p>
  </div>` : ""}
  <div class="grid">
    <div class="card">
      <p class="eyebrow">Bucket Drift</p>
      <ul>${diffLines}</ul>
    </div>
    <div class="card">
      <p class="eyebrow">Distribution Drift</p>
      <p>Projection drift: ${escapeHtml(String(insight.projectionDrift))}</p>
      <p>Bucket distribution drift: ${escapeHtml(String(insight.bucketDistributionDrift))}</p>
      <p>Junk drift: ${escapeHtml(String(insight.junkDrift))}</p>
      <p>Review drift: ${escapeHtml(String(insight.reviewDrift))}</p>
    </div>
  </div>
  <div class="grid">
    <div class="card">
      <p class="eyebrow">Data Skim Buckets</p>
      <ul>${leftBuckets || "<li>None recorded.</li>"}</ul>
    </div>
    <div class="card">
      <p class="eyebrow">Blind Label Buckets</p>
      <ul>${rightBuckets || "<li>None recorded.</li>"}</ul>
    </div>
  </div>
  <div class="card">
    <p class="eyebrow">Explanation Drift</p>
    ${explanationRows}
  </div>
</body>
</html>`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toCsvValue(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll(`"`, `""`)}"`;
}

function buildCsv(rows) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const lines = [
    columns.map((column) => toCsvValue(column)).join(","),
    ...rows.map((row) => columns.map((column) => toCsvValue(row[column])).join(",")),
  ];
  return lines.join("\n");
}

async function collectReviewedRunArtifacts() {
  const reviewedRuns = state.runs.filter((run) => {
    const review = state.runReviewsByOutputDir[run.output_dir_name];
    return review && review.verdict !== "unreviewed";
  });

  return Promise.all(
    reviewedRuns.map(async (run) => {
      const detail = await fetchRunDetailCached(run.output_dir_name);
      const review = state.runReviewsByOutputDir[run.output_dir_name];
      const manifestDataset = detail.run_manifest?.dataset ?? {};
      return {
        outputDir: run.output_dir_name,
        datasetId: manifestDataset.dataset_id || "",
        datasetDisplayName: run.dataset_display_name,
        sortIntent: run.sort_intent,
        bucketGenesisMode: run.bucket_genesis_mode,
        requestedPositiveBucketCount: run.requested_positive_bucket_count,
        totalItems: run.total_items ?? 0,
        junkCount: run.junk_count ?? 0,
        reviewFlagCount: run.review_flag_count ?? 0,
        verdict: review.verdict,
        updatedAt: review.updatedAt || "",
        analystNote: review.note || "",
        humanSummary: detail.run_summary_markdown || "",
      };
    })
  );
}

async function collectReviewedExperimentArtifacts() {
  const experiments = summarizeExperiments(state.runs).filter((experiment) => {
    const review = state.experimentReviewsById[experiment.experimentId];
    return review && review.verdict !== "unreviewed";
  });

  return Promise.all(
    experiments.map(async (experiment) => {
      const review = state.experimentReviewsById[experiment.experimentId];
      if (!experiment.hasBothModes) {
        return {
          experimentId: experiment.experimentId,
          datasetDisplayName: experiment.datasetDisplayName,
          sortIntent: experiment.sortIntent,
        requestedPositiveBucketCount: experiment.requestedPositiveBucketCount,
        hasBothModes: false,
        bucketNameDrift: "",
        projectionDrift: "",
        bucketDistributionDrift: "",
        junkDrift: "",
        reviewDrift: "",
        explanationDrift: "",
          verdict: review.verdict,
          updatedAt: review.updatedAt || "",
          analystNote: review.note || "",
          humanReport: "Partial pair only. Full paired report not yet available.",
        };
      }

      const [leftDetail, rightDetail] = await Promise.all([
        fetchRunDetailCached(experiment.dataSkimRun.output_dir_name),
        fetchRunDetailCached(experiment.blindLabelRun.output_dir_name),
      ]);
      const insight =
        state.experimentInsightsById[experiment.experimentId] ??
        buildExperimentInsight(leftDetail, rightDetail);

      return {
        experimentId: experiment.experimentId,
        datasetDisplayName: experiment.datasetDisplayName,
        sortIntent: experiment.sortIntent,
        requestedPositiveBucketCount: experiment.requestedPositiveBucketCount,
        hasBothModes: true,
        bucketNameDrift: insight.bucketNameDrift,
        projectionDrift: insight.projectionDrift,
        bucketDistributionDrift: insight.bucketDistributionDrift,
        junkDrift: insight.junkDrift,
        reviewDrift: insight.reviewDrift,
        explanationDrift: insight.explanationDrift,
        verdict: review.verdict,
        updatedAt: review.updatedAt || "",
        analystNote: review.note || "",
        humanReport: buildExperimentReportMarkdown(experiment, leftDetail, rightDetail, insight),
      };
    })
  );
}

async function exportExperimentReport() {
  if (!state.activeExperimentId) return;
  const experiment = summarizeExperiments(state.runs).find((entry) => entry.experimentId === state.activeExperimentId);
  if (!experiment?.hasBothModes) return;
  const [leftDetail, rightDetail] = await Promise.all([
    fetchRunDetailCached(experiment.dataSkimRun.output_dir_name),
    fetchRunDetailCached(experiment.blindLabelRun.output_dir_name),
  ]);
  const insight = state.experimentInsightsById[experiment.experimentId] ?? buildExperimentInsight(leftDetail, rightDetail);
  const markdown = buildExperimentReportMarkdown(experiment, leftDetail, rightDetail, insight);
  downloadBlob(
    `experiment-${experiment.experimentId.slice(0, 8)}-report.md`,
    new Blob([markdown], { type: "text/markdown;charset=utf-8" })
  );
}

async function exportExperimentReportHtml() {
  if (!state.activeExperimentId) return;
  const experiment = summarizeExperiments(state.runs).find((entry) => entry.experimentId === state.activeExperimentId);
  if (!experiment?.hasBothModes) return;
  const [leftDetail, rightDetail] = await Promise.all([
    fetchRunDetailCached(experiment.dataSkimRun.output_dir_name),
    fetchRunDetailCached(experiment.blindLabelRun.output_dir_name),
  ]);
  const insight = state.experimentInsightsById[experiment.experimentId] ?? buildExperimentInsight(leftDetail, rightDetail);
  const html = buildExperimentReportHtml(experiment, leftDetail, rightDetail, insight);
  downloadBlob(
    `experiment-${experiment.experimentId.slice(0, 8)}-report.html`,
    new Blob([html], { type: "text/html;charset=utf-8" })
  );
}

async function exportCompleteExperimentsBatch() {
  const completeExperiments = summarizeExperiments(state.runs).filter((experiment) => experiment.hasBothModes);
  if (!completeExperiments.length) return;
  const sections = [];
  for (const experiment of completeExperiments) {
    const [leftDetail, rightDetail] = await Promise.all([
      fetchRunDetailCached(experiment.dataSkimRun.output_dir_name),
      fetchRunDetailCached(experiment.blindLabelRun.output_dir_name),
    ]);
    const insight = state.experimentInsightsById[experiment.experimentId] ?? buildExperimentInsight(leftDetail, rightDetail);
    sections.push(buildExperimentReportMarkdown(experiment, leftDetail, rightDetail, insight));
  }
  const batchBody = sections.join("\n\n---\n\n");
  downloadBlob(
    `complete-experiments-batch-${new Date().toISOString().slice(0, 10)}.md`,
    new Blob([batchBody], { type: "text/markdown;charset=utf-8" })
  );
}

async function exportReviewedRunsBatch() {
  const reviewedRuns = await collectReviewedRunArtifacts();
  if (!reviewedRuns.length) return;

  const sections = reviewedRuns.map((run) => `# Reviewed Run ${run.outputDir}

- Dataset: ${run.datasetDisplayName}
- Sort intent: ${formatSortIntent(run.sortIntent)}
- Verdict: ${humanizeMetric(run.verdict)}
- Updated at: ${run.updatedAt || "n/a"}

## Analyst Note

${run.analystNote || "No note recorded."}

## Human Run Summary

${run.humanSummary || "No human summary available."}
`);

  downloadBlob(
    `reviewed-runs-batch-${new Date().toISOString().slice(0, 10)}.md`,
    new Blob([sections.join("\n\n---\n\n")], {
      type: "text/markdown;charset=utf-8",
    })
  );
}

async function exportReviewedExperimentsBatch() {
  const experiments = await collectReviewedExperimentArtifacts();
  if (!experiments.length) return;

  const sections = experiments.map((experiment) => experiment.humanReport);

  downloadBlob(
    `reviewed-experiments-batch-${new Date().toISOString().slice(0, 10)}.md`,
    new Blob([sections.join("\n\n---\n\n")], {
      type: "text/markdown;charset=utf-8",
    })
  );
}

async function exportReviewedRunsJson() {
  const reviewedRuns = await collectReviewedRunArtifacts();
  if (!reviewedRuns.length) return;
  downloadBlob(
    `reviewed-runs-batch-${new Date().toISOString().slice(0, 10)}.json`,
    new Blob([JSON.stringify(reviewedRuns, null, 2)], {
      type: "application/json;charset=utf-8",
    })
  );
}

async function exportReviewedRunsCsv() {
  const reviewedRuns = await collectReviewedRunArtifacts();
  if (!reviewedRuns.length) return;
  const csvRows = reviewedRuns.map((run) => ({
    output_dir: run.outputDir,
    dataset_id: run.datasetId,
    dataset_display_name: run.datasetDisplayName,
    sort_intent: run.sortIntent,
    bucket_genesis_mode: run.bucketGenesisMode,
    requested_positive_bucket_count: run.requestedPositiveBucketCount,
    total_items: run.totalItems,
    junk_count: run.junkCount,
    review_flag_count: run.reviewFlagCount,
    verdict: run.verdict,
    updated_at: run.updatedAt,
    analyst_note: run.analystNote,
  }));
  downloadBlob(
    `reviewed-runs-batch-${new Date().toISOString().slice(0, 10)}.csv`,
    new Blob([buildCsv(csvRows)], {
      type: "text/csv;charset=utf-8",
    })
  );
}

async function exportReviewedExperimentsJson() {
  const experiments = await collectReviewedExperimentArtifacts();
  if (!experiments.length) return;
  downloadBlob(
    `reviewed-experiments-batch-${new Date().toISOString().slice(0, 10)}.json`,
    new Blob([JSON.stringify(experiments, null, 2)], {
      type: "application/json;charset=utf-8",
    })
  );
}

async function exportReviewedExperimentsCsv() {
  const experiments = await collectReviewedExperimentArtifacts();
  if (!experiments.length) return;
  const csvRows = experiments.map((experiment) => ({
    experiment_id: experiment.experimentId,
    dataset_display_name: experiment.datasetDisplayName,
    sort_intent: experiment.sortIntent,
    requested_positive_bucket_count: experiment.requestedPositiveBucketCount,
    has_both_modes: experiment.hasBothModes,
    bucket_name_drift: experiment.bucketNameDrift,
    projection_drift: experiment.projectionDrift,
    bucket_distribution_drift: experiment.bucketDistributionDrift,
    junk_drift: experiment.junkDrift,
    review_drift: experiment.reviewDrift,
    explanation_drift: experiment.explanationDrift,
    verdict: experiment.verdict,
    updated_at: experiment.updatedAt,
    analyst_note: experiment.analystNote,
  }));
  downloadBlob(
    `reviewed-experiments-batch-${new Date().toISOString().slice(0, 10)}.csv`,
    new Blob([buildCsv(csvRows)], {
      type: "text/csv;charset=utf-8",
    })
  );
}

function mergeAnalysisStatePayload(currentPayload, importedPayload) {
  const watchTargets = new Map(
    (currentPayload.watch_targets || []).map((target) => [target.watch_key, target])
  );
  for (const target of importedPayload.watch_targets || []) {
    watchTargets.set(target.watch_key, target);
  }

  const runReviews = new Map(
    (currentPayload.run_reviews || []).map((review) => [review.output_dir_name, review])
  );
  for (const review of importedPayload.run_reviews || []) {
    runReviews.set(review.output_dir_name, review);
  }

  const experimentReviews = new Map(
    (currentPayload.experiment_reviews || []).map((review) => [review.experiment_id, review])
  );
  for (const review of importedPayload.experiment_reviews || []) {
    experimentReviews.set(review.experiment_id, review);
  }

  const experimentInsights = new Map(
    (currentPayload.experiment_insights || []).map((insight) => [insight.experiment_id, insight])
  );
  for (const insight of importedPayload.experiment_insights || []) {
    experimentInsights.set(insight.experiment_id, insight);
  }

  return {
    watch_targets: [...watchTargets.values()],
    alerted_experiment_ids: [...new Set([
      ...(currentPayload.alerted_experiment_ids || []),
      ...(importedPayload.alerted_experiment_ids || []),
    ])],
    run_reviews: [...runReviews.values()],
    experiment_reviews: [...experimentReviews.values()],
    experiment_insights: [...experimentInsights.values()],
  };
}

function diffKeyedEntries(currentEntries, nextEntries, keyField, describeChange) {
  const currentMap = new Map((currentEntries || []).map((entry) => [entry[keyField], entry]));
  const nextMap = new Map((nextEntries || []).map((entry) => [entry[keyField], entry]));
  const added = [];
  const updated = [];
  const unchanged = [];
  const removed = [];

  for (const [key, nextEntry] of nextMap.entries()) {
    const currentEntry = currentMap.get(key);
    if (!currentEntry) {
      added.push(describeChange(null, nextEntry));
      continue;
    }
    if (JSON.stringify(currentEntry) === JSON.stringify(nextEntry)) {
      unchanged.push(describeChange(currentEntry, nextEntry));
      continue;
    }
    updated.push(describeChange(currentEntry, nextEntry));
  }

  for (const [key, currentEntry] of currentMap.entries()) {
    if (!nextMap.has(key)) {
      removed.push(describeChange(currentEntry, null));
    }
  }

  return { added, updated, unchanged, removed };
}

function buildAnalysisImportPreview(currentPayload, importedPayload, nextPayload, mode, fileName) {
  const watchDiff = diffKeyedEntries(
    currentPayload.watch_targets,
    nextPayload.watch_targets,
    "watch_key",
    (current, next) => {
      const item = next || current;
      return `${item.watch_key} (${formatSortIntent(item.sort_intent)} / ${item.dataset_display_name})`;
    }
  );
  const runDiff = diffKeyedEntries(
    currentPayload.run_reviews,
    nextPayload.run_reviews,
    "output_dir_name",
    (current, next) => {
      const item = next || current;
      const before = current ? humanizeMetric(current.verdict) : "new";
      const after = next ? humanizeMetric(next.verdict) : "removed";
      return `${item.output_dir_name}: ${before} -> ${after}`;
    }
  );
  const experimentDiff = diffKeyedEntries(
    currentPayload.experiment_reviews,
    nextPayload.experiment_reviews,
    "experiment_id",
    (current, next) => {
      const item = next || current;
      const before = current ? humanizeMetric(current.verdict) : "new";
      const after = next ? humanizeMetric(next.verdict) : "removed";
      return `${item.experiment_id.slice(0, 8)}: ${before} -> ${after}`;
    }
  );
  const insightDiff = diffKeyedEntries(
    currentPayload.experiment_insights,
    nextPayload.experiment_insights,
    "experiment_id",
    (current, next) => {
      const item = next || current;
      const before = current ? current.interestingness_score : "new";
      const after = next ? next.interestingness_score : "removed";
      return `${item.experiment_id.slice(0, 8)}: ${before} -> ${after}`;
    }
  );
  const currentAlerts = new Set(currentPayload.alerted_experiment_ids || []);
  const nextAlerts = new Set(nextPayload.alerted_experiment_ids || []);
  const alertAdded = [...nextAlerts].filter((id) => !currentAlerts.has(id));
  const alertRemoved = [...currentAlerts].filter((id) => !nextAlerts.has(id));

  return {
    fileName,
    mode,
    importedPayload,
    nextPayload,
    details: {
      watchDiff,
      runDiff,
      experimentDiff,
      insightDiff,
      alertAdded,
      alertRemoved,
    },
    summary: {
      watchAdded: watchDiff.added.length,
      watchUpdated: watchDiff.updated.length,
      watchRemoved: watchDiff.removed.length,
      runAdded: runDiff.added.length,
      runUpdated: runDiff.updated.length,
      runRemoved: runDiff.removed.length,
      experimentAdded: experimentDiff.added.length,
      experimentUpdated: experimentDiff.updated.length,
      experimentRemoved: experimentDiff.removed.length,
      insightAdded: insightDiff.added.length,
      insightUpdated: insightDiff.updated.length,
      insightRemoved: insightDiff.removed.length,
      alertsAdded: alertAdded.length,
      alertsRemoved: alertRemoved.length,
    },
    highlights: [
      ...watchDiff.added.slice(0, 3).map((item) => `Watch add: ${item}`),
      ...watchDiff.updated.slice(0, 3).map((item) => `Watch update: ${item}`),
      ...runDiff.added.slice(0, 3).map((item) => `Run add: ${item}`),
      ...runDiff.updated.slice(0, 3).map((item) => `Run update: ${item}`),
      ...experimentDiff.added.slice(0, 3).map((item) => `Experiment add: ${item}`),
      ...experimentDiff.updated.slice(0, 3).map((item) => `Experiment update: ${item}`),
      ...insightDiff.added.slice(0, 3).map((item) => `Insight add: ${item}`),
      ...insightDiff.updated.slice(0, 3).map((item) => `Insight update: ${item}`),
      ...alertAdded.slice(0, 3).map((item) => `Alert add: ${item.slice(0, 8)}`),
      ...alertRemoved.slice(0, 3).map((item) => `Alert remove: ${item.slice(0, 8)}`),
    ],
  };
}

function refreshAnalysisViews() {
  renderRunHistory(state.runs);
  renderExperimentHistory(state.runs);
  renderAnalysisSnapshots();
  if (state.activeRunOutputDir) {
    loadRunDetail(state.activeRunOutputDir);
  }
  if (state.activeExperimentId) {
    openExperimentReport(state.activeExperimentId);
  }
}

function setAnalysisSnapshotStatus(message, isError = false) {
  els.analysisSnapshotStatus.className = isError ? "summary-note" : "summary-note muted";
  els.analysisSnapshotStatus.textContent = message;
}

function renderImportSnapshotOptions() {
  if (!state.analysisSnapshots.length) {
    els.analysisStateImportExistingSnapshot.innerHTML = `<option value="">Choose snapshot</option>`;
    return;
  }
  const options = [
    `<option value="">Choose snapshot</option>`,
    ...[...state.analysisSnapshots]
      .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
      .map(
        (snapshot) =>
          `<option value="${escapeHtml(snapshot.snapshotId)}">${escapeHtml(snapshot.name)}</option>`
      ),
  ];
  const currentValue = els.analysisStateImportExistingSnapshot.value;
  els.analysisStateImportExistingSnapshot.innerHTML = options.join("");
  if (
    currentValue &&
    state.analysisSnapshots.some((snapshot) => snapshot.snapshotId === currentValue)
  ) {
    els.analysisStateImportExistingSnapshot.value = currentValue;
  }
}

function buildAnalysisStateDiff(leftPayload, rightPayload, leftMeta, rightMeta) {
  const watchDiff = diffKeyedEntries(
    leftPayload.watch_targets,
    rightPayload.watch_targets,
    "watch_key",
    (current, next) => {
      const item = next || current;
      return `${item.watch_key} (${formatSortIntent(item.sort_intent)} / ${item.dataset_display_name})`;
    }
  );
  const runDiff = diffKeyedEntries(
    leftPayload.run_reviews,
    rightPayload.run_reviews,
    "output_dir_name",
    (current, next) => {
      const item = next || current;
      const before = current ? humanizeMetric(current.verdict) : "missing";
      const after = next ? humanizeMetric(next.verdict) : "missing";
      return `${item.output_dir_name}: ${before} -> ${after}`;
    }
  );
  const experimentDiff = diffKeyedEntries(
    leftPayload.experiment_reviews,
    rightPayload.experiment_reviews,
    "experiment_id",
    (current, next) => {
      const item = next || current;
      const before = current ? humanizeMetric(current.verdict) : "missing";
      const after = next ? humanizeMetric(next.verdict) : "missing";
      return `${item.experiment_id.slice(0, 8)}: ${before} -> ${after}`;
    }
  );
  const insightDiff = diffKeyedEntries(
    leftPayload.experiment_insights,
    rightPayload.experiment_insights,
    "experiment_id",
    (current, next) => {
      const item = next || current;
      const before = current ? current.interestingness_score : "missing";
      const after = next ? next.interestingness_score : "missing";
      return `${item.experiment_id.slice(0, 8)}: score ${before} -> ${after}`;
    }
  );
  const leftAlerts = new Set(leftPayload.alerted_experiment_ids || []);
  const rightAlerts = new Set(rightPayload.alerted_experiment_ids || []);
  const alertsOnlyInRight = [...rightAlerts].filter((id) => !leftAlerts.has(id));
  const alertsOnlyInLeft = [...leftAlerts].filter((id) => !rightAlerts.has(id));

  return {
    leftLabel: leftMeta.label,
    rightLabel: rightMeta.label,
    leftNote: leftMeta.note || "",
    rightNote: rightMeta.note || "",
    leftCreatedAt: leftMeta.createdAt || null,
    rightCreatedAt: rightMeta.createdAt || null,
    summary: {
      watchOnlyInLeft: watchDiff.removed.length,
      watchOnlyInRight: watchDiff.added.length,
      watchChanged: watchDiff.updated.length,
      runOnlyInLeft: runDiff.removed.length,
      runOnlyInRight: runDiff.added.length,
      runChanged: runDiff.updated.length,
      experimentOnlyInLeft: experimentDiff.removed.length,
      experimentOnlyInRight: experimentDiff.added.length,
      experimentChanged: experimentDiff.updated.length,
      insightOnlyInLeft: insightDiff.removed.length,
      insightOnlyInRight: insightDiff.added.length,
      insightChanged: insightDiff.updated.length,
      alertsOnlyInLeft: alertsOnlyInLeft.length,
      alertsOnlyInRight: alertsOnlyInRight.length,
    },
    details: {
      watchDiff,
      runDiff,
      experimentDiff,
      insightDiff,
      alertsOnlyInLeft,
      alertsOnlyInRight,
    },
  };
}

function renderAnalysisSnapshotCompareControls() {
  const snapshots = [...state.analysisSnapshots].sort((left, right) => {
    return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
  });
  if (!snapshots.length) {
    els.analysisSnapshotCompareLeft.innerHTML = `<option value="">No snapshots</option>`;
    els.analysisSnapshotCompareRight.innerHTML = `<option value="">No snapshots</option>`;
    els.analysisSnapshotCompareSummary.className = "summary-panel muted";
    els.analysisSnapshotCompareSummary.textContent =
      "Pick two named analyst snapshots to compare how verdicts, watch targets, and alert tracking shifted.";
    els.analysisSnapshotCompareGrid.innerHTML = `<div class="placeholder">No snapshot comparison loaded yet. Pick two snapshots and compare them to surface review-state drift.</div>`;
    return;
  }

  const options = snapshots
    .map((snapshot) => `<option value="${escapeHtml(snapshot.snapshotId)}">${escapeHtml(snapshot.name)}</option>`)
    .join("");
  els.analysisSnapshotCompareLeft.innerHTML = options;
  els.analysisSnapshotCompareRight.innerHTML = options;
  if (!els.analysisSnapshotCompareLeft.value) {
    els.analysisSnapshotCompareLeft.value = snapshots[0].snapshotId;
  }
  if (!els.analysisSnapshotCompareRight.value) {
    els.analysisSnapshotCompareRight.value = snapshots[Math.min(1, snapshots.length - 1)].snapshotId;
  }
}

function renderAnalysisSnapshots() {
  const snapshots = [...state.analysisSnapshots].sort((left, right) => {
    return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
  });
  const filter = state.analysisSnapshotFilter.trim().toLowerCase();
  const filteredSnapshots = filter
    ? snapshots.filter((snapshot) => {
        const haystack = [
          snapshot.name,
          snapshot.note,
          ...(snapshot.tags || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(filter);
      })
    : snapshots;
  if (!snapshots.length) {
    els.analysisSnapshotHistory.innerHTML = `<div class="placeholder">No named analyst snapshots yet. Save one when you want to checkpoint the current review state.</div>`;
    renderAnalysisSnapshotCompareControls();
    return;
  }
  if (!filteredSnapshots.length) {
    els.analysisSnapshotHistory.innerHTML = `<div class="placeholder">No snapshots match the current name/tag filter.</div>`;
    renderAnalysisSnapshotCompareControls();
    return;
  }

  els.analysisSnapshotHistory.innerHTML = filteredSnapshots
    .map((snapshot) => `
      <article class="run-card">
        <div class="run-card__header">
          <div>
            <p class="bucket-id">Snapshot</p>
            <h3>${escapeHtml(snapshot.name)}</h3>
          </div>
          <div class="button-row button-row--tight">
            <button class="button button--ghost analysis-snapshot-left-btn" data-snapshot="${escapeHtml(snapshot.snapshotId)}">Use As Left</button>
            <button class="button button--ghost analysis-snapshot-right-btn" data-snapshot="${escapeHtml(snapshot.snapshotId)}">Use As Right</button>
            <button class="button button--ghost analysis-snapshot-load-btn" data-snapshot="${escapeHtml(snapshot.snapshotId)}">Load</button>
            <button class="button button--ghost analysis-snapshot-export-btn" data-snapshot="${escapeHtml(snapshot.snapshotId)}">Export</button>
            <button class="button button--ghost analysis-snapshot-report-btn" data-snapshot="${escapeHtml(snapshot.snapshotId)}">Summary Report</button>
            <button class="button button--ghost analysis-snapshot-save-meta-btn" data-snapshot="${escapeHtml(snapshot.snapshotId)}">Save Meta</button>
            <button class="button button--ghost analysis-snapshot-delete-btn" data-snapshot="${escapeHtml(snapshot.snapshotId)}">Delete</button>
          </div>
        </div>
        <div class="meta-strip">
          <span class="meta-pill">Created ${escapeHtml(formatTimestamp(snapshot.createdAt))}</span>
          <span class="meta-pill">Watch: ${escapeHtml(String(snapshot.state.watch_targets.length))}</span>
          <span class="meta-pill">Run Reviews: ${escapeHtml(String(snapshot.state.run_reviews.length))}</span>
          <span class="meta-pill">Experiment Reviews: ${escapeHtml(String(snapshot.state.experiment_reviews.length))}</span>
          <span class="meta-pill">Experiment Insights: ${escapeHtml(String((snapshot.state.experiment_insights || []).length))}</span>
          ${snapshot.tags?.length ? snapshot.tags.map((tag) => `<span class="meta-pill">${escapeHtml(tag)}</span>`).join("") : ""}
        </div>
        <div class="form-grid">
          <label>
            <span>Name</span>
            <input class="analysis-snapshot-name-input" data-snapshot="${escapeHtml(snapshot.snapshotId)}" type="text" value="${escapeHtml(snapshot.name)}">
          </label>
          <label>
            <span>Tags</span>
            <input class="analysis-snapshot-tags-input" data-snapshot="${escapeHtml(snapshot.snapshotId)}" type="text" value="${escapeHtml((snapshot.tags || []).join(", "))}" placeholder="topic, baseline, rerun">
          </label>
          <label class="form-grid__wide">
            <span>Note</span>
            <textarea class="analysis-snapshot-note-input" data-snapshot="${escapeHtml(snapshot.snapshotId)}" rows="3" placeholder="Why does this snapshot matter?">${escapeHtml(snapshot.note || "")}</textarea>
          </label>
        </div>
        ${snapshot.note ? `<p class="muted">${escapeHtml(snapshot.note)}</p>` : ""}
      </article>
    `)
    .join("");

  for (const button of document.querySelectorAll(".analysis-snapshot-left-btn")) {
    button.addEventListener("click", () => assignAnalysisSnapshotCompareSlot("left", button.dataset.snapshot));
  }
  for (const button of document.querySelectorAll(".analysis-snapshot-right-btn")) {
    button.addEventListener("click", () => assignAnalysisSnapshotCompareSlot("right", button.dataset.snapshot));
  }
  for (const button of document.querySelectorAll(".analysis-snapshot-load-btn")) {
    button.addEventListener("click", () => loadAnalysisSnapshot(button.dataset.snapshot));
  }
  for (const button of document.querySelectorAll(".analysis-snapshot-export-btn")) {
    button.addEventListener("click", () => exportAnalysisSnapshot(button.dataset.snapshot));
  }
  for (const button of document.querySelectorAll(".analysis-snapshot-report-btn")) {
    button.addEventListener("click", () => exportAnalysisSnapshotReport(button.dataset.snapshot));
  }
  for (const button of document.querySelectorAll(".analysis-snapshot-save-meta-btn")) {
    button.addEventListener("click", () => updateAnalysisSnapshotMetadata(button.dataset.snapshot));
  }
  for (const button of document.querySelectorAll(".analysis-snapshot-delete-btn")) {
    button.addEventListener("click", () => deleteAnalysisSnapshot(button.dataset.snapshot));
  }
  renderImportSnapshotOptions();
  renderAnalysisSnapshotCompareControls();
}

function assignAnalysisSnapshotCompareSlot(side, snapshotId) {
  const snapshot = state.analysisSnapshots.find((item) => item.snapshotId === snapshotId);
  if (!snapshot) return;
  renderAnalysisSnapshotCompareControls();
  if (side === "left") {
    els.analysisSnapshotCompareLeft.value = snapshotId;
  } else {
    els.analysisSnapshotCompareRight.value = snapshotId;
  }
  els.analysisSnapshotCompareSummary.className = "summary-panel";
  els.analysisSnapshotCompareSummary.innerHTML = `
    <span class="meta-pill">${escapeHtml(snapshot.name)}</span>
    <span class="meta-pill">Pinned to ${escapeHtml(side === "left" ? "left" : "right")} compare slot</span>
    <span class="meta-pill">Created ${escapeHtml(formatTimestamp(snapshot.createdAt))}</span>
  `;
}

function renderAnalysisSnapshotDiff(diff) {
  const summary = diff.summary;
  const changedOnly = state.analysisSnapshotCompareMode === "changed_only";
  const renderSection = (title, items) => `
    <section>
      <p class="bucket-id">${escapeHtml(title)}</p>
      ${items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="muted">No differences.</p>`}
    </section>
  `;
  const sections = [
    { title: `${diff.leftLabel} only watch targets`, items: diff.details.watchDiff.removed },
    { title: `${diff.rightLabel} only watch targets`, items: diff.details.watchDiff.added },
    { title: `Changed run reviews`, items: diff.details.runDiff.updated },
    { title: `Changed experiment reviews`, items: diff.details.experimentDiff.updated },
    { title: `${diff.leftLabel} only experiment insights`, items: diff.details.insightDiff.removed },
    { title: `${diff.rightLabel} only experiment insights`, items: diff.details.insightDiff.added },
    { title: `Changed experiment insights`, items: diff.details.insightDiff.updated },
    { title: `${diff.leftLabel} only alerts`, items: diff.details.alertsOnlyInLeft.map((item) => item.slice(0, 8)) },
    { title: `${diff.rightLabel} only alerts`, items: diff.details.alertsOnlyInRight.map((item) => item.slice(0, 8)) },
  ];
  const visibleSections = changedOnly ? sections.filter((section) => section.items.length) : sections;
  const sectionsHtml = visibleSections.length
    ? visibleSections.map((section) => renderSection(section.title, section.items)).join("")
    : `<section class="compare-insight-grid__wide"><p class="bucket-id">Changed Sections</p><p class="muted">No changed sections remain after filtering. These snapshots match across tracked analyst-state dimensions.</p></section>`;

  els.analysisSnapshotCompareSummary.className = "summary-panel";
  els.analysisSnapshotCompareSummary.innerHTML = `
    <span class="meta-pill">${escapeHtml(diff.leftLabel)}</span>
    <span class="meta-pill">${escapeHtml(diff.rightLabel)}</span>
    <span class="meta-pill">${escapeHtml(changedOnly ? "Changed Only" : "Show All Sections")}</span>
    <span class="meta-pill">Left Created ${escapeHtml(formatTimestamp(diff.leftCreatedAt))}</span>
    <span class="meta-pill">Right Created ${escapeHtml(formatTimestamp(diff.rightCreatedAt))}</span>
    <span class="meta-pill">Run Changes: ${escapeHtml(String(summary.runOnlyInLeft + summary.runOnlyInRight + summary.runChanged))}</span>
    <span class="meta-pill">Experiment Changes: ${escapeHtml(String(summary.experimentOnlyInLeft + summary.experimentOnlyInRight + summary.experimentChanged))}</span>
    <span class="meta-pill">Insight Changes: ${escapeHtml(String(summary.insightOnlyInLeft + summary.insightOnlyInRight + summary.insightChanged))}</span>
    <span class="meta-pill">Watch Changes: ${escapeHtml(String(summary.watchOnlyInLeft + summary.watchOnlyInRight + summary.watchChanged))}</span>
    <span class="meta-pill">Alert Changes: ${escapeHtml(String(summary.alertsOnlyInLeft + summary.alertsOnlyInRight))}</span>
  `;

  els.analysisSnapshotCompareGrid.innerHTML = `
    <article class="compare-card compare-card--wide">
      <p class="eyebrow">Snapshot Diff</p>
      <div class="compare-insight-grid">
        <section class="compare-insight-grid__wide">
          <p class="bucket-id">Snapshot Notes</p>
          <div class="explanation-diff-columns">
            <div>
              <p class="bucket-subtitle">${escapeHtml(diff.leftLabel)}</p>
              <p>${escapeHtml(diff.leftNote || "No note recorded.")}</p>
            </div>
            <div>
              <p class="bucket-subtitle">${escapeHtml(diff.rightLabel)}</p>
              <p>${escapeHtml(diff.rightNote || "No note recorded.")}</p>
            </div>
          </div>
        </section>
        ${sectionsHtml}
      </div>
    </article>
  `;
}

async function saveCurrentAnalysisSnapshot() {
  const name = els.analysisSnapshotName.value.trim();
  const note = els.analysisSnapshotNote.value.trim();
  if (!name) {
    setAnalysisSnapshotStatus("Snapshot name required.", true);
    return;
  }
  const snapshot = {
    snapshotId: `snapshot-${Date.now()}`,
    name,
    note,
    tags: parseSnapshotTags(els.analysisSnapshotTags.value),
    createdAt: new Date().toISOString(),
    state: buildCurrentAnalysisSnapshotBody(),
  };
  state.analysisSnapshots.unshift(snapshot);
  await persistAnalysisState();
  renderAnalysisSnapshots();
  els.analysisSnapshotName.value = "";
  els.analysisSnapshotTags.value = "";
  els.analysisSnapshotNote.value = "";
  setAnalysisSnapshotStatus(`Saved analyst snapshot "${name}".`);
}

async function loadAnalysisSnapshot(snapshotId) {
  const snapshot = state.analysisSnapshots.find((item) => item.snapshotId === snapshotId);
  if (!snapshot) return;
  applyNormalizedAnalysisState({
    ...snapshot.state,
    snapshots: state.analysisSnapshots.map((item) => ({
      snapshot_id: item.snapshotId,
      name: item.name,
      note: item.note || "",
      tags: item.tags || [],
      created_at: item.createdAt,
      state: item.state,
    })),
  });
  await persistAnalysisState();
  refreshAnalysisViews();
  setAnalysisSnapshotStatus(`Loaded analyst snapshot "${snapshot.name}".`);
}

function exportAnalysisSnapshot(snapshotId) {
  const snapshot = state.analysisSnapshots.find((item) => item.snapshotId === snapshotId);
  if (!snapshot) return;
  downloadBlob(
    `${snapshot.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}-snapshot.json`,
    new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json;charset=utf-8",
    })
  );
  setAnalysisSnapshotStatus(`Exported analyst snapshot "${snapshot.name}".`);
}

function buildAnalysisSnapshotReport(snapshot) {
  const stateBody = snapshot.state;
  const watchTargets = stateBody.watch_targets || [];
  const runReviews = stateBody.run_reviews || [];
  const experimentReviews = stateBody.experiment_reviews || [];
  const experimentInsights = stateBody.experiment_insights || [];
  const alertedExperiments = stateBody.alerted_experiment_ids || [];
  const trendSnapshots = stateBody.trend_snapshots || [];

  const section = (title, items, emptyText = "None.") => `## ${title}\n\n${
    items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${emptyText}`
  }`;

  return `# Analyst Snapshot Report

- Name: ${snapshot.name}
- Snapshot ID: ${snapshot.snapshotId}
- Created At: ${snapshot.createdAt || "unknown"}
- Note: ${snapshot.note || "No note recorded."}
- Tags: ${(snapshot.tags || []).length ? snapshot.tags.join(", ") : "No tags recorded."}
- Watch Targets: ${watchTargets.length}
- Alerted Experiments: ${alertedExperiments.length}
- Trend Snapshots: ${trendSnapshots.length}
- Run Reviews: ${runReviews.length}
- Experiment Reviews: ${experimentReviews.length}
- Experiment Insights: ${experimentInsights.length}

${section(
  "Watch Targets",
  watchTargets.map(
    (target) => `${target.dataset_display_name} | ${formatSortIntent(target.sort_intent)} | ${target.watch_key}`
  )
)}

${section(
  "Run Reviews",
  runReviews.map(
    (review) =>
      `${review.output_dir_name} | ${humanizeMetric(review.verdict)} | ${review.note || "No note recorded."}`
  )
)}

${section(
  "Experiment Insights",
  experimentInsights.map(
    (insight) =>
      `${insight.experiment_id} | score ${insight.interestingness_score} | bucket ${insight.bucket_name_drift} | projection ${insight.projection_drift} | distribution ${insight.bucket_distribution_drift}`
  )
)}

${section(
  "Experiment Reviews",
  experimentReviews.map(
    (review) =>
      `${review.experiment_id.slice(0, 8)} | ${humanizeMetric(review.verdict)} | ${review.note || "No note recorded."}`
  )
)}

${section(
  "Alerted Experiments",
  alertedExperiments.map((id) => id.slice(0, 8))
)}

${section(
  "Trend Snapshots",
  trendSnapshots.map(
    (trend) =>
      `${trend.dataset_display_name} | ${formatSortIntent(trend.sort_intent)} | latest interestingness ${trend.latest_interestingness ?? "n/a"} | delta ${trend.delta_score ?? "n/a"}${trend.structural_drift_note ? ` | structural drift ${trend.structural_drift_note}` : ""}`
  )
)}
`;
}

function exportAnalysisSnapshotReport(snapshotId) {
  const snapshot = state.analysisSnapshots.find((item) => item.snapshotId === snapshotId);
  if (!snapshot) return;
  const slug = snapshot.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
  downloadBlob(
    `${slug}-snapshot-report.md`,
    new Blob([buildAnalysisSnapshotReport(snapshot)], {
      type: "text/markdown;charset=utf-8",
    })
  );
  setAnalysisSnapshotStatus(`Exported snapshot summary report for "${snapshot.name}".`);
}

function exportAllAnalysisSnapshotReports() {
  if (!state.analysisSnapshots.length) {
    setAnalysisSnapshotStatus("No snapshots available to export.", true);
    return;
  }
  const sections = [...state.analysisSnapshots]
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
    .map((snapshot) => buildAnalysisSnapshotReport(snapshot));
  downloadBlob(
    `all-snapshot-reports-${new Date().toISOString().slice(0, 10)}.md`,
    new Blob([sections.join("\n\n---\n\n")], {
      type: "text/markdown;charset=utf-8",
    })
  );
  setAnalysisSnapshotStatus(`Exported ${state.analysisSnapshots.length} snapshot summary report(s).`);
}

async function updateAnalysisSnapshotMetadata(snapshotId) {
  const snapshot = state.analysisSnapshots.find((item) => item.snapshotId === snapshotId);
  if (!snapshot) return;
  const nameInput = document.querySelector(`.analysis-snapshot-name-input[data-snapshot="${snapshotId}"]`);
  const noteInput = document.querySelector(`.analysis-snapshot-note-input[data-snapshot="${snapshotId}"]`);
  const nextName = nameInput?.value?.trim() || "";
  const tagsInput = document.querySelector(`.analysis-snapshot-tags-input[data-snapshot="${snapshotId}"]`);
  const nextNote = noteInput?.value?.trim() || "";
  const nextTags = parseSnapshotTags(tagsInput?.value || "");
  if (!nextName) {
    setAnalysisSnapshotStatus("Snapshot name required.", true);
    return;
  }
  snapshot.name = nextName;
  snapshot.note = nextNote;
  snapshot.tags = nextTags;
  await persistAnalysisState();
  renderAnalysisSnapshots();
  setAnalysisSnapshotStatus(`Updated snapshot metadata for "${nextName}".`);
}

async function deleteAnalysisSnapshot(snapshotId) {
  const snapshot = state.analysisSnapshots.find((item) => item.snapshotId === snapshotId);
  if (!snapshot) return;
  state.analysisSnapshots = state.analysisSnapshots.filter((item) => item.snapshotId !== snapshotId);
  await persistAnalysisState();
  renderAnalysisSnapshots();
  setAnalysisSnapshotStatus(`Deleted analyst snapshot "${snapshot.name}".`);
}

function compareAnalysisSnapshots() {
  const leftId = els.analysisSnapshotCompareLeft.value;
  const rightId = els.analysisSnapshotCompareRight.value;
  const left = state.analysisSnapshots.find((item) => item.snapshotId === leftId);
  const right = state.analysisSnapshots.find((item) => item.snapshotId === rightId);
  if (!left || !right) {
    els.analysisSnapshotCompareSummary.className = "summary-panel muted";
    els.analysisSnapshotCompareSummary.textContent =
      "Pick two named analyst snapshots to compare how verdicts, watch targets, and alert tracking shifted.";
    els.analysisSnapshotCompareGrid.innerHTML = `<div class="placeholder">No snapshot comparison loaded yet.</div>`;
    return;
  }
  const diff = buildAnalysisStateDiff(left.state, right.state, {
    label: left.name,
    note: left.note,
    createdAt: left.createdAt,
  }, {
    label: right.name,
    note: right.note,
    createdAt: right.createdAt,
  });
  renderAnalysisSnapshotDiff(diff);
}

function setAnalysisImportStatus(message, isError = false) {
  els.analysisStateImportStatus.className = isError
    ? "summary-note"
    : "summary-note muted";
  els.analysisStateImportStatus.textContent = message;
}

function clearPendingAnalysisImport() {
  state.pendingAnalysisImportPlan = null;
  els.analysisStateImportPreview.className = "summary-panel muted";
  els.analysisStateImportPreview.textContent =
    "An import preview will appear here before any analyst state is changed.";
  els.analysisStateImportSnapshotName.value = "";
  els.analysisStateImportExistingSnapshot.value = "";
  els.analysisStateImportDiffBtn.disabled = true;
  els.analysisStateImportSnapshotBtn.disabled = true;
  els.analysisStateImportUpdateSnapshotBtn.disabled = true;
  els.analysisStateImportConfirmBtn.disabled = true;
  els.analysisStateImportCancelBtn.disabled = true;
}

function renderPendingAnalysisImport() {
  const plan = state.pendingAnalysisImportPlan;
  if (!plan) {
    clearPendingAnalysisImport();
    return;
  }

  const summary = plan.summary;
  const highlights = plan.highlights.length
    ? `<ul>${plan.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p class="muted">No concrete changes detected. Applying this import would keep the analyst state effectively unchanged.</p>`;

  els.analysisStateImportPreview.className = "summary-panel";
  els.analysisStateImportPreview.innerHTML = `
    <div class="import-preview">
      <div class="import-preview__meta">
        <span class="meta-pill ${plan.mode === "replace" ? "meta-pill--warn" : ""}">${escapeHtml(plan.mode === "replace" ? "Replace Import" : "Merge Import")}</span>
        <span class="meta-pill">File: ${escapeHtml(plan.fileName)}</span>
        <span class="meta-pill">Run Changes: ${escapeHtml(String(summary.runAdded + summary.runUpdated + summary.runRemoved))}</span>
        <span class="meta-pill">Experiment Changes: ${escapeHtml(String(summary.experimentAdded + summary.experimentUpdated + summary.experimentRemoved))}</span>
        <span class="meta-pill">Insight Changes: ${escapeHtml(String(summary.insightAdded + summary.insightUpdated + summary.insightRemoved))}</span>
        <span class="meta-pill">Watch Changes: ${escapeHtml(String(summary.watchAdded + summary.watchUpdated + summary.watchRemoved))}</span>
      </div>
      <div class="import-preview__grid">
        <div>
          <p class="bucket-id">Runs</p>
          <p>Add ${escapeHtml(String(summary.runAdded))} | Update ${escapeHtml(String(summary.runUpdated))} | Remove ${escapeHtml(String(summary.runRemoved))}</p>
        </div>
        <div>
          <p class="bucket-id">Experiments</p>
          <p>Add ${escapeHtml(String(summary.experimentAdded))} | Update ${escapeHtml(String(summary.experimentUpdated))} | Remove ${escapeHtml(String(summary.experimentRemoved))}</p>
        </div>
        <div>
          <p class="bucket-id">Watch Targets</p>
          <p>Add ${escapeHtml(String(summary.watchAdded))} | Update ${escapeHtml(String(summary.watchUpdated))} | Remove ${escapeHtml(String(summary.watchRemoved))}</p>
        </div>
        <div>
          <p class="bucket-id">Experiment Insights</p>
          <p>Add ${escapeHtml(String(summary.insightAdded))} | Update ${escapeHtml(String(summary.insightUpdated))} | Remove ${escapeHtml(String(summary.insightRemoved))}</p>
        </div>
        <div>
          <p class="bucket-id">Alert Tracking</p>
          <p>Add ${escapeHtml(String(summary.alertsAdded))} | Remove ${escapeHtml(String(summary.alertsRemoved))}</p>
        </div>
      </div>
      ${highlights}
    </div>
  `;
  if (!els.analysisStateImportSnapshotName.value) {
    els.analysisStateImportSnapshotName.value = suggestImportedSnapshotName(plan.fileName, plan.mode);
  }
  renderImportSnapshotOptions();
  els.analysisStateImportDiffBtn.disabled = false;
  els.analysisStateImportSnapshotBtn.disabled = false;
  els.analysisStateImportUpdateSnapshotBtn.disabled = state.analysisSnapshots.length === 0;
  els.analysisStateImportConfirmBtn.disabled = false;
  els.analysisStateImportCancelBtn.disabled = false;
}

function suggestImportedSnapshotName(fileName, mode) {
  const base = String(fileName || "imported-state")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${base || "imported-state"}-${mode === "replace" ? "replace" : "merge"}`;
}

function buildAnalysisImportDiffReport(plan) {
  const section = (title, items) => `## ${title}\n\n${
    items.length ? items.map((item) => `- ${item}`).join("\n") : "- None."
  }`;
  const summary = plan.summary;
  const details = plan.details;
  return `# Analyst Import Diff Report

- File: ${plan.fileName}
- Mode: ${plan.mode === "replace" ? "Replace" : "Merge"}
- Run changes: ${summary.runAdded + summary.runUpdated + summary.runRemoved}
- Experiment changes: ${summary.experimentAdded + summary.experimentUpdated + summary.experimentRemoved}
- Insight changes: ${summary.insightAdded + summary.insightUpdated + summary.insightRemoved}
- Watch changes: ${summary.watchAdded + summary.watchUpdated + summary.watchRemoved}
- Alert changes: ${summary.alertsAdded + summary.alertsRemoved}

## Summary

- Runs: add ${summary.runAdded}, update ${summary.runUpdated}, remove ${summary.runRemoved}
- Experiments: add ${summary.experimentAdded}, update ${summary.experimentUpdated}, remove ${summary.experimentRemoved}
- Experiment insights: add ${summary.insightAdded}, update ${summary.insightUpdated}, remove ${summary.insightRemoved}
- Watch targets: add ${summary.watchAdded}, update ${summary.watchUpdated}, remove ${summary.watchRemoved}
- Alert tracking: add ${summary.alertsAdded}, remove ${summary.alertsRemoved}

${section("Highlights", plan.highlights)}

${section("Watch Targets Added", details.watchDiff.added)}

${section("Watch Targets Updated", details.watchDiff.updated)}

${section("Watch Targets Removed", details.watchDiff.removed)}

${section("Run Reviews Added", details.runDiff.added)}

${section("Run Reviews Updated", details.runDiff.updated)}

${section("Run Reviews Removed", details.runDiff.removed)}

${section("Experiment Reviews Added", details.experimentDiff.added)}

${section("Experiment Reviews Updated", details.experimentDiff.updated)}

${section("Experiment Reviews Removed", details.experimentDiff.removed)}

${section("Experiment Insights Added", details.insightDiff.added)}

${section("Experiment Insights Updated", details.insightDiff.updated)}

${section("Experiment Insights Removed", details.insightDiff.removed)}

${section("Alert IDs Added", details.alertAdded.map((item) => item.slice(0, 8)))}

${section("Alert IDs Removed", details.alertRemoved.map((item) => item.slice(0, 8)))}
`;
}

function downloadPendingAnalysisImportDiff() {
  const plan = state.pendingAnalysisImportPlan;
  if (!plan) return;
  downloadBlob(
    `analysis-import-diff-${new Date().toISOString().slice(0, 10)}.md`,
    new Blob([buildAnalysisImportDiffReport(plan)], {
      type: "text/markdown;charset=utf-8",
    })
  );
  setAnalysisImportStatus(`Downloaded import diff report for ${plan.fileName}.`);
}

function triggerAnalysisStateImport(mode) {
  state.pendingAnalysisImportMode = mode;
  els.analysisStateImportInput.value = "";
  els.analysisStateImportInput.click();
}

async function exportAnalysisStateSnapshot() {
  const payload = buildAnalysisStatePayload();
  downloadBlob(
    `analysis-state-${new Date().toISOString().slice(0, 10)}.json`,
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    })
  );
  setAnalysisImportStatus("Exported current analyst review state snapshot.");
}

async function importAnalysisStateFromFile(file, mode) {
  const raw = await file.text();
  const imported = normalizeAnalysisStatePayload(JSON.parse(raw));
  const current = buildAnalysisStatePayload();
  const nextPayload =
    mode === "replace"
      ? imported
      : mergeAnalysisStatePayload(current, imported);
  state.pendingAnalysisImportPlan = buildAnalysisImportPreview(current, imported, nextPayload, mode, file.name);
  renderPendingAnalysisImport();
  setAnalysisImportStatus(
    `Preview ready for ${mode === "replace" ? "replace" : "merge"} import from ${file.name}. Review the delta, then apply or cancel.`
  );
}

async function applyPendingAnalysisImport() {
  const plan = state.pendingAnalysisImportPlan;
  if (!plan) return;
  applyNormalizedAnalysisState(plan.nextPayload);
  await persistAnalysisState();
  refreshAnalysisViews();
  setAnalysisImportStatus(
    `${plan.mode === "replace" ? "Replaced" : "Merged"} analyst review state from ${plan.fileName}. Runs reviewed: ${plan.nextPayload.run_reviews.length}. Experiments reviewed: ${plan.nextPayload.experiment_reviews.length}.`
  );
  clearPendingAnalysisImport();
}

async function savePendingImportAsSnapshot() {
  const plan = state.pendingAnalysisImportPlan;
  if (!plan) return;
  const name = els.analysisStateImportSnapshotName.value.trim();
  if (!name) {
    setAnalysisImportStatus("Imported snapshot name required.", true);
    return;
  }
  const snapshot = {
    snapshotId: `snapshot-${Date.now()}`,
    name,
    note: "",
    createdAt: new Date().toISOString(),
    state: plan.nextPayload,
  };
  state.analysisSnapshots.unshift(snapshot);
  await persistAnalysisState();
  renderAnalysisSnapshots();
  setAnalysisSnapshotStatus(`Saved imported analyst state as snapshot "${name}".`);
  setAnalysisImportStatus(`Imported state captured as snapshot "${name}" without changing live analyst state.`);
  clearPendingAnalysisImport();
}

async function updateExistingSnapshotFromPendingImport() {
  const plan = state.pendingAnalysisImportPlan;
  if (!plan) return;
  const snapshotId = els.analysisStateImportExistingSnapshot.value;
  const snapshot = state.analysisSnapshots.find((item) => item.snapshotId === snapshotId);
  if (!snapshot) {
    setAnalysisImportStatus("Choose an existing snapshot to update.", true);
    return;
  }
  snapshot.state = plan.nextPayload;
  await persistAnalysisState();
  renderAnalysisSnapshots();
  setAnalysisSnapshotStatus(`Updated snapshot "${snapshot.name}" from staged import.`);
  setAnalysisImportStatus(`Imported state saved into existing snapshot "${snapshot.name}" without changing live analyst state.`);
  clearPendingAnalysisImport();
}

async function applyActiveExperimentSuggestion() {
  if (!state.activeExperimentId || !state.activeExperimentSuggestion) return;
  const experiment = summarizeExperiments(state.runs).find((entry) => entry.experimentId === state.activeExperimentId);
  if (!experiment) return;

  const dataset = state.datasets.find((entry) => entry.display_name === experiment.datasetDisplayName);
  if (dataset) {
    els.datasetSelect.value = dataset.dataset_id;
    state.selectedDatasetId = dataset.dataset_id;
    await previewDataset();
  }

  applyExperimentSuggestion(state.activeExperimentSuggestion);
}

function diffBucketNames(leftBuckets, rightBuckets) {
  const maxBuckets = Math.max(leftBuckets.length, rightBuckets.length);
  const diffs = [];

  for (let index = 0; index < maxBuckets; index += 1) {
    const leftBucket = leftBuckets[index];
    const rightBucket = rightBuckets[index];
    if (!leftBucket && rightBucket) {
      diffs.push(`Slot ${index + 1}: only the right run has "${rightBucket.name}".`);
      continue;
    }
    if (leftBucket && !rightBucket) {
      diffs.push(`Slot ${index + 1}: only the left run has "${leftBucket.name}".`);
      continue;
    }
    if (leftBucket?.name !== rightBucket?.name) {
      diffs.push(`Slot ${index + 1}: "${leftBucket?.name ?? "missing"}" vs "${rightBucket?.name ?? "missing"}".`);
    }
  }

  return diffs;
}

function buildDistributionRows(leftSummary, rightSummary) {
  if (!leftSummary || !rightSummary) {
    return "";
  }

  const labels = ["total_items", "junk_count", "review_flag_count"];
  const maxValue = Math.max(
    ...labels.flatMap((label) => [leftSummary[label] ?? 0, rightSummary[label] ?? 0]),
    1
  );

  return labels
    .map((label) => {
      const leftValue = leftSummary[label] ?? 0;
      const rightValue = rightSummary[label] ?? 0;
      return renderDistributionRow(label, leftValue, rightValue, maxValue);
    })
    .join("");
}

function buildSingleRunDistribution(detail) {
  const summary = detail.assignment_summary;
  if (!summary) {
    return `<p class="muted">No distribution data saved for this run.</p>`;
  }

  const rows = Array.isArray(summary.bucket_counts) ? summary.bucket_counts : [];
  const maxValue = Math.max(...rows.map((entry) => entry?.count ?? 0), 1);

  return rows.length
    ? rows
        .map((entry) =>
          renderSingleDistributionRow(entry?.bucket_id ?? "unknown", entry?.count ?? 0, maxValue)
        )
        .join("")
    : `<p class="muted">No positive bucket distribution captured.</p>`;
}

function buildProjectionContrast(left, right) {
  const leftProjection = left.run_config?.dataset_projection ?? null;
  const rightProjection = right.run_config?.dataset_projection ?? null;
  const leftFields = (leftProjection?.selected_fields ?? []).map((field) => field.field_name);
  const rightFields = (rightProjection?.selected_fields ?? []).map((field) => field.field_name);

  return [
    [
      "Selected Fields",
      leftFields.length ? leftFields.join(", ") : "No structured projection saved.",
      rightFields.length ? rightFields.join(", ") : "No structured projection saved.",
    ],
    [
      "ID Field",
      leftProjection?.item_id_field || "implicit_row_index",
      rightProjection?.item_id_field || "implicit_row_index",
    ],
    [
      "Render Mode",
      leftProjection?.render_mode || "n/a",
      rightProjection?.render_mode || "n/a",
    ],
  ]
    .map(([label, leftValue, rightValue]) =>
      renderExplanationDiffRow(label, leftValue ?? "", rightValue ?? "")
    )
    .join("");
}

function buildBucketDistributionContrast(left, right) {
  const leftCounts = new Map(
    (left.assignment_summary?.bucket_counts || []).map((entry) => [entry.bucket_id, entry.count])
  );
  const rightCounts = new Map(
    (right.assignment_summary?.bucket_counts || []).map((entry) => [entry.bucket_id, entry.count])
  );
  const orderedIds = [];
  for (const bucket of left.bucket_plan?.buckets || []) {
    if (!orderedIds.includes(bucket.bucket_id)) orderedIds.push(bucket.bucket_id);
  }
  for (const bucket of right.bucket_plan?.buckets || []) {
    if (!orderedIds.includes(bucket.bucket_id)) orderedIds.push(bucket.bucket_id);
  }
  if (!orderedIds.length) {
    return "";
  }

  const maxValue = Math.max(
    ...orderedIds.flatMap((bucketId) => [leftCounts.get(bucketId) ?? 0, rightCounts.get(bucketId) ?? 0]),
    1
  );

  return orderedIds
    .map((bucketId) =>
      renderDistributionRow(
        `${bucketId} bucket`,
        leftCounts.get(bucketId) ?? 0,
        rightCounts.get(bucketId) ?? 0,
        maxValue
      )
    )
    .join("");
}

function buildExplanationContrast(left, right) {
  const leftExplanation = left.bucket_plan?.explanation ?? {};
  const rightExplanation = right.bucket_plan?.explanation ?? {};
  const sections = [
    [
      "Intent Interpretation",
      leftExplanation.sorting_intent_interpretation,
      rightExplanation.sorting_intent_interpretation,
    ],
    [
      "Bucket Shape Rationale",
      leftExplanation.bucket_shape_rationale,
      rightExplanation.bucket_shape_rationale,
    ],
    [
      "Bucket Count Judgment",
      leftExplanation.bucket_count_judgment,
      rightExplanation.bucket_count_judgment,
    ],
    [
      "Weak / Junk Signals",
      (leftExplanation.weak_or_junk_signals ?? []).join(" | "),
      (rightExplanation.weak_or_junk_signals ?? []).join(" | "),
    ],
    [
      "Caution Notes",
      (leftExplanation.caution_notes ?? []).join(" | "),
      (rightExplanation.caution_notes ?? []).join(" | "),
    ],
    [
      "Zoom In Suggestions",
      (leftExplanation.zoom_in_suggestions ?? []).join(" | "),
      (rightExplanation.zoom_in_suggestions ?? []).join(" | "),
    ],
  ];

  return sections
    .map(([label, leftValue, rightValue]) =>
      renderExplanationDiffRow(label, leftValue ?? "", rightValue ?? "")
    )
    .join("");
}

function renderExplanationDiffRow(label, leftValue, rightValue) {
  const differs = leftValue !== rightValue;
  return `
    <article class="explanation-diff-row ${differs ? "explanation-diff-row--changed" : ""}">
      <p class="bucket-subtitle">${escapeHtml(label)}</p>
      <div class="explanation-diff-columns">
        <div>
          <p class="bucket-id">Left</p>
          <p>${escapeHtml(leftValue || "No notable signal recorded.")}</p>
        </div>
        <div>
          <p class="bucket-id">Right</p>
          <p>${escapeHtml(rightValue || "No notable signal recorded.")}</p>
        </div>
      </div>
    </article>
  `;
}

function renderDistributionRow(label, leftValue, rightValue, maxValue) {
  const leftWidth = Math.max((leftValue / maxValue) * 100, leftValue > 0 ? 8 : 0);
  const rightWidth = Math.max((rightValue / maxValue) * 100, rightValue > 0 ? 8 : 0);

  return `
    <div class="distribution-row">
      <div class="distribution-row__header">
        <span>${escapeHtml(humanizeMetric(label))}</span>
        <span>${escapeHtml(String(leftValue))} vs ${escapeHtml(String(rightValue))}</span>
      </div>
      <div class="distribution-compare">
        <div class="distribution-bar-wrap">
          <div class="distribution-bar distribution-bar--left" style="width: ${leftWidth}%"></div>
        </div>
        <div class="distribution-bar-wrap">
          <div class="distribution-bar distribution-bar--right" style="width: ${rightWidth}%"></div>
        </div>
      </div>
    </div>
  `;
}

function renderSingleDistributionRow(bucketId, count, maxValue) {
  const width = Math.max((count / maxValue) * 100, count > 0 ? 8 : 0);

  return `
    <div class="distribution-row">
      <div class="distribution-row__header">
        <span>${escapeHtml(bucketId)}</span>
        <span>${escapeHtml(String(count))}</span>
      </div>
      <div class="distribution-bar-wrap">
        <div class="distribution-bar distribution-bar--left" style="width: ${width}%"></div>
      </div>
    </div>
  `;
}

function renderListOrFallback(items, fallback) {
  return items.length
    ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>${escapeHtml(fallback)}</li>`;
}

function humanizeMetric(label) {
  return label
    .replaceAll("_", " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function humanizeGenesisMode(mode) {
  return mode === "blind_label" ? "Blind Label" : "Data Skim";
}

const JOB_STAGE_FLOW = [
  "queued",
  "loading_data",
  "preflight",
  "planning",
  "assigning",
  "materializing",
  "completed",
];

function formatSortIntent(intent) {
  if (!intent) return "unknown";
  if (typeof intent === "string") {
    return intent.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
  if (intent.kind === "Custom") return `Custom: ${intent.value}`;
  return String(intent.value ?? "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatTimestamp(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "n/a" : date.toLocaleString();
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms == null || ms < 0) return "n/a";
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getElapsedMs(job) {
  const startValue = job?.started_at || job?.created_at;
  if (!startValue) return null;
  const start = new Date(startValue);
  if (Number.isNaN(start.getTime())) return null;
  const end = job?.finished_at ? new Date(job.finished_at) : new Date();
  if (Number.isNaN(end.getTime())) return null;
  return Math.max(end.getTime() - start.getTime(), 0);
}

function estimateRemainingMs(job) {
  if (!job || job.status !== "running") return null;
  const elapsedMs = getElapsedMs(job);
  const progress = Number(job.progress_percent ?? 0);
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(progress) || progress < 10 || progress >= 100) {
    return null;
  }
  const totalEstimateMs = elapsedMs / (progress / 100);
  const remainingMs = totalEstimateMs - elapsedMs;
  return remainingMs > 0 ? remainingMs : 0;
}

function formatEta(job, etaMs) {
  if (etaMs != null) return formatDuration(etaMs);
  if (job.status === "running") return "estimating";
  if (job.status === "queued") return "waiting";
  if (job.status === "completed") return "complete";
  return "n/a";
}

function buildStageTimeline(job) {
  const currentIndex = JOB_STAGE_FLOW.indexOf(job.stage);
  return JOB_STAGE_FLOW
    .filter((stage) => stage !== "queued")
    .map((stage, index) => {
      const stageIndex = index + 1;
      let status = "pending";

      if (job.status === "completed" && stageIndex < JOB_STAGE_FLOW.length) {
        status = stage === "completed" ? "current" : "done";
      } else if (job.status === "failed" || job.status === "cancelled" || job.status === "blocked") {
        if (stage === job.stage) {
          status = "failed";
        } else if (stageIndex < currentIndex) {
          status = "done";
        }
      } else if (stageIndex < currentIndex) {
        status = "done";
      } else if (stage === job.stage || (job.status === "queued" && stage === "loading_data")) {
        status = "current";
      }

      return `
        <li class="job-stage job-stage--${status}">
          <span class="job-stage__dot"></span>
          <span class="job-stage__label">${escapeHtml(humanizeMetric(stage))}</span>
        </li>
      `;
    })
    .join("");
}

function getSelectedDatasetId() {
  return els.datasetSelect.value;
}

function selectHasValue(select, value) {
  return [...select.options].some((option) => option.value === value);
}

function findDatasetMatch({ datasetId = null, displayName = null }) {
  if (datasetId) {
    const byId = state.datasets.find((entry) => entry.dataset_id === datasetId);
    if (byId) return byId;
  }
  if (displayName) {
    const byDisplay = state.datasets.find((entry) => entry.display_name === displayName);
    if (byDisplay) return byDisplay;
  }
  return null;
}

function applyJobRequestToForm(job) {
  if (!job) return;
  const request = job.request || {};
  const sortIntent = request.sort_intent || {};
  const isPreset = sortIntent.kind === "Preset";
  const presetValue = isPreset ? sortIntent.value : null;

  if (job.dataset_id && selectHasValue(els.datasetSelect, job.dataset_id)) {
    els.datasetSelect.value = job.dataset_id;
  }
  if (presetValue && selectHasValue(els.sortIntent, presetValue)) {
    els.sortIntent.value = presetValue;
  } else if (!isPreset) {
    els.sortIntent.value = "topic";
  }
  els.bucketGenesisMode.value = request.bucket_genesis_mode || "data_skim";
  els.bucketCount.value = String(request.requested_positive_bucket_count ?? 4);
  els.forceOverride.checked = Boolean(request.force_override);

  const customIntentPrefix = !isPreset && sortIntent.value
    ? `Original custom sort intent: ${sortIntent.value}`
    : "";
  const customInstructions = request.custom_instructions || "";
  els.customInstructions.value = [customIntentPrefix, customInstructions]
    .filter(Boolean)
    .join(customIntentPrefix && customInstructions ? "\n\n" : "");

  state.selectedDatasetId = job.dataset_id || state.selectedDatasetId;
}

async function loadJobIntoForm(job) {
  applyJobRequestToForm(job);
  if (job?.dataset_id && !selectHasValue(els.datasetSelect, job.dataset_id)) {
    els.datasetMeta.innerHTML = "";
    els.datasetPreview.textContent = `Dataset ${job.dataset_id} is no longer available in the inputs folder.`;
    return;
  }
  await previewDataset();
}

async function hydrateFormFromJobId(jobId) {
  const job = state.jobs.find((entry) => entry.job_id === jobId) || await requestJson(`/api/jobs/${encodeURIComponent(jobId)}`);
  if (!state.jobs.some((entry) => entry.job_id === job.job_id)) {
    state.jobs = [job, ...state.jobs];
    renderJobHistory(state.jobs);
  }
  await loadJobIntoForm(job);
}

async function loadHealth() {
  const data = await requestJson("/health");
  renderHealth(data);
}

async function loadDatasets() {
  const data = await requestJson("/api/datasets");
  renderDatasetList(data);
}

async function loadRuns() {
  const data = await requestJson("/api/runs");
  renderRunHistory(data);
  await hydrateExperimentInsights(data);
}

async function loadJobs() {
  const data = await requestJson("/api/jobs");
  state.jobs = data;
  renderJobHistory(data);
  const active = data.find((job) => job.job_id === state.activeJobId) ?? null;
  const running = data.find((job) => job.status === "queued" || job.status === "running") ?? null;
  const preferred =
    (active && (active.status === "queued" || active.status === "running") ? active : null) ??
    running ??
    active ??
    data[0] ??
    null;
  if (preferred) {
    state.activeJobId = preferred.job_id;
    renderJob(preferred);
    if (preferred.result) {
      renderJobResult(preferred.result);
    }
    if (preferred.status === "queued" || preferred.status === "running") {
      scheduleJobPoll(preferred.job_id);
    }
  } else {
    renderJob(null);
  }
}

async function loadRunDetail(outputDirName) {
  const data = await requestJson(`/api/runs/${encodeURIComponent(outputDirName)}`);
  renderRunDetail(data);
  if (data?.run_manifest?.artifacts?.bucket_exports_dir) {
    try {
      const bucketExports = await requestJson(
        `/api/runs/${encodeURIComponent(outputDirName)}/bucket-exports`
      );
      renderRunBucketExports(outputDirName, data, bucketExports);
    } catch (error) {
      if (state.activeRunOutputDir === outputDirName) {
        els.runDetailBucketExports.innerHTML = `<div class="placeholder">${escapeHtml(String(error))}</div>`;
      }
    }
  }
}

async function loadJobDetail(jobId) {
  const job = await requestJson(`/api/jobs/${encodeURIComponent(jobId)}`);
  state.activeJobId = job.job_id;
  state.jobs = state.jobs.some((entry) => entry.job_id === job.job_id)
    ? state.jobs.map((entry) => (entry.job_id === job.job_id ? job : entry))
    : [job, ...state.jobs];
  renderJobHistory(state.jobs);
  renderJob(job);
  if (job.result) {
    renderJobResult(job.result);
  }
  if (job.status === "queued" || job.status === "running") {
    scheduleJobPoll(job.job_id);
  } else {
    stopJobPoll();
    if (job.status === "completed") {
      await loadRuns();
    }
  }
  return job;
}

async function cancelJob(jobId) {
  const job = await requestJson(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
  });
  state.jobs = state.jobs.map((entry) => (entry.job_id === job.job_id ? job : entry));
  renderJobHistory(state.jobs);
  renderJob(job);
  scheduleJobPoll(jobId);
}

async function toggleJobArchive(jobId) {
  const job = await requestJson(`/api/jobs/${encodeURIComponent(jobId)}/archive`, {
    method: "POST",
  });
  state.jobs = state.jobs.map((entry) => (entry.job_id === job.job_id ? job : entry));
  renderJobHistory(state.jobs);
  if (state.activeJobId === jobId) {
    renderJob(job);
  }
}

async function rerunJob(jobId) {
  const job = await requestJson(`/api/jobs/${encodeURIComponent(jobId)}/rerun`, {
    method: "POST",
  });
  state.activeJobId = job.job_id;
  state.jobs = [job, ...state.jobs];
  renderJobHistory(state.jobs);
  renderJob(job);
  renderAssignmentSummary(null);
  els.sortJson.textContent = "";
  scheduleJobPoll(job.job_id);
}

function applyRetentionResult(data) {
  state.jobs = data.jobs || [];
  renderJobHistory(state.jobs);
  if (state.activeJobId) {
    const active = state.jobs.find((job) => job.job_id === state.activeJobId);
    if (active) {
      renderJob(active);
    } else {
      state.activeJobId = null;
      els.jobSummary.className = "summary-panel muted";
      els.jobSummary.textContent = "No active sort job is selected.";
      els.jobJson.textContent = "No active sort job selected yet.";
    }
  }
  els.jobRetentionNote.textContent = data.message || "Job retention action completed.";
}

async function archiveCompletedJobs() {
  const data = await requestJson("/api/jobs/archive-completed", {
    method: "POST",
  });
  applyRetentionResult(data);
}

async function deleteArchivedJobs() {
  if (!window.confirm("Delete all archived jobs from retained history? This only removes job records from the dashboard registry.")) {
    return;
  }
  const data = await requestJson("/api/jobs/delete-archived", {
    method: "POST",
  });
  applyRetentionResult(data);
}

async function compareRuns() {
  const left = els.compareLeft.value;
  const right = els.compareRight.value;
  if (!left || !right) {
    renderComparison(null, null);
    return;
  }

  const [leftDetail, rightDetail] = await Promise.all([
    requestJson(`/api/runs/${encodeURIComponent(left)}`),
    requestJson(`/api/runs/${encodeURIComponent(right)}`),
  ]);
  renderComparison(leftDetail, rightDetail);
}

async function previewDataset(useConfiguredProjection = false) {
  const datasetId = getSelectedDatasetId();
  if (!datasetId) return;
  stopPreviewRefreshTimer();
  resetRunSetupOutputs();
  const data = useConfiguredProjection
    ? await requestJson(`/api/datasets/${encodeURIComponent(datasetId)}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody()),
      })
    : await requestJson(`/api/datasets/${encodeURIComponent(datasetId)}/preview`);
  renderDatasetPreview(data);
}

async function runPreflight() {
  const datasetId = getSelectedDatasetId();
  if (!datasetId) return;
  const data = await requestJson(`/api/datasets/${encodeURIComponent(datasetId)}/preflight`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestBody()),
  });
  renderPreflight(data);
}

async function generatePlan() {
  const datasetId = getSelectedDatasetId();
  if (!datasetId) return;
  const data = await requestJson(`/api/datasets/${encodeURIComponent(datasetId)}/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestBody()),
  });
  renderPreflight(data);
  renderExplanation(data.bucket_plan?.explanation ?? null);
  renderBucketPlan(data.bucket_plan ?? null);
  if (data.blocked) {
    renderAssignmentSummary(null);
  }
}

async function sortDataset() {
  const datasetId = getSelectedDatasetId();
  if (!datasetId) return;
  const job = await requestJson(`/api/datasets/${encodeURIComponent(datasetId)}/sort-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestBody()),
  });
  state.activeJobId = job.job_id;
  renderJob(job);
  renderAssignmentSummary(null);
  els.sortJson.textContent = "";
  scheduleJobPoll(job.job_id);
}

async function sortDatasetMatchedPair() {
  const datasetId = getSelectedDatasetId();
  if (!datasetId) return;
  const response = await requestJson(`/api/datasets/${encodeURIComponent(datasetId)}/sort-job-pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestBody()),
  });
  const jobs = response.jobs || [];
  state.jobs = [...jobs, ...state.jobs.filter((entry) => !jobs.some((job) => job.job_id === entry.job_id))];
  renderJobHistory(state.jobs);

  const primaryJob = jobs[0] ?? null;
  if (primaryJob) {
    state.activeJobId = primaryJob.job_id;
    renderJob(primaryJob);
    scheduleJobPoll(primaryJob.job_id);
  }

  renderAssignmentSummary(null);
  els.sortJson.textContent = "";
  els.comparePairNote.textContent = `${response.message} Compare the paired runs after completion to isolate genesis-mode effects.`;
}

function renderJobResult(data) {
  renderPreflight(data);
  renderExplanation(data.bucket_plan?.explanation ?? null);
  renderBucketPlan(data.bucket_plan ?? null);
  if (data.blocked) {
    renderAssignmentSummary(null);
    return;
  }
  renderAssignmentSummary(data);
}

function stopJobPoll() {
  if (state.jobPollTimer) {
    clearTimeout(state.jobPollTimer);
    state.jobPollTimer = null;
  }
}

function scheduleJobPoll(jobId) {
  stopJobPoll();
  state.jobPollTimer = setTimeout(async () => {
    try {
      await loadJobs();
    } catch (error) {
      renderJob({
        job_id: jobId,
        status: "failed",
        stage: "failed",
        progress_percent: 100,
        dataset_display_name: "unknown",
        dataset_id: "unknown",
        message: String(error),
        error_message: String(error),
        progress_notes: [],
      });
      stopJobPoll();
    }
  }, 2500);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function initializeFieldHelpAccessibility() {
  const labels = document.querySelectorAll("label");
  let helpIndex = 0;
  for (const label of labels) {
    const help = label.querySelector(".field-help");
    if (!help) continue;
    const control = label.querySelector("input, select, textarea");
    if (!control) continue;

    help.setAttribute("aria-hidden", "true");

    const describedById = `field-help-desc-${helpIndex++}`;
    const existingDescribedBy = (control.getAttribute("aria-describedby") || "").trim();
    const tokens = existingDescribedBy ? existingDescribedBy.split(/\s+/) : [];
    if (!tokens.includes(describedById)) {
      tokens.push(describedById);
      control.setAttribute("aria-describedby", tokens.join(" ").trim());
    }

    let hiddenDesc = label.querySelector(`#${describedById}`);
    if (!hiddenDesc) {
      hiddenDesc = document.createElement("span");
      hiddenDesc.id = describedById;
      hiddenDesc.className = "sr-only";
      hiddenDesc.textContent = help.textContent.trim();
      label.appendChild(hiddenDesc);
    }
  }
}

async function boot() {
  try {
    initStartupSplash();
    initializeFieldHelpAccessibility();
    loadUiState();
    els.runVerdictFilter.value = state.runVerdictFilter;
    els.experimentStatusFilter.value = state.experimentStatusFilter;
    els.experimentSort.value = state.experimentSort;
    els.experimentPreset.value = state.experimentPreset;
    els.experimentDatasetFilter.value = state.experimentDatasetFilter;
    els.experimentInterestThreshold.value = String(state.experimentInterestingnessThreshold);
    els.experimentAutoOpen.checked = state.experimentAutoOpenTopInteresting;
    els.experimentAlertThreshold.value = String(state.experimentAlertThreshold);
    els.experimentVerdictFilter.value = state.experimentVerdictFilter;
    els.reviewTimelineFilter.value = state.reviewTimelineFilter;
    els.analysisSnapshotCompareMode.value = state.analysisSnapshotCompareMode;
    els.analysisSnapshotFilter.value = state.analysisSnapshotFilter;
    await loadHealth();
    await loadPersistedAnalysisState();
    await loadDatasets();
    await previewDataset();
    await loadRuns();
    await loadJobs();
  } catch (error) {
    els.datasetPreview.textContent = String(error);
  }
}

els.refreshDatasets.addEventListener("click", async () => {
  await loadDatasets();
  await previewDataset();
});
els.refreshRuns.addEventListener("click", loadRuns);
els.runVerdictFilter.addEventListener("change", () => {
  state.runVerdictFilter = els.runVerdictFilter.value;
  saveUiState();
  renderRunHistory(state.runs);
});
els.jobStatusFilter.addEventListener("change", () => {
  state.jobStatusFilter = els.jobStatusFilter.value;
  renderJobHistory(state.jobs);
});
els.jobDatasetFilter.addEventListener("input", () => {
  state.jobDatasetFilter = els.jobDatasetFilter.value.trim();
  renderJobHistory(state.jobs);
});
els.jobShowArchived.addEventListener("change", () => {
  state.showArchivedJobs = els.jobShowArchived.checked;
  renderJobHistory(state.jobs);
});
els.watchCurrentTargetBtn.addEventListener("click", addCurrentWatchTarget);
els.applyRecipeBtn.addEventListener("click", () => {
  applyExperimentRecipe(els.experimentRecipe.value);
});
els.experimentStatusFilter.addEventListener("change", () => {
  state.experimentStatusFilter = els.experimentStatusFilter.value;
  saveUiState();
  renderExperimentHistory(state.runs);
});
els.experimentSort.addEventListener("change", () => {
  state.experimentSort = els.experimentSort.value;
  saveUiState();
  renderExperimentHistory(state.runs);
});
els.experimentPreset.addEventListener("change", () => {
  state.experimentPreset = els.experimentPreset.value;
  saveUiState();
  renderExperimentHistory(state.runs);
});
els.experimentDatasetFilter.addEventListener("input", () => {
  state.experimentDatasetFilter = els.experimentDatasetFilter.value.trim();
  saveUiState();
  renderExperimentHistory(state.runs);
});
els.experimentInterestThreshold.addEventListener("input", () => {
  state.experimentInterestingnessThreshold = Number(els.experimentInterestThreshold.value || 0);
  saveUiState();
  renderExperimentHistory(state.runs);
});
els.experimentAutoOpen.addEventListener("change", () => {
  state.experimentAutoOpenTopInteresting = els.experimentAutoOpen.checked;
  saveUiState();
});
els.experimentAlertThreshold.addEventListener("input", () => {
  state.experimentAlertThreshold = Number(els.experimentAlertThreshold.value || 0);
  saveUiState();
});
els.experimentVerdictFilter.addEventListener("change", () => {
  state.experimentVerdictFilter = els.experimentVerdictFilter.value;
  saveUiState();
  renderExperimentHistory(state.runs);
});
els.reviewTimelineFilter.addEventListener("change", () => {
  state.reviewTimelineFilter = els.reviewTimelineFilter.value;
  saveUiState();
  renderReviewInbox(state.runs);
});
els.jobArchiveCompletedBtn.addEventListener("click", archiveCompletedJobs);
els.jobDeleteArchivedBtn.addEventListener("click", deleteArchivedJobs);
els.previewBtn.addEventListener("click", previewDataset);
els.preflightBtn.addEventListener("click", runPreflight);
els.planBtn.addEventListener("click", generatePlan);
els.sortBtn.addEventListener("click", async () => {
  await sortDataset();
});
els.sortPairBtn.addEventListener("click", sortDatasetMatchedPair);
els.compareBtn.addEventListener("click", async () => {
  saveUiState();
  await compareRuns();
});
els.compareBestPairBtn.addEventListener("click", selectBestGenesisComparisonPair);
els.compareLeft.addEventListener("change", saveUiState);
els.compareRight.addEventListener("change", saveUiState);
els.runDetailDownloadBtn.addEventListener("click", () => {
  if (!state.currentRunArtifact) return;
  downloadTextFile(state.currentRunArtifact.fileName, state.currentRunArtifact.body);
});
els.runDetailCompareLeftBtn.addEventListener("click", () => promoteRunToCompareSlot("left"));
els.runDetailCompareRightBtn.addEventListener("click", () => promoteRunToCompareSlot("right"));
els.runDetailCompareNowBtn.addEventListener("click", compareActiveRunAgainstSelected);
els.runReviewSaveBtn.addEventListener("click", saveCurrentRunReview);
els.runReviewApplyBtn.addEventListener("click", applyCurrentRunReviewAsNextRun);
els.reviewedRunsExportBtn.addEventListener("click", exportReviewedRunsBatch);
els.reviewedRunsJsonBtn.addEventListener("click", exportReviewedRunsJson);
els.reviewedRunsCsvBtn.addEventListener("click", exportReviewedRunsCsv);
els.reviewedExperimentsExportBtn.addEventListener("click", exportReviewedExperimentsBatch);
els.reviewedExperimentsJsonBtn.addEventListener("click", exportReviewedExperimentsJson);
els.reviewedExperimentsCsvBtn.addEventListener("click", exportReviewedExperimentsCsv);
els.analysisStateExportBtn.addEventListener("click", exportAnalysisStateSnapshot);
els.analysisStateImportMergeBtn.addEventListener("click", () => triggerAnalysisStateImport("merge"));
els.analysisStateImportReplaceBtn.addEventListener("click", () => triggerAnalysisStateImport("replace"));
els.analysisStateImportDiffBtn.addEventListener("click", downloadPendingAnalysisImportDiff);
els.analysisStateImportSnapshotBtn.addEventListener("click", savePendingImportAsSnapshot);
els.analysisStateImportUpdateSnapshotBtn.addEventListener("click", updateExistingSnapshotFromPendingImport);
els.analysisStateImportConfirmBtn.addEventListener("click", applyPendingAnalysisImport);
els.analysisStateImportCancelBtn.addEventListener("click", () => {
  clearPendingAnalysisImport();
  setAnalysisImportStatus("Import cancelled. Current analyst state was left unchanged.");
});
els.analysisSnapshotSaveBtn.addEventListener("click", saveCurrentAnalysisSnapshot);
els.analysisSnapshotExportAllBtn.addEventListener("click", exportAllAnalysisSnapshotReports);
els.analysisSnapshotFilter.addEventListener("input", () => {
  state.analysisSnapshotFilter = els.analysisSnapshotFilter.value.trim();
  saveUiState();
  renderAnalysisSnapshots();
});
els.analysisSnapshotCompareBtn.addEventListener("click", compareAnalysisSnapshots);
els.analysisSnapshotCompareMode.addEventListener("change", () => {
  state.analysisSnapshotCompareMode = els.analysisSnapshotCompareMode.value;
  saveUiState();
  compareAnalysisSnapshots();
});
els.analysisStateImportInput.addEventListener("change", async () => {
  const [file] = els.analysisStateImportInput.files || [];
  const mode = state.pendingAnalysisImportMode;
  state.pendingAnalysisImportMode = null;
  if (!file || !mode) return;
  try {
    await importAnalysisStateFromFile(file, mode);
  } catch (error) {
    setAnalysisImportStatus(`Import failed: ${error.message || String(error)}`, true);
  }
});
els.experimentExportBtn.addEventListener("click", exportExperimentReport);
els.experimentExportHtmlBtn.addEventListener("click", exportExperimentReportHtml);
els.experimentExportBatchBtn.addEventListener("click", exportCompleteExperimentsBatch);
els.experimentApplySuggestionBtn.addEventListener("click", applyActiveExperimentSuggestion);
els.experimentReviewSaveBtn.addEventListener("click", saveCurrentExperimentReview);
els.experimentReviewApplyBtn.addEventListener("click", applyCurrentExperimentReviewAsNextRun);
els.datasetSelect.addEventListener("change", previewDataset);

boot();
