import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
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

/* ================== الإعدادات (تأكد من صحة الـ IDs) ================== */
const ADMIN_ROLE_ID = "1459164560480145576";
const FOLLOW_ROOM_ID = "1459162738503847969";
const STATS_ROOM_ID = "1459162751288217869"; 
const TOP_WEEK_ROOM_ID = "1460017456662712637"; // يمكنك وضع ID روم مختلف هنا لتوب الأسبوع

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

const MANUAL_STATS_CHANNELS = {
  "1459162757135073323": "عدد الكورسات",
  "1459162754173894801": "عدد الفعاليات"
};

const AUTO_STATS_CHANNELS = {
  "1459162779419414627": "تعاون قسم المقابلات",
  "1459162782397104243": "تعاون قسم المخالفات",
  "1459162785018675304": "تعاون قسم الفعاليات",
  "1459162788151951522": "تعاون قسم الارشاد",
  "1459162790798295067": "تعاون قسم الاعلام",
  "1459162794434891818": "تعاون قسم (Cpr)"
};

/* ================== نظام إدارة الملفات (المحسن) ================== */

let isWriting = false;
const queue = [];

async function processQueue() {
  if (isWriting || queue.length === 0) return;
  isWriting = true;
  const task = queue.shift();
  try {
    await task();
  } catch (err) {
    console.error("Queue Task Error:", err);
  } finally {
    isWriting = false;
    processQueue();
  }
}

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function safeIncrement(channelId) {
  return new Promise((resolve) => {
    queue.push(async () => {
      const data = loadProgress();
      if (!data.stats) data.stats = {};
      data.stats[channelId] = (data.stats[channelId] || 0) + 1;
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      resolve(data.stats);
    });
    processQueue();
  });
}

async function safeSaveUserProgress(traineeId, updateFn) {
  return new Promise((resolve) => {
    queue.push(async () => {
      const data = loadProgress();
      if (!data[traineeId]) data[traineeId] = {};
      await updateFn(data[traineeId]);
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      resolve(data);
    });
    processQueue();
  });
}

/* ================== دوال المساعدة للرسائل واللوحات ================== */

function buildFollowMessage(userId, rank, doneTasks, totalTasks) {
  const percent = Math.round((doneTasks.length / totalTasks.length) * 100);
  const progressBar = "🔹".repeat(Math.round(percent/10)) + "🔸".repeat(10 - Math.round(percent/10));
  const list = totalTasks.map(t => doneTasks.includes(t) ? `┃ ✅ **${t}**` : `┃ 🔘 *${t}*`).join("\n");
  return `### 📑 مـلف تـدريب المـوظفين (Rank ${rank})\n┏━━━━━━━━━━━━━━━━━━┓\n  👤 **المتدرب:** <@${userId}>\n  🎖️ **الرتبة المستهدفة:** \`Rank ${rank}\`\n┗━━━━━━━━━━━━━━━━━━┛\n\n✨ **المهام المنجزة:**\n${list}\n\n📊 **التقدم:**\n┃ ${progressBar} **${percent}%**\n┃ (\`${doneTasks.length}/${totalTasks.length}\`) من المتطلبات.`;
}

function buildReadyToUpgradeMessage(userId, rank) {
  return `🎊 **تـهـنـئـة إتـمـام مـهـام** 🎊\n━━━━━━━━━━━━━━━━━━━━\n👤 **المتدرب:** <@${userId}>\n🏅 **الرتبة المنجزة:** \`Rank ${rank}\`\n✅ **الحالة:** جاهز للترقية رسمياً\n\n🔗 https://cdn.discordapp.com/attachments/1449506416065908816/1454546137439801354/1571650a7c706000-1.gif\n━━━━━━━━━━━━━━━━━━━━`;
}

