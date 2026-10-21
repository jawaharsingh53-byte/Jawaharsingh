# shellcheck shell=bash disable=SC2034  # sourced by every step; variables are used there
# Settings shared by every step. Run all scripts from the pipeline root so this file is found.
# Any value can be overridden from the environment, e.g. DATA_DIR=/rds/user/js2812/pcaf082 bash scripts/...

PIPE_DIR="${PIPE_DIR:-$(pwd)}"
# Raw FASTQ is ~94 GB, plus ~15 GB of indices and results: point this at scratch/RDS, not $HOME.
DATA_DIR="${DATA_DIR:-${PIPE_DIR}/data}"
SAMPLES="${SAMPLES:-${PIPE_DIR}/samples.tsv}"
REFERENCES="${REFERENCES:-${PIPE_DIR}/references.tsv}"

CONDA_ENV="${CONDA_ENV:-am_rnaseq}"
THREADS="${SLURM_CPUS_PER_TASK:-${THREADS:-8}}"

# Passed to sbatch by run_all.sh when set (e.g. SLURM_ACCOUNT=MYLAB-SL2-CPU SLURM_PARTITION=icelake).
SLURM_ACCOUNT="${SLURM_ACCOUNT:-}"
SLURM_PARTITION="${SLURM_PARTITION:-}"
MAX_PARALLEL="${MAX_PARALLEL:-10}"   # concurrent array tasks for quantification

KEEP_TRIMMED="${KEEP_TRIMMED:-0}"    # 1 keeps fastp-trimmed FASTQ (adds ~80 GB)

FASTQ_DIR="${DATA_DIR}/fastq"
REF_DIR="${DATA_DIR}/refs"
SALMON_DIR="${DATA_DIR}/salmon"
QC_DIR="${DATA_DIR}/qc"

activate_env() {
  [[ "${CONDA_DEFAULT_ENV:-}" == "$CONDA_ENV" ]] && return 0
  set +u
  if command -v conda >/dev/null 2>&1; then
    source "$(conda info --base)/etc/profile.d/conda.sh"
    conda activate "$CONDA_ENV"
  elif command -v micromamba >/dev/null 2>&1; then
    eval "$(micromamba shell hook --shell bash)"
    micromamba activate "$CONDA_ENV"
  else
    echo "WARNING: conda/micromamba not found; expecting salmon, fastp, multiqc and Rscript on PATH" >&2
  fi
  set -u
}

n_samples() { tail -n +2 "$SAMPLES" | grep -c .; }
n_refs()    { tail -n +2 "$REFERENCES" | grep -c .; }

# read_sample <1-based index>: sets RUN SAMPLE SPECIES FQ1 FQ2 MD5_1 MD5_2
read_sample() {
  local line
  line=$(awk -F'\t' -v n="$1" 'NR == n + 1' "$SAMPLES")
  [[ -n "$line" ]] || { echo "No sample at index $1 in $SAMPLES" >&2; return 1; }
  IFS=$'\t' read -r RUN SAMPLE SPECIES _ _ _ _ _ _ FQ1 FQ2 MD5_1 MD5_2 <<< "$line"
}

# read_ref <1-based index | species code>: sets REF_SPECIES REF_URL REF_FILE REF_MD5 REF_FASTA
read_ref() {
  local line
  line=$(awk -F'\t' -v k="$1" 'NR > 1 && (NR == k + 1 || $1 == k)' "$REFERENCES")
  [[ -n "$line" ]] || { echo "No reference '$1' in $REFERENCES" >&2; return 1; }
  IFS=$'\t' read -r REF_SPECIES _ _ _ REF_URL REF_FILE REF_MD5 <<< "$line"
  REF_FASTA="${REF_DIR}/${REF_SPECIES}/${REF_FILE}"
}

md5_ok() { [[ -s "$2" ]] && echo "$1  $2" | md5sum -c --status; }
