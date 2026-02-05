/**
 * Popup Script - Dynamic Form Rendering Engine
 * Handles schema fetching, form generation, and page creation
 */

import { NotionAPI, PropertyFormatters, PropertyParsers, parseNotionPage, getTabInfo, OpenAIHelper } from '../lib/notion-api.js';

// DOM Elements
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const successState = document.getElementById('successState');
const clipperForm = document.getElementById('clipperForm');
const formFields = document.getElementById('formFields');
const footer = document.getElementById('footer');
const dbName = document.getElementById('dbName');
const aiLoadingOverlay = document.getElementById('aiLoadingOverlay');

// Buttons
const settingsBtn = document.getElementById('settingsBtn');
const refreshBtn = document.getElementById('refreshBtn');
const configureBtn = document.getElementById('configureBtn');
const submitBtn = document.getElementById('submitBtn');
const quickSaveBtn = document.getElementById('quickSaveBtn');
const viewPageBtn = document.getElementById('viewPageBtn');
const addAnotherBtn = document.getElementById('addAnotherBtn');
const errorMessage = document.getElementById('errorMessage');
const aiBtn = document.getElementById('aiBtn');
const toast = document.getElementById('toast');
const customizeBtn = document.getElementById('customizeBtn');
const customizeModal = document.getElementById('customizeModal');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const cancelCustomize = document.getElementById('cancelCustomize');
const saveCustomize = document.getElementById('saveCustomize');
const customizeFieldsList = document.getElementById('customizeFieldsList');
const helpBtn = document.getElementById('helpBtn');
const shortcutsModal = document.getElementById('shortcutsModal');
const shortcutsModalOverlay = document.getElementById('shortcutsModalOverlay');
const shortcutsModalClose = document.getElementById('shortcutsModalClose');
const closeShortcutsBtn = document.getElementById('closeShortcutsBtn');
const debugModal = document.getElementById('debugModal');
const debugModalOverlay = document.getElementById('debugModalOverlay');
const debugModalClose = document.getElementById('debugModalClose');
const closeDebugBtn = document.getElementById('closeDebugBtn');
const copyDebugBtn = document.getElementById('copyDebugBtn');
const debugBtn = document.getElementById('debugBtn');
const aiInputModal = document.getElementById('aiInputModal');
const aiInputModalOverlay = document.getElementById('aiInputModalOverlay');
const aiInputModalClose = document.getElementById('aiInputModalClose');
const aiInputTextarea = document.getElementById('aiInputTextarea');
const cancelAiInput = document.getElementById('cancelAiInput');
const submitAiInput = document.getElementById('submitAiInput');
const charCount = document.getElementById('charCount');

// State
let notionApi = null;
let openaiHelper = null;
let databaseSchema = null;
let tabInfo = null;
let hasOpenAI = false;
let hiddenFields = new Set(); // Track which fields are hidden
let fieldOrder = []; // Track custom field order
let existingPageId = null; // Track if we're editing an existing page
let existingPageData = null; // Store existing page data

/**
 * Find URL field in database schema
 * @param {Object} schema - Database schema
 * @returns {string|null} URL field name or null
 */
function findUrlField(schema) {
  for (const [name, property] of Object.entries(schema.properties)) {
    if (property.type === 'url') {
      return name;
    }
  }
  return null;
}

/**
 * Load cached database schema from storage
 * @param {string} currentDatabaseId - Current database ID to validate cache
 * @returns {Promise<Object|null>} Cached schema or null
 */
async function loadCachedSchema(currentDatabaseId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['databaseSchema', 'databaseSchemaTimestamp', 'cachedDatabaseId'], (result) => {
      if (result.databaseSchema && result.databaseSchemaTimestamp) {
        // Check if database ID matches
        if (result.cachedDatabaseId !== currentDatabaseId) {
          console.log('Database ID changed, invalidating cache');
          resolve(null);
          return;
        }
        
        const cacheAge = Date.now() - result.databaseSchemaTimestamp;
        const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
        
        if (cacheAge < CACHE_DURATION) {
          console.log(`Using cached schema (age: ${Math.round(cacheAge / 1000)}s)`);
          resolve(result.databaseSchema);
          return;
        }
      }
      resolve(null);
    });
  });
}

/**
 * Cache database schema to storage
 * @param {Object} schema - Database schema to cache
 * @param {string} databaseId - Database ID for cache validation
 */
async function cacheSchema(schema, databaseId) {
  return new Promise((resolve) => {
    chrome.storage.local.set({
      databaseSchema: schema,
      databaseSchemaTimestamp: Date.now(),
      cachedDatabaseId: databaseId
    }, resolve);
  });
}

/**
 * Check for existing entry with same URL
 */
async function checkForExistingEntry() {
  if (!tabInfo.url || !databaseSchema) {
    return;
  }

  try {
    // Find URL field in schema
    const urlField = findUrlField(databaseSchema);
    if (!urlField) {
      console.log('No URL field found in database schema');
      return;
    }

    console.log(`Checking for existing entry with URL: ${tabInfo.url}`);
    
    // Query for existing page with this URL
    const existingPage = await notionApi.findPageByUrl(tabInfo.url, urlField);
    
    if (existingPage) {
      console.log('Found existing entry:', existingPage.id);
      existingPageId = existingPage.id;
      existingPageData = parseNotionPage(existingPage, databaseSchema);
      console.log('Parsed existing data:', existingPageData);
    } else {
      console.log('No existing entry found');
      existingPageId = null;
      existingPageData = null;
    }
  } catch (error) {
    console.error('Error checking for existing entry:', error);
    // Don't throw - just continue with new entry
    existingPageId = null;
    existingPageData = null;
  }
}

/**
 * Initialize the extension popup
 */
async function init() {
  setupEventListeners();
  
  try {
    // Concurrent data fetching
    notionApi = new NotionAPI();
    openaiHelper = new OpenAIHelper();
    
    // Load credentials first to get database ID for cache validation
    const credentials = await notionApi.loadCredentials().catch(e => ({ error: e.message }));
    
    if (credentials.error === 'CREDENTIALS_NOT_CONFIGURED') {
      showError('Please configure your Notion credentials to get started.');
      return;
    }
    
    if (credentials.error) {
      showError(credentials.error);
      return;
    }

    // Now load other data and cached schema in parallel
    const [tabData, openaiKey, cachedSchema] = await Promise.all([
      getTabInfo().catch(e => ({ error: e.message })),
      openaiHelper.loadApiKey().catch(e => ({ error: e.message })),
      loadCachedSchema(notionApi.credentials.databaseId)
    ]);

    // Check if OpenAI is configured
    hasOpenAI = !openaiKey.error;

    tabInfo = tabData.error ? { url: '', title: '' } : tabData;
    
    // Debug: Log extracted information
    console.log('=== TAB INFO LOADED ===');
    console.log('Title:', tabInfo.title || '(empty)');
    console.log('Role Name:', tabInfo.roleName || '(not extracted)');
    console.log('Company Name:', tabInfo.companyName || '(not extracted)');
    console.log('Location:', tabInfo.location || '(not extracted)');
    console.log('URL:', tabInfo.url || '(empty)');
    console.log('Selected Text:', tabInfo.selectedText ? `${tabInfo.selectedText.substring(0, 100)}${tabInfo.selectedText.length > 100 ? '...' : ''}` : '(none)');
    console.log('======================');

    // Use cached schema if available for immediate rendering
    if (cachedSchema) {
      databaseSchema = cachedSchema;
      
      // Show refresh button since we're using cached schema
      if (refreshBtn) {
        refreshBtn.classList.remove('hidden');
      }
      
      // Load preferences and render form immediately with cached schema
      await Promise.all([
        loadHiddenFields(),
        loadFieldOrder()
      ]);
      
      // Check for existing entry with same URL
      await checkForExistingEntry();
      
      // Render form with cached schema
      renderForm(databaseSchema, tabInfo);
      updateSubmitButton();
      showForm();
      
      // Show AI button if configured
      if (hasOpenAI) {
        aiBtn.classList.remove('hidden');
        debugBtn.classList.remove('hidden');
      }
      
      // Update footer
      dbName.textContent = databaseSchema.title?.[0]?.plain_text || 'Untitled Database';
      footer.classList.remove('hidden');
    }

    // Fetch fresh database schema in the background
    try {
      const freshSchema = await notionApi.getDatabase();
      
      // Only update if schema actually changed
      const schemaChanged = !databaseSchema || 
        JSON.stringify(databaseSchema.properties) !== JSON.stringify(freshSchema.properties);
      
      if (schemaChanged) {
        console.log('Schema changed, updating cache and form');
        databaseSchema = freshSchema;
        await cacheSchema(freshSchema, notionApi.credentials.databaseId);
        
        // Re-render form with fresh schema if it changed
        if (databaseSchema) {
          renderForm(databaseSchema, tabInfo);
          dbName.textContent = databaseSchema.title?.[0]?.plain_text || 'Untitled Database';
          
          // Re-check for existing entry with fresh schema
          await checkForExistingEntry();
          renderForm(databaseSchema, tabInfo);
          updateSubmitButton();
        }
      } else {
        // Update cache timestamp even if schema didn't change
        await cacheSchema(freshSchema, notionApi.credentials.databaseId);
      }
      
      // Hide refresh button after fresh schema is loaded
      if (refreshBtn) {
        refreshBtn.classList.add('hidden');
      }
    } catch (error) {
      console.error('Error fetching fresh schema:', error);
      // Don't fail if we have cached schema - just log the error
      if (!cachedSchema) {
        throw error; // Only throw if we don't have cached schema
      }
    }

    // If we didn't have cached schema, initialize now
    if (!cachedSchema) {
      // Load preferences
      await Promise.all([
        loadHiddenFields(),
        loadFieldOrder()
      ]);
      
      // Check for existing entry with same URL
      await checkForExistingEntry();
      
      // Render form
      renderForm(databaseSchema, tabInfo);
      updateSubmitButton();
      showForm();
      
      // Show AI button if configured
      if (hasOpenAI) {
        aiBtn.classList.remove('hidden');
        debugBtn.classList.remove('hidden');
      }
      
      // Update footer
      dbName.textContent = databaseSchema.title?.[0]?.plain_text || 'Untitled Database';
      footer.classList.remove('hidden');
    }

  } catch (error) {
    console.error('Initialization error:', error);
    showError(error.message);
  }
}

