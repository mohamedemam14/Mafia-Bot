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
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

const games = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ثيم الألوان والصور الحماسية
const THEME = {
  main: "#2b2d31",
  mafia: "#992d22", // أحمر غامق
  doctor: "#2ecc71", // أخضر زاهي
  police: "#3498db", // أزرق
  night: "#000000",
  day: "#f1c40f",
  win_mafia_img: "https://i.imgur.com/83pL6v6.png", // صورة فوز المافيا
  win_citizens_img: "https://i.imgur.com/kS9Yp9v.png" // صورة فوز المواطنين
};

/* ================== بدء اللعبة ================== */
client.on("messageCreate", async msg => {
  if (msg.content !== "!mafia" || msg.author.bot) return;
  if (games.has(msg.guild.id)) return msg.reply("⚠️ هناك جولة دموية جارية بالفعل، انتظر نهايتها!");

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
    new ButtonBuilder().setCustomId("join").setLabel("دخول المعركة").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("start").setLabel("إعلان الحرب").setStyle(ButtonStyle.Success)
  );

  const embed = new EmbedBuilder()
    .setTitle("🎭 صراع البقاء: مدينة المافيا")
    .setDescription("الخطر يحدق بالمدينة.. هل أنت خائن أم منقذ؟\n\nاضغط على الزر أدناه لتسجيل اسمك في قائمة المشتبه بهم.")
    .setImage("https://i.imgur.com/6Xy1Fk8.png") // صورة غلاف حماسية
    .setColor(THEME.main)
    .setFooter({ text: "Leo Mafia System | القتل يبدأ قريباً" });

  const m = await msg.channel.send({ embeds: [embed], components: [row] });
  games.get(msg.guild.id).lastMessages.push(m);
});

/* ================== التفاعلات والمنطق ================== */
client.on("interactionCreate", async i => {
  if (!i.isButton()) return;
  const game = games.get(i.guild.id);
  if (!game) return;

  if (i.customId === "join") {
    if (game.status !== "waiting") return i.reply({ content: "❌ فاتك القطار، اللعبة بدأت!", ephemeral: true });
    if (game.players.includes(i.user.id)) return i.reply({ content: "❌ أنت مسجل بالفعل، استعد!", ephemeral: true });
    game.players.push(i.user.id);
    return i.reply({ content: `🔥 انضممت للملحمة! عدد الضحايا المحتملين حتى الآن: ${game.players.length}`, ephemeral: true });
  }

  if (i.customId === "start") {
    if (i.user.id !== game.host) return i.reply({ content: "❌ المضيف فقط من يملك مفتاح البداية!", ephemeral: true });
    if (game.players.length < 4) return i.reply({ content: "❌ لن تبدأ الحرب بـ أقل من 4 مقاتلين!", ephemeral: true });
    
    game.status = "playing";
    game.alive = [...game.players];
    await i.reply({ content: "💀 جاري توزيع الأدوار السرية.. استعد للغدر!", ephemeral: true });
    await assignRolesAndNotify(game);
    startGameLoop(game);
    return;
  }

  if (i.customId === "open_night_menu") {
    const role = game.roles[i.user.id];
    if (role === "citizen") return i.reply({ content: "🤫 المواطنون ينامون الآن.. انتظر مصيرك في الصباح.", ephemeral: true });
    let targets = (role === "police") ? game.alive.filter(p => p !== i.user.id) : game.alive;
    const rows = await createPlayerRows(targets, role === "mafia" ? "kill" : role === "doctor" ? "save" : "check", i.guild);
    return i.reply({ content: "⚔️ نفذ مهمتك السرية الآن:", components: rows, ephemeral: true });
  }

  handleActions(i, game);
});

/* ================== توزيع الأدوار ================== */
async function assignRolesAndNotify(game) {
  const shuffled = [...game.players].sort(() => Math.random() - 0.5);
  const mafiaCount = Math.max(1, Math.floor(shuffled.length / 4));

  for (let i = 0; i < shuffled.length; i++) {
    const userId = shuffled[i];
    let role = "citizen", roleName = "مواطن 👤", color = THEME.main, mission = "ابقَ حياً وحاول كشف الخونة.";
    
    if (i < mafiaCount) { role = "mafia"; roleName = "مافيا 👺"; color = THEME.mafia; mission = "اقتل الجميع بدم بارد ولا تترك أثراً."; }
    else if (i === mafiaCount) { role = "doctor"; roleName = "طبيب 🩺"; color = THEME.doctor; mission = "أنقذ الأبرياء من مخالب المافيا."; }
    else if (i === mafiaCount + 1) { role = "police"; roleName = "محقق 🕵️"; color = THEME.police; mission = "حلل الأدلة واكشف هوية الخونة."; }

    game.roles[userId] = role;
    const user = await client.users.fetch(userId);
    const dmEmbed = new EmbedBuilder()
      .setTitle(`🃏 هويتك السرية: ${roleName}`)
      .setDescription(`مهمتك: **${mission}**`)
      .setColor(color)
      .setFooter({ text: "سرّك في بئر.. لا تخبر أحداً!" });
    await user.send({ embeds: [dmEmbed] }).catch(() => {});
  }
}

