---
name: huggingface-hub
description: Hugging Face Hub — model discovery, download, inference, and upload.
platforms: [linux, macos, windows]
tags: [huggingface, transformers, models, hub, inference, datasets, nlp, mlops]
---

# Hugging Face Hub SOP

Discover, load, run, and publish models and datasets on the Hugging Face Hub. Covers CLI auth, `transformers` pipelines, the Inference API, `push_to_hub`, and dataset loading.

## When to Use

- User wants to find the right pre-trained model for a task
- User wants to load and run a HF model locally
- User wants to call the HF Inference API without loading weights locally
- User wants to push a fine-tuned model or dataset to the Hub
- User wants to work with HF datasets library

---

## Part 1 — Auth Setup

### 1. Get a Token

1. Go to [https://huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
2. Click **New token** → name it → select **Write** role (needed for `push_to_hub`) or **Read** (for private model downloads)
3. Copy the token (starts with `hf_`)

### 2. Login via CLI

```bash
pip install huggingface_hub

huggingface-cli login
# Paste your token when prompted; it is saved to ~/.cache/huggingface/token
```

Or set as environment variable (CI/CD):
```bash
export HUGGINGFACE_TOKEN="hf_..."
```

Or in `~/.cowrangler/credentials.env`:
```
HUGGINGFACE_TOKEN=hf_...
```

### 3. Programmatic Auth

```python
from huggingface_hub import login
import os

login(token=os.environ.get("HUGGINGFACE_TOKEN"))
```

---

## Part 2 — Model Discovery

### Search by Task

```python
from huggingface_hub import HfApi

api = HfApi()

# Search models by task tag
models = api.list_models(
    task="text-classification",
    sort="downloads",
    direction=-1,
    limit=10,
)

for m in models:
    print(f"{m.modelId:50s}  downloads={m.downloads:>10,}  likes={m.likes}")
```

**Common task tags:**
`text-classification`, `token-classification`, `question-answering`,
`text-generation`, `summarization`, `translation`, `fill-mask`,
`sentence-similarity`, `image-classification`, `object-detection`,
`automatic-speech-recognition`, `text-to-speech`, `image-to-text`

### Filter by Language and Library

```python
models = api.list_models(
    task="text-classification",
    language="tr",       # ISO 639-1 language code
    library="transformers",
    sort="downloads",
    direction=-1,
    limit=5,
)
for m in models:
    print(m.modelId, m.downloads)
```

### Search by Keyword (via Hub search UI equivalent)

```python
models = list(api.list_models(search="bert sentiment", limit=10))
for m in models:
    print(m.modelId)
```

---

## Part 3 — Loading and Running Models

### Pipeline (fastest path)

```python
from transformers import pipeline

# Text classification
clf = pipeline("text-classification", model="distilbert-base-uncased-finetuned-sst-2-english")
print(clf("This movie was absolutely fantastic!"))
# [{'label': 'POSITIVE', 'score': 0.9998}]

# Named entity recognition
ner = pipeline("ner", model="dslim/bert-base-NER", aggregation_strategy="simple")
print(ner("My name is Wolfgang and I live in Berlin."))

# Summarization
summarizer = pipeline("summarization", model="facebook/bart-large-cnn", max_length=130, min_length=30)
print(summarizer("Article text here...")[0]["summary_text"])

# Text generation
gen = pipeline("text-generation", model="gpt2")
print(gen("The future of AI is", max_new_tokens=50, num_return_sequences=1))

# Zero-shot classification
zs = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")
print(zs("I love playing football", candidate_labels=["sports", "cooking", "technology"]))
```

### Explicit Model + Tokenizer

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

model_name = "cardiffnlp/twitter-roberta-base-sentiment-latest"
tokenizer  = AutoTokenizer.from_pretrained(model_name)
model      = AutoModelForSequenceClassification.from_pretrained(model_name)

inputs = tokenizer("Great product!", return_tensors="pt", truncation=True, max_length=512)
with torch.no_grad():
    logits = model(**inputs).logits

probs      = torch.softmax(logits, dim=-1)[0]
labels     = model.config.id2label
prediction = {labels[i]: round(probs[i].item(), 4) for i in range(len(labels))}
print(prediction)
```

### Run on GPU (if available)

```python
import torch

device = 0 if torch.cuda.is_available() else -1   # 0 = first GPU, -1 = CPU
pipe = pipeline("text-generation", model="gpt2", device=device)
```

### Quantized / Efficient Loading (large models)

```python
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

bnb_config = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.float16)

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3-8b-hf",
    quantization_config=bnb_config,
    device_map="auto",
)
tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3-8b-hf")
```

---

## Part 4 — Inference API (no local GPU required)

```python
import os, requests

HUGGINGFACE_TOKEN = os.environ["HUGGINGFACE_TOKEN"]
MODEL_ID          = "distilbert-base-uncased-finetuned-sst-2-english"

