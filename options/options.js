/**
 * Options Page Script
 * Handles credential configuration and connection testing
 */

// DOM Elements
const settingsForm = document.getElementById('settingsForm');
const notionSecretInput = document.getElementById('notionSecret');
const databaseIdInput = document.getElementById('databaseId');
const toggleSecretBtn = document.getElementById('toggleSecret');
const testBtn = document.getElementById('testBtn');
const saveBtn = document.getElementById('saveBtn');

// Google Sheets Elements
const sheetsEnabledCheckbox = document.getElementById('sheetsEnabled');
const sheetsConfig = document.getElementById('sheetsConfig');
const sheetsApiKeyInput = document.getElementById('sheetsApiKey');
const spreadsheetIdInput = document.getElementById('spreadsheetId');
const sheetNameInput = document.getElementById('sheetName');
const toggleSheetsBtn = document.getElementById('toggleSheets');
const sheetsDot = document.getElementById('sheetsDot');
const sheetsStatusText = document.getElementById('sheetsStatusText');

// OpenAI Elements
const openaiApiKeyInput = document.getElementById('openaiApiKey');
const toggleOpenAIBtn = document.getElementById('toggleOpenAI');
const openaiDot = document.getElementById('openaiDot');
const openaiStatusText = document.getElementById('openaiStatusText');

// Status elements
const statusCard = document.getElementById('statusCard');
const statusIndicator = document.getElementById('statusIndicator');
const statusDetails = document.getElementById('statusDetails');
const connectedDbName = document.getElementById('connectedDbName');
const propertyCount = document.getElementById('propertyCount');

// Toast
const toast = document.getElementById('toast');

/**
 * Initialize the options page
 */
async function init() {
  await loadSavedSettings();
  setupEventListeners();
}

/**
 * Load saved settings from chrome storage
 */
async function loadSavedSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'notionSecret', 
      'databaseId', 
      'openaiApiKey',
      'sheetsEnabled',
      'sheetsApiKey',
      'spreadsheetId',
      'sheetName'
    ], (result) => {
      if (result.notionSecret) {
        notionSecretInput.value = result.notionSecret;
      }
      if (result.databaseId) {
        databaseIdInput.value = result.databaseId;
      }
      if (result.openaiApiKey) {
        openaiApiKeyInput.value = result.openaiApiKey;
        updateOpenAIStatus('configured');
      }
      
      // Load Google Sheets settings
      if (result.sheetsEnabled !== undefined) {
        sheetsEnabledCheckbox.checked = result.sheetsEnabled;
        if (result.sheetsEnabled) {
          sheetsConfig.classList.remove('hidden');
        }
      }
      if (result.sheetsApiKey) {
        sheetsApiKeyInput.value = result.sheetsApiKey;
        updateSheetsStatus('configured');
      }
      if (result.spreadsheetId) {
        spreadsheetIdInput.value = result.spreadsheetId;
      }
      if (result.sheetName) {
        sheetNameInput.value = result.sheetName;
      }
      
      // If we have saved credentials, test the connection
      if (result.notionSecret && result.databaseId) {
        testConnection(true); // Silent mode
      }
      
      resolve();
    });
  });
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Toggle secret visibility
  toggleSecretBtn.addEventListener('click', () => {
    const isPassword = notionSecretInput.type === 'password';
    notionSecretInput.type = isPassword ? 'text' : 'password';
    
    const eyeOpen = toggleSecretBtn.querySelector('.eye-open');
    const eyeClosed = toggleSecretBtn.querySelector('.eye-closed');
    eyeOpen.classList.toggle('hidden');
    eyeClosed.classList.toggle('hidden');
  });

  // Toggle Google Sheets config visibility
  sheetsEnabledCheckbox.addEventListener('change', () => {
    if (sheetsEnabledCheckbox.checked) {
      sheetsConfig.classList.remove('hidden');
    } else {
      sheetsConfig.classList.add('hidden');
    }
  });

  // Toggle Sheets key visibility
  toggleSheetsBtn.addEventListener('click', () => {
    const isPassword = sheetsApiKeyInput.type === 'password';
    sheetsApiKeyInput.type = isPassword ? 'text' : 'password';
    
    const eyeOpen = toggleSheetsBtn.querySelector('.eye-open');
    const eyeClosed = toggleSheetsBtn.querySelector('.eye-closed');
    eyeOpen.classList.toggle('hidden');
    eyeClosed.classList.toggle('hidden');
  });

  // Update Sheets status on input
  sheetsApiKeyInput.addEventListener('input', () => {
    const value = sheetsApiKeyInput.value.trim();
    if (value && value.startsWith('AIza')) {
      updateSheetsStatus('ready');
    } else if (value) {
      updateSheetsStatus('invalid');
    } else {
      updateSheetsStatus('empty');
    }
  });

  // Toggle OpenAI key visibility
  toggleOpenAIBtn.addEventListener('click', () => {
    const isPassword = openaiApiKeyInput.type === 'password';
    openaiApiKeyInput.type = isPassword ? 'text' : 'password';
    
    const eyeOpen = toggleOpenAIBtn.querySelector('.eye-open');
    const eyeClosed = toggleOpenAIBtn.querySelector('.eye-closed');
    eyeOpen.classList.toggle('hidden');
    eyeClosed.classList.toggle('hidden');
  });

  // Update OpenAI status on input
  openaiApiKeyInput.addEventListener('input', () => {
    const value = openaiApiKeyInput.value.trim();
    if (value && value.startsWith('sk-')) {
      updateOpenAIStatus('ready');
    } else if (value) {
      updateOpenAIStatus('invalid');
    } else {
      updateOpenAIStatus('empty');
    }
  });

  // Test connection
  testBtn.addEventListener('click', () => testConnection(false));

  // Save settings
  settingsForm.addEventListener('submit', handleSave);

  // Auto-format database ID
  databaseIdInput.addEventListener('input', (e) => {
    // Remove any non-alphanumeric characters except hyphens
    let value = e.target.value.replace(/[^a-zA-Z0-9-]/g, '');
    
    // If it looks like a Notion URL, extract the ID
    if (value.includes('notion')) {
      const match = value.match(/([a-f0-9]{32})/i);
      if (match) {
        value = match[1];
      }
    }
    
    e.target.value = value;
  });
}

