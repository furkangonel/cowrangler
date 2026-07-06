---
name: model-evaluation
description: Systematic ML model evaluation — metrics, benchmarks, and error analysis.
platforms: [linux, macos, windows]
tags: [mlops, evaluation, metrics, benchmarking, error-analysis, classification, regression, nlp]
---

# Model Evaluation SOP

Evaluate ML models systematically: choose the right metrics, run benchmarks, analyze errors, and produce reproducible evaluation reports.

## When to Use

- User wants to evaluate a model's performance on a dataset
- User wants to compare two or more models objectively
- User wants to understand where a model fails (error analysis)
- User wants to check for bias across data slices
- User wants a structured evaluation report

---

## Part 1 — Metric Selection by Task Type

### Classification

```python
from sklearn.metrics import (
    classification_report, confusion_matrix,
    roc_auc_score, average_precision_score,
    f1_score, precision_score, recall_score, accuracy_score,
)
import numpy as np

def evaluate_classifier(y_true, y_pred, y_prob=None, labels=None):
    """Full classification evaluation suite."""
    print("=== Classification Report ===")
    print(classification_report(y_true, y_pred, target_names=labels))

    print("=== Confusion Matrix ===")
    cm = confusion_matrix(y_true, y_pred)
    print(cm)

    if y_prob is not None:
        # Binary
        if y_prob.ndim == 1 or y_prob.shape[1] == 2:
            prob = y_prob if y_prob.ndim == 1 else y_prob[:, 1]
            print(f"\nROC-AUC:          {roc_auc_score(y_true, prob):.4f}")
            print(f"Avg Precision:    {average_precision_score(y_true, prob):.4f}")
        else:
            # Multiclass OvR
            print(f"\nROC-AUC (macro):  {roc_auc_score(y_true, y_prob, multi_class='ovr', average='macro'):.4f}")

    print(f"\nAccuracy:         {accuracy_score(y_true, y_pred):.4f}")
    print(f"F1 (macro):       {f1_score(y_true, y_pred, average='macro'):.4f}")
    print(f"F1 (weighted):    {f1_score(y_true, y_pred, average='weighted'):.4f}")
```

**Metric guidance:**
- **Balanced dataset:** Accuracy is acceptable; F1 macro provides class-level fairness view.
- **Imbalanced dataset:** Use F1-weighted, ROC-AUC, or PR-AUC (Average Precision). Accuracy misleads.
- **High recall priority** (medical, fraud detection): Maximize recall; accept lower precision.
- **High precision priority** (spam filter, legal): Maximize precision.

### Regression

```python
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import numpy as np

def evaluate_regressor(y_true, y_pred):
    mae  = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2   = r2_score(y_true, y_pred)

    # Mean Absolute Percentage Error
    mask = y_true != 0
    mape = np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100

    print(f"MAE:   {mae:.4f}")
    print(f"RMSE:  {rmse:.4f}")
    print(f"R²:    {r2:.4f}")
    print(f"MAPE:  {mape:.2f}%")

    # Residual analysis
    residuals = y_true - y_pred
    print(f"\nResidual mean:  {residuals.mean():.4f}  (want ≈ 0)")
    print(f"Residual std:   {residuals.std():.4f}")
    print(f"Max over-pred:  {residuals.min():.4f}")
    print(f"Max under-pred: {residuals.max():.4f}")
```

**Metric guidance:**
- **MAE:** Robust to outliers; same unit as target. Use when outliers should not be penalized heavily.
- **RMSE:** Penalizes large errors more; use when big errors are especially costly.
- **R²:** Proportion of variance explained; 1.0 = perfect, 0.0 = predicting the mean. Can be negative.
- **MAPE:** Percentage error; interpretable but undefined when `y_true = 0`.

### NLP Generation Metrics

