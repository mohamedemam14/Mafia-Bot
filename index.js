import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Partials
} from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel] // لاستقبال رسائل الخاص
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
    .setTitle("🎭 نظام مافيا Leo المتكامل")
    .setDescription("اضغط للانضمام. سيتم إخفاء جميع تحركاتك الليلية وتصويتك عن الآخرين.")
    .setColor(COLORS.main)
    .setFooter({ text: "تأكد من فتح رسائل الخاص لاستلام دورك" });

  const m = await msg.channel.send({ embeds: [embed], components: [row] });
  games.get(msg.guild.id).lastMessages.push(m);
});

/* ================== التفاعلات والمنطق الأساسي ================== */
client.on("interactionCreate", async i => {
  if (!i.isButton()) return;
  const game = games.get(i.guild.id);
  if (!game) return;

  // 1. الانضمام
  if (i.customId === "join") {
    if (game.status !== "waiting") return i.reply({ content: "❌ اللعبة بدأت بالفعل.", ephemeral: true });
    if (game.players.includes(i.user.id)) return i.reply({ content: "❌ أنت مسجل مسبقاً.", ephemeral: true });
    game.players.push(i.user.id);
    return i.reply({ content: `✅ سجلت بنجاح. العدد الحالي: ${game.players.length}`, ephemeral: true });
  }

  // 2. البدء (للمضيف فقط)
  if (i.customId === "start") {
    if (i.user.id !== game.host) return i.reply({ content: "❌ للمضيف فقط!", ephemeral: true });
    if (game.players.length < 4) return i.reply({ content: "❌ نحتاج 4 لاعبين على الأقل للبدء.", ephemeral: true });
    
    game.status = "playing";
    game.alive = [...game.players];
    await i.reply({ content: "🎬 جاري توزيع الأدوار.. تفقد رسائل الخاص.", ephemeral: true });
    await assignRolesAndNotify(game);
    startGameLoop(game);
    return;
  }

  // 3. فتح قائمة الليل (مخفية)
  if (i.customId === "open_night_menu") {
    const role = game.roles[i.user.id];
    if (role === "citizen") return i.reply({ content: "👤 أنت مواطن بريء، انتظر الصباح بهدوء.", ephemeral: true });
    
    let targets = (role === "police") ? game.alive.filter(p => p !== i.user.id) : game.alive;
    const rows = await createPlayerRows(targets, role === "mafia" ? "kill" : role === "doctor" ? "save" : "check", i.guild);
    
    return i.reply({ content: "🕹️ قائمة أهدافك لهذه الليلة:", components: rows, ephemeral: true });
  }

  // 4. معالجة الأكشنات (الليلية والتصويت)
  const [action, targetId] = i.customId.split("_");

  if (["kill", "save", "check"].includes(action)) {
    if (game.nightActions.has(i.user.id)) return i.reply({ content: "❌ اخترت مسبقاً!", ephemeral: true });
    game.nightActions.add(i.user.id);

    if (action === "kill") game.mafiaKill = targetId;
    if (action === "save") game.doctorSave = targetId;
    
    if (action === "check") {
      const isM = game.roles[targetId] === "mafia";
      const targetUser = await client.users.fetch(targetId).catch(() => null);
      await i.update({ content: `🕵️ المحقق: اللاعب **${targetUser?.username}** هو **${isM ? "عضو مافيا 👺" : "مواطن بريء ✅"}**`, components: [] });
    } else {
      await i.update({ content: "✅ تم تسجيل قرارك السري.", components: [] });
    }
    return;
  }

  if (action === "vote") {
    if (!game.alive.includes(i.user.id)) return i.reply({ content: "💀 الموتى لا يصوتون.", ephemeral: true });
    if (game.voted.has(i.user.id)) return i.reply({ content: "❌ صوتّ بالفعل.", ephemeral: true });
    
    game.voted.add(i.user.id);
    game.votes.set(targetId, (game.votes.get(targetId) || 0) + 1);
    return i.reply({ content: `🗳️ تم تسجيل صوتك بنجاح.`, ephemeral: true });
  }
});

/* ================== الوظائف الفنية ================== */

async function assignRolesAndNotify(game) {
  const shuffled = [...game.players].sort(() => Math.random() - 0.5);
  const mafiaCount = Math.max(1, Math.floor(shuffled.length / 4));

  for (let i = 0; i < shuffled.length; i++) {
    const userId = shuffled[i];
    let role = "citizen", roleName = "مواطن 👤", color = COLORS.main;

    if (i < mafiaCount) { role = "mafia"; roleName = "مافيا 👺"; color = COLORS.mafia; }
    else if (i === mafiaCount) { role = "doctor"; roleName = "طبيب 🩺"; color = COLORS.doctor; }
    else if (i === mafiaCount + 1) { role = "police"; roleName = "محقق 🕵️"; color = COLORS.police; }

    game.roles[userId] = role;
    const user = await client.users.fetch(userId).catch(() => null);
    if (user) {
      const embed = new EmbedBuilder()
        .setTitle("🎭 بطاقة دورك السرية")
        .setDescription(`لقد تم تعيينك كـ: **${roleName}**`)
        .setColor(color)
        .addFields({ name: "مهمتك", value: getMission(role) });
      await user.send({ embeds: [embed] }).catch(() => {});
    }
  }
}

