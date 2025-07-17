// monday.js
const axios = require("axios");

const createMondayItem = async ({ articleLink, requestType, description, user }) => {
  const query = `
    mutation {
      create_item(
        board_id: ${process.env.MONDAY_BOARD_ID},
        item_name: "KB Request from ${user}",
        column_values: "${JSON.stringify({
          link: articleLink,
          status_2: requestType,  // Replace with actual column ID
          long_text: description, // Replace with actual column ID
        }).replace(/"/g, '\\"')}"
      ) {
        id
      }
    }
  `;

  await axios.post("https://api.monday.com/v2", { query }, {
    headers: {
      Authorization: process.env.MONDAY_API_TOKEN,
      "Content-Type": "application/json"
    }
  });
};

module.exports = { createMondayItem };
