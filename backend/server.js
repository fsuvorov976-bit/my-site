const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 ПАРОЛЬ АДМИНА
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminpass123';

// 🤖 ДАННЫЕ ТЕЛЕГРАМ БОТА
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8732883413:AAG8a_PO13LBzStSJpMqSDiJyz2rDOrsZ4';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '6432307028';

// 1. Настройка CORS
app.use(cors({
    origin: '*',
    allowedHeaders: ['Content-Type', 'x-admin-password', 'Authorization']
}));

app.use(express.json());

// 2. Middleware для проверки пароля админа
const checkAdminAuth = (req, res, next) => {
    const userPassword = req.headers['x-admin-password'];

    if (userPassword !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Неверный пароль администратора!' });
    }
    next();
};

// 3. Раздача статики
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// База данных товаров
let catalog = [
    { id: 1, name: 'Беспроводные наушники TWS', category: 'Электроника', price: 650, image: '', description: '' },
    { id: 2, name: 'Смарт-часы спортивные', category: 'Электроника', price: 1200, image: '', description: '' },
    { id: 3, name: 'Набор авто-инструментов 108 предм.', category: 'Автотовары', price: 2400, image: '', description: '' },
    { id: 4, name: 'Кроссовки мужские летние', category: 'Одежда и обувь', price: 950, image: '', description: '' },
    { id: 5, name: 'Настольная светодиодная лампа', category: 'Дом и сад', price: 420, image: '', description: '' },
    { id: 6, name: 'Рюкзак городской водонепроницаемый', category: 'Одежда и обувь', price: 780, image: '', description: '' }
];

// --- РОУТЫ ---

app.get('/api/products', (req, res) => {
    res.json(catalog);
});

app.get('/api/catalog', (req, res) => {
    res.json(catalog);
});

app.post('/api/admin/login', checkAdminAuth, (req, res) => {
    res.json({ success: true, message: 'Авторизация успешна!' });
});

app.post('/api/products', checkAdminAuth, (req, res) => {
    const { name, price, image, description } = req.body;

    if (!name || !price) {
        return res.status(400).json({ error: 'Название и цена обязательны!' });
    }

    const newProduct = {
        id: Date.now(),
        name,
        price: Number(price),
        image: image || '',
        description: description || ''
    };

    catalog.push(newProduct);
    console.log('✅ Новый товар добавлен:', newProduct);

    res.status(201).json({ message: 'Товар успешно сохранен!', product: newProduct });
});

app.delete('/api/products/:id', checkAdminAuth, (req, res) => {
    const productId = Number(req.params.id);
    const productIndex = catalog.findIndex(p => p.id === productId);

    if (productIndex === -1) {
        return res.status(404).json({ error: 'Товар не найден!' });
    }

    const deletedProduct = catalog.splice(productIndex, 1);
    console.log('🗑️ Товар удален:', deletedProduct);

    res.json({ message: 'Товар успешно удален!', id: productId });
});

// --- РОУТ ДЛЯ ОФОРМЛЕНИЯ ЗАКАЗА И ОТПРАВКИ В ТЕЛЕГРАМ (Без разметки Markdown для стабильности) ---
app.post('/api/order', async (req, res) => {
    const { name, surname, address, phone, cart } = req.body;

    if (!name || !phone || !cart || cart.length === 0) {
        return res.status(400).json({ error: 'Недостаточно данных для заказа!' });
    }

    let total = 0;
    let productsListText = cart.map((item, index) => {
        total += item.price;
        return `${index + 1}. ${item.name} - ${item.price} ₴`;
    }).join('\n');

    const message =
        "🛒 Новый заказ в интернет-магазине!\n\n" +
        "👤 Имя: " + name + " " + surname + "\n" +
        "📞 Телефон: " + phone + "\n" +
        "📍 Адрес: " + address + "\n\n" +
        "📦 Товары:\n" + productsListText + "\n\n" +
        "💰 Итого к оплате: " + total + " ₴";

    try {
        const tgUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(tgUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message
            })
        });

        const data = await response.json();

        if (data.ok) {
            console.log('✅ Заказ успешно отправлен в Telegram!');
            res.json({ success: true, message: 'Заказ успешно оформлен!' });
        } else {
            console.error('❌ Ошибка Telegram API:', data);
            res.status(500).json({ error: 'Ошибка при отправке в Telegram' });
        }
    } catch (error) {
        console.error('❌ Ошибка сети:', error);
        res.status(500).json({ error: 'Не удалось связаться с сервером Telegram' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});