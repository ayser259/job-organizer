/**
 * Background Service Worker
 * Handles Notion API requests to keep the Integration Secret secure
 * Acts as a proxy between the popup and Notion/OpenAI APIs
 */

// Message handler for API requests from popup/options
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Service worker received:', request.type);
  
  handleMessage(request)
    .then(result => {
      console.log('Service worker responding:', request.type, result ? 'success' : 'empty');
      sendResponse(result);
    })
    .catch(error => {
      console.error('Service worker error:', request.type, error);
      sendResponse({ error: error.message || 'Unknown error' });
    });
  
  // Return true to indicate we will send response asynchronously
  return true;
});

/**
 * Route messages to appropriate handlers
 * @param {Object} request - The message request
 * @returns {Promise<Object>} Response object
 */
async function handleMessage(request) {
  switch (request.type) {
    case 'NOTION_API_REQUEST':
      return await handleNotionRequest(request.payload);
    
    case 'GET_TAB_INFO':
      return await getActiveTabInfo();
    
    case 'OPENAI_API_REQUEST':
      return await handleOpenAIRequest(request.payload);
    
    case 'GET_PAGE_CONTENT':
      return await getPageContent();
    
    case 'SHEETS_API_REQUEST':
      return await handleSheetsRequest(request.payload);
    
    default:
      throw new Error('Unknown request type: ' + request.type);
  }
}

/**
 * Proxy Notion API requests with proper authentication
 * @param {Object} payload - Request configuration
 * @returns {Promise<Object>} API response
 */
