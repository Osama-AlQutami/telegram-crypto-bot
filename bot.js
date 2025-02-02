// تحميل المكتبات المطلوبة
require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs');

// متغيرات البيئة (`.env`)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TOKEN_ADDRESSES = process.env.TOKEN_ADDRESSES.split(",");

// رابط API لـ Dexscreener
const DEXSCREENER_API_URL = `https://api.dexscreener.com/latest/dex/tokens/`;

// 🔵 تحميل الأسعار السابقة من `prices.json`
let storedPrices = {};
const PRICES_FILE = 'prices.json';

if (fs.existsSync(PRICES_FILE)) {
    try {
        storedPrices = JSON.parse(fs.readFileSync(PRICES_FILE, 'utf8'));
        console.log("✅ تم تحميل الأسعار السابقة من `prices.json`");
    } catch (error) {
        console.error("⚠️ خطأ أثناء قراءة `prices.json`:", error);
        storedPrices = {};
    }
}

// 🟡 دالة لتحويل السعر إلى وحدة مناسبة
function formatPrice(price) {
    if (price >= 1_000_000) {
        return (price / 1_000_000).toFixed(2) + "M$"; // بالملايين
    } else if (price >= 1) {
        return "$" + price.toFixed(2); // بالدولار العادي
    } else {
        return "$" + price.toFixed(6); // بالسنتات
    }
}

// 🟡 دالة لجلب سعر العملة
async function getTokenPrice(tokenAddress) {
    try {
        const response = await fetch(`${DEXSCREENER_API_URL}${tokenAddress}`);
        const data = await response.json();

        if (!data || !data.pairs || data.pairs.length === 0) {
            console.log(`❌ لم يتم العثور على بيانات للعملة: ${tokenAddress}`);
            return null;
        }

        const pair = data.pairs[0];
        return {
            price: parseFloat(pair.priceUsd),
            exchange: pair.dexId,
            symbol: pair.baseToken.symbol + "/" + pair.quoteToken.symbol
        };
    } catch (error) {
        console.error(`⚠️ خطأ أثناء جلب البيانات للرمز ${tokenAddress}:`, error);
        return null;
    }
}

// 🟢 دالة لإرسال رسالة إلى `Telegram`
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

// 🔵 الوظيفة الرئيسية لجلب الأسعار ومقارنة التغيرات
async function checkPrices() {
    let hasAlert = false;
    let priceMessage = "📢 *تحديث أسعار العملات* 📢\n\n";

    for (let tokenAddress of TOKEN_ADDRESSES) {
        const tokenData = await getTokenPrice(tokenAddress);

        if (tokenData) {
            const formattedPrice = formatPrice(tokenData.price);
            let tokenMessage = `🏷️ *${tokenData.symbol}* → ${formattedPrice} 📈 (${tokenData.exchange})`;

            // 🔥 مقارنة السعر السابق لإرسال تنبيه
            if (storedPrices[tokenAddress] !== undefined) {
                const previousPrice = storedPrices[tokenAddress];
                const percentageChange = ((tokenData.price - previousPrice) / previousPrice) * 100;

                if (percentageChange >= 10) {
                    tokenMessage += `\n🚀 *ارتفاع قوي!* 📈 +${percentageChange.toFixed(2)}%`;
                    hasAlert = true;
                } else if (percentageChange <= -10) {
                    tokenMessage += `\n⚠️ *انخفاض حاد!* 📉 ${percentageChange.toFixed(2)}%`;
                    hasAlert = true;
                }
            }

            // تحديث السعر المخزن
            storedPrices[tokenAddress] = tokenData.price;
            priceMessage += tokenMessage + "\n\n";
        }
    }

    // حفظ الأسعار الجديدة في `prices.json`
    fs.writeFileSync(PRICES_FILE, JSON.stringify(storedPrices, null, 2));

    // إرسال التحديث فقط إذا كان هناك تغيير بنسبة 10%
    if (hasAlert) {
        priceMessage = "🚨 *تنبيه هام!* 🚨\n\n" + priceMessage;
        await sendTelegramMessage(priceMessage);
    }
}

// 🔵 وظيفة إرسال الأسعار كل ساعة
async function sendHourlyUpdate() {
    let hourlyMessage = "⏰ *تحديث الأسعار (كل ساعة)* ⏰\n\n";

    for (let tokenAddress of TOKEN_ADDRESSES) {
        const tokenData = await getTokenPrice(tokenAddress);

        if (tokenData) {
            const formattedPrice = formatPrice(tokenData.price);
            hourlyMessage += `🏷️ *${tokenData.symbol}* → ${formattedPrice} 📈 (${tokenData.exchange})\n\n`;
        }
    }

    hourlyMessage += "📅 *التحديث التالي بعد ساعة* ⏳";
    await sendTelegramMessage(hourlyMessage);
}

// ⏰ جدولة الفحوصات
setInterval(checkPrices, 5 * 60 * 1000); // 🔍 فحص السعر كل 5 دقائق
setInterval(sendHourlyUpdate, 60 * 60 * 1000); // ⏰ إرسال الأسعار كل ساعة

// 🔥 تشغيل البوت فورًا عند البدء
checkPrices();
sendHourlyUpdate();
