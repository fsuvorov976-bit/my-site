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

app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const TELEGRAM_BOT_TOKEN =
    process.env.TELEGRAM_BOT_TOKEN || '8732883413:AAG8a_PO13LBzStSJpyMqSDiJyz2rDOrsz4';

const TELEGRAM_CHAT_ID =
    process.env.TELEGRAM_CHAT_ID || '6432307028';

const ADMIN_CREDENTIALS = {
    username:
        process.env.ADMIN_USERNAME ||
        'fsuvorov976@gmail.com',
    password:
        process.env.ADMIN_PASSWORD ||
        '0631023827Aa'
};


/*
|--------------------------------------------------------------------------
| КОДЫ ТОВАРОВ
|--------------------------------------------------------------------------
| Каждый товар получает уникальный постоянный 8-значный код.
| Код сохраняется в products.json и одинаковый для всех пользователей.
|--------------------------------------------------------------------------
*/

function generate8DigitCode() {
    return Math.floor(
        10000000 +
        Math.random() * 90000000
    ).toString();
}

function isValid8DigitCode(code) {
    return /^\d{8}$/.test(
        String(code || '').trim()
    );
}

function generateUnique8DigitCode(usedCodes) {
    let code;

    do {
        code = generate8DigitCode();
    } while (usedCodes.has(code));

    usedCodes.add(code);

    return code;
}

function getProductExistingCode(product) {
    if (!product) {
        return '';
    }

    const possibleCodes = [
        product.Код_товара,
        product.Идентификатор_товара,
        product.productCode,
        product.code
    ];

    for (const code of possibleCodes) {
        const normalized =
            String(code || '').trim();

        if (isValid8DigitCode(normalized)) {
            return normalized;
        }
    }

    return '';
}

function getProductTitleForMatch(product) {
    if (!product) {
        return '';
    }

    return String(
        product.title ||
        product.Название_позиции ||
        product.Название_позиции_укр ||
        product.Назва ||
        product.Title ||
        ''
    ).trim();
}

function ensureProductCodes(products) {
    if (!Array.isArray(products)) {
        return products;
    }

    const usedCodes = new Set();

    let changed = false;

    /*
     * Сначала собираем уже существующие
     * корректные 8-значные коды.
     */
    for (const product of products) {
        const existingCode =
            getProductExistingCode(product);

        if (
            existingCode &&
            !usedCodes.has(existingCode)
        ) {
            usedCodes.add(existingCode);
        }
    }

    /*
     * Затем каждому товару без корректного
     * уникального кода выдаём новый.
     */
    for (const product of products) {
        if (!product || typeof product !== 'object') {
            continue;
        }

        let code =
            getProductExistingCode(product);

        /*
         * Если код отсутствует либо оказался
         * дубликатом — создаём новый.
         */
        if (
            !code ||
            !product.Код_товара ||
            String(
                product.Код_товара
            ).trim() !== code
        ) {
            code =
                generateUnique8DigitCode(
                    usedCodes
                );

            product.Код_товара = code;

            changed = true;
        } else {
            product.Код_товара = code;
        }
    }

    return {
        products,
        changed
    };
}


/*
|--------------------------------------------------------------------------
| JSON
|--------------------------------------------------------------------------
*/

function readJsonFile(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            return fallback;
        }

        const raw =
            fs.readFileSync(
                file,
                'utf8'
            ).trim();

        if (!raw) {
            return fallback;
        }

        return JSON.parse(raw);

    } catch (error) {
        console.error(
            `Ошибка чтения ${file}:`,
            error
        );

        return fallback;
    }
}

function writeJsonFile(file, data) {
    const tempFile =
        `${file}.tmp`;

    fs.writeFileSync(
        tempFile,
        JSON.stringify(
            data,
            null,
            2
        ),
        'utf8'
    );

    fs.renameSync(
        tempFile,
        file
    );
}


/*
|--------------------------------------------------------------------------
| ТОВАРЫ
|--------------------------------------------------------------------------
*/