/**
 * Refresh database schema manually
 */
async function refreshSchema() {
  if (!notionApi || !refreshBtn) return;
  
  // Show loading state
  refreshBtn.disabled = true;
  refreshBtn.classList.add('refreshing');
  
  try {
    // Fetch fresh schema
    const freshSchema = await notionApi.getDatabase();
    
    // Update cache
    await cacheSchema(freshSchema, notionApi.credentials.databaseId);
    
    // Update schema
    databaseSchema = freshSchema;
    
    // Re-render form with fresh schema
    await Promise.all([
      loadHiddenFields(),
      loadFieldOrder()
    ]);
    
    // Re-check for existing entry
    await checkForExistingEntry();
    
    // Render form
    renderForm(databaseSchema, tabInfo);
    updateSubmitButton();
    
    // Update footer
    dbName.textContent = databaseSchema.title?.[0]?.plain_text || 'Untitled Database';
    
    // Hide refresh button since we now have fresh schema
    refreshBtn.classList.add('hidden');
    
    showToast('Schema refreshed', 'success');
  } catch (error) {
    console.error('Error refreshing schema:', error);
    showToast('Failed to refresh schema', 'error');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.classList.remove('refreshing');
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  configureBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshSchema);
  }

  addAnotherBtn.addEventListener('click', () => {
    resetForm();
    showForm();
  });

  clipperForm.addEventListener('submit', handleSubmit);
  
  aiBtn.addEventListener('click', handleAiFill);
  
  // Listen for messages from background service worker (keyboard shortcuts)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Popup received message:', request.type);
    
    if (request.type === 'TRIGGER_ADD_DETAILS') {
      // Trigger Add Details action
      // Ensure form is visible and ready
      if (clipperForm && clipperForm.classList.contains('hidden')) {
        showForm();
      }
      // Wait a bit for form to be ready, then trigger
      setTimeout(() => {
        if (aiBtn && !aiBtn.disabled && !aiBtn.classList.contains('hidden')) {
          handleAiFill();
          if (sendResponse) sendResponse({ success: true });
        } else {
          if (sendResponse) sendResponse({ success: false, error: 'Add Details button not available' });
        }
      }, 100);
      return true; // Indicates we will send a response asynchronously
    } else if (request.type === 'TRIGGER_QUICK_SAVE') {
      // Trigger Quick Save action
      if (quickSaveBtn && !quickSaveBtn.disabled && clipperForm) {
        // Ensure form is visible and ready
        if (clipperForm.classList.contains('hidden')) {
          showForm();
        }
        // Trigger form submission
        try {
          const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
          clipperForm.dispatchEvent(submitEvent);
          if (sendResponse) sendResponse({ success: true });
        } catch (error) {
          console.error('Error triggering Quick Save:', error);
          if (sendResponse) sendResponse({ success: false, error: error.message });
        }
      } else {
        if (sendResponse) sendResponse({ success: false, error: 'Quick Save not available' });
      }
      return true; // Indicates we will send a response asynchronously
    } else if (request.type === 'FOCUS_POPUP') {
      // Focus the popup window
      window.focus();
      if (sendResponse) sendResponse({ success: true });
      return true;
    }
    
    return false; // Not handled
  });
  
  // Customize modal
  customizeBtn.addEventListener('click', openCustomizeModal);
  modalOverlay.addEventListener('click', closeCustomizeModal);
  modalClose.addEventListener('click', closeCustomizeModal);
  cancelCustomize.addEventListener('click', closeCustomizeModal);
  saveCustomize.addEventListener('click', saveCustomizeOrder);
  
  // Shortcuts modal
  if (helpBtn) {
    helpBtn.addEventListener('click', openShortcutsModal);
  }
  if (shortcutsModalOverlay) {
    shortcutsModalOverlay.addEventListener('click', closeShortcutsModal);
  }
  if (shortcutsModalClose) {
    shortcutsModalClose.addEventListener('click', closeShortcutsModal);
  }
  if (closeShortcutsBtn) {
    closeShortcutsBtn.addEventListener('click', closeShortcutsModal);
  }
  
  // Debug modal
  if (debugModalOverlay) {
    debugModalOverlay.addEventListener('click', closeDebugModal);
  }
  if (debugModalClose) {
    debugModalClose.addEventListener('click', closeDebugModal);
  }
  if (closeDebugBtn) {
    closeDebugBtn.addEventListener('click', closeDebugModal);
  }
  if (copyDebugBtn) {
    copyDebugBtn.addEventListener('click', copyDebugContent);
  }
  if (debugBtn) {
    debugBtn.addEventListener('click', () => {
      if (window.lastExtractedContent) {
        showDebugModal(window.lastExtractedContent);
      } else {
        showToast('No content extracted yet. Click Add Details first.', 'error');
      }
    });
  }
  
  // AI Input modal
  if (aiInputModalOverlay) {
    aiInputModalOverlay.addEventListener('click', closeAiInputModal);
  }
  if (aiInputModalClose) {
    aiInputModalClose.addEventListener('click', closeAiInputModal);
  }
  if (cancelAiInput) {
    cancelAiInput.addEventListener('click', closeAiInputModal);
  }
  if (submitAiInput) {
    submitAiInput.addEventListener('click', handleAiInputSubmit);
  }
  if (aiInputTextarea && charCount) {
    aiInputTextarea.addEventListener('input', () => {
      const count = aiInputTextarea.value.trim().length;
      charCount.textContent = aiInputTextarea.value.length.toLocaleString();
      submitAiInput.disabled = count === 0;
    });
  }
  
  // Hidden fields toggle
  const hiddenFieldsToggle = document.getElementById('hiddenFieldsToggle');
  const hiddenFieldsList = document.getElementById('hiddenFieldsList');
  if (hiddenFieldsToggle) {
    hiddenFieldsToggle.addEventListener('click', () => {
      hiddenFieldsList.classList.toggle('hidden');
      const icon = hiddenFieldsToggle.querySelector('svg');
      icon.style.transform = hiddenFieldsList.classList.contains('hidden') 
        ? 'rotate(0deg)' 
        : 'rotate(180deg)';
    });
  }
}

/**
 * Show loading state
 */
function showLoading() {
  loadingState.classList.remove('hidden');
  errorState.classList.add('hidden');
  successState.classList.add('hidden');
  clipperForm.classList.add('hidden');
}

