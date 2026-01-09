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

// إنشاء مجلد البيانات والملف إذا لم يوجدا
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "{}");

/* ================== الإعدادات ================== */
const ADMIN_ROLE_ID = "1459164560480145576";
const FOLLOW_ROOM_ID = "1459162738503847969";
const NOTIFICATION_ROOM_ID = "1459162853696077982";

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

/* ================== دوال المساعدة ================== */

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch (err) { return {}; }
}

function saveProgress(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
  catch (err) { console.error("Error saving data:", err); }
}

function getNextUpgradeDay() {
  const daysMap = { 0: "الأحد", 1: "الاثنين", 2: "الثلاثاء", 3: "الأربعاء", 4: "الخميس", 5: "الجمعة", 6: "السبت" };
  const upgradeDays = [6, 2, 4]; 
  const now = new Date();
  const today = now.getDay();
  let nextDay = upgradeDays.find(d => d >= today);
  if (nextDay === undefined) nextDay = upgradeDays[0];
  return daysMap[nextDay];
}

/* ================== نماذج الرسائل ================== */

function buildFollowMessage(userId, rank, doneTasks, totalTasks) {
  const percent = Math.round((doneTasks.length / totalTasks.length) * 100);
  const progressBar = "🔹".repeat(Math.round(percent/10)) + "🔸".repeat(10 - Math.round(percent/10));
  const list = totalTasks.map(t => doneTasks.includes(t) ? `┃ ✅ **${t}**` : `┃ 🔘 *${t}*`).join("\n");

  return `### 📑 مـلف تـدريب المـوظفين\n┏━━━━━━━━━━━━━━━━━━┓\n  👤 **المتدرب:** <@${userId}>\n  🎖️ **الرتبة المستهدفة:** \`Rank ${rank}\`\n┗━━━━━━━━━━━━━━━━━━┛\n\n✨ **المهام المنجزة:**\n${list}\n\n📊 **التقدم:**\n┃ ${progressBar} **${percent}%**\n┃ (\`${doneTasks.length}/${totalTasks.length}\`) من المتطلبات.`;
}

function buildPersonalNotification(userId) {
  const day = getNextUpgradeDay();
  return `### 🔔 إشعار إتمام مرحلة التدريب\n━━━━━━━━━━━━━━━━━━━━\nمرحباً بك <@${userId}>،\n\nلقد أتممت جميع المهام المطلوبة بنجاح وأصبحت الآن **جاهزاً للترقية**.\nالمواعيد الرسمية للترقيات هي:\n🗓️ **السبت - الثلاثاء - الخميس**\n\n⚠️ أقرب موعد لك هو يوم **( ${day} )**\n⏰ من الساعة **10:00 مساءً** إلى **12:00 منتصف الليل**\n📍 بتوقيت مكة المكرمة.\n━━━━━━━━━━━━━━━━━━━━`;
}

function buildReadyToUpgradeMessage(userId, rank) {
  return `🎊 **تـهـنـئـة إتـمـام مـهـام** 🎊\n━━━━━━━━━━━━━━━━━━━━\n👤 **المتدرب:** <@${userId}>\n🏅 **الرتبة المنجزة:** \`Rank ${rank}\`\n✅ **الحالة:** جاهز للترقية رسمياً\n\n🔗 https://cdn.discordapp.com/attachments/1449506416065908816/1454546137439801354/1571650a7c706000-1.gif\n━━━━━━━━━━━━━━━━━━━━`;
}

/* ================== تشغيل الخادم وتجاوز خطأ Railway ================== */