function getProducts() {
    const products =
        readJsonFile(
            DATA_FILE,
            []
        );

    if (!Array.isArray(products)) {
        return [];
    }

    /*
     * Автоматически проверяем старые товары.
     * Если у товара нет постоянного 8-значного
     * кода — выдаём его и сохраняем.
     */
    const result =
        ensureProductCodes(
            products
        );

    if (result.changed) {
        writeJsonFile(
            DATA_FILE,
            result.products
        );
    }

    return result.products;
}


/*
|--------------------------------------------------------------------------
| БРЕНДЫ
|--------------------------------------------------------------------------
*/

function normalizeBrand(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return '';
    }

    return String(value).trim();
}

function uniqueBrands(brands) {
    const result = [];
    const seen = new Set();

    for (const brand of brands) {
        const name =
            normalizeBrand(brand);

        if (!name) {
            continue;
        }

        if (
            name.toLowerCase() ===
            'не вказано'
        ) {
            continue;
        }

        const key =
            name.toLowerCase();

        if (!seen.has(key)) {
            seen.add(key);
            result.push(name);
        }
    }

    return result.sort(
        (a, b) =>
            a.localeCompare(
                b,
                'uk'
            )
    );
}

function getBrands() {
    const brands =
        readJsonFile(
            BRANDS_FILE,
            []
        );

    return Array.isArray(brands)
        ? uniqueBrands(brands)
        : [];
}

function saveBrands(brands) {
    writeJsonFile(
        BRANDS_FILE,
        uniqueBrands(brands)
    );
}

function getManufacturerFromProduct(product) {
    if (!product) {
        return '';
    }

    return normalizeBrand(
        product.Производитель ||
        product.Виробник ||
        product.Manufacturer ||
        product.manufacturer ||
        product.Brand ||
        product.brand ||
        ''
    );
}

function extractBrandsFromProducts(products) {
    const brands = [];

    for (const product of products) {
        const manufacturer =
            getManufacturerFromProduct(
                product
            );

        if (manufacturer) {
            brands.push(
                manufacturer
            );
        }
    }

    return uniqueBrands(
        brands
    );
}

function syncBrandsFromProducts(products) {
    const existingBrands =
        getBrands();

    const productBrands =
        extractBrandsFromProducts(
            products
        );

    const allBrands =
        uniqueBrands([
            ...existingBrands,
            ...productBrands
        ]);

    saveBrands(
        allBrands
    );

    return allBrands;
}


/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

app.post(
    '/api/login',
    (req, res) => {
        const {
            username,
            password
        } = req.body || {};

        if (
            username ===
            ADMIN_CREDENTIALS.username &&
            password ===
            ADMIN_CREDENTIALS.password
        ) {
            return res.json({
                success: true
            });
        }

        return res.json({
            success: false,
            error:
                'Невірний логін або пароль'
        });
    }
);


/*
|--------------------------------------------------------------------------
| ПОЛУЧЕНИЕ ТОВАРОВ
|--------------------------------------------------------------------------
*/

app.get(
    '/api/products',
    (req, res) => {
        try {
            const products =
                getProducts();

            syncBrandsFromProducts(
                products
            );

            return res.json(
                products
            );

        } catch (error) {
            console.error(
                'Ошибка получения товаров:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'Помилка читання товарів'
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| БРЕНДЫ
|--------------------------------------------------------------------------
*/

app.get(
    '/api/brands',
    (req, res) => {
        try {
            const products =
                getProducts();

            const brands =
                syncBrandsFromProducts(
                    products
                );

            return res.json(
                brands
            );

        } catch (error) {
            console.error(
                'Ошибка получения производителей:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'Помилка завантаження виробників'
            });
        }
    }
);

app.post(
    '/api/brands',
    (req, res) => {
        try {
            const name =
                normalizeBrand(
                    req.body &&
                    req.body.name
                );

            if (!name) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Назва виробника не може бути порожньою'
                });
            }

            const brands =
                getBrands();

            const exists =
                brands.some(
                    brand =>
                        brand.toLowerCase() ===
                        name.toLowerCase()
                );

            if (!exists) {
                brands.push(name);

                saveBrands(
                    brands
                );
            }

            return res.json({
                success: true,
                brand: name,
                brands:
                    getBrands()
            });

        } catch (error) {
            console.error(
                'Ошибка добавления производителя:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'Помилка збереження виробника'
            });
        }
    }
);

