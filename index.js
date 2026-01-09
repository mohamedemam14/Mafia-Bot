import {
  Client,
  GatewayIntentBits,
  Partials,
  Events
} from "discord.js";
import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

dotenv.config();

// إعداد المسارات لتعمل على Linux/Railway
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "progress.json");

/* ================== التأكد من وجود المجلد والملف ================== */
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "{}");
}

/* ================== إعدادات ================== */
const ADMIN_ROLE_ID = "1459164560480145576";
const FOLLOW_ROOM_ID = "1459162738503847969";

const TASKS_RANK_2 = {
  "1459162810130108448": "الإرشاد",
  "1459162799212200156": "الاستقبال",
  "1459162816043810984": "المخالفات",
  "1459162802781552822": "الفعاليات",
  "1459162813363654778": "الإعلام",
  "1459162806786981919": "CPR"
};

const TASKS_RANK_3 = {
  "1459162835333419120": "الإرشاد",
  "1459162827465035818": "الاستقبال",
  "1459162840597266587": "المخالفات",
  "1459162830086606878": "الفعاليات",
  "1459162837963378728": "الإعلام",
  "1459162832699392080": "CPR"
};

/* ================== أدوات الحفظ ================== */
function loadProgress() {
  try {
    const data = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

function saveProgress(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* ================== البوت ================== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const app = express();
app.get("/", (req, res) => res.send("Bot Running"));
app.listen(process.env.PORT || 3000);

function buildFollowMessage(userId, rank, doneTasks, totalTasks) {
  const list = totalTasks.map(t =>
    `${doneTasks.includes(t) ? "✅" : "❌"} ${t}`
  ).join("\n");

  return `
📋 **متابعة مهام رتبة ${rank}**
━━━━━━━━━━━━━━
👤 المتدرب: <@${userId}>

📝 المهام:
${list}
━━━━━━━━━━━━━━
📊 التقدم: ${doneTasks.length} / ${totalTasks.length}
`;
}

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot || reaction.emoji.name !== "✅") return;

  try {
    const message = await reaction.message.fetch();
    const guild = message.guild;
    const member = await guild.members.fetch(user.id).catch(() => null);

    if (!member || !member.roles.cache.has(ADMIN_ROLE_ID)) return;

    const roomId = message.channelId;
    const traineeId = message.author.id;

    let rank = null;
    let taskName = null;

    if (TASKS_RANK_2[roomId]) {
      rank = 2;
      taskName = TASKS_RANK_2[roomId];
    } else if (TASKS_RANK_3[roomId]) {
      rank = 3;
      taskName = TASKS_RANK_3[roomId];
    } else return;

    const progress = loadProgress();

    if (!progress[traineeId]) {
      progress[traineeId] = {
        rank,
        tasks: [],
        completedRooms: [],
        followMessageId: null
      };
    }

    const data = progress[traineeId];
    if (data.completedRooms.includes(roomId)) return;

    data.completedRooms.push(roomId);
    data.tasks.push(taskName);

    const allTasks = Object.values(rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3);
    const followChannel = await client.channels.fetch(FOLLOW_ROOM_ID);

    const content = buildFollowMessage(traineeId, rank, data.tasks, allTasks);

    if (data.followMessageId) {
      const msg = await followChannel.messages.fetch(data.followMessageId).catch(() => null);
      if (msg) await msg.edit(content);
      else {
        const newMsg = await followChannel.send(content);
        data.followMessageId = newMsg.id;
      }
    } else {
      const msg = await followChannel.send(content);
      data.followMessageId = msg.id;
    }

    saveProgress(progress);
    await message.reactions.removeAll();
    await message.react("✅");
  } catch (err) {
    console.error("Error in Reaction Event:", err);
  }
});

client.once(Events.ClientReady, () => {
  console.log(`🚀 Bot Online: ${client.user.tag}`);
});

process.on("unhandledRejection", err => console.error(err));

client.login(process.env.TOKEN);
