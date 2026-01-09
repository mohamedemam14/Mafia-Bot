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

/* ================== الإعدادات (ضع الأيدي هنا) ================== */
const ADMIN_ROLE_ID = "1459164560480145576";
const FOLLOW_ROOM_ID = "1459162738503847969";

const READY_RANK_2_ROOM_ID = "1459162810130108448"; // مثال
const READY_RANK_3_ROOM_ID = "1459162835333419120"; // مثال
const READY_COMBINED_ROOM_ID = "1459162738503847969"; // مثال

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

/* ================== تنسيق الرسائل الاحترافي ================== */

// 1. رسالة المتابعة الدورية
function buildFollowMessage(userId, rank, doneTasks, totalTasks) {
  const percent = Math.round((doneTasks.length / totalTasks.length) * 100);
  const progressBar = "🔹".repeat(Math.round(percent/10)) + "🔸".repeat(10 - Math.round(percent/10));

  const list = totalTasks.map(t =>
    doneTasks.includes(t) ? `┃ ✅ **${t}**` : `┃ 🔘 *${t}*`
  ).join("\n");

  return `
### 📑 مـلف تـدريب المـوظفين
┏━━━━━━━━━━━━━━━━━━┓
  👤 **المتدرب:** <@${userId}>
  🎖️ **الرتبة المستهدفة:** \`Rank ${rank}\`
┗━━━━━━━━━━━━━━━━━━┛

✨ **المهام المنجزة:**
${list}

📊 **مستوى التقدم العام:**
┃ ${progressBar} **${percent}%**
┃ تم إنهاء (\`${doneTasks.length}/${totalTasks.length}\`) من المتطلبات.

📅 *آخر تحديث: <t:${Math.floor(Date.now() / 1000)}:R>*
`;
}

// 2. نموذج الترقية (رتبة 2 و 3)
function buildReadyToUpgradeMessage(userId, rank) {
  return `
🎊 **تـهـنـئـة إتـمـام مـهـام** 🎊
━━━━━━━━━━━━━━━━━━━━
👤 **المتدرب:** <@${userId}>
🏅 **الرتبة المنجزة:** \`Rank ${rank}\`
✅ **الحالة:** جاهز للترقية رسمياً

🔗 https://cdn.discordapp.com/attachments/1449506416065908816/1454546137439801354/1571650a7c706000-1.gif
━━━━━━━━━━━━━━━━━━━━
`;
}

// 3. نموذج الروم المشترك
function buildCombinedMessage(userId, rank) {
  return `
> 💠 **إشعار ترقية جديد**
> 👤 **إسم المتدرب :** <@${userId}>
> 🎖️ **الرتبة الحالية :** \`${rank}\`
> 
> ✨ **جاهز للترقية :** ✅
`;
}

/* ================== البوت والعمليات ================== */
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
app.get("/", (req, res) => res.send("System Active"));
app.listen(process.env.PORT || 3000);

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  const isTaskRoom = TASKS_RANK_2[message.channelId] || TASKS_RANK_3[message.channelId];
  if (!isTaskRoom) return;

  const progress = loadProgress();
  if (progress[message.author.id] && progress[message.author.id].completedRooms.includes(message.channelId)) {
    const warning = await message.reply(`⛔ <@${message.author.id}>، هذه المهمة مسجلة لك مسبقاً في السجلات.`);
    setTimeout(() => { message.delete().catch(() => {}); warning.delete().catch(() => {}); }, 4000);
    return;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approve_task').setLabel('قبول واعتماد ✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('missing_photo').setLabel('نقص صور 📷').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('reject_task').setLabel('رفض المهمة ❌').setStyle(ButtonStyle.Danger)
  );

  await message.reply({ content: `⚙️ **لوحة التحكم الإدارية لـ <@${message.author.id}>:**`, components: [row] });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.roles.cache.has(ADMIN_ROLE_ID)) return interaction.reply({ content: "🚫 صلاحيات إدارية مطلوبة.", ephemeral: true });

  const originalMessage = await interaction.channel.messages.fetch(interaction.message.reference.messageId).catch(() => null);
  if (!originalMessage) return;

  const traineeId = originalMessage.author.id;
  const roomId = interaction.channelId;

  if (interaction.customId === 'approve_task') {
    let rank = TASKS_RANK_2[roomId] ? 2 : 3;
    let taskName = TASKS_RANK_2[roomId] || TASKS_RANK_3[roomId];

    const progress = loadProgress();
    if (!progress[traineeId]) progress[traineeId] = { rank, tasks: [], completedRooms: [], followMessageId: null, upgradeNotified: false };
    
    const data = progress[traineeId];
    if (data.completedRooms.includes(roomId)) return interaction.reply({ content: "مسجلة مسبقاً.", ephemeral: true });

    data.completedRooms.push(roomId);
    data.tasks.push(taskName);

    const allTasks = Object.values(rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3);
    const followChannel = await client.channels.fetch(FOLLOW_ROOM_ID);
    const content = buildFollowMessage(traineeId, rank, data.tasks, allTasks);

    if (data.followMessageId) {
      const msg = await followChannel.messages.fetch(data.followMessageId).catch(() => null);
      if (msg) await msg.edit({ content });
    } else {
      const msg = await followChannel.send({ content });
      data.followMessageId = msg.id;
    }

    if (data.tasks.length === allTasks.length && !data.upgradeNotified) {
      data.upgradeNotified = true;
      const targetRoom = await client.channels.fetch(rank === 2 ? READY_RANK_2_ROOM_ID : READY_RANK_3_ROOM_ID).catch(() => null);
      if (targetRoom) await targetRoom.send(buildReadyToUpgradeMessage(traineeId, rank));
      const combinedRoom = await client.channels.fetch(READY_COMBINED_ROOM_ID).catch(() => null);
      if (combinedRoom) await combinedRoom.send(buildCombinedMessage(traineeId, rank));
    }

    saveProgress(progress);
    await originalMessage.reactions.removeAll().catch(() => {});
    await originalMessage.react("✅");
    await interaction.update({ content: "⭐ **تم الاعتماد بنجاح.**", components: [] });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);

  } else if (interaction.customId === 'missing_photo') {
    await originalMessage.reactions.removeAll().catch(() => {});
    await originalMessage.react("📷");
    await interaction.update({ content: "📸 **تم إبلاغ المتدرب بنقص الصور.**", components: [] });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
  } else if (interaction.customId === 'reject_task') {
    await originalMessage.reactions.removeAll().catch(() => {});
    await originalMessage.react("❌");
    await interaction.update({ content: "⚠️ **تم رفض المهمة.**", components: [] });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
  }
});

client.once(Events.ClientReady, () => console.log(`🚀 System Online: ${client.user.tag}`));
client.login(process.env.TOKEN);
