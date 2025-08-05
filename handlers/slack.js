// handlers/slack.js
const axios = require('axios');
const { createMondayItem } = require('../monday');

// Entry point for handling Slack messages
async function handleSlackEvent(event) {
  const { text, user } = event;

  // Step 1: Send to Model Hub AI Workflow
  const workflowResponse = await runModelHubWorkflow({
    pm_message: text,
    user_id: user
  });

  // Step 2: Parse outputs
  const {
    request_type,
    change_description,
    figma_link,
    jira_link,
    urgency_level,
    feature_name
  } = workflowResponse;

  // Step 3: Create a Monday task
  const itemName = `${request_type || 'KB Request'}: ${feature_name || 'Unnamed Feature'}`;
  const updates = `💬 *Request by*: <@${user}>
📝 *Description*: ${change_description || 'No description provided'}
🔗 *Figma*: ${figma_link || '—'}
🔗 *JIRA*: ${jira_link || '—'}
🔥 *Urgency*: ${urgency_level || 'Not specified'}`;

  await createMondayItem({ itemName, updates });
}

async function runModelHubWorkflow(inputs) {
  const url = process.env.WORKFLOW_URL;
  const token = process.env.MODEL_HUB_TOKEN;

  const res = await axios.post(
    url,
    { inputs },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return res.data.result;
}

module.exports = { handleSlackEvent };
