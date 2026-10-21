#!/usr/bin/env bash
#SBATCH --job-name=pcaf082_download
#SBATCH --cpus-per-task=1
#SBATCH --mem=2G
#SBATCH --time=06:00:00
#SBATCH --output=logs/%x_%A_%a.out
# Download paired FASTQ from ENA and verify each file against the ENA MD5 in samples.tsv.
# Resumable: finished files are skipped, interrupted ones continue where they stopped.
#
#   bash scripts/01_download_fastq.sh                 # all runs, one after another (login node)
#   bash scripts/01_download_fastq.sh 3 7             # selected rows of samples.tsv
#   sbatch --array=1-45%6 scripts/01_download_fastq.sh   # only if compute nodes have internet
set -euo pipefail
cd "${SLURM_SUBMIT_DIR:-$(pwd)}"
source config.sh

download_one() {
  read_sample "$1"
  local dir="${FASTQ_DIR}/${SAMPLE}" mate url md5 dest tmp attempt ok
  mkdir -p "$dir"
  for mate in 1 2; do
    if [[ $mate == 1 ]]; then url=$FQ1; md5=$MD5_1; else url=$FQ2; md5=$MD5_2; fi
    dest="${dir}/${SAMPLE}_R${mate}.fastq.gz"
    tmp="${dest}.part"
    if md5_ok "$md5" "$dest"; then echo "[ok]   ${SAMPLE} R${mate} already downloaded"; continue; fi
    ok=0
    for attempt in 1 2 3 4 5; do
      if md5_ok "$md5" "$tmp" || curl -fsSL --retry 5 --retry-delay 30 -C - -o "$tmp" "$url"; then
        if md5_ok "$md5" "$tmp"; then mv "$tmp" "$dest"; ok=1; break; fi
        echo "[warn] ${SAMPLE} R${mate}: MD5 mismatch (attempt ${attempt}), restarting download" >&2
        rm -f "$tmp"
      else
        echo "[warn] ${SAMPLE} R${mate}: transfer interrupted (attempt ${attempt}), resuming" >&2
        # A corrupt full-length .part makes every resume fail; start fresh after two tries.
        (( attempt >= 2 )) && rm -f "$tmp"
        sleep 30
      fi
    done
    (( ok )) || { echo "[fail] ${SAMPLE} R${mate} (${RUN}) from ${url}" >&2; return 1; }
    echo "[done] ${SAMPLE} R${mate} (${RUN})"
  done
}

if [[ -n "${SLURM_ARRAY_TASK_ID:-}" ]]; then
  download_one "$SLURM_ARRAY_TASK_ID"
else
  (( $# > 0 )) || set -- $(seq 1 "$(n_samples)")
  failed=0
  for i in "$@"; do download_one "$i" || failed=$((failed + 1)); done
  (( failed == 0 )) || { echo "${failed} run(s) failed; rerun the same command to retry" >&2; exit 1; }
fi
