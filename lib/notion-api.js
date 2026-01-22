/**
 * Notion API Abstraction Layer
 * Provides a clean interface for Notion operations
 */

export class NotionAPI {
  constructor() {
    this.credentials = null;
  }

  /**
   * Load credentials from chrome storage
   * @returns {Promise<Object>} Credentials object
   */
  async loadCredentials() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['notionSecret', 'databaseId'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (!result.notionSecret || !result.databaseId) {
          reject(new Error('CREDENTIALS_NOT_CONFIGURED'));
          return;
        }

        this.credentials = {
          secret: result.notionSecret,
          databaseId: result.databaseId
        };
        
        resolve(this.credentials);
      });
    });
  }

  /**
   * Send request through background service worker
   * @param {string} endpoint - API endpoint
   * @param {string} method - HTTP method
   * @param {Object} body - Request body
   * @returns {Promise<Object>} API response
   */
  async request(endpoint, method = 'GET', body = null) {
    if (!this.credentials) {
      await this.loadCredentials();
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'NOTION_API_REQUEST',
          payload: {
            endpoint,
            method,
            body,
            secret: this.credentials.secret
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
  }

  /**
   * Fetch database schema
   * @returns {Promise<Object>} Database schema with properties
   */
  async getDatabase() {
    return this.request(`/databases/${this.credentials.databaseId}`);
  }

  /**
   * Create a new page in the database
   * @param {Object} properties - Page properties payload
   * @returns {Promise<Object>} Created page data
   */
  async createPage(properties) {
    const payload = {
      parent: {
        database_id: this.credentials.databaseId
      },
      properties
    };

    return this.request('/pages', 'POST', payload);
  }
}

/**
 * Property Type Handlers
 * Convert form values to Notion API format
 */
export const PropertyFormatters = {
  title: (value) => ({
    title: [
      {
        text: {
          content: value || ''
        }
      }
    ]
  }),

  rich_text: (value) => ({
    rich_text: [
      {
        text: {
          content: value || ''
        }
      }
    ]
  }),

  url: (value) => ({
    url: value || null
  }),

  number: (value) => ({
    number: value !== '' && value !== null ? parseFloat(value) : null
  }),

  checkbox: (value) => ({
    checkbox: Boolean(value)
  }),

  select: (value) => ({
    select: value ? { name: value } : null
  }),

  multi_select: (values) => ({
    multi_select: Array.isArray(values) 
      ? values.map(name => ({ name }))
      : []
  }),

  date: (value) => ({
    date: value ? { start: value } : null
  }),

  email: (value) => ({
    email: value || null
  }),

  phone_number: (value) => ({
    phone_number: value || null
  }),

  status: (value) => ({
    status: value ? { name: value } : null
  })
};

/**
 * Get tab info from background script
 * @returns {Promise<Object>} Tab URL and title
 */
export async function getTabInfo() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'GET_TAB_INFO' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      
      resolve(response);
    });
  });
}

