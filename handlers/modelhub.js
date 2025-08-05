const axios = require('axios');

async function runWorkflow({ pm_message, user_id }) {
  const { data } = await axios.post(
    process.env.WORKFLOW_URL,
    {
      inputs: {
        pm_message,
        user_id
      }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.MODEL_HUB_TOKEN}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return data.outputs;
}

module.exports = { runWorkflow };
