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

// ألوان الثيم الخاص بـ Leo
const COLORS = {
  main: "#2b2d31", // لون الديسكورد الداكن الاحترافي
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
    .setDescription("مرحباً بكم في نظام ليو المتطور. اضغط على الزر أدناه للمشاركة في الجولة القادمة.")
    .addFields(
      { name: "👤 المضيف", value: `<@${msg.author.id}>`, inline: true },
      { name: "👥 اللاعبين", value: "0", inline: true }
    )
    .setColor(COLORS.main)
    .setFooter({ text: "نظام الرومات الخاصة مفعل تلقائياً" });

  msg.channel.send({ embeds: [embed], components: [row] });
});

/* ================== التفاعلات ================== */
client.on("interactionCreate", async i => {
  if (!i.isButton()) return;
  const game = games.get(i.guild.id);
  if (!game) return;

  if (i.customId === "join") {
    if (game.status !== "waiting") return i.reply({ content: "❌ بدأت اللعبة!", ephemeral: true });
    if (game.players.includes(i.user.id)) return i.reply({ content: "❌ أنت مسجل بالفعل!", ephemeral: true });
    game.players.push(i.user.id);

    const embed = EmbedBuilder.from(i.message.embeds[0]);
    embed.setFields(
        { name: "👤 المضيف", value: `<@${game.host}>`, inline: true },
        { name: "👥 اللاعبين", value: `${game.players.length}`, inline: true }
    );
    await i.update({ embeds: [embed] });
  }

  if (i.customId === "start") {
    if (i.user.id !== game.host) return i.reply({ content: "❌ للمضيف فقط!", ephemeral: true });
    if (game.players.length < 4) return i.reply({ content: "❌ نحتاج 4 لاعبين على الأقل", ephemeral: true });

    game.status = "playing";
    game.alive = [...game.players];
    
    await i.reply({ content: "⚙️ جاري تهيئة الغرف وتوزيع الأدوار...", ephemeral: true });
    await assignRolesAndChannels(game, i.guild);
    startGameLoop(game);
  }

  handleActions(i, game);
});

/* ================== توزيع الأدوار وإنشاء الرومات ================== */
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
    let role = "citizen";
    let roleName = "مواطن بريء";
    let color = COLORS.citizen;

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

    const roleEmbed = new EmbedBuilder()
      .setTitle("بطاقة التعريف الخاصة بك")
      .setDescription(`لقد تم اختيارك لتكون: **${roleName}**`)
      .addFields({ name: "المهمة", value: getMission(role) })
      .setColor(color)
      .setFooter({ text: "سرية هذه الغرفة مسؤوليتك" });

    await channel.send({ content: `<@${userId}>`, embeds: [roleEmbed] });
  }
}

function getMission(role) {
    if (role === "mafia") return "تخلص من جميع المواطنين دون كشف هويتك.";
    if (role === "doctor") return "حاول تخمين من ستقتله المافيا وقم بإنقاذه.";
    if (role === "police") return "تحقق من هوية اللاعبين ليلاً لكشف المافيا.";
    return "حاول النجاة وكشف المافيا خلال التصويت الصباحي.";
}

/* ================== دورة اللعبة ================== */
async function startGameLoop(game) {
  while (game.status === "playing") {
    // الليل
    const nightEmbed = new EmbedBuilder()
        .setTitle("🌙 سكون الليل")
        .setDescription("المدينة نائمة الآن.. أصحاب الأدوار يتخذون قراراتهم.")
        .setColor(COLORS.night);
    await game.channel.send({ embeds: [nightEmbed] });

    await runNightPhase(game);
    await sleep(25000); 

    if (await resolveNight(game)) break;

    // التصويت
    const voteEmbed = new EmbedBuilder()
        .setTitle("🗳️ اجتماع طارئ")
        .setDescription("حان وقت النقاش. من تظنون أنه العميل الخائن؟")
        .setColor(COLORS.day);
    await game.channel.send({ embeds: [voteEmbed] });

    await runVotePhase(game);
    await sleep(35000);

    if (await resolveVote(game)) break;
  }

  // تنظيف
  setTimeout(async () => {
    for (const channel of game.tempChannels) {
        await channel.delete().catch(() => {});
    }
  }, 10000);
}

