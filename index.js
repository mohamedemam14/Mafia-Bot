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
  partials: [Partials.Channel]
});

const games = new Map();

// إعدادات المظهر والصورة التي طلبتها
const THEME = {
  main: "#2b2d31",
  mafia: "#8b0000",
  doctor: "#00fa9a",
  police: "#1e90ff",
  night: "#0b0b0b",
  day: "#ffdb58",
  // الصورة التي طلبتها تم وضعها هنا كغلاف رئيسي
  cover: "https://r.jina.ai/i/681775e5095e4952924194098492080a", 
  win_mafia: "https://i.imgur.com/83pL6v6.png", 
  win_citizens: "https://i.imgur.com/kS9Yp9v.png" 
};

/* ================== بدء اللعبة ================== */
client.on("messageCreate", async msg => {
  if (msg.content !== "!mafia" || msg.author.bot) return;
  if (games.has(msg.guild.id)) return msg.reply("❌ هناك جولة قائمة بالفعل!");

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
    status: "waiting",
    phase: "setup"
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("join").setLabel("انضمام للضحايا").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("start_game").setLabel("توزيع الأدوار وبدء التحكم").setStyle(ButtonStyle.Success)
  );

  const embed = new EmbedBuilder()
    .setTitle("🎭 صراع الجبابرة: لعبة المافيا")
    .setDescription(`المسؤول عن الجلسة: <@${msg.author.id}>\n\n**على المسؤول الضغط على الزر الأخضر لبدء التحكم في أحداث اللعبة.**`)
    .setImage(THEME.cover) // الصورة الحماسية الجديدة
    .setColor(THEME.main)
    .setFooter({ text: "نظام Leo Mafia المتطور" });

  const m = await msg.channel.send({ embeds: [embed], components: [row] });
  games.get(msg.guild.id).lastMessages.push(m);
});

/* ================== نظام التحكم والتفاعلات ================== */
client.on("interactionCreate", async i => {
  if (!i.isButton()) return;
  const game = games.get(i.guild.id);
  if (!game) return;

  const isHost = i.user.id === game.host;

  if (i.customId === "join") {
    if (game.status !== "waiting") return i.reply({ content: "❌ بدأت اللعبة!", ephemeral: true });
    if (game.players.includes(i.user.id)) return i.reply({ content: "❌ أنت مسجل بالفعل!", ephemeral: true });
    game.players.push(i.user.id);
    return i.reply({ content: `✅ تم تسجيل اسمك. العدد الحالي: ${game.players.length}`, ephemeral: true });
  }

  if (i.customId === "start_game") {
    if (!isHost) return i.reply({ content: "❌ هذا الزر للمسؤول فقط!", ephemeral: true });
    if (game.players.length < 4) return i.reply({ content: "❌ نحتاج 4 لاعبين على الأقل للبدء.", ephemeral: true });
    
    game.status = "playing";
    game.alive = [...game.players];
    await assignRoles(game);
    await i.reply({ content: "💀 تم توزيع الأدوار سرّاً. القوة الآن بيديك!", ephemeral: true });
    sendHostPanel(game);
    return;
  }

  // أزرار تحكم المسؤول
  if (["host_start_night", "host_end_night", "host_start_vote"].includes(i.customId)) {
    if (!isHost) return i.reply({ content: "❌ أنت لست المسؤول عن هذه الجولة!", ephemeral: true });
    
    if (i.customId === "host_start_night") await startNightPhase(game);
    if (i.customId === "host_end_night") await endNightPhase(game);
    if (i.customId === "host_start_vote") await startVotePhase(game);
    
    await i.deferUpdate();
    return;
  }

  // زر الأكشن الليلي للاعبين
  if (i.customId === "player_night_action") {
    const role = game.roles[i.user.id];
    if (role === "citizen") return i.reply({ content: "🤫 المواطنون ينامون الآن.. انتظر الصباح.", ephemeral: true });
    
    let targets = (role === "police") ? game.alive.filter(p => p !== i.user.id) : game.alive;
    const rows = await createPlayerRows(targets, role === "mafia" ? "kill" : role === "doctor" ? "save" : "check", i.guild);
    return i.reply({ content: "⚔️ نفذ قرارك السري الآن:", components: rows, ephemeral: true });
  }

  handleLogic(i, game);
});

/* ================== وظائف المسؤول والمراحل ================== */

async function sendHostPanel(game) {
  await cleanMessages(game);
  const embed = new EmbedBuilder()
    .setTitle("🎮 لوحة تحكم المسؤول (Game Master)")
    .setDescription("إليك صلاحياتك الآن:\n\n🌙 **بدء الليل:** تفعيل أدوار المافيا والطبيب.\n🗳️ **فتح التصويت:** إتاحة التصويت للجميع لإعدام شخص.")
    .setColor(THEME.main);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("host_start_night").setLabel("بدء مرحلة الليل 🌙").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("host_start_vote").setLabel("فتح ساحة التصويت 🗳️").setStyle(ButtonStyle.Danger)
  );

  const m = await game.channel.send({ content: `⚠️ <@${game.host}>، حان وقت اتخاذ القرار..`, embeds: [embed], components: [row] });
  game.lastMessages.push(m);
}

async function startNightPhase(game) {
  await cleanMessages(game);
  game.phase = "night";
  game.nightActions.clear();
  game.mafiaKill = null; game.doctorSave = null;

  const embed = new EmbedBuilder()
    .setTitle("🌙 حلول الظلام")
    .setDescription("المدينة نائمة والمسؤول يراقب من الظلال.. أصحاب الأدوار يمكنهم التحرك الآن.")
    .setColor(THEME.night);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("player_night_action").setLabel("استخدام القدرة الليلية").setStyle(ButtonStyle.Primary)
  );

  const hostRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("host_end_night").setLabel("كشف أحداث الليل ☀️").setStyle(ButtonStyle.Success)
  );

  game.lastMessages.push(await game.channel.send({ embeds: [embed], components: [row] }));
  game.lastMessages.push(await game.channel.send({ content: `⚠️ <@${game.host}> اضغط "كشف الأحداث" عندما ينتهي الجميع.`, components: [hostRow] }));
}

