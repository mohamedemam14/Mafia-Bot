import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
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

/* ================== الإعدادات ================== */
const ADMIN_ROLE_ID = "1459164560480145576";
const FOLLOW_ROOM_ID = "1459162738503847969";
const STATS_ROOM_ID = "1459162751288217869"; 
const TOP_WEEK_ROOM_ID = "1460017456662712637";

const READY_RANK_2_ROOM_ID = "1459162819072102574";
const READY_RANK_3_ROOM_ID = "1459162843327758525";
const READY_COMBINED_ROOM_ID = "1459162779419414627"; 

const COURSES_CHANNEL_ID = "1459162757135073323";
const EVENTS_CHANNEL_ID = "1459162754173894801";

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
  [COURSES_CHANNEL_ID]: "📚 عدد الكورسات",
  [EVENTS_CHANNEL_ID]: "🎉 عدد الفعاليات"
};

/* ================== تعريف البوت ================== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers 
  ],
  partials: [Partials.Message, Partials.Channel]
});

/* ================== نظام إدارة الملفات ================== */
let isWriting = false;
const queue = [];

async function processQueue() {
  if (isWriting || queue.length === 0) return;
  isWriting = true;
  const task = queue.shift();
  try { await task(); } catch (err) { console.error(err); } finally { isWriting = false; processQueue(); }
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { return {}; }
}

async function safeIncrement(channelId, amount = 1) {
  return new Promise((resolve) => {
    queue.push(async () => {
      const data = loadProgress();
      if (!data.stats) data.stats = {};
      data.stats[channelId] = (data.stats[channelId] || 0) + amount;
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
      if (!data[traineeId]) {
        data[traineeId] = { courses: 0, events: 0, manualPoints: 0 };
      }
      await updateFn(data[traineeId]);
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      resolve(data);
    });
    processQueue();
  });
}

/* ================== دوال المساعدة ================== */

async function updateStatsEmbed(client, statsData) {
  const statsChannel = await client.channels.fetch(STATS_ROOM_ID).catch(() => null);
  if (!statsChannel || !statsData) return;

  const totalReports = Object.keys(MANUAL_STATS_CHANNELS).reduce((acc, id) => acc + (statsData[id] || 0), 0);
  const newMembersCount = statsData.newMembersCount || 0;

  const embed = new EmbedBuilder()
    .setTitle("📊 مركز إحصائيات الأداء العام")
    .setDescription("يتم تحديث هذه البيانات تلقائياً بناءً على تقارير الأقسام وحركة الأعضاء.")
    .setColor(0x2b2d31)
    .setThumbnail(client.user.displayAvatarURL())
    .addFields(
      { 
        name: "📂 التقارير الميدانية", 
        value: `> ${Object.entries(MANUAL_STATS_CHANNELS)
          .map(([id, name]) => `**${name}:** \`${statsData[id] || 0}\``)
          .join("\n> ")}`, 
        inline: true 
      },
      {
        name: "📈 إجمالي العمليات",
        value: `> **المجموع الكلي:** \`${totalReports}\``,
        inline: true
      },
      {
        name: "🎖️ شؤون الموظفين",
        value: `> **👶 المتدربين الجدد:** \`${newMembersCount}\`\n> **✅ جاهزين للترقية:** \`${statsData[READY_COMBINED_ROOM_ID] || 0}\``,
        inline: false
      }
    )
    .setFooter({ text: "نظام إدارة الإحصائيات التلقائي", iconURL: client.user.displayAvatarURL() })
    .setTimestamp();

  const messages = await statsChannel.messages.fetch({ limit: 10 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title === "📊 مركز إحصائيات الأداء العام");
  
  if (botMsg) await botMsg.edit({ embeds: [embed] });
  else await statsChannel.send({ embeds: [embed] });
}

function buildFollowMessage(userId, rank, doneTasks, totalTasks) {
  const percent = Math.round((doneTasks.length / totalTasks.length) * 100);
  const progressBar = "🔹".repeat(Math.round(percent/10)) + "🔸".repeat(10 - Math.round(percent/10));
  const list = totalTasks.map(t => doneTasks.includes(t) ? `┃ ✅ **${t}**` : `┃ 🔘 *${t}*`).join("\n");
  const lineGif = "https://cdn.discordapp.com/attachments/1425444776240611420/1460346562340323505/1571650a7c706000-1.gif";

  return `### 📑 مـلف تـدريب المـوظفين (Rank ${rank})\n┏━━━━━━━━━━━━━━━━━━┓\n  👤 **المتدرب:** <@${userId}>\n  🎖️ **الرتبة:** \`Rank ${rank}\`\n┗━━━━━━━━━━━━━━━━━━┛\n\n✨ **المهام المنجزة:**\n${list}\n\n📊 **التقدم الإجمالي:**\n┃ ${progressBar} **${percent}%**\n┃ (\`${doneTasks.length}/${totalTasks.length}\`)\n${lineGif}`;
}

