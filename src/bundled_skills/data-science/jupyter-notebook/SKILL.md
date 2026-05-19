---
name: jupyter-notebook
description: Jupyter notebook structure, reproducibility, and best practices for data science.
platforms: [linux, macos, windows]
tags: [jupyter, notebook, python, data-science, reproducibility, pandas, analysis]
---

# Jupyter Notebook SOP


## When to Use

- User is writing or improving a Jupyter notebook
- User wants to share or publish a notebook as a report
- User has reproducibility issues (notebook works for them but not others)
- User wants to structure an analysis or ML experiment cleanly

---

## Part 1 — Recommended Notebook Structure

Use these sections in order. Each section is a Markdown cell followed by code cells.

```
1. Title & Metadata
2. Imports & Configuration
3. Data Loading
4. Exploratory Data Analysis (EDA)
5. Feature Engineering / Preprocessing
6. Modeling (if applicable)
7. Results & Conclusions
8. Appendix (optional)
```

### Section 1 — Title & Metadata

```markdown
# Analysis Title

**Author:** Your Name  
**Date:** 2025-05-18  
**Dataset:** dataset_name.csv (source / version)  
**Purpose:** One sentence on what question this notebook answers.  

## Summary
Key findings in 3-5 bullet points — fill in after completing the notebook.
```

### Section 2 — Imports & Configuration

```python
# ── Standard library ──────────────────────────────────────────────
import os
import json
from pathlib import Path
from datetime import datetime

# ── Data manipulation ──────────────────────────────────────────────
import numpy as np
import pandas as pd

# ── Visualization ─────────────────────────────────────────────────
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px

# ── ML (if needed) ────────────────────────────────────────────────
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

# ── Config ────────────────────────────────────────────────────────
RANDOM_SEED = 42
DATA_DIR = Path("../data")
OUTPUT_DIR = Path("../outputs")
OUTPUT_DIR.mkdir(exist_ok=True)

# Display settings
pd.set_option("display.max_columns", 50)
pd.set_option("display.max_rows", 100)
pd.set_option("display.float_format", "{:.4f}".format)

plt.rcParams["figure.figsize"] = (12, 6)
plt.rcParams["figure.dpi"] = 100
sns.set_theme(style="whitegrid", palette="muted")

np.random.seed(RANDOM_SEED)
print(f"NumPy: {np.__version__}, Pandas: {pd.__version__}")
```

### Section 3 — Data Loading

```python
# Load data
df = pd.read_csv(DATA_DIR / "raw" / "dataset.csv")

# Confirm load
print(f"Shape: {df.shape}")
print(f"Memory: {df.memory_usage(deep=True).sum() / 1e6:.1f} MB")
df.head()
```

### Section 4 — EDA (see Part 2)

### Section 5 — Feature Engineering

```python
# Create new features
df["feature_ratio"] = df["col_a"] / df["col_b"].replace(0, np.nan)
df["log_amount"] = np.log1p(df["amount"])

# Encode categoricals
df = pd.get_dummies(df, columns=["category"], drop_first=True)

# Save processed data
df.to_parquet(DATA_DIR / "processed" / "clean_dataset.parquet", index=False)
print("Saved processed dataset")
```

---

## Part 2 — EDA Checklist

Run these in sequence for any new dataset:

```python
# ── 1. Shape and types ────────────────────────────────────────────
print(df.shape)
df.dtypes.value_counts()

# ── 2. Missing values ─────────────────────────────────────────────
missing = df.isnull().sum()
missing_pct = (missing / len(df) * 100).round(2)
pd.DataFrame({"count": missing, "pct": missing_pct}).query("count > 0").sort_values("pct", ascending=False)

# ── 3. Duplicates ─────────────────────────────────────────────────
print(f"Duplicates: {df.duplicated().sum()} ({df.duplicated().sum()/len(df)*100:.1f}%)")

# ── 4. Basic statistics ────────────────────────────────────────────
df.describe(include="all").T

# ── 5. Distributions — numeric ────────────────────────────────────
numeric_cols = df.select_dtypes(include=np.number).columns
df[numeric_cols].hist(bins=30, figsize=(16, 10))
plt.tight_layout()
plt.show()

# ── 6. Distributions — categorical ───────────────────────────────
cat_cols = df.select_dtypes(include="object").columns
for col in cat_cols[:5]:  # limit to first 5
    print(f"\n{col}: {df[col].nunique()} unique values")
    print(df[col].value_counts().head(10))

# ── 7. Correlations ───────────────────────────────────────────────
corr = df[numeric_cols].corr()
mask = np.triu(np.ones_like(corr, dtype=bool))
fig, ax = plt.subplots(figsize=(12, 10))
sns.heatmap(corr, mask=mask, annot=True, fmt=".2f", cmap="coolwarm",
            center=0, vmin=-1, vmax=1, ax=ax)
plt.title("Correlation Matrix")
plt.tight_layout()
plt.show()

# ── 8. Target distribution (if supervised learning) ───────────────
# df["target"].value_counts(normalize=True).plot(kind="bar")
```

