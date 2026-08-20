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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущено! Відкрийте: http://localhost:${PORT}`);
});