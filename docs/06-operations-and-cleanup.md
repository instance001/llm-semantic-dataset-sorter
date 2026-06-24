# Operations And Cleanup

This document explains which files are product machinery, which files are normal working outputs, and which files are disposable test artifacts.

## Philosophy

This repo is intentionally local-first and artifact-heavy during development.

That means a normal working tree may accumulate:

- build output
- temporary datasets
- saved runs
- analyst state
- exports
- logs
- smoke-test leftovers

That is expected during development.

Before shipping or publishing a clean repo state, the goal is not to preserve every generated file. The goal is to preserve:

- source code
- docs
- schema and planning material
- intentional example assets
- required keepalive files such as `.gitkeep`

## Treat These As Disposable

These are normal local development byproducts and should not be treated as permanent repo content.

### Rust build output

```text
target/
```

This is always disposable.

### Working outputs

```text
outputs/
runs/
```

These contain:

- saved runs
- exports
- logs
- analysis state
- job registry state
- history entries

Useful during development, disposable before shipping unless you intentionally want to publish curated example artifacts.

### Temporary input datasets

```text
input-datasets/
```

During development this folder may contain:

- smoke-test datasets
- debugging samples
- temporary Parquet fixtures

Keep only intentional example data.

### Runtime logs

Examples:

- `server-output.log`
- `server-error.log`
- `server.out.log`
- `server.err.log`
- `*.log`

These are disposable.

## Treat These As Product Machinery

These are part of the actual application and should not be cleaned as "junk".

- `crates/`
- `ui/`
- `docs/`
- `Cargo.toml`
- `Cargo.lock`
- `README.md`
- `LICENSE`
- `.gitignore`

Usually also keep:

- `models/` only if you intentionally include a test model reference policy, not the model weights themselves
- `runtime/` only if you intentionally ship runtime binaries or wrappers

## Safe Pre-Ship Cleanup Checklist

Before shipping or packaging a clean repo snapshot:

1. remove local build output from `target/`
2. remove disposable test runs from `outputs/` and `runs/`
3. remove temporary datasets from `input-datasets/`
4. remove local debug logs
5. keep `.gitkeep` placeholders where the repo expects empty working folders
6. keep only intentional example data or example artifacts
7. verify docs do not reference deleted local-only test files

## What To Keep In `outputs/`

Normally keep only:

- `.gitkeep`

Optionally keep curated example artifacts only if they are intentional documentation or demo material.

## What To Keep In `input-datasets/`

Normally keep only:

- `.gitkeep`

Optionally keep:

- tiny example datasets that help users understand the tool
- fixtures that are intentionally part of tests or docs

Do not keep random local evaluation data by accident.

## Recommended Human Rule

Before shipping, ask:

1. Is this file source code or documentation?
2. Is this file a required empty-folder placeholder?
3. Is this file an intentional example?
4. If not, is it just a local byproduct of building, testing, sorting, or debugging?

If the answer to the last question is yes, it is probably safe to clean.
