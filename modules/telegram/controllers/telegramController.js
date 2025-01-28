const Programme = require("../../../models/programme");
const axios = require("axios");
const FormData = require("form-data");
const OpenAI = require("openai");


// Configure OpenAI API
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const fileType = require("file-type");
require("dotenv").config();
const mindSphereData = require("../../chatbot/data/mindSphereData");
const pool = require("../../../dbConfig"); // Database connection
const cron = require("node-cron");
const { v4: uuidv4 } = require("uuid");

// OpenAI API setup
const openai = new OpenAI({
  apiKey: `${process.env.OPENAI_API_KEY}`,
});

// Telegram Bot Setup
const TelegramBot = require("node-telegram-bot-api");
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const CHANNEL_ID = process.env.CHANNEL_ID; // Telegram Channel ID
const GROUP_ID = process.env.GROUP_ID; // Telegram Group ID

// Log errors
// bot.on("polling_error", (error) => {
//   console.error("Polling error:", error);
// });

// Delete expired Telegram IDs from the database
cron.schedule("0 0 * * *", async () => { // Every midnight
    try {
        await pool.query(`DELETE FROM TemporaryTelegramIDs WHERE expires_at <= NOW()`);
        console.log("Expired tokens cleaned up.");
    } catch (error) {
        console.error("Error cleaning up expired tokens:", error);
    }
});


// 📌 **Handle `/start` Command**
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.chat.first_name || "User";

  // Send a welcome message and ask for email or phone
  bot.sendMessage(
    chatId,
    `Hi ${firstName}! 👋\n\nWelcome to *MindSphere*! 🚀\n\n✅ Before we continue, please reply with your *email address* so we can link your Telegram account.`
  );

  bot.once("message", async (response) => {
    const identifier = response.text; // Assume the user replies with an email

    try {
      // Save the chatId and identifier in the database
      await pool.query(
        `INSERT INTO TemporaryTelegramIDs (telegram_id, token, expires_at)
         VALUES (?, ?, NOW() + INTERVAL 1 DAY)
         ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at)`,
        [chatId, identifier]
      );

      // Send invite links for the Telegram Channel and Group
      bot.sendMessage(
        chatId,
        `🎉 *Great! Now join our official Telegram communities:*\n\n` +
        `🔹 [Join Our Channel](https://t.me/${CHANNEL_ID})\n` +
        `🔹 [Join Our Group](https://t.me/${GROUP_ID})\n\n` +
        `⚠️ *Once you've joined, type* /confirm *to verify your membership.*`
      );
    } catch (error) {
      console.error("Error saving Telegram ID and identifier:", error);
      bot.sendMessage(chatId, "❌ An error occurred. Please try again later.");
    }
  });
});

// 📌 **Handle `/confirm` Command (Check if user joined)**
bot.onText(/\/confirm/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    // Check if user is in the channel
    const channelMember = await bot.getChatMember(CHANNEL_ID, chatId);
    const groupMember = await bot.getChatMember(GROUP_ID, chatId);

    if (
      ["member", "administrator", "creator"].includes(channelMember.status) &&
      ["member", "administrator", "creator"].includes(groupMember.status)
    ) {
      bot.sendMessage(
        chatId,
        `✅ *Thank you for joining our communities!* 🎉\n\nYou're all set! Stay tuned for updates and discussions in our group.`
      );
    } else {
      bot.sendMessage(
        chatId,
        `⚠️ *It looks like you haven't joined both our Telegram Channel and Group.*\n\n` +
        `Please make sure you've joined:\n` +
        `🔹 [Join Our Channel](https://t.me/${CHANNEL_ID})\n` +
        `🔹 [Join Our Group](https://t.me/${GROUP_ID})\n\n` +
        `Once you've joined, type *"/confirm"* again.`
      );
    }
  } catch (error) {
    console.error("Error checking Telegram membership:", error);
    bot.sendMessage(chatId, "❌ An error occurred while verifying your membership. Please try again.");
  }
});

// // Handle `/link` command (optional if users can manually enter tokens)
// bot.onText(/\/link/, async (msg) => {
//   const chatId = msg.chat.id;

//   try {
//     // Retrieve the user token from the database
//     const result = await pool.query(
//       `SELECT token FROM TemporaryTelegramIDs WHERE telegram_id = $1 AND expires_at > NOW()`,
//       [chatId]
//     );

