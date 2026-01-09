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
  citizen: "#bd93f9",
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
    nightActions: new Set(), // لتتبع من اتخذ قراره في الليل
    channel: msg.channel,
    status: "waiting"
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("join").setLabel("انضمام للجلسة").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("start").setLabel("إطلاق اللعبة").setStyle(ButtonStyle.Success)
  );

  const embed = new EmbedBuilder()
    .setAuthor({ name: "LEO MAFIA SYSTEM", iconURL: client.user.displayAvatarURL() })
    .setTitle("🎭 جلسة مافيا جديدة")
    .setDescription("مرحباً بكم في نظام ليو المتطور. اضغط على الزر أدناه للمشاركة.")
    .setColor(COLORS.main);

  msg.channel.send({ embeds: [embed], components: [row] });
});

/* ================== التفاعلات والتحكم بالقرارات ================== */
client.on("interactionCreate", async i => {
  if (!i.isButton()) return;
  const game = games.get(i.guild.id);
  if (!game) return;

  if (i.customId === "join") {
    if (game.status !== "waiting") return i.reply({ content: "❌ بدأت اللعبة!", ephemeral: true });
    if (game.players.includes(i.user.id)) return i.reply({ content: "❌ أنت مسجل بالفعل!", ephemeral: true });
    game.players.push(i.user.id);
    return i.reply({ content: `✅ تم انضمامك! العدد الآن: ${game.players.length}`, ephemeral: true });
  }

  if (i.customId === "start") {
    if (i.user.id !== game.host) return i.reply({ content: "❌ للمضيف فقط!", ephemeral: true });
    if (game.players.length < 4) return i.reply({ content: "❌ نحتاج 4 لاعبين على الأقل", ephemeral: true });
    game.status = "playing";
    game.alive = [...game.players];
    await i.reply({ content: "⚙️ جاري توزيع الأدوار...", ephemeral: true });
    await assignRolesAndChannels(game, i.guild);
    startGameLoop(game);
    return;
  }

  // معالجة الأكشنات (قتل، حماية، تحقيق، تصويت)
  handleActions(i, game);
});

/* ================== توزيع الأدوار ================== */
async function assignRolesAndChannels(game, guild) {
  const shuffled = [...game.players].sort(() => Math.random() - 0.5);
  const mafiaCount = Math.max(1, Math.floor(shuffled.length / 4));

  const category = await guild.channels.create({
    name: "LEO-MAFIA-GAME",
    type: ChannelType.GuildCategory,
    permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.ViewChannel] }]
  });
  game.tempChannels.push(category);

  for (let i = 0; i < shuffled.length; i++) {
    let role = "citizen", roleName = "مواطن بريء", color = COLORS.citizen;
    if (i < mafiaCount) { role = "mafia"; roleName = "مافيا 👺"; color = COLORS.mafia; }
    else if (i === mafiaCount) { role = "doctor"; roleName = "طبيب المدينة 🩺"; color = COLORS.doctor; }
    else if (i === mafiaCount + 1) { role = "police"; roleName = "المحقق 🕵️"; color = COLORS.police; }

    const userId = shuffled[i];
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
      embeds: [new EmbedBuilder()
        .setTitle("بطاقة التعريف")
        .setDescription(`دورك: **${roleName}**`)
        .setColor(color)
        .setFooter({ text: "نظام ليو للرومات الخاصة" })]
    });
  }
}

/* ================== دورة اللعبة ================== */
async function startGameLoop(game) {
  while (game.status === "playing") {
    game.nightActions.clear();
    await game.channel.send({ embeds: [new EmbedBuilder().setTitle("🌙 بدأ الليل").setDescription("انتظروا انتهاء أصحاب الأدوار من قراراتهم...").setColor(COLORS.night)] });

    await runNightPhase(game);
    await sleep(25000); 

    if (await resolveNight(game)) break;

    await game.channel.send({ embeds: [new EmbedBuilder().setTitle("☀️ بدأ التصويت الصباحي").setDescription("تشاوروا جيداً قبل اتخاذ القرار.").setColor(COLORS.day)] });
    await runVotePhase(game);
    await sleep(35000);

    if (await resolveVote(game)) break;
  }

  setTimeout(async () => {
    for (const channel of game.tempChannels) await channel.delete().catch(() => {});
  }, 10000);
}

