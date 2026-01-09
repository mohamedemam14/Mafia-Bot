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

/* ================== CLIENT ================== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

/* ================== GAME STORAGE ================== */
const games = new Map();

/* ================== HELPERS ================== */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function getMafiaCount(total) {
  if (total >= 10) return 3;
  if (total >= 7) return 2;
  return 1;
}

function progressBar(current, total, size = 20) {
  const filled = Math.round((current / total) * size);
  return "🟩".repeat(filled) + "⬛".repeat(size - filled);
}

async function startUITimer(channel, seconds, title, color) {
  let time = seconds;

  const embed = new EmbedBuilder()
    .setTitle(`⏳ ${title}`)
    .setColor(color)
    .setDescription(`**${time} ثانية**\n${progressBar(time, seconds)}`);

  const msg = await channel.send({ embeds: [embed] });

  const interval = setInterval(async () => {
    time--;
    if (time <= 0) {
      clearInterval(interval);
      embed.setTitle("⏰ انتهى الوقت").setDescription(progressBar(0, seconds));
      await msg.edit({ embeds: [embed] });
    } else {
      embed.setDescription(`**${time} ثانية**\n${progressBar(time, seconds)}`);
      await msg.edit({ embeds: [embed] });
    }
  }, 1000);

  return interval;
}

const COLORS = {
  night: 0x2c2f33,
  day: 0xf1c40f,
  vote: 0xe74c3c
};

/* ================== START GAME ================== */
client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot) return;

  if (msg.content === "!ابدأ_مافيا") {
    if (!msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return msg.reply("❌ الأمر للإدمن فقط");
    }

    const members = await msg.guild.members.fetch();
    const players = members
      .filter(m => !m.user.bot)
      .map(m => ({
        id: m.id,
        name: m.user.username,
        alive: true,
        role: "citizen"
      }));

    if (players.length < 5)
      return msg.reply("❌ الحد الأدنى 5 لاعبين");

    shuffle(players);

    const mafiaCount = getMafiaCount(players.length);
    for (let i = 0; i < mafiaCount; i++) players[i].role = "mafia";
    players[mafiaCount].role = "doctor";
    players[mafiaCount + 1].role = "police";

    games.set(msg.guild.id, {
      channel: msg.channel,
      players,
      phase: "night",
      actions: {
        mafiaDone: false,
        doctorDone: false,
        policeDone: false,
        votes: new Set()
      },
      mafiaVotes: {},
      saveTarget: null
    });

    await msg.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("🎭 بدأت لعبة المافيا")
          .setDescription(
            players
              .map(p => `• **${p.name}**`)
              .join("\n")
          )
          .setColor(0x3498db)
      ]
    });

    startNight(msg.guild.id);
  }
});

/* ================== NIGHT ================== */
async function startNight(guildId) {
  const game = games.get(guildId);
  if (!game) return;

  game.phase = "night";
  game.actions = {
    mafiaDone: false,
    doctorDone: false,
    policeDone: false,
    votes: new Set()
  };
  game.mafiaVotes = {};
  game.saveTarget = null;

  const channel = game.channel;

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("🌙 حلّ الليل")
        .setDescription(
          "😈 المافيا تختار\n💉 الدكتور ينقذ\n🕵️ الشرطي يحقق"
        )
        .setColor(COLORS.night)
    ]
  });

  const alive = game.players.filter(p => p.alive);

  const row = new ActionRowBuilder().addComponents(
    alive.map(p =>
      new ButtonBuilder()
        .setCustomId(`kill_${p.id}`)
        .setLabel(p.name)
        .setStyle(ButtonStyle.Danger)
    )
  );

  await channel.send({ content: "😈 اختيار المافيا", components: [row] });

  await startUITimer(channel, 15, "مرحلة الليل", COLORS.night);

  setTimeout(() => resolveNight(guildId), 16000);
}

/* ================== INTERACTIONS ================== */
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const [action, targetId] = interaction.customId.split("_");
  const game = games.get(interaction.guildId);
  if (!game) return;

  const player = game.players.find(p => p.id === interaction.user.id);
  if (!player || !player.alive) {
    return interaction.reply({ content: "❌ لست لاعبًا حيًا", ephemeral: true });
  }

  if (game.phase === "night") {
    if (action === "kill" && player.role === "mafia") {
      if (game.actions.mafiaDone)
        return interaction.reply({ content: "❌ اخترت بالفعل", ephemeral: true });

      game.mafiaVotes[targetId] =
        (game.mafiaVotes[targetId] || 0) + 1;
      game.actions.mafiaDone = true;

      return interaction.reply({
        content: "🗡️ تم تسجيل اختيارك (سري)",
        ephemeral: true
      });
    }
  }

  if (game.phase === "vote") {
    if (game.actions.votes.has(player.id))
      return interaction.reply({ content: "❌ صوتك مسجل", ephemeral: true });

    game.actions.votes.add(player.id);
    game.voteCount[targetId] =
      (game.voteCount[targetId] || 0) + 1;

    return interaction.reply({
      content: "🗳️ تم تسجيل صوتك",
      ephemeral: true
    });
  }
});

/* ================== RESOLVE NIGHT ================== */
async function resolveNight(guildId) {
  const game = games.get(guildId);
  if (!game) return;

  const votes = Object.entries(game.mafiaVotes);
  if (votes.length) {
    const [targetId] = votes.sort((a, b) => b[1] - a[1])[0];
    const target = game.players.find(p => p.id === targetId);
    if (target) target.alive = false;
  }

  startDay(guildId);
}

/* ================== DAY ================== */
async function startDay(guildId) {
  const game = games.get(guildId);
  if (!game) return;

  game.phase = "vote";
  game.voteCount = {};

  const channel = game.channel;

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("☀️ بدأ النهار")
        .setDescription(
          game.players
            .map(p => `${p.alive ? "🟢" : "🔴"} ${p.name}`)
            .join("\n")
        )
        .setColor(COLORS.day)
    ]
  });

  const alive = game.players.filter(p => p.alive);
  const row = new ActionRowBuilder().addComponents(
    alive.map(p =>
      new ButtonBuilder()
        .setCustomId(`vote_${p.id}`)
        .setLabel(p.name)
        .setStyle(ButtonStyle.Primary)
    )
  );

  await channel.send({ content: "🗳️ التصويت", components: [row] });

  await startUITimer(channel, 15, "مرحلة التصويت", COLORS.vote);

  setTimeout(() => resolveVote(guildId), 16000);
}

/* ================== RESOLVE VOTE ================== */
async function resolveVote(guildId) {
  const game = games.get(guildId);
  if (!game) return;

  const votes = Object.entries(game.voteCount);
  if (votes.length) {
    const [targetId] = votes.sort((a, b) => b[1] - a[1])[0];
    const target = game.players.find(p => p.id === targetId);
    if (target) target.alive = false;
  }

  startNight(guildId);
}

/* ================== LOGIN ================== */
client.login(process.env.DISCORD_TOKEN);
