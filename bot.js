import pkg from '@slack/bolt';
const { App } = pkg;

import cron from 'node-cron';

import fs from "fs";

import { generateDailyReport } from './openAllianceSummary/generateDailyReport.js'
import { addMeeting, getMeeting, findDuplicateMeeting } from './database.js';
import dotenv from "dotenv"
dotenv.config()

const MEETINGS_FILE = "./meetings.json";
const LEADS_FILE = "./leads.json"

// Initialize your app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Configuration - Replace with your actual channel ID
const DAILY_REPORT_CHANNEL = process.env.SLACK_DAILY_REPORT_CHANNEL; // Replace with your channel ID


// Function to format and send the daily report
async function sendDailyReport() {
  try {
    const reportData = await generateDailyReport();
    
    if (reportData.status === 'error') {
      // Send error message
      await app.client.chat.postMessage({
        token: process.env.SLACK_BOT_TOKEN,
        channel: DAILY_REPORT_CHANNEL,
        text: '⚠️ Daily Report - Service Issue',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⚠️ Daily Report - Service Issue'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Time:* ${reportData.timestamp}\n*Status:* ${reportData.message}`
            }
          }
        ]
      });
      return;
    }

    // Create rich formatted message with both API results
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 Daily Data Report - 9:30 PM Update'
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `📅 Generated on ${reportData.timestamp}`
          }
        ]
      },
      {
        type: 'divider'
      }
    ];


    // Add AI Analysis section
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🤖 *AI Analysis (${reportData.aiAnalysis.model})*\n${reportData.aiAnalysis.analysis}`
      }
    });



    // Add footer
    blocks.push(
      {
        type: 'divider'
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Automated report Generated every day at 9:30 PM'
          }
        ]
      }
    );



    // Send the formatted message
    await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: DAILY_REPORT_CHANNEL,
      text: '📊 Daily Data Report - 9:30 PM Update',
      blocks: blocks
    });

    console.log('✅ Daily report sent successfully to Slack');

  } catch (error) {
    console.error('❌ Error sending daily report:', error);
    
    // Send fallback message
    await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: DAILY_REPORT_CHANNEL,
      text: '⚠️ Daily report failed to send. Please check the bot logs.'
    });
  }
}

// Schedule the daily report at 9:30 PM
// cron.schedule('28 20 * * *', async () => {
//   console.log('9:30 PM - Triggering daily report...');
//   await sendDailyReport();
// }, {
//   timezone: "America/New_York" // Change to your timezone
// });

// // message leads asking them for photos and videos, add to a Google drive folder
// cron.schedule('17 00 * * *', async() => {
//   await pm(process.env.SLACK_USER_IDS, `Please add any photos or videos from todays meeting to <${process.env.GOOGLE_DRIVE_LINK}| google drive>`);
// },{
//   timezone: "America/New_York" //timezone
// });


// Start the app

(async () => {
  try {
    await app.start();
    console.log('⚡️ Google Sheets + AI Report Bot is running!');
    console.log(`📊 Daily reports will be sent to channel: ${DAILY_REPORT_CHANNEL}`);
    
    // Send startup notification

    pm(process.env.SLACK_USER_IDS, "I have indeed been uploaded, sir. We're online and ready")
    // await app.client.chat.postMessage({
    //   token: process.env.SLACK_BOT_TOKEN,
    //   channel: DAILY_REPORT_CHANNEL,
    //   text: 'Data Analysis Bot is now online!'
    // });
    
  } catch (error) {
    console.error('Error starting the bot:', error);
  }
})();


// Utility: load JSON
function loadMeetings() {
  if (!fs.existsSync(MEETINGS_FILE)) return {};
  const data = fs.readFileSync(MEETINGS_FILE);
  return JSON.parse(data);
}

// Utility: save JSON
function saveMeetings(meetings) {
  fs.writeFileSync(MEETINGS_FILE, JSON.stringify(meetings, null, 2));
}

// Utility: load JSON
function loadLeads() {
  if (!fs.existsSync(LEADS_FILE)) return {};
  const data = fs.readFileSync(LEADS_FILE);
  return JSON.parse(data);
}

// Utility: save JSON
function saveLeads(leads) {
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

// Utility: send DM
async function pm(IDs, text) {
  const userIds = IDs.split(',').map(id => id.trim()); // Support multiple IDs separated by commas
  const messageText = text;

  try {
    // Get all users in the workspace
    const result = await app.client.users.list();
    const validUserIds = result.members.map(user => user.id);

    for (const userId of userIds) {
      if (!validUserIds.includes(userId)) {
        console.warn(`User ID ${userId} not found in the workspace. Skipping...`);
        continue;
      }

      try {
        // 1️⃣ Open a DM channel with the user
        const dm = await app.client.conversations.open({
          users: userId,
        });

        const dmChannel = dm.channel.id;

        // 2️⃣ Send a message to that DM channel
        await app.client.chat.postMessage({
          channel: dmChannel,
          text: messageText,
        });

        console.log(`Sent DM to ${userId}`);
      } catch (error) {
        console.error(`Error sending DM to ${userId}:`, error);
      }
    }
  } catch (error) {
    console.error("Error fetching user list:", error);
  }
}

/*---------------------------BOT COMMANDS---------------------------*/
const commands = [
  { name: "/whoscoming", desc: "Create a poll asking who's attending on that date." },
  { name: "/meetingreport", desc: "Show poll results for the given date or list polls." },
  { name: "/clearmmeetings", desc: "Clears all meeting for a channel" },
  { name: "/latestmeeting", desc: "Shows latest meeting"},
  { name: "/addlead", desc: "Adds a user as a lead"},
  { name: "/help", desc: "Show this help menu." },
];

//Command to create poll
// app.command("/whoscoming", async ({ command, ack, client }) => {
//   await ack();

//   const dateInput = command.text.trim();
//   const channelId = command.channel_id;

//   try {

//     //try to join channel if not in (so you dont have to invite every time)
//     try {
//       await client.conversations.join({ channel: channelId });
//       console.log(`Joined channel ${channelId}`);
//     } catch (joinError) {
//       if (joinError.data?.error !== "method_not_supported_for_channel_type") {
//         console.warn(`Could not auto-join channel ${channelId}:`, joinError.data?.error);
//       }
//     }

//     const meetings = loadMeetings();

//     // Ensure channel entry exists
//     if (!meetings[channelId]) meetings[channelId] = [];

//     const newDate = new Date(dateInput);

//     //Check for existing meeting with same date
//     const existingMeeting = meetings[channelId].find(
//       (m) => new Date(m.date).toDateString() === newDate.toDateString()
//     );

//     if (existingMeeting) {
//       await client.chat.postEphemeral({
//         channel: channelId,
//         user: command.user_id,
//         text: `A meeting poll already exists for *${dateInput}*`,
//       });
//       console.log(1)
//       return;
//     }
//       const showDate = new Date(dateInput).toDateString()
//       // 1. Post poll message
//       const result = await client.chat.postMessage({
//         channel: channelId,
//         text: `<!channel> Who is going to the meeting on *${showDate}*? React with ✅ or ❌`,
//       });

//       // 2. Add reactions
//       await client.reactions.add({ channel: result.channel, timestamp: result.ts, name: "white_check_mark" });
//       await client.reactions.add({ channel: result.channel, timestamp: result.ts, name: "x" });

//       // 3. Save poll to JSON
//       if (!meetings[channelId]) meetings[channelId] = [];
      
//       meetings[channelId].push({
//         ts: result.ts,
//         date: dateInput,
//       });
//       saveMeetings(meetings);


//       await client.chat.postEphemeral({
//         channel: channelId,
//         user: command.user_id,
//         text: `Meeting poll created and saved for *${dateInput}*`,
//       });
//   }
//   catch (error) {
//     console.error("Error posting testreport:", error);
//   }
// });

app.command("/whoscoming", async ({ ack, body, client }) => {
  await ack();

  const channelId = body.channel_id;

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "whoscoming_modal",
        private_metadata: channelId,
        title: { type: "plain_text", text: "Meeting Poll" },
        submit: { type: "plain_text", text: "Create" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: "date_block",
            label: { type: "plain_text", text: "Select meeting date" },
            element: {
              type: "datepicker",
              action_id: "meeting_date",
              placeholder: { type: "plain_text", text: "Pick a date" }
            }
          },
          // {
          //   type: "input",
          //   block_id: "channel_block",
          //   optional: true,
          //   label: { type: "plain_text", text: "Choose channel (optional)" },
          //   element: {
          //     type: "conversations_select",
          //     action_id: "poll_channel",
          //     default_to_current_conversation: true
          //   }
          // }
        ]
      }
    });
  } catch (err) {
    console.error("Error opening modal:", err);
  }
});

app.view("whoscoming_modal", async ({ ack, body, view, client }) => {
  await ack();


  const dateInput = view.state.values.date_block.meeting_date.selected_date;

  const channelId = body.view.private_metadata;

  try {
    // Attempt to join channel
    try {
      await client.conversations.join({ channel: channelId });
    } catch (err) {
      if (err.data?.error !== "method_not_supported_for_channel_type") {
        console.warn(`Could not join channel ${channelId}: ${err.data?.error}`);
      }
    }



    // Prevent duplicates
    const alreadyExists = findDuplicateMeeting(channelId, dateInput);

    if (alreadyExists) {
      await client.chat.postMessage({
        channel: body.user.id,
        text: `A meeting poll for *${new Date(dateInput).toDateString()}* already exists in <#${channelId}>.`
      });
      return;
    }

    // Post the poll
    const pollMsg = await client.chat.postMessage({
      channel: channelId,
      text: `<!channel> Who is going to the meeting on *${new Date(dateInput).toDateString()}*?\nReact with:  ✅ yes   ❌ no`,
    });

    // Add reactions
    await client.reactions.add({
      channel: channelId,
      timestamp: pollMsg.ts,
      name: "white_check_mark"
    });

    await client.reactions.add({
      channel: channelId,
      timestamp: pollMsg.ts,
      name: "x"
    });

    // Save poll to JSON
    addMeeting(channelId, pollMsg.ts, dateInput);

    //saveMeetings(meetings);

    // DM user confirmation
    await client.chat.postMessage({
      channel: body.user.id,
      text: `Poll created for *${dateInput}*\nPosted in <#${channelId}>`
    });

  } catch (error) {
    console.error("Error creating poll:", error);
  }
});