/**
 * Update Google Sheets status indicator
 * @param {string} state - 'configured', 'ready', 'invalid', 'empty'
 */
function updateSheetsStatus(state) {
  sheetsDot.classList.remove('connected', 'error', 'loading');
  
  switch (state) {
    case 'configured':
      sheetsDot.classList.add('connected');
      sheetsStatusText.textContent = 'API key configured';
      break;
    case 'ready':
      sheetsDot.classList.add('loading');
      sheetsStatusText.textContent = 'Ready to save';
      break;
    case 'invalid':
      sheetsDot.classList.add('error');
      sheetsStatusText.textContent = 'Key should start with "AIza"';
      break;
    case 'empty':
    default:
      sheetsStatusText.textContent = 'Not configured';
      break;
  }
}

/**
 * Update OpenAI status indicator
 * @param {string} state - 'configured', 'ready', 'invalid', 'empty'
 */
function updateOpenAIStatus(state) {
  openaiDot.classList.remove('connected', 'error', 'loading');
  
  switch (state) {
    case 'configured':
      openaiDot.classList.add('connected');
      openaiStatusText.textContent = 'API key configured';
      break;
    case 'ready':
      openaiDot.classList.add('loading');
      openaiStatusText.textContent = 'Ready to save';
      break;
    case 'invalid':
      openaiDot.classList.add('error');
      openaiStatusText.textContent = 'Key should start with "sk-"';
      break;
    case 'empty':
    default:
      openaiStatusText.textContent = 'Not configured';
      break;
  }
}

/**
 * Test connection to Notion API
 * @param {boolean} silent - Whether to suppress UI notifications
 */
async function testConnection(silent = false) {
  const secret = notionSecretInput.value.trim();
  const databaseId = databaseIdInput.value.trim();

  if (!secret || !databaseId) {
    if (!silent) {
      showToast('Please fill in both fields', 'error');
    }
    return;
  }

  // Update status to loading
  updateStatus('loading', 'Testing connection...');

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'NOTION_API_REQUEST',
          payload: {
            endpoint: `/databases/${databaseId}`,
            method: 'GET',
            secret: secret
          }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (response.error) {
            reject(new Error(response.error));
            return;
          }
          
          resolve(response.data);
        }
      );
    });

    // Success - update status with database info
    const dbTitle = response.title?.[0]?.plain_text || 'Untitled Database';
    const propCount = Object.keys(response.properties || {}).length;
    
    updateStatus('connected', 'Connected', {
      name: dbTitle,
      properties: propCount
    });

    if (!silent) {
      showToast('Connection successful!', 'success');
    }

  } catch (error) {
    updateStatus('error', error.message);
    
    if (!silent) {
      showToast(error.message, 'error');
    }
  }
}

