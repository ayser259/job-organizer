# Save to Tracker

A schema-aware Chrome Extension that dynamically bridges your browser with any Notion Database. Unlike traditional clippers with hardcoded fields, this extension inspects your database structure and generates a matching form automatically.

## Features

- **Dynamic Schema Detection**: Automatically fetches and renders form fields based on your Notion database properties
- **Auto-Population**: Pre-fills URL and Title fields with the current page data
- **Duplicate Detection**: Automatically detects existing entries with the same URL and loads them for editing
- **Update Existing Entries**: Seamlessly update existing database rows instead of creating duplicates
- **Google Sheets Sync**: Automatically duplicate saves to Google Sheets for easy analysis and sharing
- **AI-Powered Auto-Fill**: Uses OpenAI to read page content and intelligently fill all form fields
- **Multi-Type Support**: Handles title, rich_text, url, select, multi_select, checkbox, number, date, email, phone, and status properties
- **Notion-Inspired UI**: Dark theme interface that matches the Notion aesthetic
- **Secure Storage**: Credentials stored locally in Chrome's secure storage
- **Real-Time Validation**: Connection testing before saving

## Supported Property Types

| Notion Type | Form Element | Auto-Populated |
|-------------|--------------|----------------|
| Title | Text input | ✅ (page title) |
| URL | URL input | ✅ (current URL) |
| Select | Dropdown | ✅ (location fields) |
| Status | Dropdown | ✅ (location fields) |
| Rich Text | Textarea | ❌ |
| Multi-Select | Tag selector | ❌ |
| Checkbox | Checkbox | ❌ |
| Number | Number input | ❌ |
| Date | Date picker | ❌ |
| Email | Email input | ❌ |
| Phone | Phone input | ❌ |

**Note**: Select/Status fields with "location", "where", "city", or "place" in their name will automatically match the extracted location against your predefined options and select the best match.

## Installation

### Developer Mode (Recommended for Development)

1. Clone this repository or download the source code
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `job-organizer` folder
6. The extension icon will appear in your toolbar

### Production Build

For distribution, you would package the extension:

```bash
# Create a zip file for Chrome Web Store submission
zip -r notion-clipper.zip . -x "*.git*" -x "*.md" -x "*.svg"
```

## Configuration

### Step 1: Create a Notion Integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **+ New integration**
3. Name your integration (e.g., "Browser Clipper")
4. Select the workspace
5. Click **Submit**
6. Copy the **Internal Integration Secret** (starts with `secret_` or `ntn_`)

### Step 2: Share Your Database

1. Open your target database in Notion
2. Click the **...** menu in the top-right
3. Select **Add connections**
4. Find and select your integration
5. Confirm the connection

### Step 3: Get Your Database ID

From your database URL:
```
https://notion.so/workspace/DATABASE_ID?v=...
```

The Database ID is the 32-character string before `?v=`

### Step 4: Configure the Extension

1. Click the extension icon in Chrome
2. Click the settings gear (⚙️) or the "Configure Extension" button
3. Paste your Integration Secret
4. Paste your Database ID
5. Click **Test Connection** to verify
6. Click **Save Settings**

### Step 5: Enable AI Auto-Fill (Optional)

1. Get an OpenAI API key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. In the extension settings, paste your API key in the "AI Auto-Fill" section
3. Click **Save Settings**
4. The "Add Details" button will now appear in the popup

### Step 6: Enable Google Sheets Sync (Optional)

**Why use Google Sheets sync?**
- Keep a backup of your data in Google Sheets
- Easily share data with teammates
- Create charts, pivot tables, and analyze your data in Sheets
- Export to CSV or other formats
- Works alongside Notion - all saves go to both places

**Setup Instructions:**

1. **Create a Google Cloud Project:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Click "Select a project" at the top → "New Project"
   - Give it a name (e.g., "Notion Clipper")
   - Click "Create" and wait for the project to be created

2. **Enable Google Sheets API:**
   - In the search bar at the top, type "Google Sheets API"
   - Click on the "Google Sheets API" result
   - Click the blue "Enable" button
   - Wait for it to finish enabling (takes 10-30 seconds)

3. **Create an API Key:**
   - Click "Credentials" in the left sidebar
   - Click the blue "Create Credentials" button at the top
   - Select "API Key" from the dropdown
   - A popup will appear with your new API key
   - Click "Copy" to copy the key (it starts with `AIza`)
   - Click "Close" (you can restrict the key later if desired)

4. **Prepare Your Spreadsheet:**
   - Create a new Google Sheets spreadsheet or use an existing one
   - In **row 1**, add column headers that match your Notion property names **exactly**
     - Example: If your Notion database has "Title", "URL", "Company", "Status"
     - Your Sheet should have: `Title | URL | Company | Status` in row 1
     - Column names are case-sensitive and must match exactly
   - **Important**: Make the sheet accessible with your API key:
     - Click the "Share" button in the top-right
     - Change to "Anyone with the link can view" (or "can edit")
     - Click "Done"
   - Copy the Spreadsheet ID from the URL:
     ```
     https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
     ```
     The ID is the long string between `/d/` and `/edit`