app.command("/clearmeetings", async ({ command, ack, client }) => {
  await ack();
  
  const channelId = command.channel_id;

  try {
    const meetings = loadMeetings();
    if (!meetings[channelId]) meetings[channelId] = [];
    
    meetings[channelId] = [];
    saveMeetings(meetings);
  } catch (error) {
    console.error("Error clearing meetings:", error);
  }
});

app.command("/meetingreport", async ({ command, ack, client }) => {
  await ack();

  const dateInput = command.text.trim();
  const channelId = command.channel_id;

  try {
    const meetings = loadMeetings();
    const channelMeetings = meetings[channelId] || [];

    // 📝 No date provided → show available poll dates
    if (!dateInput) {
      if (channelMeetings.length === 0) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: command.user_id,
          text: `There are no meeting polls saved in this channel.`,
        });
        return;
      }

      const datesList = channelMeetings.map(m => `• ${m.date}`).join("\n");

      await client.chat.postEphemeral({
        channel: channelId,
        user: command.user_id,
        text: `*Available meeting reports in this channel:*\n${datesList}\n\nRun \`/meetingreport <date>\` to view one.`,
      });

      return;
    }

    // 📊 Date provided → find that poll
    const meeting = channelMeetings.find(m => m.date === dateInput);
    if (!meeting) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: command.user_id,
        text: `❌ No meeting poll found for *${dateInput}* in this channel.`,
      });
      return;
    }

    const auth = await client.auth.test();
    const botUserId = auth.user_id;

    const response = await client.reactions.get({
      channel: channelId,
      timestamp: meeting.ts,
    });

    const reactions = response.message.reactions || [];
    const yesReaction = reactions.find(r => r.name === "white_check_mark");
    const noReaction = reactions.find(r => r.name === "x");

    const yesUsers = yesReaction
      ? yesReaction.users.filter(u => u !== botUserId).map(u => `<@${u}>`)
      : [];

    const noUsers = noReaction
      ? noReaction.users.filter(u => u !== botUserId).map(u => `<@${u}>`)
      : [];

    client.chat.postEphemeral({
        channel: channelId,
        user: command.user_id,
      text: `*Meeting Report for ${meeting.date}*\n✅ Coming: ${yesUsers.length ? yesUsers.join(", ") : "None"}\n❌ Not coming: ${noUsers.length ? noUsers.join(", ") : "None"}`,
    });

  } catch (error) {
    console.error("Error getting report:", error);
  }
});

