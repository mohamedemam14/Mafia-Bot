import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
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
  night: "#1a1a1a",
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
    lastMessages: [],
    mafiaKill: null,
    doctorSave: null,
    votes: new Map(),
    voted: new Set(),
    nightActions: new Set(),
    channel: msg.channel,
    status: "waiting"
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("join").setLabel("انضمام للجلسة").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("start").setLabel("بدء اللعبة").setStyle(ButtonStyle.Success)
  );

  const embed = new EmbedBuilder()
    .setTitle("🎭 لعبة مافيا Leo")
    .setDescription("اضغط للانضمام. سيتم إرسال الأدوار والخيارات برسائل مخفية لا يراها غيرك.")
    .setColor(COLORS.main);

  const m = await msg.channel.send({ embeds: [embed], components: [row] });
  games.get(msg.guild.id).lastMessages.push(m);
});

/* ================== التفاعلات والرسائل المخفية ================== */
client.on("interactionCreate", async i => {
  if (!i.isButton()) return;
  const game = games.get(i.guild.id);
  if (!game) return;

  if (i.customId === "join") {
    if (game.status !== "waiting") return i.reply({ content: "❌ بدأت اللعبة!", ephemeral: true });
    if (game.players.includes(i.user.id)) return i.reply({ content: "❌ أنت مسجل بالفعل!", ephemeral: true });
    game.players.push(i.user.id);
    return i.reply({ content: `✅ تم انضمامك! العدد: ${game.players.length}`, ephemeral: true });
  }

  if (i.customId === "start") {
    if (i.user.id !== game.host) return i.reply({ content: "❌ للمضيف فقط!", ephemeral: true });
    if (game.players.length < 4) return i.reply({ content: "❌ نحتاج 4 لاعبين على الأقل", ephemeral: true });
    
    game.status = "playing";
    game.alive = [...game.players];
    await assignRoles(game);
    await i.reply({ content: "🎬 بدأت اللعبة! تفقد رسائل الأدوار المخفية.", ephemeral: true });
    startGameLoop(game);
    return;
  }

  // زر فتح قائمة الخيارات الليلية
  if (i.customId === "open_night_menu") {
    const role = game.roles[i.user.id];
    let targets = (role === "police") ? game.alive.filter(p => p !== i.user.id) : game.alive;
    const rows = await createPlayerRows(targets, role === "mafia" ? "kill" : role === "doctor" ? "save" : "check", i.guild);
    
    return i.reply({ content: "⚠️ اختر هدفك (هذه الرسالة مخفية):", components: rows, ephemeral: true });
  }

  const [action, targetId] = i.customId.split("_");

  // معالجة الأكشنات الليلية
  if (["kill", "save", "check"].includes(action)) {
    if (game.nightActions.has(i.user.id)) return i.editReply({ content: "❌ قمت باختيارك مسبقاً!", components: [] });
    
    game.nightActions.add(i.user.id);
    if (action === "kill") game.mafiaKill = targetId;
    if (action === "save") game.doctorSave = targetId;
    
    if (action === "check") {
      const isM = game.roles[targetId] === "mafia";
      const targetUser = client.users.cache.get(targetId);
      await i.update({ content: `🕵️ نتيجة التحقيق: **${targetUser?.username}** هو **${isM ? "عضو مافيا 👺" : "بريء ✅"}**`, components: [] });
    } else {
      await i.update({ content: "✅ تم تسجيل قرارك السري بنجاح.", components: [] });
    }
    return;
  }

  // معالجة التصويت
  if (action === "vote") {
    if (!game.alive.includes(i.user.id)) return i.reply({ content: "💀 الموتى لا يصوتون!", ephemeral: true });
    if (game.voted.has(i.user.id)) return i.reply({ content: "❌ صوتّ بالفعل!", ephemeral: true });
    
    game.voted.add(i.user.id);
    game.votes.set(targetId, (game.votes.get(targetId) || 0) + 1);
    return i.reply({ content: "🗳️ تم تسجيل صوتك.", ephemeral: true });
  }
});