5. **Configure the Extension:**
   - In the extension settings (click the gear icon), find the "Google Sheets Sync" section
   - Toggle "Enable Google Sheets sync" to **ON** (the toggle will turn green)
   - Paste your Google API key (from step 3)
   - Paste your Spreadsheet ID (from step 4)
   - Enter the Sheet name (the tab name at the bottom, usually "Sheet1")
   - Click **Save Settings**
   - You should see "API key configured" with a green dot

6. **Test It:**
   - Navigate to any webpage
   - Open the extension popup
   - Fill in the form
   - Click "Save to Notion"
   - Check both your Notion database and Google Sheet - the entry should appear in both!

7. **How It Works:**
   - Every time you save to Notion, data is automatically synced to Sheets
   - If an entry with the same URL exists, it updates the row
   - If it's new, it appends a new row
   - Notion properties are converted to flat values:
     - Select/Status → Text value
     - Multi-select → Comma-separated values
     - Checkbox → TRUE/FALSE
     - All other types → Their string representation

**Troubleshooting:**

| Issue | Solution |
|-------|----------|
| "API not enabled" error | Go to Google Cloud Console, search for "Google Sheets API", click Enable, and wait 1-2 minutes for it to activate |
| "Access denied" or 403 error | Make sure your spreadsheet is shared: Click Share → "Anyone with the link can view" |
| "Spreadsheet not found" or 404 | Double-check the Spreadsheet ID - it should be the long string between `/d/` and `/edit` in your sheet URL |
| Data not appearing in Sheets | Check that column headers in row 1 match your Notion property names **exactly** (case-sensitive) |
| "Invalid API key" | Verify your API key starts with `AIza` and was copied completely without spaces |
| Sync fails but Notion works | The extension will still save to Notion even if Sheets sync fails - check browser console (F12) for detailed error |
| Still not working? | Open browser console (F12), try saving again, and look for error messages with details |

**Common Mistakes:**
- ❌ Column headers don't match Notion property names exactly
- ❌ Spreadsheet is fully private (not shared with "Anyone with the link")
- ❌ API key wasn't copied completely or has extra spaces
- ❌ Sheets API not enabled or not fully activated yet
- ❌ Wrong Spreadsheet ID (should be 44 characters long)

## Usage

1. Navigate to any webpage you want to save
2. Click the Save to Tracker extension icon
3. The extension will:
   - Check if an entry with the same URL already exists in your database
   - If found, load all existing data into the form for editing (displays "Editing existing entry" banner)
   - If not found, create a new form pre-filled with page title and URL
4. **Optional**: Click the **Add Details** button to automatically extract and fill all fields from the page
5. Review and adjust any fields as needed
6. Click **Save to Notion** (for new entries) or **Update in Notion** (for existing entries)
7. Click **View in Notion** to open the page

### Duplicate Detection

The extension automatically prevents duplicates by:
- Searching your database for entries with the same URL when you open the popup
- Loading existing data if found, allowing you to update instead of creating a duplicate
- Showing a green "Editing existing entry" banner when you're updating an existing page
- Changing the submit button text from "Save to Notion" to "Update in Notion"

**Note**: This feature requires your database to have a URL field. If no URL field exists, each popup will create a new entry.

### Automatic Location Detection

The extension automatically extracts job location from the page without requiring AI or manual input:

**How it works:**
1. **Extract Location** - Reads location from the page using:
   - Schema.org JobPosting structured data (JSON-LD)
   - Meta tags (`location`, `job:location`, `og:location`)
   - HTML elements with location-related class names or attributes
   - Pattern matching in page text (e.g., "Location: San Francisco", "📍 Remote")

2. **Smart Matching** - For Select/Status fields, matches the extracted location to your predefined options:
   - **Exact match** - "San Francisco" → "San Francisco"
   - **Contains match** - "San Francisco, CA" → "San Francisco"
   - **Reverse contains** - "SF Bay Area" → "San Francisco"
   - **Remote detection** - Any mention of "remote" → "Remote" option
   - **City abbreviations** - "SF", "NYC", "LA" → Full city names

**To use this feature:**
1. Create a **Select** or **Status** field in your Notion database
2. Add your location options (e.g., "Remote", "San Francisco", "New York", "London")
3. Name the field with "location" in it (e.g., "Location", "Job Location", "Where")
4. The extension will automatically detect and select the best matching option

**Example:**
- Your options: `["Remote", "San Francisco", "New York", "Hybrid"]`
- Page says: "📍 Remote - San Francisco Bay Area"
- Extension selects: `"Remote"` (first match)

