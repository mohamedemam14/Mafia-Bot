import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  Events
} from "discord.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const games = new Map();

/* ================== HELPERS ================== */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function createRows(players, actionPrefix, style) {
  const rows = [];
  for (let i = 0; i < players.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(
      players.slice(i, i + 5).map(p =>
        new ButtonBuilder().setCustomId(`${actionPrefix}_${p.id}`).setLabel(p.name).setStyle(style)
      )
    );
    rows.push(row);
  }
  return rows;
}

/* ================== COMMANDS ================== */
client.on(Events.MessageCreate, async msg => {
  if (msg.content === "!ابدأ_مافيا") {
    if (!msg.member.permissions.has(PermissionFlagsBits.Administrator)) return;

    const embed = new EmbedBuilder()
      .setTitle("🎭 لعبة المافيا")
      .setDescription("اضغط على الزر أدناه للمشاركة في اللعبة!")
      .setColor(0x3498db);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("join_game").setLabel("انضمام 🎮").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("start_now").setLabel("بدء اللعب 🚀").setStyle(ButtonStyle.Primary)
    );

    games.set(msg.guildId, { hostId: msg.author.id, players: [], phase: "signup", channel: msg.channel });
    await msg.channel.send({ embeds: [embed], components: [row] });
  }
});

/* ================== INTERACTIONS ================== */
client.on(Events.InteractionCreate, async int => {
  const game = games.get(int.guildId);
  if (!game) return;

  // 1. نظام الانضمام
  if (int.customId === "join_game") {
    if (game.players.find(p => p.id === int.user.id)) return int.reply({ content: "أنت مسجل بالفعل!", ephemeral: true });
    game.players.push({ id: int.user.id, name: int.user.username, alive: true, role: "citizen" });
    return int.reply({ content: `تم تسجيلك! عدد اللاعبين الحالي: ${game.players.length}`, ephemeral: true });
  }

  // 2. بدء اللعبة وتوزيع الأدوار
  if (int.customId === "start_now") {
    if (int.user.id !== game.hostId) return int.reply({ content: "المنظم فقط يبدأ اللعبة", ephemeral: true });
    if (game.players.length < 4) return int.reply({ content: "نحتاج 4 لاعبين على الأقل", ephemeral: true });

    game.phase = "playing";
    shuffle(game.players);
    game.players[0].role = "mafia";
    game.players[1].role = "doctor";
    game.players[2].role = "police";
    if (game.players.length >= 7) game.players[3].role = "mafia";

    await int.update({ content: "🎮 بدأت اللعبة! تفقدوا أدواركم عبر الزر أدناه.", embeds: [], components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("check_role").setLabel("كشف دوري 🔍").setStyle(ButtonStyle.Secondary)
      )
    ]});

    setTimeout(() => startNight(int.guildId), 5000);
  }

  // 3. كشف الدور (مخفي)
  if (int.customId === "check_role") {
    const player = game.players.find(p => p.id === int.user.id);
    if (!player) return int.reply({ content: "لست في اللعبة", ephemeral: true });
    return int.reply({ content: `دورك هو: **${player.role}**`, ephemeral: true });
  }

  // 4. منطق الأكشن (قتل، حماية، تحقيق)
  const [action, targetId] = int.customId.split("_");
  const player = game.players.find(p => p.id === int.user.id);
  if (!player || !player.alive) return;

  if (action === "kill" && player.role === "mafia") {
    game.mafiaTarget = targetId;
    await int.reply({ content: "🗡️ تم اختيار الضحية سرياً", ephemeral: true });
  } else if (action === "save" && player.role === "doctor") {
    game.doctorSave = targetId;
    await int.reply({ content: "💉 تم اختيار شخص لحمايته", ephemeral: true });
  } else if (action === "reveal" && player.role === "police") {
    const target = game.players.find(p => p.id === targetId);
    await int.reply({ content: `🕵️ نتيجة التحقيق: **${target.name}** هو **${target.role}**`, ephemeral: true });
  } else if (action === "vote" && game.phase === "day") {
    game.votes[int.user.id] = targetId;
    await int.reply({ content: "🗳️ تم تسجيل صوتك", ephemeral: true });
  }
});

