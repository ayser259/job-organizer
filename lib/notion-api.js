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
   * Query database for existing pages
   * @param {Object} filter - Notion filter object
   * @returns {Promise<Object>} Query results
   */
  async queryDatabase(filter) {
    const payload = {
      filter
    };

    return this.request(`/databases/${this.credentials.databaseId}/query`, 'POST', payload);
  }

  /**
   * Find page by URL
   * @param {string} url - URL to search for
   * @param {string} urlFieldName - Name of the URL field in database
   * @returns {Promise<Object|null>} Page data or null if not found
   */
  async findPageByUrl(url, urlFieldName) {
    if (!url || !urlFieldName) {
      return null;
    }

    try {
      const result = await this.queryDatabase({
        property: urlFieldName,
        url: {
          equals: url
        }
      });

      if (result.results && result.results.length > 0) {
        return result.results[0]; // Return first match
      }

      return null;
    } catch (error) {
      console.error('Error querying for existing page:', error);
      return null;
    }
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

  /**
   * Update an existing page
   * @param {string} pageId - Page ID to update
   * @param {Object} properties - Page properties payload
   * @returns {Promise<Object>} Updated page data
   */
  async updatePage(pageId, properties) {
    const payload = {
      properties
    };

    return this.request(`/pages/${pageId}`, 'PATCH', payload);
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

  /**
   * Notion limits each rich_text block to 2000 characters.
   * Split content into multiple blocks to preserve full text.
   */
  rich_text: (value) => {
    const content = String(value || '');
    const MAX_CHARS = 2000;
    const blocks = [];
    for (let i = 0; i < content.length; i += MAX_CHARS) {
      blocks.push({
        text: {
          content: content.slice(i, i + MAX_CHARS)
        }
      });
    }
    return { rich_text: blocks.length ? blocks : [{ text: { content: '' } }] };
  },

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
 * Property Parsers
 * Convert Notion API format back to simple form values
 */
export const PropertyParsers = {
  title: (property) => {
    return property.title?.[0]?.plain_text || '';
  },

  rich_text: (property) => {
    return property.rich_text?.[0]?.plain_text || '';
  },

  url: (property) => {
    return property.url || '';
  },

  number: (property) => {
    return property.number !== null ? property.number : '';
  },

  checkbox: (property) => {
    return property.checkbox || false;
  },

  select: (property) => {
    return property.select?.name || '';
  },

  multi_select: (property) => {
    return property.multi_select?.map(opt => opt.name) || [];
  },

  date: (property) => {
    return property.date?.start || '';
  },

  email: (property) => {
    return property.email || '';
  },

  phone_number: (property) => {
    return property.phone_number || '';
  },

  status: (property) => {
    return property.status?.name || '';
  }
};

/**
 * Parse Notion page properties into form values
 * @param {Object} page - Notion page object
 * @param {Object} schema - Database schema
 * @returns {Object} Parsed property values
 */
export function parseNotionPage(page, schema) {
  const values = {};
  
  if (!page.properties || !schema.properties) {
    return values;
  }

  for (const [name, property] of Object.entries(page.properties)) {
    const schemaProperty = schema.properties[name];
    if (!schemaProperty) continue;

    const type = schemaProperty.type;
    const parser = PropertyParsers[type];

    if (parser) {
      values[name] = parser(property);
    }
  }

  return values;
}

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

/**
 * OpenAI Integration for AI-powered form filling
 */
export class OpenAIHelper {
  constructor() {
    this.apiKey = null;
  }

  /**
   * Load API key from storage
   * @returns {Promise<string>} API key
   */
  async loadApiKey() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['openaiApiKey'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (!result.openaiApiKey) {
          reject(new Error('OPENAI_NOT_CONFIGURED'));
          return;
        }

        this.apiKey = result.openaiApiKey;
        resolve(this.apiKey);
      });
    });
  }

  /**
   * Get page content from active tab
   * @returns {Promise<Object>} Page content
   */
  async getPageContent() {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          if (!response) {
            reject(new Error('No response from service worker'));
            return;
          }
          
          if (response.error) {
            reject(new Error(response.error));
            return;
          }
          
          resolve(response);
        });
      } catch (e) {
        reject(new Error('Failed to communicate with extension'));
      }
    });
  }

  /**
   * Build prompt for field extraction
   * @param {Object} schema - Database schema
   * @param {Object} pageContent - Page content
   * @param {Set} hiddenFields - Set of hidden field names to exclude
   * @returns {Array} Messages for OpenAI
   */
  buildPrompt(schema, pageContent, hiddenFields = new Set()) {
    // Build field descriptions from schema, excluding hidden fields
    const fields = [];
    
    for (const [name, prop] of Object.entries(schema.properties)) {
      // Skip hidden fields
      if (hiddenFields.has(name)) {
        continue;
      }
      
      const field = {
        name,
        type: prop.type,
        required: prop.type === 'title'
      };

      // Add options for select/multi_select
      if (prop.type === 'select' && prop.select?.options) {
        field.options = prop.select.options.map(o => o.name);
      }
      if (prop.type === 'multi_select' && prop.multi_select?.options) {
        field.options = prop.multi_select.options.map(o => o.name);
      }
      if (prop.type === 'status' && prop.status?.options) {
        field.options = prop.status.options.map(o => o.name);
      }

      fields.push(field);
    }

    const systemPrompt = `You are a data extraction assistant. Your job is to analyze content and extract relevant information to fill database fields.

You will receive:
1. A list of database fields with their types and any available options
2. Text content to analyze

Your task:
- Analyze the content thoroughly and extract information for as many fields as possible
- Make reasonable inferences based on context - you don't need to be 100% certain
- For select/multi_select/status fields, ONLY use values from the provided options list
- Return a JSON object with field names as keys and extracted values

Field types to handle:
- title: A short title/name (string) - extract from headings, job titles, product names, etc.
- rich_text: Longer text content (string) - extract descriptions, requirements, details, notes, etc.
  * Special attention for these common field names:
    - "Raw JD" or "Raw Job Description" or "Original Description": Put the FULL ORIGINAL content here verbatim - do not summarize or edit
    - "Company Summary" or "Company": Extract the industry, mission, what the company is trying to do, their current focus/goals
    - "Role Summary" or "Role" or "Job Summary": Extract what the person needs to do, own, and take care of in this specific role - be as specific as possible, include responsibilities and ownership areas
    - "What are they looking for" or "Requirements" or "Candidate Requirements": Extract key skills needed for the role, key skills that will help the candidate succeed, qualifications, and what makes a good fit
- url: A URL (string, must be valid URL)
- number: A numeric value (number) - extract salaries, quantities, years of experience, etc.
- checkbox: True/false (boolean) - infer from context (e.g., "remote" = true, "full-time" = true)
- select: Single choice from options (string, must match an option exactly) - pick the closest match
- multi_select: Multiple choices from options (array of strings, must match options exactly) - select all that apply
- status: Status from options (string, must match an option exactly) - infer from context
- date: A date (string in YYYY-MM-DD format) - extract posted dates, deadlines, etc.
- email: An email address (string)
- phone_number: A phone number (string)

Extraction guidelines:
- Be proactive - fill fields even if you need to make reasonable inferences
- For rich_text fields, extract comprehensive information:
  * "Raw JD" / "Raw Job Description" / "Original Description": Copy the ENTIRE ORIGINAL content verbatim - include everything, don't summarize
  * "Company Summary" / "Company": Look for sections about the company's industry, mission statement, what they do, their goals, current initiatives, company culture, values
  * "Role Summary" / "Role" / "Job Summary": Extract specific responsibilities, what the person will own, what they'll take care of, day-to-day tasks, key deliverables - be detailed and specific
  * "What are they looking for" / "Requirements" / "Candidate Requirements": Extract key skills, technical requirements, soft skills, qualifications, experience needed, what will help candidates succeed in the role
- For select/multi_select fields, choose the best matching option(s) from the provided list
- If a field name suggests what to look for (e.g., "Requirements", "Skills", "Location"), extract that information
- Use context clues - if content mentions "remote work", set remote checkbox to true
- For numbers, extract any numeric values that seem relevant (salaries, years, quantities)
- Don't leave fields empty just because you're not 100% certain - make your best guess based on the content
- When extracting role summaries and requirements, prioritize specificity - include concrete details rather than generic descriptions

Important rules:
- For select/multi_select/status, only use the exact option names provided (case-insensitive matching is okay)
- Return a JSON object with all fields you can reasonably extract or infer`;

    const userPrompt = `## Database Fields:
${JSON.stringify(fields, null, 2)}

## Page Information:
Title: ${pageContent.title}
URL: ${pageContent.url}
Description: ${pageContent.description || 'N/A'}

## Page Content:
${pageContent.content}

${pageContent.structuredData ? `## Structured Data:\n${JSON.stringify(pageContent.structuredData, null, 2)}` : ''}

---
Extract the relevant information and return a JSON object with field names as keys. Fill as many fields as possible based on the content, making reasonable inferences where needed.`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
  }

  /**
   * Extract fields using OpenAI
   * @param {Object} schema - Database schema
   * @param {Object} pageContent - Page content
   * @param {Set} hiddenFields - Set of hidden field names to exclude
   * @returns {Promise<Object>} Extracted fields
   */
  async extractFields(schema, pageContent, hiddenFields = new Set()) {
    if (!this.apiKey) {
      await this.loadApiKey();
    }

    const messages = this.buildPrompt(schema, pageContent, hiddenFields);

    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(
          {
            type: 'OPENAI_API_REQUEST',
            payload: {
              messages,
              apiKey: this.apiKey
            }
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            
            if (!response) {
              reject(new Error('No response from service worker'));
              return;
            }
            
            if (response.error) {
              reject(new Error(response.error));
              return;
            }

            try {
              const data = response.data || response;
              let content = data.choices?.[0]?.message?.content;
              
              if (!content || typeof content !== 'string') {
                reject(new Error('Empty response from AI'));
                return;
              }
              content = content.trim();
              // Strip markdown code block if present (e.g. ```json ... ``` or ``` ... ```)
              const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
              if (codeBlockMatch) {
                content = codeBlockMatch[1].trim();
              }
              const extracted = JSON.parse(content);
              if (typeof extracted !== 'object' || extracted === null) {
                reject(new Error('AI response was not a JSON object'));
                return;
              }
              resolve(extracted);
            } catch (e) {
              console.error('Parse error:', e);
              reject(new Error('Failed to parse AI response: ' + (e.message || 'invalid JSON')));
            }
          }
        );
      } catch (e) {
        reject(new Error('Failed to communicate with extension'));
      }
    });
  }
}

