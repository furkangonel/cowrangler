---
name: data-analysis
description: Structured data analysis workflow from raw data to shareable insights.
platforms: [linux, macos, windows]
tags: [data-analysis, eda, pandas, statistics, visualization, python, insights, data-science]
---

# Data Analysis SOP


## When to Use

- User wants to analyze a dataset and find patterns or insights
- User asks for EDA (Exploratory Data Analysis) on a file
- User wants summary statistics, distributions, or correlations
- User needs to clean dirty data before analysis

---

## Part 1 — The Analysis Workflow

```
1. Load & Inspect     → understand what you have
2. Clean              → handle nulls, types, duplicates, outliers
3. Explore (EDA)      → distributions, correlations, group comparisons
4. Hypothesize        → state specific questions to answer
5. Validate           → test hypotheses with statistics or aggregations
6. Communicate        → clear charts + written findings
```

---

## Part 2 — Load & Inspect

```python
import pandas as pd
import numpy as np

# ── Load ──────────────────────────────────────────────────────────
df = pd.read_csv("data.csv", parse_dates=["date_col"])
# For Excel: pd.read_excel("data.xlsx", sheet_name="Sheet1")
# For JSON:  pd.read_json("data.json", lines=True)  # JSONL
# For large files: pd.read_csv("data.csv", chunksize=100_000)

# ── Quick overview ────────────────────────────────────────────────
print(f"Shape: {df.shape[0]:,} rows × {df.shape[1]} columns")
print(f"Memory: {df.memory_usage(deep=True).sum() / 1e6:.1f} MB")
print()
print(df.dtypes)
print()
df.head(3)
```

### Inspection Checklist

```python
# 1. Types — are columns the right dtype?
df.dtypes

# 2. Nulls
null_report = pd.DataFrame({
    "null_count": df.isnull().sum(),
    "null_pct": (df.isnull().mean() * 100).round(1)
}).query("null_count > 0").sort_values("null_pct", ascending=False)
print(null_report)

# 3. Duplicates
dup_count = df.duplicated().sum()
print(f"Full duplicates: {dup_count} ({dup_count/len(df)*100:.1f}%)")

# 4. Cardinality — how many unique values per column?
df.nunique().sort_values(ascending=False)

# 5. Value ranges for numerics
df.describe().T.round(2)
```

---

## Part 3 — Cleaning

```python
# ── Fix dtypes ────────────────────────────────────────────────────
df["date"] = pd.to_datetime(df["date"], errors="coerce")
df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
df["category"] = df["category"].astype("category")

# ── Standardize strings ───────────────────────────────────────────
df["name"] = df["name"].str.strip().str.lower()

# ── Remove exact duplicates ───────────────────────────────────────
df = df.drop_duplicates()

# ── Handle nulls (choose strategy per column) ─────────────────────
# Drop rows where critical column is null
df = df.dropna(subset=["user_id", "event_type"])

# Fill with median (numeric)
df["revenue"] = df["revenue"].fillna(df["revenue"].median())

# Fill with mode (categorical)
df["country"] = df["country"].fillna(df["country"].mode()[0])

# Fill forward (time series)
df = df.sort_values("date")
df["price"] = df["price"].ffill()

# ── Handle outliers ───────────────────────────────────────────────
# IQR method — cap rather than drop
Q1 = df["amount"].quantile(0.25)
Q3 = df["amount"].quantile(0.75)
IQR = Q3 - Q1
lower, upper = Q1 - 1.5 * IQR, Q3 + 1.5 * IQR
df["amount_capped"] = df["amount"].clip(lower, upper)

# Z-score method — flag extreme outliers
from scipy import stats
df["amount_zscore"] = np.abs(stats.zscore(df["amount"].dropna()))
outliers = df[df["amount_zscore"] > 3]
print(f"Outliers (|z|>3): {len(outliers)}")
```

---

## Part 4 — EDA Patterns

### Distribution — Single Numeric Column

```python
import matplotlib.pyplot as plt
import seaborn as sns

col = "revenue"

fig, axes = plt.subplots(1, 3, figsize=(15, 4))

# Histogram
axes[0].hist(df[col].dropna(), bins=40, edgecolor="white", color="#4c72b0")
axes[0].set_title(f"{col} — Distribution")
axes[0].set_xlabel(col)

# Box plot
axes[1].boxplot(df[col].dropna(), patch_artist=True,
                boxprops=dict(facecolor="#4c72b0", alpha=0.6))
axes[1].set_title(f"{col} — Box Plot")

# Cumulative distribution
sorted_vals = df[col].dropna().sort_values()
axes[2].plot(sorted_vals.values, np.linspace(0, 1, len(sorted_vals)))
axes[2].set_title(f"{col} — CDF")
axes[2].set_xlabel(col)
axes[2].set_ylabel("Cumulative Probability")

plt.tight_layout()
plt.show()

# Key stats
print(df[col].describe())
print(f"Skewness: {df[col].skew():.3f}")
print(f"Kurtosis: {df[col].kurtosis():.3f}")
```

### Group Comparison

```python
# Compare a metric across categories
group_col = "segment"
metric_col = "revenue"

grouped = df.groupby(group_col)[metric_col].agg(
    count="count",
    mean="mean",
    median="median",
    std="std",
    total="sum"
).round(2).sort_values("mean", ascending=False)
print(grouped)

# Visualize
fig, axes = plt.subplots(1, 2, figsize=(14, 5))
grouped["mean"].plot(kind="bar", ax=axes[0], color="#4c72b0")
axes[0].set_title(f"Mean {metric_col} by {group_col}")
axes[0].tick_params(axis="x", rotation=45)

sns.boxplot(data=df, x=group_col, y=metric_col, ax=axes[1])
axes[1].set_title(f"{metric_col} Distribution by {group_col}")
axes[1].tick_params(axis="x", rotation=45)

plt.tight_layout()
plt.show()
```