//     if (result.rows.length === 0) {
//       bot.sendMessage(
//         chatId,
//         "It seems we don't have your information. Please restart the bot by typing /start."
//       );
//       return;
//     }

//     const token = result.rows[0].token;
//     bot.sendMessage(
//       chatId,
//       `Hi! Your Telegram token is: \`${token}\`. Please use this token during sign-up to link your Telegram account.`
//     );
//   } catch (error) {
//     console.error("Error retrieving Telegram token:", error);
//     bot.sendMessage(chatId, "An error occurred. Please try again later.");
//   }
// });

// Create a clickable location link
const createLocationLink = (location) => {
    if (location.toLowerCase().includes("http") || location.toLowerCase().includes("online")) {
      // If the location is an online link (e.g., Zoom, Google Meet), return it as-is
      return `[Join the Online Meeting](${location})`;
    } else {
      // Otherwise, treat it as a physical address and generate a Google Maps link
      const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
      return `[${location}](${mapsLink})`;
    }
  };
  
// Save programme image to a temporary file
const saveProgrammeImageToTemp = async (programmeID) => {
  try {
    const imageData = await Programme.getProgrammePictureByID(programmeID);
    if (!imageData) throw new Error(`No image found for ProgrammeID: ${programmeID}`);

    const buffer = Buffer.from(imageData, "base64");
    const detectedType = await fileType.fromBuffer(buffer);

    if (!detectedType || !["image/jpeg", "image/png", "image/webp"].includes(detectedType.mime)) {
      throw new Error(`Unsupported image format: ${detectedType ? detectedType.mime : "unknown"}`);
    }

    console.log(`Detected image format: ${detectedType.mime}`);

    const tempDir = path.join(__dirname, "../../../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const tempFilePath = path.join(tempDir, `programme_${programmeID}_${Date.now()}.${detectedType.ext}`);
    fs.writeFileSync(tempFilePath, buffer);

    console.log(`Image saved to: ${tempFilePath}`);
    return tempFilePath;
  } catch (error) {
    console.error("Error saving programme image to temporary file:", error);
    throw error;
  }
};

// Validate and optimize image
const validateAndOptimizeImage = async (filePath) => {
  try {
    const metadata = await sharp(filePath).metadata();
    console.log(`Image format: ${metadata.format}, Dimensions: ${metadata.width}x${metadata.height}`);

    const optimizedDir = path.join(path.dirname(filePath), "optimized");
    if (!fs.existsSync(optimizedDir)) fs.mkdirSync(optimizedDir);

    const optimizedPath = path.join(
      optimizedDir,
      `${path.basename(filePath, path.extname(filePath))}-optimized${path.extname(filePath)}`
    );

    await sharp(filePath)
      .resize(800, 600, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toFile(optimizedPath);

    console.log(`Optimized image saved to: ${optimizedPath}`);
    return optimizedPath;
  } catch (error) {
    console.error("Error validating or optimizing image:", error);
    throw error;
  }
};

// Delete temporary files
const cleanUpFiles = (files) => {
  files.forEach((filePath) => {
    try {
        console.log(`Attempting to delete temporary file: ${filePath}`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted temporary file: ${filePath}`);
      }
    } catch (err) {
      console.error(`Error deleting file ${filePath}:`, err);
    }
  });
};

// Fetch programme details and format them
const fetchFormattedDetails = async (programme) => {
    const currentDate = new Date().toLocaleDateString("en-SG", { timeZone: "Asia/Singapore" });
  
    if (programme.DiscountValue === null || programme.DiscountValue === 0) {
        programme.DiscountValue = "Free";
    }


    // Create a clickable location link
    const locationLink = createLocationLink(programme.Location || "To be confirmed");

    // Format the details with Markdown-friendly styling
    const programmeDetails = `
  🔍Name: *${programme.ProgrammeName}*
  💡 *Category*: ${programme.Category}
  📍 *Location*: ${locationLink}
  ⏳ *Duration*: ${programme.Duration || "Not specified"}
  📅 *Date*: ${new Date(programme.EarliestStartDateTime).toLocaleString()} to ${new Date(
      programme.LatestEndDateTime
    ).toLocaleString()}
  💵 *Fee*: ${programme.Fee ? `$${parseFloat(programme.Fee).toFixed(2)}` : "Free"}
  🎯 *Level*: ${programme.ProgrammeLevel || "All levels"}
  
  📖 *Description*: ${programme.Description}
  Discount: ${programme.DiscountType === "Percentage" ? `${programme.DiscountValue}% off` : `$${programme.DiscountValue} off`}

  ⚠️ *Remarks*: ${programme.Remarks || "None"}
  🎟 *Slots Available*: ${programme.SlotsLeft || "Not specified"}
  Reviews: ${
                programme.Reviews
                    ? programme.Reviews.map(
                          (review) =>
                              `${review.ReviewerName} (${review.Rating}/5): "${review.ReviewText}"`
                      ).join("\n")
                    : "No reviews yet"
            }
  📌 _Don't miss this chance! Reserve your spot today!_
    `;
  
    // Use OpenAI to generate an engaging summary (optional)
    const messages = [
      {
        role: "system",
        content: `You are an expert assistant tasked with presenting programme details in a clear and engaging manner. Make the announcement friendly, inviting and neater using styles for Telegram messages.
                **Important: You will be provided the programme details.**
                You can use styles like bolding, which is '*' for Markdown. If the slots are low, make it stand out to users, and create a sense of urgency to sign up.
                If unsure, provide a general response. If there is a few days left to the event, make sure to highlight it and urge users to sign up. 
                You will write it in an engaging and informative manner. You can add emojis, bullet points, and other formatting to make it more appealing.
                You can use marketing gimmicks to attract more attention, such as limited slots, discounts (if any), or limited time left.
                Do not reveal any private or personal information, and ensure that user privacy is protected. The current date is ${currentDate}. 
                Company Contact Information: ${JSON.stringify(mindSphereData.contact)}.
                Present the programme details in an easy-to-read format. Keep your responses at most 300 words. You should make an engaing description, here's a reference:
                "Hey FoodAIDers! 🫶🤗

                FoodAID is excited to bring you our first Sub-comm event Turning Flaws Into Fresh Finds #1! 🍉 This is your chance to make a difference by redistributing imperfect produce and near-expiry food items, reducing food waste for a good cause. 

                "Details of Event:
                Date 📆: 16 November 2024, Saturday
                Reporting Time 🕑: 1.50 pm
                Dismissal Time 🕞: 7.50 pm
                Reporting Venue 📲: Entrance/Exit B - Thanggam LRT (SW4)
                Event Venue 📍: Thanggam Hub, 40 Fernvale Road, S(797699), Hardcourt next to Thanggam LRT
                Dress Code 👕: NP/FoodAID Shirt and Covered Shoes (Ensure you have either an NP/FoodAID Shirt)
                Things to Bring 🎒: Umbrella/Poncho, EZ-Link Card, Water Bottle, Hand Sanitiser

                For inquiries, contact:
                Fazal 🥐 WhatsApp: 8268 1571, Tele: @fazalz
                Rui Ning ☔️ WhatsApp: 8809 1773, Tele: @xpzro
                Rachel 🍓 WhatsApp: 9388 4734, Tele: @wreckgel

                📌 Successful FoodAIDers will be added to a WhatsApp group by 12 November, Tuesday upon confirmation
                📌 Limited Slots available
                📌 First-Come-First-Serve Basis. SIGN UP NOW!!
                📌 Waiting List slots available! Scroll through the form for more details!
                📌 You will be awarded 5.0 Service (S) hours for your participation.

                ✅ Please remember to have your meal before coming for the event
                ✅ This is a Face-to-Face event
                ✅ It is compulsory to have an NP/FoodAID Shirt for this event

                📝 Do take note that short pants are recommended as the venue may get humid!

                See you at Turning Flaws Into Fresh Finds #1!"`,
      },
      { role: "user", content: programmeDetails },
    ];
  
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });
  
    return response.choices[0].message.content.trim();
  };

  const escapeMarkdownV2 = (text) => {
    // Escape Telegram MarkdownV2 reserved characters
    return text
      .replace(/_/g, "\\_") // Escape underscores
      .replace(/\*/g, "\\*") // Escape asterisks
      .replace(/\[/g, "\\[") // Escape left square brackets
      .replace(/]/g, "\\]") // Escape right square brackets
      .replace(/\(/g, "\\(") // Escape left parentheses
      .replace(/\)/g, "\\)") // Escape right parentheses
      .replace(/~/g, "\\~") // Escape tildes
      .replace(/`/g, "\\`") // Escape backticks
      .replace(/>/g, "\\>") // Escape greater-than sign
      .replace(/#/g, "\\#") // Escape hash
      .replace(/\+/g, "\\+") // Escape plus
      .replace(/-/g, "\\-") // Escape minus
      .replace(/=/g, "\\=") // Escape equal
      .replace(/\|/g, "\\|") // Escape pipe
      .replace(/{/g, "\\{") // Escape left curly brace
      .replace(/}/g, "\\}") // Escape right curly brace
      .replace(/\./g, "\\.") // Escape dot
      .replace(/!/g, "\\!"); // Escape exclamation mark
  };
  
  const sendProgrammeToTelegram = async (programmeID) => {
    let tempFilePath;
    let optimizedFilePath;
  
    try {
      const programme = await Programme.getProgrammeDetailsByID(programmeID);
      if (!programme) throw new Error(`Programme not found for ID: ${programmeID}`);
  
      let formattedDetails = await fetchFormattedDetails(programme);
  
      // this will only work if its a public server.
      //const programmeLink = `http://localhost:3000/userProgrammeInfoPage.html?programmeId=${programmeID}`;
    // Add a link to the programme details page
    const programmeLink = `https://fsdpit02full-moon-production-2509.up.railway.app/userProgrammeInfoPage.html?programmeId=${programmeID}`;
    const clickableLink = `[View More Details](${programmeLink})`;
    formattedDetails += `\n\n${clickableLink}`;

  
      let imagePath;
  
      if (Buffer.isBuffer(programme.ProgrammePicture)) {
        const bufferString = programme.ProgrammePicture.toString("utf-8");
  
        if (bufferString.includes("/") || bufferString.includes("\\")) {
          console.log("Programme picture buffer contains a relative path. Using local file...");
          const relativePath = path.join(__dirname, "../../../", bufferString);
          if (!fs.existsSync(relativePath)) {
            throw new Error(`Image file not found at relative path: ${relativePath}`);
          }
          imagePath = relativePath;
        } else {
          console.log("Programme picture is binary data. Processing as image...");
          const detectedType = await fileType.fromBuffer(programme.ProgrammePicture);
  
          if (!detectedType || !["image/jpeg", "image/png", "image/webp"].includes(detectedType.mime)) {
            throw new Error(`Unsupported image format: ${detectedType ? detectedType.mime : "unknown"}`);
          }
  
          const tempDir = path.join(__dirname, "../../../temp");
          if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  
          tempFilePath = path.join(tempDir, `programme_${programmeID}_${Date.now()}.${detectedType.ext}`);
          fs.writeFileSync(tempFilePath, programme.ProgrammePicture);
  
          optimizedFilePath = await validateAndOptimizeImage(tempFilePath);
          imagePath = optimizedFilePath;
        }
      } else if (typeof programme.ProgrammePicture === "string") {
        const relativePath = path.join(__dirname, "../../../", programme.ProgrammePicture);
        if (!fs.existsSync(relativePath)) {
          throw new Error(`Image file not found at relative path: ${relativePath}`);
        }
        imagePath = relativePath;
      } else {
        throw new Error("Invalid ProgrammePicture format. Expected a Buffer or a relative path.");
      }
  
      const imageResponse = await axios.post(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`,
        {
          chat_id: process.env.CHANNEL_ID,
          photo: fs.createReadStream(imagePath),
        },
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
  
      console.log("Image sent to Telegram successfully:", imageResponse.data);
  
      const textResponse = await axios.post(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: process.env.CHANNEL_ID,
          text: formattedDetails,
          parse_mode: "markdown",
        }
      );
  
      console.log("Text sent to Telegram successfully:", textResponse.data);
    } catch (error) {
      console.error("Error sending programme to Telegram:", error);
      throw error;
    } finally {
      if (tempFilePath || optimizedFilePath) {
        cleanUpFiles([tempFilePath, optimizedFilePath]);
      }
    }
  };
  
  
// Expose as API endpoint
const sendProgramme = async (req, res) => {
  const { programmeID } = req.params;
  try {
    await sendProgrammeToTelegram(programmeID);
    res.status(200).json({ message: "Programme sent to Telegram successfully." });
  } catch (error) {
    console.error("Error in sendProgramme:", error);
    if (!res.headersSent) {
        res.status(500).json({ message: "Error sending programme to Telegram", error: error.message });
      }
  }
};




// Telegram Post
// Function to fetch messages from the Telegram group
const getUserMessage = async (req, res) => {
    try {
        // Make a GET request to the Telegram API to fetch updates
        const response = await axios.get(
            `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`
        );

        // Extract updates from the response
        const updates = response.data.result;

        if (updates.length === 0) {
            return res.status(200).json({ message: "No new messages found." });
        }

        // Filter messages from the specific chat ID
        const filteredMessages = updates
            .filter(update => update.message && update.message.chat.id === -1002352524230)
            .map(update => {
                const message = update.message;
                return {
                    chatId: message.chat.id,
                    chatTitle: message.chat.title,
                    senderId: message.from.id,
                    senderUsername: message.from.username,
                    text: message.text,
                    date: new Date(message.date * 1000).toISOString(), // Convert timestamp to readable date
                };
            });

        if (filteredMessages.length === 0) {
            return res.status(200).json({ message: "No messages found for the specified chat." });
        }

        // Send the filtered messages as a response
        res.status(200).json({ messages: filteredMessages });
    } catch (error) {
        console.error("Error fetching user messages:", error);
        res.status(500).json({ message: "Failed to fetch user messages" });
    }
};


// ===================== Telegram Bot Event Handlers ===================== //

// Listen for the "/start" command
// bot.onText(/\/start/, async (msg) => {
//     const chatId = msg.chat.id;
//     const messageId = msg.message_id;
//     const userName = msg.from.first_name || 'there';

//     // Send a welcome message to the user privately (via reply or direct message)
//     bot.sendMessage(chatId, `Hello, ${userName}! Welcome to our Telegram bot. How can I assist you today?`, {
//         reply_to_message_id: messageId,  // Optional: reply to the user's message
//     });

//     // Check if the message is from a group chat
//     if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
//         // Delete the original /start message to hide it from others
//         bot.deleteMessage(chatId, messageId).catch((error) => {
//             console.error("Failed to delete message:", error);
//         });
//     }
// });

// // Listen for the "/start" command
// bot.onText(/\/start/, (msg) => {
//     const chatId = msg.chat.id;
//     const userName = msg.from.first_name || 'there';

//     // Send a welcome message
//     bot.sendMessage(chatId, `Hello, ${userName}! Welcome to our Telegram bot. How can I assist you today?`);
// });

// Handle other messages
// const userCooldowns = {};  // To track user message timestamps
// const spamCooldownSeconds = 60;  // Allow posting every 60 seconds

// bot.on('message', async (msg) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;
//     const userMessage = msg.text;
//     const messageId = msg.message_id;

//     // Ignore bot's own messages
//     if (msg.from.is_bot) return;

//     // Spam prevention: Check if user is posting too frequently
//     if (userCooldowns[userId] && (Date.now() - userCooldowns[userId]) < spamCooldownSeconds * 1000) {
//         bot.deleteMessage(chatId, messageId).catch(() => {});
//         bot.sendMessage(userId, "You're sending messages too frequently. Please wait a while before posting again.");
//         return;
//     }

//     // Save the current timestamp to prevent spam
//     userCooldowns[userId] = Date.now();

//     // Moderate the message via OpenAI (ChatGPT)
//     try {
//         const response = await openai.chat.completions.create({
//             model: "gpt-4",
//             messages: [
//                 { role: "system", content: "You are a content moderator. Approve only relevant and polite messages." },
//                 { role: "user", content: userMessage }
//             ],
//         });

//         const moderationResult = response.choices[0].message.content.toLowerCase();

//         if (moderationResult.includes('approve')) {
//             bot.sendMessage(chatId, `${msg.from.first_name} posted:\n\n${userMessage}`);
//         } else {
//             bot.sendMessage(userId, "Your message was not approved. Please follow community guidelines.");
//         }

//         // Delete original message from group
//         bot.deleteMessage(chatId, messageId).catch(() => {});
//     } catch (error) {
//         console.error("Error during moderation:", error);
//         bot.sendMessage(userId, "An error occurred while processing your message. Please try again later.");
//     }
// });

// Message handling logic with spam and moderation checks
const userCooldowns = {}; // Store user cooldown timestamps
// const spamCooldownSeconds = 5; // Cooldown period in seconds

bot.onText(/\/rules/, (msg) => {
  const chatId = msg.chat.id;

  const rulesMessage = `
📜 *Group Rules* 📜

1️⃣ **Be Respectful** – Treat everyone with kindness and respect. No hate speech, harassment, or personal attacks.
2️⃣ **No Spam** – Avoid flooding the chat with repeated messages, links, or promotions.
3️⃣ **Stay On Topic** – Keep discussions relevant to the group’s purpose.
4️⃣ **No NSFW Content** – Do not share explicit, violent, or inappropriate material.
5️⃣ **Use Common Sense** – Be considerate and follow general etiquette.

🚨 Violations may result in warnings, mutes, or bans.

👮 *Admins have the final say on enforcing the rules.* 

Thank you for being a part of mindSphere community! 😊
`;

  bot.sendMessage(chatId, rulesMessage, { parse_mode: "Markdown" });
});


bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;
  const userMessage = msg.text;

  if (!userMessage) {
      console.log('Received a non-text message, ignoring it.');
      return;
  }

  // Save the current timestamp to track user activity
  userCooldowns[userId] = Date.now();

  // AI moderation
  try {
      const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
              {
                  role: "system",
                  content: `
                      You are a moderator. Classify user messages into the following categories:
                      - Return \`1\` if the message is polite, relevant, or a common social message (e.g., "hello", "good morning", "how are you").
                      - Return \`2\` ONLY if the message is offensive, spam, or clearly inappropriate.
                      - Return \`3\` if the message is neutral or ambiguous but not harmful.

                      Avoid flagging normal or friendly interactions as violations.
                  `
              },
              { role: "user", content: userMessage }
          ],
      });

      console.log("Moderation response:", response.choices[0].message.content);
      const moderationResult = response.choices[0].message.content.trim();

      if (moderationResult === '1' || moderationResult === '3') {
          // Approved message, do nothing
      } else if (moderationResult === '2') {
          // Unapproved message (offensive or spam)
          bot.deleteMessage(chatId, messageId).catch(() => {});
          bot.sendMessage(chatId, `@${msg.from.username || msg.from.first_name}, your message was not approved. Please follow the rules.`, { parse_mode: "Markdown" });
          await restrictUser(chatId, userId, 1, msg.from);
      } else {
          console.error("Unexpected moderation result:", moderationResult);
      }
  } catch (error) {
      console.error("Error during moderation:", error.message);
  }
});



