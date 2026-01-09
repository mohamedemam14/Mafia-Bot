import "dotenv/config";
import { 
  Client, 
  GatewayIntentBits, 
  ChannelType, 
  PermissionFlagsBits,
  Events 
} from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* ================== CONFIGURATION ================== */
const SOURCE_ID = "855491833442336809"; 
const TARGET_ID = "1415016842476388507";
const COMMAND_PREFIX = "!نسخ_الهيكل";

/* ================== LOGIC ================== */
client.once(Events.ClientReady, () => {
  console.log(`✅ البوت متصل وجاهز باسم: ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (msg) => {
  if (msg.content !== COMMAND_PREFIX || msg.author.bot) return;

  if (!msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return msg.reply("❌ هذا الأمر للمسؤولين فقط.");
  }

  const sourceGuild = client.guilds.cache.get(SOURCE_ID);
  const targetGuild = client.guilds.cache.get(TARGET_ID);

  if (!sourceGuild || !targetGuild) {
    return msg.reply("❌ تأكد من وجود البوت في السيرفرين وصحة الـ IDs.");
  }

  try {
    await msg.reply("⚠️ جاري تنظيف السيرفر الهدف بالكامل ثم البدء بالنسخ... يرجى الانتظار.");

    // --- المرحلة 1: تنظيف السيرفر الهدف (حذف القنوات والرتب) ---
    console.log("🧹 جاري مسح محتويات السيرفر الهدف...");
    
    // حذف القنوات الحالية
    const targetChannels = await targetGuild.channels.fetch();
    for (const [id, channel] of targetChannels) {
      await channel.delete().catch(() => {});
    }

    // حذف الرتب الحالية (باستثناء الرتب المحمية)
    const targetRoles = await targetGuild.roles.fetch();
    for (const [id, role] of targetRoles) {
      if (role.managed || role.name === "@everyone") continue;
      // لا يحذف رتبة البوت نفسه
      if (role.id === targetGuild.members.me.roles.highest.id) continue;
      await role.delete().catch(() => {});
    }

    // --- المرحلة 2: نسخ الرتب من المصدر ---
    const roleMap = new Map();
    const sourceRoles = await sourceGuild.roles.fetch();

    console.log("🎨 جاري إنشاء الرتب...");
    for (const [id, role] of sourceRoles) {
      if (role.managed || role.name === "@everyone") continue;

      const newRole = await targetGuild.roles.create({
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        permissions: role.permissions,
        mentionable: role.mentionable,
        reason: "إعادة بناء السيرفر"
      });
      roleMap.set(role.name, newRole.id);
    }

    // --- المرحلة 3: نسخ القنوات والفئات ---
    const sourceChannels = await sourceGuild.channels.fetch();
    
    console.log("📁 جاري بناء القنوات...");
    const categories = sourceChannels
      .filter(c => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    for (const [id, category] of categories) {
      const newCategory = await targetGuild.channels.create({
        name: category.name,
        type: ChannelType.GuildCategory
      });

      const children = sourceChannels
        .filter(c => c.parentId === category.id)
        .sort((a, b) => a.position - b.position);

      for (const [childId, child] of children) {
        // تجهيز صلاحيات الرومات بناءً على الرتب الجديدة
        const newOverwrites = child.permissionOverwrites.cache.map(overwrite => {
          const sourceRole = sourceGuild.roles.cache.get(overwrite.id);
          if (sourceRole && roleMap.has(sourceRole.name)) {
            return {
              id: roleMap.get(sourceRole.name),
              allow: overwrite.allow,
              deny: overwrite.deny
            };
          }
          // الحفاظ على صلاحية @everyone إذا وجدت
          if (overwrite.id === sourceGuild.id) {
            return {
              id: targetGuild.id,
              allow: overwrite.allow,
              deny: overwrite.deny
            };
          }
          return null;
        }).filter(Boolean);

        await targetGuild.channels.create({
          name: child.name,
          type: child.type,
          parent: newCategory.id,
          topic: child.topic,
          nsfw: child.nsfw,
          permissionOverwrites: newOverwrites
        });
      }
    }

    await msg.channel.send(`✅ تم تنظيف السيرفر بنجاح ونقل الهيكل من **${sourceGuild.name}** إلى **${targetGuild.name}**.`);

  } catch (error) {
    console.error("حدث خطأ:", error);
    await msg.reply("❌ حدث خطأ أثناء العملية. تأكد من أن رتبة البوت هي الأعلى في السيرفر الجديد.");
  }
});

client.login(process.env.DISCORD_TOKEN);
