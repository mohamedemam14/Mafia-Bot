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
import { blockhash64 } from 'blockhash-core';
import { createCanvas, loadImage } from 'canvas';
import Tesseract from 'tesseract.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "progress.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "{}");

/* ================== الإعدادات (الأيديهات الأصلية) ================== */

// 1. نظام كشف التزوير (اضبط الأيدي الخاص بروم الفحص هنا)
const CHECK_ROOM_ID = "1457423689195978964"; // الروم الذي سينظر فيه البوت لكشف التزوير
const ADMIN_LOG_CHANNEL_ID = "1459208046403391560"; // سيتم إرسال بلاغات التزوير هنا

// 2. إعدادات الإدارة والترقيات
const ADMIN_ROLE_ID = "1459164560480145576";
const FOLLOW_ROOM_ID = "1459162738503847969";
const NOTIFICATION_ROOM_ID = "1459162853696077982"; 

const READY_RANK_2_ROOM_ID = "1459162819072102574";
const READY_RANK_3_ROOM_ID = "1459162843327758525";
const READY_COMBINED_ROOM_ID = "1459162779419414627";

// 3. غرف المهام الأصلية
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

const imageCache = new Map();

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
app.get("/", (req, res) => res.send("Active"));
app.listen(process.env.PORT || 3000);

client.on(Events.ClientReady, () => console.log(`✅ ${client.user.tag} Online`));

/* ================== معالجة الرسائل (الفحص + المهام) ================== */

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // أولاً: كشف التزوير في روم واحد فقط (CHECK_ROOM_ID)
  if (message.channelId === CHECK_ROOM_ID) {
    if (message.attachments.size > 0) {
      for (const attachment of message.attachments.values()) {
        try {
          const img = await loadImage(attachment.url);
          const canvas = createCanvas(img.width, img.height);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const hash = blockhash64(ctx.getImageData(0, 0, img.width, img.height), 16);

          if (imageCache.has(hash)) {
            const original = imageCache.get(hash);
            const adminLog = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID).catch(() => null);
            if (adminLog) {
              const alertEmbed = new EmbedBuilder()
                .setTitle('🚨 اكتشاف تقرير مكرر!')
                .setColor(0xFF0000)
                .setDescription(`تم اكتشاف محاولة تكرار من <@${message.author.id}>`)
                .addFields(
                  { name: 'الرسالة الحالية', value: `[اضغط هنا](${message.url})`, inline: true },
                  { name: 'الرسالة الأصلية', value: `[اضغط هنا](${original.url})`, inline: true }
                )
                .setTimestamp();
              await adminLog.send({ embeds: [alertEmbed] });
            }
          } else {
            imageCache.set(hash, { url: message.url, author: message.author.id });
          }
        } catch (e) { console.error(e); }
      }
    }
    return; 
  }

  // ثانياً: نظام المهام (في رومات المهام فقط)
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

/* ================== نظام الأزرار والترقية ================== */

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
    
    // بناء الرسالة وتحديثها
    const followMsgText = `### 📑 ملف المتابعة لـ <@${traineeId}>\nرتبة المستهدفة: ${rank}\nالتقدم: ${data.tasks.length}/${allTasks.length}`;
    if (data.followMessageId) {
       const m = await followChannel.messages.fetch(data.followMessageId).catch(() => null);
       if (m) await m.edit(followMsgText); else await followChannel.send(followMsgText).then(msg => data.followMessageId = msg.id);
    } else {
       await followChannel.send(followMsgText).then(msg => data.followMessageId = msg.id);
    }

    if (data.tasks.length === allTasks.length && !data.upgradeNotified) {
      data.upgradeNotified = true;
      const nRoom = await client.channels.fetch(NOTIFICATION_ROOM_ID).catch(() => null);
      if (nRoom) await nRoom.send(`تهانينا <@${traineeId}>! أكملت تدريبك. موعد الترقية: ${getNextUpgradeDay()}`);
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
