require('dotenv').config();

const { createSlackApp } = require('./slack');

const PORT = process.env.PORT || 3000;

(async () => {
  const app = await createSlackApp();

  await app.start(PORT);
  console.log(`Slack bot running on port ${PORT}`);
})();
