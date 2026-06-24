# MVP Plan

## MVP Goal

Prove the end-to-end local loop:

`dataset -> preflight -> override decision -> bucket plan -> assignment -> saved artifacts`

## MVP Scope

### Include

- local file dataset import
- text-oriented dataset normalization
- sort-intent input
- requested positive bucket count
- model preflight judgment
- force override
- bucket-plan generation
- batch assignment
- local artifact persistence
- local web dashboard
- results table with bucket filters
- explicit `junk` bucket review

### Exclude

- multi-user support
- distributed runners
- authentication
- cloud sync
- non-local storage
- adaptive learning across runs
- background job queue complexity
- advanced visualization beyond useful tables and summaries

## MVP Assumptions

- input datasets can be reduced to text-bearing records
- the first backend targets one local Vulkan-capable GGUF runtime
- runs are initiated manually from the dashboard
- the user is willing to review model objections before forcing a run

## Recommended First Technical Pass

1. Define Rust domain structs.
2. Define artifact JSON formats.
3. Build a fake in-memory model adapter for testing the pipeline.
4. Build the pipeline against the fake adapter first.
5. Add the real local inference adapter after the pipeline is stable.
6. Add the dashboard once the API contracts are fixed.

This order will keep the repo from becoming UI-first chaos.

## Initial Implementation Sequence

### Phase 1

- create Rust workspace
- implement `core` types
- implement schema serialization
- implement run storage

### Phase 2

- implement pipeline state machine
- implement preflight contract
- implement bucket-plan contract
- implement assignment contract

### Phase 3

- implement local GGUF backend adapter
- test with saved prompt/response fixtures

### Phase 4

- implement local API server
- implement dashboard

## Open Questions

- Which Vulkan-capable local runner do we target first?
- What dataset formats are in-scope for v1: `csv`, `jsonl`, `json`, `txt`, `parquet`?
- Do we batch assignment by rows, documents, or token budget?
- Does `junk` cover both overflow and low-confidence mismatch, or do we later split those?
- Do we allow custom intent text only, or also ship preset intents?

## Recommendation

For v1:

- accept `csv`, `jsonl`, and simple `json`
- stage `parquet` as the first structured-row lane after text-native ingestion is stable
- support presets plus freeform custom intent
- keep one visible `junk` bucket in the UI
- preserve richer junk reasons in the artifact
- start with small and medium datasets before pretending this is a giant-scale sorter
