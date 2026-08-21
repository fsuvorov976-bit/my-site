const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'products.json');

// --- НАЛАШТУВАННЯ TELEGRAM БОТА ---
const TELEGRAM_BOT_TOKEN = '8732883413:AAG8a_PO13LBzStSJpyMqSDiJyz2rDOrsz4';
const TELEGRAM_CHAT_ID = '6432307028';

// --- ДАНІ АДМІНІСТРАТОРА ---
// Можете змінити логін та пароль на свої власні
const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: '12345'
};

// --- ЕНДПОІНТ АВТОРИЗАЦІЇ АДМІНА ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Невірний логін або пароль' });
    }
});

app.get('/api/products', (req, res) => {
    if (fs.existsSync(DATA_FILE)) {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        res.json(JSON.parse(data));
    } else {
        res.json([]);
    }
});

app.post('/api/upload', upload.single('excelFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Файл не завантажено' });
    }

    try {
        const workbook = xlsx.readFile(req.file.path);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonRows = xlsx.utils.sheet_to_json(worksheet);

        const products = jsonRows.map((row, index) => {
            const title = row['Название_позиции'] || row['Название_позиции_укр'] || row['Назва'] || row['Title'] || 'Без назви';
            const price = parseFloat(row['Цена'] || row['Цена_от'] || row['Ціна'] || row['Price'] || 0);
            const imgUrl = row['Ссылка_изображения'] || row['Изображение'] || row['Фото'] || row['Image'] || '';

            let firstImg = '';
            if (imgUrl) {
                firstImg = imgUrl.toString().split(',')[0].trim();
            }

            return { id: index + 1, title, price, image: firstImg };
        });

        fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2));
        fs.unlinkSync(req.file.path);

        res.json({ success: true, count: products.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Помилка при обробці Excel файлу' });
    }
});

// --- ОБРОБНИК ЗАМОВЛЕНЬ ДЛЯ TELEGRAM ---
app.post('/api/order', async (req, res) => {
    const { lastName, firstName, phone, cart, total, delivery, deliveryDetails, payment } = req.body;

    let message = `🛒 <b>Нове замовлення!</b>\n\n`;
    message += `👤 <b>Клієнт:</b> ${lastName} ${firstName}\n`;
    message += `📞 <b>Телефон:</b> ${phone}\n`;
    message += `🚚 <b>Доставка:</b> ${delivery}\n`;
    message += `📍 <b>Відділення/Адреса:</b> ${deliveryDetails || 'Не вказано'}\n`;
    message += `💳 <b>Оплата:</b> ${payment}\n\n`;
    message += `📦 <b>Товари:</b>\n`;

    if (cart && Array.isArray(cart)) {
        cart.forEach((item, index) => {
            message += `${index + 1}. ${item.title} — ${item.price} ₴\n`;
        });
    }

    message += `\n💰 <b>Разом до сплати:</b> ${total} ₴`;

    try {
        const fetch = (await import('node-fetch')).default;
        const telegramResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });

        const result = await telegramResponse.json();
        if (result.ok) {
            res.json({ success: true });
        } else {
            console.error('Telegram API error:', result);
            res.json({ success: false, error: result.description });
        }
    } catch (error) {
        console.error('Помилка відправки в Telegram:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущено! Відкрийте: http://localhost:${PORT}`);
});