```python
# Install: pip install rouge-score bert-score sacrebleu

from rouge_score import rouge_scorer
from bert_score import score as bert_score

def evaluate_generation(references: list[str], hypotheses: list[str]):
    """Evaluate text generation quality."""

    # ROUGE (n-gram overlap)
    scorer = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)
    r1, r2, rl = [], [], []
    for ref, hyp in zip(references, hypotheses):
        s = scorer.score(ref, hyp)
        r1.append(s["rouge1"].fmeasure)
        r2.append(s["rouge2"].fmeasure)
        rl.append(s["rougeL"].fmeasure)

    print(f"ROUGE-1:   {sum(r1)/len(r1):.4f}")
    print(f"ROUGE-2:   {sum(r2)/len(r2):.4f}")
    print(f"ROUGE-L:   {sum(rl)/len(rl):.4f}")

    # BERTScore (semantic similarity)
    P, R, F1 = bert_score(hypotheses, references, lang="en", verbose=False)
    print(f"BERTScore F1: {F1.mean().item():.4f}")
```

**Metric guidance:**
- **BLEU:** Best for translation; poor for open-ended generation.
- **ROUGE:** Good for summarization.
- **BERTScore:** Semantic similarity; robust to paraphrase. Slow on large datasets.
- For LLM evaluation, prefer task-specific human-eval or LLM-as-judge alongside automated metrics.

---

## Part 2 — Confusion Matrix Analysis

```python
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import confusion_matrix
import numpy as np

def plot_confusion_matrix(y_true, y_pred, labels, normalize=True, title="Confusion Matrix"):
    cm = confusion_matrix(y_true, y_pred)
    if normalize:
        cm = cm.astype(float) / cm.sum(axis=1, keepdims=True)

    fig, ax = plt.subplots(figsize=(max(6, len(labels)), max(5, len(labels))))
    sns.heatmap(
        cm, annot=True, fmt=".2f" if normalize else "d",
        xticklabels=labels, yticklabels=labels,
        cmap="Blues", ax=ax,
    )
    ax.set_xlabel("Predicted")
    ax.set_ylabel("True")
    ax.set_title(title)
    plt.tight_layout()
    plt.savefig("confusion_matrix.png", dpi=150)
    print("Saved: confusion_matrix.png")

# Read off insights:
# - Diagonal = correct predictions
# - High off-diagonal in row i, col j = model often confuses class i as class j
# - Symmetric confusion = classes are inherently similar; consider merging or more features
```

---

## Part 3 — Slice-Based Evaluation

Evaluate performance across subgroups to detect bias and weak spots.

```python
import pandas as pd

def evaluate_slices(df: pd.DataFrame, y_true_col: str, y_pred_col: str, slice_cols: list[str]):
    """
    df must have columns: y_true_col, y_pred_col, and slice_cols.
    Returns a DataFrame with per-slice metrics.
    """
    from sklearn.metrics import f1_score, accuracy_score

    records = []
    for col in slice_cols:
        for val in df[col].unique():
            mask = df[col] == val
            subset = df[mask]
            if len(subset) < 10:
                continue  # too small to be meaningful
            f1  = f1_score(subset[y_true_col], subset[y_pred_col], average="weighted", zero_division=0)
            acc = accuracy_score(subset[y_true_col], subset[y_pred_col])
            records.append({
                "slice_col": col, "slice_val": val, "n": len(subset),
                "accuracy": round(acc, 4), "f1_weighted": round(f1, 4),
            })

    result = pd.DataFrame(records).sort_values("f1_weighted")
    print(result.to_string(index=False))
    return result

# Usage:
# df["y_pred"] = model.predict(df[feature_cols])
# evaluate_slices(df, "label", "y_pred", slice_cols=["age_group", "region", "gender"])
```

**What to look for:**
- Slices with significantly lower F1 than the global average → underrepresented in training or harder task.
- Slices with small `n` (< 50) → metric is noisy; collect more data before drawing conclusions.
- Systematically worse on a protected attribute → potential fairness issue.

---

## Part 4 — Error Analysis Workflow

1. **Collect errors** into a DataFrame for review:

