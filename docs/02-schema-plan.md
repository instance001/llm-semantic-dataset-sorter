# Schema Plan

## Principle

The runtime should enforce boring, explicit JSON contracts.

The model may propose semantic structure, but the runtime owns artifact shape.

## Core Artifacts

- `run_config.json`
- `dataset_manifest.json`
- `preflight.json`
- `bucket_plan.json`
- `assignments.jsonl`
- `events.jsonl`
- `summary.json`

## `run_config.json`

Records:

- run id
- timestamp
- dataset source
- selected fields
- sorting intent
- custom instructions
- requested positive bucket count
- model id
- backend id
- force override flag

## `preflight.json`

Records:

- requested positive bucket count
- suitability verdict
- verdict code: `too_low | acceptable | too_high | unclear_intent | weak_signal`
- reasoning summary
- recommended bucket minimum
- recommended bucket maximum
- dataset observations
- model id

## `bucket_plan.json`

Records:

- run id
- model id
- sorting intent
- positive bucket count
- positive buckets
- junk bucket
- generation notes

Each positive bucket should contain:

- `bucket_id`
- `name`
- `description`
- `criteria`
- `anchor_examples`

The junk bucket should contain:

- `bucket_id`
- `name`
- `description`
- `junk_reasons`

## `assignments.jsonl`

One record per dataset item assignment:

- `item_id`
- `assigned_bucket_id`
- `confidence`
- `rationale`
- `review_flag`

## `events.jsonl`

Append-only runtime events:

- `event_id`
- `timestamp`
- `event_type`
- `phase`
- `details`

## `summary.json`

Final run summary:

- item counts per bucket
- junk count
- review-flag count
- override used or not
- validation status
- export status

## Future Schema Extension

Possible later additions:

- per-item alternative bucket candidates
- batch assignment metadata
- token/time usage
- prompt/response archival
- dataset sampling provenance

These should remain optional extensions, not blockers for v1.
