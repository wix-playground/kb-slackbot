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

// Task type options for the dropdown
const taskTypeOptions = [
  'New Feature',
  'Content Update',
  'Feature Request', 
  'Content Flag',
  'Content Edit'
];

// Step flow constants
const STEPS = {
  START: 'start',
  TASK_TYPE: 'task_type',
  PRODUCT: 'product',
  DESCRIPTION: 'description',
  KB_URLS: 'kb_urls',
  SUPPORTING_MATERIALS: 'supporting_materials',
  FILES: 'files',
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
      `<¯ Hi! I'll help you create a KB request. Let's start!\n\n*Step 1 of 6:* What's the subject of your request?`,
      [{
        type: 'section',
        text: { type: 'mrkdwn', text: '=Ý Please describe your request in 1-2 sentences:' }
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
      `*Step 2 of 6:* What type of task is this?`,
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
      step: STEPS.PRODUCT,
      data: session.data 
    });
  }, sessionManager, client);
}

// Handle task type selection
async function handleTaskTypeSelection(args) {
  const { client, body, ack } = args;
  const session = sessionManager.getSession(body.user.id);

  if (!session || session.step !== STEPS.PRODUCT) return;

  await errorHandler.withSessionErrorHandling(body.user.id, async () => {
    await ack();

    const taskType = validators.validateTaskType(body.actions[0].selected_option.value);
    session.data.taskType = taskType;

    await sendStepMessage(
      client,
      body.channel.id,
      ` Task type: **${taskType}**\n\n*Step 3 of 6:* Which product is this related to?`,
      [{
        type: 'section',
        text: { type: 'mrkdwn', text: '<÷ Please specify the Wix product (e.g., Editor, Stores, Blog, etc.):' }
      }]
    );

    sessionManager.updateSession(body.user.id, { 
      step: STEPS.DESCRIPTION,
      data: session.data 
    });
  }, sessionManager, client);
}

// Step 3: Handle product and ask for description
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

    await sendStepMessage(
      client,
      event.channel,
      ` Product: **${product}**\n\n*Step 4 of 6:* Please provide a detailed description of your request.`,
      [{
        type: 'section',
        text: { 
          type: 'mrkdwn', 
          text: '=Ý Include:\n" What needs to be changed or added?\n" Why is this needed?\n" Any specific requirements or context' 
        }
      }]
    );

    sessionManager.updateSession(event.user, { 
      step: STEPS.KB_URLS,
      data: session.data 
    });
  }, sessionManager, client);
}

// Step 4: Handle description and ask for KB URLs
async function handleDescriptionAndKBUrls(args) {
  const { client, event } = args;
  const session = sessionManager.getSession(event.user);

  if (!session || session.step !== STEPS.KB_URLS) return;

  await errorHandler.withSessionErrorHandling(event.user, async () => {
    // Validate and store description
    const description = validators.validateText(event.text, 'Description', { 
      minLength: 10, 
      maxLength: 5000 
    });

    session.data.description = description;

    await sendStepMessage(
      client,
      event.channel,
      `*Step 5 of 6:* Do you have any relevant KB article URLs?`,
      [{
        type: 'section',
        text: { 
          type: 'mrkdwn', 
          text: '= Please provide URLs of related KB articles, or type "none" if not applicable:' 
        }
      }]
    );

    sessionManager.updateSession(event.user, { 
      step: STEPS.SUPPORTING_MATERIALS,
      data: session.data 
    });
  }, sessionManager, client);
}

// Step 5: Handle KB URLs and ask for supporting materials
async function handleKBUrlsAndSupportingMaterials(args) {
  const { client, event } = args;
  const session = sessionManager.getSession(event.user);

  if (!session || session.step !== STEPS.SUPPORTING_MATERIALS) return;

  await errorHandler.withSessionErrorHandling(event.user, async () => {
    // Validate and store KB URLs (optional)
    let kbUrls = '';
    if (event.text.toLowerCase() !== 'none') {
      kbUrls = validators.validateText(event.text, 'KB URLs', { 
        required: false,
        maxLength: 2000 
      });
    }

    session.data.kbUrls = kbUrls;

    await sendStepMessage(
      client,
      event.channel,
      `*Step 6 of 6:* Any additional supporting materials or context?`,
      [{
        type: 'section',
        text: { 
          type: 'mrkdwn', 
          text: '=Ý Please provide any additional context, or type "none" if not applicable.\n\nAfter this, you can also upload files if needed.' 
        }
      }]
    );

    sessionManager.updateSession(event.user, { 
      step: STEPS.FILES,
      data: session.data 
    });
  }, sessionManager, client);
}

// Step 6: Handle supporting materials and ask for files
async function handleSupportingMaterialsAndFiles(args) {
  const { client, event } = args;
  const session = sessionManager.getSession(event.user);

  if (!session || session.step !== STEPS.FILES) return;

  await errorHandler.withSessionErrorHandling(event.user, async () => {
    // Validate and store supporting materials (optional)
    let supportingMaterials = '';
    if (event.text.toLowerCase() !== 'none') {
      supportingMaterials = validators.validateText(event.text, 'Supporting Materials', { 
        required: false,
        maxLength: 2000 
      });
    }

    session.data.supportingMaterials = supportingMaterials;
    session.data.files = session.data.files || [];

    await sendStepMessage(
      client,
      event.channel,
      `=Î *Optional:* Upload any files (screenshots, documents, etc.) or click "Submit" to finish.`,
      [{
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'Submit Request' },
          action_id: 'submit_kb_request',
          style: 'primary'
        }]
      }]
    );

    sessionManager.updateSession(event.user, { 
      step: STEPS.SUBMIT,
      data: session.data 
    });
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
        text: ` Added ${event.files.length} file(s). Upload more files or click "Submit Request" to finish.`,
        blocks: [{
          type: 'actions',
          elements: [{
            type: 'button',
            text: { type: 'plain_text', text: 'Submit Request' },
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
      text: 'ó Processing your KB request...'
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
      text: '<‰ KB Request Submitted Successfully!',
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
            "text": ` **${session.data.subject}** has been submitted to the KB team.`
          }
        },
        {
          "type": "section",
          "fields": [
            {
              "type": "mrkdwn",
              "text": `*Type:*\n${session.data.taskType}`
            },
            {
              "type": "mrkdwn", 
              "text": `*Product:*\n${session.data.product}`
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
    case STEPS.KB_URLS:
      return handleDescriptionAndKBUrls(args);
    case STEPS.SUPPORTING_MATERIALS:
      return handleKBUrlsAndSupportingMaterials(args);
    case STEPS.FILES:
      return handleSupportingMaterialsAndFiles(args);
    case STEPS.SUBMIT:
      return handleFileUpload(args);
  }
}));

app.action('select_task_type', errorHandler.wrapSlackHandler(handleTaskTypeSelection));
app.action('submit_kb_request', errorHandler.wrapSlackHandler(handleSubmission));
app.action('retry_action', errorHandler.wrapSlackHandler(startKBRequest));

// NEW: Handle "Submit Another Request" button
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
        text: '*Step 1 of 6:* What\'s the subject of your new request?\n\n=Ý Please describe your request in 1-2 sentences:' 
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