function getStars(total) {
  if (total >= 20) return "⭐⭐⭐⭐⭐⭐⭐+";
  if (total >= 15) return "⭐⭐⭐⭐⭐⭐⭐";
  if (total >= 10) return "⭐⭐⭐⭐⭐";
  if (total >= 5)  return "⭐⭐⭐";
  if (total >= 2)  return "⭐⭐";
  return "🌑";
}

async function updateTopWeekEmbed(client) {
  const topChannel = await client.channels.fetch(TOP_WEEK_ROOM_ID).catch(() => null);
  if (!topChannel) return;

  const data = loadProgress();
  const guild = topChannel.guild;

  const leaderboard = Object.entries(data)
    .filter(([id, val]) => id !== 'stats' && (val.manualPoints || 0) > 0)
    .sort((a, b) => (b[1].manualPoints || 0) - (a[1].manualPoints || 0));

  const embed = new EmbedBuilder()
    .setTitle("🏆 قائمة فرسان الأسبوع المتميزين")
    .setDescription("يتم تحديث الترتيب بناءً على مجموع الكورسات والفعاليات المعتمدة.")
    .setColor(0xFFAA00)
    .setFooter({ text: "نظام التقييم الأسبوعي • تحديث تلقائي", iconURL: client.user.displayAvatarURL() })
    .setTimestamp();

  if (leaderboard.length === 0) {
    embed.setDescription("⚠️ لا توجد نقاط مسجلة حالياً في هذه الفترة.");
  } else {
    const lines = await Promise.all(leaderboard.slice(0, 15).map(async ([userId, val], i) => {
      const member = await guild.members.fetch(userId).catch(() => null);
      const name = member ? member.displayName : "مستخدم غير معروف";
      const rankIcon = i === 0 ? "🥇" : (i === 1 ? "🥈" : (i === 2 ? "🥉" : "🔹"));
      
      const courses = val.courses || 0;
      const events = val.events || 0;
      const total = val.manualPoints || 0;
      const stars = getStars(total);

      return `${rankIcon} **${name}**\n> 📚 الكورسات: \`${courses}\` | 🎉 الفعاليات: \`${events}\`\n> 💎 المجموع: **${total}** | التقييم: ${stars}\n──────────────────`;
    }));
    
    embed.setDescription(lines.join("\n"));
  }

  const messages = await topChannel.messages.fetch({ limit: 10 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title === "🏆 قائمة فرسان الأسبوع المتميزين");
  if (botMsg) await botMsg.edit({ embeds: [embed] });
  else await topChannel.send({ embeds: [embed] });
}

/* ================== الأحداث ================== */

client.on(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on(Events.GuildMemberAdd, async (member) => {
  queue.push(async () => {
    const data = loadProgress();
    if (!data.stats) data.stats = {};
    data.stats.newMembersCount = (data.stats.newMembersCount || 0) + 1;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    await updateStatsEmbed(client, data.stats);
  });
  processQueue();
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) {
    if (message.channelId === READY_COMBINED_ROOM_ID) {
      const stats = await safeIncrement(READY_COMBINED_ROOM_ID);
      await updateStatsEmbed(client, stats);
    }
    return;
  }

  // أوامر الإدارة - إضافة كورسات وفعاليات
  if (message.member.roles.cache.has(ADMIN_ROLE_ID)) {
    const args = message.content.split(" ");
    const command = args[0].toLowerCase();

    if (command === "!addcourse" || command === "!addevent") {
      const targetMember = message.mentions.members.first();
      const amount = parseInt(args[2]) || 1;

      if (!targetMember) return message.reply("❌ يرجى منشن العضو. مثال: `!addcourse @user 5` ");

      await safeSaveUserProgress(targetMember.id, async (userData) => {
        if (command === "!addcourse") userData.courses = (userData.courses || 0) + amount;
        else userData.events = (userData.events || 0) + amount;
        
        userData.manualPoints = (userData.manualPoints || 0) + amount;
      });

      const targetRoom = command === "!addcourse" ? COURSES_CHANNEL_ID : EVENTS_CHANNEL_ID;
      const stats = await safeIncrement(targetRoom, amount);
      await updateStatsEmbed(client, stats);
      await updateTopWeekEmbed(client);

      return message.reply(`✅ تم إضافة **${amount}** ${command === "!addcourse" ? "كورس" : "فعالية"} لـ <@${targetMember.id}> بنجاح.`);
    }

    // تصفير البيانات
    if (message.content === "!reset") {
      queue.push(async () => {
        const data = loadProgress();
        for (const key in data) {
          if (key !== 'stats') {
            data[key].manualPoints = 0;
            data[key].courses = 0;
            data[key].events = 0;
          }
        }
        data.stats = { newMembersCount: 0, [READY_COMBINED_ROOM_ID]: 0, [COURSES_CHANNEL_ID]: 0, [EVENTS_CHANNEL_ID]: 0 };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        await updateTopWeekEmbed(client);
        await updateStatsEmbed(client, data.stats);
        await message.reply("✅ تم تصفير كافة الإحصائيات والنقاط بنجاح.");
      });
      processQueue();
      return;
    }

    // إنهاء مهام الرتب
    if (message.content.startsWith("!finish2") || message.content.startsWith("!finish3")) {
      const targetMember = message.mentions.members.first();
      if (!targetMember) return message.reply("❌ يرجى منشن العضو.");
      
      const rank = message.content.startsWith("!finish2") ? 2 : 3;
      const tasksConfig = rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3;
      const readyChannelId = rank === 2 ? READY_RANK_2_ROOM_ID : READY_RANK_3_ROOM_ID;

      await safeSaveUserProgress(targetMember.id, async (userData) => {
        const rankKey = `rank${rank}`;
        userData[rankKey] = {
          tasks: Object.values(tasksConfig),
          completedRooms: Object.keys(tasksConfig),
          followMessageId: userData[rankKey]?.followMessageId || null,
          upgradeNotified: true
        };

        const followChannel = await client.channels.fetch(FOLLOW_ROOM_ID).catch(() => null);
        if (followChannel) {
          const content = buildFollowMessage(targetMember.id, rank, userData[rankKey].tasks, Object.values(tasksConfig));
          if (userData[rankKey].followMessageId) {
            const m = await followChannel.messages.fetch(userData[rankKey].followMessageId).catch(() => null);
            if (m) await m.edit({ content });
          } else {
            const nm = await followChannel.send({ content });
            userData[rankKey].followMessageId = nm.id;
          }
        }

        const rRoom = await client.channels.fetch(readyChannelId).catch(() => null);
        if (rRoom) await rRoom.send(`🎊 **تهنئة إتمام مهام (إداري)**\n<@${targetMember.id}> جاهز لترقية Rank ${rank}`);
        
        const cRoom = await client.channels.fetch(READY_COMBINED_ROOM_ID).catch(() => null);
        if (cRoom) await cRoom.send(`> 💠 **إشعار ترقية**\n> 👤 **المتدرب:** <@${targetMember.id}>\n> 🎖️ **الرتبة:** \`Rank ${rank}\`\n> ✨ **الحالة:** جاهز (إداري) ✅`);
      });
      return message.reply(`✅ تم إكمال مهام Rank ${rank} لـ <@${targetMember.id}>.`);
    }
  }

  // معالجة التقارير التلقائية
  const rank = TASKS_RANK_2[message.channelId] ? 2 : (TASKS_RANK_3[message.channelId] ? 3 : null);
  const isManual = MANUAL_STATS_CHANNELS[message.channelId];
  if (!rank && !isManual) return;

  if (rank) {
    const progress = loadProgress();
    if (progress[message.author.id]?.[`rank${rank}`]?.completedRooms?.includes(message.channelId)) {
      return message.delete().catch(() => {});
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approve_task').setLabel('قبول ✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('missing_photo').setLabel('نقص 📷').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('reject_task').setLabel('رفض ❌').setStyle(ButtonStyle.Danger)
  );

  await message.reply({ content: `🛠️ **تحكم الإدارة لتقرير:** <@${message.author.id}>`, components: [row] });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member || !member.roles.cache.has(ADMIN_ROLE_ID)) {
      return interaction.reply({ content: "صلاحيات إدارية فقط.", ephemeral: true });
    }

    const originalMessage = await interaction.channel.messages.fetch(interaction.message.reference.messageId).catch(() => null);
    if (!originalMessage) return interaction.reply({ content: "الرسالة الأصلية مفقودة.", ephemeral: true });

    const traineeId = originalMessage.author.id;
    const roomId = interaction.channelId;

    if (interaction.customId === 'approve_task') {
      if (MANUAL_STATS_CHANNELS[roomId]) {
        const stats = await safeIncrement(roomId);
        await updateStatsEmbed(client, stats);
        await safeSaveUserProgress(traineeId, async (u) => { 
          u.manualPoints = (u.manualPoints || 0) + 1;
          if (roomId === COURSES_CHANNEL_ID) u.courses = (u.courses || 0) + 1;
          if (roomId === EVENTS_CHANNEL_ID) u.events = (u.events || 0) + 1;
        });
        await updateTopWeekEmbed(client);
      }

      await safeSaveUserProgress(traineeId, async (userData) => {
        const rank = TASKS_RANK_2[roomId] ? 2 : (TASKS_RANK_3[roomId] ? 3 : null);
        if (!rank) return;
        const rankKey = `rank${rank}`;
        if (!userData[rankKey]) userData[rankKey] = { tasks: [], completedRooms: [], followMessageId: null, upgradeNotified: false };
        if (!userData[rankKey].completedRooms.includes(roomId)) {
          userData[rankKey].completedRooms.push(roomId);
          userData[rankKey].tasks.push(rank === 2 ? TASKS_RANK_2[roomId] : TASKS_RANK_3[roomId]);
          const followChannel = await client.channels.fetch(FOLLOW_ROOM_ID).catch(() => null);
          if (followChannel) {
            const content = buildFollowMessage(traineeId, rank, userData[rankKey].tasks, Object.values(rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3));
            if (userData[rankKey].followMessageId) {
              const m = await followChannel.messages.fetch(userData[rankKey].followMessageId).catch(() => null);
              if (m) await m.edit({ content });
            } else {
              const nm = await followChannel.send({ content });
              userData[rankKey].followMessageId = nm.id;
            }
          }
          if (userData[rankKey].tasks.length === Object.keys(rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3).length && !userData[rankKey].upgradeNotified) {
            userData[rankKey].upgradeNotified = true;
            const rRoom = await client.channels.fetch(rank === 2 ? READY_RANK_2_ROOM_ID : READY_RANK_3_ROOM_ID).catch(() => null);
            if (rRoom) await rRoom.send(`🎊 **تهنئة إتمام مهام**\n<@${traineeId}> جاهز لترقية Rank ${rank}`);
            const cRoom = await client.channels.fetch(READY_COMBINED_ROOM_ID).catch(() => null);
            if (cRoom) await cRoom.send(`> 💠 **إشعار ترقية**\n> 👤 **المتدرب:** <@${traineeId}>\n> 🎖️ **الرتبة:** \`Rank ${rank}\`\n> ✨ **الحالة:** جاهز ✅`);
          }
        }
      });
      await originalMessage.react("✅");
      await interaction.update({ content: "✅ تم الاعتماد.", components: [] });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
    } else if (interaction.customId === 'reject_task' || interaction.customId === 'missing_photo') {
      const modal = new ModalBuilder().setCustomId(`modal_${interaction.customId}_${originalMessage.id}`).setTitle('تقديم سبب');
      const reasonInput = new TextInputBuilder().setCustomId('reason_text').setLabel("اكتب السبب").setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      await interaction.showModal(modal);
    }
  }

  if (interaction.isModalSubmit()) {
    const parts = interaction.customId.split('_');
    const msgId = parts[2];
    const reason = interaction.fields.getTextInputValue('reason_text');
    const originalMessage = await interaction.channel.messages.fetch(msgId).catch(() => null);
    if (originalMessage) {
      const isReject = interaction.customId.includes('reject_task');
      await originalMessage.react(isReject ? "❌" : "📷").catch(() => {});
      await originalMessage.reply(`⚠️ **تنبيه:** <@${originalMessage.author.id}>\nتم **${isReject ? "رفض" : "إخطار بنقص"}** التقرير.\n📝 **السبب:** ${reason}`);
    }
    await interaction.reply({ content: "✅ تم التسجيل.", ephemeral: true });
    await interaction.channel.messages.fetch(interaction.message.id).then(m => m.delete().catch(() => {}));
  }
});

/* ================== تشغيل السيرفر والبوت ================== */
const app = express();
app.get("/", (req, res) => res.send("Bot Stats Online ✅"));
app.listen(process.env.PORT || 3000);
client.login(process.env.TOKEN);
