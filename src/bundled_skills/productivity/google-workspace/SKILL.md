---
name: google-workspace
description: Google Docs, Sheets, and Drive operations via REST API.
platforms: [linux, macos, windows]
tags: [google, docs, sheets, drive, api, oauth, workspace, automation]
---

# Google Workspace API SOP

Read and write Google Docs, Sheets, and Drive files using the Google REST APIs. Covers OAuth setup, credential management, and concrete operations for each service.

## When to Use

- User wants to read content from a Google Doc
- User wants to append rows to a Google Sheet
- User wants to list or upload files in Google Drive
- User wants to export a Google Doc as PDF or DOCX
- User wants to share a Drive file

---

## Part 1 — Auth Setup

Google APIs require OAuth 2.0. Two paths:

### Path A — Service Account (recommended for automation)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → select or create a project
2. Enable APIs: **Google Docs API**, **Google Sheets API**, **Google Drive API**
3. **IAM & Admin** → **Service Accounts** → **Create Service Account**
4. Generate a JSON key → download as `service-account.json`
5. Share target Docs/Sheets/Drive folders with the service account email (found in the JSON file)

```bash
export GOOGLE_SERVICE_ACCOUNT_JSON="$HOME/.cowrangler/service-account.json"
```

```python
# Install: pip install google-auth google-auth-httplib2 google-api-python-client
from google.oauth2 import service_account
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

creds = service_account.Credentials.from_service_account_file(
    "service-account.json", scopes=SCOPES
)

docs_service   = build("docs", "v1", credentials=creds)
sheets_service = build("sheets", "v4", credentials=creds)
drive_service  = build("drive", "v3", credentials=creds)
```

### Path B — OAuth 2.0 for User Accounts (interactive)

1. Cloud Console → **APIs & Services** → **Credentials** → **Create OAuth client ID** → Desktop app
2. Download `client_secret.json`

```python
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
import pickle, os

SCOPES = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

creds = None
if os.path.exists("token.pickle"):
    with open("token.pickle", "rb") as f:
        creds = pickle.load(f)

if not creds or not creds.valid:
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    else:
        flow = InstalledAppFlow.from_client_secrets_file("client_secret.json", SCOPES)
        creds = flow.run_local_server(port=0)
    with open("token.pickle", "wb") as f:
        pickle.dump(creds, f)

docs_service   = build("docs", "v1", credentials=creds)
sheets_service = build("sheets", "v4", credentials=creds)
drive_service  = build("drive", "v3", credentials=creds)
```

---

## Part 2 — Google Docs

**Document ID** is the string in the URL: `https://docs.google.com/document/d/DOCUMENT_ID/edit`

### Read a Document

```python
doc = docs_service.documents().get(documentId="DOCUMENT_ID").execute()
print("Title:", doc["title"])

# Extract all plain text
def extract_text(doc):
    text = []
    for elem in doc.get("body", {}).get("content", []):
        for pe in elem.get("paragraph", {}).get("elements", []):
            text.append(pe.get("textRun", {}).get("content", ""))
    return "".join(text)

content = extract_text(doc)
print(content[:500])
```

### Append Text to a Document

```python
# Find end index of document
doc = docs_service.documents().get(documentId="DOCUMENT_ID").execute()
end_index = doc["body"]["content"][-1]["endIndex"] - 1

requests = [
    {
        "insertText": {
            "location": {"index": end_index},
            "text": "\n\nNew paragraph added by automation.\n",
        }
    }
]

docs_service.documents().batchUpdate(
    documentId="DOCUMENT_ID",
    body={"requests": requests}
).execute()
```

### Find and Replace Text

```python
requests = [
    {
        "replaceAllText": {
            "containsText": {"text": "{{CUSTOMER_NAME}}", "matchCase": True},
            "replaceText": "Acme Corp",
        }
    },
    {
        "replaceAllText": {
            "containsText": {"text": "{{DATE}}", "matchCase": True},
            "replaceText": "May 18, 2026",
        }
    },
]

result = docs_service.documents().batchUpdate(
    documentId="DOCUMENT_ID",
    body={"requests": requests}
).execute()
print(f"Replacements: {result['replies'][0]['replaceAllText']['occurrencesChanged']}")
```

### Create a New Document

```python
doc = docs_service.documents().create(body={"title": "My Report"}).execute()
print("Created:", doc["documentId"])
print("URL:", f"https://docs.google.com/document/d/{doc['documentId']}/edit")
```

---

## Part 3 — Google Sheets

**Spreadsheet ID** is in the URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`

### Read a Range

```python
result = sheets_service.spreadsheets().values().get(
    spreadsheetId="SPREADSHEET_ID",
    range="Sheet1!A1:E100",          # A1 notation
    valueRenderOption="UNFORMATTED_VALUE",  # raw values, not display strings
).execute()

rows = result.get("values", [])
headers = rows[0] if rows else []
print("Headers:", headers)
for row in rows[1:]:
    print(row)
```

### Write Values to a Range

```python
values = [
    ["Name", "Email", "Status"],
    ["Alice", "alice@example.com", "Active"],
    ["Bob",   "bob@example.com",   "Inactive"],
]