async function runNightPhase(game) {
  game.mafiaKill = null; game.doctorSave = null;

  for (const id of game.alive) {
    const channelId = game.roles[id + "_channel"];
    const channel = await client.channels.fetch(channelId);
    const role = game.roles[id];

    // فلترة الأزرار: المافيا والطبيب يرون الجميع، المحقق يرى الجميع عدا نفسه
    let targets = (role === "police") ? game.alive.filter(pid => pid !== id) : game.alive;
    const rows = createPlayerRows(targets, role === "mafia" ? "kill" : role === "doctor" ? "save" : "check");

    if (role !== "citizen") {
      await channel.send({ 
        content: `**أمامك فرصة واحدة فقط الليلة للاختيار:**`,
        components: rows 
      });
    }
  }
}

async function handleActions(i, game) {
  const [action, targetId] = i.customId.split("_");
  
  // نظام المنع من التكرار في الليل
  if (["kill", "save", "check"].includes(action)) {
    if (game.nightActions.has(i.user.id)) return i.reply({ content: "❌ لقد اتخذت قرارك مسبقاً لهذه الليلة!", ephemeral: true });
    
    game.nightActions.add(i.user.id);
    if (action === "kill") game.mafiaKill = targetId;
    if (action === "save") game.doctorSave = targetId;
    if (action === "check") {
      const isM = game.roles[targetId] === "mafia";
      await i.reply({ content: `🕵️ نتيجة التحقيق: <@${targetId}> هو **${isM ? "مافيا 👺" : "بريء ✅"}**`, ephemeral: true });
    } else {
      await i.reply({ content: "✅ تم تسجيل قرارك بنجاح.", ephemeral: true });
    }
    // حذف الأزرار بعد الاختيار الأول
    return i.message.edit({ components: [] });
  }

  // نظام التصويت العام
  if (action === "vote") {
    if (game.voted.has(i.user.id)) return i.reply({ content: "لقد صوتّ بالفعل!", ephemeral: true });
    game.voted.add(i.user.id);
    game.votes.set(targetId, (game.votes.get(targetId) || 0) + 1);
    await i.reply({ content: "✅ تم تسجيل صوتك.", ephemeral: true });
    return i.message.edit({ components: [] }); // حذف الأزرار من عند الشخص الذي صوت
  }
}

/* ================== الأدوات المساعدة ================== */
async function resolveNight(game) {
    let dead = (game.mafiaKill && game.mafiaKill !== game.doctorSave) ? game.mafiaKill : null;
    if (dead) game.alive = game.alive.filter(id => id !== dead);
    await game.channel.send({ embeds: [new EmbedBuilder().setTitle("☀️ إشراقة جديدة").setDescription(dead ? `💀 تم العثور على جثة <@${dead}>.` : "✨ مرت الليلة بسلام دون وقوع ضحايا.").setColor(dead ? COLORS.mafia : COLORS.doctor)] });
    return checkWinner(game);
}

async function runVotePhase(game) {
    game.votes.clear(); game.voted.clear();
    const rows = createPlayerRows(game.alive, "vote");
    await game.channel.send({ content: "⚙️ **قائمة الأحياء للتصويت:**", components: rows });
}

async function resolveVote(game) {
    let topTarget = null, max = 0;
    game.votes.forEach((v, k) => { if (v > max) { max = v; topTarget = k; } });
    if (topTarget) {
      game.alive = game.alive.filter(id => id !== topTarget);
      await game.channel.send({ embeds: [new EmbedBuilder().setTitle("⚖️ الحكم النهائي").setDescription(`تقرر إعدام <@${topTarget}>.\nوكان دوره: **${game.roles[topTarget] === 'mafia' ? 'مافيا 👺' : 'مواطن بريء 👤'}**`).setColor(COLORS.main)] });
    } else {
      await game.channel.send("🤝 لم يتم الإجماع على أحد، الكل ينجو اليوم.");
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
  if (m === 0) { game.channel.send("🏆 **فاز المواطنون!**"); games.delete(game.channel.guild.id); return true; }
  if (m >= c) { game.channel.send("🏆 **فازت المافيا!**"); games.delete(game.channel.guild.id); return true; }
  return false;
}

client.login(process.env.DISCORD_TOKEN);
