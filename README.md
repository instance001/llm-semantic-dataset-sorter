# LLM Semantic Dataset Sorter

Local semantic dataset sorting with a GGUF LLM, a Rust backend, and a web-native dashboard.

## License

This project is licensed under the GNU Affero General Public License v3.0.

See [LICENSE](./LICENSE).

## What This Tool Does

This repo is a local-first workbench for asking an LLM to sort a dataset into semantic buckets under a fixed bucket budget.

You provide:

- a dataset
- a sort intent such as `general`, `code`, `linear_reasoning`, `abstract_reasoning`, `topic`, or custom instructions
- a requested number of positive buckets
- for Parquet datasets, the fields that should be projected into model-facing text

The system then:

1. inspects the dataset
2. runs a semantic preflight
3. judges whether your requested bucket count looks too low, about right, or too high
4. generates exactly `N` positive buckets plus one required `junk` bucket
5. explains why it chose that bucket shape
6. freezes that bucket plan for the run
7. assigns items into the frozen buckets
8. writes human-facing and machine-facing artifacts to disk
9. lets you review, compare, snapshot, and export analyst state from the dashboard

The governing rule is:

> The user defines the budget.  
> The model defines the semantic partition inside that budget.  
> The runtime enforces structure and preserves the audit trail.

## Core Concepts

### Sort Intent

The semantic dimension you want the model to sort on.

Examples:

- `topic`
- `code`
- `linear_reasoning`
- `abstract_reasoning`
- a custom instruction such as "sort by operational failure mode and implementation risk"

### Positive Buckets

The main semantic categories the model is allowed to create.

If you request `4`, the run must produce:

- `4` positive buckets
- `1` `junk` bucket

The model can say the number is semantically poor, but it cannot silently change it.

### Junk Bucket

The mandatory overflow bucket for:

- weak-fit items
- ambiguous items
- mixed-content items
- records that do not fit the requested intent cleanly

### Bucket Genesis Modes

The tool supports two bucket-creation modes:

- `data_skim`
  The model sees dataset material before naming buckets.
- `blind_label`
  The model must name the bucket structure before seeing dataset content for bucket creation.

This lets you compare:

- "what does the model think the data wants?"
- versus
- "what ontology does the model impose before seeing the data?"

### Preflight

The preflight stage is the model's chance to say:

- this bucket count is good
- this is too many buckets
- this is too few buckets

You can still force the run if you want.

### Frozen Plan

Once a plan is generated for a run, that plan is locked in. The model does not get to drift into new categories halfway through assignment.

## Current Feature Set

### Dataset inputs

- top-level file datasets in `input-datasets/`
- top-level folder datasets in `input-datasets/`
- recursive text-file discovery for folder datasets
- Parquet dataset discovery and preview

### Sorting workflow

- dataset preview
- preflight bucket-count judgment
- force override
- plan generation
- full sort execution
- background jobs with persistence across server restart

### Human-facing explanation

Each plan can explain:

- sorting intent interpretation
- why the bucket shape was chosen
- what each bucket means
- signals the model noticed
- weak or junk signals
- why the requested bucket count was good or bad
- surprising groupings
- "zoom in here" suggestions
- caution notes against over-interpretation

### Analyst review workflow

- run verdicts and notes
- experiment verdicts and notes
- watchlist targets
- trend tracking
- interestingness scoring
- experiment comparison
- snapshot save/load/export
- analyst-state import and export
- snapshot comparison with verdict and insight diffs

### Parquet lane

- Parquet dataset preview
- selected-field projection into normalized text items
- preserved row identity for auditability
- machine-facing bucket exports
- human-facing bucket browser in the dashboard
- bucket exports including `jsonl`, `csv`, and `parquet`

## Project Layout

```text
input-datasets/
models/
runtime/
outputs/
docs/
crates/
ui/
```

### `input-datasets/`

Put source datasets here.

Current behavior:

- each top-level file or folder is treated as one selectable dataset
- supported text-like top-level files include `jsonl`, `json`, `txt`, and `md`
- top-level folders are scanned recursively for supported text-like files
- folder datasets treat each discovered file as one dataset item
- Parquet files are treated as structured row datasets

