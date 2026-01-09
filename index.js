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

/* ================== الإعدادات (الأيديهات) ================== */

const CHECK_ROOM_ID = "ضع_هنا_أيدي_روم_الفحص"; 
const ADMIN_LOG_CHANNEL_ID = "1459162853696077982"; 

const ADMIN_ROLE_ID = "1459164560480145576";
const FOLLOW_ROOM_ID = "1459162738503847969";
const NOTIFICATION_ROOM_ID = "1459162853696077982"; 

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

// ذاكرة تخزين الأسماء لمنع التكرار
const nameCache = new Map();

/* ================== دوال المساعدة ================== */

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch (err) { return {}; }
}
function saveProgress(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
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

/* ================== معالجة الرسائل ================== */

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // --- نظام كشف تكرار الاسم في روم الفحص ---
  if (message.channelId === CHECK_ROOM_ID) {
    // البحث عن كلمة "الاسم:" وما بعدها
    const nameMatch = message.content.match(/الاسم[:\s]+([^\n\r]+)/);
    
    if (nameMatch && nameMatch[1]) {
      const extractedName = nameMatch[1].trim(); // استخراج الاسم فقط

      if (nameCache.has(extractedName)) {
        const original = nameCache.get(extractedName);
        const adminLog = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID).catch(() => null);
        
        if (adminLog) {
          // رسالة عادية بدون إمبيد كما طلبت
          await adminLog.send(
            `⚠️ **تنبيه تكرار بيانات!**\n` +
            `👤 **المتدرب:** <@${message.author.id}>\n` +
            `📝 **الاسم المكرر:** \`${extractedName}\`\n` +
            `🔗 **التقرير الأصلي:** ${original.url}\n` +
            `🛑 **التقرير الحالي:** ${message.url}\n` +
            `━━━━━━━━━━━━━━━━━━━━`
          );
        }
      } else {
        // حفظ الاسم الجديد في الذاكرة
        nameCache.set(extractedName, { url: message.url, author: message.author.id });
      }
    }
    return;
  }

  // --- نظام المهام المعتاد ---
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

    const followChannel = await client.channels.fetch(FOLLOW_ROOM_ID);
    const content = `### 📑 ملف المتابعة لـ <@${traineeId}>\nالتقدم: ${data.tasks.length}/6`;
    
    if (data.followMessageId) {
       const m = await followChannel.messages.fetch(data.followMessageId).catch(() => null);
       if (m) await m.edit(content); else await followChannel.send(content).then(msg => data.followMessageId = msg.id);
    } else {
       await followChannel.send(content).then(msg => data.followMessageId = msg.id);
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