// Function to mention the user by Telegram ID
// const mentionUser = (user) => {
//     if (user.username) {
//         return `@${user.username}`;
//     } else {
//         return `[${user.first_name || 'User'}](tg://user?id=${user.username})`;
//     }
// };

// Restrict user and start countdown for auto-unrestriction
async function restrictUser(chatId, userId, durationMinutes, userInfo) {
    try {
        // Check if the user is the chat owner or an admin
        const chatMember = await bot.getChatMember(chatId, userId);
        const userStatus = chatMember.status;

        // Skip restriction if user is owner or admin
        if (userStatus === 'creator' || userStatus === 'administrator') {
            console.log(`Cannot restrict user ${userId} as they are ${userStatus}.`);
            return;
        }

        // Restrict user for the specified duration
        const untilDate = Math.floor(Date.now() / 1000) + durationMinutes * 60;
        await bot.restrictChatMember(chatId, userId, {
            can_send_messages: false,
            can_send_media_messages: false,
            can_send_polls: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
            until_date: untilDate,
        });

        console.log(`${userInfo.username || userInfo.first_name} has been restricted for ${durationMinutes} minutes.`);

        // Schedule automatic unrestriction
        setTimeout(async () => {
            await unrestrictUser(chatId, userId);
        }, durationMinutes * 60 * 1000);

        //private dm
        bot.sendMessage(chatId, `${userInfo.username || userInfo.first_name} has been restricted for ${durationMinutes} minutes.`);
    } catch (error) {
        console.error(`Failed to restrict user: ${error.message}`);
    }
}


// Function to unrestrict the user
const unrestrictUser = async (chatId, userId) => {
    try {
        await bot.restrictChatMember(chatId, userId, {
            permissions: {
                can_send_messages: true,
                can_send_media_messages: true,
                can_send_other_messages: true,
                can_add_web_page_previews: true,
            }
        });

        bot.sendMessage(chatId, `${userInfo.username || userInfo.first_name} is now unrestricted.`, { parse_mode: "Markdown" });
    } catch (error) {
        console.error("Failed to unrestrict user:", error);
    }
};

// Export the functions
module.exports = {
  getUserMessage,
  sendProgramme,
  bot
};
