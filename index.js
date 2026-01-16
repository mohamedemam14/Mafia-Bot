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

/* ================== الإعدادات (تأكد من صحة الأيديات) ================== */
const ADMIN_ROLE_ID = "1457403586005831872";
const FOLLOW_ROOM_ID = "1435287030484697128";
const STATS_ROOM_ID = "1458097832232882308"; 
const TOP_WEEK_ROOM_ID = "1460976385655967787";

const READY_RANK_2_ROOM_ID = "1434522529506267308";
const READY_RANK_3_ROOM_ID = "1434519158426435678";
const READY_COMBINED_ROOM_ID = "1457888039673270515"; 

const COURSES_CHANNEL_ID = "1435036258266124390";
const EVENTS_CHANNEL_ID = "1435036088950460528";
const NEW_MEMBERS_ROOM_ID = "1434625741445795942"; 

const LINE_GIF_URL = "https://cdn.discordapp.com/attachments/1425444776240611420/1460346562340323505/1571650a7c706000-1.gif";

const TASKS_RANK_2 = {
  "1434330815990464674": "الإرشاد",
  "1434330427900039343": "الاستقبال",
  "1434521224272150619": "المخالفات",
  "1434330587480719484": "الفعاليات",
  "1434330953018249377": "الإعلام",
  "1434330690928906280": "CPR"
};

const TASKS_RANK_3 = {
  "1434514759436472451": "الإرشاد",
  "1434514060937924729": "الاستقبال",
  "1434516019661242408": "المخالفات",
  "1434514183461929021": "الفعاليات",
  "1434514841204162650": "الإعلام",
  "1434514293830717530": "CPR"
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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User]
});

/* ================== نظام إدارة الملفات المتزامن ================== */
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

