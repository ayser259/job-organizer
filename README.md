# Save to Tracker

A schema-aware Chrome Extension that dynamically bridges your browser with any Notion Database. Unlike traditional clippers with hardcoded fields, this extension inspects your database structure and generates a matching form automatically.

## Features

- **Dynamic Schema Detection**: Automatically fetches and renders form fields based on your Notion database properties
- **Auto-Population**: Pre-fills URL and Title fields with the current page data
- **Multi-Type Support**: Handles title, rich_text, url, select, multi_select, checkbox, number, date, email, phone, and status properties
- **Notion-Inspired UI**: Dark theme interface that matches the Notion aesthetic
- **Secure Storage**: Credentials stored locally in Chrome's secure storage
- **Real-Time Validation**: Connection testing before saving

## Supported Property Types

| Notion Type | Form Element | Auto-Populated |
|-------------|--------------|----------------|
| Title | Text input | ✅ (page title) |
| URL | URL input | ✅ (current URL) |
| Rich Text | Textarea | ❌ |
| Select | Dropdown | ❌ |
| Multi-Select | Tag selector | ❌ |
| Status | Dropdown | ❌ |
| Checkbox | Checkbox | ❌ |
| Number | Number input | ❌ |
| Date | Date picker | ❌ |
| Email | Email input | ❌ |
| Phone | Phone input | ❌ |

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

## Usage

1. Navigate to any webpage you want to save
2. Click the Save to Tracker extension icon
3. The form will automatically populate with:
   - Page title → Title field
   - Page URL → URL field
4. Fill in any additional fields
5. Click **Save to Notion**
6. Click **View in Notion** to open the new page

## Architecture

```
job-organizer/
├── manifest.json           # Extension configuration (Manifest V3)
├── background/
│   └── service-worker.js   # API proxy & tab info handler
├── lib/
│   └── notion-api.js       # Notion API abstraction & formatters
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
      │                                              │
      │  1. Request schema                           │
      │  2. Render form dynamically                  │
      │  3. Submit page creation                     │
      └──────────────────────────────────────────────┘
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
- **No External Servers**: All API calls go directly to Notion's API
- **Secret Visibility**: The Integration Secret is masked by default in the options page
- **HTTPS Only**: All Notion API communication uses HTTPS

### Future Security Enhancements

For production deployment, consider:
- Implementing a backend proxy to hide the Integration Secret completely
- Using OAuth 2.0 for public integrations
- Adding rate limiting and request validation

## Error Handling

The extension handles common error scenarios:

| Error | Message | Solution |
|-------|---------|----------|
| 401 | Invalid Integration Secret | Check your secret in settings |
| 403 | Access denied | Share the database with your integration |
| 404 | Database not found | Verify the Database ID |
| 429 | Rate limited | Wait a moment and retry |
| Network | Network error | Check internet connection |

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

