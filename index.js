import {
  Client,
  GatewayIntentBits,
  Partials,
  Events
} from "discord.js";
import express from "express";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

/* ================== إعدادات ================== */
const ADMIN_ROLE_ID = "1459164560480145576";
const FOLLOW_ROOM_ID = "1459162738503847969";
const DATA_FILE = "./data/progress.json";

/* ===== مهام Rank 2 ===== */
const TASKS_RANK_2 = {
  "1459162810130108448": "الإرشاد",
  "1459162799212200156": "الاستقبال",
  "1459162816043810984": "المخالفات",
  "1459162802781552822": "الفعاليات",
  "1459162813363654778": "الإعلام",
  "1459162806786981919": "CPR"
};

/* ===== مهام Rank 3 ===== */
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
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "{}");
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
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

/* ================== Keep Alive ================== */
const app = express();
app.get("/", (req, res) => res.send("Bot Running"));
app.listen(process.env.PORT || 3000);

/* ================== رسالة المتابعة ================== */
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

🔗 https://cdn.discordapp.com/attachments/1449506416065908816/1454546137439801354/1571650a7c706000-1.gif
`;
}

/* ================== اعتماد المهام ================== */
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot || reaction.emoji.name !== "✅") return;

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

  // 🔒 منع اعتماد نفس المهمة مرة تانية
  if (data.completedRooms.includes(roomId)) return;

  data.completedRooms.push(roomId);
  data.tasks.push(taskName);

  const allTasks = Object.values(rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3);
  const followChannel = await client.channels.fetch(FOLLOW_ROOM_ID);

  const content = buildFollowMessage(
    traineeId,
    rank,
    data.tasks,
    allTasks
  );

  if (data.followMessageId) {
    const msg = await followChannel.messages.fetch(data.followMessageId).catch(() => null);
    if (msg) await msg.edit(content);
  } else {
    const msg = await followChannel.send(content);
    data.followMessageId = msg.id;
  }

  saveProgress(progress);

  await message.reactions.removeAll();
  await message.react("✅");
});

/* ================== Ready ================== */
client.once(Events.ClientReady, () => {
  console.log(`🚀 Bot Online: ${client.user.tag}`);
});

/* ================== حماية ================== */
process.on("unhandledRejection", err => console.error(err));

client.login(process.env.TOKEN);