---

## Part 3 — Reproducibility Checklist

Before sharing or publishing:

- [ ] **Seeds set** at the top of the notebook (`RANDOM_SEED = 42`, applied to numpy, sklearn, torch)
- [ ] **Relative paths** used (`Path("../data/raw/file.csv")`, not `/home/username/...`)
- [ ] **Kernel restart + run all** executed — notebook runs clean from top to bottom
- [ ] **No hidden state** — all variables defined in the cell they're first used
- [ ] **Requirements pinned**:
  ```bash
  pip freeze > requirements.txt
  # or with conda:
  conda env export > environment.yml
  ```
- [ ] **Large files excluded** from git (use `.gitignore` or git-lfs)
- [ ] **Outputs cleared** before committing (`Kernel → Restart & Clear Output`) — or use nbstripout
- [ ] **nbconvert** tested if sharing as HTML/PDF:
  ```bash
  jupyter nbconvert --to html notebook.ipynb
  jupyter nbconvert --to pdf notebook.ipynb   # requires LaTeX
  ```

---

## Part 4 — Common Pitfalls

### Hidden State (most common bug)

```python
# Cell A
x = 10

# Cell B
y = x + 5

# Cell A (run again with x = 20)
x = 20

# Cell B (y is still 15 from before — hidden state!)
# Restart kernel to avoid this
```

**Fix:** Always use `Kernel → Restart & Run All` before sharing.

### In-place DataFrame Mutations

```python
# WRONG — silently modifies df, affects all subsequent cells
df.drop(columns=["col_to_remove"], inplace=True)

# CORRECT — create a new variable
df_clean = df.drop(columns=["col_to_remove"])
```

### Mutable Defaults / Loop Variables

```python
# WRONG — all lambdas capture the same `i` (Python closure gotcha)
fns = [lambda: i for i in range(3)]
[f() for f in fns]  # [2, 2, 2]

# CORRECT
fns = [lambda i=i: i for i in range(3)]
```

### Missing Data Silently Propagates

```python
# NaN in one column can silently make aggregations wrong
df["amount"].mean()  # NaN if any value is NaN!
df["amount"].mean(skipna=True)  # explicit — recommended
```

---

## Part 5 — Useful Magic Commands

```python
# Timing
%time df.groupby("category").agg({"value": "sum"})
%timeit -n 3 df["col"].apply(lambda x: x**2)

# Memory profiling (requires memory_profiler)
%load_ext memory_profiler
%memit df.merge(df2, on="id")

# Run shell commands
!ls ../data/raw/
!pip install polars --quiet

# Show all variables
%whos DataFrame

# Reload a module after editing it externally
%load_ext autoreload
%autoreload 2
```

---

## Part 6 — nbconvert Export

```bash
# HTML report (self-contained, shareable)
jupyter nbconvert --to html --no-input notebook.ipynb
# --no-input hides code cells — good for stakeholder reports

# Slides (reveal.js)
jupyter nbconvert --to slides notebook.ipynb --post serve

# Python script (for productionizing)
jupyter nbconvert --to script notebook.ipynb

# Strip outputs before committing
pip install nbstripout
nbstripout notebook.ipynb
# Or configure globally:
nbstripout --install
```

---

## Agent Instructions

1. When writing cells, group logically related operations in one cell — not one operation per cell
2. Add a Markdown header before each major section — makes the notebook navigable
3. Print shape and sample (`df.head()`) after every data transformation — reduces debugging time
4. Always set and use `RANDOM_SEED` in the config section
5. Suggest `Kernel → Restart & Run All` before the user shares or declares the notebook "done"
6. If the user has a reproducibility bug, first ask: "Did you restart the kernel and run all cells fresh?"
7. For large datasets (>1M rows), suggest `polars` or chunked `pandas` reading
