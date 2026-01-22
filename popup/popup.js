/**
 * Popup Script - Dynamic Form Rendering Engine
 * Handles schema fetching, form generation, and page creation
 */

import { NotionAPI, PropertyFormatters, getTabInfo } from '../lib/notion-api.js';

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

// State
let notionApi = null;
let databaseSchema = null;
let tabInfo = null;

/**
 * Initialize the extension popup
 */
async function init() {
  setupEventListeners();
  
  try {
    // Concurrent data fetching
    notionApi = new NotionAPI();
    
    const [credentials, tabData] = await Promise.all([
      notionApi.loadCredentials().catch(e => ({ error: e.message })),
      getTabInfo().catch(e => ({ error: e.message }))
    ]);

    if (credentials.error === 'CREDENTIALS_NOT_CONFIGURED') {
      showError('Please configure your Notion credentials to get started.');
      return;
    }
    
    if (credentials.error) {
      showError(credentials.error);
      return;
    }

    tabInfo = tabData.error ? { url: '', title: '' } : tabData;

    // Fetch database schema
    databaseSchema = await notionApi.getDatabase();
    
    // Render form
    renderForm(databaseSchema, tabInfo);
    showForm();
    
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
 * Render the dynamic form based on database schema
 * @param {Object} schema - Notion database schema
 * @param {Object} tab - Current tab info
 */
function renderForm(schema, tab) {
  formFields.innerHTML = '';
  
  const properties = schema.properties;
  
  // Sort properties by type priority
  const sortedProps = Object.entries(properties)
    .filter(([_, prop]) => TYPE_PRIORITY[prop.type])
    .sort((a, b) => {
      const priorityA = TYPE_PRIORITY[a[1].type] || 100;
      const priorityB = TYPE_PRIORITY[b[1].type] || 100;
      return priorityA - priorityB;
    });

  // Render each property
  sortedProps.forEach(([name, property]) => {
    const fieldElement = renderProperty(name, property, tab);
    if (fieldElement) {
      formFields.appendChild(fieldElement);
    }
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

  const renderers = {
    'title': () => renderTitleField(group, name, property, tab),
    'rich_text': () => renderRichTextField(group, name, property),
    'url': () => renderUrlField(group, name, property, tab),
    'number': () => renderNumberField(group, name, property),
    'checkbox': () => renderCheckboxField(group, name, property),
    'select': () => renderSelectField(group, name, property),
    'multi_select': () => renderMultiSelectField(group, name, property),
    'date': () => renderDateField(group, name, property),
    'email': () => renderEmailField(group, name, property),
    'phone_number': () => renderPhoneField(group, name, property),
    'status': () => renderStatusField(group, name, property)
  };

  const renderer = renderers[property.type];
  if (renderer) {
    renderer();
    return group;
  }
  
  return null; // Unsupported type
}

/**
 * Create label element
 */
function createLabel(name, type) {
  const label = document.createElement('label');
  label.className = 'form-label';
  label.innerHTML = `${name} <span class="type-badge">${type}</span>`;
  return label;
}

/**
 * Render title field (pre-populated with page title)
 */
function renderTitleField(group, name, property, tab) {
  group.appendChild(createLabel(name, 'title'));
  
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
function renderRichTextField(group, name, property) {
  group.appendChild(createLabel(name, 'text'));
  
  const textarea = document.createElement('textarea');
  textarea.className = 'form-textarea';
  textarea.name = name;
  textarea.placeholder = `Enter ${name.toLowerCase()}...`;
  
  group.appendChild(textarea);
}

/**
 * Render URL field (pre-populated with current URL)
 */
function renderUrlField(group, name, property, tab) {
  group.appendChild(createLabel(name, 'url'));
  
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
function renderNumberField(group, name, property) {
  group.appendChild(createLabel(name, 'number'));
  
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
function renderCheckboxField(group, name, property) {
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
function renderSelectField(group, name, property) {
  group.appendChild(createLabel(name, 'select'));
  
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
function renderStatusField(group, name, property) {
  group.appendChild(createLabel(name, 'status'));
  
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
function renderMultiSelectField(group, name, property) {
  group.appendChild(createLabel(name, 'tags'));
  
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
function renderDateField(group, name, property) {
  group.appendChild(createLabel(name, 'date'));
  
  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'form-input';
  input.name = name;
  
  group.appendChild(input);
}

/**
 * Render email field
 */
function renderEmailField(group, name, property) {
  group.appendChild(createLabel(name, 'email'));
  
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
function renderPhoneField(group, name, property) {
  group.appendChild(createLabel(name, 'phone'));
  
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

// Initialize on load
init();

