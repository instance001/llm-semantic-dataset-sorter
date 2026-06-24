# Release Checklist

Use this checklist before publishing, tagging, or handing the project to another operator.

## 1. Workspace Cleanup

Remove disposable local byproducts unless they are intentional examples.

Clean:

- `target/`
- disposable contents inside `outputs/`
- disposable contents inside `runs/`
- temporary contents inside `input-datasets/`
- local debug logs such as `*.log`

Keep:

- source code
- docs
- `.gitkeep` placeholders
- intentional example datasets or example artifacts

If needed, review [Operations And Cleanup](./06-operations-and-cleanup.md) first.

## 2. License And Repo Metadata

Confirm:

- `LICENSE` is present and correct
- `README.md` reflects the actual current feature set
- docs links in `README.md` are valid

## 3. Build Validation

Run:

```powershell
cargo check -p server
```

If you changed frontend logic, also run a quick syntax check:

```powershell
node -e "new Function(require('fs').readFileSync('C:\\Users\\User\\Desktop\\github_portal\\llm-semantic-dataset-sorter\\ui\\app.js','utf8')); console.log('app.js syntax ok')"
```

## 4. Startup Validation

Start the server in the mode you intend to ship or demo.

Mock example:

```powershell
$env:SORTER_LLM_DRIVER = "mock"
cargo run -p server
```

Local GGUF example:

```powershell
$env:SORTER_LLM_DRIVER = "llama_cli"
$env:SORTER_RUNTIME_DIR = ".\\runtime"
$env:SORTER_MODEL_PATH = ".\\models\\your-model.gguf"
cargo run -p server
```

Confirm:

- the server starts without crashing
- `http://127.0.0.1:3000` loads
- `/health` reports the expected driver

## 5. UI Smoke Test

In the dashboard, confirm:

1. datasets load
2. dataset preview works
3. field-level help and section help are visible
4. preflight runs
5. plan generation works
6. run history loads
7. run detail opens
8. bucket export browser renders for a run that has exports
9. review panels save correctly
10. snapshots load and compare correctly

## 6. Parquet Smoke Test

Use a real or example Parquet dataset and confirm:

1. the dataset appears in the selector
2. raw structured row preview renders
3. projection controls appear
4. selected fields affect normalized preview text
5. sorted bucket exports include machine-facing files

## 7. Analyst-State Smoke Test

Confirm:

1. review-state export works
2. import preview appears before apply
3. snapshot save works
4. snapshot compare works
5. analyst notes and verdicts survive reload

## 8. Comparison Smoke Test

Confirm:

1. run-to-run comparison loads
2. matched experiment report loads
3. blind-vs-skim pair suggestion works when appropriate
4. interestingness and drift surfaces render

## 9. Copy And Terminology Pass

Scan the UI for:

- outdated placeholder text
- accidental prototype wording
- inconsistent names for the same concept

Specifically check consistency around:

- run
- job
- experiment
- snapshot
- analyst review state
- bucket genesis mode
- junk bucket

## 10. Final Sanity Check

Before release, ask:

1. Does the README describe what the tool actually does now?
2. Can a zero-knowledge user get from startup to first successful sort?
3. Are test artifacts clearly separated from product machinery?
4. Are the explanation and audit surfaces visible enough to support the product promise?
5. If someone cloned this repo fresh, would the docs tell them how to operate it?
