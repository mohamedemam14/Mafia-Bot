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

/* ================== الإعدادات (الأيديهات) ================== */

const CHECK_ROOM_ID = "1457423689195978964"; // الروم الذي يفحص فيه النصوص المتكررة
const ADMIN_LOG_CHANNEL_ID = "1459208046403391560"; // روم إرسال بلاغات التكرار

const ADMIN_ROLE_ID = "1459164560480145576";
const FOLLOW_ROOM_ID = "1459162738503847969";
const NOTIFICATION_ROOM_ID = "1459162853696077982"; 

const READY_RANK_2_ROOM_ID = "1459162819072102574";
const READY_RANK_3_ROOM_ID = "1459162843327758525";
const READY_COMBINED_ROOM_ID = "1459162779419414627";

// غرف المهام
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

// ذاكرة تخزين النصوص المكررة
const textCache = new Map();

/* ================== دوال المساعدة ================== */

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch (err) { return {}; }
}
function saveProgress(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getNextUpgradeDay() {
  const upgradeDays = [6, 2, 4]; 
  const daysMap = { 0: "الأحد", 1: "الاثنين", 2: "الثلاثاء", 3: "الأربعاء", 4: "الخميس", 5: "الجمعة", 6: "السبت" };
  const now = new Date();
  const today = now.getDay();
  let nextDay = upgradeDays.find(d => d >= today);
  if (nextDay === undefined) nextDay = upgradeDays[0];
  return daysMap[nextDay];
}

/* ================== تشغيل البوت ================== */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel]
});

const app = express();
app.get("/", (req, res) => res.send("Bot is Online"));
app.listen(process.env.PORT || 3000);

client.on(Events.ClientReady, () => console.log(`✅ ${client.user.tag} جاهز`));

/* ================== معالجة الرسائل ================== */

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // 1. نظام كشف تكرار "النص" في روم الفحص
  if (message.channelId === CHECK_ROOM_ID) {
    const msgContent = message.content.trim();
    
    // الفحص يعمل فقط إذا كان هناك نص مرفق مع صورة
    if (message.attachments.size > 0 && msgContent.length > 0) {
      
      if (textCache.has(msgContent)) {
        const original = textCache.get(msgContent);
        const adminLog = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID).catch(() => null);
        
        if (adminLog) {
          const alertEmbed = new EmbedBuilder()
            .setTitle('🚨 اكتشاف بيانات مكررة!')
            .setColor(0xFF0000)
            .setDescription(`المستخدم <@${message.author.id}> أرسل نفس البيانات المكتوبة مسبقاً.`)
            .addFields(
              { name: 'البيانات المكررة', value: `\`\`\`${msgContent}\`\`\`` },
              { name: 'الرسالة الأصلية', value: `[انتقل للأصل](${original.url})`, inline: true },
              { name: 'الرسالة الحالية', value: `[انتقل للحالية](${message.url})`, inline: true }
            )
            .setTimestamp();
          await adminLog.send({ embeds: [alertEmbed] });
        }
      } else {
        // حفظ النص لأول مرة
        textCache.set(msgContent, { url: message.url, author: message.author.id });
      }
    }
    return;
  }

  // 2. نظام المهام (في رومات المهام)
  const isTaskRoom = TASKS_RANK_2[message.channelId] || TASKS_RANK_3[message.channelId];
  if (!isTaskRoom) return;

  const progress = loadProgress();
  if (progress[message.author.id]?.completedRooms.includes(message.channelId)) {
    const warning = await message.reply(`⛔ لقد أنهيت هذه المهمة مسبقاً.`);
    return setTimeout(() => { message.delete().catch(() => {}); warning.delete().catch(() => {}); }, 3000);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approve_task').setLabel('قبول ✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('missing_photo').setLabel('نقص 📷').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('reject_task').setLabel('رفض ❌').setStyle(ButtonStyle.Danger)
  );

  await message.reply({ content: `⚙️ **إدارة المهمة لـ <@${message.author.id}>:**`, components: [row] });
});

/* ================== نظام الأزرار ================== */

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
    
    const followMsgText = `### 📑 ملف المتابعة لـ <@${traineeId}>\nالتقدم: ${data.tasks.length}/${allTasks.length}`;
    if (data.followMessageId) {
       const m = await followChannel.messages.fetch(data.followMessageId).catch(() => null);
       if (m) await m.edit(followMsgText); else await followChannel.send(followMsgText).then(msg => data.followMessageId = msg.id);
    } else {
       await followChannel.send(followMsgText).then(msg => data.followMessageId = msg.id);
    }

    if (data.tasks.length === allTasks.length && !data.upgradeNotified) {
      data.upgradeNotified = true;
      const nRoom = await client.channels.fetch(NOTIFICATION_ROOM_ID).catch(() => null);
      if (nRoom) await nRoom.send(`تهانينا <@${traineeId}>! موعد الترقية: ${getNextUpgradeDay()}`);
    }

    saveProgress(progress);
    await originalMessage.react("✅");
    await interaction.update({ content: "⭐ تم الاعتماد.", components: [] });
  } else {
    await originalMessage.react(interaction.customId === 'missing_photo' ? "📷" : "❌");
    await interaction.update({ content: "⚠️ تم التحديث.", components: [] });
  }
});

client.login(process.env.TOKEN);
