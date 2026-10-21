#!/usr/bin/env Rscript
# Differential expression for PRJNA1130425 (Wu et al. 2025, Plant Cell Physiol 66:1330, doi:10.1093/pcp/pcaf082).
# Per species, gene-level counts from salmon via tximport:
#   AMS vs CK for all six species; NFS vs CK for the three legumes (Mt, Gm, Lj),
#   plus an AMS-vs-NFS overlap table so shared and symbiosis-specific genes can be pulled out.
# Usage: Rscript scripts/06_deseq2_AMF.R <pipeline_dir> <data_dir>

suppressPackageStartupMessages({
  library(tximport)
  library(DESeq2)
  library(tidyverse)
  library(ggrepel)
})

args <- commandArgs(trailingOnly = TRUE)
pipe_dir <- if (length(args) >= 1) args[1] else getwd()
data_dir <- if (length(args) >= 2) args[2] else file.path(pipe_dir, "data")
setwd(pipe_dir)

samples_file <- Sys.getenv("SAMPLES", file.path(pipe_dir, "samples.tsv"))
refs_file    <- Sys.getenv("REFERENCES", file.path(pipe_dir, "references.tsv"))

out_dir <- file.path(data_dir, "results")
for (d in c("figures", "tables", "rds")) {
  dir.create(file.path(out_dir, d), recursive = TRUE, showWarnings = FALSE)
}

FC_THRESH  <- 1.5   # log2FC
FDR_THRESH <- 0.05  # adjusted p-value
set.seed(42)

condition_colors <- c(CK = "#7F7F7F", AMS = "#D95F02", NFS = "#7570B3")
deg_colors <- c(Up = "#B2182B", Down = "#2166AC", NS = "grey80")

base_theme <- theme_classic() +
  theme(
    text          = element_text(family = "Arial", size = 10),
    axis.text     = element_text(size = 9, colour = "black"),
    axis.title    = element_text(size = 10, face = "bold"),
    legend.text   = element_text(size = 8),
    legend.title  = element_text(size = 9, face = "bold"),
    plot.title    = element_text(size = 11, face = "bold", hjust = 0.5),
    strip.text    = element_text(size = 9, face = "bold"),
    panel.border  = element_rect(colour = "black", fill = NA, linewidth = 0.5)
  )

save_panel <- function(p, name, width, height) {
  ggsave(file.path(out_dir, "figures", paste0(name, ".png")), plot = p, width = width,
         height = height, units = "in", dpi = 300, bg = "white")
  ggsave(file.path(out_dir, "figures", paste0(name, ".pdf")), plot = p, width = width,
         height = height, units = "in", device = cairo_pdf)
}

samples <- read_tsv(samples_file, show_col_types = FALSE)
refs    <- read_tsv(refs_file, show_col_types = FALSE)

classify <- function(padj, lfc) {
  case_when(
    !is.na(padj) & padj < FDR_THRESH & lfc >=  FC_THRESH ~ "Up",
    !is.na(padj) & padj < FDR_THRESH & lfc <= -FC_THRESH ~ "Down",
    .default = "NS"
  )
}