app.command("/latestmeeting", async ({ command, ack, client }) => {
  await ack();

  const channelId = command.channel_id;

  try {
    const meetings = loadMeetings();
    const channelMeetings = meetings[channelId] || [];


      let date = new Date(channelMeetings[0].date);;
      let index = 0;
      for(let i = 0; i < channelMeetings.length; i++) {
        let nDate = new Date(channelMeetings[i].date);
        if(nDate > date){
          index = i;
          date = nDate;
        }
      }


    // 📊 Date provided → find that poll
    const meeting = channelMeetings[index];
    if (!meeting) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: command.user_id,
        text: `❌ No meeting poll found for *${dateInput}* in this channel.`,
      });
      return;
    }

    const auth = await client.auth.test();
    const botUserId = auth.user_id;

    const response = await client.reactions.get({
      channel: channelId,
      timestamp: meeting.ts,
    });

    const reactions = response.message.reactions || [];
    const yesReaction = reactions.find(r => r.name === "white_check_mark");
    const noReaction = reactions.find(r => r.name === "x");

    const yesUsers = yesReaction
      ? yesReaction.users.filter(u => u !== botUserId).map(u => `<@${u}>`)
      : [];

    const noUsers = noReaction
      ? noReaction.users.filter(u => u !== botUserId).map(u => `<@${u}>`)
      : [];

    client.chat.postEphemeral({
        channel: channelId,
        user: command.user_id,
      text: `*Meeting Report for ${meeting.date}*\n✅ Coming: ${yesUsers.length ? yesUsers.join(", ") : "None"}\n❌ Not coming: ${noUsers.length ? noUsers.join(", ") : "None"}`,
    });

  } catch (error) {
    console.error("Error getting report:", error);
  }
});

