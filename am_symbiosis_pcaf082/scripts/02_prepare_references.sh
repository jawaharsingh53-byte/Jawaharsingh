#!/usr/bin/env bash
# Download each species' transcript FASTA and build a transcript-to-gene table for tximport.
# Run on a login node (needs internet). The Lotus file must be downloaded by hand first (see README).
#
#   bash scripts/02_prepare_references.sh
set -euo pipefail
cd "${SLURM_SUBMIT_DIR:-$(pwd)}"
source config.sh

missing=0
for i in $(seq 1 "$(n_refs)"); do
  read_ref "$i"
  dir="${REF_DIR}/${REF_SPECIES}"
  mkdir -p "$dir"

  if [[ ! -s "$REF_FASTA" ]]; then
    if [[ "$REF_URL" == "MANUAL" ]]; then
      echo "[missing] ${REF_SPECIES}: put ${REF_FILE} in ${dir}/ (see README, 'Lotus reference')" >&2
      missing=$((missing + 1))
      continue
    fi
    echo "[get]  ${REF_SPECIES}: ${REF_URL}"
    curl -fsSL --retry 5 --retry-delay 30 -o "${REF_FASTA}.part" "$REF_URL"
    mv "${REF_FASTA}.part" "$REF_FASTA"
  fi

  if [[ "$REF_MD5" != "-" ]] && ! md5_ok "$REF_MD5" "$REF_FASTA"; then
    echo "[error] ${REF_SPECIES}: MD5 mismatch for ${REF_FASTA}" >&2
    exit 1
  fi
  gzip -t "$REF_FASTA"

  # Ensembl headers carry 'gene:<id>'; otherwise (Lotus Base) the gene is the ID minus its '.N' suffix.
  zcat "$REF_FASTA" | awk -v OFS='\t' '
    /^>/ {
      tx = substr($1, 2); gene = ""
      for (i = 2; i <= NF; i++) if ($i ~ /^gene:/) gene = substr($i, 6)
      if (gene == "") { gene = tx; sub(/\.[0-9]+$/, "", gene) }
      print tx, gene
    }' > "${dir}/tx2gene.tsv"

  printf '[ok]   %s: %s transcripts, %s genes\n' "$REF_SPECIES" \
    "$(wc -l < "${dir}/tx2gene.tsv")" "$(cut -f2 "${dir}/tx2gene.tsv" | sort -u | wc -l)"
done

(( missing == 0 )) || { echo "${missing} reference(s) still missing" >&2; exit 1; }