run_species <- function(sp) {
  organism <- refs$organism[refs$species == sp]
  s <- samples |>
    filter(species == sp) |>
    mutate(condition = factor(condition, levels = intersect(c("CK", "AMS", "NFS"), condition))) |>
    arrange(condition, replicate)

  files <- file.path(data_dir, "salmon", s$sample_name, "quant.sf")
  names(files) <- s$sample_name
  if (!all(file.exists(files))) {
    warning(sp, ": missing quant.sf for ", paste(s$sample_name[!file.exists(files)], collapse = ", "),
            "; species skipped")
    return(NULL)
  }
  message("== ", sp, " (", organism, "): ", nrow(s), " samples")

  tx2gene <- read_tsv(file.path(data_dir, "refs", sp, "tx2gene.tsv"),
                      col_names = c("TXNAME", "GENEID"), show_col_types = FALSE)
  txi <- tximport(files, type = "salmon", tx2gene = tx2gene)

  coldata <- s |>
    select(sample_name, condition, replicate) |>
    column_to_rownames("sample_name")
  dds <- DESeqDataSetFromTximport(txi, colData = coldata, design = ~ condition)
  dds <- dds[rowSums(counts(dds) >= 10) >= 3, ]
  dds <- DESeq(dds, quiet = TRUE)
  saveRDS(dds, file.path(out_dir, "rds", paste0(sp, "_dds.rds")))

  # Expression matrices for heatmaps / WGCNA / cross-species ortholog comparison
  vsd <- vst(dds, blind = TRUE)
  assay(vsd) |> as.data.frame() |> rownames_to_column("GeneID") |>
    write_csv(file.path(out_dir, "tables", paste0(sp, "_vst.csv")))
  counts(dds, normalized = TRUE) |> as.data.frame() |> rownames_to_column("GeneID") |>
    write_csv(file.path(out_dir, "tables", paste0(sp, "_normalized_counts.csv")))
  txi$abundance |> as.data.frame() |> rownames_to_column("GeneID") |>
    write_csv(file.path(out_dir, "tables", paste0(sp, "_TPM.csv")))

  pca <- plotPCA(vsd, intgroup = "condition", returnData = TRUE)
  pct <- round(100 * attr(pca, "percentVar"))
  p_pca <- ggplot(pca, aes(PC1, PC2, colour = condition)) +
    geom_point(size = 2.5) +
    scale_colour_manual(values = condition_colors) +
    labs(x = paste0("PC1 (", pct[1], "%)"), y = paste0("PC2 (", pct[2], "%)"),
         colour = "Condition", title = organism) +
    base_theme +
    theme(plot.title = element_text(face = "bold.italic"))
  save_panel(p_pca, paste0(sp, "_PCA"), 3.5, 3.5)

  res_list <- list()
  for (trt in setdiff(levels(dds$condition), "CK")) {
    res <- results(dds, contrast = c("condition", trt, "CK"), alpha = FDR_THRESH)
    shr <- lfcShrink(dds, coef = paste0("condition_", trt, "_vs_CK"), type = "apeglm", quiet = TRUE)
    res_df <- as.data.frame(res) |>
      rownames_to_column("GeneID") |>
      mutate(log2FC_shrunk = shr$log2FoldChange,
             regulation = classify(padj, log2FoldChange)) |>
      filter(!is.na(padj)) |>
      arrange(padj)
    write_csv(res_df, file.path(out_dir, "tables", paste0(sp, "_", trt, "_vs_CK_DESeq2.csv")))
    res_list[[trt]] <- res_df

    top <- res_df |> filter(regulation != "NS") |> slice_head(n = 10)
    p_vol <- ggplot(res_df, aes(log2FoldChange, pmin(-log10(padj), 300), colour = regulation)) +
      geom_point(size = 0.6, alpha = 0.7) +
      geom_vline(xintercept = c(-FC_THRESH, FC_THRESH), linetype = "dashed", linewidth = 0.3) +
      geom_hline(yintercept = -log10(FDR_THRESH), linetype = "dashed", linewidth = 0.3) +
      geom_text_repel(data = top, aes(label = GeneID), size = 2, max.overlaps = Inf,
                      show.legend = FALSE) +
      scale_colour_manual(values = deg_colors) +
      labs(x = "log2 fold change", y = "-log10 adjusted p", colour = NULL,
           title = paste(sp, trt, "vs CK")) +
      base_theme
    save_panel(p_vol, paste0(sp, "_", trt, "_vs_CK_volcano"), 3.5, 3.5)
  }

  summary_df <- imap(res_list, \(df, trt) tibble(
    species = sp, organism = organism, contrast = paste(trt, "vs CK"),
    genes_tested = nrow(df), up = sum(df$regulation == "Up"), down = sum(df$regulation == "Down")
  )) |> list_rbind()

  overlap_df <- NULL
  if (all(c("AMS", "NFS") %in% names(res_list))) {
    overlap <- full_join(
      res_list$AMS |> select(GeneID, AMS_log2FC = log2FoldChange, AMS_padj = padj, AMS_reg = regulation),
      res_list$NFS |> select(GeneID, NFS_log2FC = log2FoldChange, NFS_padj = padj, NFS_reg = regulation),
      by = "GeneID"
    ) |>
      mutate(
        across(c(AMS_reg, NFS_reg), \(x) replace_na(x, "NS")),
        category = case_when(
          AMS_reg != "NS" & AMS_reg == NFS_reg ~ paste0("Shared_", tolower(AMS_reg)),
          AMS_reg != "NS" & NFS_reg != "NS"    ~ "Opposite",
          AMS_reg != "NS"                      ~ paste0("AMS_only_", tolower(AMS_reg)),
          NFS_reg != "NS"                      ~ paste0("NFS_only_", tolower(NFS_reg)),
          .default = "NS"
        )
      ) |>
      arrange(category, pmin(AMS_padj, NFS_padj, na.rm = TRUE))
    write_csv(overlap, file.path(out_dir, "tables", paste0(sp, "_AMS_NFS_overlap.csv")))
    overlap_df <- overlap |> count(category) |> mutate(species = sp, .before = 1)

    p_sc <- overlap |>
      filter(!is.na(AMS_log2FC), !is.na(NFS_log2FC)) |>
      mutate(group = case_when(
        startsWith(category, "Shared") ~ "Shared",
        startsWith(category, "AMS")    ~ "AMS only",
        startsWith(category, "NFS")    ~ "NFS only",
        category == "Opposite"         ~ "Opposite",
        .default = "NS"
      )) |>
      arrange(group != "NS") |>
      ggplot(aes(AMS_log2FC, NFS_log2FC, colour = group)) +
      geom_point(size = 0.6, alpha = 0.7) +
      geom_hline(yintercept = 0, linewidth = 0.3) +
      geom_vline(xintercept = 0, linewidth = 0.3) +
      scale_colour_manual(values = c(Shared = "#B2182B", `AMS only` = "#D95F02",
                                     `NFS only` = "#7570B3", Opposite = "#1B9E77", NS = "grey80")) +
      labs(x = "log2FC AMS vs CK", y = "log2FC NFS vs CK", colour = NULL, title = organism) +
      base_theme +
      theme(plot.title = element_text(face = "bold.italic"))
    save_panel(p_sc, paste0(sp, "_AMS_vs_NFS_log2FC"), 3.5, 3.5)
  }

  list(summary = summary_df, overlap = overlap_df)
}