app.delete(
    '/api/brands',
    (req, res) => {
        try {
            const name =
                normalizeBrand(
                    req.body &&
                    req.body.name
                );

            if (!name) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Не вказано виробника'
                });
            }

            const brands =
                getBrands();

            const filtered =
                brands.filter(
                    brand =>
                        brand.toLowerCase() !==
                        name.toLowerCase()
                );

            saveBrands(
                filtered
            );

            return res.json({
                success: true,
                brands:
                    getBrands()
            });

        } catch (error) {
            console.error(
                'Ошибка удаления производителя:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'Помилка видалення виробника'
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| ОБНОВЛЕНИЕ ТОВАРА
|--------------------------------------------------------------------------
*/

app.post(
    '/api/update-product',
    (req, res) => {
        const updatedProduct =
            req.body || {};

        if (
            !fs.existsSync(
                DATA_FILE
            )
        ) {
            return res.status(404).json({
                success: false,
                error:
                    'Файл з даними не знайдено'
            });
        }

        try {
            const products =
                getProducts();

            const index =
                products.findIndex(
                    product =>
                        product.title ===
                        updatedProduct.title ||
                        product.id ===
                        updatedProduct.id ||
                        product.Код_товара ===
                        updatedProduct.Код_товара
                );

            if (index === -1) {
                return res.status(404).json({
                    success: false,
                    error:
                        'Товар не знайдено'
                });
            }

            /*
             * Не даём случайно изменить
             * постоянный код товара.
             *
             * Если обновление содержит другой
             * код — сохраняем старый.
             */
            const permanentCode =
                getProductExistingCode(
                    products[index]
                ) ||
                generateUnique8DigitCode(
                    new Set(
                        products
                            .map(
                                getProductExistingCode
                            )
                            .filter(Boolean)
                    )
                );

            products[index] = {
                ...products[index],
                ...updatedProduct,
                Код_товара:
                permanentCode
            };

            writeJsonFile(
                DATA_FILE,
                products
            );

            syncBrandsFromProducts(
                products
            );

            return res.json({
                success: true,
                productCode:
                permanentCode
            });

        } catch (error) {
            console.error(
                'Ошибка обновления товара:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'Помилка збереження товару'
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| ЗАГРУЗКА EXCEL
|--------------------------------------------------------------------------
*/

app.post(
    '/api/upload',
    upload.single(
        'excelFile'
    ),
    (req, res) => {

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error:
                    'Файл не завантажено'
            });
        }

        try {
            const oldProducts =
                getProducts();

            const oldBrands =
                getBrands();

            /*
             * Собираем все уже существующие
             * коды, чтобы новые никогда
             * не получили дубликат.
             */
            const usedCodes =
                new Set();

            oldProducts.forEach(
                product => {
                    const code =
                        getProductExistingCode(
                            product
                        );

                    if (code) {
                        usedCodes.add(code);
                    }
                }
            );

            const workbook =
                xlsx.readFile(
                    req.file.path
                );

            if (
                !workbook.SheetNames ||
                workbook.SheetNames.length === 0
            ) {
                throw new Error(
                    'В Excel-файле нет листов'
                );
            }

            let worksheet =
                workbook.Sheets[
                    workbook.SheetNames[0]
                    ];

            let rows =
                xlsx.utils.sheet_to_json(
                    worksheet,
                    {
                        defval: '',
                        raw: false
                    }
                );

            if (
                rows.length === 0 &&
                workbook.SheetNames.length > 1
            ) {
                worksheet =
                    workbook.Sheets[
                        workbook.SheetNames[1]
                        ];

                rows =
                    xlsx.utils.sheet_to_json(
                        worksheet,
                        {
                            defval: '',
                            raw: false
                        }
                    );
            }

            const products =
                rows.map(
                    (row, index) => {

                        const title =
                            row['Название_позиции'] ||
                            row['Название_позиции_укр'] ||
                            row['Назва'] ||
                            row['Title'] ||
                            'Без назви';

                        const normalizedTitle =
                            String(
                                title
                            ).trim();

                        const priceValue =
                            String(
                                row['Цена'] ||
                                row['Цена_от'] ||
                                row['Ціна'] ||
                                row['Price'] ||
                                '0'
                            )
                                .replace(
                                    /\s/g,
                                    ''
                                )
                                .replace(
                                    ',',
                                    '.'
                                );

                        const parsedPrice =
                            parseFloat(
                                priceValue
                            );

                        const price =
                            Number.isFinite(
                                parsedPrice
                            )
                                ? parsedPrice
                                : 0;

                        const imgUrl =
                            row[
                                'Ссылка_изображения'
                                ] ||
                            row[
                                'Изображение'
                                ] ||
                            row[
                                'Фото'
                                ] ||
                            row[
                                'Image'
                                ] ||
                            '';

                        const firstImg =
                            imgUrl
                                ? String(
                                    imgUrl
                                )
                                    .split(
                                        ','
                                    )[0]
                                    .trim()
                                : '';

                        /*
                         * Ищем уже существующий товар.
                         *
                         * Сначала по коду из Excel,
                         * если он 8-значный.
                         *
                         * Затем по названию.
                         */
                        const excelCode =
                            String(
                                row[
                                    'Код_товара'
                                    ] ||
                                row[
                                    'Идентификатор_товара'
                                    ] ||
                                ''
                            ).trim();

                        let existingProduct =
                            null;

                        if (
                            isValid8DigitCode(
                                excelCode
                            )
                        ) {
                            existingProduct =
                                oldProducts.find(
                                    product =>
                                        getProductExistingCode(
                                            product
                                        ) ===
                                        excelCode
                                );
                        }

                        if (
                            !existingProduct
                        ) {
                            existingProduct =
                                oldProducts.find(
                                    product =>
                                        getProductTitleForMatch(
                                            product
                                        ) ===
                                        normalizedTitle
                                );
                        }

                        /*
                         * Самое важное:
                         *
                         * если товар уже существует,
                         * оставляем его постоянный код.
                         *
                         * если товара ещё не было —
                         * создаём новый уникальный 8-значный код.
                         */
                        let productCode =
                            existingProduct
                                ? getProductExistingCode(
                                    existingProduct
                                )
                                : '';

                        if (
                            !productCode
                        ) {
                            productCode =
                                generateUnique8DigitCode(
                                    usedCodes
                                );
                        } else {
                            usedCodes.add(
                                productCode
                            );
                        }

                        let productType =
                            row[
                                'Тип_товара'
                                ] ||
                            row[
                                'Тип товару'
                                ];

                        if (
                            !productType ||
                            String(
                                productType
                            ).trim() === ''
                        ) {
                            productType =
                                row[
                                    'Название_группы'
                                    ] ||
                                row[
                                    'Назва_групи'
                                    ] ||
                                (
                                    existingProduct &&
                                    (
                                        existingProduct.Тип_товара ||
                                        existingProduct['Тип товару']
                                    )
                                ) ||
                                'Не вказано';
                        }

                        let manufacturer =
                            row[
                                'Производитель'
                                ] ||
                            row[
                                'Виробник'
                                ] ||
                            row[
                                'Manufacturer'
                                ] ||
                            row[
                                'Производитель_товара'
                                ] ||
                            row[
                                'Бренд'
                                ] ||
                            row[
                                'Brand'
                                ] ||
                            '';

                        if (
                            !manufacturer ||
                            String(
                                manufacturer
                            ).trim() === ''
                        ) {
                            manufacturer =
                                getManufacturerFromProduct(
                                    existingProduct
                                );
                        }

                        manufacturer =
                            normalizeBrand(
                                manufacturer
                            );

                        const product = {
                            ...row,

                            id:
                                index + 1,

                            title:
                                String(
                                    title
                                ),

                            price,

                            image:
                            firstImg,

                            /*
                             * Постоянный 8-значный код.
                             */
                            Код_товара:
                            productCode,

                            /*
                             * Также сохраняем его
                             * в отдельном поле,
                             * чтобы фронтенд мог
                             * использовать любое
                             * из них при необходимости.
                             */
                            productCode:
                            productCode,

                            Тип_товара:
                                String(
                                    productType ||
                                    'Не вказано'
                                ),

                            Производитель:
                                manufacturer ||
                                'Не вказано'
                        };

                        return product;
                    }
                );

            /*
             * На всякий случай ещё раз проверяем
             * все товары после импорта.
             */
            const ensured =
                ensureProductCodes(
                    products
                );

            const finalProducts =
                ensured.products;

            const manufacturersFromExcel =
                rows
                    .map(row =>
                        normalizeBrand(
                            row[
                                'Производитель'
                                ] ||
                            row[
                                'Виробник'
                                ] ||
                            row[
                                'Manufacturer'
                                ] ||
                            row[
                                'Производитель_товара'
                                ] ||
                            row[
                                'Бренд'
                                ] ||
                            row[
                                'Brand'
                                ] ||
                            ''
                        )
                    )
                    .filter(Boolean);

            const manufacturersFromProducts =
                finalProducts
                    .map(
                        getManufacturerFromProduct
                    )
                    .filter(Boolean);

            const manufacturersFromOldProducts =
                oldProducts
                    .map(
                        getManufacturerFromProduct
                    )
                    .filter(Boolean);

            const allBrands =
                uniqueBrands([
                    ...oldBrands,

                    ...manufacturersFromOldProducts,

                    ...manufacturersFromExcel,

                    ...manufacturersFromProducts
                ]);

            writeJsonFile(
                DATA_FILE,
                finalProducts
            );

            saveBrands(
                allBrands
            );

            try {
                fs.unlinkSync(
                    req.file.path
                );
            } catch (error) {
                console.warn(
                    'Не удалось удалить временный файл:',
                    error.message
                );
            }

            return res.json({
                success: true,

                count:
                finalProducts.length,

                brandsCount:
                allBrands.length,

                brands:
                allBrands
            });

        } catch (error) {

            console.error(
                'Ошибка обработки Excel:',
                error
            );

            try {
                if (
                    req.file &&
                    fs.existsSync(
                        req.file.path
                    )
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


/*
|--------------------------------------------------------------------------
| ЗАКАЗ
|--------------------------------------------------------------------------
*/

app.post(
    '/api/order',
    async (req, res) => {

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
                (
                    await import(
                        'node-fetch'
                        )
                ).default;

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

                        body:
                            JSON.stringify({
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

            return res.json({
                success: false,
                error:
                result.description
            });

        } catch (error) {

            console.error(
                'Ошибка Telegram:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                error.message
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| ИНИЦИАЛИЗАЦИЯ
|--------------------------------------------------------------------------
*/

if (
    !fs.existsSync(
        BRANDS_FILE
    )
) {

    const products =
        getProducts();

    const brands =
        extractBrandsFromProducts(
            products
        );

    saveBrands(
        brands
    );

} else {

    syncBrandsFromProducts(
        getProducts()
    );
}


/*
|--------------------------------------------------------------------------
| ЗАПУСК СЕРВЕРА
|--------------------------------------------------------------------------
*/

const PORT =
    process.env.PORT || 3000;

app.listen(
    PORT,
    () => {

        const products =
            getProducts();

        console.log(
            `Сервер запущено: http://localhost:${PORT}`
        );

        console.log(
            `Товаров: ${products.length}`
        );

        console.log(
            `Производителей: ${getBrands().length}`
        );

        console.log(
            'Постоянные 8-значные коды товаров включены.'
        );
    }
);