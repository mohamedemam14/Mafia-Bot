import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const games = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

const COLORS = {
  main: "#2b2d31",
  mafia: "#ff4b4b",
  doctor: "#50fa7b",
  police: "#8be9fd",
  night: "#282a36",
  day: "#f1fa8c"
};

/* ================== بدء اللعبة ================== */
client.on("messageCreate", async msg => {
  if (msg.content !== "!mafia" || msg.author.bot) return;
  if (games.has(msg.guild.id)) return msg.reply("❌ هناك لعبة جارية بالفعل!");

  games.set(msg.guild.id, {
    host: msg.author.id,
    players: [],
    alive: [],
    roles: {},
    tempChannels: [],
    mafiaKill: null,
    doctorSave: null,
    votes: new Map(),
    voted: new Set(),
    nightActions: new Set(),
    channel: msg.channel,
    status: "waiting"
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("join").setLabel("انضمام").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("start").setLabel("بدء").setStyle(ButtonStyle.Success)
  );

  const embed = new EmbedBuilder()
    .setTitle("🎭 جولة مافيا Leo")
    .setDescription("اضغط على الزر للانضمام. سيتم إرسال الأوامر برسائل مخفية.")
    .setColor(COLORS.main);

  await msg.channel.send({ embeds: [embed], components: [row] });
});

/* ================== التفاعلات ونظام الرسائل المخفية ================== */
client.on("interactionCreate", async i => {
  if (!i.isButton()) return;
  const game = games.get(i.guild.id);
  if (!game) return;

  // الانضمام والبدء
  if (i.customId === "join") {
    if (game.status !== "waiting") return i.reply({ content: "❌ بدأت اللعبة!", ephemeral: true });
    if (game.players.includes(i.user.id)) return i.reply({ content: "❌ أنت مسجل بالفعل!", ephemeral: true });
    game.players.push(i.user.id);
    return i.reply({ content: `✅ تم انضمامك! (العدد الحالي: ${game.players.length})`, ephemeral: true });
  }

  if (i.customId === "start") {
    if (i.user.id !== game.host) return i.reply({ content: "❌ للمضيف فقط!", ephemeral: true });
    if (game.players.length < 4) return i.reply({ content: "❌ نحتاج 4 لاعبين على الأقل", ephemeral: true });
    game.status = "playing";
    game.alive = [...game.players];
    await i.reply({ content: "🎬 جاري توزيع الأدوار وتجهيز الرومات...", ephemeral: true });
    await assignRolesAndChannels(game, i.guild);
    startGameLoop(game);
    return;
  }

  // معالجة الأكشنات الليلية والتصويت (كلها Ephemeral)
  const [action, targetId] = i.customId.split("_");

  if (["kill", "save", "check"].includes(action)) {
    if (game.nightActions.has(i.user.id)) return i.reply({ content: "❌ قمت باختيارك مسبقاً!", ephemeral: true });
    
    game.nightActions.add(i.user.id);
    if (action === "kill") game.mafiaKill = targetId;
    if (action === "save") game.doctorSave = targetId;
    
    if (action === "check") {
      const isM = game.roles[targetId] === "mafia";
      await i.reply({ content: `🕵️ نتيجة التحقيق: <@${targetId}> هو **${isM ? "مافيا 👺" : "بريء ✅"}**`, ephemeral: true });
    } else {
      await i.reply({ content: "✅ تم تسجيل قرارك السري بنجاح.", ephemeral: true });
    }
    return;
  }

  if (action === "vote") {
    if (game.voted.has(i.user.id)) return i.reply({ content: "❌ صوتّ بالفعل!", ephemeral: true });
    game.voted.add(i.user.id);
    game.votes.set(targetId, (game.votes.get(targetId) || 0) + 1);
    return i.reply({ content: "🗳️ تم تسجيل صوتك بنجاح.", ephemeral: true });
  }
});

/* ================== توزيع الأدوار ================== */
async function assignRolesAndChannels(game, guild) {
  const shuffled = [...game.players].sort(() => Math.random() - 0.5);
  const mafiaCount = Math.max(1, Math.floor(shuffled.length / 4));

  const category = await guild.channels.create({
    name: "LEO-MAFIA-ROOMS",
    type: ChannelType.GuildCategory,
    permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }]
  });
  game.tempChannels.push(category);

  for (let i = 0; i < shuffled.length; i++) {
    const userId = shuffled[i];
    let role = "citizen", roleName = "مواطن", color = COLORS.main;

    if (i < mafiaCount) { role = "mafia"; roleName = "مافيا 👺"; color = COLORS.mafia; }
    else if (i === mafiaCount) { role = "doctor"; roleName = "طبيب 🩺"; color = COLORS.doctor; }
    else if (i === mafiaCount + 1) { role = "police"; roleName = "محقق 🕵️"; color = COLORS.police; }

    game.roles[userId] = role;
    const channel = await guild.channels.create({
      name: `غرفة-${roleName}`,
      parent: category.id,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
      ]
    });
    game.tempChannels.push(channel);
    game.roles[userId + "_channel"] = channel.id;

    await channel.send({ 
      embeds: [new EmbedBuilder().setTitle("بطاقة الدور").setDescription(`أهلاً بك، دورك هو: **${roleName}**`).setColor(color)]
    });
  }
}