/**
 * Show error state
 * @param {string} message - Error message to display
 */
function showError(message) {
  loadingState.classList.add('hidden');
  errorState.classList.remove('hidden');
  successState.classList.add('hidden');
  clipperForm.classList.add('hidden');
  errorMessage.textContent = message;
}

/**
 * Show success state
 * @param {string} pageUrl - URL of the created page
 */
function showSuccess(pageUrl) {
  loadingState.classList.add('hidden');
  errorState.classList.add('hidden');
  successState.classList.remove('hidden');
  clipperForm.classList.add('hidden');
  viewPageBtn.href = pageUrl;
}

/**
 * Show form
 */
function showForm() {
  loadingState.classList.add('hidden');
  errorState.classList.add('hidden');
  successState.classList.add('hidden');
  clipperForm.classList.remove('hidden');
}

/**
 * Update submit button text based on edit/create mode
 */
function updateSubmitButton() {
  const btnText = submitBtn.querySelector('.btn-text');
  const quickBtnText = quickSaveBtn.querySelector('.btn-text');
  if (existingPageId) {
    btnText.textContent = 'Update in Notion';
    quickBtnText.textContent = 'Quick Update';
  } else {
    btnText.textContent = 'Save to Notion';
    quickBtnText.textContent = 'Quick Save';
  }
}

/**
 * Reset form to initial state
 */
function resetForm() {
  // Clear existing page data
  existingPageId = null;
  existingPageData = null;
  
  // Re-render form with fresh tab data
  if (databaseSchema && tabInfo) {
    renderForm(databaseSchema, tabInfo);
    updateSubmitButton();
  }
}

/**
 * Property type priority for sorting
 */
const TYPE_PRIORITY = {
  'title': 1,
  'url': 2,
  'select': 3,
  'status': 4,
  'multi_select': 5,
  'rich_text': 6,
  'number': 7,
  'date': 8,
  'checkbox': 9,
  'email': 10,
  'phone_number': 11
};

/**
 * Load hidden fields from storage
 */
async function loadHiddenFields() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['hiddenFields'], (result) => {
      if (result.hiddenFields && Array.isArray(result.hiddenFields)) {
        hiddenFields = new Set(result.hiddenFields);
      }
      resolve();
    });
  });
}

/**
 * Save hidden fields to storage
 */
async function saveHiddenFields() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ hiddenFields: Array.from(hiddenFields) }, resolve);
  });
}

/**
 * Load field order from storage
 */
async function loadFieldOrder() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['fieldOrder'], (result) => {
      if (result.fieldOrder && Array.isArray(result.fieldOrder)) {
        fieldOrder = result.fieldOrder;
      } else {
        fieldOrder = [];
      }
      resolve();
    });
  });
}

/**
 * Save field order to storage
 */
async function saveFieldOrder() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ fieldOrder: fieldOrder }, resolve);
  });
}

/**
 * Toggle field visibility
 * @param {string} fieldName - Name of the field to toggle
 */
async function toggleFieldVisibility(fieldName) {
  if (hiddenFields.has(fieldName)) {
    hiddenFields.delete(fieldName);
    // When unhiding, add to end of order if not already present
    if (!fieldOrder.includes(fieldName)) {
      fieldOrder.push(fieldName);
      await saveFieldOrder();
    }
  } else {
    hiddenFields.add(fieldName);
    // When hiding, remove from order
    fieldOrder = fieldOrder.filter(name => name !== fieldName);
    await saveFieldOrder();
  }
  
  await saveHiddenFields();
  
  // Re-render form to reflect changes
  renderForm(databaseSchema, tabInfo);
}

/**
 * Render the dynamic form based on database schema
 * @param {Object} schema - Notion database schema
 * @param {Object} tab - Current tab info
 */
function renderForm(schema, tab) {
  formFields.innerHTML = '';
  
  // Add editing indicator if we're editing an existing entry
  if (existingPageId) {
    const editingBanner = document.createElement('div');
    editingBanner.className = 'editing-banner';
    editingBanner.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
      <span>Editing existing entry</span>
    `;
    formFields.appendChild(editingBanner);
  }
  
  const properties = schema.properties;
  
  // Get all visible properties
  const visibleProps = Object.entries(properties)
    .filter(([name, prop]) => {
      // Skip hidden fields
      if (hiddenFields.has(name)) {
        return false;
      }
      return TYPE_PRIORITY[prop.type];
    });
  
  // Apply custom order if available
  let sortedProps;
  if (fieldOrder.length > 0) {
    // Create a map for quick lookup
    const propsMap = new Map(visibleProps);
    
    // Start with custom order, then add any new fields at the end
    const ordered = [];
    const seen = new Set();
    
    // Add fields in custom order
    for (const name of fieldOrder) {
      if (propsMap.has(name) && !hiddenFields.has(name)) {
        ordered.push([name, propsMap.get(name)]);
        seen.add(name);
      }
    }
    
    // Add any new fields not in custom order (sorted by type priority)
    const remaining = visibleProps
      .filter(([name]) => !seen.has(name))
      .sort((a, b) => {
        const priorityA = TYPE_PRIORITY[a[1].type] || 100;
        const priorityB = TYPE_PRIORITY[b[1].type] || 100;
        return priorityA - priorityB;
      });
    
    sortedProps = [...ordered, ...remaining];
  } else {
    // Default: sort by type priority
    sortedProps = visibleProps.sort((a, b) => {
      const priorityA = TYPE_PRIORITY[a[1].type] || 100;
      const priorityB = TYPE_PRIORITY[b[1].type] || 100;
      return priorityA - priorityB;
    });
  }

  // Render each property
  sortedProps.forEach(([name, property]) => {
    const fieldElement = renderProperty(name, property, tab, existingPageData);
    if (fieldElement) {
      formFields.appendChild(fieldElement);
    }
  });
  
  // Update hidden fields section
  updateHiddenFieldsSection(properties);
}

/**
 * Update the hidden fields section
 * @param {Object} properties - All database properties
 */
function updateHiddenFieldsSection(properties) {
  const hiddenFieldsSection = document.getElementById('hiddenFieldsSection');
  const hiddenFieldsList = document.getElementById('hiddenFieldsList');
  const hiddenCount = document.getElementById('hiddenCount');
  
  if (!hiddenFieldsSection || !hiddenFieldsList || !hiddenCount) return;
  
  const hidden = Array.from(hiddenFields).filter(name => properties[name]);
  
  if (hidden.length === 0) {
    hiddenFieldsSection.classList.add('hidden');
    return;
  }
  
  hiddenFieldsSection.classList.remove('hidden');
  hiddenCount.textContent = `(${hidden.length})`;
  hiddenFieldsList.innerHTML = '';
  
  hidden.forEach(fieldName => {
    const prop = properties[fieldName];
    const item = document.createElement('div');
    item.className = 'hidden-field-item';
    item.innerHTML = `
      <span class="hidden-field-name">${fieldName}</span>
      <span class="hidden-field-type">${prop.type}</span>
      <button type="button" class="unhide-btn" data-field="${fieldName}" title="Show this field">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </button>
    `;
    
    const unhideBtn = item.querySelector('.unhide-btn');
    unhideBtn.addEventListener('click', () => {
      toggleFieldVisibility(fieldName);
    });
    
    hiddenFieldsList.appendChild(item);
  });
}

/**
 * Render a single property field
 * @param {string} name - Property name
 * @param {Object} property - Property configuration
 * @param {Object} tab - Tab info for pre-population
 * @param {Object} existingData - Existing data to pre-fill (if editing)
 * @returns {HTMLElement} Field element
 */
function renderProperty(name, property, tab, existingData = null) {
  const group = document.createElement('div');
  group.className = 'form-group';
  group.dataset.propertyName = name;
  group.dataset.propertyType = property.type;
  
  // Add hide button to label
  const labelContainer = document.createElement('div');
  labelContainer.className = 'label-container';

  const renderers = {
    'title': () => renderTitleField(group, name, property, tab, labelContainer, existingData),
    'rich_text': () => renderRichTextField(group, name, property, labelContainer, existingData),
    'url': () => renderUrlField(group, name, property, tab, labelContainer, existingData),
    'number': () => renderNumberField(group, name, property, labelContainer, existingData),
    'checkbox': () => renderCheckboxField(group, name, property, labelContainer, existingData),
    'select': () => renderSelectField(group, name, property, labelContainer, existingData),
    'multi_select': () => renderMultiSelectField(group, name, property, labelContainer, existingData),
    'date': () => renderDateField(group, name, property, labelContainer, existingData),
    'email': () => renderEmailField(group, name, property, labelContainer, existingData),
    'phone_number': () => renderPhoneField(group, name, property, labelContainer, existingData),
    'status': () => renderStatusField(group, name, property, labelContainer, existingData)
  };

  const renderer = renderers[property.type];
  if (renderer) {
    renderer();
    // Add hide button to label container
    addHideButton(labelContainer, name);
    return group;
  }
  
  return null; // Unsupported type
}

/**
 * Add hide button to label container
 * @param {HTMLElement} labelContainer - Label container element
 * @param {string} fieldName - Field name
 */
function addHideButton(labelContainer, fieldName) {
  const hideBtn = document.createElement('button');
  hideBtn.type = 'button';
  hideBtn.className = 'hide-field-btn';
  hideBtn.title = 'Hide this field';
  hideBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    </svg>
  `;
  hideBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFieldVisibility(fieldName);
  });
  labelContainer.appendChild(hideBtn);
}