/**
 * Update connection status display
 * @param {string} state - 'connected', 'error', 'loading', or 'disconnected'
 * @param {string} message - Status message
 * @param {Object} details - Optional details for connected state
 */
function updateStatus(state, message, details = null) {
  const dot = statusIndicator.querySelector('.status-dot');
  const text = statusIndicator.querySelector('.status-text');
  
  // Remove existing state classes
  dot.classList.remove('connected', 'error', 'loading');
  
  // Add new state class
  if (state !== 'disconnected') {
    dot.classList.add(state);
  }
  
  text.textContent = message;
  
  // Show/hide details
  if (details && state === 'connected') {
    connectedDbName.textContent = details.name;
    propertyCount.textContent = `${details.properties} properties detected`;
    statusDetails.classList.remove('hidden');
  } else {
    statusDetails.classList.add('hidden');
  }
}

/**
 * Handle form save
 * @param {Event} e - Submit event
 */
async function handleSave(e) {
  e.preventDefault();

  const secret = notionSecretInput.value.trim();
  const databaseId = databaseIdInput.value.trim();
  const openaiKey = openaiApiKeyInput.value.trim();
  
  // Google Sheets values
  const sheetsEnabled = sheetsEnabledCheckbox.checked;
  const sheetsApiKey = sheetsApiKeyInput.value.trim();
  const spreadsheetId = spreadsheetIdInput.value.trim();
  const sheetName = sheetNameInput.value.trim() || 'Sheet1';

  if (!secret || !databaseId) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  // Validate Notion secret format
  if (!secret.startsWith('secret_') && !secret.startsWith('ntn_')) {
    showToast('Integration secret should start with "secret_" or "ntn_"', 'error');
    return;
  }

  // Validate OpenAI key format if provided
  if (openaiKey && !openaiKey.startsWith('sk-')) {
    showToast('OpenAI API key should start with "sk-"', 'error');
    return;
  }

  // Validate Sheets config if enabled
  if (sheetsEnabled) {
    if (!sheetsApiKey || !spreadsheetId) {
      showToast('Google Sheets requires both API key and Spreadsheet ID', 'error');
      return;
    }
    if (!sheetsApiKey.startsWith('AIza')) {
      showToast('Google API key should start with "AIza"', 'error');
      return;
    }
  }

  // Disable button during save
  saveBtn.disabled = true;

  try {
    // Build storage object
    const storageData = {
      notionSecret: secret,
      databaseId: databaseId,
      sheetsEnabled: sheetsEnabled
    };
    
    // Include OpenAI key if provided
    if (openaiKey) {
      storageData.openaiApiKey = openaiKey;
    } else {
      // Remove existing key if cleared
      await new Promise((resolve) => {
        chrome.storage.local.remove('openaiApiKey', resolve);
      });
    }

    // Include Google Sheets credentials if enabled
    if (sheetsEnabled) {
      storageData.sheetsApiKey = sheetsApiKey;
      storageData.spreadsheetId = spreadsheetId;
      storageData.sheetName = sheetName;
    } else {
      // Remove existing Sheets credentials if disabled
      await new Promise((resolve) => {
        chrome.storage.local.remove(['sheetsApiKey', 'spreadsheetId', 'sheetName'], resolve);
      });
    }

    // Save to chrome storage
    await new Promise((resolve, reject) => {
      chrome.storage.local.set(storageData, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });

    showToast('Settings saved successfully!', 'success');
    
    // Update OpenAI status
    if (openaiKey) {
      updateOpenAIStatus('configured');
    } else {
      updateOpenAIStatus('empty');
    }
    
    // Update Sheets status
    if (sheetsEnabled && sheetsApiKey) {
      updateSheetsStatus('configured');
    } else {
      updateSheetsStatus('empty');
    }
    
    // Test the connection after saving
    await testConnection(true);

  } catch (error) {
    showToast(`Failed to save: ${error.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {string} type - 'success' or 'error'
 */
function showToast(message, type) {
  const toastMessage = toast.querySelector('.toast-message');
  
  // Remove existing type classes
  toast.classList.remove('success', 'error', 'hidden');
  
  // Add new type class
  toast.classList.add(type);
  toastMessage.textContent = message;
  
  // Show toast
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });
  
  // Hide after delay
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 300);
  }, 3000);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', init);

