const axios = require('axios');
const { validators } = require('./utils/validator');
const errorHandler = require('./utils/errorHandler');

class MondayAPI {
  constructor() {
    this.apiToken = process.env.MONDAY_API_TOKEN;
    this.boardId = process.env.MONDAY_BOARD_ID;
    this.mondayBoardUrl = process.env.MONDAY_BOARD_URL || 'https://wix.monday.com/boards';
    
    if (!this.apiToken || !this.boardId) {
      throw new Error('MONDAY_API_TOKEN and MONDAY_BOARD_ID environment variables are required');
    }
  }

  // Execute GraphQL query with error handling and retry logic
  async executeQuery(query, variables = {}) {
    const apiCall = async () => {
      const { data } = await axios.post(
        'https://api.monday.com/v2',
        {
          query,
          variables
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': this.apiToken
          },
          timeout: 30000
        }
      );

      if (data.errors && data.errors.length > 0) {
        const error = new Error(`Monday.com GraphQL Error: ${data.errors[0].message}`);
        error.graphqlErrors = data.errors;
        throw error;
      }

      return data.data;
    };

    return errorHandler.callExternalAPI(apiCall, 'Monday.com API', 3);
  }

  // Upload file to Monday.com safely
  async uploadFile(filePath, fileName, client, fileId) {
    try {
      // Get file info from Slack
      const fileInfo = await client.files.info({ file: fileId });
      
      if (!fileInfo.file || !fileInfo.file.url_private) {
        throw new Error('Unable to access file from Slack');
      }

      // Download file from Slack
      const fileResponse = await axios.get(fileInfo.file.url_private, {
        headers: {
          'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
        },
        responseType: 'stream',
        timeout: 60000 // 1 minute for file download
      });

      // Upload to Monday.com
      const formData = new FormData();
      formData.append('query', `
        mutation add_file($item_id: ID!, $file: File!) {
          add_file_to_item(item_id: $item_id, file: $file) {
            id
            name
            url
          }
        }
      `);
      formData.append('variables', JSON.stringify({ item_id: filePath }));
      formData.append('file', fileResponse.data, { filename: validators.validateText(fileName, 'fileName', { maxLength: 255 }) });

      const { data } = await axios.post('https://api.monday.com/v2/file', formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': this.apiToken
        },
        timeout: 120000 // 2 minutes for upload
      });

      return data.data.add_file_to_item;
    } catch (error) {
      console.error(`Failed to upload file ${fileName}:`, error.message);
      throw new Error(`File upload failed: ${fileName}`);
    }
  }

  // Create KB request item in Monday.com with proper sanitization
  async createKBRequest(requestData) {
    // Sanitize all text inputs for GraphQL
    const sanitizedData = {};
    for (const [key, value] of Object.entries(requestData)) {
      if (typeof value === 'string') {
        sanitizedData[key] = validators.sanitizeForGraphQL(value);
      } else {
        sanitizedData[key] = value;
      }
    }

    // Validate user ID
    const sanitizedUserId = validators.validateUserId(sanitizedData.slackUser);

    const query = `
      mutation create_kb_request(
        $board_id: ID!
        $item_name: String!
        $column_values: JSON!
      ) {
        create_item(
          board_id: $board_id
          item_name: $item_name
          column_values: $column_values
        ) {
          id
          name
          url
        }
      }
    `;

    // Build column values object
    const columnValues = {
      "task_type": sanitizedData.taskType,
      "text_1": sanitizedData.product, 
      "long_text": sanitizedData.description,
      "text_11": sanitizedData.kbUrls,
      "text": sanitizedData.supportingMaterials,
      "text_13": sanitizedData.articleLink,
      "text_12": sanitizedData.requestType,
      "text_14": sanitizedData.urgencyLevel,
      "text_15": sanitizedData.featureName,
      "text_16": sanitizedData.changeDescription,
      "text_17": sanitizedUserId
    };

    const variables = {
      board_id: this.boardId,
      item_name: sanitizedData.subject,
      column_values: JSON.stringify(columnValues)
    };

    const result = await this.executeQuery(query, variables);
    const createdItem = result.create_item;

    return {
      id: createdItem.id,
      name: createdItem.name,
      url: `${this.mondayBoardUrl}/${this.boardId}/pulses/${createdItem.id}`,
      mondayUrl: createdItem.url
    };
  }

  // Health check for Monday.com API
  async healthCheck() {
    try {
      const query = `query { me { name } }`;
      await this.executeQuery(query);
      return { status: 'healthy' };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error.message 
      };
    }
  }

  // Legacy createMondayItem function - kept for backward compatibility
  async createMondayItem(legacyData) {
    console.warn('Warning: createMondayItem is deprecated. Use createKBRequest instead.');
    
    // Convert legacy format to new format
    const requestData = {
      subject: `KB Request from ${legacyData.user}`,
      taskType: legacyData.requestType || 'Content Update',
      product: 'Legacy Request',
      description: legacyData.description || '',
      articleLink: legacyData.articleLink || '',
      slackUser: legacyData.user,
      files: legacyData.files || []
    };

    try {
      const result = await this.createKBRequest(requestData);
      return result.url; // Return URL for backward compatibility
    } catch (error) {
      console.error('Legacy createMondayItem failed:', error);
      throw error;
    }
  }
}

module.exports = new MondayAPI();