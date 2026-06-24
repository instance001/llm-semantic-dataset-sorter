# LLM Semantic Dataset Sorter User Manual

This manual assumes zero prior knowledge.

If you are new to local LLM tooling, GGUF models, Parquet datasets, semantic sorting, or this dashboard, start here.

## What This Tool Is

This application helps you sort a dataset into semantic groups using a local language model.

In plain terms:

- you give the tool a dataset
- you tell it what kind of grouping you want
- you tell it how many main groups it is allowed to create
- the model proposes bucket names and sorting logic
- the runtime forces the model to stay inside that structure
- the tool saves both the results and the explanation for why the model sorted things that way

This is useful when you want more than:

- plain keyword sorting
- embedding search
- a hard-coded classifier

It is meant for exploratory semantic organization with an audit trail.

## What Problem It Solves

People often ask LLMs to group messy data into categories, but two things usually go wrong:

1. the model changes its categorization logic halfway through the task
2. you never get a clear explanation of why the grouping happened

This tool solves that by splitting the task into stages:

1. understand the sorting request
2. judge the bucket budget
3. generate a fixed bucket plan
4. assign items into that fixed plan
5. save the reasoning and outputs

## Important Terms

### Dataset

The collection of things you want to sort.

Examples:

- a folder of text files
- a `.jsonl` file
- a `.txt` file
- a `.md` file
- a `.parquet` file

### Sort Intent

The semantic dimension you want to sort by.

Examples:

- `topic`
- `code`
- `general`
- `linear_reasoning`
- `abstract_reasoning`

You can also use custom instructions to be more specific.

Example:

`Sort these by operational failure mode, implementation risk, and weak-fit junk spillover.`

### Positive Bucket Count

The number of main buckets you want.

If you ask for `4`, the tool will create:

- `4` positive buckets
- `1` `junk` bucket

The `junk` bucket is always required.

### Junk Bucket

The catch-all bucket for items that:

- do not fit the requested sort intent
- fit multiple buckets weakly
- are too ambiguous
- are too low-signal

This is intentional. The tool prefers honest overflow over fake certainty.

### Preflight

The preflight step is the model's first pass over the job.

It answers questions like:

- does this requested bucket count make sense?
- does the dataset look too narrow for this many buckets?
- does the dataset look too broad for this few buckets?

The model can warn you, but you can still choose to force the run.

### Frozen Bucket Plan

Once a plan is generated, that plan becomes the truth for the run.

The model is not allowed to invent new bucket logic later during assignment.

This matters because it makes the run more stable and auditable.

### GGUF Model

A GGUF is a local model file format commonly used for running LLMs on your own machine.

You do not need to fully understand the format to use the tool. Practically, it means:

- your model lives on disk
- your machine runs it locally
- the dashboard talks to that local runtime

## What You Need Before Starting

At minimum:

- this repo on your machine
- Rust installed
- a dataset placed in `input-datasets/`

For real model inference, also have:

- a local runtime binary in `runtime/`
- a GGUF model file in `models/`

If you just want to test the UI and pipeline, you can use `mock` mode instead.

## Folder Layout

The main folders are:

```text
input-datasets/
models/
runtime/
outputs/
docs/
```

### `input-datasets/`

Place datasets here.

Examples:

- `input-datasets/my-data.jsonl`
- `input-datasets/support-tickets/`
- `input-datasets/training-sample.parquet`

### `models/`

Place your `.gguf` model file here.

### `runtime/`

Place your local runtime executable here.

Example:

- `runtime/llama-cli.exe`

### `outputs/`

The tool writes results here.

This includes:

- saved runs
- exported bucket files
- analysis state
- analyst snapshots
- logs

## Starting The Tool

### Option 1: Mock Mode

Use this if you want to test the dashboard and pipeline without real model inference.

In PowerShell:

```powershell
$env:SORTER_LLM_DRIVER = "mock"
cargo run -p server
```

### Option 2: Local GGUF Runtime

Use this for real local model execution.

In PowerShell:

```powershell
$env:SORTER_LLM_DRIVER = "llama_cli"
$env:SORTER_RUNTIME_DIR = ".\\runtime"
$env:SORTER_MODEL_PATH = ".\\models\\your-model.gguf"
cargo run -p server
```

When the server starts, it tries to open the local dashboard automatically at:

```text
http://127.0.0.1:3000
```

If that does not happen on your machine, open the address manually in a browser.

If you want to disable auto-open behavior, set:

```powershell
$env:SORTER_AUTO_OPEN_BROWSER = "0"
```

## First Run Walkthrough

This section shows a full beginner flow.

### Step 1: Add a dataset

Put your dataset into `input-datasets/`.

Examples:

- a folder full of `.txt` or `.md` files
- a `.jsonl` file
- a `.parquet` file

### Step 2: Open the dashboard

The server should open the local dashboard automatically.