all_res <- map(refs$species, run_species) |> compact()
if (length(all_res) == 0) stop("No species had complete salmon output in ", file.path(data_dir, "salmon"))

deg_summary <- map(all_res, "summary") |> list_rbind()
write_csv(deg_summary, file.path(out_dir, "tables", "DEG_summary.csv"))
overlap_summary <- map(all_res, "overlap") |> compact() |> list_rbind()
if (nrow(overlap_summary) > 0) {
  overlap_summary |>
    pivot_wider(names_from = category, values_from = n, values_fill = 0) |>
    write_csv(file.path(out_dir, "tables", "AMS_NFS_overlap_summary.csv"))
}

p_deg <- deg_summary |>
  pivot_longer(c(up, down), names_to = "direction", values_to = "n") |>
  mutate(direction = factor(str_to_title(direction), levels = c("Up", "Down")),
         species = factor(species, levels = refs$species)) |>
  ggplot(aes(species, n, fill = direction)) +
  geom_col(position = position_dodge(width = 0.8), width = 0.75) +
  facet_wrap(~ contrast, scales = "free_x") +
  scale_fill_manual(values = deg_colors[c("Up", "Down")]) +
  labs(x = NULL, y = "Number of DEGs", fill = NULL,
       title = paste0("|log2FC| >= ", FC_THRESH, ", FDR < ", FDR_THRESH)) +
  base_theme
save_panel(p_deg, "DEG_counts_by_species", 6.0, 3.5)

writeLines(capture.output(sessionInfo()), file.path(out_dir, "sessionInfo.txt"))
print(deg_summary)
message("Results in ", out_dir)
