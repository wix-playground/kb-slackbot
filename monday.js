// monday.js
const axios = require("axios");

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const MONDAY_BOARD_ID = process.env.MONDAY_BOARD_ID;

const columnMapping = {
  articleLink: "link",           // Link to Article
  requestType: "status_1",       // Task Type
  description: "long_text",       // Description
  attachments: "files",          // File(s) [optional]
  requestor: "person"            // Creator
};

const createMondayItem = async ({ articleLink, requestType, description, user }) => {
  const query = `
    mutation {
      create_item(
        board_id: ${MONDAY_BOARD_ID},
        item_name: "KB Request from ${user}",
        column_values: "{
          \"${columnMapping.articleLink}\": {\"url\": \"${articleLink}\", \"text\": \"KB Article\"},
          \"${columnMapping.requestType}\": {\"label\": \"${requestType}\"},
          \"${columnMapping.description}\": \"${description}\"
        }"
      ) {
        id
      }
    }
  `;

  await axios.post(MONDAY_API_URL, { query }, {
    headers: {
      Authorization: MONDAY_API_TOKEN,
      "Content-Type": "application/json"
    }
  });
};

module.exports = { createMondayItem };
