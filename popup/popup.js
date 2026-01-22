/**
 * Popup Script - Dynamic Form Rendering Engine
 * Handles schema fetching, form generation, and page creation
 */

import { NotionAPI, PropertyFormatters, getTabInfo, OpenAIHelper } from '../lib/notion-api.js';

// DOM Elements
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const successState = document.getElementById('successState');
const clipperForm = document.getElementById('clipperForm');
const formFields = document.getElementById('formFields');
const footer = document.getElementById('footer');
const dbName = document.getElementById('dbName');

// Buttons
const settingsBtn = document.getElementById('settingsBtn');
const configureBtn = document.getElementById('configureBtn');
const submitBtn = document.getElementById('submitBtn');
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

/**
 * Initialize the extension popup
 */
async function init() {
  setupEventListeners();
  
  try {
    // Concurrent data fetching
    notionApi = new NotionAPI();
    openaiHelper = new OpenAIHelper();
    
    const [credentials, tabData, openaiKey] = await Promise.all([
      notionApi.loadCredentials().catch(e => ({ error: e.message })),
      getTabInfo().catch(e => ({ error: e.message })),
      openaiHelper.loadApiKey().catch(e => ({ error: e.message }))
    ]);

    if (credentials.error === 'CREDENTIALS_NOT_CONFIGURED') {
      showError('Please configure your Notion credentials to get started.');
      return;
    }
    
    if (credentials.error) {
      showError(credentials.error);
      return;
    }

    // Check if OpenAI is configured
    hasOpenAI = !openaiKey.error;

    tabInfo = tabData.error ? { url: '', title: '' } : tabData;

    // Fetch database schema
    databaseSchema = await notionApi.getDatabase();
    
    // Load preferences
    await Promise.all([
      loadHiddenFields(),
      loadFieldOrder()
    ]);
    
    // Render form
    renderForm(databaseSchema, tabInfo);
    showForm();
    
    // Show AI button if configured
    if (hasOpenAI) {
      aiBtn.classList.remove('hidden');
      debugBtn.classList.remove('hidden');
    }
    
    // Update footer
    dbName.textContent = databaseSchema.title?.[0]?.plain_text || 'Untitled Database';
    footer.classList.remove('hidden');

  } catch (error) {
    console.error('Initialization error:', error);
    showError(error.message);
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

  addAnotherBtn.addEventListener('click', () => {
    resetForm();
    showForm();
  });

  clipperForm.addEventListener('submit', handleSubmit);
  
  aiBtn.addEventListener('click', handleAiFill);
  
  // Customize modal
  customizeBtn.addEventListener('click', openCustomizeModal);
  modalOverlay.addEventListener('click', closeCustomizeModal);
  modalClose.addEventListener('click', closeCustomizeModal);
  cancelCustomize.addEventListener('click', closeCustomizeModal);
  saveCustomize.addEventListener('click', saveCustomizeOrder);
  
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
      const count = aiInputTextarea.value.length;
      charCount.textContent = count.toLocaleString();
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
 * Reset form to initial state
 */
function resetForm() {
  // Re-render form with fresh tab data
  if (databaseSchema && tabInfo) {
    renderForm(databaseSchema, tabInfo);
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
    const fieldElement = renderProperty(name, property, tab);
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
 * @returns {HTMLElement} Field element
 */
function renderProperty(name, property, tab) {
  const group = document.createElement('div');
  group.className = 'form-group';
  group.dataset.propertyName = name;
  group.dataset.propertyType = property.type;
  
  // Add hide button to label
  const labelContainer = document.createElement('div');
  labelContainer.className = 'label-container';

  const renderers = {
    'title': () => renderTitleField(group, name, property, tab, labelContainer),
    'rich_text': () => renderRichTextField(group, name, property, labelContainer),
    'url': () => renderUrlField(group, name, property, tab, labelContainer),
    'number': () => renderNumberField(group, name, property, labelContainer),
    'checkbox': () => renderCheckboxField(group, name, property, labelContainer),
    'select': () => renderSelectField(group, name, property, labelContainer),
    'multi_select': () => renderMultiSelectField(group, name, property, labelContainer),
    'date': () => renderDateField(group, name, property, labelContainer),
    'email': () => renderEmailField(group, name, property, labelContainer),
    'phone_number': () => renderPhoneField(group, name, property, labelContainer),
    'status': () => renderStatusField(group, name, property, labelContainer)
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
function renderTitleField(group, name, property, tab, labelContainer) {
  createLabel(name, 'title', labelContainer);
  group.appendChild(labelContainer);
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-input';
  input.name = name;
  input.placeholder = 'Enter title...';
  input.value = tab.title || '';
  input.required = true;
  
  group.appendChild(input);
}

/**
 * Render rich text field
 */
function renderRichTextField(group, name, property, labelContainer) {
  createLabel(name, 'text', labelContainer);
  group.appendChild(labelContainer);
  
  const textarea = document.createElement('textarea');
  textarea.className = 'form-textarea';
  textarea.name = name;
  textarea.placeholder = `Enter ${name.toLowerCase()}...`;
  
  group.appendChild(textarea);
}

/**
 * Render URL field (pre-populated with current URL)
 */
function renderUrlField(group, name, property, tab, labelContainer) {
  createLabel(name, 'url', labelContainer);
  group.appendChild(labelContainer);
  
  const input = document.createElement('input');
  input.type = 'url';
  input.className = 'form-input';
  input.name = name;
  input.placeholder = 'https://...';
  input.value = tab.url || '';
  
  group.appendChild(input);
}

/**
 * Render number field
 */
function renderNumberField(group, name, property, labelContainer) {
  createLabel(name, 'number', labelContainer);
  group.appendChild(labelContainer);
  
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'form-input';
  input.name = name;
  input.placeholder = '0';
  input.step = 'any';
  
  group.appendChild(input);
}

/**
 * Render checkbox field
 */
function renderCheckboxField(group, name, property, labelContainer) {
  createLabel(name, 'checkbox', labelContainer);
  group.appendChild(labelContainer);
  
  const wrapper = document.createElement('div');
  wrapper.className = 'checkbox-wrapper';
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'form-checkbox';
  checkbox.name = name;
  checkbox.id = `checkbox-${name}`;
  
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
function renderSelectField(group, name, property, labelContainer) {
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
  
  group.appendChild(select);
}

/**
 * Render status field (similar to select but with status options)
 */
function renderStatusField(group, name, property, labelContainer) {
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
  
  group.appendChild(select);
}

/**
 * Render multi-select field with tags
 */
function renderMultiSelectField(group, name, property, labelContainer) {
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
  hiddenInput.value = '[]';
  
  // Add tag options
  if (property.multi_select?.options) {
    property.multi_select.options.forEach(option => {
      const tag = document.createElement('span');
      tag.className = 'tag selectable';
      tag.textContent = option.name;
      tag.dataset.value = option.name;
      tag.dataset.color = option.color || 'default';
      
      tag.addEventListener('click', () => {
        tag.classList.toggle('selected');
        updateMultiSelectValue(tagsContainer, hiddenInput);
      });
      
      tagsContainer.appendChild(tag);
    });
  }
  
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
function renderDateField(group, name, property, labelContainer) {
  createLabel(name, 'date', labelContainer);
  group.appendChild(labelContainer);
  
  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'form-input';
  input.name = name;
  
  group.appendChild(input);
}

/**
 * Render email field
 */
function renderEmailField(group, name, property, labelContainer) {
  createLabel(name, 'email', labelContainer);
  group.appendChild(labelContainer);
  
  const input = document.createElement('input');
  input.type = 'email';
  input.className = 'form-input';
  input.name = name;
  input.placeholder = 'email@example.com';
  
  group.appendChild(input);
}

/**
 * Render phone field
 */
function renderPhoneField(group, name, property, labelContainer) {
  createLabel(name, 'phone', labelContainer);
  group.appendChild(labelContainer);
  
  const input = document.createElement('input');
  input.type = 'tel';
  input.className = 'form-input';
  input.name = name;
  input.placeholder = '+1 (555) 000-0000';
  
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
  
  // Show loading state
  submitBtn.disabled = true;
  btnText.classList.add('hidden');
  btnLoading.classList.remove('hidden');

  try {
    const properties = buildPayload();
    const result = await notionApi.createPage(properties);
    
    // Build Notion page URL
    const pageId = result.id.replace(/-/g, '');
    const pageUrl = `https://notion.so/${pageId}`;
    
    showSuccess(pageUrl);
    
  } catch (error) {
    console.error('Submission error:', error);
    alert(`Error: ${error.message}`);
    
  } finally {
    submitBtn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
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
    // Pre-fill with tab title/URL as context
    const context = `Title: ${tabInfo.title || ''}\nURL: ${tabInfo.url || ''}\n\n`;
    if (aiInputTextarea) {
      aiInputTextarea.value = context;
      charCount.textContent = context.length.toLocaleString();
      aiInputTextarea.focus();
      // Select everything after the context so user can paste over it
      aiInputTextarea.setSelectionRange(context.length, context.length);
    }
  }).catch(() => {
    // If we can't get tab info, just open empty
    if (aiInputTextarea) {
      aiInputTextarea.value = '';
      charCount.textContent = '0';
      aiInputTextarea.focus();
    }
  });
  
  aiInputModal.classList.remove('hidden');
  submitAiInput.disabled = true;
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
  
  // Show loading state
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
    
    if (!extractedFields || typeof extractedFields !== 'object') {
      throw new Error('AI returned invalid response');
    }
    
    // Fill form fields
    let filledCount = 0;
    for (const [fieldName, value] of Object.entries(extractedFields)) {
      if (value !== null && value !== undefined && value !== '') {
        const filled = fillFormField(fieldName, value);
        if (filled) filledCount++;
      }
    }
    
    if (filledCount > 0) {
      showToast(`✨ Filled ${filledCount} field${filledCount > 1 ? 's' : ''}`, 'success');
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
    aiBtn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
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
  if (!group) return false;
  
  const type = group.dataset.propertyType;
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
        const match = options.find(opt => 
          opt.value.toLowerCase() === value.toLowerCase()
        );
        if (match) {
          select.value = match.value;
          filled = true;
        }
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

