const { ValidationError } = require('./validator');

class ErrorHandler {
  constructor(logger = console) {
    this.logger = logger;
  }

  // Create standardized error response for Slack
  createSlackErrorMessage(error, context = {}) {
    const { channel, user } = context;
    
    let userMessage = '  Sorry, something went wrong. Please try again.';
    let shouldRetry = true;

    if (error instanceof ValidationError) {
      userMessage = `L ${error.message}`;
      shouldRetry = false;
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      userMessage = '= Connection issue. Please try again in a moment.';
    } else if (error.response?.status === 429) {
      userMessage = 'ó Too many requests. Please wait a moment and try again.';
    } else if (error.response?.status >= 400 && error.response?.status < 500) {
      userMessage = '  There was an issue with your request. Please check your input and try again.';
      shouldRetry = false;
    } else if (error.response?.status >= 500) {
      userMessage = '=' Service temporarily unavailable. Please try again later.';
    }

    return {
      text: userMessage,
      shouldRetry,
      blocks: shouldRetry ? [{
        type: 'section',
        text: { type: 'mrkdwn', text: userMessage }
      }, {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'Try Again' },
          action_id: 'retry_action',
          value: 'retry'
        }]
      }] : undefined
    };
  }

  // Log error with context
  logError(error, context = {}) {
    const timestamp = new Date().toISOString();
    const errorInfo = {
      timestamp,
      message: error.message,
      stack: error.stack,
      name: error.name,
      context
    };

    if (error.response) {
      errorInfo.httpStatus = error.response.status;
      errorInfo.httpData = error.response.data;
    }

    this.logger.error('Bot Error:', JSON.stringify(errorInfo, null, 2));
  }

  // Handle async function with comprehensive error handling
  async handleAsync(asyncFunc, context = {}, client = null) {
    try {
      return await asyncFunc();
    } catch (error) {
      this.logError(error, context);

      if (client && context.channel) {
        const errorMessage = this.createSlackErrorMessage(error, context);
        try {
          await client.chat.postMessage({
            channel: context.channel,
            ...errorMessage
          });
        } catch (slackError) {
          this.logger.error('Failed to send error message to Slack:', slackError);
        }
      }

      // Re-throw validation errors for specific handling
      if (error instanceof ValidationError) {
        throw error;
      }

      // For other errors, throw a generic error
      throw new Error('An unexpected error occurred');
    }
  }

  // Wrapper for Slack event handlers
  wrapSlackHandler(handler) {
    return async (args) => {
      const { client, event, body } = args;
      const context = {
        channel: event?.channel || body?.channel?.id,
        user: event?.user || body?.user?.id,
        action: handler.name || 'unknown'
      };

      await this.handleAsync(
        () => handler(args),
        context,
        client
      );
    };
  }

  // Wrapper for external API calls
  async callExternalAPI(apiCall, serviceName, retries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        this.logError(error, { 
          service: serviceName, 
          attempt, 
          maxRetries: retries 
        });

        if (attempt === retries) {
          throw new Error(`${serviceName} service unavailable after ${retries} attempts`);
        }

        if (error.response?.status >= 400 && error.response?.status < 500) {
          // Don't retry client errors
          throw error;
        }

        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
      }
    }
  }

  // Create error boundary for session operations
  async withSessionErrorHandling(userId, operation, sessionManager, client) {
    try {
      return await operation();
    } catch (error) {
      // Always clean up session on error
      sessionManager.cleanupSession(userId);
      
      if (error instanceof ValidationError) {
        // Send validation error to user
        const session = sessionManager.getSession(userId);
        const channel = session?.channel;
        
        if (client && channel) {
          await client.chat.postMessage({
            channel,
            text: `L ${error.message}\n\n= Please try again from the beginning by typing \`/kb-request\``
          });
        }
      }
      
      throw error;
    }
  }
}

// Export singleton
module.exports = new ErrorHandler();