async function handleNotionRequest(payload) {
  const { endpoint, method = 'GET', body, secret } = payload;
  
  if (!secret) {
    throw new Error('Notion Integration Secret not configured');
  }

  const baseUrl = 'https://api.notion.com/v1';
  const url = `${baseUrl}${endpoint}`;

  const headers = {
    'Authorization': `Bearer ${secret}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  };

  const config = {
    method,
    headers
  };

  if (body && (method === 'POST' || method === 'PATCH')) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(url, config);
  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.message || `API Error: ${response.status}`;
    
    if (response.status === 401) {
      throw new Error('Invalid Integration Secret. Please check your credentials.');
    }
    if (response.status === 403) {
      throw new Error('Access denied. Ensure the database is shared with your integration.');
    }
    if (response.status === 404) {
      throw new Error('Database not found. Please verify the Database ID.');
    }
    if (response.status === 429) {
      throw new Error('Rate limited. Please wait a moment and try again.');
    }
    
    throw new Error(errorMessage);
  }

  return { success: true, data };
}

/**
 * Get active tab URL, title, location, and selected text
 * @returns {Promise<Object>} Tab information
 */
async function getActiveTabInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab) {
    throw new Error('No active tab found');
  }

  let location = '';
  let selectedText = '';
  
  // Try to extract location and selected text from the page
  try {
    const url = tab.url || '';
    // Skip chrome:// and other restricted pages
    if (!url.startsWith('chrome://') && 
        !url.startsWith('chrome-extension://') && 
        !url.startsWith('about:') &&
        !url.startsWith('edge://') &&
        url !== '') {
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractLocationAndSelection
      });
      
      if (results && results[0] && results[0].result) {
        const extracted = results[0].result;
        location = extracted.location || '';
        selectedText = extracted.selectedText || '';
        
        if (location) {
          console.log('📍 Location extracted from page:', location);
        } else {
          console.log('⚠️ No location extracted from page');
        }
        
        if (selectedText) {
          console.log('✂️ Selected text captured:', selectedText.substring(0, 100) + (selectedText.length > 100 ? '...' : ''));
        }
      }
    }
  } catch (e) {
    console.log('❌ Could not extract from page:', e.message);
    // Silently fail - these are optional
  }

  // Parse LinkedIn-style titles: "Role Name | Company | LinkedIn"
  let roleName = tab.title || '';
  let companyName = '';
  
  if (tab.title && tab.title.includes(' | ')) {
    const parts = tab.title.split(' | ');
    if (parts.length >= 2) {
      roleName = parts[0].trim();
      companyName = parts[1].trim();
      console.log(`📋 Parsed title: "${tab.title}"`);
      console.log(`   → Role: "${roleName}"`);
      console.log(`   → Company: "${companyName}"`);
      // If there's a third part that's just "LinkedIn" or similar, ignore it
      if (parts.length === 3 && parts[2].toLowerCase().match(/^(linkedin|indeed|glassdoor)$/)) {
        // Keep role and company as extracted
      } else if (parts.length > 2) {
        // If there are more parts, it might be structured differently
        // Keep the first part as role, second as company
      }
    }
  }
  
  return {
    url: tab.url || '',
    title: tab.title || '',
    roleName: roleName,
    companyName: companyName,
    location: location || '',
    selectedText: selectedText || ''
  };
}

/**
 * Extract location and selected text from page
 */
function extractLocationAndSelection() {
  try {
    let location = '';
    let possibleLocations = [];
    
    // 1. Try structured data
    const ldJson = document.querySelector('script[type="application/ld+json"]');
    if (ldJson && ldJson.textContent) {
      try {
        const data = JSON.parse(ldJson.textContent);
        if (data['@type'] === 'JobPosting' && data.jobLocation) {
          const jobLoc = data.jobLocation;
          if (typeof jobLoc === 'string') {
            possibleLocations.push(jobLoc);
          } else if (jobLoc.address) {
            if (typeof jobLoc.address === 'string') {
              possibleLocations.push(jobLoc.address);
            } else if (jobLoc.address.addressLocality || jobLoc.address.addressRegion) {
              possibleLocations.push([jobLoc.address.addressLocality, jobLoc.address.addressRegion]
                .filter(Boolean)
                .join(', '));
            }
          }
        }
      } catch (e) {
        // Ignore
      }
    }
    
    // 2. Try meta tags
    const getMeta = (name) => {
      const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      return el ? (el.content || '') : '';
    };
    const metaLocation = getMeta('location') || getMeta('job:location') || getMeta('og:location');
    if (metaLocation) possibleLocations.push(metaLocation);
    
    // 3. LinkedIn-specific extraction
    // LinkedIn shows location in specific places - be more targeted
    const linkedinLocationElement = document.querySelector('.jobs-unified-top-card__bullet, .job-details-jobs-unified-top-card__primary-description-without-tagline');
    if (linkedinLocationElement) {
      const text = linkedinLocationElement.textContent.trim();
      if (text && text.length > 0 && text.length < 200) {
        possibleLocations.push(text);
      }
    }
    
    // Also check for city, state in job description
    const jobDescription = document.querySelector('.jobs-description-content, .jobs-description, [class*="job-description"]');
    if (jobDescription) {
      const descText = jobDescription.textContent;
      // Look for "Location: City, State" or "based in City, State"
      const locationInDesc = descText.match(/(?:Location|Based in|Office in|located in)[:\s]+([A-Z][a-z\s]+,\s*[A-Z]{2})/i);
      if (locationInDesc && locationInDesc[1]) {
        possibleLocations.push(locationInDesc[1]);
      }
    }
    
    // 4. Try common selectors
    const locationSelectors = [
      '.job-location',
      '.location',
      '[class*="location"]',
      '[data-testid*="location"]',
      '[itemprop="jobLocation"]',
      '[itemprop="addressLocality"]'
    ];
    
    for (const selector of locationSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent) {
        const text = element.textContent.trim();
        if (text.length > 0 && text.length < 100) {
          possibleLocations.push(text);
        }
      }
    }
    
    // 5. Pattern matching in visible text for city, state patterns
    const bodyText = document.body ? document.body.innerText.substring(0, 5000) : '';
    const cityStatePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b/g;
    let match;
    while ((match = cityStatePattern.exec(bodyText)) !== null) {
      possibleLocations.push(match[0]);
    }
    
    // 6. Filter and prioritize locations
    console.log('All possible locations found:', possibleLocations);
    
    // Extract selected text first
    let selectedText = '';
    try {
      const selection = window.getSelection();
      if (selection && selection.toString()) {
        selectedText = selection.toString().trim();
      }
    } catch (e) {
      console.log('Could not get selection:', e);
    }
    
    // First pass: Look for explicit city, state format
    for (const loc of possibleLocations) {
      if (/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}\b/.test(loc)) {
        console.log('Found city, state format:', loc);
        return {
          location: loc,
          selectedText: selectedText
        };
      }
    }
    
    // Second pass: Extract city/state from sentences
    for (const loc of possibleLocations) {
      const cityStateMatch = loc.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s*([A-Z]{2})\b/);
      if (cityStateMatch) {
        const extracted = `${cityStateMatch[1]}, ${cityStateMatch[2]}`;
        console.log('Extracted from sentence:', extracted, 'from:', loc);
        return {
          location: extracted,
          selectedText: selectedText
        };
      }
    }
    
    // Third pass: Look for well-known city names
    const majorCities = [
      'New York', 'San Francisco', 'Los Angeles', 'Chicago', 'Boston', 
      'Seattle', 'Austin', 'Denver', 'Portland', 'Miami', 'Atlanta',
      'Dallas', 'Houston', 'Philadelphia', 'Phoenix', 'San Diego',
      'Washington', 'London', 'Paris', 'Berlin', 'Tokyo', 'Singapore'
    ];
    
    for (const loc of possibleLocations) {
      for (const city of majorCities) {
        if (loc.includes(city)) {
          console.log('Found major city:', city, 'in:', loc);
          return {
            location: loc,
            selectedText: selectedText
          };
        }
      }
    }
    
    // Fourth pass: Remove workplace types and return first non-remote location
    const workplaceTypes = ['remote', 'hybrid', 'on-site', 'onsite', 'on site'];
    const nonWorkplaceTypes = possibleLocations.filter(loc => {
      const lower = loc.toLowerCase().trim();
      return !workplaceTypes.includes(lower) && loc.length >= 2 && loc.length <= 100;
    });
    
    if (nonWorkplaceTypes.length > 0) {
      console.log('Using first non-workplace type location:', nonWorkplaceTypes[0]);
      return {
        location: nonWorkplaceTypes[0],
        selectedText: selectedText
      };
    }
    
    // Fallback to any location (including "Remote")
    if (possibleLocations.length > 0) {
      console.log('Fallback to first location:', possibleLocations[0]);
      return {
        location: possibleLocations[0],
        selectedText: selectedText
      };
    }
    
    console.log('No location found');
    
    return {
      location: '',
      selectedText: selectedText
    };
  } catch (e) {
    return {
      location: '',
      selectedText: ''
    };
  }
}

/**
 * Proxy OpenAI API requests
 * @param {Object} payload - Request configuration
 * @returns {Promise<Object>} API response
 */
async function handleOpenAIRequest(payload) {
  const { messages, apiKey } = payload;
  
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  console.log('Making OpenAI request...');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json();
  console.log('OpenAI response status:', response.status);

  if (!response.ok) {
    const errorMessage = data.error?.message || `API Error: ${response.status}`;
    
    if (response.status === 401) {
      throw new Error('Invalid OpenAI API key. Please check your credentials.');
    }
    if (response.status === 429) {
      throw new Error('Rate limited. Please wait a moment and try again.');
    }
    if (response.status === 402) {
      throw new Error('OpenAI billing issue. Please check your account.');
    }
    
    throw new Error(errorMessage);
  }

  return { success: true, data };
}

/**
 * Proxy Google Sheets API requests
 * @param {Object} payload - Request configuration
 * @returns {Promise<Object>} API response
 */
async function handleSheetsRequest(payload) {
  const { endpoint, method = 'GET', body, apiKey, spreadsheetId } = payload;
  
  if (!apiKey) {
    throw new Error('Google API key not configured');
  }

  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID not configured');
  }

  const baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  const url = `${baseUrl}/${spreadsheetId}${endpoint}${endpoint.includes('?') ? '&' : '?'}key=${apiKey}`;

  const config = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    config.body = JSON.stringify(body);
  }

  console.log('Making Sheets request:', method, endpoint);

  const response = await fetch(url, config);
  const data = await response.json();

  if (!response.ok) {
    const errorMessage = data.error?.message || `API Error: ${response.status}`;
    
    if (response.status === 403) {
      throw new Error('Access denied. Check your API key and ensure Sheets API is enabled.');
    }
    if (response.status === 404) {
      throw new Error('Spreadsheet not found. Please verify the Spreadsheet ID.');
    }
    if (response.status === 429) {
      throw new Error('Rate limited. Please wait a moment and try again.');
    }
    
    throw new Error(errorMessage);
  }

  return { success: true, data };
}

/**
 * Extract page content from active tab
 * @returns {Promise<Object>} Page content
 */
async function getPageContent() {
  console.log('Getting page content...');
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab || !tab.id) {
    throw new Error('No active tab found');
  }

  console.log('Tab URL:', tab.url);

  // Check if we can access this tab
  const url = tab.url || '';
  if (url.startsWith('chrome://') || 
      url.startsWith('chrome-extension://') || 
      url.startsWith('about:') ||
      url.startsWith('edge://') ||
      url === '') {
    throw new Error('Cannot access content on this page');
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractContent
  });

    console.log('Script executed, results:', results ? 'received' : 'null');

    if (results && results[0] && results[0].result) {
      const content = results[0].result;
      console.log('=== EXTRACTED CONTENT DEBUG ===');
      console.log('Title:', content.title);
      console.log('URL:', content.url);
      console.log('Description:', content.description);
      console.log('Content length:', content.content?.length || 0, 'characters');
      console.log('Content preview (first 300 chars):', content.content?.substring(0, 300));
      console.log('');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('📄 FULL CONTENT EXTRACTED FROM PAGE:');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(content.content);
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('');
      console.log('Has structured data:', !!content.structuredData);
      console.log('================================');
      return content;
    }
  
  throw new Error('Failed to extract page content');
}

/**
 * Content extraction function - runs in page context
 * Must be a standalone function for chrome.scripting.executeScript
 */
function extractContent() {
  try {
    // Get main text content, prioritizing article/main content
    const selectors = [
      'article',
      'main',
      '[role="main"]',
      '.job-description',
      '.description',
      '.content',
      '#content',
      '.post-content',
      '.entry-content',
      '.job-details',
      '.job-info',
      '[class*="job"]',
      '[class*="description"]',
      '[class*="content"]',
      '[id*="content"]',
      '[id*="description"]'
    ];

    let mainContent = '';
    let usedSelector = '';
    
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.innerText) {
        const text = element.innerText.trim();
        if (text.length > mainContent.length) {
          mainContent = text;
          usedSelector = selector;
        }
      }
    }

    // Fallback to body if no main content found or if content is very short
    if ((!mainContent || mainContent.length < 100) && document.body) {
      mainContent = document.body.innerText || '';
      usedSelector = 'body (fallback)';
    }

    // Get meta information
    const getMeta = (name) => {
      const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      return el ? (el.content || '') : '';
    };

    // Extract structured data if available
    let structuredData = null;
    const ldJson = document.querySelector('script[type="application/ld+json"]');
    if (ldJson && ldJson.textContent) {
      try {
        structuredData = JSON.parse(ldJson.textContent);
      } catch (e) {
        // Ignore parsing errors
      }
    }

    // Extract job location
    let location = '';
    
    // 1. Try structured data (schema.org JobPosting)
    if (structuredData) {
      if (structuredData['@type'] === 'JobPosting' && structuredData.jobLocation) {
        const jobLoc = structuredData.jobLocation;
        if (typeof jobLoc === 'string') {
          location = jobLoc;
        } else if (jobLoc.address) {
          if (typeof jobLoc.address === 'string') {
            location = jobLoc.address;
          } else if (jobLoc.address.addressLocality || jobLoc.address.addressRegion) {
            location = [jobLoc.address.addressLocality, jobLoc.address.addressRegion]
              .filter(Boolean)
              .join(', ');
          }
        }
      }
    }
    
    // 2. Try common meta tags
    if (!location) {
      location = getMeta('location') || getMeta('job:location') || getMeta('og:location');
    }
    
    // 3. Try common selectors for job location
    if (!location) {
      const locationSelectors = [
        '.job-location',
        '.location',
        '[class*="location"]',
        '[data-testid*="location"]',
        '[data-test*="location"]',
        '[aria-label*="location"]',
        '.job-info .location',
        '.job-details .location',
        '[itemprop="jobLocation"]',
        '[itemprop="addressLocality"]'
      ];
      
      for (const selector of locationSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent) {
          const text = element.textContent.trim();
          // Only use if it's reasonably short (not a full paragraph)
          if (text.length > 0 && text.length < 100) {
            location = text;
            break;
          }
        }
      }
    }
    
    // 4. Try pattern matching in the page for common location patterns
    if (!location) {
      const locationPatterns = [
        /Location[:\s]+([^•\n]{3,50})/i,
        /📍\s*([^•\n]{3,50})/,
        /\bRemote\b/i,
        /\b(?:San Francisco|New York|Los Angeles|Chicago|Boston|Seattle|Austin|Portland|Denver|Miami|Atlanta|Dallas|Houston|Washington,?\s*D\.?C\.?|London|Paris|Berlin|Tokyo|Singapore|Toronto|Vancouver|Sydney|Melbourne)/i
      ];
      
      for (const pattern of locationPatterns) {
        const match = mainContent.match(pattern);
        if (match) {
          location = match[1] ? match[1].trim() : match[0].trim();
          // Clean up common artifacts
          location = location.replace(/[\n\r\t]+/g, ' ').trim();
          if (location.length > 0 && location.length < 100) {
            break;
          }
        }
      }
    }

    // Truncate content to avoid token limits (roughly 12k chars ≈ 3k tokens)
    const maxLength = 12000;
    if (mainContent.length > maxLength) {
      mainContent = mainContent.substring(0, maxLength) + '... [truncated]';
    }

    return {
      title: document.title || '',
      url: window.location.href || '',
      description: getMeta('description') || getMeta('og:description'),
      content: mainContent,
      structuredData,
      location: location || ''
    };
  } catch (e) {
    return {
      title: document.title || '',
      url: window.location.href || '',
      description: '',
      content: document.body ? document.body.innerText.substring(0, 12000) : '',
      structuredData: null,
      location: ''
    };
  }
}

// Install listener to open options on first install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

/**
 * Handle keyboard shortcuts
 */
chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);
  
  switch (command) {
    case 'open-popup':
      await handleOpenPopup();
      break;
    
    case 'add-details':
      await handleAddDetails();
      break;
    
    case 'quick-save':
      await handleQuickSave();
      break;
  }
});

/**
 * Handle open popup command
 * Try multiple approaches to open the popup
 */
async function handleOpenPopup() {
  console.log('Attempting to open popup...');
  
  // Approach 1: Try to open the popup directly
  try {
    await chrome.action.openPopup();
    console.log('Popup opened successfully');
    return;
  } catch (error) {
    console.log('Cannot open popup directly:', error.message);
  }
  
  // Approach 2: Try to focus existing popup
  try {
    const sent = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'FOCUS_POPUP' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
    
    if (sent) {
      console.log('Focused existing popup');
      return;
    }
  } catch (e) {
    console.log('Could not focus popup');
  }
  
  // Approach 3: Open popup in a new window (as fallback)
  try {
    const popupUrl = chrome.runtime.getURL('popup/popup.html');
    const window = await chrome.windows.create({
      url: popupUrl,
      type: 'popup',
      width: 400,
      height: 600,
      focused: true
    });
    console.log('Opened popup in new window');
    return;
  } catch (error) {
    console.log('Could not open popup window:', error.message);
  }
  
  // Approach 4: Show badge as last resort
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#4285f4' });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 3000);
  console.log('Popup could not be opened - showing badge notification');
}

/**
 * Handle add details command
 * Sends message to popup if open, otherwise shows notification
 */
async function handleAddDetails() {
  // Try to send message to popup
  // Note: This will only work if popup is already open
  try {
    chrome.runtime.sendMessage({ type: 'TRIGGER_ADD_DETAILS' }, (response) => {
      if (chrome.runtime.lastError) {
        // Popup not open or no listener
        console.log('Popup not open for Add Details command');
        showNotification('Please open the extension popup first, then use Ctrl+Shift+E');
      } else {
        console.log('Add Details triggered successfully');
      }
    });
  } catch (error) {
    console.error('Error handling Add Details command:', error);
    showNotification('Please open the extension popup first, then use Ctrl+Shift+U');
  }
}

/**
 * Handle quick save command
 * Sends message to popup if open, otherwise shows notification
 */
async function handleQuickSave() {
  // Try to send message to popup
  // Note: This will only work if popup is already open
  try {
    chrome.runtime.sendMessage({ type: 'TRIGGER_QUICK_SAVE' }, (response) => {
      if (chrome.runtime.lastError) {
        // Popup not open or no listener
        console.log('Popup not open for Quick Save command');
        showNotification('Please open the extension popup first, then use Ctrl+Shift+Y');
      } else {
        console.log('Quick Save triggered successfully');
      }
    });
  } catch (error) {
    console.error('Error handling Quick Save command:', error);
        showNotification('Please open the extension popup first, then use Ctrl+Shift+Y');
  }
}

/**
 * Show a notification to the user
 * @param {string} message - Message to display
 */
function showNotification(message) {
  // Try to show a badge as visual feedback
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#4285f4' });
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 3000);
  
  // Also log to console for debugging
  console.log('Notification:', message);
}