async function endNightPhase(game) {
    let d = (game.mafiaKill && game.mafiaKill !== game.doctorSave) ? game.mafiaKill : null;
    if (d) game.alive = game.alive.filter(id => id !== d);
    
    const em = new EmbedBuilder().setTitle(d ? "💀 ضحية جديدة" : "✨ ليلة هادئة")
        .setDescription(d ? `استيقظت المدينة على جثة اللاعب <@${d}>!` : "مرت الليلة بسلام، لم يقتل أحد!")
        .setColor(d ? THEME.mafia : THEME.doctor);
    
    await cleanMessages(game);
    await game.channel.send({ embeds: [em] });
    
    if (!checkWinner(game)) await sendHostPanel(game);
}

async function startVotePhase(game) {
    await cleanMessages(game);
    game.phase = "voting";
    game.voted.clear(); game.votes.clear();

    const vRows = await createPlayerRows(game.alive, "vote", game.channel.guild);
    const vEm = new EmbedBuilder().setTitle("🗳️ بدأت المحاكمة")
        .setDescription("صوتوا الآن ضد من تظنون أنه القاتل.. سينتهي التصويت بعد 30 ثانية.")
        .setColor(THEME.day);

    game.lastMessages.push(await game.channel.send({ embeds: [vEm], components: vRows }));
    setTimeout(() => resolveVote(game), 30000); 
}

/* ================== الوظائف التقنية ================== */

async function assignRoles(game) {
  const shuffled = [...game.players].sort(() => Math.random() - 0.5);
  const mCount = Math.max(1, Math.floor(shuffled.length / 4));
  for (let i = 0; i < shuffled.length; i++) {
    const uid = shuffled[i];
    let r = i < mCount ? "mafia" : i === mCount ? "doctor" : i === mCount+1 ? "police" : "citizen";
    game.roles[uid] = r;
    const user = await client.users.fetch(uid);
    await user.send(`🎭 دورك السري في اللعبة هو: **${r}**`).catch(() => {});
  }
}

async function handleLogic(i, game) {
    const [act, tid] = i.customId.split("_");
    if (["kill", "save", "check"].includes(act)) {
        if (game.nightActions.has(i.user.id)) return i.reply({ content: "لقد اخترت بالفعل!", ephemeral: true });
        game.nightActions.add(i.user.id);
        if (act === "kill") game.mafiaKill = tid;
        if (act === "save") game.doctorSave = tid;
        if (act === "check") {
            const m = await i.guild.members.fetch(tid);
            await i.update({ content: `🔍 التحقيق: **${m.displayName}** هو **${game.roles[tid] === 'mafia' ? 'مافيا 👺' : 'بريء ✅'}**`, components: [] });
        } else await i.update({ content: "✅ تم تسجيل قرارك السري.", components: [] });
    }
    if (act === "vote") {
        if (game.voted.has(i.user.id)) return i.reply({ content: "صوتّ مسبقاً!", ephemeral: true });
        game.voted.add(i.user.id);
        game.votes.set(tid, (game.votes.get(tid) || 0) + 1);
        await i.reply({ content: "🗳️ تم تسجيل تصويتك.", ephemeral: true });
    }
}

async function resolveVote(game) {
    if (game.phase !== "voting") return;
    let top = null, mx = 0;
    game.votes.forEach((v, k) => { if (v > mx) { mx = v; top = k; } });
    
    if (top) {
        game.alive = game.alive.filter(id => id !== top);
        await game.channel.send({ embeds: [new EmbedBuilder().setTitle("⚖️ قرار المحكمة").setDescription(`تم إعدام <@${top}>.\nكشفت هويته أنه كان: **${game.roles[top]}**`)] });
    } else {
        await game.channel.send("🤝 انتهى الوقت دون اتفاق على إعدام أحد.");
    }
    
    if (!checkWinner(game)) await sendHostPanel(game);
}

async function createPlayerRows(ids, prefix, guild) {
    const rs = []; let r = new ActionRowBuilder();
    for (let i = 0; i < ids.length; i++) {
        const m = await guild.members.fetch(ids[i]).catch(() => null);
        if (i > 0 && i % 5 === 0) { rs.push(r); r = new ActionRowBuilder(); }
        r.addComponents(new ButtonBuilder().setCustomId(`${prefix}_${ids[i]}`).setLabel(m?.displayName || "مجهول").setStyle(ButtonStyle.Secondary));
    }
    if (r.components.length > 0) rs.push(r);
    return rs;
}

function checkWinner(game) {
    const m = game.alive.filter(id => game.roles[id] === "mafia").length;
    const c = game.alive.length - m;
    if (m === 0) { 
        game.channel.send({ embeds: [new EmbedBuilder().setTitle("🏆 فوز المواطنين").setImage(THEME.win_citizens).setColor("#2ecc71")] }); 
        games.delete(game.channel.guild.id); return true; 
    }
    if (m >= c) { 
        game.channel.send({ embeds: [new EmbedBuilder().setTitle("👺 فوز المافيا").setImage(THEME.win_mafia).setColor("#e74c3c")] }); 
        games.delete(game.channel.guild.id); return true; 
    }
    return false;
}

async function cleanMessages(game) {
    for (const m of game.lastMessages) await m.delete().catch(() => {});
    game.lastMessages = [];
}

client.login(process.env.DISCORD_TOKEN);
