require('dotenv').config();
const { App } = require('@slack/bolt');
const express = require('express');
const sessionManager = require('./utils/sessionManager');
const errorHandler = require('./utils/errorHandler');
const { validators, ValidationError } = require('./utils/validator');
const workflowHandler = require('./handlers/workflowHandler');
const mondayAPI = require('./monday');

// Initialize the app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: 'INFO'
});

// Updated task type options to match Monday.com form
const taskTypeOptions = [
  'Quick Update',
  'Content Edit',
  'New Feature',
  'Create new Feature Request',
  'Launch Feature Request'
];

// Priority options
const priorityOptions = [
  'High',
  'Medium', 
  'Low'
];

// Language options for New Features (simplified)
const languageOptions = [
  'English only',
  'Multiple languages',
  'Will specify later'
];

// Updated step flow constants (simplified)
const STEPS = {
  START: 'start',
  TASK_TYPE: 'task_type',
  PRIORITY: 'priority',
  PRODUCT: 'product',
  DESCRIPTION: 'description',
  SUBMIT: 'submit'
};

// Reusable function to send interactive messages
async function sendStepMessage(client, channel, text, blocks = []) {
  await client.chat.postMessage({
    channel,
    text,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text }
      },
      ...blocks
    ]
  });
}

// Step 1: Start KB request flow
async function startKBRequest(args) {
  const { client, command, ack } = args;
  
  await errorHandler.withSessionErrorHandling(command.user_id, async () => {
    await ack();

    // Open DM channel
    const { channel } = await client.conversations.open({ users: command.user_id });

    // Create new session
    sessionManager.createSession(command.user_id, {
      step: STEPS.START,
      channel: channel.id,
      data: {}
    });

    await sendStepMessage(
      client,
      channel.id,
      `<¯ Hi! I'll help you create a KB request.\n\nWhat's your request about?`,
      [{
        type: 'section',
        text: { type: 'mrkdwn', text: '=¬ Brief summary (e.g. "Update pricing page for new plans"):' }
      }]
    );

    sessionManager.updateSession(command.user_id, { step: STEPS.TASK_TYPE });
  }, sessionManager, client);
}

// Step 2: Handle subject and ask for task type
async function handleSubjectAndTaskType(args) {
  const { client, event } = args;
  const session = sessionManager.getSession(event.user);

  if (!session || session.step !== STEPS.TASK_TYPE) return;

  await errorHandler.withSessionErrorHandling(event.user, async () => {
    // Validate and store subject
    const subject = validators.validateText(event.text, 'Subject', { 
      minLength: 3, 
      maxLength: 200 
    });

    session.data.subject = subject;

    await sendStepMessage(
      client,
      event.channel,
      `What type of task is this?`,
      [{
        type: 'actions',
        elements: [{
          type: 'static_select',
          placeholder: { type: 'plain_text', text: 'Select task type...' },
          action_id: 'select_task_type',
          options: taskTypeOptions.map(type => ({
            text: { type: 'plain_text', text: type },
            value: type
          }))
        }]
      }]
    );

    sessionManager.updateSession(event.user, { 
      step: STEPS.PRIORITY,
      data: session.data 
    });
  }, sessionManager, client);
}

// Step 3: Handle task type selection and ask for priority
async function handleTaskTypeSelection(args) {
  const { client, body, ack } = args;
  const session = sessionManager.getSession(body.user.id);

  if (!session || session.step !== STEPS.PRIORITY) return;

  await errorHandler.withSessionErrorHandling(body.user.id, async () => {
    await ack();

    const taskType = validators.validateTaskType(body.actions[0].selected_option.value);
    session.data.taskType = taskType;

    await sendStepMessage(
      client,
      body.channel.id,
      `What's the priority?`,
      [{
        type: 'actions',
        elements: [{
          type: 'static_select',
          placeholder: { type: 'plain_text', text: 'Select priority...' },
          action_id: 'select_priority',
          options: priorityOptions.map(priority => ({
            text: { type: 'plain_text', text: priority },
            value: priority
          }))
        }]
      }]
    );

    sessionManager.updateSession(body.user.id, { 
      step: STEPS.PRODUCT,
      data: session.data 
    });
  }, sessionManager, client);
}

// Step 4: Handle priority selection and ask for product
async function handlePrioritySelection(args) {
  const { client, body, ack } = args;
  const session = sessionManager.getSession(body.user.id);

  if (!session || session.step !== STEPS.PRODUCT) return;

  await errorHandler.withSessionErrorHandling(body.user.id, async () => {
    await ack();

    const priority = body.actions[0].selected_option.value;
    session.data.priority = priority;

    await sendStepMessage(
      client,
      body.channel.id,
      `Which product?`,
      [{
        type: 'section',
        text: { type: 'mrkdwn', text: '<÷ Just the product name (e.g. Stores, Editor, Blog):' }
      }]
    );

    sessionManager.updateSession(body.user.id, { 
      step: STEPS.DESCRIPTION,
      data: session.data 
    });
  }, sessionManager, client);
}

