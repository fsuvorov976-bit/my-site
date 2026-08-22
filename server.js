const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const app = express();

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DATA_FILE = path.join(__dirname, 'products.json');
const BRANDS_FILE = path.join(__dirname, 'brands.json');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
    dest: UPLOAD_DIR
});

app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8732883413:AAG8a_PO13LBzStSJpyMqSDiJyz2rDOrsz4';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '6432307028';

const ADMIN_CREDENTIALS = {
    username: process.env.ADMIN_USERNAME || 'fsuvorov976@gmail.com',
    password: process.env.ADMIN_PASSWORD || '0631023827Aa'
};

function generate8DigitCode() {
    return Math.floor(
        10000000 + Math.random() * 90000000
    ).toString();
}

function readJsonFile(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            return fallback;
        }

        const raw = fs.readFileSync(file, 'utf8').trim();

        if (!raw) {
            return fallback;
        }

        return JSON.parse(raw);
    } catch (error) {
        console.error(`Ошибка чтения файла ${file}:`, error);
        return fallback;
    }
}

function writeJsonFile(file, data) {
    const tempFile = `${file}.tmp`;

    fs.writeFileSync(
        tempFile,
        JSON.stringify(data, null, 2),
        'utf8'
    );

    fs.renameSync(tempFile, file);
}

function normalizeBrand(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value).trim();
}

function uniqueBrands(brands) {
    const result = [];
    const seen = new Set();

    for (const brand of brands) {
        const normalized = normalizeBrand(brand);

        if (!normalized) {
            continue;
        }

        if (normalized.toLowerCase() === 'не вказано') {
            continue;
        }

        const key = normalized.toLowerCase();

        if (!seen.has(key)) {
            seen.add(key);
            result.push(normalized);
        }
    }

    return result.sort((a, b) =>
        a.localeCompare(b, 'uk')
    );
}

function getProducts() {
    const products = readJsonFile(DATA_FILE, []);

    return Array.isArray(products)
        ? products
        : [];
}

function getBrands() {
    const brands = readJsonFile(BRANDS_FILE, []);

    if (!Array.isArray(brands)) {
        return [];
    }

    return uniqueBrands(brands);
}

function saveBrands(brands) {
    writeJsonFile(
        BRANDS_FILE,
        uniqueBrands(brands)
    );
}

function syncBrandsFromProducts(products) {
    const currentBrands = getBrands();

    const productBrands = products
        .map(product => {
            if (!product) {
                return '';
            }

            return (
                product.Производитель ||
                product.Виробник ||
                product.brand ||
                product.Brand ||
                ''
            );
        })
        .map(normalizeBrand)
        .filter(Boolean);

    const mergedBrands = uniqueBrands([
        ...currentBrands,
        ...productBrands
    ]);

    saveBrands(mergedBrands);

    return mergedBrands;
}

app.post('/api/login', (req, res) => {
    const {
        username,
        password
    } = req.body || {};

    if (
        username === ADMIN_CREDENTIALS.username &&
        password === ADMIN_CREDENTIALS.password
    ) {
        return res.json({
            success: true
        });
    }

    return res.json({
        success: false,
        error: 'Невірний логін або пароль'
    });
});

app.get('/api/products', (req, res) => {
    try {
        const products = getProducts();

        syncBrandsFromProducts(products);

        return res.json(products);
    } catch (error) {
        console.error(
            'Ошибка GET /api/products:',
            error
        );

        return res.status(500).json({
            success: false,
            error: 'Помилка читання товарів'
        });
    }
});

app.get('/api/brands', (req, res) => {
    try {
        const products = getProducts();

        const brands =
            syncBrandsFromProducts(products);

        return res.json(brands);
    } catch (error) {
        console.error(
            'Ошибка GET /api/brands:',
            error
        );

        return res.status(500).json({
            success: false,
            error: 'Помилка завантаження виробників'
        });
    }
});

app.post('/api/brands', (req, res) => {
    try {
        const name = normalizeBrand(
            req.body && req.body.name
        );

        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Назва виробника не може бути порожньою'
            });
        }

        const brands = getBrands();

        const exists = brands.some(
            brand =>
                brand.toLowerCase() ===
                name.toLowerCase()
        );

        if (!exists) {
            brands.push(name);
            saveBrands(brands);
        }

        return res.json({
            success: true,
            brand: name,
            brands: getBrands()
        });
    } catch (error) {
        console.error(
            'Ошибка POST /api/brands:',
            error
        );

        return res.status(500).json({
            success: false,
            error: 'Помилка збереження виробника'
        });
    }
});

