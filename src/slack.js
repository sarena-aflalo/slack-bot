const { App } = require('@slack/bolt');
const { searchAndFetchDocuments } = require('./drive');
const { askClaude } = require('./claude');

function extractQuestion(text) {
  // Strip @mentions from the message
  return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}

async function handleQuestion(question, channel, ts, say, client) {
  if (!question) {
    await say("Hi! Ask me anything and I'll search our Google Drive docs to find the answer.");
    return;
  }

  const loadingMsg = await say(':hourglass_flowing_sand: Searching the docs...');

  try {
    const docs = await searchAndFetchDocuments(question);

    if (docs.length === 0) {
      await client.chat.update({
        channel,
        ts: loadingMsg.ts,
        text: "I searched our Google Drive folder but couldn't find any relevant documents for your question.",
      });
      return;
    }

    const { answer, sources } = await askClaude(question, docs);

    const responseText =
      `${answer}\n\n` +
      (sources.length > 0
        ? `*Sources:* ${sources.map(s => `<${s.url}|${s.name}>`).join(' · ')}`
        : '');

    await client.chat.update({
      channel,
      ts: loadingMsg.ts,
      text: responseText,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: answer },
        },
        ...(sources.length > 0
          ? [
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `*Sources:* ${sources.map(s => `<${s.url}|${s.name}>`).join(' · ')}`,
                  },
                ],
              },
            ]
          : []),
      ],
    });
  } catch (err) {
    console.error('Error handling question:', err);
    await client.chat.update({
      channel,
      ts: loadingMsg.ts,
      text: ':warning: Something went wrong while fetching an answer. Please try again.',
    });
  }
}

async function createSlackApp() {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  });

  // Handle @mentions in channels
  app.event('app_mention', async ({ event, say, client }) => {
    const question = extractQuestion(event.text);
    await handleQuestion(question, event.channel, event.ts, say, client);
  });

  // Handle direct messages
  app.event('message', async ({ event, say, client }) => {
    if (event.channel_type !== 'im' || event.bot_id) return;
    await handleQuestion(event.text || '', event.channel, event.ts, say, client);
  });

  return app;
}

module.exports = { createSlackApp };