app.command("/addlead", async ({command, ack, client}) => {
  await ack();

  const userID = command.text.trim();
  console.log(userID)
  // Match all user mentions — handles both "<@U12345>" and "<@U12345|username>"
  const userMatches = userID.matchAll(/<@([A-Z0-9]+)(?:\|[^>]+)?>/gi);

  // Convert to an array of user IDs
  const mentionedUserIds = Array.from(userMatches, m => m[1]);
  console.log(mentionedUserIds)

  if (mentionedUserIds.length === 0) {
    await client.chat.postEphemeral({
      channel: command.channel_id,
      user: command.user_id,
      text: "Please mention at least one user like `/addlead @username`",
    });
  }

  const channelId = command.channel_id;

  try {
    
    const leads = loadLeads();

    console.log("\n\n\n1\n\n\n")

    const result = await app.client.users.list();
    const users = result.members;

    for(let id of mentionedUserIds){
      if (!leads[id]) leads[id] = [];

      console.log(id + "\n")
      console.log(leads)
      users.forEach(u => {
        if(id == u.id) {
          leads[id].push([u.real_name]);
        }  
      })
    }
    saveLeads(leads);
  } catch (error) {
    console.error("Error adding leads:", error);
  }

});

app.command("/help", async ({ ack, command, client }) => {
  await ack();
  const helpText = commands.map(c => `• \`${c.name}\` — ${c.desc}`).join("\n");

  await client.chat.postEphemeral({
    channel: command.channel_id,
    user: command.user_id,
    text: `*Available Commands:*\n${helpText}`,
  });
});

/*---------- LOTS OF TEST CODE ----------*/
async function findConversation() {
  try {
    // Call the conversations.list method using the built-in WebClient
    const result = await app.client.conversations.list({
      // The token you used to initialize your app
      token: process.env.SLACK_BOT_TOKEN
    });

    for (const channel of result.channels) {
      console.log(channel.name)    
    }
  }
  catch (error) {
    console.error(error);
  }
}



// const result = await app.client.users.list();
// const users = result.members;

// users.forEach(u => {
//   const email = u.profile?.email || "No email available";
//   console.log(`${u.id} | ${u.name} | ${u.real_name} | ${email}`);
// });