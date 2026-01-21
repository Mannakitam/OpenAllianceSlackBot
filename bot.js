import pkg from '@slack/bolt';
const { App } = pkg;

import cron from 'node-cron';

import fs from "fs";

import { generateDailyReport } from './openAllianceSummary/generateDailyReport.js'

import { enqueue } from './queue.js';
//import * as database from './database.js'
import { addMeeting, getMeetingWithTS, findDuplicateMeeting, saveMessage, getUserRoles, createRole, deleteRole, getRoles, addUserToRole, removeUserFromRole, getRoleMembers, getUsersInRole, getRoleByName } from './database.js';
import dotenv from "dotenv"
dotenv.config()

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

//message logger
// app.event("message", async ({ event, client, logger }) => {
//     try {

//         const channelID   =   event.channel;
//         const userID      =   event.user || event.bot_id || "unknown_bot";
//         const text        =   event.text || "";
//         const ts          =   event.ts;
//         const thread_ts   =   event.thread_ts || null;
//         const edited_ts   =   event.edited?.ts || null;
        
//         const attachmentsJSON = {};
//         if (event.attachments) attachmentsJSON.attachments = event.attachments;
//         if (event.blocks) attachmentsJSON.blocks = event.blocks;

//         const attachmentsString = Object.keys(attachmentsJSON).length
//         ? JSON.stringify(attachmentsJSON)
//         : null;


//         console.log(`New message in ${channelID} from ${userID}: ${text}`);

//         // Save to database
//         await saveMessage(channelID, userID, text, ts, thread_ts, edited_ts, attachmentsString);

//         console.log(`Message saved to DB: ${ts}`);

//     } catch (error) {
//         console.error("Error handling message event:", error);
//     }
// });

// app.event("message", async ({ event, logger }) => {
//   try {
//     // Only handle edits
//     if (event.subtype !== "message_changed") return;

//     const editedMessage = event.message;  

//     const channelID     =   event.channel;      
//     const userID        =   event.user || event.bot_id || "unknown_bot";
//     const text          =   editedMessage.text || "";
//     const ts            =   editedMessage.ts;          
//     const thread_ts     =   editedMessage.thread_ts || null;
//     const edited_ts     =   editedMessage.edited?.ts || null;

//     // Correctly get attachments and blocks from the inner message
//     const attachmentsJSON = {};
//     if (editedMessage.attachments) attachmentsJSON.attachments = editedMessage.attachments;
//     if (editedMessage.blocks) attachmentsJSON.blocks = editedMessage.blocks;

//     const attachmentsString = Object.keys(attachmentsJSON).length
//         ? JSON.stringify(attachmentsJSON)
//         : null;

//     // Update the database
//     await updateMessage(text, edited_ts, attachmentsString, thread_ts, ts, channelID, userID);

//     console.log(`Message updated in DB: ${ts}`);

//   } catch (error) {
//     console.error("Error handling edited message:", error);
//   }
// });



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
        { name: "/role", desc: "All commands related to creating/deleting roles as well as adding/removing members to roles."},
        { name: "/ping", desc: "/ping `@<role-name>` <text> will ping all members of a role and send the text." },
        { name: "/showroles", desc: "/showroles will show all members of a channel and what roles they have.\n/showroles `@<role-name>` will show all roles of channel members who have the `@<role-name>` role." },
        { name: "/help", desc: "Show this help menu." },
    ];