/**
 * Create label element
 * @param {string} name - Field name
 * @param {string} type - Field type
 * @param {HTMLElement} container - Container to append label to
 * @returns {HTMLElement} Label element
 */
function createLabel(name, type, container) {
  const label = document.createElement('label');
  label.className = 'form-label';
  label.innerHTML = `${name} <span class="type-badge">${type}</span>`;
  if (container) {
    container.appendChild(label);
  }
  return label;
}

/**
 * Render title field (pre-populated with page title)
 */
function renderTitleField(group, name, property, tab, labelContainer, existingData) {
  createLabel(name, 'title', labelContainer);
  group.appendChild(labelContainer);
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-input';
  input.name = name;
  input.placeholder = 'Enter title...';
  
  // Use existing data if available, otherwise intelligently choose between roleName, companyName, or full title
  let defaultValue = tab.title || '';
  if (!existingData || !existingData[name]) {
    if (isRoleField(name) && tab.roleName) {
      defaultValue = tab.roleName;
    } else if (isCompanyNameField(name) && tab.companyName) {
      // Only fill company name fields, not company summary fields
      defaultValue = tab.companyName;
    }
  }
  
  input.value = (existingData && existingData[name]) || defaultValue;
  input.required = true;
  
  group.appendChild(input);
}

/**
 * Check if field name suggests it's a location field
 */
function isLocationField(name) {
  const lowercaseName = name.toLowerCase();
  return lowercaseName.includes('location') || 
         lowercaseName.includes('where') || 
         lowercaseName.includes('city') ||
         lowercaseName.includes('place');
}

/**
 * Check if field name suggests it's a company field
 */
function isCompanyField(name) {
  const lowercaseName = name.toLowerCase();
  return lowercaseName === 'company' || 
         lowercaseName === 'company name' ||
         lowercaseName.includes('company') ||
         lowercaseName === 'organization' ||
         lowercaseName === 'employer';
}

/**
 * Check if field name is specifically a company NAME field (not summary)
 */
function isCompanyNameField(name) {
  const lowercaseName = name.toLowerCase();
  // Exclude summary fields - only match fields that are specifically for company name
  if (lowercaseName.includes('summary') || lowercaseName.includes('description') || lowercaseName.includes('about')) {
    return false;
  }
  return lowercaseName === 'company' || 
         lowercaseName === 'company name' ||
         lowercaseName === 'organization' ||
         lowercaseName === 'employer';
}

/**
 * Check if field name suggests it's a raw job description field
 */
function isRawJdField(name) {
  const lowercaseName = name.toLowerCase();
  // Match variations of "raw jd", "raw job description", etc.
  return lowercaseName === 'raw jd' ||
         lowercaseName === 'raw_jd' ||
         lowercaseName === 'rawjd' ||
         lowercaseName === 'raw job description' ||
         lowercaseName === 'raw_job_description' ||
         lowercaseName.includes('raw jd') ||
         lowercaseName.includes('raw_jd');
}

/**
 * Check if field name suggests it's a role/job title field
 */
function isRoleField(name) {
  const lowercaseName = name.toLowerCase();
  return lowercaseName === 'role' ||
         lowercaseName === 'role name' ||
         lowercaseName === 'job title' ||
         lowercaseName === 'position' ||
         lowercaseName === 'title' ||
         lowercaseName.includes('job title') ||
         lowercaseName.includes('position');
}

/**
 * Find best matching option for location
 * @param {string} extractedLocation - Location extracted from page
 * @param {Array} options - Available select options
 * @returns {string|null} Best matching option name or null
 */
function findBestLocationMatch(extractedLocation, options) {
  if (!extractedLocation || !options || options.length === 0) {
    return null;
  }
  
  const location = extractedLocation.toLowerCase().trim();
  
  // 1. Try exact match (case-insensitive)
  for (const option of options) {
    if (option.name.toLowerCase() === location) {
      return option.name;
    }
  }
  
  // 2. Try contains match (option contains extracted location)
  for (const option of options) {
    if (option.name.toLowerCase().includes(location)) {
      return option.name;
    }
  }
  
  // 3. Try reverse contains (extracted location contains option)
  for (const option of options) {
    if (location.includes(option.name.toLowerCase())) {
      return option.name;
    }
  }
  
  // 4. Check for "Remote" special case
  if (location.includes('remote')) {
    for (const option of options) {
      if (option.name.toLowerCase().includes('remote')) {
        return option.name;
      }
    }
  }
  
  // 5. Check for common city/state patterns and abbreviations
  const cityStatePatterns = [
    { pattern: /san francisco|sf|bay area/i, keywords: ['san francisco', 'sf', 'bay area'] },
    { pattern: /new york|nyc|ny(?!\w)/i, keywords: ['new york', 'nyc', 'ny'] },
    { pattern: /los angeles|la(?!\w)/i, keywords: ['los angeles', 'la'] },
    { pattern: /washington.*dc|dc(?!\w)/i, keywords: ['washington', 'dc'] },
    { pattern: /boston|ma(?!\w)/i, keywords: ['boston', 'ma'] },
    { pattern: /chicago|il(?!\w)/i, keywords: ['chicago', 'il'] },
    { pattern: /seattle|wa(?!\w)/i, keywords: ['seattle', 'wa'] },
    { pattern: /austin|tx(?!\w)/i, keywords: ['austin', 'tx'] },
    { pattern: /denver|co(?!\w)/i, keywords: ['denver', 'co'] },
  ];
  
  for (const { pattern, keywords } of cityStatePatterns) {
    if (pattern.test(location)) {
      for (const option of options) {
        const optionLower = option.name.toLowerCase();
        if (keywords.some(keyword => optionLower.includes(keyword))) {
          return option.name;
        }
      }
    }
  }
  
  // 6. Extract state abbreviation if present and match
  const stateMatch = location.match(/,\s*([A-Z]{2})\b/);
  if (stateMatch) {
    const state = stateMatch[1].toLowerCase();
    for (const option of options) {
      if (option.name.toLowerCase().includes(state)) {
        return option.name;
      }
    }
  }
  
  return null;
}

/**
 * Render rich text field
 */
function renderRichTextField(group, name, property, labelContainer, existingData) {
  createLabel(name, 'text', labelContainer);
  group.appendChild(labelContainer);
  
  // Check if this is a company name field - render as input instead of textarea
  const isCompanyName = isCompanyNameField(name);
  const isRawJd = isRawJdField(name);
  
  let inputElement;
  if (isCompanyName) {
    // Render as input (like role name) for company name fields
    inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.className = 'form-input';
  } else {
    // Render as textarea for other rich_text fields
    inputElement = document.createElement('textarea');
    inputElement.className = 'form-textarea';
  }
  
  inputElement.name = name;
  inputElement.placeholder = `Enter ${name.toLowerCase()}...`;
  
  // Use existing data if available, otherwise intelligently pre-populate
  let defaultValue = '';
  if (!existingData || !existingData[name]) {
    if (isRoleField(name) && tabInfo && tabInfo.roleName) {
      defaultValue = tabInfo.roleName;
    } else if (isCompanyName && tabInfo && tabInfo.companyName) {
      // Only fill if it's specifically a company name field (not summary)
      defaultValue = tabInfo.companyName;
    } else if (isRawJd && tabInfo && tabInfo.selectedText) {
      // Fill raw jd field with selected text
      defaultValue = tabInfo.selectedText;
      console.log(`✅ Auto-filled raw jd field with selected text (${tabInfo.selectedText.length} chars)`);
    }
  }
  
  inputElement.value = (existingData && existingData[name]) || defaultValue;
  
  group.appendChild(inputElement);
}

