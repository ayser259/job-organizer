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
 * Get active tab URL and title
 * @returns {Promise<Object>} Tab information
 */
async function getActiveTabInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab) {
    throw new Error('No active tab found');
  }

  return {
    url: tab.url || '',
    title: tab.title || ''
  };
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
      structuredData
    };
  } catch (e) {
    return {
      title: document.title || '',
      url: window.location.href || '',
      description: '',
      content: document.body ? document.body.innerText.substring(0, 12000) : '',
      structuredData: null
    };
  }
}

// Install listener to open options on first install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});