If it does not, open `http://127.0.0.1:3000` manually in your browser.

You should see sections for:

- dataset and sort request
- preview
- preflight verdict
- plan explanation
- bucket shape
- sort output

### Step 3: Choose a dataset

Select the dataset from the dataset dropdown.

The preview panel should show:

- dataset name
- item count
- sample size
- preview content

### Step 4: Choose a sort intent

Pick the semantic dimension you care about.

Examples:

- use `topic` if you want subject-matter grouping
- use `code` if you want implementation-oriented grouping
- use `linear_reasoning` if you want proof-step or sequential reasoning grouping
- use `abstract_reasoning` if you want conceptual or analogy-heavy grouping

### Step 5: Choose a bucket genesis mode

You have two modes:

- `Data Skim Before Labels`
- `Blind Label Before Data`

#### Data Skim Before Labels

The model looks at the dataset before naming buckets.

Use this when you want:

- better fit to the actual dataset
- more adaptive categories
- exploratory analysis based on what is really in the data

#### Blind Label Before Data

The model must create bucket labels before seeing dataset content for bucket creation.

Use this when you want:

- a more theory-first ontology
- to test what the model assumes the semantic structure should be
- side-by-side comparison against skim mode

### Step 6: Choose the positive bucket count

This is the number of main buckets the model gets to create.

Start with a moderate number such as `3`, `4`, or `5` unless you already know the dataset shape well.

Remember:

- more buckets can over-fragment
- fewer buckets can force unlike things together
- the model can warn you during preflight

### Step 7: Add custom instructions if needed

Use custom instructions when the built-in sort intent is not specific enough.

Example:

`Sort for operational failure patterns, implementation detail, abstract policy discussion, and weak-signal junk.`

### Step 8: Run preflight

Click `Run Preflight`.

The tool will show whether the model thinks your requested bucket count is:

- too low
- acceptable
- too high

This does not sort the dataset yet. It is a semantic budget check.

### Step 9: Read the verdict

Take the verdict seriously, but not blindly.

If the model says:

- `too low`
  your categories may be too compressed
- `too high`
  your categories may be artificial or empty
- `acceptable`
  the current budget is plausible

### Step 10: Generate a plan

Click `Generate Plan`.

This creates the frozen bucket plan for the run.

The plan includes:

- bucket names
- bucket descriptions
- criteria
- junk rules
- human explanation

### Step 11: Read the explanation

This is one of the most important parts of the tool.

Read:

- sorting intent interpretation
- bucket shape rationale
- bucket count judgment
- what each bucket means
- signals noticed
- weak or junk signals
- surprising groupings
- zoom-in suggestions
- caution notes

This is where the tool answers:

- what relationship between these grouped things mattered?
- why did the model think these categories were real?
- what did it treat as noise?

### Step 12: Decide whether to force or continue

If preflight objected to the bucket count, decide whether to:

- adjust the bucket count
- switch bucket genesis mode
- change custom instructions
- force the run anyway

### Step 13: Sort the dataset

Click `Sort Dataset`.

The runtime will:

1. keep the bucket plan fixed
2. assign each item to one bucket or `junk`
3. write artifacts to disk

### Step 14: Inspect outputs

After the run completes, inspect:

- run details
- bucket exports
- human summary
- evidence snapshot

## Working With Parquet Datasets

Parquet is a structured row-based format often used for data and ML pipelines.

In this tool, a Parquet dataset works differently from a folder of text files.

### How Parquet sorting works here

Each row is treated as one candidate item.

Before sorting, you choose which fields should be projected into model-facing text.

This matters because many Parquet files contain:

- identifiers
- numeric columns
- metadata columns
- text columns

Not every field should be shown to the model.

### Projection

Projection means:

- which fields should be used to build the model's text view of the row
- which field should be treated as the row identity
- how the row should be rendered into normalized text

### Why projection matters

Bad projection can make a good model look stupid.

Examples:

- if you hide the important text fields, the model sees too little
- if you include too much noisy metadata, the model may overfit junk columns
- if you mix unrelated fields, bucket semantics can become unstable

### What to do

For Parquet datasets:

1. preview the dataset
2. inspect raw rows
3. choose the fields that actually carry semantic meaning
4. keep the identity field stable for auditing
5. rerun if the projection was too narrow or too noisy

## Understanding Outputs

The tool writes both human-facing and machine-facing artifacts.

### Human-facing outputs

These are for you to read.

Examples:

- plan explanations
- run summaries
- experiment reports
- snapshot reports

### Machine-facing outputs

These are for pipelines, downstream tooling, or audit automation.

Examples:

- JSON
- JSONL
- CSV
- Parquet

### Bucket export folders

Each bucket may contain exported items in multiple machine-friendly formats.

This makes the same run usable for:

- manual inspection
- scripting
- data pipeline follow-up

## Reviewing Runs