/**
 * Render URL field (pre-populated with current URL)
 */
function renderUrlField(group, name, property, tab, labelContainer, existingData) {
  createLabel(name, 'url', labelContainer);
  group.appendChild(labelContainer);
  
  const input = document.createElement('input');
  input.type = 'url';
  input.className = 'form-input';
  input.name = name;
  input.placeholder = 'https://...';
  // Use existing data if available, otherwise use tab URL
  input.value = (existingData && existingData[name]) || tab.url || '';
  
  group.appendChild(input);
}

/**
 * Render number field
 */
function renderNumberField(group, name, property, labelContainer, existingData) {
  createLabel(name, 'number', labelContainer);
  group.appendChild(labelContainer);
  
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'form-input';
  input.name = name;
  input.placeholder = '0';
  input.step = 'any';
  if (existingData && existingData[name] !== undefined && existingData[name] !== '') {
    input.value = existingData[name];
  }
  
  group.appendChild(input);
}

/**
 * Render checkbox field
 */
function renderCheckboxField(group, name, property, labelContainer, existingData) {
  createLabel(name, 'checkbox', labelContainer);
  group.appendChild(labelContainer);
  
  const wrapper = document.createElement('div');
  wrapper.className = 'checkbox-wrapper';
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'form-checkbox';
  checkbox.name = name;
  checkbox.id = `checkbox-${name}`;
  if (existingData && existingData[name] !== undefined) {
    checkbox.checked = existingData[name];
  }
  
  const label = document.createElement('label');
  label.className = 'checkbox-label';
  label.htmlFor = `checkbox-${name}`;
  label.textContent = name;
  
  wrapper.appendChild(checkbox);
  wrapper.appendChild(label);
  group.appendChild(wrapper);
}

/**
 * Render select/dropdown field
 */
function renderSelectField(group, name, property, labelContainer, existingData) {
  createLabel(name, 'select', labelContainer);
  group.appendChild(labelContainer);
  
  const select = document.createElement('select');
  select.className = 'form-select';
  select.name = name;
  
  // Empty option
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = `Select ${name.toLowerCase()}...`;
  select.appendChild(emptyOption);
  
  // Add options from Notion
  if (property.select?.options) {
    property.select.options.forEach(option => {
      const opt = document.createElement('option');
      opt.value = option.name;
      opt.textContent = option.name;
      select.appendChild(opt);
    });
  }
  
  // Set value from existing data or auto-detect location/company
  let valueToSet = null;
  if (existingData && existingData[name]) {
    valueToSet = existingData[name];
  } else if (isLocationField(name) && tabInfo && tabInfo.location && property.select?.options) {
    // Try to match extracted location to available options
    console.log(`🔍 Field "${name}" detected as location field`);
    console.log(`🌍 Extracted location: "${tabInfo.location}"`);
    console.log(`📋 Available options:`, property.select.options.map(o => o.name).join(', '));
    
    const matchedOption = findBestLocationMatch(tabInfo.location, property.select.options);
    if (matchedOption) {
      valueToSet = matchedOption;
      console.log(`✅ Auto-matched location "${tabInfo.location}" to option "${matchedOption}"`);
    } else {
      console.log(`❌ Could not match location "${tabInfo.location}" to any option`);
    }
  } else if (isCompanyField(name) && tabInfo && tabInfo.companyName && property.select?.options) {
    // Try to match extracted company to available options
    const matchedOption = property.select.options.find(opt => 
      opt.name.toLowerCase() === tabInfo.companyName.toLowerCase()
    );
    if (matchedOption) {
      valueToSet = matchedOption.name;
      console.log(`✅ Auto-matched company "${tabInfo.companyName}" to option "${matchedOption.name}"`);
    }
  } else if (isLocationField(name)) {
    const debugInfo = {
      hasTabInfo: !!tabInfo,
      tabInfoLocation: tabInfo?.location || 'null',
      hasOptions: !!(property.select?.options),
      optionsCount: property.select?.options?.length || 0,
      options: property.select?.options?.map(o => o.name) || []
    };
    console.log(`⚠️ Field "${name}" is location field but conditions not met:`, debugInfo);
  }
  
  if (valueToSet) {
    select.value = valueToSet;
  }
  
  group.appendChild(select);
}

/**
 * Render status field (similar to select but with status options)
 */
function renderStatusField(group, name, property, labelContainer, existingData) {
  createLabel(name, 'status', labelContainer);
  group.appendChild(labelContainer);
  
  const select = document.createElement('select');
  select.className = 'form-select';
  select.name = name;
  
  // Empty option
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = `Select ${name.toLowerCase()}...`;
  select.appendChild(emptyOption);
  
  // Add options from Notion
  if (property.status?.options) {
    property.status.options.forEach(option => {
      const opt = document.createElement('option');
      opt.value = option.name;
      opt.textContent = option.name;
      select.appendChild(opt);
    });
  }
  
  // Set value from existing data or auto-detect location/company
  let valueToSet = null;
  if (existingData && existingData[name]) {
    valueToSet = existingData[name];
  } else if (isLocationField(name) && tabInfo && tabInfo.location && property.status?.options) {
    // Try to match extracted location to available options
    const matchedOption = findBestLocationMatch(tabInfo.location, property.status.options);
    if (matchedOption) {
      valueToSet = matchedOption;
      console.log(`Auto-matched location "${tabInfo.location}" to status option "${matchedOption}"`);
    }
  } else if (isCompanyField(name) && tabInfo && tabInfo.companyName && property.status?.options) {
    // Try to match extracted company to available options
    const matchedOption = property.status.options.find(opt => 
      opt.name.toLowerCase() === tabInfo.companyName.toLowerCase()
    );
    if (matchedOption) {
      valueToSet = matchedOption.name;
      console.log(`Auto-matched company "${tabInfo.companyName}" to status option "${matchedOption.name}"`);
    }
  }
  
  if (valueToSet) {
    select.value = valueToSet;
  }
  
  group.appendChild(select);
}

/**
 * Render multi-select field with tags
 */
function renderMultiSelectField(group, name, property, labelContainer, existingData) {
  createLabel(name, 'tags', labelContainer);
  group.appendChild(labelContainer);
  
  const container = document.createElement('div');
  container.className = 'multiselect-container';
  
  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'multiselect-tags';
  tagsContainer.dataset.name = name;
  
  // Hidden input to store selected values
  const hiddenInput = document.createElement('input');
  hiddenInput.type = 'hidden';
  hiddenInput.name = name;
  
  // Get existing values
  const existingValues = (existingData && existingData[name]) || [];
  const existingValuesSet = new Set(existingValues);
  
  // Add tag options
  if (property.multi_select?.options) {
    property.multi_select.options.forEach(option => {
      const tag = document.createElement('span');
      tag.className = 'tag selectable';
      tag.textContent = option.name;
      tag.dataset.value = option.name;
      tag.dataset.color = option.color || 'default';
      
      // Pre-select if in existing data
      if (existingValuesSet.has(option.name)) {
        tag.classList.add('selected');
      }
      
      tag.addEventListener('click', () => {
        tag.classList.toggle('selected');
        updateMultiSelectValue(tagsContainer, hiddenInput);
      });
      
      tagsContainer.appendChild(tag);
    });
  }
  
  // Set hidden input value
  hiddenInput.value = JSON.stringify(existingValues);
  
  container.appendChild(tagsContainer);
  container.appendChild(hiddenInput);
  group.appendChild(container);
}

/**
 * Update hidden input value for multi-select
 */
function updateMultiSelectValue(container, input) {
  const selected = container.querySelectorAll('.tag.selected');
  const values = Array.from(selected).map(tag => tag.dataset.value);
  input.value = JSON.stringify(values);
}

/**
 * Render date field
 */
