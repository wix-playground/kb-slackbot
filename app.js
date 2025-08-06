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

// Language options for New Features
const languageOptions = [
  'English only',
  'English + Spanish',
  'English + Portuguese', 
  'English + Japanese',
  'All languages',
  'Other (specify in description)'
];

// Updated step flow constants
const STEPS = {
  START: 'start',
  TASK_TYPE: 'task_type',
  PRIORITY: 'priority',
  PRODUCT: 'product',
  CONDITIONAL: 'conditional',
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

// Step 1: Start KB request flow (no step numbers)
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
      `<¯ Hi! I'll help you create a KB request. What's the subject of your request?`,
      [{
        type: 'section',
        text: { type: 'mrkdwn', text: '=Ý Please describe your request in 1-2 sentences (e.g., "Adding Products to Wix Stores article needs update"):' }
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
        type: 'section',
        text: { 
          type: 'mrkdwn', 
          text: 'Select an option:\n" **Quick Update:** Small changes such as fixing typos, adding notes\n" **Content Edit:** Major changes to articles or new articles for existing features\n" **New Feature:** Articles for a new feature\n" **Create new Feature Request:** Creating a Feature Request\n" **Launch Feature Request:** Resolving an existing Feature Request'
        }
      },
      {
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
      ` Task type: **${taskType}**\n\nWhat's the requested priority for this task?`,
      [{
        type: 'section',
        text: { type: 'mrkdwn', text: 'ð *Note:* An estimated due date will be assigned automatically for all Non-New Feature requests. For New Features, please include the tentative Release Date in the description.' }
      },
      {
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
      ` Priority: **${priority}**\n\nWhich Wix product is this related to?`,
      [{
        type: 'section',
        text: { type: 'mrkdwn', text: '<÷ Start typing the product name (e.g., Editor, Stores, Blog, Bookings, etc.):' }
      }]
    );

    sessionManager.updateSession(body.user.id, { 
      step: STEPS.CONDITIONAL,
      data: session.data 
    });
  }, sessionManager, client);
}

// Step 5: Handle product and ask conditional questions based on task type
async function handleProductAndConditional(args) {
  const { client, event } = args;
  const session = sessionManager.getSession(event.user);

  if (!session || session.step !== STEPS.CONDITIONAL) return;

  await errorHandler.withSessionErrorHandling(event.user, async () => {
    // Validate and store product
    const product = validators.validateText(event.text, 'Product', { 
      minLength: 2, 
      maxLength: 100 
    });

    session.data.product = product;

    // Ask conditional questions based on task type
    const taskType = session.data.taskType;
    
    if (taskType === 'New Feature') {
      await handleNewFeatureQuestions(client, event.channel, session);
    } else if (taskType === 'Content Edit') {
      await handleContentEditQuestions(client, event.channel, session);
    } else if (taskType === 'Launch Feature Request') {
      await handleLaunchFRQuestions(client, event.channel, session);
    } else if (taskType === 'Create new Feature Request') {
      await handleCreateFRQuestions(client, event.channel, session);
    } else { // Quick Update
      await handleQuickUpdateQuestions(client, event.channel, session);
    }

    sessionManager.updateSession(event.user, { 
      step: STEPS.SUPPORTING_MATERIALS,
      data: session.data 
    });
  }, sessionManager, client);
}

// Conditional question handlers
async function handleNewFeatureQuestions(client, channel, session) {
  await sendStepMessage(
    client,
    channel,
    ` Product: **${session.data.product}**\n\n=Ë **For New Features, I need additional information:**`,
    [{
      type: 'section',
      text: { 
        type: 'mrkdwn', 
        text: '**Please provide details for each:**\n\n1. **Product Documentation:** Do you have product decks, Figma files, or product specs? (Please describe or provide links)\n\n2. **Release Status:** Features need to be at least 50% rollout for EN users before we can publish articles\n\n3. **Languages:** Which languages should this feature support?\n\n4. **Release Date:** What\'s the tentative release date?\n\n=Ý Please provide all this information in your response:' 
      }
    },
    {
      type: 'actions',
      elements: [{
        type: 'static_select',
        placeholder: { type: 'plain_text', text: 'Select languages...' },
        action_id: 'select_languages',
        options: languageOptions.map(lang => ({
          text: { type: 'plain_text', text: lang },
          value: lang
        }))
      }]
    }]
  );
}

async function handleContentEditQuestions(client, channel, session) {
  await sendStepMessage(
    client,
    channel,
    ` Product: **${session.data.product}**\n\n **For Content Edits, I need:**`,
    [{
      type: 'section',
      text: { 
        type: 'mrkdwn', 
        text: '**Please provide details for:**\n\n1. **Specific Changes:** What exactly needs to be updated or changed?\n\n2. **Article Links:** Do you have links to specific articles that need updating? (if known)\n\n3. **Reason for Change:** Why is this update needed? (new feature, bug fix, policy change, etc.)\n\n=Ý Please provide all this information in your response:' 
      }
    }]
  );
}

async function handleLaunchFRQuestions(client, channel, session) {
  await sendStepMessage(
    client,
    channel,
    ` Product: **${session.data.product}**\n\n=€ **For Launching Feature Requests:**`,
    [{
      type: 'section',
      text: { 
        type: 'mrkdwn', 
        text: '  **Important:** We only launch Feature Requests when features are out to 100% of all EN users.\n\n**Please provide:**\n\n1. **Existing FR Link:** Link to the existing Feature Request that needs to be resolved\n\n2. **Release Confirmation:** Please confirm this feature is now live for 100% of EN users\n\n3. **Final Changes:** Any updates or changes since the original Feature Request was created?\n\n=Ý Please provide all this information in your response:' 
      }
    }]
  );
}

async function handleCreateFRQuestions(client, channel, session) {
  await sendStepMessage(
    client,
    channel,
    ` Product: **${session.data.product}**\n\n=Ë **For Creating new Feature Requests:**`,
    [{
      type: 'section',
      text: { 
        type: 'mrkdwn', 
        text: '**Please provide detailed information for:**\n\n1. **Feature Description:** What is the new feature being requested?\n\n2. **Use Case:** Why is this feature needed? Who will benefit?\n\n3. **Requirements:** Any specific requirements or specifications?\n\n4. **Timeline:** When is this feature expected to be needed?\n\n=Ý Please provide all this information in your response:' 
      }
    }]
  );
}

async function handleQuickUpdateQuestions(client, channel, session) {
  await sendStepMessage(
    client,
    channel,
    ` Product: **${session.data.product}**\n\n¡ **Quick Update Details:**`,
    [{
      type: 'section',
      text: { 
        type: 'mrkdwn', 
        text: '**Please describe:**\n\n1. **What needs to be changed:** Specific text, links, or content to update\n\n2. **Location:** Which article(s) or section(s) need the update\n\n3. **Reason:** Why is this change needed?\n\n=Ý Please provide all this information in your response:' 
      }
    }]
  );
}

// Handle language selection for New Features
async function handleLanguageSelection(args) {
  const { client, body, ack } = args;
  const session = sessionManager.getSession(body.user.id);

  await ack();
  
  const languages = body.actions[0].selected_option.value;
  session.data.languages = languages;

  await client.chat.postMessage({
    channel: body.channel.id,
    text: ` Languages: **${languages}**\n\nNow please provide the detailed information requested above.`
  });

  sessionManager.updateSession(body.user.id, { data: session.data });
}

// Step 6: Handle conditional responses and ask for supporting materials
async function handleConditionalAndSupportingMaterials(args) {
  const { client, event } = args;
  const session = sessionManager.getSession(event.user);

  if (!session || session.step !== STEPS.SUPPORTING_MATERIALS) return;

  await errorHandler.withSessionErrorHandling(event.user, async () => {
    // Store the conditional response
    const conditionalInfo = validators.validateText(event.text, 'Additional Details', { 
      minLength: 10, 
      maxLength: 5000 
    });

    session.data.conditionalInfo = conditionalInfo;

    await sendStepMessage(
      client,
      event.channel,
      `Any additional supporting materials, context, or files?`,
      [{
        type: 'section',
        text: { 
          type: 'mrkdwn', 
          text: '=Î You can upload files (screenshots, documents, specs) and/or provide additional context.\n\nType "none" if you don\'t have additional materials, or provide any extra context needed:' 
        }
      }]
    );

    sessionManager.updateSession(event.user, { 
      step: STEPS.FILES,
      data: session.data 
    });
  }, sessionManager, client);
}

// Step 7: Handle supporting materials and show submit option  
async function handleSupportingMaterialsAndFiles(args) {
  const { client, event } = args;
  const session = sessionManager.getSession(event.user);

  if (!session || session.step !== STEPS.FILES) return;

  await errorHandler.withSessionErrorHandling(event.user, async () => {
    // Store supporting materials
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
      `<¯ Ready to submit your KB request!`,
      [{
        type: 'section',
        text: { type: 'mrkdwn', text: '=Î Upload any additional files or submit your request now:' }
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
        text: ` Added ${event.files.length} file(s). Upload more files or submit your request:`,
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
              "text": `*Priority:*\n${session.data.priority}`
            },
            {
              "type": "mrkdwn",
              "text": `*Product:*\n${session.data.product}`
            },
            {
              "type": "mrkdwn", 
              "text": `*Files:*\n${session.data.files?.length || 0} attached`
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
    case STEPS.CONDITIONAL:
      return handleProductAndConditional(args);
    case STEPS.SUPPORTING_MATERIALS:
      return handleConditionalAndSupportingMaterials(args);
    case STEPS.FILES:
      return handleSupportingMaterialsAndFiles(args);
    case STEPS.SUBMIT:
      return handleFileUpload(args);
  }
}));

app.action('select_task_type', errorHandler.wrapSlackHandler(handleTaskTypeSelection));
app.action('select_priority', errorHandler.wrapSlackHandler(handlePrioritySelection));
app.action('select_languages', errorHandler.wrapSlackHandler(handleLanguageSelection));
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
        text: 'What\'s the subject of your new request?\n\n=Ý Please describe your request in 1-2 sentences:' 
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