After a run, you can mark whether it was:

- useful
- surprising
- needs follow-up
- misleading

You can also leave a note describing what actually mattered.

This is not cosmetic. These review notes become part of the analysis layer.

## Experiments And Matched Pairs

The tool can compare related runs as experiments.

A common case is comparing:

- `data_skim`
- versus
- `blind_label`

for the same dataset, sort intent, and bucket count.

This helps answer:

- does the model discover structure from the data?
- or does it impose a structure in advance?

### Experiment signals

Experiments can track drift such as:

- bucket name drift
- projection drift
- bucket distribution drift
- junk drift
- explanation drift
- review drift
- overall interestingness

## Watchlist And Trend Tracking

You can watch a dataset and sort-intent combination over time.

This is useful when you rerun the same target under:

- different prompts
- different bucket budgets
- different genesis modes
- different projections

The watchlist helps track whether the semantic picture is:

- stable
- rising in interestingness
- drifting structurally

## Analyst Snapshots

Analyst snapshots let you save the current review state.

This includes things like:

- watch targets
- run reviews
- experiment reviews
- experiment insights
- trend state

Use snapshots when you want to:

- preserve a review pass
- compare two interpretations
- export your current analyst state
- return to a prior analysis stance later

## Importing And Exporting Analyst State

The dashboard can export analyst review state and import it later.

This is separate from the raw run artifacts.

That means:

- you can move review judgments around
- you can preserve notes and snapshot metadata
- you do not have to rerun the sort just to share or restore the analyst layer

### Merge import

Use merge when you want to combine imported analyst state with current analyst state.

### Replace import

Use replace when you want the imported state to become the current state.

### Diff preview

Before applying an import, review the preview and diff report so you know what will change.

## Practical Tips

### Start simpler than you think

If you are unsure, start with:

- `topic`
- `data_skim`
- `4` positive buckets

That is usually easier to reason about than starting with a complicated custom instruction and `8` buckets.

### Trust junk more than forced fit

If many items go to junk, that is not automatically failure.

It can mean:

- the intent is too narrow
- the bucket count is too low
- the data is genuinely mixed
- the projection is poor

### Compare blind vs skim when ontology matters

If you care about the difference between:

- data-led grouping
- versus theory-led grouping

then matched-pair comparison is worth doing.

### Revisit projection for Parquet before blaming the model

Projection mistakes are a common source of bad results on structured datasets.

### Read the explanation, not just the bucket names

Bucket names alone can be misleading.

The real signal is in:

- rationale
- noticed signals
- weak signals
- caution notes

## Common Beginner Questions

### "Why did the model say my bucket count was wrong?"

Because semantic structure has a natural granularity. Too many buckets can invent distinctions that are not really there. Too few buckets can collapse unlike things together.

### "Can I force it anyway?"

Yes. The model can object, but the runtime still allows a forced run.

### "Why is there always a junk bucket?"

Because real data is messy, and the tool prefers honest uncertainty over fake clean classification.

### "Why would I use blind label mode?"

To test the model's prior ontology instead of letting the observed data shape the bucket names first.

### "Why do two runs on the same dataset differ?"

Common reasons:

- different bucket genesis mode
- different custom instructions
- different projection
- different bucket budget
- model instability

### "Why does Parquet need special handling?"

Because Parquet is structured row data, not raw text files. The model needs a deliberate text projection of row fields.

## Troubleshooting

### No datasets appear

Check that:

- the files are inside `input-datasets/`
- the server is running
- the dataset format is supported

### The model output looks bad

Check:

- sort intent
- bucket count
- custom instructions
- bucket genesis mode
- Parquet projection if applicable

### Too much goes to junk

Try:

- widening the bucket budget slightly
- broadening the sort intent
- improving custom instructions
- fixing projection

### Buckets feel arbitrary

Try:

- running preflight again
- comparing `blind_label` vs `data_skim`
- reducing bucket count
- reading the explanation for weak-signal warnings

### Snapshot compare does not tell a useful story

Make sure the compared snapshots actually differ in:

- verdicts
- experiment reviews
- experiment insights
- alert tracking

## Recommended First Learning Loop

If you are brand new, use this sequence:

1. start in `mock` mode
2. load a small text dataset
3. sort by `topic`
4. request `4` buckets
5. run preflight
6. generate a plan
7. read the explanation carefully
8. run the sort
9. mark the run with a review note
10. save an analyst snapshot
11. repeat with `blind_label`
12. compare the results

That gives you the fastest intuition for how the system thinks.

## Related Docs

- [README](../README.md)
- [Product Plan](./00-product-plan.md)
- [Architecture Plan](./01-architecture-plan.md)
- [Schema Plan](./02-schema-plan.md)
- [MVP Plan](./03-mvp-plan.md)
- [Parquet Lane Plan](./04-parquet-lane-plan.md)