function renderDateField(group, name, property, labelContainer, existingData) {
  createLabel(name, 'date', labelContainer);
  group.appendChild(labelContainer);
  
  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'form-input';
  input.name = name;
  if (existingData && existingData[name]) {
    // Ensure date format is YYYY-MM-DD
    const dateValue = existingData[name];
    if (dateValue) {
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        input.value = date.toISOString().split('T')[0];
      } else {
        input.value = dateValue;
      }
    }
  }
  
  group.appendChild(input);
}

/**
 * Render email field
 */
function renderEmailField(group, name, property, labelContainer, existingData) {
  createLabel(name, 'email', labelContainer);
  group.appendChild(labelContainer);
  
  const input = document.createElement('input');
  input.type = 'email';
  input.className = 'form-input';
  input.name = name;
  input.placeholder = 'email@example.com';
  input.value = (existingData && existingData[name]) || '';
  
  group.appendChild(input);
}

/**
 * Render phone field
 */
function renderPhoneField(group, name, property, labelContainer, existingData) {
  createLabel(name, 'phone', labelContainer);
  group.appendChild(labelContainer);
  
  const input = document.createElement('input');
  input.type = 'tel';
  input.className = 'form-input';
  input.name = name;
  input.placeholder = '+1 (555) 000-0000';
  input.value = (existingData && existingData[name]) || '';
  
  group.appendChild(input);
}

/**
 * Handle form submission
 * @param {Event} e - Submit event
 */
async function handleSubmit(e) {
  e.preventDefault();
  
  const btnText = submitBtn.querySelector('.btn-text');
  const btnLoading = submitBtn.querySelector('.btn-loading');
  const quickBtnText = quickSaveBtn.querySelector('.btn-text');
  const quickBtnLoading = quickSaveBtn.querySelector('.btn-loading');
  
  // Show loading state on both buttons
  submitBtn.disabled = true;
  quickSaveBtn.disabled = true;
  btnText.classList.add('hidden');
  btnLoading.classList.remove('hidden');
  quickBtnText.classList.add('hidden');
  quickBtnLoading.classList.remove('hidden');

  try {
    const properties = buildPayload();
    let result;
    let pageUrl;
    
    // Step 1: Save to Notion
    if (existingPageId) {
      // Update existing page
      console.log('Updating existing page:', existingPageId);
      result = await notionApi.updatePage(existingPageId, properties);
      
      // Build Notion page URL
      const pageId = existingPageId.replace(/-/g, '');
      pageUrl = `https://notion.so/${pageId}`;
    } else {
      // Create new page
      console.log('Creating new page');
      result = await notionApi.createPage(properties);
      
      // Build Notion page URL
      const pageId = result.id.replace(/-/g, '');
      pageUrl = `https://notion.so/${pageId}`;
    }
    
    showSuccess(pageUrl);
    
  } catch (error) {
    console.error('Submission error:', error);
    alert(`Error: ${error.message}`);
    
  } finally {
    submitBtn.disabled = false;
    quickSaveBtn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
    quickBtnText.classList.remove('hidden');
    quickBtnLoading.classList.add('hidden');
  }
}

/**
 * Build the Notion API payload from form data
 * @returns {Object} Properties payload for Notion API
 */
function buildPayload() {
  const properties = {};
  const formGroups = formFields.querySelectorAll('.form-group');
  
  formGroups.forEach(group => {
    const name = group.dataset.propertyName;
    
    // Skip hidden fields
    if (hiddenFields.has(name)) {
      return;
    }
    
    const type = group.dataset.propertyType;
    
    const value = getFieldValue(group, type);
    const formatter = PropertyFormatters[type];
    
    if (formatter && (value !== '' && value !== null && value !== undefined)) {
      properties[name] = formatter(value);
    } else if (type === 'title') {
      // Title is always required
      properties[name] = PropertyFormatters.title(value || 'Untitled');
    }
  });
  
  return properties;
}

/**
 * Get value from a form field based on type
 * @param {HTMLElement} group - Form group element
 * @param {string} type - Property type
 * @returns {*} Field value
 */
function getFieldValue(group, type) {
  switch (type) {
    case 'checkbox': {
      const checkbox = group.querySelector('input[type="checkbox"]');
      return checkbox?.checked || false;
    }
    
    case 'multi_select': {
      const hidden = group.querySelector('input[type="hidden"]');
      try {
        return JSON.parse(hidden?.value || '[]');
      } catch {
        return [];
      }
    }
    
    case 'number': {
      const input = group.querySelector('input');
      const val = input?.value;
      return val !== '' ? parseFloat(val) : null;
    }
    
    default: {
      const input = group.querySelector('input, textarea, select');
      return input?.value || '';
    }
  }
}

/**
 * Handle Add Details button click
 */
function handleAiFill() {
  // Open the input modal instead of directly extracting
  openAiInputModal();
}

/**
 * Open AI input modal
 */
function openAiInputModal() {
  if (!databaseSchema) return;
  
  // Get current tab info for context
  getTabInfo().then(tabInfo => {
    // Pre-fill with tab title/URL and selected text if available
    let content = `Title: ${tabInfo.title || ''}\nURL: ${tabInfo.url || ''}\n\n`;
    
    // Add selected text if available
    if (tabInfo.selectedText) {
      content += tabInfo.selectedText;
      console.log(`✅ Pre-filled modal with ${tabInfo.selectedText.length} characters of selected text`);
    } else {
      console.log('ℹ️ No selected text available');
    }
    
    if (aiInputTextarea) {
      aiInputTextarea.value = content;
      charCount.textContent = content.length.toLocaleString();
      
      // Enable/disable submit button based on content
      submitAiInput.disabled = content.trim().length === 0;
      
      aiInputTextarea.focus();
      // If we have selected text, select all so user can easily edit; otherwise just position cursor
      if (tabInfo.selectedText) {
        aiInputTextarea.setSelectionRange(0, content.length);
      } else {
        aiInputTextarea.setSelectionRange(content.length, content.length);
      }
    }
  }).catch(() => {
    // If we can't get tab info, just open empty
    if (aiInputTextarea) {
      aiInputTextarea.value = '';
      charCount.textContent = '0';
      aiInputTextarea.focus();
      submitAiInput.disabled = true;
    }
  });
  
  aiInputModal.classList.remove('hidden');
}

/**
 * Close AI input modal
 */
function closeAiInputModal() {
  aiInputModal.classList.add('hidden');
  if (aiInputTextarea) {
    aiInputTextarea.value = '';
  }
}

/**
 * Handle AI input submission
 */
