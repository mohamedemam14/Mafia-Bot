import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ComponentType
} from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

/* ================== إعدادات Leo الخاصة ================== */
const IMAGES = {
  night: "https://i.ibb.co/YyYfD1h/night-phase.png", 
  day: "https://i.ibb.co/L8f8VvD/day-phase.png",
  vote: "https://i.ibb.co/6R2M3nS/vote-phase.png",
  mafia: "رابط_صورة_المافيا_المستطيلة", // ضع الروابط التي صممتها هنا
  doctor: "رابط_صورة_الطبيب_المستطيلة",
  police: "رابط_صورة_الشرطي_المستطيلة",
  citizen: "رابط_صورة_المواطن_المستطيلة"
};

const games = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ================== بدء اللعبة ================== */
client.on("messageCreate", async msg => {
  if (msg.content !== "!mafia" || msg.author.bot) return;
  if (games.has(msg.guild.id)) return msg.reply("❌ هناك لعبة Leo جارية بالفعل!");

  games.set(msg.guild.id, {
    host: msg.author.id,
    players: [],
    alive: [],
    roles: {},
    mafiaKill: null,
    doctorSave: null,
    votes: new Map(),
    voted: new Set(),
    channel: msg.channel,
    status: "waiting"
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("join").setLabel("➕ انضمام").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("start").setLabel("▶️ بدء اللعبة").setStyle(ButtonStyle.Primary)
  );

  const embed = new EmbedBuilder()
    .setTitle("🎭 لعبة مافيا Leo")
    .setDescription(`أهلاً بكم في نسخة Leo الخاصة!\n\n**المضيف:** <@${msg.author.id}>\n**الحالة:** في انتظار اللاعبين...\n\nاضغط على الزر بالأسفل للانضمام!`)
    .setColor("#1a1a1a")
    .setFooter({ text: "Game By: Leo" });

  msg.channel.send({ embeds: [embed], components: [row] });
});

/* ================== معالجة الأزرار والتفاعلات ================== */
client.on("interactionCreate", async i => {
  if (!i.isButton()) return;
  const game = games.get(i.guild.id);
  if (!game) return;

  // 1. نظام الانضمام
  if (i.customId === "join") {
    if (game.status !== "waiting") return i.reply({ content: "❌ بدأت اللعبة!", ephemeral: true });
    if (game.players.includes(i.user.id)) return i.reply({ content: "❌ أنت في القائمة!", ephemeral: true });
    game.players.push(i.user.id);
    return i.reply({ content: `✅ تم انضمامك! عدد اللاعبين الآن: ${game.players.length}`, ephemeral: true });
  }

  // 2. نظام البدء (للمضيف Leo فقط)
  if (i.customId === "start") {
    if (i.user.id !== game.host) return i.reply({ content: "❌ المضيف Leo فقط هو من يبدأ!", ephemeral: true });
    if (game.players.length < 4) return i.reply({ content: "❌ نحتاج 4 لاعبين على الأقل للبدء", ephemeral: true });

    game.status = "playing";
    game.alive = [...game.players];
    
    assignDynamicRoles(game); // توزيع الأدوار حسب العدد
    
    await i.reply("🎬 تم توزيع الأدوار! تفقدوا رسائلكم الخاصة.");
    startGameLoop(game);
  }

  // 3. نظام منع الموتى وحماية القرارات
  if (!game.alive.includes(i.user.id) && game.status === "playing") {
    return i.reply({ content: "💀 الموتى لا يتكلمون! انتظر انتهاء اللعبة.", ephemeral: true });
  }

  handleActions(i, game);
});

/* ================== توزيع الأدوار ديناميكياً ================== */
function assignDynamicRoles(game) {
  const count = game.players.length;
  const shuffled = [...game.players].sort(() => Math.random() - 0.5);

  // معادلة التوازن: مافيا واحد لكل 4 لاعبين
  const mafiaCount = Math.max(1, Math.floor(count / 4));
  const doctorCount = 1;
  const policeCount = 1;

  for (let i = 0; i < shuffled.length; i++) {
    let role = "citizen";
    if (i < mafiaCount) role = "mafia";
    else if (i < mafiaCount + doctorCount) role = "doctor";
    else if (i < mafiaCount + doctorCount + policeCount) role = "police";
    
    game.roles[shuffled[i]] = role;
    sendRoleCard(shuffled[i], role);
  }
}

async function sendRoleCard(userId, role) {
  const user = await client.users.fetch(userId);
  const names = { mafia: "المافيا 👺", doctor: "الطبيب 🩺", police: "الشرطي 🕵️", citizen: "مواطن 👤" };
  const colors = { mafia: "#8B0000", doctor: "#006400", police: "#00008B", citizen: "#555555" };

  const embed = new EmbedBuilder()
    .setTitle(`بطاقة دورك: ${names[role]}`)
    .setDescription(`أهلاً بك في لعبة Leo. حافظ على سرية دورك للفوز!`)
    .setImage(IMAGES[role]) // هنا تظهر صورتك المستطيلة
    .setColor(colors[role])
    .setFooter({ text: "Leo Mafia Game • السرية هي مفتاح الفوز" });

  user.send({ embeds: [embed] }).catch(() => console.log(`Cannot DM ${userId}`));
}

/* ================== دورة اللعبة التلقائية ================== */
async function startGameLoop(game) {
  while (game.status === "playing") {
    // ليل
    await runNightPhase(game);
    await sleep(25000); 

    // صباح
    const won = await resolveNight(game);
    if (won) break;

    // تصويت
    await runVotePhase(game);
    await sleep(35000);

    // نتيجة تصويت
    const wonAfterVote = await resolveVote(game);
    if (wonAfterVote) break;
  }
}

/* ================== مراحل الليل والتصويت ================== */
async function runNightPhase(game) {
  game.mafiaKill = null; game.doctorSave = null;
  
  const embed = new EmbedBuilder()
    .setTitle("🌙 مدينة Leo في ظلام..")
    .setDescription("استخدم الأزرار في رسائلك الخاصة لتنفيذ دورك.")
    .setImage(IMAGES.night).setColor("#000000");

  await game.channel.send({ embeds: [embed] });

  const rows = createPlayerRows(game.alive, "target");

  for (const id of game.alive) {
    const user = await client.users.fetch(id);
    const role = game.roles[id];
    if (role === "mafia") user.send({ content: "🗡️ اختر من تريد تصفيته:", components: modifyRows(rows, "kill") });
    if (role === "doctor") user.send({ content: "🩺 من تريد حمايته الليلة؟", components: modifyRows(rows, "save") });
    if (role === "police") user.send({ content: "🕵️ اختر لاعباً للتحقيق معه:", components: modifyRows(rows, "check") });
  }
}

async function resolveNight(game) {
  let dead = null;
  if (game.mafiaKill && game.mafiaKill !== game.doctorSave) {
    dead = game.mafiaKill;
    game.alive = game.alive.filter(id => id !== dead);
  }

  const embed = new EmbedBuilder()
    .setTitle("☀️ أشرقت الشمس في مدينة Leo")
    .setDescription(dead ? `💀 استيقظنا على خبر حزين.. قُتل اللاعب <@${dead}>` : "✨ ليلة هادئة.. لم نفقد أحداً الليلة!")
    .setImage(IMAGES.day).setColor("#FFD700");

  await game.channel.send({ embeds: [embed] });
  return checkWinner(game);
}

async function runVotePhase(game) {
  game.votes.clear(); game.voted.clear();
  
  const embed = new EmbedBuilder()
    .setTitle("🗳️ ساحة القضاء")
    .setDescription("صوتوا الآن على من تظنون أنه المافيا!")
    .setImage(IMAGES.vote).setColor("#800000");

  const rows = createPlayerRows(game.alive, "vote");
  await game.channel.send({ embeds: [embed], components: rows });
}

async function resolveVote(game) {
  let topTarget = null, max = 0;
  game.votes.forEach((v, k) => { if (v > max) { max = v; topTarget = k; } });

  if (topTarget) {
    game.alive = game.alive.filter(id => id !== topTarget);
    const role = game.roles[topTarget];
    await game.channel.send(`⚖️ بقرار الشعب، نُفذ الإعدام بـ <@${topTarget}>.. وكان دوره: **${role === 'mafia' ? 'مافيا 👺' : 'بريء 👤'}**`);
  } else {
    await game.channel.send("🤝 تعادلت الأصوات.. لم يتم إعدام أحد.");
  }
  return checkWinner(game);
}

/* ================== أدوات مساعدة للأزرار والفوز ================== */
function handleActions(i, game) {
  const [action, targetId] = i.customId.split("_");
  
  if (action === "vote") {
    if (game.voted.has(i.user.id)) return i.reply({ content: "❌ صوتّ مسبقاً!", ephemeral: true });
    game.voted.add(i.user.id);
    game.votes.set(targetId, (game.votes.get(targetId) || 0) + 1);
    return i.reply({ content: "🗳️ تم تسجيل صوتك.", ephemeral: true });
  }

  if (action === "kill") game.mafiaKill = targetId;
  if (action === "save") game.doctorSave = targetId;
  if (action === "check") {
    const isM = game.roles[targetId] === "mafia";
    i.user.send(`🕵️ نتيجة التحقيق مع <@${targetId}>: **${isM ? "مافيا 👺" : "بريء ✅"}**`);
  }
  
  if (["kill", "save", "check"].includes(action)) {
    i.update({ content: "✅ تم تسجيل قرارك.", components: [] });
  }
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

function modifyRows(rows, newPrefix) {
  return rows.map(r => new ActionRowBuilder().addComponents(r.components.map(b => ButtonBuilder.from(b).setCustomId(b.data.custom_id.replace("target", newPrefix)))));
}

function checkWinner(game) {
  const m = game.alive.filter(id => game.roles[id] === "mafia").length;
  const c = game.alive.length - m;

  if (m === 0) {
    game.channel.send("🏆 **انتصار المواطنين!** تم تنظيف مدينة Leo من المافيا.");
    games.delete(game.channel.guild.id); return true;
  }
  if (m >= c) {
    game.channel.send("🏆 **انتصار المافيا!** سيطرت المافيا على مدينة Leo بالكامل.");
    games.delete(game.channel.guild.id); return true;
  }
  return false;
}

client.login(process.env.DISCORD_TOKEN);
