const axios = require('axios');

async function runWorkflow({ pm_message, user_id }) {
  const { data } = await axios.post(
    process.env.WORKFLOW_URL, // This stays! Points to your internal Falcon URL
    {
      inputs: {
        pm_message,
        user_id
      }
    },
    {
      headers: {
        'Content-Type': 'application/json'
        // ❌ No Authorization header needed!
      }
    }
  );

  return data.outputs;
}

module.exports = { runWorkflow };