app.delete('/api/brands', (req, res) => {
    try {
        const name = normalizeBrand(
            req.body && req.body.name
        );

        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Не вказано виробника'
            });
        }

        const brands = getBrands();

        const filtered = brands.filter(
            brand =>
                brand.toLowerCase() !==
                name.toLowerCase()
        );

        saveBrands(filtered);

        return res.json({
            success: true,
            brands: getBrands()
        });
    } catch (error) {
        console.error(
            'Ошибка DELETE /api/brands:',
            error
        );

        return res.status(500).json({
            success: false,
            error: 'Помилка видалення виробника'
        });
    }
});

app.post('/api/update-product', (req, res) => {
    const updatedProduct = req.body || {};

    if (!fs.existsSync(DATA_FILE)) {
        return res.status(404).json({
            success: false,
            error: 'Файл з даними не знайдено'
        });
    }

    try {
        const products = getProducts();

        const index = products.findIndex(product =>
            product.title === updatedProduct.title ||
            product.id === updatedProduct.id ||
            product.Код_товара === updatedProduct.Код_товара
        );

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: 'Товар не знайдено'
            });
        }

        products[index] = {
            ...products[index],
            ...updatedProduct
        };

        writeJsonFile(
            DATA_FILE,
            products
        );

        syncBrandsFromProducts(products);

        return res.json({
            success: true
        });
    } catch (error) {
        console.error(
            'Ошибка сохранения товара:',
            error
        );

        return res.status(500).json({
            success: false,
            error: 'Помилка збереження товару'
        });
    }
});

app.post(
    '/api/upload',
    upload.single('excelFile'),
    (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Файл не завантажено'
            });
        }

        try {
            const oldProducts = getProducts();
            const oldBrands = getBrands();

            const workbook =
                xlsx.readFile(req.file.path);

            if (
                !workbook.SheetNames ||
                workbook.SheetNames.length === 0
            ) {
                throw new Error(
                    'В Excel-файле нет листов'
                );
            }

            const worksheet =
                workbook.Sheets[
                    workbook.SheetNames[0]
                    ];

            const jsonRows =
                xlsx.utils.sheet_to_json(
                    worksheet,
                    {
                        defval: ''
                    }
                );

            const products = jsonRows.map(
                (row, index) => {
                    const title =
                        row['Название_позиции'] ||
                        row['Название_позиции_укр'] ||
                        row['Назва'] ||
                        row['Title'] ||
                        'Без назви';

                    const parsedPrice =
                        parseFloat(
                            String(
                                row['Цена'] ||
                                row['Цена_от'] ||
                                row['Ціна'] ||
                                row['Price'] ||
                                0
                            ).replace(',', '.')
                        );

                    const price =
                        Number.isFinite(parsedPrice)
                            ? parsedPrice
                            : 0;

                    const imgUrl =
                        row['Ссылка_изображения'] ||
                        row['Изображение'] ||
                        row['Фото'] ||
                        row['Image'] ||
                        '';

                    const firstImg =
                        imgUrl
                            ? String(imgUrl)
                                .split(',')[0]
                                .trim()
                            : '';

                    let productCode =
                        row['Код_товара'] ||
                        row['Идентификатор_товара'];

                    if (
                        !productCode ||
                        String(productCode).trim() === ''
                    ) {
                        productCode =
                            generate8DigitCode();
                    }

                    productCode =
                        String(productCode).trim();

                    const existingProduct =
                        oldProducts.find(product =>
                            String(
                                product.Код_товара || ''
                            ).trim() === productCode ||
                            String(
                                product.title || ''
                            ).trim() === String(title).trim()
                        );

                    let productType =
                        row['Тип_товара'] ||
                        row['Тип товару'];

                    if (
                        !productType ||
                        String(productType).trim() === ''
                    ) {
                        productType =
                            row['Название_группы'] ||
                            row['Назва_групи'] ||
                            (
                                existingProduct
                                    ? existingProduct.Тип_товара
                                    : 'Не вказано'
                            );
                    }

                    let manufacturer =
                        row['Производитель'] ||
                        row['Виробник'] ||
                        row['Бренд'] ||
                        row['Brand'];

                    if (
                        !manufacturer ||
                        String(manufacturer).trim() === ''
                    ) {
                        manufacturer =
                            existingProduct &&
                            (
                                existingProduct.Производитель ||
                                existingProduct.Виробник ||
                                existingProduct.brand
                            )
                                ? (
                                    existingProduct.Производитель ||
                                    existingProduct.Виробник ||
                                    existingProduct.brand
                                )
                                : 'Не вказано';
                    }

                    manufacturer =
                        normalizeBrand(
                            manufacturer
                        ) || 'Не вказано';

                    return {
                        ...row,
                        id: index + 1,
                        title: String(title),
                        price,
                        image: firstImg,
                        Код_товара: productCode,
                        Тип_товара: String(
                            productType ||
                            'Не вказано'
                        ),
                        Производитель:
                        manufacturer
                    };
                }
            );

            const manufacturersFromOldProducts =
                oldProducts
                    .map(product =>
                        product &&
                        (
                            product.Производитель ||
                            product.Виробник ||
                            product.brand ||
                            product.Brand
                        )
                    )
                    .map(normalizeBrand)
                    .filter(Boolean);

            const manufacturersFromNewProducts =
                products
                    .map(product =>
                        product.Производитель
                    )
                    .map(normalizeBrand)
                    .filter(Boolean);

            const allBrands =
                uniqueBrands([
                    ...oldBrands,
                    ...manufacturersFromOldProducts,
                    ...manufacturersFromNewProducts
                ]);

            writeJsonFile(
                DATA_FILE,
                products
            );

            saveBrands(allBrands);

            try {
                fs.unlinkSync(
                    req.file.path
                );
            } catch (unlinkError) {
                console.warn(
                    'Не удалось удалить временный Excel:',
                    unlinkError.message
                );
            }

            return res.json({
                success: true,
                count: products.length,
                brandsCount: allBrands.length
            });

        } catch (error) {
            console.error(
                'Ошибка обработки Excel:',
                error
            );

            try {
                if (
                    req.file &&
                    fs.existsSync(req.file.path)
                ) {
                    fs.unlinkSync(
                        req.file.path
                    );
                }
            } catch (_) {}

            return res.status(500).json({
                success: false,
                error:
                    'Помилка при обробці Excel файлу',
                details:
                error.message
            });
        }
    }
);

