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
    chrome.storage.local.get(['notionSecret', 'databaseId'], (result) => {
      if (result.notionSecret) {
        notionSecretInput.value = result.notionSecret;
      }
      if (result.databaseId) {
        databaseIdInput.value = result.databaseId;
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

  if (!secret || !databaseId) {
    showToast('Please fill in all required fields', 'error');
    return;
  }

  // Validate format
  if (!secret.startsWith('secret_') && !secret.startsWith('ntn_')) {
    showToast('Integration secret should start with "secret_" or "ntn_"', 'error');
    return;
  }

  // Disable button during save
  saveBtn.disabled = true;

  try {
    // Save to chrome storage
    await new Promise((resolve, reject) => {
      chrome.storage.local.set(
        {
          notionSecret: secret,
          databaseId: databaseId
        },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        }
      );
    });

    showToast('Settings saved successfully!', 'success');
    
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