/* ================== توزيع الأدوار ================== */
async function assignRoles(game) {
  const shuffled = [...game.players].sort(() => Math.random() - 0.5);
  const mafiaCount = Math.max(1, Math.floor(shuffled.length / 4));

  for (let i = 0; i < shuffled.length; i++) {
    const userId = shuffled[i];
    let role = "citizen", roleName = "مواطن 👤", color = COLORS.main;

    if (i < mafiaCount) { role = "mafia"; roleName = "مافيا 👺"; color = COLORS.mafia; }
    else if (i === mafiaCount) { role = "doctor"; roleName = "طبيب 🩺"; color = COLORS.doctor; }
    else if (i === mafiaCount + 1) { role = "police"; roleName = "محقق 🕵️"; color = COLORS.police; }

    game.roles[userId] = role;
    
    // إرسال الدور برسالة مخفية (عبر التفاعل الأول أو برسالة خاصة إذا لزم الأمر)
    // هنا سنكتفي بأن اللعبة بدأت والكل سيعرف دوره عبر زر "خياراتي"
  }
}

/* ================== دورة اللعبة ================== */
async function startGameLoop(game) {
  while (game.status === "playing") {
    await cleanMessages(game);

    // الليل
    const nEmbed = new EmbedBuilder()
        .setTitle("🌙 مدينة Leo في ظلام")
        .setDescription("أصحاب الأدوار (مافيا، طبيب، محقق) اضغطوا على الزر أدناه.")
        .setColor(COLORS.night);
    const nRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("open_night_menu").setLabel("خيارات دوري").setStyle(ButtonStyle.Secondary)
    );
    game.lastMessages.push(await game.channel.send({ embeds: [nEmbed], components: [nRow] }));

    game.nightActions.clear();
    await sleep(25000); 

    if (await resolveNight(game)) break;
    await sleep(5000);
    await cleanMessages(game);

    // التصويت
    const vEmbed = new EmbedBuilder()
        .setTitle("🗳️ ساحة القضاء")
        .setDescription("صوتوا الآن على المشتبه به عبر الأزرار.")
        .setColor(COLORS.day);
    const vRows = await createPlayerRows(game.alive, "vote", game.channel.guild);
    game.lastMessages.push(await game.channel.send({ embeds: [vEmbed], components: vRows }));

    game.voted.clear(); game.votes.clear();
    await sleep(35000);

    if (await resolveVote(game)) break;
    await sleep(5000);
  }
  games.delete(game.channel.guild.id);
}

/* ================== الوظائف المساعدة ================== */
async function cleanMessages(game) {
  for (const m of game.lastMessages) await m.delete().catch(() => {});
  game.lastMessages = [];
}

async function resolveNight(game) {
    let dead = (game.mafiaKill && game.mafiaKill !== game.doctorSave) ? game.mafiaKill : null;
    if (dead) game.alive = game.alive.filter(id => id !== dead);
    const res = await game.channel.send({ embeds: [new EmbedBuilder().setTitle("☀️ شروق الشمس").setDescription(dead ? `💀 قُتل <@${dead}>.` : "✨ مرت ليلة هادئة.").setColor(dead ? COLORS.mafia : COLORS.doctor)] });
    game.lastMessages.push(res);
    return checkWinner(game);
}

async function resolveVote(game) {
    let topTarget = null, max = 0;
    game.votes.forEach((v, k) => { if (v > max) { max = v; topTarget = k; } });
    if (topTarget) {
      game.alive = game.alive.filter(id => id !== topTarget);
      const res = await game.channel.send({ embeds: [new EmbedBuilder().setTitle("⚖️ الإعدام").setDescription(`تم إقصاء <@${topTarget}>.\nوكان دوره: **${game.roles[topTarget]}**`)] });
      game.lastMessages.push(res);
    }
    return checkWinner(game);
}

async function createPlayerRows(ids, prefix, guild) {
  const rows = [];
  let row = new ActionRowBuilder();
  for (let i = 0; i < ids.length; i++) {
    const member = await guild.members.fetch(ids[i]).catch(() => null);
    if (i > 0 && i % 5 === 0) { rows.push(row); row = new ActionRowBuilder(); }
    row.addComponents(new ButtonBuilder().setCustomId(`${prefix}_${ids[i]}`).setLabel(member?.user.username || "لاعب").setStyle(ButtonStyle.Secondary));
  }
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
