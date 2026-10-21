#!/usr/bin/env bash
#SBATCH --job-name=pcaf082_quant
#SBATCH --cpus-per-task=8
#SBATCH --mem=16G
#SBATCH --time=03:00:00
#SBATCH --output=logs/%x_%A_%a.out
# fastp adapter/quality trimming, then salmon quantification, for one run (array index = row of samples.tsv).
#
#   sbatch --array=1-45%10 scripts/04_trim_quant.sh
#   bash scripts/04_trim_quant.sh [index ...]   # without SLURM
set -euo pipefail
cd "${SLURM_SUBMIT_DIR:-$(pwd)}"
source config.sh
activate_env

quant_one() {
  read_sample "$1"
  local out="${SALMON_DIR}/${SAMPLE}"
  local idx="${REF_DIR}/${SPECIES}/salmon_index"
  local r1="${FASTQ_DIR}/${SAMPLE}/${SAMPLE}_R1.fastq.gz"
  local r2="${FASTQ_DIR}/${SAMPLE}/${SAMPLE}_R2.fastq.gz"
  local trim="${DATA_DIR}/trimmed/${SAMPLE}"

  if [[ -s "${out}/quant.sf" ]]; then echo "[ok]   ${SAMPLE}: already quantified"; return 0; fi
  for f in "$r1" "$r2"; do [[ -s "$f" ]] || { echo "Missing ${f}; run 01_download_fastq.sh" >&2; return 1; }; done
  [[ -s "${idx}/versionInfo.json" ]] || { echo "Missing index ${idx}; run 03_salmon_index.sh" >&2; return 1; }

  mkdir -p "$trim" "${QC_DIR}/fastp" "$SALMON_DIR"
  fastp -i "$r1" -I "$r2" \
    -o "${trim}/${SAMPLE}_R1.trim.fastq.gz" -O "${trim}/${SAMPLE}_R2.trim.fastq.gz" \
    --detect_adapter_for_pe --thread "$(( THREADS < 16 ? THREADS : 16 ))" \
    --json "${QC_DIR}/fastp/${SAMPLE}.fastp.json" --html "${QC_DIR}/fastp/${SAMPLE}.fastp.html" \
    --report_title "${SAMPLE} (${RUN})"

  # Write to a temp dir so a killed job never leaves a half-finished quant.sf behind.
  rm -rf "${out}.tmp"
  salmon quant -i "$idx" -l A \
    -1 "${trim}/${SAMPLE}_R1.trim.fastq.gz" -2 "${trim}/${SAMPLE}_R2.trim.fastq.gz" \
    -p "$THREADS" --validateMappings --gcBias --seqBias \
    -o "${out}.tmp"
  rm -rf "$out"
  mv "${out}.tmp" "$out"

  [[ "$KEEP_TRIMMED" == 1 ]] || rm -rf "$trim"
  printf '[done] %s (%s): mapping rate %s%%\n' "$SAMPLE" "$RUN" \
    "$(grep -o '"percent_mapped": [0-9.]*' "${out}/aux_info/meta_info.json" | awk '{printf "%.1f", $2}')"
}

if [[ -n "${SLURM_ARRAY_TASK_ID:-}" ]]; then
  quant_one "$SLURM_ARRAY_TASK_ID"
else
  (( $# > 0 )) || set -- $(seq 1 "$(n_samples)")
  for i in "$@"; do quant_one "$i"; done
fi