app.command("/whoscoming", async ({ ack, body, client }) => {
    await ack();

    const channelId = body.channel_id;

    // Attempt to join channel
    // try {
    //     await client.conversations.join({ channel: channelId });
    // } catch (err) {
    //     if (err.data?.error !== "method_not_supported_for_channel_type") {
    //         console.warn(`Could not join channel ${channelId}: ${err.data?.error}`);
    //     }
    // }
        
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
    //console.log("received!!")
    await ack();
    //console.log("hello!!")
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

app.command("/role", async ({ ack, command, client }) => {
    await ack();

    try {
        const [action, roleName] = command.text.trim().split(/\s+/);
        const channelId = command.channel_id;
        const userId = command.user_id;

        switch (action) {
            case "create":
                await createRole(roleName);
                return client.chat.postEphemeral({
                    channel: channelId,
                    user: userId,
                    text: `✅ Role *@${roleName}* created.`,
                });

            case "delete":
                await deleteRole(roleName);
                return client.chat.postEphemeral({
                    channel: channelId,
                    user: userId,
                    text: `🗑️ Role *@${roleName}* deleted.`,
                });

            case "add":
            case "remove":
                return openRoleMemberModal(client, command.trigger_id, {
                    action,
                    channelId,
                    roleName,
                    requester: userId
                });

            case "list":
                const roles = await getRoles();
                return client.chat.postEphemeral({
                    channel: channelId,
                    user: userId,
                    text: roles.length
                        ? `*Roles:*\n${roles.map(r => `• @${r.name}`).join("\n")}`
                        : "No roles exist yet."
                });

            default:
                return client.chat.postEphemeral({
                    channel: channelId,
                    user: userId,
                    text:
                        "*Usage:*\n" +
                        "`/role create <name>`\n" +
                        "`/role delete <name>`\n" +
                        "`/role add`\n" +
                        "`/role remove`\n" +
                        "`/role list`",
                });
        }
    } catch(err) {
        console.error("Error with /role:\n", err);
    }
});

async function openRoleMemberModal(client, triggerId, meta) {
    const channelId = meta.channelId;
    const roles = (await getRoles())
        .sort((a, b) => a.name.localeCompare(b.name));

    //console.log("****\n\n\n", channelMeetings, "\n\n\n****")

    if (!roles.length) {
        await client.chat.postEphemeral({
        channel: channelId,
        user: meta.requester,
        text: "There are no roles.",
    });

    return;
    }

    // Build dropdown options
    const options = roles.map(m => ({
        text: {
            type: "plain_text",
            text: m.name,
        },
        value: m.name,
    }));

    await client.views.open({
        trigger_id: triggerId,
        view: {
            type: "modal",
            callback_id: "role_member_modal",
            private_metadata: JSON.stringify(meta),
            title: { type: "plain_text", text: "Select Users" },
            submit: { type: "plain_text", text: meta.action === "add" ? "Add" : "Remove" },
            close: { type: "plain_text", text: "Cancel" },
            blocks: [
                {
                    type: "input",
                    block_id: "role_block",
                    label: { type: "plain_text", text: "Select a role" },
                    element: {
                        type: "static_select",
                        action_id: "role_select",
                        options,
                    },
                },
                {
                    type: "input",
                    block_id: "users",
                    label: { type: "plain_text", text: "Choose users" },
                    element: {
                        type: "multi_users_select",
                        action_id: "selected",
                    },
                },
            ],
        },
    });
}

app.view("role_member_modal", async ({ ack, body, view, client }) => {
    await ack();

        const meta = JSON.parse(view.private_metadata);
        const users = view.state.values.users.selected.selected_users;
        const roleBlock = view.state.values.role_block?.role_select;
        if (!roleBlock?.selected_option) {
             throw new Error("No role selected");
        }

        const role = roleBlock.selected_option.value;

        for (const user of users) {

            //console.log("******\n\n", role, "\n\n******")
            if (meta.action === "add") {
                await addUserToRole(role, user);
            } else {
                await removeUserFromRole(role, user);
            }
        }

        await client.chat.postEphemeral({
            channel: meta.channelId,
            user: meta.requester,
            text:
                `✅ ${meta.action === "add" ? "Added" : "Removed"} ` +
                `${users.length} user(s) ${meta.action === "add" ? "to" : "from"} *@${role}*.`
        });
});

app.command("/ping", async ({ ack, command, client }) => {
    await ack();

    try {
        const channelId = command.channel_id;
        const senderId = command.user_id;

        const text = command.text.trim();
        if (!text.startsWith("@")) {
            return client.chat.postEphemeral({
                channel: channelId,
                user: senderId,
                text: "Usage: `/ping @role [optional message]`",
            });
        }

        // Split only once, so the rest preserves line breaks
        const firstSpace = text.indexOf(" ");
        const roleToken = firstSpace === -1 ? text : text.slice(0, firstSpace);
        const message = firstSpace === -1 ? "" : text.slice(firstSpace + 1);

        const roleName = roleToken.replace(/^@/, "");
        //console.log(roleName)
        const role1 = await getRoleByName(roleName);
        const role = role1[0]
        //console.log(role.name)
        if (!role) {
            return client.chat.postEphemeral({
                channel: channelId,
                user: senderId,
                text: `Role *@${roleName}* does not exist.`,
            });
        }

        const users = await getUsersInRole(role.name);
        if (!users.length) {
            return client.chat.postEphemeral({
                channel: channelId,
                user: senderId,
                text: `*@${roleName}* has no members.`,
            });
        }

        // Invite users if they are not in the channel
        for (const u of users) {
            try {
                await client.conversations.invite({
                    channel: channelId,
                    users: u.user_id,
                });
            } catch (err) {
                if (err.data?.error !== "already_in_channel") {
                    console.warn(`Invite failed for ${u.user_id}:`, err.data?.error);
                }
            }
        }

        // Post ephemeral mentions **individually**
        for (const u of users) {
            await client.chat.postEphemeral({
                channel: channelId,
                user: u.user_id,
                text:
                    `*@${roleName}* <@${u.user_id}>`,
            });
        }

        const res = await client.users.info({ user: senderId });
        const user = res.user;
        const displayName = user.profile.display_name || user.real_name || "Unknown User";
        const avatarUrl = user.profile.image_192 || user.profile.image_72;

        await client.chat.postMessage({
                    channel: channelId,
                    text: message,
                    username: displayName,
                    icon_url: avatarUrl
        });

    } catch (err) {
        console.error("Error in /ping:", err);
    }
});

app.event("message", async ({ event, client }) => {
  try {
    if (!event.text || event.subtype) return; // ignore bot messages and edits

    const roleMatch = event.text.match(/@(\w[\w-]*)/);
    if (!roleMatch) return;

    const roleName = roleMatch[1];
    const role1 = await getRoleByName(roleName);
    const role = role1[0]
    if (!role) return;

    const users = await getUsersInRole(role.name);
    if (!users.length) return;

    for (const u of users) {
      await client.chat.postEphemeral({
        channel: event.channel,
        user: u.user_id,
        text: `*@${roleName}* <@${u.user_id}>`
      });
    }

  } catch (err) {
    console.error("Error handling role ping message:", err);
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

app.command("/showroles", async ({ ack, command, client }) => {
    await ack();

    const channelId = command.channel_id;
    const senderId = command.user_id;
    const text = command.text.trim();

    let roleFilter = null;
    if (text.startsWith("@")) {
        roleFilter = text.slice(1); // remove "@"
    }

    try {
        //Get all members in the channel
        let allMembers = [];
        let cursor;
        do {
            const res = await client.conversations.members({
                channel: channelId,
                cursor,
                limit: 1000
            });
            allMembers.push(...res.members);
            cursor = res.response_metadata?.next_cursor;
        } while (cursor);

        if (!allMembers.length) {
            return client.chat.postEphemeral({
                channel: channelId,
                user: senderId,
                text: "No members found in this channel."
            });
        }

        //Build message blocks
        const blocks = [];

        for (const userId of allMembers) {
            const userRoles = await getUserRoles(userId); // returns array of role objects {id, name}
            console.log(userRoles)
            // If a role filter is applied, skip users without it
            if (roleFilter && !userRoles.some(r => r.role_id === roleFilter)) continue;

            const res = await client.users.info({ user: userId });
            const user = res.user;
            const displayName = user.profile.display_name || user.real_name || "Unknown User";
            const avatarUrl = user.profile.image_192 || user.profile.image_72;

            let roleString = userRoles.map(r => `• \`@${r.role_id}\``).join("\n") || "_No roles_";

            blocks.push(
                { type: "divider" },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `*${displayName}*\nRoles:\n${roleString}`
                    },
                    accessory: {
                        type: "image",
                        image_url: avatarUrl,
                        alt_text: "avatar thumbnail"
                    }
                }
            );
        }

        if (!blocks.length) {
            return client.chat.postEphemeral({
                channel: channelId,
                user: senderId,
                text: roleFilter
                    ? `No members with role *@${roleFilter}* in this channel.`
                    : "No members found."
            });
        }

        blocks.push({ type: "divider" });

        //Send ephemeral message
        await client.chat.postEphemeral({
            channel: channelId,
            user: senderId,
            text: "Roles in this channel",
            blocks
        });

    } catch (err) {
        console.error("Error with /showroles:", err);
        await client.chat.postEphemeral({
            channel: channelId,
            user: senderId,
            text: "Something went wrong while fetching roles."
        });
    }
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
