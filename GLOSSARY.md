# Glossary

This glossary defines the local terms used in `llm-semantic-dataset-sorter`.

The repo sits in the broader semantic and memory architecture lane, but it has its own operator-facing vocabulary. This file keeps those terms explicit so the sorting workflow stays readable and auditable.

## LLM Semantic Dataset Sorter

The local semantic sorting workbench in this repo.

What it is:
- a local-first GGUF-backed semantic sorting tool
- a Rust backend plus web-native dashboard
- a way to inspect how a model partitions a dataset under declared pressure

What it is not:
- plain keyword sorting
- a cloud labeling service
- an automatic truth oracle

## Dataset

The collection of items being sorted.

What it is:
- the source material placed in `input-datasets/`
- a file, folder, or Parquet row set the tool can preview and process
- the thing semantic pressure is applied to

What it is not:
- automatically meaningful just because it is present
- always text-native in its raw form
- guaranteed to contain clean signal

## Sort Intent

The semantic dimension the user wants the model to sort on.

What it is:
- the question being asked of the dataset
- a task like `topic`, `code`, `linear_reasoning`, or custom instructions
- the main interpretive pressure on the run

What it is not:
- one fixed ontology
- a promise that the dataset naturally supports that framing
- enough on its own without a usable bucket budget

## Positive Buckets

The main categories the model is allowed to create.

What they are:
- the requested semantic buckets inside the user-declared budget
- the primary grouping surface for the run
- fixed in count before assignment

What they are not:
- unlimited categories
- silently adjustable by the model
- proof that the resulting partition is objectively correct

## Junk Bucket

The mandatory overflow bucket.

What it is:
- the honest spillover bucket for weak-fit, mixed, ambiguous, or low-signal items
- an important source of evidence about bad fit, bad projection, or bad budget
- part of the design, not an embarrassment

What it is not:
- a failure state by default
- a discard pile that means nothing
- something to eliminate by forcing fake certainty

## Bucket Budget

The number of positive buckets the user requests.

What it is:
- the user-defined semantic bandwidth for the run
- the limit inside which the model must partition the dataset
- one of the most important operator controls

What it is not:
- a number the model can silently rewrite
- automatically optimal on the first try
- separate from the interpretive pressure of the sort intent

## Preflight

The semantic budget check before plan generation.

What it is:
- the stage where the model judges whether the requested bucket count looks too low, about right, or too high
- a warning and calibration step before committing to a plan
- a chance to catch mismatch early

What it is not:
- the final sort
- permission for the model to ignore the user's requested bucket count
- proof that the later run will be perfect

## Bucket Genesis Mode

The stance used when creating buckets.

What it is:
- the choice between `data_skim` and `blind_label`
- a way to compare bucket shapes informed by the data versus imposed before seeing it
- a meaningful experimental control

What it is not:
- the same thing as assignment logic
- just a cosmetic preference
- a guarantee that one mode is always better

## Data Skim

The bucket-creation mode where the model sees dataset material before naming buckets.

What it is:
- the more data-informed bucket genesis mode
- useful when you want the bucket plan to respond to the observed material

What it is not:
- a guarantee of truth
- immune to weak signal or overfitting

## Blind Label

The bucket-creation mode where the model names the bucket structure before seeing dataset content for bucket creation.

What it is:
- a way to inspect the ontology the model imposes under the declared intent and budget
- useful for comparing prior structure against observed structure later

What it is not:
- the same as random guessing
- evidence that the dataset naturally partitions that way

## Frozen Plan

The locked bucket plan for a run.

What it is:
- the bucket reality fixed before assignment begins
- the thing the model must live inside during sorting
- a guard against mid-run ontology drift

What it is not:
- a live renegotiation during assignment
- a moving target that changes item by item
- the same thing as the final human interpretation of the run

## Projection

The model-facing text view of structured data.

What it is:
- the selected fields from a structured dataset that are turned into text for the model
- the semantic window the model actually sees
- especially important for Parquet datasets

What it is not:
- the whole raw dataset in every case
- irrelevant implementation detail
- safe to ignore when the results look odd

## Semantic Triangulation

The deeper investigative use of the tool.

What it is:
- comparing runs, budgets, genesis modes, models, and junk behavior to inspect how structure appears under different conditions
- using sorting as investigation rather than automatic truth
- one of the central reasons this repo matters

What it is not:
- worshipping the first bucket names the model invents
- assuming a neat partition is automatically a correct one
- replacing human judgment

## Analyst State

The human review layer around runs and experiments.

What it is:
- saved verdicts, notes, watchlist targets, trend tracking, snapshots, and comparisons
- the operator-side interpretation layer that sits beside the machine artifacts

What it is not:
- the semantic sort itself
- a substitute for reading the run outputs
- a hidden memory system
