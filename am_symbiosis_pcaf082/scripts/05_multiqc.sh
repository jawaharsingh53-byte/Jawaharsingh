#!/usr/bin/env bash
#SBATCH --job-name=pcaf082_multiqc
#SBATCH --cpus-per-task=1
#SBATCH --mem=4G
#SBATCH --time=00:30:00
#SBATCH --output=logs/%x_%j.out
# One QC report across fastp and salmon for all runs.
set -euo pipefail
cd "${SLURM_SUBMIT_DIR:-$(pwd)}"
source config.sh
activate_env

multiqc --force --outdir "${QC_DIR}/multiqc" --filename pcaf082_multiqc.html \
  "${QC_DIR}/fastp" "$SALMON_DIR"
