const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Настройка CORS (разрешаем запросы с GitHub Pages и кастомные заголовки)
app.use(cors({
    origin: '*',
    allowedHeaders: ['Content-Type', 'x-admin-password', 'Authorization']
}));

app.use(express.json());

// 2. Раздача статических файлов
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// База данных товаров (в памяти)
let catalog = [
    { id: 1, name: 'Беспроводные наушники TWS', category: 'Электроника', price: 650, image: '', description: '' },
    { id: 2, name: 'Смарт-часы спортивные', category: 'Электроника', price: 1200, image: '', description: '' },
    { id: 3, name: 'Набор авто-инструментов 108 предм.', category: 'Автотовары', price: 2400, image: '', description: '' },
    { id: 4, name: 'Кроссовки мужские летние', category: 'Одежда и обувь', price: 950, image: '', description: '' },
    { id: 5, name: 'Настольная светодиодная лампа', category: 'Дом и сад', price: 420, image: '', description: '' },
    { id: 6, name: 'Рюкзак городской водонепроницаемый', category: 'Одежда и обувь', price: 780, image: '', description: '' }
];

// --- ЭНДПОИНТЫ API ---

// GET: Получить все товары (для каталога)
app.get('/api/products', (req, res) => {
    res.json(catalog);
});

// Дополнительный роут для совместимости
app.get('/api/catalog', (req, res) => {
    res.json(catalog);
});

// POST: Добавить новый товар (вызывается из админки)
app.post('/api/products', (req, res) => {
    const { name, price, image, description } = req.body;

    if (!name || !price) {
        return res.status(400).json({ error: 'Название и цена обязательны!' });
    }

    const newProduct = {
        id: Date.now(), // Уникальный ID
        name,
        price: Number(price),
        image: image || '',
        description: description || ''
    };

    catalog.push(newProduct);
    console.log('✅ Добавлен новый товар:', newProduct);

    res.status(201).json({ message: 'Товар успешно сохранен!', product: newProduct });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер Prom-маркетплейса запущен на порту ${PORT}`);
});