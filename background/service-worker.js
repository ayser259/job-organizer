/**
 * Background Service Worker
 * Handles Notion API requests to keep the Integration Secret secure
 * Acts as a proxy between the popup and Notion API
 */

// Message handler for API requests from popup/options
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'NOTION_API_REQUEST') {
    handleNotionRequest(request.payload)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true; // Required for async sendResponse
  }
  
  if (request.type === 'GET_TAB_INFO') {
    getActiveTabInfo()
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

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

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      // Handle specific Notion API errors
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
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error. Please check your internet connection.');
    }
    throw error;
  }
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

// Install listener to open options on first install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