### Correlation Analysis

```python
numeric_cols = df.select_dtypes(include=np.number).columns.tolist()
corr = df[numeric_cols].corr()

# Heatmap
fig, ax = plt.subplots(figsize=(10, 8))
mask = np.triu(np.ones_like(corr, dtype=bool))
sns.heatmap(corr, mask=mask, annot=True, fmt=".2f",
            cmap="RdBu_r", center=0, vmin=-1, vmax=1,
            square=True, linewidths=0.5, ax=ax)
plt.title("Correlation Matrix")
plt.tight_layout()
plt.show()

# Top correlations with a target
target = "revenue"
top_corr = corr[target].drop(target).abs().sort_values(ascending=False)
print(f"\nTop correlations with {target}:\n{top_corr.head(10)}")
```

### Time Series Pattern

```python
date_col = "date"
metric_col = "revenue"

df = df.sort_values(date_col)

# Aggregate by time period
daily = df.groupby(pd.Grouper(key=date_col, freq="D"))[metric_col].sum()
weekly = df.groupby(pd.Grouper(key=date_col, freq="W"))[metric_col].sum()
monthly = df.groupby(pd.Grouper(key=date_col, freq="ME"))[metric_col].sum()

fig, axes = plt.subplots(3, 1, figsize=(14, 12))
daily.plot(ax=axes[0], title="Daily")
weekly.plot(ax=axes[1], title="Weekly")
monthly.plot(kind="bar", ax=axes[2], title="Monthly")
plt.tight_layout()
plt.show()

# 7-day rolling average
df["revenue_7d_avg"] = daily.rolling(7).mean()
```

---

## Part 5 — Choosing the Right Visualization

| Data type | Comparison | Best chart |
|-----------|------------|-----------|
| Numeric distribution | Single | Histogram, KDE |
| Numeric distribution | Two groups | Overlapping hist, KDE, violin |
| Numeric distribution | Many groups | Box plot, violin plot |
| Category vs Numeric | Few categories | Bar chart (mean + error bars) |
| Category vs Numeric | Many categories | Horizontal bar chart |
| Two numeric cols | Correlation | Scatter plot |
| Three numeric cols | Correlation | Scatter + color/size encoding |
| Time + Numeric | Trend | Line chart |
| Time + Category | Composition | Stacked area, stacked bar |
| Part-of-whole | < 5 parts | Pie chart (sparingly) |
| Part-of-whole | Many parts | Stacked bar, treemap |

---

## Part 6 — Sharing Findings

Structure every finding as:

```markdown
## Finding: [Specific, concrete title]

**What:** [One sentence describing the pattern observed]

**Data:** [Which columns, time range, segment, sample size]

**Evidence:**
[Chart or table]

**Magnitude:** [How big is the effect? Revenue impact? % difference?]

**Implication:** [What decision or action does this enable?]

**Confidence:** [How certain are you? Any caveats?]
```

### Example Finding

```markdown
## Finding: Enterprise customers have 3.2× higher ARPU than SMB

**What:** Enterprise segment generates $4,800 average monthly revenue vs $1,500 for SMB.

**Data:** revenue table, Jan–Apr 2025, n=2,340 customers (412 Enterprise, 1,928 SMB)

**Evidence:** [bar chart showing revenue by segment]

**Magnitude:** $3,300 delta per customer per month; Enterprise is 18% of customers but 37% of revenue.

**Implication:** Prioritize Enterprise acquisition and expansion — higher ROI per sales hour.

**Confidence:** High — consistent across all 4 months. Outliers (>$50k) removed; median tells same story.
```

---

## Part 7 — Quick Summary Statistics Function

```python
def quick_summary(df: pd.DataFrame, target: str = None) -> None:
    """Print a structured EDA summary for a DataFrame."""
    print(f"{'='*60}")
    print(f"DATASET SUMMARY")
    print(f"{'='*60}")
    print(f"Shape:    {df.shape[0]:,} rows × {df.shape[1]} columns")
    print(f"Memory:   {df.memory_usage(deep=True).sum() / 1e6:.1f} MB")
    print(f"Nulls:    {df.isnull().sum().sum():,} total null values")
    print(f"Dupes:    {df.duplicated().sum():,} duplicate rows")
    print()

    num_cols = df.select_dtypes(include=np.number).columns.tolist()
    cat_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()
    date_cols = df.select_dtypes(include="datetime").columns.tolist()

    print(f"Numeric ({len(num_cols)}): {', '.join(num_cols)}")
    print(f"Categorical ({len(cat_cols)}): {', '.join(cat_cols)}")
    print(f"Datetime ({len(date_cols)}): {', '.join(date_cols)}")

    if target and target in num_cols:
        print(f"\nTarget: {target}")
        print(df[target].describe().round(2))
```

---

## Agent Instructions

1. Always start with shape, nulls, dtypes — never skip the inspection phase
2. Ask what the user wants to know before diving into analysis — the question drives the method
3. When summarizing findings, always include sample size and caveats
4. For any group comparison, check if groups have very different sizes — it affects interpretation
5. When correlations are found, remind the user: correlation ≠ causation
6. Use concrete numbers in findings: "$X more", "2.3× higher", "fell by 15%" — not just "higher" or "lower"
7. If data has a date column, always check for time trends before drawing conclusions from overall averages
