const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 ЗАДАЙ СВОЙ ПАРОЛЬ АДМИНА ЗДЕСЬ (или через process.env.ADMIN_PASSWORD на Render)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'adminpass123';

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
    next(); // Пароль верный — пропускаем дальше
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

// GET: Получить товары (доступно всем пользователям)
app.get('/api/products', (req, res) => {
    res.json(catalog);
});

app.get('/api/catalog', (req, res) => {
    res.json(catalog);
});

// POST: Добавить товар (ЗАЩИЩЕНО ПАРОЛЕМ!)
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

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});