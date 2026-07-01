use anyhow::{Result, bail};
use sorter_core::{BucketPlan, PreflightReport, RunConfig};

pub fn validate_run_config(config: &RunConfig) -> Result<()> {
    if config.requested_positive_bucket_count == 0 {
        bail!("requested_positive_bucket_count must be at least 1");
    }
    Ok(())
}

pub fn validate_bucket_plan(config: &RunConfig, plan: &BucketPlan) -> Result<()> {
    if plan.positive_bucket_count != config.requested_positive_bucket_count {
        bail!(
            "bucket plan count {} does not match requested count {}",
            plan.positive_bucket_count,
            config.requested_positive_bucket_count
        );
    }
    if plan.buckets.len() != usize::from(config.requested_positive_bucket_count) {
        bail!(
            "bucket plan returned {} positive buckets, expected {}",
            plan.buckets.len(),
            config.requested_positive_bucket_count
        );
    }
    Ok(())
}

pub fn should_allow_plan_generation(config: &RunConfig, preflight: &PreflightReport) -> bool {
    use sorter_core::PreflightVerdictCode::Acceptable;

    config.force_override || matches!(preflight.verdict, Acceptable)
}
