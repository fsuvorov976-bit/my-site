const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Отдаем файлы из папки frontend и admin
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// Расширенный список товаров в стиле Prom
let catalog = [
    { id: 1, name: 'Беспроводные наушники TWS', category: 'Электроника', price: 650 },
    { id: 2, name: 'Смарт-часы спортивные', category: 'Электроника', price: 1200 },
    { id: 3, name: 'Набор авто-инструментов 108 предм.', category: 'Автотовары', price: 2400 },
    { id: 4, name: 'Кроссовки мужские летние', category: 'Одежда и обувь', price: 950 },
    { id: 5, name: 'Настольная светодиодная лампа', category: 'Дом и сад', price: 420 },
    { id: 6, name: 'Рюкзак городской водонепроницаемый', category: 'Одежда и обувь', price: 780 }
];

app.get('/api/catalog', (req, res) => {
    res.json(catalog);
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер Prom-маркетплейса запущен: http://localhost:${PORT}`);
});