async function runNightPhase(game) {
  game.mafiaKill = null; game.doctorSave = null;
  const rows = createPlayerRows(game.alive, "target");

  for (const id of game.alive) {
    const channelId = game.roles[id + "_channel"];
    const channel = await client.channels.fetch(channelId);
    const role = game.roles[id];

    if (role === "mafia") await channel.send({ content: "🔴 **المافيا:** اختر هدفك للتصفية:", components: modifyRows(rows, "kill") });
    if (role === "doctor") await channel.send({ content: "🟢 **الطبيب:** اختر شخصاً لحمايته:", components: modifyRows(rows, "save") });
    if (role === "police") await channel.send({ content: "🔵 **المحقق:** اختر لاعباً للتحري عنه:", components: modifyRows(rows, "check") });
  }
}

async function resolveNight(game) {
    let dead = null;
    if (game.mafiaKill && game.mafiaKill !== game.doctorSave) {
      dead = game.mafiaKill;
      game.alive = game.alive.filter(id => id !== dead);
    }
    
    const resEmbed = new EmbedBuilder()
      .setTitle("☀️ شروق الشمس")
      .setDescription(dead ? `🚨 استيقظت المدينة على خبر مقتل <@${dead}>!` : "✅ مرت الليلة بسلام، لم يمت أحد.")
      .setColor(dead ? COLORS.mafia : COLORS.doctor);
  
    await game.channel.send({ embeds: [resEmbed] });
    return checkWinner(game);
}

async function runVotePhase(game) {
    game.votes.clear(); game.voted.clear();
    const rows = createPlayerRows(game.alive, "vote");
    await game.channel.send({ content: "⬇️ **استخدم الأزرار أدناه للتصويت:**", components: rows });
}

async function resolveVote(game) {
    let topTarget = null, max = 0;
    game.votes.forEach((v, k) => { if (v > max) { max = v; topTarget = k; } });
  
    const voteResEmbed = new EmbedBuilder().setColor(COLORS.main);
  
    if (topTarget) {
      game.alive = game.alive.filter(id => id !== topTarget);
      const role = game.roles[topTarget];
      voteResEmbed.setTitle("⚖️ نتيجة المحاكمة")
                  .setDescription(`بأغلبية الأصوات، تقرر نفي <@${topTarget}>.\n\nكشف التقرير أنه كان: **${role === 'mafia' ? 'مافيا 👺' : 'مواطن بريء 👤'}**`);
    } else {
      voteResEmbed.setTitle("⚖️ نتيجة المحاكمة").setDescription("لم يتفق السكان على قرار.. تم إلغاء الإعدام.");
    }
  
    await game.channel.send({ embeds: [voteResEmbed] });
    return checkWinner(game);
}

function handleActions(i, game) {
  const [action, targetId] = i.customId.split("_");
  
  if (action === "vote") {
    if (game.voted.has(i.user.id)) return i.reply({ content: "لقد أدليت بصوتك بالفعل.", ephemeral: true });
    game.voted.add(i.user.id);
    game.votes.set(targetId, (game.votes.get(targetId) || 0) + 1);
    return i.reply({ content: "تم تسجيل صوتك بنجاح.", ephemeral: true });
  }

  if (action === "kill") game.mafiaKill = targetId;
  if (action === "save") game.doctorSave = targetId;
  if (action === "check") {
    const isM = game.roles[targetId] === "mafia";
    return i.reply({ content: `🕵️ التقرير السري: اللاعب المختار هو **${isM ? "عضو مافيا 👺" : "مواطن بريء ✅"}**`, ephemeral: true });
  }
  
  if (["kill", "save", "check"].includes(action)) {
    i.update({ content: "✅ تم تأكيد العملية الليلية.", components: [] });
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

  const winEmbed = new EmbedBuilder().setTitle("🏁 انتهت اللعبة");

  if (m === 0) {
    winEmbed.setDescription("🏆 **فوز كاسح للمواطنين!**\nتم القضاء على جميع التهديدات.").setColor(COLORS.doctor);
    game.channel.send({ embeds: [winEmbed] });
    games.delete(game.channel.guild.id); return true;
  }
  if (m >= c) {
    winEmbed.setDescription("🏆 **سيطرة كاملة للمافيا!**\nلقد سقطت المدينة في أيدي العبث.").setColor(COLORS.mafia);
    game.channel.send({ embeds: [winEmbed] });
    games.delete(game.channel.guild.id); return true;
  }
  return false;
}

client.login(process.env.DISCORD_TOKEN);