async function updateStatsEmbed(client, statsData) {
  const statsChannel = await client.channels.fetch(STATS_ROOM_ID).catch(() => null);
  if (!statsChannel || !statsData) return;

  const embed = new EmbedBuilder()
    .setTitle("📈 لوحة مراقبة الأداء العام")
    .setColor(0x00ffcc)
    .addFields(
      { name: "📋 التقارير المعتمدة", value: Object.entries(MANUAL_STATS_CHANNELS).map(([id, name]) => `**${name}:** \`${statsData[id] || 0}\``).join("\n") || "لا توجد بيانات", inline: false },
      { name: "🤝 إحصائيات التعاون", value: Object.entries(AUTO_STATS_CHANNELS).map(([id, name]) => `**${name}:** \`${statsData[id] || 0}\``).join("\n") || "لا توجد بيانات", inline: false }
    )
    .setTimestamp();

  const messages = await statsChannel.messages.fetch({ limit: 15 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title === "📈 لوحة مراقبة الأداء العام");
  if (botMsg) await botMsg.edit({ embeds: [embed] });
  else await statsChannel.send({ embeds: [embed] });
}

async function updateTopWeekEmbed(client) {
  const topChannel = await client.channels.fetch(TOP_WEEK_ROOM_ID).catch(() => null);
  if (!topChannel) return;

  const data = loadProgress();
  const leaderboard = [];

  for (const [userId, userData] of Object.entries(data)) {
    if (userId === 'stats') continue;
    const points = (userData.manualPoints || 0);
    if (points > 0) leaderboard.push({ userId, points });
  }

  leaderboard.sort((a, b) => b.points - a.points);

  const embed = new EmbedBuilder()
    .setTitle("👑 لوحة توب الأسبوع - نجوم القسم")
    .setColor(0xFFD700)
    .setTimestamp();

  if (leaderboard.length === 0) {
    embed.setDescription("ℹ️ لا توجد بيانات مسجلة لهذا الأسبوع حتى الآن.");
  } else {
    let listContent = "";
    leaderboard.forEach((entry, index) => {
      const rankIcon = index === 0 ? "🏆" : (index === 1 ? "🥈" : (index === 2 ? "🥉" : "🔹"));
      const starPrefix = index === 0 ? "**[نجم الأسبوع المحتمل]**" : "";
      listContent += `${rankIcon} ${starPrefix} <@${entry.userId}> — النقاط: \`${entry.points}\`\n`;
    });
    embed.setDescription(listContent);
  }

  const messages = await topChannel.messages.fetch({ limit: 15 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title === "👑 لوحة توب الأسبوع - نجوم القسم");
  
  if (botMsg) await botMsg.edit({ embeds: [embed] });
  else await topChannel.send({ embeds: [embed] });
}

/* ================== الأحداث ================== */
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Message, Partials.Channel]
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot && !AUTO_STATS_CHANNELS[message.channelId]) return;

  // إحصائيات الأقسام (تلقائي)
  if (AUTO_STATS_CHANNELS[message.channelId]) {
    const updatedStats = await safeIncrement(message.channelId);
    await updateStatsEmbed(client, updatedStats);
    return;
  }

  if (message.author.bot) return;

  // أمر تصفير النقاط للإدارة
  if (message.content === "!reset" && message.member.roles.cache.has(ADMIN_ROLE_ID)) {
    const data = loadProgress();
    for (const key in data) {
      if (data[key].manualPoints) data[key].manualPoints = 0;
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    await updateTopWeekEmbed(client);
    return message.reply("✅ تم تصفير نقاط توب الأسبوع بنجاح.");
  }

  const rank = TASKS_RANK_2[message.channelId] ? 2 : (TASKS_RANK_3[message.channelId] ? 3 : null);
  const isManual = MANUAL_STATS_CHANNELS[message.channelId];
  if (!rank && !isManual) return;

  // منع التكرار في رومات الرتب
  if (rank) {
    const progress = loadProgress();
    const userRankData = progress[message.author.id]?.[`rank${rank}`];
    if (userRankData?.completedRooms.includes(message.channelId)) {
      const warning = await message.reply(`⛔ لقد أنهيت هذه المهمة مسبقاً.`);
      setTimeout(() => { message.delete().catch(() => {}); warning.delete().catch(() => {}); }, 3000);
      return;
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approve_task').setLabel('قبول ✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('missing_photo').setLabel('نقص 📷').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('reject_task').setLabel('رفض ❌').setStyle(ButtonStyle.Danger)
  );

  await message.reply({ content: `⚙️ **إدارة لـ <@${message.author.id}>:**`, components: [row] });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.roles.cache.has(ADMIN_ROLE_ID)) return interaction.reply({ content: "صلاحيات إدارية فقط.", ephemeral: true });

  const originalMessage = await interaction.channel.messages.fetch(interaction.message.reference.messageId).catch(() => null);
  if (!originalMessage) return interaction.reply({ content: "خطأ في الرسالة الأصلية.", ephemeral: true });

  const traineeId = originalMessage.author.id;
  const roomId = interaction.channelId;

  if (interaction.customId === 'approve_task') {
    // 1. تحديث إحصائيات الكورسات/الفعاليات ونقاط التوب
    if (MANUAL_STATS_CHANNELS[roomId]) {
      const updatedStats = await safeIncrement(roomId);
      await updateStatsEmbed(client, updatedStats);
      
      await safeSaveUserProgress(traineeId, async (userData) => {
        userData.manualPoints = (userData.manualPoints || 0) + 1;
      });
      await updateTopWeekEmbed(client);
    }

    // 2. تحديث ملفات تدريب الرتب
    await safeSaveUserProgress(traineeId, async (userData) => {
      const rank = TASKS_RANK_2[roomId] ? 2 : (TASKS_RANK_3[roomId] ? 3 : null);
      if (!rank) return;

      const rankKey = `rank${rank}`;
      if (!userData[rankKey]) userData[rankKey] = { tasks: [], completedRooms: [], followMessageId: null, upgradeNotified: false };
      
      const data = userData[rankKey];
      if (!data.completedRooms.includes(roomId)) {
        data.completedRooms.push(roomId);
        data.tasks.push(rank === 2 ? TASKS_RANK_2[roomId] : TASKS_RANK_3[roomId]);

        const allTasks = Object.values(rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3);
        const followChannel = await client.channels.fetch(FOLLOW_ROOM_ID).catch(() => null);
        
        if (followChannel) {
          const content = buildFollowMessage(traineeId, rank, data.tasks, allTasks);
          let existingMsg = null;
          if (data.followMessageId) {
            existingMsg = await followChannel.messages.fetch(data.followMessageId).catch(() => null);
          }
          if (existingMsg) await existingMsg.edit({ content });
          else {
            const newMsg = await followChannel.send({ content });
            data.followMessageId = newMsg.id;
          }
        }

        if (data.tasks.length === allTasks.length && !data.upgradeNotified) {
          data.upgradeNotified = true;
          const rRoom = await client.channels.fetch(rank === 2 ? READY_RANK_2_ROOM_ID : READY_RANK_3_ROOM_ID).catch(() => null);
          if (rRoom) await rRoom.send(buildReadyToUpgradeMessage(traineeId, rank));
          
          const cRoom = await client.channels.fetch(READY_COMBINED_ROOM_ID).catch(() => null);
          if (cRoom) await cRoom.send(`> 💠 **إشعار ترقية**\n> 👤 **المتدرب:** <@${traineeId}>\n> 🎖️ **الرتبة:** \`Rank ${rank}\`\n> ✨ **الحالة:** جاهز ✅`);
        }
      }
    });

    await originalMessage.react("✅");
    await interaction.update({ content: "⭐ تم الاعتماد وتحديث التوب.", components: [] });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
  } else {
    await originalMessage.react(interaction.customId === 'missing_photo' ? "📷" : "❌");
    await interaction.update({ content: "⚠️ تم التحديث بنجاح.", components: [] });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
  }
});

const app = express();
app.get("/", (req, res) => res.send("Bot Online ✅"));
app.listen(process.env.PORT || 3000);
client.login(process.env.TOKEN);
