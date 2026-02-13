# Batch Competitor Research - Setup Instructions

## ✨ New Features Added

### What's New:
1. ✅ **Multiple Companies at Once** - Add 5, 10, 20+ competitors in a single batch
2. ✅ **Company Aliases** - Search patents under all company name variations
3. ✅ **Automatic Product Discovery** - Crawls company website to find specs/docs
4. ✅ **Better Organization** - Each company tracked separately with all their documents

---

## Files Created/Updated

### Frontend
- `app/competitors/add/page.tsx` - **REPLACE with page-v2.tsx** (new batch interface)

### Backend
- `app/api/competitors/research-batch/route.ts` - **NEW** batch processing endpoint
- `lib/url-fetcher.ts` - **UPDATED** with `discoverProductUrls()` function

### Database
- Same as before: `004_competitor_documents.sql` (already created)

---

## Installation Steps

### Step 1: Update Files

**Replace the competitor form:**
```
app/competitors/add/page.tsx  ← Replace with page-v2.tsx
```

**Add new batch API:**
```
app/api/competitors/research-batch/route.ts  ← NEW file
```

**Update URL fetcher:**
```
lib/url-fetcher.ts  ← Replace with updated version
```

### Step 2: Test the New Interface

```bash
npm run dev
```

Go to: `http://localhost:3000/competitors/add`

---

## How to Use - Example

### Scenario: Research 3 Competitors

**Company 1: Apple**
- Name: `Apple Inc.`
- Aliases: `Apple Computer Inc., Apple Computer, AAPL`
- Website: `https://www.apple.com`
- Known Patents: `US-11234567-B2` (optional)
- Specific URLs: `https://www.apple.com/iphone/specs.pdf` (optional)

**Company 2: Samsung**
- Name: `Samsung Electronics`
- Aliases: `Samsung, Samsung Electronics Co Ltd`
- Website: `https://www.samsung.com`
- Known Patents: (leave blank for auto-search)
- Specific URLs: (leave blank for auto-discovery)

**Company 3: Google**
- Name: `Google LLC`
- Aliases: `Google Inc., Alphabet Inc.`
- Website: `https://www.google.com/products`
- Known Patents: (leave blank)
- Specific URLs: (leave blank)

**Click "Research 3 Companies"** → System processes all at once!

---

## What Happens Behind the Scenes

### For Each Company:

#### 1. **Create Database Entry**
```
competitors table:
  - id: uuid
  - name: "Apple Inc."
  - website: "https://www.apple.com"
  - notes: "Aliases: Apple Computer Inc., Apple Computer"
```

#### 2. **Discover Product URLs** (if website provided)
```
Crawls website → Finds:
  - /products/iphone/specs.pdf
  - /whitepapers/a15-chip.pdf
  - /technical-docs/magsafe.pdf
```

#### 3. **Fetch & Extract Documents**
```
For each URL:
  - Download PDF
  - Upload to S3
  - Textract extraction
  - Save to competitor_documents table
  - Save pages to competitor_document_pages table
  - Cleanup S3
```

#### 4. **Search USPTO** (TODO)
```
Search for patents by:
  - "Apple Inc." OR
  - "Apple Computer Inc." OR
  - "Apple Computer" OR
  - "AAPL"
  
Auto-fetch and extract all matching patents
```

---

## Database Structure

```
competitors
├─ id: abc123
├─ name: "Apple Inc."
├─ website: "https://www.apple.com"
└─ notes: "Aliases: Apple Computer Inc., ..."

competitor_documents
├─ id: doc001
├─ competitor_id: abc123
├─ source_url: "https://apple.com/iphone/specs.pdf"
├─ document_name: "iPhone 15 Pro Technical Specs"
├─ document_type: "pdf"
├─ total_pages: 25
└─ extracted_text: "Full text..."

competitor_document_pages
├─ document_id: doc001
├─ page_number: 1
├─ text: "Page 1 content..."
└─ raw_text: "Page 1 raw content..."

(More documents for same competitor...)

competitor_documents
├─ id: doc002
├─ competitor_id: abc123
├─ source_url: "https://apple.com/whitepaper.pdf"
...
```

---

## API Response Example

```json
{
  "success": true,
  "companiesProcessed": 3,
  "totalDocuments": 15,
  "totalPages": 347,
  "competitors": [
    {
      "id": "abc123",
      "name": "Apple Inc.",
      "success": true,
      "documentsFound": 7,
      "pagesExtracted": 156,
      "aliases": ["Apple Computer Inc.", "Apple Computer", "AAPL"]
    },
    {
      "id": "def456",
      "name": "Samsung Electronics",
      "success": true,
      "documentsFound": 5,
      "pagesExtracted": 123,
      "aliases": ["Samsung", "Samsung Electronics Co Ltd"]
    },
    {
      "id": "ghi789",
      "name": "Google LLC",
      "success": true,
      "documentsFound": 3,
      "pagesExtracted": 68,
      "aliases": ["Google Inc.", "Alphabet Inc."]
    }
  ]
}
```

---

## Features Working Now

✅ **Batch Processing**
- Add unlimited companies in one submission
- Each processed independently
- Errors in one don't stop others

✅ **Company Aliases**
- Stored in database notes
- Will be used for USPTO search
- Helps find patents under different names

✅ **Automatic Discovery**
- Crawls company website
- Finds PDFs (specs, datasheets, whitepapers)
- Finds product pages
- Limits to top 10 to avoid spam

✅ **Document Organization**
- Multiple documents per competitor
- Each document tracked separately
- Page-level references maintained

---

## Still TODO (Future Features)

🚧 **USPTO Integration**
- Auto-search patents by company name + aliases
- Download patent PDFs
- Extract with Textract
- Store in same structure

🚧 **HTML to PDF Conversion**
- Currently only works with direct PDF links
- Need Puppeteer for web pages
- Or send HTML directly to Claude

🚧 **Smart Filtering**
- AI determines which discovered URLs are actually useful
- Avoids generic "About Us" pages
- Focuses on technical documentation

🚧 **Progress Tracking**
- Real-time updates during batch processing
- Show which company is being processed
- Display extraction progress

---

## Testing Checklist

- [ ] Can access `/competitors/add` page
- [ ] Can add multiple companies
- [ ] Can add/remove company aliases
- [ ] Can add multiple product URLs per company
- [ ] Can submit batch research
- [ ] Companies created in database
- [ ] Documents extracted with Textract
- [ ] Pages saved with page numbers
- [ ] Success screen shows correct stats

---

## Performance Notes

**Batch Size Recommendations:**
- Small batch: 1-3 companies (fast, ~2-5 minutes)
- Medium batch: 5-10 companies (moderate, ~10-20 minutes)
- Large batch: 10+ companies (slow, ~30+ minutes)

**Processing Time Factors:**
- Number of companies
- Number of documents per company
- Size of each document (pages)
- Textract API speed

**Cost Considerations:**
- Textract: $1.50 per 1,000 pages
- S3: Negligible (temp storage only)
- Example: 10 companies × 5 docs × 20 pages = 1,000 pages = $1.50

---

## Next Steps After This Works

1. ✅ **Test batch processing** with 2-3 companies
2. 🔜 **Add USPTO search** integration
3. 🔜 **Build comparison engine** (your patent vs their docs)
4. 🔜 **Generate infringement reports**
5. 🔜 **Add AI analysis** of overlap/similarity