def hf_infer(model_id: str, inputs, wait_for_model=True):
    url     = f"https://api-inference.huggingface.co/models/{model_id}"
    headers = {"Authorization": f"Bearer {HUGGINGFACE_TOKEN}"}
    payload = {"inputs": inputs, "options": {"wait_for_model": wait_for_model}}
    r = requests.post(url, headers=headers, json=payload)
    r.raise_for_status()
    return r.json()

# Text classification
result = hf_infer(MODEL_ID, "I love this product!")
print(result)

# Sentence similarity
sim = hf_infer(
    "sentence-transformers/all-MiniLM-L6-v2",
    {"source_sentence": "How to cook pasta?", "sentences": ["Pasta recipe guide", "Football match results"]}
)
print(sim)
```

### Batch Inference API

```python
texts   = ["Great!", "Terrible experience.", "It was okay."]
results = hf_infer(MODEL_ID, texts)
for text, r in zip(texts, results):
    label = r[0]["label"]
    score = r[0]["score"]
    print(f"{text:30s}  {label}  {score:.3f}")
```

---

## Part 5 — Push to Hub

### Push a Fine-Tuned Model

```python
from transformers import Trainer, TrainingArguments, AutoModelForSequenceClassification, AutoTokenizer

# ... (after fine-tuning)

model_name_on_hub = "your-username/my-sentiment-model"

model.push_to_hub(model_name_on_hub, private=False)
tokenizer.push_to_hub(model_name_on_hub)

print(f"Published: https://huggingface.co/{model_name_on_hub}")
```

### Push with Model Card

Create `README.md` before pushing:

```markdown
---
language: en
license: apache-2.0
tags:
- text-classification
- sentiment
datasets:
- sst2
metrics:
- accuracy
model-index:
- name: my-sentiment-model
  results:
  - task:
      type: text-classification
    dataset:
      name: SST-2
      type: sst2
    metrics:
    - type: accuracy
      value: 0.934
---

# My Sentiment Model

Fine-tuned DistilBERT on SST-2 for binary sentiment classification.

## Usage

```python
from transformers import pipeline
pipe = pipeline("text-classification", model="your-username/my-sentiment-model")
print(pipe("I love this!"))
```
```

```python
from huggingface_hub import HfApi

api = HfApi()
api.upload_file(
    path_or_fileobj="README.md",
    path_in_repo="README.md",
    repo_id=model_name_on_hub,
    repo_type="model",
)
```

---

## Part 6 — Datasets Library

### Load a Dataset

```python
from datasets import load_dataset

# Load a full dataset
ds = load_dataset("imdb")
print(ds)
# DatasetDict({'train': Dataset(features={...}, num_rows=25000), 'test': ...})

# Load a specific split
train = load_dataset("imdb", split="train")
print(train[0])  # {'text': '...', 'label': 0}

# Load only a fraction (useful for quick testing)
tiny = load_dataset("imdb", split="train[:1%]")
```

### Filter and Map

```python
# Filter
positive = train.filter(lambda x: x["label"] == 1)
print(f"Positive examples: {len(positive)}")

# Map (tokenize)
from transformers import AutoTokenizer
tokenizer = AutoTokenizer.from_pretrained("distilbert-base-uncased")

def tokenize(batch):
    return tokenizer(batch["text"], truncation=True, padding="max_length", max_length=128)

tokenized = train.map(tokenize, batched=True, batch_size=256)
tokenized.set_format("torch", columns=["input_ids", "attention_mask", "label"])
```

### Push a Dataset to Hub

```python
from datasets import Dataset
import pandas as pd

df = pd.read_csv("my_data.csv")
ds = Dataset.from_pandas(df)
ds.push_to_hub("your-username/my-dataset", private=False)
```

---

## Model Card Essentials

Every model pushed to the Hub should have a `README.md` with these YAML frontmatter fields:

| Field | Example |
|-------|---------|
| `language` | `en` or `[en, fr]` |
| `license` | `apache-2.0`, `mit`, `cc-by-4.0` |
| `tags` | `[text-classification, sentiment]` |
| `datasets` | `[sst2, imdb]` |
| `metrics` | `[accuracy, f1]` |
| `base_model` | `distilbert-base-uncased` |

---

## Checklist

- [ ] Logged in via `huggingface-cli login` or `HUGGINGFACE_TOKEN` set
- [ ] Model selected by task, language, and download count — not just by name recognition
- [ ] For local inference: GPU memory checked before loading large models (`nvidia-smi`)
- [ ] For large models: 4-bit quantization or `device_map="auto"` used
- [ ] For Inference API: `wait_for_model=True` set to handle cold starts
- [ ] Model card README.md written before pushing to Hub
- [ ] Dataset pushed alongside model when applicable
- [ ] License field set in model card frontmatter