**Supported formats:**
- City, State (e.g., "San Francisco, CA")
- Remote positions
- Multiple locations
- International locations
- City abbreviations (SF, NYC, LA, DC)

This works on most major job boards including LinkedIn, Indeed, Greenhouse, Lever, and others that use standard structured data or common HTML patterns.

### Add Details Feature

When you click "Add Details", the extension:
1. Reads the content of the current page (article, main content, or full body)
2. Sends the content to OpenAI along with your database schema
3. AI extracts relevant information for each field type
4. Fields are automatically populated with a visual indicator (✨)

The AI will:
- Only select options that exist in your dropdowns (select/multi-select)
- Format dates correctly
- Extract numbers, emails, phone numbers appropriately
- Skip fields it can't confidently fill

## Architecture

```
job-organizer/
├── manifest.json           # Extension configuration (Manifest V3)
├── background/
│   └── service-worker.js   # API proxy & tab info handler
├── lib/
│   ├── notion-api.js       # Notion API abstraction & formatters
│   └── sheets-api.js       # Google Sheets API abstraction
├── popup/
│   ├── popup.html          # Main popup UI
│   ├── popup.css           # Notion-inspired styling
│   └── popup.js            # Dynamic form rendering engine
├── options/
│   ├── options.html        # Settings page
│   ├── options.css         # Settings styling
│   └── options.js          # Credential management
└── assets/
    └── icon*.png           # Extension icons
```

### Data Flow

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Popup     │────▶│  Service Worker  │────▶│  Notion API │
│  (popup.js) │◀────│ (service-worker) │◀────│             │
└─────────────┘     └──────────────────┘     └─────────────┘
      │                      │                       
      │                      │                ┌──────────────┐
      │                      └───────────────▶│ Sheets API   │
      │                                       │ (optional)   │
      │                                       └──────────────┘
      │
      │  1. Request schema from Notion
      │  2. Render form dynamically
      │  3. Submit page creation to Notion
      │  4. Sync to Google Sheets (if enabled)
      └─────────────────────────────────────────────────────
```

## API Payload Format

The extension constructs payloads following the Notion API specification:

```javascript
// Example POST /v1/pages payload
{
  "parent": {
    "database_id": "your-database-id"
  },
  "properties": {
    "Name": {
      "title": [{ "text": { "content": "Page Title" } }]
    },
    "URL": {
      "url": "https://example.com"
    },
    "Status": {
      "select": { "name": "To Review" }
    },
    "Tags": {
      "multi_select": [
        { "name": "Tag1" },
        { "name": "Tag2" }
      ]
    }
  }
}
```

## Security Considerations

- **Local Storage**: Credentials are stored in `chrome.storage.local`, which is sandboxed per-extension
- **No External Servers**: All API calls go directly to Notion's and OpenAI's APIs
- **Secret Visibility**: API keys are masked by default in the options page
- **HTTPS Only**: All API communication uses HTTPS
- **Content Reading**: Page content is only read when you click "Add Details" and is sent directly to OpenAI

### Future Security Enhancements

For production deployment, consider:
- Implementing a backend proxy to hide API keys completely
- Using OAuth 2.0 for public integrations
- Adding rate limiting and request validation

## Error Handling

The extension handles common error scenarios:

### Notion Errors

| Error | Message | Solution |
|-------|---------|----------|
| 401 | Invalid Integration Secret | Check your secret in settings |
| 403 | Access denied | Share the database with your integration |
| 404 | Database not found | Verify the Database ID |
| 429 | Rate limited | Wait a moment and retry |
| Network | Network error | Check internet connection |

### OpenAI Errors

| Error | Message | Solution |
|-------|---------|----------|
| 401 | Invalid API key | Check your OpenAI key in settings |
| 429 | Rate limited | Wait a moment and retry |
| 402 | Billing issue | Check your OpenAI account billing |
| Cannot access | Page restricted | Extension can't read Chrome pages or restricted sites |

## Development

### Local Development

```bash
# Clone the repository
git clone <repo-url>
cd job-organizer

# Load in Chrome (Developer Mode)
# No build step required - pure vanilla JS
```

### Modifying the Schema Parser

The dynamic rendering engine is in `popup/popup.js`. To add support for new property types:

1. Add the type to `TYPE_PRIORITY` for sorting
2. Create a `render*Field()` function
3. Add the renderer to the `renderers` object in `renderProperty()`
4. Add a formatter in `lib/notion-api.js` → `PropertyFormatters`

## Troubleshooting

### "Configuration Required" Error
- Open settings and verify your credentials
- Test the connection before saving

### Form Not Loading
- Check if the database is shared with your integration
- Verify the Database ID is correct

### Submission Fails
- Ensure required fields (Title) are filled
- Check browser console for detailed errors

## License

MIT License - Feel free to modify and distribute.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

Built with ❤️ for productivity enthusiasts who love Notion.