/* ================== دورة اللعبة ================== */
async function startGameLoop(game) {
  while (game.status === "playing") {
    // الليل
    await game.channel.send({ embeds: [new EmbedBuilder().setTitle("🌙 سكون الليل").setDescription("تحركوا الآن (الأزرار ظهرت في غرفكم الخاصة)").setColor(COLORS.night)] });
    
    game.nightActions.clear();
    await runNightPhase(game);
    await sleep(25000); 

    if (await resolveNight(game)) break;

    // التصويت
    await game.channel.send({ embeds: [new EmbedBuilder().setTitle("🗳️ ساحة النقاش").setDescription("صوتوا الآن على المشتبه به عبر الزر أدناه.").setColor(COLORS.day)] });
    await runVotePhase(game);
    await sleep(35000);

    if (await resolveVote(game)) break;
  }

  // تنظيف
  setTimeout(async () => {
    for (const ch of game.tempChannels) await ch.delete().catch(() => {});
    games.delete(game.channel.guild.id);
  }, 10000);
}

async function runNightPhase(game) {
  game.mafiaKill = null; game.doctorSave = null;
  for (const id of game.alive) {
    const role = game.roles[id];
    if (role === "citizen") continue;

    const channel = await client.channels.fetch(game.roles[id + "_channel"]);
    let targets = (role === "police") ? game.alive.filter(p => p !== id) : game.alive;
    const rows = createPlayerRows(targets, role === "mafia" ? "kill" : role === "doctor" ? "save" : "check");

    // زر واحد لتفعيل القائمة المخفية
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`show_actions`).setLabel("اتخاذ قرار الليلة").setStyle(ButtonStyle.Primary)
    );

    // ملاحظة: هنا سنرسل الرسالة في الروم، وعندما يضغط اللاعب ستظهر له الأزرار مخفية (بناءً على التعديل في handleActions إذا أردت، أو نرسلها مباشرة)
    await channel.send({ content: "اضغط لاختيار هدفك:", components: rows });
  }
}

async function runVotePhase(game) {
    game.votes.clear(); game.voted.clear();
    const rows = createPlayerRows(game.alive, "vote");
    await game.channel.send({ content: "⬇️ **قائمة التصويت:**", components: rows });
}

// ... بقية دوال Resolve و CheckWinner كما هي (تم التأكد من نظام المافيا)

async function resolveNight(game) {
    let dead = (game.mafiaKill && game.mafiaKill !== game.doctorSave) ? game.mafiaKill : null;
    if (dead) game.alive = game.alive.filter(id => id !== dead);
    await game.channel.send({ embeds: [new EmbedBuilder().setTitle("☀️ شروق الشمس").setDescription(dead ? `💀 قُتل <@${dead}>.` : "✨ مرت الليلة بسلام.").setColor(dead ? COLORS.mafia : COLORS.doctor)] });
    return checkWinner(game);
}

async function resolveVote(game) {
    let topTarget = null, max = 0;
    game.votes.forEach((v, k) => { if (v > max) { max = v; topTarget = k; } });
    if (topTarget) {
      game.alive = game.alive.filter(id => id !== topTarget);
      await game.channel.send({ embeds: [new EmbedBuilder().setTitle("⚖️ الإعدام").setDescription(`تم إقصاء <@${topTarget}> (${game.roles[topTarget] === 'mafia' ? 'مافيا' : 'بريء'}).`).setColor(COLORS.main)] });
    }
    return checkWinner(game);
}

function createPlayerRows(aliveIds, prefix) {
  const rows = [];
  let row = new ActionRowBuilder();
  aliveIds.forEach((id, index) => {
    if (index > 0 && index % 5 === 0) { rows.push(row); row = new ActionRowBuilder(); }
    row.addComponents(new ButtonBuilder().setCustomId(`${prefix}_${id}`).setLabel(`لاعب ${index + 1}`).setStyle(ButtonStyle.Secondary));
  });
  if (row.components.length > 0) rows.push(row);
  return rows;
}

function checkWinner(game) {
  const m = game.alive.filter(id => game.roles[id] === "mafia").length;
  const c = game.alive.length - m;
  if (m === 0) { game.channel.send("🏆 **فاز المواطنون!**"); return true; }
  if (m >= c) { game.channel.send("🏆 **فازت المافيا!**"); return true; }
  return false;
}

client.login(process.env.DISCORD_TOKEN);
