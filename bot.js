// تحميل المكتبات المطلوبة
require('dotenv').config();
const fetch = require('node-fetch');

// متغيرات البيئة (يتم جلبها من ملف .env)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TOKEN_ADDRESSES = process.env.TOKEN_ADDRESSES.split(","); // تحويل العناوين إلى مصفوفة

// رابط API لـ Dexscreener للحصول على سعر العملة
const DEXSCREENER_API_URL = `https://api.dexscreener.com/latest/dex/tokens/`;

// 🟡 تخزين الأسعار السابقة لكل عملة لمقارنة التغيرات
let storedPrices = {};

// 🟡 دالة لتحويل السعر إلى وحدة مناسبة (M$، $، أو سنتات)
function formatPrice(price) {
    if (price >= 1_000_000) {
        return (price / 1_000_000).toFixed(2) + "M$"; // بالملايين
    } else if (price >= 1) {
        return "$" + price.toFixed(2); // بالدولار العادي
    } else {
        return "$" + price.toFixed(6); // بالسنتات
    }
}

// 🟡 دالة لجلب سعر كل عملة
async function getTokenPrice(tokenAddress) {
    try {
        const response = await fetch(`${DEXSCREENER_API_URL}${tokenAddress}`);
        const data = await response.json();

        if (!data || !data.pairs || data.pairs.length === 0) {
            console.log(`❌ لم يتم العثور على بيانات لهذه العملة: ${tokenAddress}`);
            return null;
        }

        const pair = data.pairs[0]; 
        return {
            price: parseFloat(pair.priceUsd), // تحويل السعر إلى رقم عشري
            exchange: pair.dexId, 
            symbol: pair.baseToken.symbol + "/" + pair.quoteToken.symbol // اسم العملة الصحيح
        };
    } catch (error) {
        console.error(`⚠️ خطأ أثناء جلب البيانات للرمز ${tokenAddress}:`, error);
        return null;
    }
}

// 🟢 دالة لإرسال رسالة إلى تليجرام
async function sendTelegramMessage(message) {
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const payload = {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
    };

    try {
        await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log('✅ تم إرسال الرسالة بنجاح!');
    } catch (error) {
        console.error('❌ فشل إرسال الرسالة:', error);
    }
}

// 🔵 الوظيفة الرئيسية لجلب الأسعار لكل العملات ومقارنة التغيرات
async function main() {
    let message = "";
    let hasAlert = false;

    for (let tokenAddress of TOKEN_ADDRESSES) {
        const tokenData = await getTokenPrice(tokenAddress);

        if (tokenData) {
            const formattedPrice = formatPrice(tokenData.price); // تحويل السعر للوحدة المناسبة

            // 🔥 مقارنة السعر السابق لإرسال تنبيه
            if (storedPrices[tokenAddress] !== undefined) {
                const previousPrice = storedPrices[tokenAddress];
                const percentageChange = ((tokenData.price - previousPrice) / previousPrice) * 100;

                if (percentageChange >= 10) {
                    message += `🚀 *${tokenData.symbol} ارتفعت!* 📈\n`;
                    message += `السعر الآن: ${formattedPrice} (ارتفاع +${percentageChange.toFixed(2)}%)\n\n`;
                    hasAlert = true;
                } else if (percentageChange <= -10) {
                    message += `⚠️ *${tokenData.symbol} انخفضت!* 📉\n`;
                    message += `السعر الآن: ${formattedPrice} (انخفاض ${percentageChange.toFixed(2)}%)\n\n`;
                    hasAlert = true;
                }
            }

            // تحديث السعر المخزن للمقارنة في التحديث القادم
            storedPrices[tokenAddress] = tokenData.price;
        }
    }

    // إذا كان هناك تغير بنسبة 10% أو أكثر، يتم إرسال التنبيه
    if (hasAlert) {
        message = "🚨 *تنبيه هام!* 🚨\n\n" + message;
        await sendTelegramMessage(message);
    }
}

// ⏰ تشغيل البوت كل 5 دقائق
setInterval(() => {
    console.log("⏰ التحقق من تغير الأسعار...");
    main();
}, 5 * 60 * 1000);

main(); // تشغيله فورًا عند بدء التشغيل
