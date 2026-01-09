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
const SOURCE_ID = "1434304957959372893"; 
const TARGET_ID = "1415016842476388507";
const COMMAND_PREFIX = "!نسخ_الهيكل";

// دالة للانتظار لتجنب الحظر المؤقت من ديسكورد
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/* ================== LOGIC ================== */
client.once(Events.ClientReady, () => {
  console.log(`✅ البوت جاهز لنسخ الرومات: ${client.user.tag}`);
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
    await msg.reply("🧹 جاري مسح الرومات القديمة وبناء الرومات الجديدة (بدون لمس الرتب)...");

    // --- المرحلة 1: تنظيف القنوات في السيرفر الجديد ---
    const targetChannels = await targetGuild.channels.fetch();
    console.log("🧹 جاري حذف القنوات...");
    for (const [id, channel] of targetChannels) {
      await channel.delete().catch(() => {});
      await wait(400); // مهلة بسيطة
    }

    // --- المرحلة 2: نسخ القنوات والفئات من المصدر ---
    const sourceChannels = await sourceGuild.channels.fetch();
    
    // تصفية وترتيب الفئات (Categories)
    const categories = sourceChannels
      .filter(c => c.type === ChannelType.GuildCategory)
      .sort((a, b) => a.position - b.position);

    console.log("📁 جاري بناء الفئات والقنوات...");
    for (const [id, category] of categories) {
      // إنشاء الفئة
      const newCategory = await targetGuild.channels.create({
        name: category.name,
        type: ChannelType.GuildCategory
      });

      // جلب القنوات التابعة لهذه الفئة وترتيبها
      const children = sourceChannels
        .filter(c => c.parentId === category.id)
        .sort((a, b) => a.position - b.position);

      for (const [childId, child] of children) {
        // إنشاء القناة داخل الفئة
        await targetGuild.channels.create({
          name: child.name,
          type: child.type,
          parent: newCategory.id,
          topic: child.topic,
          nsfw: child.nsfw
        }).catch(e => console.log(`فشل إنشاء القناة: ${child.name}`));
        
        await wait(400); // مهلة لتجنب Rate Limit
      }
    }

    await msg.channel.send(`✅ تمت العملية بنجاح! تم نسخ هيكل القنوات من **${sourceGuild.name}**.`);

  } catch (error) {
    console.error("حدث خطأ:", error);
    await msg.reply("❌ حدث خطأ أثناء النسخ. تأكد من صلاحيات البوت في السيرفر الجديد.");
  }
});

client.login(process.env.DISCORD_TOKEN);
