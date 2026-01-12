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

const LINE_URL = "https://cdn.discordapp.com/attachments/1425444776240611420/1460346562340323505/1571650a7c706000-1.gif?ex=69669538&is=696543b8&hm=047b92aa3ed9eadb14df329c40716160597b609c1fd90072bf0869d5f7d25a59&"; // رابط الخط

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

  const embed = new EmbedBuilder()
    .setTitle("📊 مركز إحصائيات الأداء العام")
    .setDescription("يتم تحديث هذه البيانات تلقائياً بناءً على تقارير الأقسام.")
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
        value: `> **✅ جاهزين للترقية:** \`${statsData[READY_COMBINED_ROOM_ID] || 0}\``,
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
  return `### 📑 مـلف تـدريب المـوظفين (Rank ${rank})\n┏━━━━━━━━━━━━━━━━━━┓\n  👤 **المتدرب:** <@${userId}>\n  🎖️ **الرتبة:** \`Rank ${rank}\`\n┗━━━━━━━━━━━━━━━━━━┛\n\n✨ **المهام المنجزة:**\n${list}\n\n📊 **التقدم الإجمالي:**\n┃ ${progressBar} **${percent}%**\n┃ (\`${doneTasks.length}/${totalTasks.length}\`)`;
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

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (message.channelId === READY_COMBINED_ROOM_ID) {
    const stats = await safeIncrement(READY_COMBINED_ROOM_ID);
    await updateStatsEmbed(client, stats);
  }

  if (message.content === "!reset" && message.member.roles.cache.has(ADMIN_ROLE_ID)) {
    const data = loadProgress();
    for (const key in data) {
      if (data[key]?.manualPoints !== undefined) {
        data[key].manualPoints = 0;
        data[key].courses = 0;
        data[key].events = 0;
      }
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    await updateTopWeekEmbed(client);
    return message.reply("✅ تم تصفير جميع النقاط والإحصائيات الأسبوعية.");
  }

  const rank = TASKS_RANK_2[message.channelId] ? 2 : (TASKS_RANK_3[message.channelId] ? 3 : null);
  const isManual = MANUAL_STATS_CHANNELS[message.channelId];
  if (!rank && !isManual) return;

  // إرسال الخط فوراً بعد رسالة المتدرب
  const lineMsg = await message.channel.send(LINE_URL).catch(() => null);

  if (rank) {
    const progress = loadProgress();
    if (progress[message.author.id]?.[`rank${rank}`]?.completedRooms?.includes(message.channelId)) {
      // إذا المهمة مكررة، نحذف رسالة الخط ورسالة الشخص
      if (lineMsg) await lineMsg.delete().catch(() => {});
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
              if (m) {
                await m.edit({ content });
                await followChannel.send(LINE_URL).catch(() => {}); // إرسال خط في روم المتابعة
              }
            } else {
              const nm = await followChannel.send({ content });
              data.followMessageId = nm.id;
              await followChannel.send(LINE_URL).catch(() => {}); // إرسال خط في روم المتابعة
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
      const emoji = isReject ? "❌" : "📷";
      const statusText = isReject ? "رفض التقرير" : "وجود نقص في التقرير";
      
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
