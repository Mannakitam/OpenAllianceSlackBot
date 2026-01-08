import pkg from '@slack/bolt';
const { App } = pkg;

import cron from 'node-cron';

import fs from "fs";

import { generateDailyReport } from './openAllianceSummary/generateDailyReport.js'
import { addMeeting, getMeetingWithTS, findDuplicateMeeting, addUser } from './database.js';
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
const DAILY_REPORT_CHANNEL = process.env.SLACK_DAILY_REPORT_CHANNEL;



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

// Utility: formate a date
function formatSlackDateToDateString(dateStr) {
  // dateStr: "YYYY-MM-DD"
  const [year, month, day] = dateStr.split("-").map(Number);

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months   = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Zeller’s congruence (Gregorian calendar)
  let y = year;
  let m = month;
  if (m < 3) {
    m += 12;
    y -= 1;
  }

  const K = y % 100;
  const J = Math.floor(y / 100);

  const h =
    (day +
      Math.floor((13 * (m + 1)) / 5) +
      K +
      Math.floor(K / 4) +
      Math.floor(J / 4) +
      5 * J) % 7;

  // Zeller: 0=Saturday → convert to 0=Sunday
  const weekdayIndex = (h + 6) % 7;

  return `${weekdays[weekdayIndex]} ${months[month - 1]} ${day} ${year}`;
}

/*---------------------------BOT COMMANDS---------------------------*/
    const commands = [
        { name: "/whoscoming", desc: "Create a poll asking who's attending on that date." },
        { name: "/meetingreport", desc: "Show poll results for the given date or list polls." },
        /*
        { name: "/clearmmeetings", desc: "Clears all meeting for a channel" },
        { name: "/latestmeeting", desc: "Shows latest meeting"},
        */
        { name: "/addlead", desc: "Adds a user as a lead"},
        { name: "/help", desc: "Show this help menu." },
    ];


app.command("/whoscoming", async ({ ack, body, client }) => {
    await ack();

    const channelId = body.channel_id;

    // Attempt to join channel
    try {
        await client.conversations.join({ channel: channelId });
    } catch (err) {
        if (err.data?.error !== "method_not_supported_for_channel_type") {
            console.warn(`Could not join channel ${channelId}: ${err.data?.error}`);
        }
    }
        
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
    //console.log("*****************************************************************\n\n\n", dateInput, "\n\n\n*****************************************************************")
    const channelId = body.view.private_metadata;
    const safeDate = formatSlackDateToDateString(dateInput);

    try {
        // // Attempt to join channel
        

        // Prevent duplicates
        const alreadyExists = await findDuplicateMeeting(channelId, dateInput);

        if (alreadyExists) {
            await client.chat.postMessage({
                channel: body.user.id,
                text: `A meeting poll for *${safeDate}* already exists in <#${channelId}>.`
            });
            return;
        }

        // Post the poll
        const pollMsg = await client.chat.postMessage({
            channel: channelId,
            text: `<!channel> Who is going to the meeting on *${safeDate}*?\nReact with:  ✅ yes   ❌ no`,
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
        await addMeeting(channelId, pollMsg.ts, dateInput);

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

app.command("/meetingreport", async ({ command, ack, client }) => {
    await ack();

    const channelId = command.channel_id;
    const channelMeetings = (await getMeetingWithTS(channelId))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    //console.log("****\n\n\n", channelMeetings, "\n\n\n****")

    if (!channelMeetings.length) {
        await client.chat.postEphemeral({
        channel: channelId,
        user: command.user_id,
        text: "There are no meeting polls saved in this channel.",
    });

    return;
    }

    // Build dropdown options
    const options = channelMeetings.map(m => ({
        text: {
            type: "plain_text",
            text: new Date(m.date).toDateString(),
        },
        value: m.ts, // IMPORTANT: store timestamp, not date
    }));

    await client.views.open({
        trigger_id: command.trigger_id,
        view: {
            type: "modal",
            callback_id: "meetingreport_modal",
            private_metadata: channelId,
            title: { type: "plain_text", text: "Meeting Report" },
            submit: { type: "plain_text", text: "View" },
            close: { type: "plain_text", text: "Cancel" },
            blocks: [
                {
                type: "input",
                block_id: "meeting_block",
                label: { type: "plain_text", text: "Select a meeting" },
                element: {
                    type: "static_select",
                    action_id: "meeting_select",
                    options,
                },
                },
            ],
        },
    });
});

app.view("meetingreport_modal", async ({ ack, body, view, client }) => {
    await ack();

    const channelId = view.private_metadata;
    const userId = body.user.id;

    const selectedTs = view.state.values.meeting_block.meeting_select.selected_option.value;

    const channelMeetings = await getMeetingWithTS(channelId);
    const meeting = channelMeetings.find(m => m.ts === selectedTs);

    if (!meeting) {
        await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: "❌ Meeting not found.",
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

    await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text:
            `*Meeting Report for ${new Date(meeting.date).toDateString()}*\n` +
            `✅ Coming: ${yesUsers.length ? yesUsers.join(", ") : "None"}\n` +
            `❌ Not coming: ${noUsers.length ? noUsers.join(", ") : "None"}`,
    });
});


app.command("/test", async ({ ack, command, client }) => {
    await ack();

    await client.views.open({
        trigger_id: command.trigger_id,
        view: {
            type: "modal",
            private_metadata: command.user_id,
            callback_id: "addMember_modal",
            title: { type: "plain_text", text: "Pick a User" },
            submit: { type: "plain_text", text: "Select" },
            close: { type: "plain_text", text: "Cancel" },
            blocks: [
            {
                type: "input",
                block_id: "users_block",
                label: { type: "plain_text", text: "Choose a user" },
                element: {
                    type: "multi_users_select",
                    action_id: "selected_users",
                    placeholder: {
                        type: "plain_text",
                        text: "Search for a user",
                    },
                },
            },
            {
                type: "input",
                block_id: "channel_block",
                label: { type: "plain_text", text: "Choose channel (channels start with #)" },
                element: {
                    type: "conversations_select",
                    action_id: "poll_channel",
                    default_to_current_conversation: true
                }
            }
            ],
        },
    });
});

app.view("addMember_modal", async ({ack, body, view, client}) => {
    await ack();

    const userId = view.state.values.users_block.selected_users.selected_users;

    const channelID = view.state.values.channel_block.poll_channel.selected_conversation;

    //console.log("****\n\n\n", channelID, "\n", userId, "\n\n\n****")

    for (const uId of userId){
        
        try {
            // Add the user to your system
            await addUser(channelID, uId);

            // Send confirmation to the person who submitted the modal
            try {
                await client.chat.postEphemeral({
                    channel: channelID,
                    user: body.view.private_metadata, // modal owner
                    text: `<@${uId}> has been added as a member of <#${channelID}>`,
                });
            } catch (error) {
                console.error("***\n\nError posting the creation of a new member:", error, "\n\n***");
            }
        } catch(error) {
        console.error("***\n\nError creating adding member:", error, "\n\n***");
        }
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
