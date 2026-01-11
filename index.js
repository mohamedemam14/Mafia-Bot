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

/* ================== الإعدادات (IDs) ================== */
const ADMIN_ROLE_ID = "1459164560480145576";
const FOLLOW_ROOM_ID = "1459162738503847969";
const NOTIFICATION_ROOM_ID = "1459162853696077982";
const STATS_ROOM_ID = "1459162751288217869"; 

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

// 1. رومات تحتاج قبول (نظام يدوي)
const MANUAL_STATS_CHANNELS = {
  "1459162757135073323": "عدد الكورسات",
  "1459162754173894801": "عدد الفعاليات"
};

// 2. رومات التعاون (عد تلقائي بمجرد الإرسال)
const AUTO_STATS_CHANNELS = {
  "1459162779419414627": "تعاون قسم المقابلات",
  "1459162782397104243": "تعاون قسم المخالفات",
  "1459162785018675304": "تعاون قسم الفعاليات",
  "1459162788151951522": "تعاون قسم الارشاد",
  "1459162790798295067": "تعاون قسم الاعلام",
  "1459162794434891818": "تعاون قسم (Cpr)"
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

async function updateStatsEmbed(client, statsData) {
  const statsChannel = await client.channels.fetch(STATS_ROOM_ID).catch(() => null);
  if (!statsChannel) return;

  let desc = "📊 **إحصائيات العمليات والتعاون:**\n\n";
  desc += "✨ **التقارير المعتمدة:**\n";
  for (const [id, name] of Object.entries(MANUAL_STATS_CHANNELS)) {
    desc += `┃ ${name}: \`${statsData[id] || 0}\`\n`;
  }
  desc += "\n🤝 **إحصائيات التعاون (تلقائي):**\n";
  for (const [id, name] of Object.entries(AUTO_STATS_CHANNELS)) {
    desc += `┃ ${name}: \`${statsData[id] || 0}\`\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle("📈 لوحة مراقبة الأداء العام")
    .setColor(0x2b2d31)
    .setDescription(desc)
    .setTimestamp()
    .setFooter({ text: "تحديث فوري" });

  const messages = await statsChannel.messages.fetch({ limit: 10 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
  
  if (botMsg) await botMsg.edit({ embeds: [embed] });
  else await statsChannel.send({ embeds: [embed] });
}

/* ================== أحداث البوت ================== */
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Message, Partials.Channel]
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const progress = loadProgress();

  // 1. فحص رومات التعاون (العد التلقائي)
  if (AUTO_STATS_CHANNELS[message.channelId]) {
    if (!progress.stats) progress.stats = {};
    progress.stats[message.channelId] = (progress.stats[message.channelId] || 0) + 1;
    saveProgress(progress);
    await updateStatsEmbed(client, progress.stats);
    return; 
  }

  // 2. فحص رومات الرانكات والتقارير اليدوية (أزرار)
  const isActionRoom = TASKS_RANK_2[message.channelId] || 
                       TASKS_RANK_3[message.channelId] || 
                       MANUAL_STATS_CHANNELS[message.channelId];

  if (!isActionRoom) return;

  // منع التكرار لرومات الرانكات فقط
  if ((TASKS_RANK_2[message.channelId] || TASKS_RANK_3[message.channelId]) && 
      progress[message.author.id]?.completedRooms.includes(message.channelId)) {
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
  if (!originalMessage) return interaction.reply({ content: "خطأ في الرسالة الأصلية.", ephemeral: true });

  const traineeId = originalMessage.author.id;
  const roomId = interaction.channelId;

  if (interaction.customId === 'approve_task') {
    const progress = loadProgress();

    // أ. تحديث الإحصائيات اليدوية (كورسات / فعاليات)
    if (MANUAL_STATS_CHANNELS[roomId]) {
        if (!progress.stats) progress.stats = {};
        progress.stats[roomId] = (progress.stats[roomId] || 0) + 1;
        await updateStatsEmbed(client, progress.stats);
    }

    // ب. تحديث نظام الرانكات والمتابعة
    let rank = TASKS_RANK_2[roomId] ? 2 : (TASKS_RANK_3[roomId] ? 3 : null);
    if (rank) {
        if (!progress[traineeId]) progress[traineeId] = { rank, tasks: [], completedRooms: [], followMessageId: null, upgradeNotified: false };
        const data = progress[traineeId];

        if (!data.completedRooms.includes(roomId)) {
            data.completedRooms.push(roomId);
            data.tasks.push(TASKS_RANK_2[roomId] || TASKS_RANK_3[roomId]);

            // تحديث رسالة المتابعة (Follow Room)
            const allTasks = Object.values(rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3);
            const followChannel = await client.channels.fetch(FOLLOW_ROOM_ID).catch(() => null);
            if (followChannel) {
                const content = buildFollowMessage(traineeId, rank, data.tasks, allTasks);
                if (data.followMessageId) {
                    const oldMsg = await followChannel.messages.fetch(data.followMessageId).catch(() => null);
                    if (oldMsg) await oldMsg.edit({ content });
                    else {
                        const nm = await followChannel.send({ content });
                        data.followMessageId = nm.id;
                    }
                } else {
                    const nm = await followChannel.send({ content });
                    data.followMessageId = nm.id;
                }
            }

            // إرسال إشعارات الجاهزية للترقية
            if (data.tasks.length === allTasks.length && !data.upgradeNotified) {
                data.upgradeNotified = true;
                const rRoom = await client.channels.fetch(rank === 2 ? READY_RANK_2_ROOM_ID : READY_RANK_3_ROOM_ID).catch(() => null);
                if (rRoom) await rRoom.send(buildReadyToUpgradeMessage(traineeId, rank));
                const nRoom = await client.channels.fetch(NOTIFICATION_ROOM_ID).catch(() => null);
                if (nRoom) await nRoom.send(buildPersonalNotification(traineeId));
                const cRoom = await client.channels.fetch(READY_COMBINED_ROOM_ID).catch(() => null);
                if (cRoom) await cRoom.send(`> 💠 **إشعار ترقية**\n> 👤 **الاسم:** <@${traineeId}>\n> 🎖️ **الرتبة:** \`${rank}\`\n> ✨ **جاهز للترقية :** ✅`);
            }
        }
    }

    saveProgress(progress);
    await originalMessage.reactions.removeAll().catch(() => {});
    await originalMessage.react("✅");
    await interaction.update({ content: "⭐ تم الاعتماد وتحديث الإحصائيات.", components: [] });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
  } else {
    // نقص أو رفض
    const emoji = interaction.customId === 'missing_photo' ? "📷" : "❌";
    await originalMessage.reactions.removeAll().catch(() => {});
    await originalMessage.react(emoji);
    await interaction.update({ content: "⚠️ تم التحديث.", components: [] });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 2000);
  }
});

const app = express();
app.get("/", (req, res) => res.send("Bot Online ✅"));
app.listen(process.env.PORT || 3000);
client.login(process.env.TOKEN);
