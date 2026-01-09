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

/* ================== CONFIGURATION ================== */
const ADMIN_ROLE_ID = "1459164560480145576";
const FOLLOW_ROOM_ID = "1459162738503847969";
const NOTIFICATION_ROOM_ID = "1459162779419414627"; 

const READY_RANK_2_ROOM_ID = "1459162819072102574"; 
const READY_RANK_3_ROOM_ID = "1459162843327758525"; 
const READY_COMBINED_ROOM_ID = "1459162779419414627"; 

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

/* ================== UTILS & LOGIC ================== */
function loadProgress() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch (err) { return {}; }
}
function saveProgress(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getNextUpgradeDay() {
  const daysAr = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const upgradeDays = [6, 2, 4]; // Sat, Tue, Thu
  const now = new Date();
  const today = now.getDay();
  let next = upgradeDays.find(d => d > today);
  if (next === undefined) next = upgradeDays[0]; 
  return daysAr[next];
}

/* ================== MODERN STYLED MESSAGES ================== */

// 1. التقرير الدوري (Follow Up)
function buildFollowMessage(userId, rank, doneTasks, totalTasks) {
  const percent = Math.round((doneTasks.length / totalTasks.length) * 100);
  const bar = "⬛".repeat(Math.round(percent/10)) + "⬜".repeat(10 - Math.round(percent/10));
  const list = totalTasks.map(t => doneTasks.includes(t) ? `> ✅ **${t}**` : `> 🔘 \`${t}\``).join("\n");

  return `
## 💠 مـلف التدريب الـرقمي
---
👤 **الـمتدرب:** <@${userId}>
🎖️ **الـرتبة:** \`Rank ${rank}\`

### 🛠️ المـهام الحالية:
${list}

### 📊 الإنـجاز الـعام:
> \`${bar}\` **${percent}%**
> تم إتمام **${doneTasks.length}** من أصل **${totalTasks.length}** مهام
---
*آخر تحديث: <t:${Math.floor(Date.now() / 1000)}:R>*`;
}

// 2. دعوة الترقية الشخصية (Personal Invite)
function buildPersonalInvite(userId) {
  return `
## 🎖️ تهانينا .. أنت جاهز للترقية!
لقد استوفيت كافة الشروط والمتطلبات بنجاح.

> 📅 **الموعد القادم:** يوم **${getNextUpgradeDay()}**
> ⏰ **الوقت:** من الساعة **10:00 م** حتى **12:00 ص**
> 📍 **الموقع:** ديسكورد (صوتيات الإدارة)

*يرجى التواجد قبل الموعد بـ 5 دقائق.*
<@${userId}>`;
}

// 3. رسالة الترقية (Rank Room)
function buildReadyToUpgradeMessage(userId, rank) {
  return `
# 🎊 جـاهز للترقية رسمياً
**الموظف المتميز:** <@${userId}>
**الرتبة المستهدفة:** \`Rank ${rank}\`

🔗 https://cdn.discordapp.com/attachments/1449506416065908816/1454546137439801354/1571650a7c706000-1.gif`;
}

/* ================== BOT CORE ================== */
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Message, Partials.Channel]
});

const app = express();
app.get("/", (req, res) => res.send("Active"));
app.listen(process.env.PORT || 3000);

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  const isTaskRoom = TASKS_RANK_2[message.channelId] || TASKS_RANK_3[message.channelId];
  if (!isTaskRoom) return;

  const progress = loadProgress();
  if (progress[message.author.id] && progress[message.author.id].completedRooms.includes(message.channelId)) {
    const warn = await message.reply(`❌ **عذراً، هذه المهمة مسجلة مسبقاً.**`);
    setTimeout(() => { message.delete().catch(() => {}); warn.delete().catch(() => {}); }, 3000);
    return;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approve_task').setLabel('اعتماد').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('missing_photo').setLabel('نقص صور').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('reject_task').setLabel('رفض').setStyle(ButtonStyle.Danger)
  );

  await message.reply({ content: `💠 **لوحة تحكم المهمة لـ <@${message.author.id}>**`, components: [row] });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.roles.cache.has(ADMIN_ROLE_ID)) return interaction.reply({ content: "صلاحيات إدارية فقط.", ephemeral: true });

  const originalMessage = await interaction.channel.messages.fetch(interaction.message.reference.messageId).catch(() => null);
  if (!originalMessage) return;

  const traineeId = originalMessage.author.id;
  const roomId = interaction.channelId;

  if (interaction.customId === 'approve_task') {
    let rank = TASKS_RANK_2[roomId] ? 2 : 3;
    const progress = loadProgress();
    if (!progress[traineeId]) progress[traineeId] = { rank, tasks: [], completedRooms: [], followMessageId: null, upgradeNotified: false };
    
    const data = progress[traineeId];
    if (data.completedRooms.includes(roomId)) return;

    data.completedRooms.push(roomId);
    data.tasks.push(TASKS_RANK_2[roomId] || TASKS_RANK_3[roomId]);

    const allTasks = Object.values(rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3);
    const followChannel = await client.channels.fetch(FOLLOW_ROOM_ID);
    const followContent = buildFollowMessage(traineeId, rank, data.tasks, allTasks);

    if (data.followMessageId) {
      const msg = await followChannel.messages.fetch(data.followMessageId).catch(() => null);
      if (msg) await msg.edit({ content: followContent });
    } else {
      const msg = await followChannel.send({ content: followContent });
      data.followMessageId = msg.id;
    }

    if (data.tasks.length === allTasks.length && !data.upgradeNotified) {
      data.upgradeNotified = true;
      const rRoom = await client.channels.fetch(rank === 2 ? READY_RANK_2_ROOM_ID : READY_RANK_3_ROOM_ID).catch(() => null);
      if (rRoom) await rRoom.send(buildReadyToUpgradeMessage(traineeId, rank));
      const nRoom = await client.channels.fetch(NOTIFICATION_ROOM_ID).catch(() => null);
      if (nRoom) await nRoom.send(buildPersonalInvite(traineeId));
      const cRoom = await client.channels.fetch(READY_COMBINED_ROOM_ID).catch(() => null);
      if (cRoom) await cRoom.send(`**\n- إسم المتدرب : <@${traineeId}>\n- الرتبة الحالية : ${rank}\n\n- جاهز للترقية : ✅\n**`);
    }

    saveProgress(progress);
    await originalMessage.reactions.removeAll().catch(() => {});
    await originalMessage.react("✅");
    await interaction.update({ content: "✨ **تم الاعتماد بنجاح.**", components: [] });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 1500);
  } else {
    const emoji = interaction.customId === 'missing_photo' ? "📷" : "❌";
    await originalMessage.reactions.removeAll().catch(() => {});
    await originalMessage.react(emoji);
    await interaction.update({ content: `✅ **تم وضع ريأكشن (${emoji})**`, components: [] });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 1500);
  }
});

client.login(process.env.TOKEN);
