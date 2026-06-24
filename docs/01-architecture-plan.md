# Architecture Plan

## Top-Level Shape

The system should be split into clear layers:

- `core` for shared domain types and validation rules
- `pipeline` for preflight, plan generation, and assignment orchestration
- `llm` for local inference adapter(s)
- `storage` for run artifacts and exports
- `server` for local HTTP API
- `ui` for the dashboard

## Proposed Rust Workspace

```text
llm-semantic-dataset-sorter/
  README.md
  docs/
  crates/
    core/
    pipeline/
    llm/
    storage/
    server/
  ui/
  runs/
  examples/
```

## Crate Responsibilities

### `core`

Owns:

- dataset record types
- preflight types
- bucket-plan types
- assignment types
- validation helpers
- shared error types

This crate should have no GUI or inference-runner knowledge.

### `pipeline`

Owns:

- run orchestration
- phase transitions
- prompt payload building
- response normalization
- structural validation
- override logic

This crate is the application brain.

### `llm`

Owns:

- local model runner abstraction
- Vulkan GGUF backend integration
- model invocation contracts
- inference configuration
- timeout and retry policy

This should be designed behind a trait so the first backend can be swapped later.

### `storage`

Owns:

- run directory creation
- artifact writing
- artifact loading
- export packaging
- append-only event logs
- dataset-format-specific normalization and projection adapters

### `server`

Owns:

- local API routes
- dashboard-facing DTOs
- run lifecycle endpoints
- upload/import endpoints

## UI Direction

The GUI should be web-native and local.

Reasonable shape:

- Rust backend server
- frontend SPA in a `ui/` folder
- dashboard talks to local API

The UI does not need to be exotic in v1. It does need to be inspectable and useful.

## Runtime Pipeline

```text
dataset import
  ->
structured/text projection
  ->
dataset normalization
  ->
preflight request
  ->
preflight verdict
  ->
user confirm or force override
  ->
bucket-plan generation
  ->
bucket-plan freeze
  ->
assignment pass
  ->
validation
  ->
artifact save
  ->
results review
```

## Execution Modes

## Dataset Interpretation Layer

Before preflight, every dataset source should be reduced into a shared model-facing item stream.

Text-native sources can map directly.

Structured sources such as Parquet should pass through an explicit projection step that decides:

- which columns are visible to the model
- which field becomes stable item identity
- how row text is rendered for the model

That projection config should be saved as part of the run state so results remain auditable.

### Preflight Mode

The model sees:

- selected sorting intent
- dataset sample
- dataset shape metadata
- requested positive bucket count

The model returns judgment, not final assignments.

### Plan Mode

The model sees:

- approved run config
- selected sorting intent
- requested positive bucket count
- normalized dataset sample

The model returns exactly `N` positive buckets plus `junk`.

### Assignment Mode

The model sees:

- frozen bucket plan
- one item or one batch of items

The model returns assignments against the frozen plan only.

## Important Constraint

Do not combine plan generation and assignment into one opaque pass.

That makes debugging harder, weakens auditability, and lets bucket meanings drift mid-run.

## Suggested Run Storage

```text
runs/
  <run-id>/
    run_config.json
    dataset_manifest.json
    preflight.json
    bucket_plan.json
    assignments.jsonl
    events.jsonl
    summary.json
```

## Event Model

Every run should record major events:

- dataset loaded
- preflight completed
- user override accepted
- bucket plan generated
- assignment batch completed
- validation passed or failed
- artifacts exported

This will matter later when debugging model behavior.
