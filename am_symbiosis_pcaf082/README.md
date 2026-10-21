# AM / nodulation RNA-seq from Wu et al. 2025 (PRJNA1130425): HPC pipeline

Downloads every run from BioProject **PRJNA1130425** and runs fastp, salmon, tximport and DESeq2 on it.
The main contrast is arbuscular mycorrhizal symbiosis (AMS) vs control (CK) in each species. NFS vs CK
is also run for the three legumes, so AM-induced and nodule-induced genes can be compared.

> Wu Z, Sun Y, Yang J, Liu Z, Niu Y, Zhang X (2025). Gene expression and regulatory networks provide new
> insights into the similarity between nitrogen fixing and arbuscular mycorrhizal symbioses.
> *Plant Cell Physiol* 66(9):1330–1345. https://doi.org/10.1093/pcp/pcaf082

## The dataset

45 paired-end Illumina NovaSeq 6000 runs, ~20 M read pairs each. That is 292 Gbases, or ~94 GB of gzipped FASTQ.

| Species (code) | CK | AMS | NFS |
|---|---|---|---|
| *Medicago truncatula* (Mt) | 3 | 3 | 3 |
| *Glycine max* (Gm) | 3 | 3 | 3 |
| *Lotus japonicus* (Lj) | 3 | 3 | 3 |
| *Solanum lycopersicum* (Sl) | 3 | 3 | – |
| *Zea mays* (Zm) | 3 | 3 | – |
| *Oryza sativa* (Os) | 3 | 3 | – |

`samples.tsv` lists every run with its condition, replicate, ENA FASTQ URLs and ENA MD5 checksums.
It was built from the ENA file report for the project:
`https://www.ebi.ac.uk/ena/portal/api/filereport?accession=PRJNA1130425&result=read_run&fields=run_accession,experiment_title,fastq_ftp,fastq_md5&format=tsv`

## References used

| Code | Assembly | Source |
|---|---|---|
| Mt | MtrunA17r5.0-ANR | Ensembl Plants release 63 |
| Gm | Wm82.a2 (Glycine_max_v2.1) | Ensembl Plants release 63 |
| Lj | Gifu v1.3 CDS | Lotus Base (**manual download**, see below) |
| Sl | SL4.0 | Ensembl Plants release 63 |
| Zm | Zm-B73-REFERENCE-NAM-5.0 | Ensembl Plants release 63 |
| Os | IRGSP-1.0 | Ensembl Plants release 63 |

The paper's own reference versions are behind the journal paywall, so they may differ from these.
Gene IDs will then differ from the paper's supplementary tables. In particular, Medicago IDs here are MtrunA17
(`MtrunA17_Chr…`), not Mt4.0 (`Medtr…`). To use different references, edit `references.tsv`.

## Setup (once)

```bash
git clone -b claude/am-symbiosis-transcriptome-r8h4f7 https://github.com/jawaharsingh53-byte/Jawaharsingh.git
cd Jawaharsingh/am_symbiosis_pcaf082

conda env create -f envs/am_rnaseq.yml        # or: mamba env create -f envs/am_rnaseq.yml
```

Edit `config.sh`:

- `DATA_DIR`: set it to scratch or RDS, which needs ~110 GB free (not `$HOME`).
- `SLURM_ACCOUNT` / `SLURM_PARTITION`: set them if your cluster requires them (e.g. on CSD3: `MYLAB-SL2-CPU`, `icelake`).

### Lotus reference

Lotus Base serves its files from the Aarhus ERDA archive, which has no stable direct link. Download
`Lotusjaponicus_Gifu_v1.3_cds.fa.gz` from https://lotus.au.dk/data/download (or from Phytozome,
"Lotus japonicus Gifu v1.3"). Then place it here:

```bash
mkdir -p "$DATA_DIR/refs/Lj" && mv Lotusjaponicus_Gifu_v1.3_cds.fa.gz "$DATA_DIR/refs/Lj/"
```

Step 02 checks it against the published MD5 (`39fd2b5aa169e8eb18d55e4350fbc33c`).

## Run

Always run from this directory. Steps 01 and 02 need internet, so run them on a login node
(use `tmux` or `screen`, because the download takes hours). Every step is resumable: rerunning it skips finished work.

```bash
# 01: FASTQ download (~94 GB); each file is MD5-checked against ENA
bash scripts/01_download_fastq.sh
#   faster, 4 runs at a time:
#   seq 1 45 | xargs -P 4 -I{} bash scripts/01_download_fastq.sh {}

# 02: transcript FASTA + transcript-to-gene tables (~150 MB)
bash scripts/02_prepare_references.sh

# 03-06: salmon index -> fastp + salmon -> MultiQC + DESeq2, as one SLURM dependency chain
bash run_all.sh
#   if compute nodes have internet, you can skip step 01 and use: bash run_all.sh --with-download
```

Rough cost: indexing takes <15 min per species. Trimming and quantification take ~30 min per run on
8 cores. With 10 tasks in parallel, steps 03–06 take ~3 h of wall time.
Logs go to `logs/`.

**AMF runs only** (36 runs, skipping the 9 NFS ones and ~19 GB of download): run this before step 01,
and keep the variable set for every later step.

```bash
awk -F'\t' 'NR == 1 || $5 != "NFS"' samples.tsv > samples_AMF.tsv
export SAMPLES=$PWD/samples_AMF.tsv
```

## Outputs (in `$DATA_DIR`)

| Path | Contents |
|---|---|
| `qc/multiqc/pcaf082_multiqc.html` | fastp + salmon QC for all runs (check mapping rates first) |
| `salmon/<sample>/quant.sf` | transcript-level quantification |
| `results/tables/<sp>_AMS_vs_CK_DESeq2.csv` | all tested genes: log2FC, shrunken log2FC (apeglm), padj, `regulation` (Up/Down/NS) |
| `results/tables/<sp>_NFS_vs_CK_DESeq2.csv` | same for nodulation (Mt, Gm, Lj) |
| `results/tables/<sp>_AMS_NFS_overlap.csv` | each gene classed as Shared_up/down, AMS_only, NFS_only, Opposite or NS |
| `results/tables/DEG_summary.csv`, `AMS_NFS_overlap_summary.csv` | counts per species |
| `results/tables/<sp>_TPM.csv`, `_vst.csv`, `_normalized_counts.csv` | gene-level matrices for heatmaps / WGCNA |
| `results/figures/` | PCA, volcano, AMS-vs-NFS log2FC scatter, DEG counts (PNG + PDF) |
| `results/rds/<sp>_dds.rds` | DESeq2 objects |

DEGs use FDR < 0.05 and |log2FC| ≥ 1.5. Change `FDR_THRESH` / `FC_THRESH` at the top of
`scripts/06_deseq2_AMF.R`. Genes need ≥10 counts in ≥3 samples to be tested.

## Notes

- Salmon indexes transcripts without genome decoys. That is fine for DE, but mapping rates read slightly higher than with decoys.
- The Lotus reference is CDS only (no UTRs), so expect a lower Lj mapping rate than for the other species.
- The pipeline was tested end to end on simulated reads (3 species, 24 samples, known DE genes). It recovered all
  simulated AMS- and NFS-induced genes with ≤1 false positive per contrast. It has not yet been run on the real data.
