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

const SOURCE_ID = "855491833442336809"; 
const TARGET_ID = "1415016842476388507";
const COMMAND_PREFIX = "!نسخ_الهيكل";

// دالة مساعدة للانتظار لتجنب الـ Rate Limit
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

client.on(Events.MessageCreate, async (msg) => {
  if (msg.content !== COMMAND_PREFIX || msg.author.bot) return;
  if (!msg.member.permissions.has(PermissionFlagsBits.Administrator)) return;

  const sourceGuild = client.guilds.cache.get(SOURCE_ID);
  const targetGuild = client.guilds.cache.get(TARGET_ID);

  if (!sourceGuild || !targetGuild) return msg.reply("❌ لم يتم العثور على السيرفرات.");

  try {
    await msg.reply("🚀 بدأت العملية: (1) التنظيف الشامل.. (2) نسخ الرتب.. (3) بناء الرومات..");

    // --- 1. تنظيف السيرفر الهدف بالكامل ---
    console.log("🧹 تنظيف الرومات...");
    const targetChannels = await targetGuild.channels.fetch();
    for (const [id, channel] of targetChannels) {
      await channel.delete().catch(e => console.log(`فشل حذف قناة: ${channel.name}`));
      await wait(500); // انتظر نصف ثانية بين كل حذف
    }

    console.log("🧹 تنظيف الرتب...");
    const targetRoles = await targetGuild.roles.fetch();
    for (const [id, role] of targetRoles) {
      // لا يمكن حذف رتبة @everyone أو رتبة البوت نفسه أو الرتب المدارة بواسطة بوتات أخرى
      if (role.managed || role.name === "@everyone" || role.id === targetGuild.members.me.roles.highest.id) continue;
      await role.delete().catch(e => console.log(`فشل حذف رتبة: ${role.name} (تأكد أن رتبة البوت فوقها)`));
      await wait(500);
    }

    // --- 2. نسخ الرتب من المصدر ---
    const roleMap = new Map();
    const sourceRoles = (await sourceGuild.roles.fetch()).sort((a, b) => b.position - a.position);

    console.log("🎨 إنشاء الرتب الجديدة...");
    for (const [id, role] of sourceRoles) {
      if (role.managed || role.name === "@everyone") continue;
      
      const newRole = await targetGuild.roles.create({
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        permissions: role.permissions,
        mentionable: role.mentionable
      }).catch(e => console.log(`فشل إنشاء رتبة: ${role.name}`));
      
      if (newRole) roleMap.set(role.name, newRole.id);
      await wait(500);
    }

    // --- 3. نسخ القنوات والفئات ---
    const sourceChannels = await sourceGuild.channels.fetch();
    const categories = sourceChannels
      .filter(c => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    console.log("📁 بناء الهيكل...");
    for (const [id, category] of categories) {
      const newCategory = await targetGuild.channels.create({
        name: category.name,
        type: ChannelType.GuildCategory
      });

      const children = sourceChannels
        .filter(c => c.parentId === category.id)
        .sort((a, b) => a.position - b.position);

      for (const [childId, child] of children) {
        const newOverwrites = child.permissionOverwrites.cache.map(overwrite => {
          const sourceRole = sourceGuild.roles.cache.get(overwrite.id);
          if (sourceRole && roleMap.has(sourceRole.name)) {
            return { id: roleMap.get(sourceRole.name), allow: overwrite.allow, deny: overwrite.deny };
          }
          if (overwrite.id === sourceGuild.id) {
            return { id: targetGuild.id, allow: overwrite.allow, deny: overwrite.deny };
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
        }).catch(e => console.log(`فشل إنشاء قناة: ${child.name}`));
        await wait(500);
      }
    }

    await msg.channel.send("✅ اكتملت العملية بنجاح تام!");

  } catch (error) {
    console.error(error);
    await msg.reply("❌ حدث خطأ فني أثناء النسخ.");
  }
});

client.login(process.env.DISCORD_TOKEN);