async function safeIncrementNewMembers() {
  return new Promise((resolve) => {
    queue.push(async () => {
      const data = loadProgress();
      if (!data.stats) data.stats = {};
      data.stats.newMembersCount = (data.stats.newMembersCount || 0) + 1;
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

/* ================== دوال المساعدة للواجهات ================== */

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
        name: "📂 نشاط فريق التدريب", 
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
        value: `> **👤 المتدربين الجدد:** \`${newMembersCount}\`\n> **✅ جاهزين للترقية:** \`${statsData[READY_COMBINED_ROOM_ID] || 0}\``,
        inline: false
      }
    )
    .setFooter({ text: "نظام إدارة الإحصائيات التلقائي", iconURL: client.user.displayAvatarURL() })
    .setTimestamp();

  const messages = await statsChannel.messages.fetch({ limit: 20 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title === "📊 مركز إحصائيات الأداء العام");
  
  if (botMsg) await botMsg.edit({ embeds: [embed] });
  else await statsChannel.send({ embeds: [embed] });
}

function buildFollowMessage(userId, rank, doneTasks, totalTasks) {
  const percent = Math.round((doneTasks.length / totalTasks.length) * 100);
  const progressBar = "🔹".repeat(Math.round(percent/10)) + "🔸".repeat(10 - Math.round(percent/10));
  const list = totalTasks.map(t => doneTasks.includes(t) ? `┃ ✅ **${t}**` : `┃ 🔘 *${t}*`).join("\n");
  
  return `### 📑 مـلف تـدريب المـوظفين (Rank ${rank})\n┏━━━━━━━━━━━━━━━━━━┓\n  👤 **المتدرب:** <@${userId}>\n  🎖️ **الرتبة:** \`Rank ${rank}\`\n┗━━━━━━━━━━━━━━━━━━┛\n\n✨ **المهام المنجزة:**\n${list}\n\n📊 **التقدم الإجمالي:**\n┃ ${progressBar} **${percent}%**\n┃ (\`${doneTasks.length}/${totalTasks.length}\`)\n${LINE_GIF_URL}`;
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

  const messages = await topChannel.messages.fetch({ limit: 20 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds[0]?.title === "🏆 قائمة فرسان الأسبوع المتميزين");
  
  if (botMsg) await botMsg.edit({ embeds: [embed] });
  else await topChannel.send({ embeds: [embed] });
}

/* ================== الأحداث ================== */

client.on(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// نظام الريأكشن للمتدربين الجدد
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (reaction.message.partial) await reaction.message.fetch().catch(() => null);

  if (reaction.message.channelId === NEW_MEMBERS_ROOM_ID) {
    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (member && member.roles.cache.has(ADMIN_ROLE_ID)) {
      const stats = await safeIncrementNewMembers();
      await updateStatsEmbed(client, stats);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.channelId === NEW_MEMBERS_ROOM_ID && !message.author.bot) {
    await message.channel.send(LINE_GIF_URL).catch(() => null);
  }

  if (message.channelId === READY_COMBINED_ROOM_ID) {
    const stats = await safeIncrement(READY_COMBINED_ROOM_ID);
    await updateStatsEmbed(client, stats);
    if (message.author.bot) return;
  }

  if (message.author.bot) return;

  /* --- أوامر الإدارة: زيادة الكورسات والفعاليات --- */
  if ((message.content.startsWith("!addcourse") || message.content.startsWith("!addevent")) && message.member.roles.cache.has(ADMIN_ROLE_ID)) {
    const args = message.content.split(" ");
    const targetMember = message.mentions.members.first();
    const amount = parseInt(args[2]) || 1;

    if (!targetMember) return message.reply("❌ منشن الشخص أولاً. مثال: `!addcourse @user 5` ");

    const isCourse = message.content.startsWith("!addcourse");
    const channelId = isCourse ? COURSES_CHANNEL_ID : EVENTS_CHANNEL_ID;
    const typeLabel = isCourse ? "كورس" : "فعالية";

    await safeSaveUserProgress(targetMember.id, async (u) => {
      u.manualPoints = (u.manualPoints || 0) + amount;
      if (isCourse) u.courses = (u.courses || 0) + amount;
      else u.events = (u.events || 0) + amount;
    });

    const stats = await safeIncrement(channelId, amount);
    await updateStatsEmbed(client, stats);
    await updateTopWeekEmbed(client);

    return message.reply(`✅ تم إضافة **${amount}** ${typeLabel} لـ <@${targetMember.id}> بنجاح.`);
  }

  // امر التصفير الشامل
  if (message.content === "!reset" && message.member.roles.cache.has(ADMIN_ROLE_ID)) {
    queue.push(async () => {
      const data = loadProgress();
      for (const key in data) {
        if (key !== 'stats') {
          data[key].manualPoints = 0;
          data[key].courses = 0;
          data[key].events = 0;
        }
      }
      data.stats = {
        newMembersCount: 0,
        [READY_COMBINED_ROOM_ID]: 0,
        [COURSES_CHANNEL_ID]: 0,
        [EVENTS_CHANNEL_ID]: 0
      };

      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      await updateTopWeekEmbed(client);
      await updateStatsEmbed(client, data.stats);
      await message.reply("✅ تم تصفير كافة إحصائيات الأداء والنقاط بنجاح.");
    });
    processQueue();
    return;
  }

  // أوامر إنهاء المهام السريعة
  if ((message.content.startsWith("!finish2") || message.content.startsWith("!finish3")) && message.member.roles.cache.has(ADMIN_ROLE_ID)) {
    const targetMember = message.mentions.members.first();
    if (!targetMember) return message.reply("❌ منشن العضو. مثال: `!finish2 @user` ");
    
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
      if (rRoom) await rRoom.send({ content: `🎊 **تهنئة إتمام مهام (بأمر إداري)** 🎊\n<@${targetMember.id}> جاهز لترقية Rank ${rank}` });
      
      const cRoom = await client.channels.fetch(READY_COMBINED_ROOM_ID).catch(() => null);
      if (cRoom) await cRoom.send(`> 💠 **إشعار ترقية**\n> 👤 **المتدرب:** <@${targetMember.id}>\n> 🎖️ **الرتبة:** \`Rank ${rank}\`\n> ✨ **الحالة:** جاهز ✅`);
    });

    return message.reply(`✅ تم إكمال جميع مهام Rank ${rank} لـ <@${targetMember.id}> بنجاح.`);
  }

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
        
        const data = userData[rankKey];
        if (!data.completedRooms.includes(roomId)) {
          data.completedRooms.push(roomId);
          data.tasks.push(rank === 2 ? TASKS_RANK_2[roomId] : TASKS_RANK_3[roomId]);

          const followChannel = await client.channels.fetch(FOLLOW_ROOM_ID).catch(() => null);
          if (followChannel) {
            const content = buildFollowMessage(traineeId, rank, data.tasks, Object.values(rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3));
            if (data.followMessageId) {
              const m = await followChannel.messages.fetch(data.followMessageId).catch(() => null);
              if (m) await m.edit({ content });
            } else {
              const nm = await followChannel.send({ content });
              data.followMessageId = nm.id;
            }
          }

          if (data.tasks.length === Object.keys(rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3).length && !data.upgradeNotified) {
            data.upgradeNotified = true;
            const rRoom = await client.channels.fetch(rank === 2 ? READY_RANK_2_ROOM_ID : READY_RANK_3_ROOM_ID).catch(() => null);
            if (rRoom) await rRoom.send({ content: `🎊 **تهنئة إتمام مهام** 🎊\n<@${traineeId}> جاهز لترقية Rank ${rank}` });
            
            const cRoom = await client.channels.fetch(READY_COMBINED_ROOM_ID).catch(() => null);
            if (cRoom) await cRoom.send(`> 💠 **إشعار ترقية**\n> 👤 **المتدرب:** <@${traineeId}>\n> 🎖️ **الرتبة:** \`Rank ${rank}\`\n> ✨ **الحالة:** جاهز ✅`);
          }
        }
      });

      await originalMessage.react("✅");
      await interaction.update({ content: "✅ تم الاعتماد وتحديث البيانات.", components: [] });
      setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
    } 
    else if (interaction.customId === 'reject_task' || interaction.customId === 'missing_photo') {
      const modal = new ModalBuilder()
        .setCustomId(`modal_${interaction.customId}_${originalMessage.id}`)
        .setTitle(interaction.customId === 'reject_task' ? 'سبب الرفض' : 'سبب نقص الصور');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason_text')
        .setLabel("اكتب السبب هنا")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      await interaction.showModal(modal);
    }
  }

  if (interaction.isModalSubmit()) {
    const parts = interaction.customId.split('_');
    const msgId = parts[3]; 
    
    const reason = interaction.fields.getTextInputValue('reason_text');
    const originalMessage = await interaction.channel.messages.fetch(msgId).catch(() => null);

    if (originalMessage) {
      const isReject = interaction.customId.includes('reject_task');
      const emoji = isReject ? "❌" : "❗";
      const statusText = isReject ? "رفض التقرير" : "وجود نقص في المهمة";
      
      await originalMessage.react(emoji).catch(() => {});
      await originalMessage.reply({
        content: `⚠️ **تنبيه:** <@${originalMessage.author.id}>\nتم **${statusText}** من قبل الإدارة.\n📝 **السبب:** ${reason}`
      });
    }

    await interaction.reply({ content: "✅ تم تسجيل السبب بنجاح.", ephemeral: true });
    
    const controlMsg = await interaction.channel.messages.fetch(interaction.message.id).catch(() => null);
    if (controlMsg) await controlMsg.delete().catch(() => {});
  }
});

/* ================== تشغيل السيرفر والبوت ================== */
const app = express();
app.get("/", (req, res) => res.send("Bot Stats Online ✅"));
app.listen(process.env.PORT || 3000);

client.login(process.env.TOKEN);