sheets_service.spreadsheets().values().update(
    spreadsheetId="SPREADSHEET_ID",
    range="Sheet1!A1",
    valueInputOption="USER_ENTERED",  # parses formulas and dates
    body={"values": values}
).execute()
```

### Append Rows

```python
new_rows = [
    ["Charlie", "charlie@example.com", "Active"],
    ["Diana",   "diana@example.com",   "Active"],
]

sheets_service.spreadsheets().values().append(
    spreadsheetId="SPREADSHEET_ID",
    range="Sheet1!A:A",          # append after last row in this column
    valueInputOption="USER_ENTERED",
    insertDataOption="INSERT_ROWS",  # don't overwrite existing data
    body={"values": new_rows}
).execute()
```

### Read All Sheets and Their Ranges

```python
meta = sheets_service.spreadsheets().get(spreadsheetId="SPREADSHEET_ID").execute()
for sheet in meta["sheets"]:
    props = sheet["properties"]
    print(f"  {props['title']:30s}  rows={props['gridProperties']['rowCount']}")
```

### Batch Read Multiple Ranges

```python
result = sheets_service.spreadsheets().values().batchGet(
    spreadsheetId="SPREADSHEET_ID",
    ranges=["Sheet1!A:B", "Sheet2!A:C", "Config!A:B"],
).execute()

for value_range in result["valueRanges"]:
    print(value_range["range"])
    for row in value_range.get("values", []):
        print(" ", row)
```

### Create a New Spreadsheet

```python
spreadsheet = sheets_service.spreadsheets().create(body={
    "properties": {"title": "Q2 Report"},
    "sheets": [
        {"properties": {"title": "Summary"}},
        {"properties": {"title": "Raw Data"}},
    ]
}).execute()
print("ID:", spreadsheet["spreadsheetId"])
```

---

## Part 4 — Google Drive

### List Files

```python
results = drive_service.files().list(
    q="mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    pageSize=50,
    fields="files(id, name, modifiedTime, owners)",
    orderBy="modifiedTime desc",
).execute()

for f in results.get("files", []):
    print(f"{f['id']}  {f['modifiedTime'][:10]}  {f['name']}")
```

**Useful MIME type filters:**
- Google Doc: `application/vnd.google-apps.document`
- Google Sheet: `application/vnd.google-apps.spreadsheet`
- Google Slides: `application/vnd.google-apps.presentation`
- Folder: `application/vnd.google-apps.folder`
- In folder: `'FOLDER_ID' in parents`

### Upload a File

```python
from googleapiclient.http import MediaFileUpload

media = MediaFileUpload("report.pdf", mimetype="application/pdf", resumable=True)
file = drive_service.files().create(
    body={"name": "Q2 Report.pdf", "parents": ["FOLDER_ID"]},
    media_body=media,
    fields="id, webViewLink",
).execute()
print("Uploaded:", file["webViewLink"])
```

### Export a Google Doc as PDF or DOCX

```python
import io

# Export as PDF
response = drive_service.files().export_media(
    fileId="DOCUMENT_ID",
    mimeType="application/pdf",
).execute()

with open("output.pdf", "wb") as f:
    f.write(response)

# Export as DOCX
response = drive_service.files().export_media(
    fileId="DOCUMENT_ID",
    mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
).execute()

with open("output.docx", "wb") as f:
    f.write(response)
```

### Share a File

```python
# Share with a specific person
drive_service.permissions().create(
    fileId="FILE_ID",
    body={"type": "user", "role": "writer", "emailAddress": "colleague@example.com"},
    sendNotificationEmail=True,
).execute()

# Make publicly readable
drive_service.permissions().create(
    fileId="FILE_ID",
    body={"type": "anyone", "role": "reader"},
).execute()
```

---

## Common Patterns

### Template-to-Doc Pipeline

```python
import copy

TEMPLATE_ID = "your-template-doc-id"
FOLDER_ID   = "output-folder-id"

# 1. Copy template
copied = drive_service.files().copy(
    fileId=TEMPLATE_ID,
    body={"name": "Report — Acme Corp — May 2026", "parents": [FOLDER_ID]},
).execute()

new_doc_id = copied["id"]

# 2. Fill in placeholders
replacements = {
    "{{COMPANY}}": "Acme Corp",
    "{{MONTH}}":   "May 2026",
    "{{TOTAL}}":   "$42,000",
}

requests = [
    {
        "replaceAllText": {
            "containsText": {"text": placeholder, "matchCase": True},
            "replaceText": value,
        }
    }
    for placeholder, value in replacements.items()
]

docs_service.documents().batchUpdate(
    documentId=new_doc_id, body={"requests": requests}
).execute()

print(f"https://docs.google.com/document/d/{new_doc_id}/edit")
```

---

## Checklist

- [ ] Target APIs enabled in Google Cloud Console (Docs, Sheets, Drive)
- [ ] Service account created and JSON key downloaded
- [ ] Document/Sheet shared with service account email
- [ ] `pip install google-auth google-auth-httplib2 google-api-python-client` installed
- [ ] Spreadsheet ranges use A1 notation (`Sheet1!A1:C100`)
- [ ] `valueInputOption="USER_ENTERED"` used when writing formulas or dates to Sheets
- [ ] `export_media` used for exporting Google Docs — they cannot be downloaded directly
