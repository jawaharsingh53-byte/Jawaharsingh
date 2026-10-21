#!/usr/bin/env bash
#SBATCH --job-name=pcaf082_deseq2
#SBATCH --cpus-per-task=2
#SBATCH --mem=16G
#SBATCH --time=01:00:00
#SBATCH --output=logs/%x_%j.out
# Differential expression for every species (see 06_deseq2_AMF.R).
set -euo pipefail
cd "${SLURM_SUBMIT_DIR:-$(pwd)}"
source config.sh
activate_env

SAMPLES="$SAMPLES" REFERENCES="$REFERENCES" Rscript scripts/06_deseq2_AMF.R "$PIPE_DIR" "$DATA_DIR"