// Step 5: Handle product and ask for description
async function handleProductAndDescription(args) {
  const { client, event } = args;
  const session = sessionManager.getSession(event.user);

  if (!session || session.step !== STEPS.DESCRIPTION) return;

  await errorHandler.withSessionErrorHandling(event.user, async () => {
    // Validate and store product
    const product = validators.validateText(event.text, 'Product', { 
      minLength: 2, 
      maxLength: 100 
    });

    session.data.product = product;

    // Ask for details based on task type with simplified prompts
    const taskType = session.data.taskType;
    let promptText;

    if (taskType === 'New Feature') {
      promptText = `Tell me more about this new feature:

=¡ What's the feature?
=Å Release date/status?
< Languages needed?`;
    } else if (taskType === 'Content Edit') {
      promptText = `Tell me about the changes needed:

 What needs updating?
= Any specific articles?`;
    } else if (taskType === 'Launch Feature Request') {
      promptText = `About this feature launch:

= Link to existing Feature Request?
 Confirmed live for 100% EN users?`;
    } else if (taskType === 'Create new Feature Request') {
      promptText = `About this new feature request:

=¡ What feature do you need?
=Ë Why is it needed?`;
    } else { // Quick Update
      promptText = `What needs to be updated:

¡ What specific changes?
=Í Which articles/sections?`;
    }

    await sendStepMessage(
      client,
      event.channel,
      promptText
    );

    sessionManager.updateSession(event.user, { 
      step: STEPS.SUBMIT,
      data: session.data 
    });
  }, sessionManager, client);
}

// Step 6: Handle description and show submit
async function handleDescriptionAndSubmit(args) {
  const { client, event } = args;
  const session = sessionManager.getSession(event.user);

  if (!session || session.step !== STEPS.SUBMIT) return;

  await errorHandler.withSessionErrorHandling(event.user, async () => {
    // Store the description
    const description = validators.validateText(event.text, 'Description', { 
      minLength: 10, 
      maxLength: 5000 
    });

    session.data.description = description;
    session.data.files = session.data.files || [];

    await sendStepMessage(
      client,
      event.channel,
      `<¯ Ready to submit!`,
      [{
        type: 'section',
        text: { type: 'mrkdwn', text: '=Î Add files or submit now:' }
      },
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: '=€ Submit Request' },
          action_id: 'submit_kb_request',
          style: 'primary'
        }]
      }]
    );

    // Keep in submit step for file uploads
    sessionManager.updateSession(event.user, { data: session.data });
  }, sessionManager, client);
}

// Handle file uploads
async function handleFileUpload(args) {
  const { client, event } = args;
  const session = sessionManager.getSession(event.user);

  if (!session || session.step !== STEPS.SUBMIT) return;

  await errorHandler.withSessionErrorHandling(event.user, async () => {
    if (event.files && event.files.length > 0) {
      // Validate files
      const fileIds = validators.validateFiles(event.files.map(f => f.id));
      
      session.data.files = session.data.files || [];
      session.data.files.push(...fileIds);

      await client.chat.postMessage({
        channel: event.channel,
        text: ` Added ${event.files.length} file(s)`,
        blocks: [{
          type: 'actions',
          elements: [{
            type: 'button',
            text: { type: 'plain_text', text: '=€ Submit Request' },
            action_id: 'submit_kb_request',
            style: 'primary'
          }]
        }]
      });

      sessionManager.updateSession(event.user, { data: session.data });
    }
  }, sessionManager, client);
}

