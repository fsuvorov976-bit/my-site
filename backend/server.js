const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 ПАРОЛЬ АДМИНА
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminpass123';

// 🤖 ДАННЫЕ ТЕЛЕГРАМ БОТА
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8732883413:AAG8a_PO13LBzStSJpyMqSDiJyz2rDOrsz4';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '6432307028';

// ✉️ НАСТРОЙКА ПОЧТЫ (NODEMAILER)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'fsuvorov976@gmail.com',
        pass: process.env.EMAIL_PASS || 'ldwx okkq qzwd qldr'
    }
});

// Базы данных в памяти
let users = [];        // Зарегистрированные и подтвержденные пользователи
let pendingUsers = []; // Пользователи, ожидающие ввода кода подтверждения

// 1. Настройка CORS (разрешаем запросы с любых сайтов, включая ваш GitHub Pages)
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

// --- РОУТЫ КАТАЛОГА И АДМИНКИ ---

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

// --- РОУТЫ ДЛЯ АВТОРИЗАЦИИ И ПОДТВЕРЖДЕНИЯ ПО EMAIL ---

// 1. Регистрация (генерация и отправка кода на введенный пользователем email)
app.post('/api/register', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }

    if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'Такой email уже зарегистрирован' });
    }

    // Генерируем 6-значный код
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Сохраняем во временный массив
    pendingUsers = pendingUsers.filter(u => u.email !== email);
    pendingUsers.push({ email, password, code: verificationCode });

    try {
        await transporter.sendMail({
            from: '"Prom Demo" <fsuvorov976@gmail.com>', // Исправлено на ваш актуальный ящик
            to: email,
            subject: 'Код подтверждения регистрации',
            text: `Ваш код подтверждения: ${verificationCode}`
        });

        console.log(`✉️ Код подтверждения отправлен на ${email}: ${verificationCode}`);
        res.json({ success: true, message: 'Код подтверждения отправлен на ваш email!' });
    } catch (error) {
        console.error('❌ Ошибка отправки email:', error);
        res.status(500).json({ error: 'Не удалось отправить письмо. Проверьте настройки почты.' });
    }
});

// 2. Проверка кода подтверждения
app.post('/api/verify', (req, res) => {
    const { email, code } = req.body;

    const pendingIndex = pendingUsers.findIndex(u => u.email === email && u.code === code);
    if (pendingIndex === -1) {
        return res.status(400).json({ error: 'Неверный код или истек срок действия' });
    }

    const user = pendingUsers[pendingIndex];
    users.push({ id: Date.now(), email: user.email, password: user.password });
    pendingUsers.splice(pendingIndex, 1); // Удаляем из временных

    console.log(`✅ Пользователь ${user.email} успешно подтвержден и зарегистрирован!`);
    res.json({ success: true, message: 'Аккаунт успешно подтвержден!', user: { email: user.email } });
});

// 3. Вход в аккаунт
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
        return res.status(400).json({ error: 'Неверный email или пароль' });
    }

    console.log(`🔑 Успешный вход пользователя: ${email}`);
    res.json({ success: true, message: 'Успешный вход!', user: { email: user.email } });
});

// --- РОУТ ДЛЯ ОФОРМЛЕНИЯ ЗАКАЗА И ОТПРАВКИ В ТЕЛЕГРАМ ---
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