/* ================== دورة اللعبة الحماسية ================== */
async function startGameLoop(game) {
  while (game.status === "playing") {
    await cleanMessages(game);

    // مرحلة الليل
    const nEmbed = new EmbedBuilder()
        .setTitle("🌙 حلول الظلام")
        .setDescription("المدينة مغطاة بالدماء والسكينة.. أصحاب القلوب الميتة يتسللون الآن.")
        .setColor(THEME.night);
    const nRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("open_night_menu").setLabel("تنفيذ المهمة").setStyle(ButtonStyle.Secondary));
    game.lastMessages.push(await game.channel.send({ embeds: [nEmbed], components: [nRow] }));

    game.nightActions.clear();
    await sleep(25000); 

    if (await resolveNight(game)) break;
    await sleep(5000);
    await cleanMessages(game);

    // مرحلة التصويت
    const vRows = await createPlayerRows(game.alive, "vote", game.channel.guild);
    const vEmbed = new EmbedBuilder()
        .setTitle("🗳️ اجتماع طارئ: من القاتل؟")
        .setDescription("الشكوك تملأ المكان.. من سيواجه المشنقة اليوم؟")
        .setColor(THEME.day);
    game.lastMessages.push(await game.channel.send({ embeds: [vEmbed], components: vRows }));

    game.voted.clear(); game.votes.clear();
    await sleep(35000);

    if (await resolveVote(game)) break;
    await sleep(5000);
  }
}

async function resolveNight(game) {
    let dead = (game.mafiaKill && game.mafiaKill !== game.doctorSave) ? game.mafiaKill : null;
    if (dead) game.alive = game.alive.filter(id => id !== dead);
    
    const embed = new EmbedBuilder()
        .setTitle(dead ? "💀 خبر مفجع" : "✨ نجاة معجزة")
        .setDescription(dead ? `المافيا استهدفت <@${dead}> ولم ينجُ من قبضتهم!` : "المافيا فشلت في مهمتها الليلة، الجميع بخير!")
        .setColor(dead ? THEME.mafia : THEME.doctor);
    
    game.lastMessages.push(await game.channel.send({ embeds: [embed] }));
    return checkWinner(game);
}

async function resolveVote(game) {
    let top = null, max = 0;
    game.votes.forEach((v, k) => { if (v > max) { max = v; top = k; } });
    if (top) {
        game.alive = game.alive.filter(id => id !== top);
        const role = game.roles[top];
        const embed = new EmbedBuilder()
            .setTitle("⚖️ حبل المشنقة")
            .setDescription(`بأغلبية الأصوات، تم إعدام <@${top}>.\n\nكشفت الجثة أنه كان: **${role === 'mafia' ? 'مافيا خائن 👺' : 'مواطن بريء 👤'}**`)
            .setColor(THEME.main);
        game.lastMessages.push(await game.channel.send({ embeds: [embed] }));
    } else {
        game.lastMessages.push(await game.channel.send("🤐 صمت مطبق.. لم يتفق أحد على قرار الإعدام!"));
    }
    return checkWinner(game);
}

/* ================== وظائف إضافية ================== */
async function createPlayerRows(ids, prefix, guild) {
    const rows = [];
    let row = new ActionRowBuilder();
    for (let i = 0; i < ids.length; i++) {
        const member = await guild.members.fetch(ids[i]).catch(() => null);
        const name = member?.displayName || "مجهول"; // استخدام اسم العرض Nickname
        if (i > 0 && i % 5 === 0) { rows.push(row); row = new ActionRowBuilder(); }
        row.addComponents(new ButtonBuilder().setCustomId(`${prefix}_${ids[i]}`).setLabel(name).setStyle(ButtonStyle.Secondary));
    }
    if (row.components.length > 0) rows.push(row);
    return rows;
}

function checkWinner(game) {
    const m = game.alive.filter(id => game.roles[id] === "mafia").length;
    const c = game.alive.length - m;

    if (m === 0) {
        const win = new EmbedBuilder()
            .setTitle("🏆 انتصار العدالة!")
            .setDescription("تم سحق المافيا وتطهير المدينة من الخونة. المواطنون يرفعون راية النصر!")
            .setImage(THEME.win_citizens_img)
            .setColor(THEME.doctor);
        game.channel.send({ embeds: [win] });
        games.delete(game.channel.guild.id); return true;
    }
    if (m >= c) {
        const win = new EmbedBuilder()
            .setTitle("👺 انتصار المافيا!")
            .setDescription("سقطت المدينة في أيدي الجريمة.. المافيا هم ملوك الغابة الجدد!")
            .setImage(THEME.win_mafia_img)
            .setColor(THEME.mafia);
        game.channel.send({ embeds: [win] });
        games.delete(game.channel.guild.id); return true;
    }
    return false;
}

async function handleActions(i, game) {
    const [action, targetId] = i.customId.split("_");
    if (["kill", "save", "check"].includes(action)) {
        if (game.nightActions.has(i.user.id)) return i.reply({ content: "لقد نفذت مهمتك، ارحل الآن!", ephemeral: true });
        game.nightActions.add(i.user.id);
        if (action === "kill") game.mafiaKill = targetId;
        if (action === "save") game.doctorSave = targetId;
        if (action === "check") {
            const isM = game.roles[targetId] === "mafia";
            const member = await i.guild.members.fetch(targetId);
            await i.update({ content: `🔍 تقرير المحقق: اللاعب **${member.displayName}** هو **${isM ? "خائن 👺" : "بريء ✅"}**`, components: [] });
        } else await i.update({ content: "✅ تم تسجيل قرارك ببراعة.", components: [] });
    }
    if (action === "vote") {
        if (game.voted.has(i.user.id)) return i.reply({ content: "لقد حسمت قرارك مسبقاً!", ephemeral: true });
        game.voted.add(i.user.id);
        game.votes.set(targetId, (game.votes.get(targetId) || 0) + 1);
        await i.reply({ content: "🗳️ تم تسجيل صوتك في صندوق الاقتراع.", ephemeral: true });
    }
}

async function cleanMessages(game) {
    for (const m of game.lastMessages) await m.delete().catch(() => {});
    game.lastMessages = [];
}

client.login(process.env.DISCORD_TOKEN);
