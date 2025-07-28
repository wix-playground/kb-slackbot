const axios = require("axios");

const MONDAY_API_URL = "https://api.monday.com/v2";
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const MONDAY_BOARD_ID = process.env.MONDAY_BOARD_ID;

const columnMapping = {
  articleLink: "link",           // Link to Article
  requestType: "status_1",       // Task Type
  description: "long_text",      // Description
  attachments: "files",          // File(s) [optional]
  requestor: "person"            // Creator
};

const escapeQuotes = str => (str ? str.replace(/"/g, '\\"') : "");

const createMondayItem = async ({ articleLink, requestType, description, user }) => {
  const query = `
    mutation {
      create_item(
        board_id: ${MONDAY_BOARD_ID},
        item_name: "KB Request from ${escapeQuotes(user)}",
        column_values: "{
          \\"${columnMapping.articleLink}\\": {\\"url\\": \\"${escapeQuotes(articleLink)}\\", \\"text\\": \\"KB Article\\"},
          \\"${columnMapping.requestType}\\": {\\"label\\": \\"${escapeQuotes(requestType)}\\"},
          \\"${columnMapping.description}\\": \\"${escapeQuotes(description)}\\"
        }"
      ) {
        id
      }
    }
  `;

  try {
    const response = await axios.post(MONDAY_API_URL, { query }, {
      headers: {
        Authorization: MONDAY_API_TOKEN,
        "Content-Type": "application/json"
      }
    });

    if (response.data.errors) {
      console.error("Monday.com API error:", response.data.errors);
      throw new Error(response.data.errors[0].message);
    }
    return response.data.data.create_item.id;
  } catch (error) {
    console.error("Error creating Monday.com item:", error.message);
    throw error;
  }
};

module.exports = { createMondayItem };