```python
import pandas as pd

def collect_errors(X_test, y_true, y_pred, text_col=None):
    errors = pd.DataFrame({
        "y_true": y_true,
        "y_pred": y_pred,
        "correct": y_true == y_pred,
    })
    if text_col is not None and hasattr(X_test, '__getitem__'):
        errors["text"] = X_test[text_col].values
    return errors[~errors["correct"]]

errors_df = collect_errors(X_test, y_true, y_pred, text_col="content")
print(f"Total errors: {len(errors_df)} / {len(y_true)}")
```

2. **Sample and read** — manually review 20–50 random errors:

```python
sample = errors_df.sample(min(30, len(errors_df)), random_state=42)
for _, row in sample.iterrows():
    print(f"True: {row['y_true']}  Pred: {row['y_pred']}")
    if "text" in row:
        print(f"  {row['text'][:200]}")
    print()
```

3. **Categorize errors** — assign root cause labels:
   - Label noise (ground truth is wrong)
   - Ambiguous examples (humans would also disagree)
   - Missing features (model lacks the right signal)
   - Distribution shift (test data differs from train)
   - Edge case / rare pattern

4. **Count error categories** and prioritize:
   - If > 30% is label noise → fix labels first, not the model.
   - If > 40% is missing features → feature engineering or better data collection.
   - If distribution shift → retrain on more representative data.

---

## Part 5 — Cross-Validation Template

```python
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.pipeline import Pipeline
import numpy as np

def cv_evaluate(model, X, y, n_splits=5, scoring=None):
    """Stratified K-Fold cross-validation with multiple metrics."""
    if scoring is None:
        scoring = {
            "accuracy":  "accuracy",
            "f1_macro":  "f1_macro",
            "roc_auc":   "roc_auc",
        }

    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    results = cross_validate(model, X, y, cv=cv, scoring=scoring, return_train_score=True)

    print(f"CV Results ({n_splits}-fold):")
    for metric in scoring:
        test_scores  = results[f"test_{metric}"]
        train_scores = results[f"train_{metric}"]
        print(f"  {metric:15s}  test={test_scores.mean():.4f} ± {test_scores.std():.4f}"
              f"  train={train_scores.mean():.4f}")

    return results
```

---

## Part 6 — Evaluation Report Template

```markdown
# Model Evaluation Report

**Model:** {model_name}
**Dataset:** {dataset_name} — {n_samples} samples, {n_features} features
**Evaluation date:** {date}
**Evaluator:** {name}

## Summary

| Metric | Value | Baseline | Delta |
|--------|-------|----------|-------|
| Accuracy | 0.876 | 0.821 | +0.055 |
| F1 (weighted) | 0.871 | 0.808 | +0.063 |
| ROC-AUC | 0.934 | 0.892 | +0.042 |

## Per-Class Results

{classification_report output}

## Slice Analysis

Worst-performing slices:
- age_group=65+: F1=0.71 (global: 0.87) — n=142
- region=rural: F1=0.74 (global: 0.87) — n=88

## Error Analysis

Reviewed 50 random errors. Root cause breakdown:
- 18 (36%): Label noise / ambiguous ground truth
- 14 (28%): Missing features (context not captured)
- 12 (24%): Rare patterns / tail distribution
- 6 (12%): Clear model failures — investigate further

## Recommendations

1. Review and fix ~18 mislabeled training examples in the {category} class.
2. Collect more data for age_group=65+ and region=rural slices.
3. Add {feature_name} as an input feature — likely high signal for missed errors.

## Next Steps

- [ ] Retrain with fixed labels
- [ ] Add {feature_name} to pipeline
- [ ] Re-evaluate on held-out test set
- [ ] Human evaluation of 100 random predictions for calibration check
```

---

## Checklist

- [ ] Metric chosen matches the task type and class balance
- [ ] Evaluation uses a held-out test set never seen during training or tuning
- [ ] Confusion matrix reviewed for systematic confusions
- [ ] Slice-based evaluation run across at least 2–3 important subgroups
- [ ] At least 30 errors manually reviewed and root-cause categorized
- [ ] Cross-validation used when test set is small (< 1,000 samples)
- [ ] Baseline model established for comparison (e.g., majority class, linear model)
- [ ] Evaluation report written and saved with date, model version, and dataset version