app.post('/api/order', async (req, res) => {
    const {
        lastName,
        firstName,
        phone,
        cart,
        total,
        delivery,
        deliveryDetails,
        payment
    } = req.body || {};

    let message =
        `🛒 <b>Нове замовлення!</b>\n\n`;

    message +=
        `👤 <b>Клієнт:</b> ` +
        `${lastName || ''} ` +
        `${firstName || ''}\n`;

    message +=
        `📞 <b>Телефон:</b> ` +
        `${phone || ''}\n`;

    message +=
        `🚚 <b>Доставка:</b> ` +
        `${delivery || ''}\n`;

    message +=
        `📍 <b>Відділення/Адреса:</b> ` +
        `${deliveryDetails || 'Не вказано'}\n`;

    message +=
        `💳 <b>Оплата:</b> ` +
        `${payment || ''}\n\n`;

    message +=
        `📦 <b>Товари:</b>\n`;

    if (
        cart &&
        Array.isArray(cart)
    ) {
        cart.forEach(
            (item, index) => {
                message +=
                    `${index + 1}. ` +
                    `${item.title || ''} — ` +
                    `${item.price || 0} ₴\n`;
            }
        );
    }

    message +=
        `\n💰 <b>Разом до сплати:</b> ` +
        `${total || 0} ₴`;

    if (
        !TELEGRAM_BOT_TOKEN ||
        !TELEGRAM_CHAT_ID
    ) {
        return res.status(500).json({
            success: false,
            error:
                'Telegram не налаштовано на сервері'
        });
    }

    try {
        const fetch =
            (await import('node-fetch')).default;

        const telegramResponse =
            await fetch(
                `https://api.telegram.org/` +
                `bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type':
                            'application/json'
                    },
                    body: JSON.stringify({
                        chat_id:
                        TELEGRAM_CHAT_ID,
                        text:
                        message,
                        parse_mode:
                            'HTML'
                    })
                }
            );

        const result =
            await telegramResponse.json();

        if (result.ok) {
            return res.json({
                success: true
            });
        }

        console.error(
            'Telegram API error:',
            result
        );

        return res.json({
            success: false,
            error:
            result.description
        });

    } catch (error) {
        console.error(
            'Ошибка отправки в Telegram:',
            error
        );

        return res.status(500).json({
            success: false,
            error:
            error.message
        });
    }
});

if (!fs.existsSync(BRANDS_FILE)) {
    const products =
        getProducts();

    const initialBrands =
        products
            .map(product =>
                product &&
                (
                    product.Производитель ||
                    product.Виробник ||
                    product.brand ||
                    product.Brand
                )
            )
            .map(normalizeBrand)
            .filter(Boolean);

    saveBrands(initialBrands);
} else {
    syncBrandsFromProducts(
        getProducts()
    );
}

const PORT =
    process.env.PORT || 3000;

app.listen(
    PORT,
    () => {
        console.log(
            `Сервер запущено! ` +
            `Відкрийте: http://localhost:${PORT}`
        );

        console.log(
            `Производителей сохранено: ` +
            `${getBrands().length}`
        );
    }
);