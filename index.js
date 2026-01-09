import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  Events
} from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const games = new Map();

/* ================== HELPERS ================== */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// تقسيم الأزرار لصفوف (كل صف 5 أزرار كحد أقصى)
function createActionRows(players, actionPrefix, style) {
  const rows = [];
  for (let i = 0; i < players.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(
      players.slice(i, i + 5).map(p =>
        new ButtonBuilder()
          .setCustomId(`${actionPrefix}_${p.id}`)
          .setLabel(p.name)
          .setStyle(style)
      )
    );
    rows.push(row);
  }
  return rows;
}

async function startUITimer(channel, seconds, title, color) {
  let time = seconds;
  const embed = new EmbedBuilder()
    .setTitle(`⏳ ${title}`)
    .setColor(color)
    .setDescription(`**${time} ثانية**`);

  const msg = await channel.send({ embeds: [embed] });

  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      time--;
      if (time <= 0) {
        clearInterval(interval);
        embed.setTitle("⏰ انتهى الوقت").setDescription("جاري معالجة النتائج...");
        await msg.edit({ embeds: [embed] }).catch(() => {});
        resolve();
      } else {
        await msg.edit({
          embeds: [embed.setDescription(`**${time} ثانية**`)]
        }).catch(() => {});
      }
    }, 1000);
  });
}

/* ================== START GAME ================== */
client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot) return;

  if (msg.content === "!ابدأ_مافيا") {
    if (!msg.member.permissions.has(PermissionFlagsBits.Administrator)) return;

    const members = await msg.guild.members.fetch();
    const players = members
      .filter(m => !m.user.bot && m.presence?.status !== 'offline') // اختيار المتصلين فقط لضمان التفاعل
      .map(m => ({ id: m.id, name: m.user.username, alive: true, role: "citizen" }));

    if (players.length < 4) return msg.reply("❌ نحتاج على الأقل 4 لاعبين متصلين.");

    shuffle(players);
    players[0].role = "mafia";
    players[1].role = "doctor";
    players[2].role = "police";
    if (players.length >= 7) players[3].role = "mafia";

    games.set(msg.guild.id, {
      channel: msg.channel,
      players,
      phase: "waiting",
      mafiaTarget: null,
      doctorSave: null,
      votes: {}
    });

    // إرسال الأدوار بالخاص (مهم جداً)
    for (const p of players) {
      const user = await client.users.fetch(p.id);
      user.send(`دورك في اللعبة هو: **${p.role}** 🎭`).catch(() => {});
    }

    await msg.channel.send("✅ تم توزيع الأدوار في الخاص! ستبدأ اللعبة الآن.");
    startNight(msg.guild.id);
  }
});

/* ================== PHASES ================== */
async function startNight(guildId) {
  const game = games.get(guildId);
  if (!game) return;

  game.phase = "night";
  game.mafiaTarget = null;
  game.doctorSave = null;

  const alive = game.players.filter(p => p.alive);
  
  await game.channel.send({
    embeds: [new EmbedBuilder().setTitle("🌙 الليل - المافيا تختار ضحيتها").setColor(0x2c2f33)]
  });

  const rows = createActionRows(alive, "kill", ButtonStyle.Danger);
  await game.channel.send({ content: "😈 تصويت المافيا (سري):", components: rows });

  await startUITimer(game.channel, 20, "مرحلة الليل", 0x2c2f33);
  resolveNight(guildId);
}

async function startDay(guildId, deathMessage) {
  const game = games.get(guildId);
  if (!game) return;

  if (checkWinner(game)) return;

  game.phase = "day";
  game.votes = {};

  const alive = game.players.filter(p => p.alive);
  
  const embed = new EmbedBuilder()
    .setTitle("☀️ بدأ النهار")
    .setDescription(`${deathMessage}\n\n**اللاعبون الأحياء:**\n${alive.map(p => `• ${p.name}`).join("\n")}`)
    .setColor(0xf1c40f);

  await game.channel.send({ embeds: [embed] });

  const rows = createActionRows(alive, "vote", ButtonStyle.Primary);
  await game.channel.send({ content: "🗳️ حان وقت التصويت لطرد شخص مشبوه:", components: rows });

  await startUITimer(game.channel, 25, "مرحلة التصويت", 0xf1c40f);
  resolveDay(guildId);
}

/* ================== LOGIC ================== */
function resolveNight(guildId) {
  const game = games.get(guildId);
  let msg = "🌅 طلع الفجر ولم يمت أحد.";

  if (game.mafiaTarget && game.mafiaTarget !== game.doctorSave) {
    const target = game.players.find(p => p.id === game.mafiaTarget);
    if (target) {
      target.alive = false;
      msg = `🌅 طلع الفجر وتم العثور على جثة **${target.name}**!`;
    }
  } else if (game.mafiaTarget && game.mafiaTarget === game.doctorSave) {
    msg = "🌅 طلع الفجر وحاولت المافيا القتل لكن الدكتور أنقذ الضحية!";
  }

  startDay(guildId, msg);
}

function resolveDay(guildId) {
  const game = games.get(guildId);
  const voteCounts = {};
  
  Object.values(game.votes).forEach(id => {
    voteCounts[id] = (voteCounts[id] || 0) + 1;
  });

  const sortedVotes = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
  
  if (sortedVotes.length > 0) {
    const victimId = sortedVotes[0][0];
    const victim = game.players.find(p => p.id === victimId);
    victim.alive = false;
    game.channel.send(`⚖️ قرر الشعب طرد **${victim.name}**... وكان دوره **${victim.role}**!`);
  } else {
    game.channel.send("⚖️ لم يتم التصويت لأحد، الجميع ينجو اليوم.");
  }

  if (!checkWinner(game)) startNight(guildId);
}

function checkWinner(game) {
  const mafia = game.players.filter(p => p.alive && p.role === "mafia");
  const citizens = game.players.filter(p => p.alive && p.role !== "mafia");

  if (mafia.length === 0) {
    game.channel.send("🎉 فاز **المواطنون**! تم القضاء على المافيا.");
    games.delete(game.guildId);
    return true;
  }
  if (mafia.length >= citizens.length) {
    game.channel.send("💀 فازت **المافيا**! لقد سيطروا على المدينة.");
    games.delete(game.guildId);
    return true;
  }
  return false;
}

/* ================== INTERACTIONS ================== */
client.on(Events.InteractionCreate, async int => {
  if (!int.isButton()) return;
  const game = games.get(int.guildId);
  if (!game) return;

  const player = game.players.find(p => p.id === int.user.id);
  const [action, targetId] = int.customId.split("_");

  if (!player || !player.alive) return int.reply({ content: "لست في اللعبة أو ميت.", ephemeral: true });

  if (action === "kill" && player.role === "mafia") {
    game.mafiaTarget = targetId;
    return int.reply({ content: "تم اختيار الهدف.", ephemeral: true });
  }

  if (action === "vote" && game.phase === "day") {
    game.votes[player.id] = targetId;
    return int.reply({ content: "تم تسجيل صوتك.", ephemeral: true });
  }
  
  // يمكنك إضافة منطق الطبيب والشرطي هنا بنفس الطريقة
});

client.login(process.env.DISCORD_TOKEN);
