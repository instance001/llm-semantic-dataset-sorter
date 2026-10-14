# Provenance: llm-semantic-dataset-sorter

## Project identity

- Canonical repository: <https://github.com/instance001/llm-semantic-dataset-sorter>
- Public originating identity: `instance001` (repository owner recorded by GitHub API; copyright ownership is not inferred).
- Status: `NEEDS_HUMAN_VERIFICATION`
- Verified repository creation record: 2026-06-24T22:32:45Z. This is not asserted to be an original publication date.

## Intellectual contribution

GitHub repository description (repository-supplied context): Local-first Rust + web dashboard for semantic dataset sorting with GGUF LLMs. Generate fixed bucket plans, compare blind-vs-skim ontology, inspect human-facing reasoning, sort Parquet or text datasets, and review/export auditable run and analyst-state artifacts. Designed to sort meaning and connections, not just data and files.

No independent originality, priority, validation, authorship, or implementation relationship is asserted by this baseline record. A project-specific evidence review is required before making any such claim.

## Prior art and influences

Not exhaustively reviewed by this baseline. Do not treat absence of a listed influence as a claim of novelty.

## Implementation relationships

None asserted automatically. Similar names, topics, or portfolio membership are not evidence of derivation.

## Attribution and citation

Preserve the repository's existing legal notices and applicable licence when copying protected expression. Use `CITATION.cff` for a voluntary repository citation. Independent implementation of an abstract method is not automatically governed by a software licence.

## Licensing

GitHub API licence field at inventory time: `AGPL-3.0`. This is a metadata observation, not a relicensing statement. See the repository's actual licence files and third-party notices.

## Evidence and limitations

Evidence: authenticated GitHub API metadata captured by the FMI provenance audit. Contribution, prior art, ownership, contributors, document licensing, relationships, releases, and publication status require human verification.

## Evidence-led lineage position

`README.md` and the Rust pipeline/storage crates support an `IMPLEMENTED` governed semantic-partitioning workbench. Its documented combination is: an operator-selected positive-bucket budget; model-generated categories within that fixed budget; exactly one mandatory `junk` overflow bucket; a preflight fit judgment that may be overridden explicitly; `blind_label` versus `data_skim` plan genesis; a frozen plan whose count is validated against the requested count before assignment; saved assignment/event/export artifacts; and dashboard-based analyst verdict, comparison, watchlist, snapshot, and export workflows. `crates/pipeline/src/lib.rs` validates the requested count and only allows plan generation after acceptable preflight or an explicit force override; `crates/storage/src/lib.rs` persists plan, preflight, assignments, summaries, and run artifacts.

This repository is not automatically Semantic Signal Alphabet or LLM-Defined Persistent Memory. The reviewed README/source record does not state a dependency or inheritance relationship to either; all three concern semantic organisation but serve distinct documented purposes. Do not infer a lineage from terminology alone. General categorisation, clustering, manual review, audit trails, and overflow handling are established patterns; this record asserts only the implemented combination and preserves uncertainty about novelty/priority.