const app = express();
app.get("/", (req, res) => res.send("Bot is Online ✅"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Railway port binding on ${PORT}`));

/* ================== أحداث البوت ================== */

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Message, Partials.Channel]
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  const isTaskRoom = TASKS_RANK_2[message.channelId] || TASKS_RANK_3[message.channelId];
  if (!isTaskRoom) return;

  const progress = loadProgress();
  if (progress[message.author.id] && progress[message.author.id].completedRooms.includes(message.channelId)) {
    try {
      const warning = await message.reply(`⛔ لقد أنهيت هذه المهمة مسبقاً.`);
      setTimeout(() => { message.delete().catch(() => {}); warning.delete().catch(() => {}); }, 3000);
    } catch (e) {}
    return;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approve_task').setLabel('قبول ✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('missing_photo').setLabel('نقص 📷').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('reject_task').setLabel('رفض ❌').setStyle(ButtonStyle.Danger)
  );

  await message.reply({ content: `⚙️ **إدارة المهمة لـ <@${message.author.id}>:**`, components: [row] });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.roles.cache.has(ADMIN_ROLE_ID)) return interaction.reply({ content: "صلاحيات إدارية فقط.", ephemeral: true });

  const originalMessage = await interaction.channel.messages.fetch(interaction.message.reference.messageId).catch(() => null);
  if (!originalMessage) return interaction.reply({ content: "تعذر العثور على الرسالة الأصلية.", ephemeral: true });

  const traineeId = originalMessage.author.id;
  const roomId = interaction.channelId;

  if (interaction.customId === 'approve_task') {
    let rank = TASKS_RANK_2[roomId] ? 2 : 3;
    const progress = loadProgress();
    if (!progress[traineeId]) progress[traineeId] = { rank, tasks: [], completedRooms: [], followMessageId: null, upgradeNotified: false };
    
    const data = progress[traineeId];
    if (data.completedRooms.includes(roomId)) return interaction.reply({ content: "مسجل مسبقاً.", ephemeral: true });

    data.completedRooms.push(roomId);
    data.tasks.push(TASKS_RANK_2[roomId] || TASKS_RANK_3[roomId]);

    const allTasks = Object.values(rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3);
    const followChannel = await client.channels.fetch(FOLLOW_ROOM_ID).catch(() => null);

    if (followChannel) {
        try {
            if (data.followMessageId) {
                const oldMsg = await followChannel.messages.fetch(data.followMessageId).catch(() => null);
                if (oldMsg) await oldMsg.edit({ content: buildFollowMessage(traineeId, rank, data.tasks, allTasks) });
                else {
                    const newMsg = await followChannel.send({ content: buildFollowMessage(traineeId, rank, data.tasks, allTasks) });
                    data.followMessageId = newMsg.id;
                }
            } else {
                const newMsg = await followChannel.send({ content: buildFollowMessage(traineeId, rank, data.tasks, allTasks) });
                data.followMessageId = newMsg.id;
            }
        } catch (e) { console.error("Follow message error:", e); }
    }

    if (data.tasks.length === allTasks.length && !data.upgradeNotified) {
      data.upgradeNotified = true;
      const rRoom = await client.channels.fetch(rank === 2 ? READY_RANK_2_ROOM_ID : READY_RANK_3_ROOM_ID).catch(() => null);
      if (rRoom) await rRoom.send(buildReadyToUpgradeMessage(traineeId, rank));
      const nRoom = await client.channels.fetch(NOTIFICATION_ROOM_ID).catch(() => null);
      if (nRoom) await nRoom.send(buildPersonalNotification(traineeId));
      const cRoom = await client.channels.fetch(READY_COMBINED_ROOM_ID).catch(() => null);
      if (cRoom) await cRoom.send(`> 💠 **إشعار ترقية**\n> 👤 **الاسم:** <@${traineeId}>\n> 🎖️ **الرتبة:** \`${rank}\`\n> ✨ **جاهز للترقية :** ✅`);
    }

    saveProgress(progress);
    await originalMessage.reactions.removeAll().catch(() => {});
    await originalMessage.react("✅");
    await interaction.update({ content: "⭐ تم الاعتماد.", components: [] });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);

  } else {
    const emoji = interaction.customId === 'missing_photo' ? "📷" : "❌";
    await originalMessage.reactions.removeAll().catch(() => {});
    await originalMessage.react(emoji);
    await interaction.update({ content: "⚠️ تم تحديث الحالة.", components: [] });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
  }
});

client.login(process.env.TOKEN);