// Handle final submission
async function handleSubmission(args) {
  const { client, body, ack } = args;
  const session = sessionManager.getSession(body.user.id);

  if (!session || session.step !== STEPS.SUBMIT) return;

  await errorHandler.withSessionErrorHandling(body.user.id, async () => {
    await ack();

    await client.chat.postMessage({
      channel: body.channel.id,
      text: 'ó Submitting...'
    });

    // Add user info to the request data
    session.data.slackUser = body.user.id;

    // Process through AI workflow and create Monday.com item
    const processedData = await workflowHandler.processKBRequestWorkflow(
      session.data, 
      body.user.id
    );

    const mondayItem = await mondayAPI.createKBRequest(processedData);

    // Upload files if any
    if (session.data.files && session.data.files.length > 0) {
      for (const fileId of session.data.files) {
        try {
          await mondayAPI.uploadFile(mondayItem.id, `file-${fileId}`, client, fileId);
        } catch (error) {
          console.warn(`Failed to upload file ${fileId}:`, error.message);
        }
      }
    }

    await client.chat.postMessage({
      channel: body.channel.id,
      text: '<‰ KB Request Submitted!',
      blocks: [
        {
          "type": "header",
          "text": {
            "type": "plain_text",
            "text": "<‰ Request Submitted!"
          }
        },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": `**${session.data.subject}**`
          }
        },
        {
          "type": "section",
          "fields": [
            {
              "type": "mrkdwn",
              "text": `*Type:* ${session.data.taskType}`
            },
            {
              "type": "mrkdwn", 
              "text": `*Priority:* ${session.data.priority}`
            }
          ]
        },
        {
          "type": "actions",
          "elements": [
            {
              "type": "button",
              "text": {
                "type": "plain_text",
                "text": "=Ê View on Monday.com"
              },
              "url": mondayItem.url,
              "style": "primary"
            },
            {
              "type": "button",
              "text": {
                "type": "plain_text",
                "text": "• Submit Another"
              },
              "action_id": "start_another_request"
            }
          ]
        }
      ]
    });

    // Clean up session
    sessionManager.cleanupSession(body.user.id);
  }, sessionManager, client);
}

// Register all handlers with error wrapping
app.command('/kb-request', errorHandler.wrapSlackHandler(startKBRequest));

app.event('message', errorHandler.wrapSlackHandler(async (args) => {
  const { event } = args;
  
  // Only process DM messages and ignore bot messages
  if (event.channel_type !== 'im' || event.bot_id || event.subtype) return;
  
  const session = sessionManager.getSession(event.user);
  if (!session) return;

  switch (session.step) {
    case STEPS.TASK_TYPE:
      return handleSubjectAndTaskType(args);
    case STEPS.DESCRIPTION:
      return handleProductAndDescription(args);
    case STEPS.SUBMIT:
      if (event.files && event.files.length > 0) {
        return handleFileUpload(args);
      } else {
        return handleDescriptionAndSubmit(args);
      }
  }
}));

app.action('select_task_type', errorHandler.wrapSlackHandler(handleTaskTypeSelection));
app.action('select_priority', errorHandler.wrapSlackHandler(handlePrioritySelection));
app.action('submit_kb_request', errorHandler.wrapSlackHandler(handleSubmission));
app.action('retry_action', errorHandler.wrapSlackHandler(startKBRequest));

// Handle "Submit Another Request" button
app.action('start_another_request', async ({ ack, body, client }) => {
  await ack();
  
  // Restart the flow
  sessionManager.createSession(body.user.id, {
    step: STEPS.START,
    channel: body.channel.id,
    data: {}
  });

  await client.chat.postMessage({
    channel: body.channel.id,
    text: "<¯ Let's create another KB request!",
    blocks: [{
      type: 'section',
      text: { 
        type: 'mrkdwn', 
        text: 'What\'s your request about?\n\n=¬ Brief summary:' 
      }
    }]
  });

  sessionManager.updateSession(body.user.id, { step: STEPS.TASK_TYPE });
});

// Health check endpoint
app.event('app_mention', async ({ event, client, say }) => {
  if (event.text.includes('health')) {
    try {
      const mondayHealth = await mondayAPI.healthCheck();
      const workflowHealth = await workflowHandler.healthCheck();
      const sessionCount = sessionManager.getActiveSessionCount();

      await say(`= *Health Status:*\n" Monday.com: ${mondayHealth.status}\n" AI Workflow: ${workflowHealth.status}\n" Active Sessions: ${sessionCount}`);
    } catch (error) {
      await say('L Health check failed');
    }
  }
});

// Express server for health checks
const server = express();
server.get('/', (req, res) => res.send('KB Request Bot is running'));
server.get('/health', async (req, res) => {
  try {
    const mondayHealth = await mondayAPI.healthCheck();
    const workflowHealth = await workflowHandler.healthCheck();
    const sessionCount = sessionManager.getActiveSessionCount();

    res.json({
      status: 'healthy',
      services: {
        monday: mondayHealth,
        workflow: workflowHealth
      },
      activeSessions: sessionCount
    });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

server.listen(process.env.PORT || 3000, () => {
  console.log(`=€ Listening on port ${process.env.PORT || 3000}`);
});

// Start the app
(async () => {
  try {
    await app.start();
    console.log('¡ KB Slackbot app is running with comprehensive error handling!');
  } catch (error) {
    console.error('Failed to start the app:', error);
    process.exit(1);
  }
})();