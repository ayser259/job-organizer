/**
 * Google Sheets API Abstraction Layer
 * Provides a clean interface for Google Sheets operations
 */

export class SheetsAPI {
  constructor() {
    this.credentials = null;
  }

  /**
   * Load credentials from chrome storage
   * @returns {Promise<Object>} Credentials object
   */
  async loadCredentials() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['sheetsApiKey', 'spreadsheetId', 'sheetName'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (!result.sheetsApiKey || !result.spreadsheetId) {
          reject(new Error('SHEETS_NOT_CONFIGURED'));
          return;
        }

        this.credentials = {
          apiKey: result.sheetsApiKey,
          spreadsheetId: result.spreadsheetId,
          sheetName: result.sheetName || 'Sheet1'
        };
        
        resolve(this.credentials);
      });
    });
  }

  /**
   * Send request through background service worker
   * @param {string} endpoint - API endpoint path
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
          type: 'SHEETS_API_REQUEST',
          payload: {
            endpoint,
            method,
            body,
            apiKey: this.credentials.apiKey,
            spreadsheetId: this.credentials.spreadsheetId,
            sheetName: this.credentials.sheetName
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
   * Get spreadsheet metadata and headers
   * @returns {Promise<Object>} Spreadsheet info with headers
   */
  async getSpreadsheet() {
    const range = `${this.credentials.sheetName}!A1:ZZ1`;
    return this.request(`/values/${encodeURIComponent(range)}`);
  }

  /**
   * Append a row to the sheet
   * @param {Array} values - Row values
   * @returns {Promise<Object>} Response from API
   */
  async appendRow(values) {
    const range = `${this.credentials.sheetName}!A:ZZ`;
    return this.request(
      `/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
      'POST',
      {
        values: [values]
      }
    );
  }

  /**
   * Find row by URL (searches in first column assumed to be URL)
   * @param {string} url - URL to search for
   * @returns {Promise<Object|null>} Row data or null if not found
   */
  async findRowByUrl(url) {
    if (!url) return null;

    try {
      // Get all data from sheet
      const range = `${this.credentials.sheetName}!A:ZZ`;
      const result = await this.request(`/values/${encodeURIComponent(range)}`);
      
      if (!result.values || result.values.length < 2) {
        return null; // No data rows (only header)
      }

      // Search for URL in rows (assuming URL is in a column)
      for (let i = 1; i < result.values.length; i++) {
        const row = result.values[i];
        if (row.includes(url)) {
          return {
            rowIndex: i + 1, // 1-based index
            values: row
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding row by URL:', error);
      return null;
    }
  }

  /**
   * Update a row in the sheet
   * @param {number} rowIndex - 1-based row index
   * @param {Array} values - New row values
   * @returns {Promise<Object>} Response from API
   */
  async updateRow(rowIndex, values) {
    const range = `${this.credentials.sheetName}!A${rowIndex}:ZZ${rowIndex}`;
    return this.request(
      `/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
      'PUT',
      {
        values: [values]
      }
    );
  }
}

/**
 * Convert Notion properties to flat array for Google Sheets
 * @param {Object} notionProperties - Notion formatted properties
 * @param {Array} headers - Sheet column headers
 * @returns {Array} Flat array of values matching headers
 */
export function notionToSheetRow(notionProperties, headers) {
  const row = [];
  
  for (const header of headers) {
    const prop = notionProperties[header];
    
    if (!prop) {
      row.push('');
      continue;
    }

    // Convert based on property type
    let value = '';
    
    if (prop.title) {
      value = prop.title[0]?.plain_text || '';
    } else if (prop.rich_text) {
      value = prop.rich_text[0]?.plain_text || '';
    } else if (prop.url) {
      value = prop.url || '';
    } else if (prop.email) {
      value = prop.email || '';
    } else if (prop.phone_number) {
      value = prop.phone_number || '';
    } else if (prop.number !== undefined && prop.number !== null) {
      value = prop.number;
    } else if (prop.checkbox !== undefined) {
      value = prop.checkbox ? 'TRUE' : 'FALSE';
    } else if (prop.select) {
      value = prop.select.name || '';
    } else if (prop.status) {
      value = prop.status.name || '';
    } else if (prop.multi_select) {
      value = prop.multi_select.map(item => item.name).join(', ');
    } else if (prop.date) {
      value = prop.date.start || '';
    }
    
    row.push(value);
  }
  
  return row;
}

/**
 * Check if Google Sheets sync is enabled
 * @returns {Promise<boolean>} Whether Sheets sync is configured
 */
export async function isSheetsEnabled() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['sheetsEnabled', 'sheetsApiKey', 'spreadsheetId'], (result) => {
      const enabled = result.sheetsEnabled !== false && // Default to false if not set
                     result.sheetsApiKey && 
                     result.spreadsheetId;
      resolve(enabled);
    });
  });
}
