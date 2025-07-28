const axios = require('axios');
const FormData = require('form-data');

const MONDAY_API_URL    = 'https://api.monday.com/v2';
const MONDAY_API_TOKEN  = process.env.MONDAY_API_TOKEN;
const MONDAY_BOARD_ID   = process.env.MONDAY_BOARD_ID;

const columnMapping = {
  articleLink:  'link',       // Link to Article
  requestType:  'status_1',   // Task Type
  description:  'long_text',  // Description
  attachments:  'files',      // File(s) [optional]
  requestor:    'person'      // Creator
};

const escapeQuotes = str => (str ? str.replace(/"/g, '\\"') : '');

const createMondayItem = async ({ articleLink, requestType, description, user, files = [] }) => {
  // 1) Build the column_values object
  const columnValues = {
    [columnMapping.articleLink]:  { url: articleLink, text: 'KB Article' },
    [columnMapping.requestType]:  { label: requestType },
    [columnMapping.description]:  description
  };

  // 2) Create the item
  const createQuery = `
    mutation ($boardId: Int!, $columnVals: JSON!) {
      create_item(
        board_id: $boardId,
        item_name: "KB Request from ${escapeQuotes(user)}",
        column_values: $columnVals
      ) { id }
    }
  `;
  const createRes = await axios.post(MONDAY_API_URL,
    { query: createQuery,
      variables: {
        boardId: MONDAY_BOARD_ID,
        columnVals: columnValues
      }
    },
    { headers: { Authorization: MONDAY_API_TOKEN } }
  );
  const itemId = createRes.data.data.create_item.id;

  // 3) Attach each Slack file
  for (const slackFileId of files) {
    // a) get download URL
    const info = await axios.post('https://slack.com/api/f
