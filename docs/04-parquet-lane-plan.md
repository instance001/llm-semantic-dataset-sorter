# Parquet Lane Plan

## Why This Lane Exists

The current sorter is already strong for text-native datasets.

Parquet matters because a lot of real dataset work lands as structured rows rather than loose text files:

- instruction datasets
- code benchmark rows
- reasoning traces with metadata columns
- mixed research corpora
- eval captures

We should support that shape directly instead of forcing users to pre-convert everything into `jsonl`.

## Core Product Rule

Parquet support is not "semantic sorting of arbitrary binary tables."

It is:

`structured rows -> explicit text projection -> frozen semantic sorting pipeline -> auditable outputs`

That distinction matters because the LLM sorts text-bearing representations, not raw typed columns.

## Desired User Experience

For a Parquet dataset, the user should be able to:

1. place a `.parquet` file in `input-datasets/`
2. select it in the dashboard
3. inspect schema and sample rows
4. choose which columns or derived fields become the model-facing text view
5. optionally choose an ID column if one exists
6. run the same preflight, plan, and sort pipeline already used for text datasets
7. inspect both human-facing explanations and machine-facing structured outputs

## V1 Parquet Scope

### Include

- single-file `.parquet` dataset discovery
- schema inspection
- row count and sample preview
- explicit text-column selection
- optional custom item ID column
- deterministic row-to-text projection
- sort results written as structured row exports per bucket
- human-readable explanation of which columns were projected

### Exclude

- partitioned Parquet dataset directories
- nested-schema editing UI beyond a narrow first pass
- arbitrary computed expressions in the dashboard
- row group pushdown optimization
- huge-file streaming optimization as a first requirement
- writing Parquet back out in v1 if CSV/JSONL is enough to prove the lane

## First-Pass Data Model Additions

We should widen dataset metadata so the system knows not just "what dataset" but "how the dataset was interpreted."

Recommended additions:

- dataset format: `text_file`, `jsonl`, `json`, `directory`, `parquet`
- schema summary for structured sources
- projection config:
  - selected columns
  - optional id column
  - optional prefix labels like `prompt:` / `response:`
- preview metadata:
  - total row count
  - projected sample text
  - raw sample field view

This becomes part of the run audit trail.

## Projection Model

The important abstraction is a projection step before preflight.

Recommended rule:

- each row becomes one normalized `DatasetItem`
- `item_id` comes from:
  - selected ID column if present
  - otherwise deterministic row index
- `content` becomes a stable rendered text block from selected columns

Recommended default rendering:

```text
column_a: <value>
column_b: <value>
column_c: <value>
```

That keeps the model grounded in field boundaries without requiring a bespoke prompt format per dataset.

## Preview Requirements

Parquet preview should show two things side by side:

- raw structured sample
- projected text sample

That lets the user sanity-check whether the selected columns are actually giving the model the right semantic view.

## Artifact Plan

Parquet runs should still produce the standard run artifacts:

- `run_config.json`
- `preflight.json`
- `bucket_plan.json`
- `assignment_summary.json`
- `assignments.jsonl`
- `run_summary.md`

They should also add structured-source artifacts:

- `dataset_projection.json`
- `bucket_exports/`

Inside `bucket_exports/`, first-pass machine-facing outputs can be:

- `<bucket>/items.jsonl`
- `<bucket>/items.csv`

If Parquet write-back is easy and stable later, we can add:

- `<bucket>/items.parquet`

But we should not block the first lane on write-back.

## Human-Facing Reporting

Parquet needs extra explanation because users can accidentally sort on the wrong columns.

The run summary should include:

- dataset format
- selected columns
- chosen ID column
- projection rendering strategy
- warnings about excluded columns
- note when strong semantics may live in columns not shown to the model

This aligns with the existing "why did the model choose these buckets" requirement.

## Preflight Implications

For structured datasets, preflight should comment on:

- whether the selected columns carry enough semantic signal
- whether the requested bucket count fits the projected content
- whether rows appear repetitive, sparse, or metadata-heavy
- whether the projection is too narrow or too broad

This is where the model can say:

- "you asked for topic sorting but only selected numeric metadata"
- "these columns collapse to near-duplicate records"
- "the semantic signal suggests fewer or more buckets"

## Output Strategy

We should support two output lanes at once:

### Human lane

- folder-per-bucket
- readable item text files
- assignment metadata

### Machine lane

- row-preserving exports per bucket
- assignment-enriched JSONL and CSV
- later optional Parquet write-back

That gives us both auditability and downstream usefulness.

## Recommended Technical Sequence

1. Add format metadata and projection config types in `core`.
2. Add Parquet dataset discovery in `storage`.
3. Add schema/sample preview endpoints for structured sources.
4. Add dashboard controls for column selection and ID-column selection.
5. Add row-to-text projection and persist it in run artifacts.
6. Reuse existing preflight / plan / assignment pipeline on projected items.
7. Add structured bucket exports.
8. Add human-facing reporting for projection decisions and risks.

## Guardrails

We should keep the first lane intentionally narrow.

Rules:

- no hidden column inference without showing the user
- no auto-dropping columns without recording it
- no pretending numeric-heavy rows are semantically rich text
- no schema magic that hides how `content` was formed

If the model is sorting projected text, the user must be able to inspect that projection directly.

## Recommendation

The best next implementation path is:

- plan Parquet as a structured-source lane, not a special-case parser
- make projection config first-class in run state
- ship JSONL/CSV structured bucket exports before Parquet write-back
- only add advanced schema features after the narrow lane is stable