async function handleAiInputSubmit() {
  const userContent = aiInputTextarea.value.trim();
  
  if (!userContent) {
    showToast('Please paste some content to analyze', 'error');
    return;
  }
  
  // Close the input modal
  closeAiInputModal();
  
  const btnText = aiBtn.querySelector('.ai-btn-text');
  const btnLoading = aiBtn.querySelector('.ai-btn-loading');
  
  // Show loading overlay on form
  if (aiLoadingOverlay) {
    aiLoadingOverlay.classList.remove('hidden');
  }
  
  // Show loading state on button
  aiBtn.disabled = true;
  btnText.classList.add('hidden');
  btnLoading.classList.remove('hidden');

  try {
    // Get tab info for context (title, URL)
    let tabInfo = { title: '', url: '' };
    try {
      tabInfo = await getTabInfo();
    } catch (e) {
      // Ignore if we can't get tab info
    }
    
    // Create page content object from user input
    const pageContent = {
      title: tabInfo.title || '',
      url: tabInfo.url || '',
      description: '',
      content: userContent,
      structuredData: null
    };
    
    // Debug: Log content being sent
    console.log('=== USER PROVIDED CONTENT FOR AI ===');
    console.log('Title:', pageContent.title);
    console.log('URL:', pageContent.url);
    console.log('Content Length:', pageContent.content.length, 'characters');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📄 FULL CONTENT (SENT TO LLM):');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(pageContent.content);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    
    // Store for debug viewing
    window.lastExtractedContent = pageContent;
    
    // Extract fields using AI (excluding hidden fields)
    showToast('Analyzing content...', 'info');
    const extractedFields = await openaiHelper.extractFields(databaseSchema, pageContent, hiddenFields);
    
    console.log('=== AI EXTRACTION RESULTS ===');
    console.log('Extracted Fields:', extractedFields);
    console.log('Field Count:', Object.keys(extractedFields || {}).length);
    console.log('Fields:', Object.keys(extractedFields || {}).join(', '));
    console.log('===========================');
    
    if (!extractedFields || typeof extractedFields !== 'object') {
      throw new Error('AI returned invalid response');
    }
    
    // Fill form fields
    let filledCount = 0;
    for (const [fieldName, value] of Object.entries(extractedFields)) {
      console.log(`Attempting to fill field "${fieldName}" with value:`, value);
      if (value !== null && value !== undefined && value !== '') {
        const filled = fillFormField(fieldName, value);
        console.log(`  → Field "${fieldName}" filled: ${filled}`);
        if (filled) filledCount++;
      } else {
        console.log(`  → Skipping "${fieldName}" (empty value)`);
      }
    }
    
    console.log(`=== FILL SUMMARY: ${filledCount} fields filled ===`);
    
    if (filledCount > 0) {
      showToast(`✨ Filled ${filledCount} field${filledCount > 1 ? 's' : ''} - Saving...`, 'info');
      
      // Immediately auto-save in background
      console.log('Auto-saving now...');
      await handleBackgroundSave();
    } else {
      showToast('Couldn\'t extract any fields from the content', 'error');
    }
    
  } catch (error) {
    console.error('Add Details error:', error);
    
    const errorMsg = error.message || 'Unknown error occurred';
    
    if (errorMsg === 'OPENAI_NOT_CONFIGURED') {
      showToast('Please configure your OpenAI API key in settings', 'error');
    } else if (errorMsg.includes('port closed')) {
      showToast('Connection error. Please try again.', 'error');
    } else if (errorMsg.includes('Invalid API key') || errorMsg.includes('401')) {
      showToast('Invalid OpenAI API key. Check settings.', 'error');
    } else {
      showToast(errorMsg.length > 50 ? errorMsg.substring(0, 50) + '...' : errorMsg, 'error');
    }
    
  } finally {
    // Hide loading overlay
    if (aiLoadingOverlay) {
      aiLoadingOverlay.classList.add('hidden');
    }
    
    aiBtn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
  }
}

/**
 * Save form data to Notion in background without changing UI state
 * Allows the form to remain visible while save happens
 */
async function handleBackgroundSave() {
  try {
    const properties = buildPayload();
    let pageUrl;
    
    // Save to Notion
    if (existingPageId) {
      // Update existing page
      console.log('Background updating existing page:', existingPageId);
      await notionApi.updatePage(existingPageId, properties);
      
      // Build Notion page URL
      const pageId = existingPageId.replace(/-/g, '');
      pageUrl = `https://notion.so/${pageId}`;
    } else {
      // Create new page
      console.log('Background creating new page');
      const result = await notionApi.createPage(properties);
      
      // Build Notion page URL
      const pageId = result.id.replace(/-/g, '');
      pageUrl = `https://notion.so/${pageId}`;
      
      // Update existingPageId so subsequent saves are updates
      existingPageId = result.id;
    }
    
    // Show success toast but keep form visible
    showToast('✅ Saved to Notion!', 'success');
    console.log('Background save completed:', pageUrl);
    
    // Update button text to show it's been saved
    updateSubmitButton();
    
  } catch (error) {
    console.error('Background save error:', error);
    showToast(`❌ Save failed: ${error.message}`, 'error');
  }
}

/**
 * Fill a form field with AI-extracted value
 * @param {string} fieldName - Name of the field
 * @param {*} value - Value to fill
 * @returns {boolean} Whether the field was filled
 */
function fillFormField(fieldName, value) {
  const group = formFields.querySelector(`.form-group[data-property-name="${fieldName}"]`);
  if (!group) {
    console.log(`  ✗ Form group not found for field: "${fieldName}"`);
    // List all available fields for debugging
    const availableFields = Array.from(formFields.querySelectorAll('.form-group'))
      .map(g => g.dataset.propertyName);
    console.log(`  Available fields: ${availableFields.join(', ')}`);
    return false;
  }
  
  const type = group.dataset.propertyType;
  console.log(`  ✓ Found field "${fieldName}" (type: ${type})`);
  let filled = false;
  
  // Add animation class
  group.classList.add('ai-filling');
  setTimeout(() => {
    group.classList.remove('ai-filling');
    group.classList.add('ai-filled');
  }, 600);

  switch (type) {
    case 'title':
    case 'rich_text':
    case 'url':
    case 'email':
    case 'phone_number': {
      const input = group.querySelector('input, textarea');
      if (input && value) {
        input.value = value;
        filled = true;
        console.log(`    → Set ${type} field value to: "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`);
      } else {
        console.log(`    ✗ Input not found or value empty for ${type} field`);
      }
      break;
    }
    
    case 'number': {
      const input = group.querySelector('input');
      if (input && (value !== null && value !== undefined)) {
        input.value = value;
        filled = true;
      }
      break;
    }
    
    case 'date': {
      const input = group.querySelector('input');
      if (input && value) {
        // Ensure date format is YYYY-MM-DD
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          input.value = date.toISOString().split('T')[0];
          filled = true;
        }
      }
      break;
    }
    
    case 'checkbox': {
      const checkbox = group.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.checked = Boolean(value);
        filled = true;
      }
      break;
    }
    
    case 'select':
    case 'status': {
      const select = group.querySelector('select');
      if (select && value) {
        // Find matching option (case-insensitive)
        const options = Array.from(select.options);
        console.log(`    Trying to match "${value}" against options: ${options.map(o => o.value).join(', ')}`);
        const match = options.find(opt => 
          opt.value.toLowerCase() === value.toLowerCase()
        );
        if (match) {
          select.value = match.value;
          filled = true;
          console.log(`    → Matched and set to: "${match.value}"`);
        } else {
          console.log(`    ✗ No matching option found for value: "${value}"`);
        }
      } else {
        console.log(`    ✗ Select not found or value empty`);
      }
      break;
    }
    
    case 'multi_select': {
      const tags = group.querySelectorAll('.tag.selectable');
      const hidden = group.querySelector('input[type="hidden"]');
      const values = Array.isArray(value) ? value : [value];
      
      tags.forEach(tag => {
        const tagValue = tag.dataset.value;
        // Case-insensitive match
        const shouldSelect = values.some(v => 
          v.toLowerCase() === tagValue.toLowerCase()
        );
        
        if (shouldSelect) {
          tag.classList.add('selected');
          filled = true;
        }
      });
      
      // Update hidden input
      if (hidden && filled) {
        const selected = group.querySelectorAll('.tag.selected');
        const selectedValues = Array.from(selected).map(t => t.dataset.value);
        hidden.value = JSON.stringify(selectedValues);
      }
      break;
    }
  }
  
  return filled;
}

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', or 'info'
 */
function showToast(message, type = 'info') {
  const icon = toast.querySelector('.toast-icon');
  const msg = toast.querySelector('.toast-message');
  
  // Set icon based on type
  const icons = {
    success: '✓',
    error: '✕',
    info: '💡'
  };
  
  icon.textContent = icons[type] || icons.info;
  msg.textContent = message;
  
  // Update classes
  toast.className = `toast ${type} visible`;
  
  // Auto-hide after delay
  clearTimeout(toast.hideTimeout);
  toast.hideTimeout = setTimeout(() => {
    toast.classList.remove('visible');
  }, 3000);
}


/**
 * Open customize modal
 */
function openCustomizeModal() {
  if (!databaseSchema) return;
  
  customizeModal.classList.remove('hidden');
  renderCustomizeFields();
}

/**
 * Close customize modal
 */
function closeCustomizeModal() {
  customizeModal.classList.add('hidden');
}

/**
 * Open shortcuts modal and load actual keyboard shortcuts
 */
