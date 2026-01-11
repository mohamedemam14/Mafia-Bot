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

/* ================== دوال المساعدة ================== */

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (err) { return {}; }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

async function updateStatsEmbed(client, guild) {
  const statsChannel = await client.channels.fetch(STATS_ROOM_ID).catch(() => null);
  if (!statsChannel) return;

  const currentData = loadData();
  const stats = currentData.stats || {};
  const serverIcon = guild.iconURL({ size: 512 });

  const embed = new EmbedBuilder()
    .setTitle("📊 إحصائيات الأداء العام")
    .setColor(0x2b2d31)
    .setThumbnail(serverIcon)
    .setDescription("يتم تحديث الإحصائيات بشكل تراكمي وفوري.")
    .addFields(
      { 
        name: "📋 التقارير اليدوية المعتمدة", 
        value: Object.entries(MANUAL_STATS_CHANNELS).map(([id, name]) => `> **${name}:** \`${stats[id] || 0}\``).join("\n"), 
        inline: false 
      },
      { 
        name: "🤝 تعاون الأقسام (تلقائي)", 
        value: Object.entries(AUTO_STATS_CHANNELS).map(([id, name]) => `> **${name}:** \`${stats[id] || 0}\``).join("\n"), 
        inline: false 
      }
    )
    .setTimestamp()
    .setFooter({ text: guild.name, iconURL: serverIcon });

  const messages = await statsChannel.messages.fetch({ limit: 10 });
  const botMsg = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
  
  if (botMsg) await botMsg.edit({ embeds: [embed] });
  else await statsChannel.send({ embeds: [embed] });
}

/* ================== الأحداث ================== */
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Message, Partials.Channel]
});

client.on(Events.MessageCreate, async (message) => {
  // حساب أي رسالة في رومات التعاون (حتى لو بوت)
  if (AUTO_STATS_CHANNELS[message.channelId]) {
    const data = loadData();
    if (!data.stats) data.stats = {};
    data.stats[message.channelId] = (data.stats[message.channelId] || 0) + 1;
    saveData(data);
    await updateStatsEmbed(client, message.guild);
    return;
  }

  // تجاهل رسائل البوت في غرف المهام
  if (message.author.bot) return;

  const rank = TASKS_RANK_2[message.channelId] ? 2 : (TASKS_RANK_3[message.channelId] ? 3 : null);
  const isManual = MANUAL_STATS_CHANNELS[message.channelId];
  if (!rank && !isManual) return;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('approve_task').setLabel('قبول ✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('missing_photo').setLabel('نقص 📷').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('reject_task').setLabel('رفض ❌').setStyle(ButtonStyle.Danger)
  );

  await message.reply({ content: `⚙️ **إدارة الموظف: <@${message.author.id}>**`, components: [row] });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.roles.cache.has(ADMIN_ROLE_ID)) return interaction.reply({ content: "إدارة فقط.", ephemeral: true });

  const originalMessage = await interaction.channel.messages.fetch(interaction.message.reference.messageId).catch(() => null);
  if (!originalMessage) return;

  const traineeId = originalMessage.author.id;
  const roomId = interaction.channelId;

  if (interaction.customId === 'approve_task') {
    const data = loadData();

    // تحديث يدوي للكورسات/الفعاليات
    if (MANUAL_STATS_CHANNELS[roomId]) {
      if (!data.stats) data.stats = {};
      data.stats[roomId] = (data.stats[roomId] || 0) + 1;
    }

    const rank = TASKS_RANK_2[roomId] ? 2 : (TASKS_RANK_3[roomId] ? 3 : null);
    if (rank) {
      const rankKey = `rank${rank}`;
      if (!data[traineeId]) data[traineeId] = {};
      if (!data[traineeId][rankKey]) data[traineeId][rankKey] = { tasks: [], completedRooms: [], followMessageId: null, upgradeNotified: false };
      
      const userRank = data[traineeId][rankKey];
      if (!userRank.completedRooms.includes(roomId)) {
        userRank.completedRooms.push(roomId);
        userRank.tasks.push(rank === 2 ? TASKS_RANK_2[roomId] : TASKS_RANK_3[roomId]);

        const followChannel = await client.channels.fetch(FOLLOW_ROOM_ID).catch(() => null);
        if (followChannel) {
          const totalTasks = Object.values(rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3);
          const percent = Math.round((userRank.tasks.length / totalTasks.length) * 100);
          const bar = "🔹".repeat(Math.round(percent/10)) + "🔸".repeat(10 - Math.round(percent/10));
          const list = totalTasks.map(t => userRank.tasks.includes(t) ? `┃ ✅ **${t}**` : `┃ 🔘 *${t}*`).join("\n");
          const content = `### 📑 مـلف تـدريب (Rank ${rank})\n👤 <@${traineeId}>\n\n${list}\n\n📊 التقدم: ${bar} **${percent}%**`;

          if (userRank.followMessageId) {
            const m = await followChannel.messages.fetch(userRank.followMessageId).catch(() => null);
            if (m) await m.edit({ content });
            else { const nm = await followChannel.send({ content }); userRank.followMessageId = nm.id; }
          } else { const nm = await followChannel.send({ content }); userRank.followMessageId = nm.id; }
        }

        if (userRank.tasks.length === Object.keys(rank === 2 ? TASKS_RANK_2 : TASKS_RANK_3).length && !userRank.upgradeNotified) {
          userRank.upgradeNotified = true;
          const rRoom = await client.channels.fetch(rank === 2 ? READY_RANK_2_ROOM_ID : READY_RANK_3_ROOM_ID).catch(() => null);
          if (rRoom) await rRoom.send(`🎊 المتدرب <@${traineeId}> جاهز لترقية **Rank ${rank}**`);
          
          const nRoom = await client.channels.fetch(NOTIFICATION_ROOM_ID).catch(() => null);
          if (nRoom) await nRoom.send(`### 🔔 إشعار إتمام التدريب\nمرحباً بك <@${traineeId}>، لقد أتممت جميع المهام لرتبة **Rank ${rank}**.\n⏰ يرجى التواجد في المواعيد الرسمية للترقيات.`);
          
          const cRoom = await client.channels.fetch(READY_COMBINED_ROOM_ID).catch(() => null);
          if (cRoom) await cRoom.send(`> 💠 **إشعار ترقية**\n> 👤 **المتدرب:** <@${traineeId}>\n> 🎖️ **الرتبة:** \`Rank ${rank}\`\n> ✨ **الحالة:** جاهز ✅`);
        }
      }
    }

    saveData(data);
    await updateStatsEmbed(client, interaction.guild);
    await originalMessage.react("✅");
    await interaction.update({ content: "✅ تم الاعتماد", components: [] });
  } else {
    await originalMessage.react(interaction.customId === 'missing_photo' ? "📷" : "❌");
    await interaction.update({ content: "⚠️ تم التحديث", components: [] });
  }
});

const app = express();
app.get("/", (req, res) => res.send("Bot Online ✅"));
app.listen(process.env.PORT || 3000);
client.login(process.env.TOKEN);
