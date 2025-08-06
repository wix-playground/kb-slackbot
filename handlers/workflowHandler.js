const axios = require('axios');
const { validators } = require('../utils/validator');
const errorHandler = require('../utils/errorHandler');

// Consolidated workflow handler that replaces both modelhub.js and parts of slack.js
class WorkflowHandler {
  constructor() {
    this.workflowUrl = process.env.WORKFLOW_URL;
    this.workflowEnabled = !!this.workflowUrl;
    
    if (!this.workflowEnabled) {
      console.warn('   WORKFLOW_URL not configured - AI features will be disabled');
    }
  }

  // Process user message through AI workflow
  async processMessageWorkflow(pmMessage, userId) {
    if (!this.workflowEnabled) {
      console.log('= AI workflow disabled - returning fallback response');
      return {
        article_link: '',
        request_type: 'General',
        urgency_level: 'Medium',
        feature_name: 'User Request',
        change_description: pmMessage
      };
    }

    // Validate inputs
    const sanitizedMessage = validators.validateText(pmMessage, 'PM Message', { 
      minLength: 5, 
      maxLength: 10000 
    });
    const sanitizedUserId = validators.validateUserId(userId);

    const apiCall = async () => {
      const { data } = await axios.post(
        this.workflowUrl,
        {
          inputs: {
            pm_message: sanitizedMessage,
            user_id: sanitizedUserId
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000 // 30 second timeout
        }
      );

      return data.outputs;
    };

    return errorHandler.callExternalAPI(
      apiCall, 
      'AI Workflow Service', 
      3 // retries
    );
  }

  // Process complete KB request data for Monday.com submission
  async processKBRequestWorkflow(requestData, userId) {
    // Validate the complete request
    const validatedRequest = validators.validateKBRequest(requestData);
    const sanitizedUserId = validators.validateUserId(userId);

    // Combine all text fields for AI processing
    const combinedMessage = [
      `Subject: ${validatedRequest.subject}`,
      `Product: ${validatedRequest.product}`, 
      `Description: ${validatedRequest.description}`,
      validatedRequest.kbUrls && `KB URLs: ${validatedRequest.kbUrls}`,
      validatedRequest.supportingMaterials && `Supporting Materials: ${validatedRequest.supportingMaterials}`
    ].filter(Boolean).join('\n\n');

    try {
      // Get AI analysis (or fallback if disabled)
      const workflowOutput = await this.processMessageWorkflow(combinedMessage, sanitizedUserId);

      // Merge AI output with validated user data
      return {
        // User provided data (validated)
        subject: validatedRequest.subject,
        taskType: validatedRequest.taskType,
        product: validatedRequest.product,
        description: validatedRequest.description,
        kbUrls: validatedRequest.kbUrls,
        supportingMaterials: validatedRequest.supportingMaterials,
        files: validatedRequest.files,
        slackUser: sanitizedUserId,

        // AI analyzed data (or fallbacks)
        articleLink: workflowOutput?.article_link || '',
        requestType: workflowOutput?.request_type || validatedRequest.taskType,
        urgencyLevel: workflowOutput?.urgency_level || 'Medium',
        featureName: workflowOutput?.feature_name || validatedRequest.subject,
        changeDescription: workflowOutput?.change_description || validatedRequest.description,
        
        // Additional metadata
        processedAt: new Date().toISOString(),
        aiWorkflowEnabled: this.workflowEnabled
      };
    } catch (error) {
      // If AI workflow fails, still return user data
      console.warn('AI workflow failed, proceeding with user data only:', error.message);
      
      return {
        subject: validatedRequest.subject,
        taskType: validatedRequest.taskType,
        product: validatedRequest.product,
        description: validatedRequest.description,
        kbUrls: validatedRequest.kbUrls,
        supportingMaterials: validatedRequest.supportingMaterials,
        files: validatedRequest.files,
        slackUser: sanitizedUserId,
        
        // Fallback values
        articleLink: '',
        requestType: validatedRequest.taskType,
        urgencyLevel: 'Medium',
        featureName: validatedRequest.subject,
        changeDescription: validatedRequest.description,
        
        processedAt: new Date().toISOString(),
        aiProcessingFailed: true
      };
    }
  }

  // Health check for the workflow service
  async healthCheck() {
    if (!this.workflowEnabled) {
      return { 
        status: 'disabled', 
        message: 'WORKFLOW_URL not configured' 
      };
    }

    try {
      await axios.get(`${this.workflowUrl}/health`, { timeout: 5000 });
      return { status: 'healthy' };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        error: error.message 
      };
    }
  }
}

module.exports = new WorkflowHandler();