async function openShortcutsModal() {
  if (!shortcutsModal) return;
  
  shortcutsModal.classList.remove('hidden');
  
  // Load actual keyboard shortcuts from Chrome
  try {
    const commands = await chrome.commands.getAll();
    const shortcutsMap = {};
    
    commands.forEach(command => {
      if (command.shortcut) {
        shortcutsMap[command.name] = command.shortcut;
      }
    });
    
    // Update the display with actual shortcuts
    const shortcutOpenEl = document.getElementById('shortcut-open');
    const shortcutAddDetailsEl = document.getElementById('shortcut-add-details');
    const shortcutQuickSaveEl = document.getElementById('shortcut-quick-save');
    
    // Helper function to format shortcut or show default
    const formatShortcut = (shortcut, defaultWin, defaultMac) => {
      if (shortcut) return shortcut;
      // Detect OS and show appropriate default
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      return isMac ? defaultMac : defaultWin;
    };
    
    if (shortcutOpenEl) {
      shortcutOpenEl.textContent = formatShortcut(
        shortcutsMap['open-popup'],
        'Ctrl+Shift+E',
        'Cmd+Shift+E'
      );
    }
    if (shortcutAddDetailsEl) {
      shortcutAddDetailsEl.textContent = formatShortcut(
        shortcutsMap['add-details'],
        'Ctrl+Shift+F',
        'Cmd+Shift+F'
      );
    }
    if (shortcutQuickSaveEl) {
      shortcutQuickSaveEl.textContent = formatShortcut(
        shortcutsMap['quick-save'],
        'Ctrl+Shift+G',
        'Cmd+Shift+G'
      );
    }
  } catch (error) {
    console.error('Error loading keyboard shortcuts:', error);
    // Keep default values if we can't load them
  }
}

/**
 * Close shortcuts modal
 */
function closeShortcutsModal() {
  if (shortcutsModal) {
    shortcutsModal.classList.add('hidden');
  }
}

/**
 * Render fields in customize modal
 */
function renderCustomizeFields() {
  customizeFieldsList.innerHTML = '';
  
  const properties = databaseSchema.properties;
  
  // Get all fields in current order (including hidden)
  let orderedFields = [];
  
  if (fieldOrder.length > 0) {
    // Use custom order, add any missing fields at the end
    const seen = new Set();
    for (const name of fieldOrder) {
      if (properties[name]) {
        orderedFields.push([name, properties[name]]);
        seen.add(name);
      }
    }
    // Add any fields not in order
    for (const [name, prop] of Object.entries(properties)) {
      if (!seen.has(name) && TYPE_PRIORITY[prop.type]) {
        orderedFields.push([name, prop]);
      }
    }
  } else {
    // Default order by type priority
    orderedFields = Object.entries(properties)
      .filter(([_, prop]) => TYPE_PRIORITY[prop.type])
      .sort((a, b) => {
        const priorityA = TYPE_PRIORITY[a[1].type] || 100;
        const priorityB = TYPE_PRIORITY[b[1].type] || 100;
        return priorityA - priorityB;
      });
  }
  
  orderedFields.forEach(([name, property], index) => {
    const item = document.createElement('div');
    item.className = `customize-field-item ${hiddenFields.has(name) ? 'hidden-field' : ''}`;
    item.dataset.fieldName = name;
    
    const isFirst = index === 0;
    const isLast = index === orderedFields.length - 1;
    
    item.innerHTML = `
      <div class="field-controls">
        <button class="move-btn move-up" ${isFirst ? 'disabled' : ''} data-action="up" title="Move up">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
        <button class="move-btn move-down" ${isLast ? 'disabled' : ''} data-action="down" title="Move down">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>
      <div class="field-info">
        <span class="field-name">${name}</span>
        <span class="field-type">${property.type}</span>
      </div>
      <button class="toggle-visibility-btn ${hiddenFields.has(name) ? 'hidden' : 'visible'}" data-action="toggle" title="${hiddenFields.has(name) ? 'Show' : 'Hide'}">
        <svg class="eye-open" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        <svg class="eye-closed" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
      </button>
    `;
    
    // Add event listeners
    const upBtn = item.querySelector('.move-up');
    const downBtn = item.querySelector('.move-down');
    const toggleBtn = item.querySelector('.toggle-visibility-btn');
    
    upBtn.addEventListener('click', () => moveField(name, 'up'));
    downBtn.addEventListener('click', () => moveField(name, 'down'));
    toggleBtn.addEventListener('click', () => toggleFieldInModal(name, toggleBtn, item));
    
    customizeFieldsList.appendChild(item);
  });
}

/**
 * Move field up or down in customize modal
 * @param {string} fieldName - Field name
 * @param {string} direction - 'up' or 'down'
 */
function moveField(fieldName, direction) {
  const items = Array.from(customizeFieldsList.querySelectorAll('.customize-field-item'));
  const currentIndex = items.findIndex(item => item.dataset.fieldName === fieldName);
  
  if (currentIndex === -1) return;
  
  const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (newIndex < 0 || newIndex >= items.length) return;
  
  // Swap elements
  const currentItem = items[currentIndex];
  const targetItem = items[newIndex];
  
  if (direction === 'up') {
    customizeFieldsList.insertBefore(currentItem, targetItem);
  } else {
    customizeFieldsList.insertBefore(targetItem, currentItem);
  }
  
  // Update button states
  updateMoveButtons();
}

/**
 * Update move button states
 */
function updateMoveButtons() {
  const items = Array.from(customizeFieldsList.querySelectorAll('.customize-field-item'));
  items.forEach((item, index) => {
    const upBtn = item.querySelector('.move-up');
    const downBtn = item.querySelector('.move-down');
    
    upBtn.disabled = index === 0;
    downBtn.disabled = index === items.length - 1;
  });
}

/**
 * Toggle field visibility in modal
 * @param {string} fieldName - Field name
 * @param {HTMLElement} toggleBtn - Toggle button
 * @param {HTMLElement} item - Field item
 */
function toggleFieldInModal(fieldName, toggleBtn, item) {
  if (hiddenFields.has(fieldName)) {
    hiddenFields.delete(fieldName);
    item.classList.remove('hidden-field');
    toggleBtn.classList.remove('hidden');
    toggleBtn.classList.add('visible');
    toggleBtn.title = 'Hide';
  } else {
    hiddenFields.add(fieldName);
    item.classList.add('hidden-field');
    toggleBtn.classList.remove('visible');
    toggleBtn.classList.add('hidden');
    toggleBtn.title = 'Show';
  }
}

/**
 * Save customize order and visibility
 */
async function saveCustomizeOrder() {
  // Get current order from modal
  const items = Array.from(customizeFieldsList.querySelectorAll('.customize-field-item'));
  fieldOrder = items.map(item => item.dataset.fieldName);
  
  // Save both order and hidden fields
  await Promise.all([
    saveFieldOrder(),
    saveHiddenFields()
  ]);
  
  // Re-render form
  renderForm(databaseSchema, tabInfo);
  
  // Close modal
  closeCustomizeModal();
  
  showToast('Customization saved', 'success');
}

/**
 * Show debug modal with extracted content
 * @param {Object} pageContent - Extracted page content
 */
function showDebugModal(pageContent) {
  if (!debugModal) return;
  
  document.getElementById('debugTitle').textContent = pageContent.title || '(empty)';
  document.getElementById('debugUrl').textContent = pageContent.url || '(empty)';
  document.getElementById('debugDescription').textContent = pageContent.description || '(empty)';
  document.getElementById('debugContent').textContent = pageContent.content || '(empty)';
  document.getElementById('debugContentLength').textContent = pageContent.content?.length || 0;
  
  if (pageContent.structuredData) {
    document.getElementById('debugStructured').textContent = JSON.stringify(pageContent.structuredData, null, 2);
    document.getElementById('debugStructuredSection').classList.remove('hidden');
  } else {
    document.getElementById('debugStructuredSection').classList.add('hidden');
  }
  
  debugModal.classList.remove('hidden');
}

/**
 * Close debug modal
 */
function closeDebugModal() {
  if (debugModal) {
    debugModal.classList.add('hidden');
  }
}

/**
 * Copy debug content to clipboard
 */
async function copyDebugContent() {
  const content = {
    title: document.getElementById('debugTitle').textContent,
    url: document.getElementById('debugUrl').textContent,
    description: document.getElementById('debugDescription').textContent,
    content: document.getElementById('debugContent').textContent,
    structuredData: document.getElementById('debugStructured')?.textContent
  };
  
  const text = `Title: ${content.title}\n\nURL: ${content.url}\n\nDescription: ${content.description}\n\nContent (${content.content.length} chars):\n${content.content}\n\n${content.structuredData ? `Structured Data:\n${content.structuredData}` : ''}`;
  
  try {
    await navigator.clipboard.writeText(text);
    showToast('Debug content copied to clipboard', 'success');
  } catch (e) {
    showToast('Failed to copy', 'error');
  }
}

// Initialize on load
init();