function getMission(role) {
  if (role === "mafia") return "اقتل المواطنين دون أن تكتشف.";
  if (role === "doctor") return "حاول حماية ضحية المافيا كل ليلة.";
  if (role === "police") return "تحقق من هوية لاعب كل ليلة.";
  return "حاول البقاء وكشف المافيا في النهار.";
}

async function startGameLoop(game) {
  while (game.status === "playing") {
    await cleanMessages(game);

    // مرحلة الليل
    const nEmbed = new EmbedBuilder().setTitle("🌙 ليل المدينة").setDescription("الهدوء يعم المكان.. أصحاب الأدوار يستخدمون الزر لاتخاذ القرار.").setColor(COLORS.night);
    const nRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("open_night_menu").setLabel("خيارات دوري السري").setStyle(ButtonStyle.Secondary));
    game.lastMessages.push(await game.channel.send({ embeds: [nEmbed], components: [nRow] }));

    game.nightActions.clear();
    await sleep(30000); // 30 ثانية لليل

    if (await resolveNight(game)) break;
    await sleep(5000);
    await cleanMessages(game);

    // مرحلة التصويت
    const vRows = await createPlayerRows(game.alive, "vote", game.channel.guild);
    const vEmbed = new EmbedBuilder().setTitle("🗳️ التصويت الصباحي").setDescription("صوتوا الآن على من تظنون أنه المافيا.").setColor(COLORS.day);
    game.lastMessages.push(await game.channel.send({ embeds: [vEmbed], components: vRows }));

    game.voted.clear(); game.votes.clear();
    await sleep(40000); // 40 ثانية للتصويت

    if (await resolveVote(game)) break;
    await sleep(5000);
  }
  games.delete(game.channel.guild.id);
}

async function resolveNight(game) {
  let dead = (game.mafiaKill && game.mafiaKill !== game.doctorSave) ? game.mafiaKill : null;
  if (dead) game.alive = game.alive.filter(id => id !== dead);
  
  const embed = new EmbedBuilder()
    .setTitle("☀️ شروق الشمس")
    .setDescription(dead ? `💀 استيقظت المدينة على جثة <@${dead}>.` : "✨ مرت ليلة هادئة ولم يسقط ضحايا.")
    .setColor(dead ? COLORS.mafia : COLORS.doctor);
  
  const m = await game.channel.send({ embeds: [embed] });
  game.lastMessages.push(m);
  return checkWinner(game);
}

async function resolveVote(game) {
  let top = null, max = 0;
  game.votes.forEach((v, k) => { if (v > max) { max = v; top = k; } });

  if (top) {
    game.alive = game.alive.filter(id => id !== top);
    const role = game.roles[top];
    const embed = new EmbedBuilder()
      .setTitle("⚖️ حبال المشنقة")
      .setDescription(`تقرر إعدام <@${top}>.\nوتبين أنه كان: **${role === 'mafia' ? 'مافيا 👺' : 'مواطن بريء 👤'}**`)
      .setColor(COLORS.main);
    const m = await game.channel.send({ embeds: [embed] });
    game.lastMessages.push(m);
  } else {
    game.lastMessages.push(await game.channel.send("🤝 لم يتفق أحد.. تم إلغاء الإعدام اليوم."));
  }
  return checkWinner(game);
}

async function createPlayerRows(ids, prefix, guild) {
  const rows = [];
  let row = new ActionRowBuilder();
  for (let i = 0; i < ids.length; i++) {
    const member = await guild.members.fetch(ids[i]).catch(() => null);
    const label = member?.user.username || "لاعب غائب";
    if (i > 0 && i % 5 === 0) { rows.push(row); row = new ActionRowBuilder(); }
    row.addComponents(new ButtonBuilder().setCustomId(`${prefix}_${ids[i]}`).setLabel(label).setStyle(ButtonStyle.Secondary));
  }
  if (row.components.length > 0) rows.push(row);
  return rows;
}

async function cleanMessages(game) {
  for (const m of game.lastMessages) await m.delete().catch(() => {});
  game.lastMessages = [];
}

function checkWinner(game) {
  const m = game.alive.filter(id => game.roles[id] === "mafia").length;
  const c = game.alive.length - m;

  if (m === 0) {
    game.channel.send({ embeds: [new EmbedBuilder().setTitle("🏆 فوز ساحق").setDescription("تم القضاء على جميع أفراد المافيا!").setColor(COLORS.doctor)] });
    return true;
  }
  if (m >= c) {
    game.channel.send({ embeds: [new EmbedBuilder().setTitle("🏆 سيطرة كاملة").setDescription("المافيا تسيطر على المدينة!").setColor(COLORS.mafia)] });
    return true;
  }
  return false;
}

client.login(process.env.DISCORD_TOKEN);