/* ================== GAME LOOPS ================== */
async function startNight(guildId) {
  const game = games.get(guildId);
  game.phase = "night";
  game.mafiaTarget = null; game.doctorSave = null; game.votes = {};

  const alive = game.players.filter(p => p.alive);
  const embed = new EmbedBuilder().setTitle("🌙 الليل حان").setDescription("الأدوار الخاصة تعمل الآن...").setColor(0x000000);
  
  await game.channel.send({ embeds: [embed] });

  // إرسال أزرار التحكم للأدوار (كل شخص يضغط على ما يخصه)
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("night_actions").setLabel("لوحة التحكم الليلية 🕹️").setStyle(ButtonStyle.Danger)
  );

  const actionMsg = await game.channel.send({ content: "استخدم الزر للقيام بدورك (مخفي):", components: [row] });

  // استلام ضغطات لوحة التحكم الليلية
  const collector = actionMsg.createMessageComponentCollector({ time: 20000 });
  collector.on('collect', async i => {
    const p = game.players.find(pl => pl.id === i.user.id);
    if (!p || !p.alive) return i.reply({ content: "لا يمكنك المشاركة", ephemeral: true });

    let rows;
    if (p.role === "mafia") rows = createRows(alive, "kill", ButtonStyle.Danger);
    else if (p.role === "doctor") rows = createRows(alive, "save", ButtonStyle.Success);
    else if (p.role === "police") rows = createRows(alive, "reveal", ButtonStyle.Primary);
    else return i.reply({ content: "أنت مواطن، انتظر الصباح..", ephemeral: true });

    await i.reply({ content: "اختر هدفك:", components: rows, ephemeral: true });
  });

  setTimeout(() => resolveNight(guildId), 22000);
}

async function resolveNight(guildId) {
  const game = games.get(guildId);
  let deathMsg = "🌅 صباح هادئ، لم يمت أحد.";
  
  if (game.mafiaTarget && game.mafiaTarget !== game.doctorSave) {
    const target = game.players.find(p => p.id === game.mafiaTarget);
    target.alive = false;
    deathMsg = `🌅 استيقظت المدينة على خبر مقتل **${target.name}**!`;
  }

  startDay(guildId, deathMsg);
}

async function startDay(guildId, msg) {
  const game = games.get(guildId);
  if (checkWinner(game)) return;

  game.phase = "day";
  const alive = game.players.filter(p => p.alive);
  const embed = new EmbedBuilder().setTitle("☀️ النهار").setDescription(msg).setColor(0xf1c40f);
  
  await game.channel.send({ embeds: [embed] });
  const rows = createRows(alive, "vote", ButtonStyle.Primary);
  await game.channel.send({ content: "🗳️ صوتوا لطرد المشتبه به:", components: rows });

  setTimeout(() => resolveDay(guildId), 25000);
}

async function resolveDay(guildId) {
  const game = games.get(guildId);
  const voteCounts = {};
  Object.values(game.votes).forEach(id => voteCounts[id] = (voteCounts[id] || 0) + 1);
  
  const sorted = Object.entries(voteCounts).sort((a,b) => b[1]-a[1]);
  if (sorted.length > 0) {
    const victim = game.players.find(p => p.id === sorted[0][0]);
    victim.alive = false;
    await game.channel.send(`⚖️ تم طرد **${victim.name}** وكان دوره: **${victim.role}**`);
  } else {
    await game.channel.send("⚖️ لم يتفق أحد على طرد شخص.");
  }

  if (!checkWinner(game)) startNight(guildId);
}

function checkWinner(game) {
  const mafia = game.players.filter(p => p.alive && p.role === "mafia");
  const citizens = game.players.filter(p => p.alive && p.role !== "mafia");

  if (mafia.length === 0) {
    game.channel.send("🎉 فاز المواطنون!");
    return true;
  }
  if (mafia.length >= citizens.length) {
    game.channel.send("💀 فازت المافيا!");
    return true;
  }
  return false;
}

client.login(process.env.DISCORD_TOKEN);
