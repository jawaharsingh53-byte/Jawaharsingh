#!/usr/bin/env bash
# Submit index -> trim/quant -> MultiQC + DESeq2 as one SLURM dependency chain.
# Run 01 (FASTQ) and 02 (references) first on a login node, unless compute nodes have internet,
# in which case --with-download adds the FASTQ download array to the front of the chain.
#
#   bash run_all.sh [--with-download]
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
source config.sh

with_download=0
[[ "${1:-}" == "--with-download" ]] && with_download=1

mkdir -p logs
sb=(sbatch --parsable)
[[ -n "$SLURM_ACCOUNT" ]] && sb+=(--account "$SLURM_ACCOUNT")
[[ -n "$SLURM_PARTITION" ]] && sb+=(--partition "$SLURM_PARTITION")

n=$(n_samples)
nref=$(n_refs)

missing=0
for i in $(seq 1 "$nref"); do
  read_ref "$i"
  [[ -s "$REF_FASTA" && -s "${REF_DIR}/${REF_SPECIES}/tx2gene.tsv" ]] || {
    echo "Reference not ready: ${REF_SPECIES}" >&2; missing=1; }
done
(( missing == 0 )) || { echo "Run: bash scripts/02_prepare_references.sh" >&2; exit 1; }

dl_dep=""
if (( with_download )); then
  dl=$("${sb[@]}" --array=1-"$n"%6 scripts/01_download_fastq.sh)
  dl_dep=":${dl}"
  echo "download   ${dl}"
else
  for i in $(seq 1 "$n"); do
    read_sample "$i"
    for m in 1 2; do
      f="${FASTQ_DIR}/${SAMPLE}/${SAMPLE}_R${m}.fastq.gz"
      [[ -s "$f" ]] || { echo "Missing FASTQ: $f" >&2; missing=1; }
    done
  done
  (( missing == 0 )) || { echo "Run: bash scripts/01_download_fastq.sh (or use --with-download)" >&2; exit 1; }
fi

idx=$("${sb[@]}" --array=1-"$nref" scripts/03_salmon_index.sh)
quant=$("${sb[@]}" --array=1-"$n"%"$MAX_PARALLEL" --dependency=afterok:"${idx}${dl_dep}" scripts/04_trim_quant.sh)
mqc=$("${sb[@]}" --dependency=afterok:"$quant" scripts/05_multiqc.sh)
de=$("${sb[@]}" --dependency=afterok:"$quant" scripts/06_deseq2.sh)

printf 'index      %s\nquant      %s\nmultiqc    %s\ndeseq2     %s\n' "$idx" "$quant" "$mqc" "$de"
echo "Monitor with: squeue -u \$USER ; logs in $(pwd)/logs"
