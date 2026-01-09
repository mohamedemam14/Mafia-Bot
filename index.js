import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from "discord.js";
import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "progress.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "{}");

/* ================== إعدادات السيرفر ================== */
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
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch (err) { return {}; }
}

function saveProgress(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* ================== تنسيق رسالة المتابعة ================== */
function buildFollowMessage(userId, rank, doneTasks, totalTasks) {
  const progressPercent = Math.round((doneTasks.length / totalTasks.length) * 100);
  const totalBars = 10;
  const completedBars = Math.round((doneTasks.length / totalTasks.length) * totalBars);
  const progressBar = "🟩".repeat(completedBars) + "⬜".repeat(totalBars - completedBars);

  const list = totalTasks.map(t =>
    `${doneTasks.includes(t) ? "✅" : "🔘"} **${t}**`
  ).join("\n");

  return `
### 📋 نظام متابعة المتدربين
━━━━━━━━━━━━━━━━━━
👤 **المتدرب:** <@${userId}>
🏅 **الرتبة:** \`Rank ${rank}\`
━━━━━━━━━━━━━━━━━━
📝 **حالة المهام:**
${list}

📊 **نسبة الإنجاز:**
[${progressBar}] **${progressPercent}%**
(\`${doneTasks.length}\` من أصل \`${totalTasks.length}\` مهام)
━━━━━━━━━━━━━━━━━━
📅 *آخر تحديث: <t:${Math.floor(Date.now() / 1000)}:R>*
`;
}

/* ================== إعداد البوت ================== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const app = express();
app.get("/", (req, res) => res.send("Bot is Online!"));
app.listen(process.env.PORT || 3000);

// --- حدث عند إرسال رسالة في غرف المهام ---
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const isTaskRoom = TASKS_RANK_2[message.channelId] || TASKS_RANK_3[message.channelId];
  if (!isTaskRoom) return;

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('approve_task')
        .setLabel('كمل المهمة ✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('missing_photo')
        .setLabel('باقي صورة 📷')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('reject_task')
        .setLabel('غير مقبولة ❌')
        .setStyle(ButtonStyle.Danger)
    );

  await message.reply({
    content: "🛠️ **إدارة المهمة:**",
    components: [row]
  });
});

// --- حدث التفاعل مع الأزرار ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.roles.cache.has(ADMIN_ROLE_ID)) {
    return interaction.reply({ content: "❌ عذراً، هذا الإجراء للمسؤولين فقط.", ephemeral: true });
  }

  // جلب الرسالة الأصلية للمتدرب
  const originalMessage = await interaction.channel.messages.fetch(interaction.message.reference.messageId).catch(() => null);
  if (!originalMessage) return interaction.reply({ content: "تعذر العثور على الرسالة الأصلية.", ephemeral: true });

  const traineeId = originalMessage.author.id;
  const roomId = interaction.channelId;

  // 1. حالة: كمل المهمة (مقبولة)
  if (interaction.customId === 'approve_task') {
    let rank = TASKS_RANK_2[roomId] ? 2 : (TASKS_RANK_3[roomId] ? 3 : null);
    let taskName = TASKS_RANK_2[roomId] || TASKS_RANK_3[roomId];

    const progress = loadProgress();
    if (!progress[traineeId]) {
      progress[traineeId] = { rank, tasks: [], completedRooms: [], followMessageId: null };
    }

    const data = progress[traineeId];
    if (data.completedRooms.includes(roomId)) {
      return interaction.reply({ content: "⚠️ هذه المهمة مسجلة مسبقاً.", ephemeral: true });
    }

    data.completedRooms.push(roomId);
    data.tasks.push(taskName);

    const allTasks = Object.values(rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3);
    const followChannel = await client.channels.fetch(FOLLOW_ROOM_ID);
    const content = buildFollowMessage(traineeId, rank, data.tasks, allTasks);

    if (data.followMessageId) {
      const msg = await followChannel.messages.fetch(data.followMessageId).catch(() => null);
      if (msg) await msg.edit({ content });
      else {
        const newMsg = await followChannel.send({ content });
        data.followMessageId = newMsg.id;
      }
    } else {
      const msg = await followChannel.send({ content });
      data.followMessageId = msg.id;
    }

    saveProgress(progress);
    await originalMessage.reactions.removeAll().catch(() => {});
    await originalMessage.react("✅");
    await interaction.update({ content: "✅ **تم اعتماد المهمة وتحديث السجل.**", components: [] });

  } 
  
  // 2. حالة: باقي صورة
  else if (interaction.customId === 'missing_photo') {
    await originalMessage.reactions.removeAll().catch(() => {});
    await originalMessage.react("📷");
    await interaction.update({ 
      content: "⚠️ **تم التنبيه: المهمة ناقصة (باقي صورة).**", 
      components: [] 
    });
  } 

  // 3. حالة: المهمة غير مقبولة
  else if (interaction.customId === 'reject_task') {
    await originalMessage.reactions.removeAll().catch(() => {});
    await originalMessage.react("❌");
    await interaction.update({ 
      content: "❌ **تم رفض المهمة. يرجى إعادة المحاولة.**", 
      components: [] 
    });
  }
});

client.once(Events.ClientReady, () => {
  console.log(`🚀 Bot Online: ${client.user.tag}`);
});

client.login(process.env.TOKEN);