### `models/`

Put GGUF model files here.

### `runtime/`

Put the local runtime binaries here, such as `llama-cli.exe`.

### `outputs/`

The tool writes runs, exports, logs, analysis state, and history here.

Representative shape:

```text
outputs/
  analysis/
  exports/
  history/
  logs/
  runs/
  state/
```

## Runtime Modes

The server currently supports:

- `mock`
  Stable development mode for UI, pipeline, and artifact verification.
- `llama_cli`
  Direct subprocess execution against a local runtime binary such as `runtime/llama-cli.exe`.

## Environment Variables

- `SORTER_RUNTIME_DIR`
- `SORTER_MODEL_PATH`
- `SORTER_LLM_DRIVER`
- `SORTER_AUTO_OPEN_BROWSER`
- `SORTER_LLM_N_GPU_LAYERS`
- `SORTER_LLM_CTX_SIZE`
- `SORTER_LLM_TEMPERATURE`
- `SORTER_LLM_PREDICT_TOKENS`
- `SORTER_LLM_PREFLIGHT_PREDICT_TOKENS`
- `SORTER_LLM_PLAN_PREDICT_TOKENS`
- `SORTER_LLM_ASSIGNMENT_PREDICT_TOKENS`
- `SORTER_LLM_ASSIGNMENT_BATCH_SIZE`

## Running The Server

Mock mode:

```powershell
$env:SORTER_LLM_DRIVER = "mock"
cargo run -p server
```

Local GGUF mode:

```powershell
$env:SORTER_LLM_DRIVER = "llama_cli"
$env:SORTER_RUNTIME_DIR = ".\\runtime"
$env:SORTER_MODEL_PATH = ".\\models\\your-model.gguf"
$env:SORTER_LLM_ASSIGNMENT_BATCH_SIZE = "8"
cargo run -p server
```

The server listens on:

```text
http://127.0.0.1:3000
```

By default, starting the server also opens that local dashboard in your browser automatically.

If you want to disable that behavior, set:

```powershell
$env:SORTER_AUTO_OPEN_BROWSER = "0"
```

## Main API Endpoints

- `GET /health`
- `GET /api/datasets`
- `GET /api/datasets/{dataset_id}/preview`
- `POST /api/datasets/{dataset_id}/preflight`
- `POST /api/datasets/{dataset_id}/plan`
- `POST /api/datasets/{dataset_id}/sort`
- `POST /api/datasets/{dataset_id}/sort-jobs`
- `GET /api/jobs`
- `GET /api/jobs/{job_id}`
- `POST /api/jobs/{job_id}/cancel`
- `GET /api/analysis-state`
- `POST /api/analysis-state`

## Typical Operator Flow

1. Put a dataset in `input-datasets/`.
2. Put your GGUF in `models/` and runtime binary in `runtime/`, or use `mock`.
3. Start the server with `cargo run -p server`.
4. The local dashboard opens automatically at `http://127.0.0.1:3000`.
5. If it does not open, browse to `http://127.0.0.1:3000` manually.
6. Preview the dataset.
7. Choose a sort intent and bucket genesis mode.
8. Set the positive bucket count.
9. Run preflight.
10. Generate a plan.
11. Read the human explanation of why the buckets were chosen.
12. Run the sort.
13. Inspect saved outputs, bucket exports, and run details.
14. Review runs and experiments.
15. Save snapshots of analyst state and compare them later.

## Documentation

- [Zero-Knowledge User Manual](./docs/05-user-manual.md)
- [Operations And Cleanup](./docs/06-operations-and-cleanup.md)
- [Release Checklist](./docs/07-release-checklist.md)
- [Product Plan](./docs/00-product-plan.md)
- [Architecture Plan](./docs/01-architecture-plan.md)
- [Schema Plan](./docs/02-schema-plan.md)
- [MVP Plan](./docs/03-mvp-plan.md)
- [Parquet Lane Plan](./docs/04-parquet-lane-plan.md)
