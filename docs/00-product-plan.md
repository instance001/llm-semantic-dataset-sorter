# Product Plan

## Working Name

`llm-semantic-dataset-sorter`

The name is functional and accurate. It can be revised later if the product grows beyond dataset sorting.

## Product Definition

This product sorts arbitrary datasets into model-defined semantic buckets using a local GGUF LLM running through a Vulkan-capable runtime.

The user controls:

- the dataset
- the sorting goal
- the positive bucket count

The model controls:

- semantic interpretation of the sorting goal
- suitability judgment for the requested bucket count
- bucket naming
- bucket criteria definitions
- item assignment proposals

The runtime controls:

- run state
- validation
- artifact writing
- user override rules
- output integrity

## Main Use Cases

- Sort a general text dataset into topic-style buckets.
- Sort code issues or snippets into semantic work categories.
- Sort reasoning traces by linear vs abstract structures.
- Sort project notes into operational themes.
- Sort mixed records into bounded categories while preserving overflow in `junk`.

## Required User Inputs

- dataset file or dataset source
- input field selection
- sorting intent
- requested positive bucket count
- selected model/runtime profile
- optional custom instructions

## Required Model Outputs

### Preflight

- intent understanding
- dataset-shape summary
- suitability verdict for the requested bucket count
- recommendation such as `too_low`, `acceptable`, or `too_high`
- optional recommended bucket range
- reasoning summary

### Bucket Plan

- exactly `N` positive buckets
- one mandatory `junk` bucket
- bucket names
- bucket criteria descriptions
- anchor examples

### Assignment

- one bucket assignment per item
- confidence score
- short rationale
- optional review flag

## Key Product Behaviors

### 1. Budget Negotiation

The model must be able to say:

- not enough buckets
- too many buckets
- sorting intent is underspecified
- dataset signal is too weak or too mixed

The user may still continue with the requested count.

### 2. Forced Continuation

If the user forces the run:

- the plan must still contain exactly the requested number of positive buckets
- the `junk` bucket remains mandatory
- poor fit may result in more items landing in `junk`
- the run metadata must record that the model objected and the user overrode the objection

### 3. Honest Overflow

The system should prefer `junk` over fake semantic certainty.

`junk` is not failure. It is explicit overflow, weak fit, ambiguity, or non-conforming material.

### 4. Frozen Per-Run Plan

The generated bucket plan for a run should be frozen before assignment begins.

The assignment phase should classify against the frozen plan, not renegotiate bucket meanings item by item.

## Non-Goals For The First Version

- no cloud inference dependency
- no autonomous agent framework
- no hidden bucket mutation during assignment
- no multi-user orchestration
- no embeddings-first architecture
- no probabilistic graph UI
- no silent schema repair
- no live collaborative dashboard

## Product Standard

The first version is successful when a user can:

1. load a dataset
2. choose a semantic sorting goal
3. request a positive bucket count
4. see the model's semantic fit judgment
5. override if desired
6. generate a frozen bucket plan
7. run assignment
8. inspect results, including `junk`
9. export the run artifacts
