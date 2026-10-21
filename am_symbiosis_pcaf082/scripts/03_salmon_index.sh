#!/usr/bin/env bash
#SBATCH --job-name=pcaf082_index
#SBATCH --cpus-per-task=8
#SBATCH --mem=32G
#SBATCH --time=02:00:00
#SBATCH --output=logs/%x_%A_%a.out
# Build one salmon index per species (array index = row of references.tsv).
#
#   sbatch --array=1-6 scripts/03_salmon_index.sh
#   bash scripts/03_salmon_index.sh [index|species ...]   # without SLURM
set -euo pipefail
cd "${SLURM_SUBMIT_DIR:-$(pwd)}"
source config.sh
activate_env

index_one() {
  read_ref "$1"
  local idx="${REF_DIR}/${REF_SPECIES}/salmon_index"
  [[ -s "$REF_FASTA" ]] || { echo "Missing ${REF_FASTA}; run 02_prepare_references.sh" >&2; return 1; }
  if [[ -s "${idx}/versionInfo.json" && -s "${idx}/pos.bin" ]]; then
    echo "[ok]   ${REF_SPECIES}: index exists"
    return 0
  fi
  rm -rf "$idx"
  salmon index -t "$REF_FASTA" -i "$idx" -k 31 -p "$THREADS"
  echo "[done] ${REF_SPECIES}: ${idx}"
}

if [[ -n "${SLURM_ARRAY_TASK_ID:-}" ]]; then
  index_one "$SLURM_ARRAY_TASK_ID"
else
  (( $# > 0 )) || set -- $(seq 1 "$(n_refs)")
  for i in "$@"; do index_one "$i"; done
fi
