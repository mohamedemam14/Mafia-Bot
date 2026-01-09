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
// ضع الآيدي الخاص بالسيرفرات هنا أو في ملف .env
const SOURCE_ID = "855491833442336809"; 
const TARGET_ID = "1415016842476388507";
const COMMAND_PREFIX = "!نسخ_الهيكل";

/* ================== LOGIC ================== */
client.once(Events.ClientReady, () => {
  console.log(`✅ البوت متصل باسم: ${client.user.tag}`);
  console.log(`📌 السيرفر المصدر: ${SOURCE_ID}`);
  console.log(`📌 السيرفر الهدف: ${TARGET_ID}`);
});

client.on(Events.MessageCreate, async (msg) => {
  if (msg.content !== COMMAND_PREFIX || msg.author.bot) return;

  // التحقق من صلاحيات الشخص الذي أرسل الأمر
  if (!msg.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return msg.reply("❌ هذا الأمر للمسؤولين فقط.");
  }

  const sourceGuild = client.guilds.cache.get(SOURCE_ID);
  const targetGuild = client.guilds.cache.get(TARGET_ID);

  if (!sourceGuild || !targetGuild) {
    return msg.reply("❌ تأكد من وجود البوت في السيرفرين ومن صحة الأرقام التعريفية (IDs).");
  }

  await msg.reply("⏳ بدأت عملية النسخ الآمنة... لن يتم لمس السيرفر الأساسي.");

  try {
    // 1. إنشاء خريطة للرتب لربط القديم بالجديد
    const roleMap = new Map();
    const sourceRoles = await sourceGuild.roles.fetch();

    console.log("🎨 جاري نسخ الرتب...");
    for (const [id, role] of sourceRoles) {
      if (role.managed || role.name === "@everyone") continue;

      const newRole = await targetGuild.roles.create({
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        permissions: role.permissions,
        mentionable: role.mentionable,
        reason: "نسخ هيكل السيرفر"
      });
      roleMap.set(role.name, newRole.id);
    }

    // 2. جلب كافة قنوات السيرفر المصدر
    const sourceChannels = await sourceGuild.channels.fetch();
    
    // 3. نسخ الفئات (Categories) أولاً
    console.log("📁 جاري نسخ الفئات والقنوات...");
    const categories = sourceChannels
      .filter(c => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    for (const [id, category] of categories) {
      const newCategory = await targetGuild.channels.create({
        name: category.name,
        type: ChannelType.GuildCategory
      });

      // جلب القنوات التابعة لهذه الفئة
      const children = sourceChannels
        .filter(c => c.parentId === category.id)
        .sort((a, b) => a.position - b.position);

      for (const [childId, child] of children) {
        // تجهيز صلاحيات القناة بناءً على الأسماء (لضمان عمل الرومات الخاصة)
        const newOverwrites = child.permissionOverwrites.cache.map(overwrite => {
          const sourceRole = sourceGuild.roles.cache.get(overwrite.id);
          if (sourceRole && roleMap.has(sourceRole.name)) {
            return {
              id: roleMap.get(sourceRole.name),
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

    await msg.channel.send(`✅ تم نسخ الهيكل بنجاح إلى: **${targetGuild.name}**\n تم نسخ الرتب والقنوات مع الحفاظ على خصوصية الرومات.`);

  } catch (error) {
    console.error("حدث خطأ:", error);
    await msg.reply("❌ حدث خطأ تقني، تأكد من صلاحيات البوت في السيرفر الجديد.");
  }
});

client.login(process.env.DISCORD_TOKEN);
