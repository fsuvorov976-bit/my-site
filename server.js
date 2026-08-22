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
    process.env.TELEGRAM_BOT_TOKEN || '';

const TELEGRAM_CHAT_ID =
    process.env.TELEGRAM_CHAT_ID || '';

const ADMIN_CREDENTIALS = {
    username:
        process.env.ADMIN_USERNAME ||
        '',
    password:
        process.env.ADMIN_PASSWORD ||
        ''
};

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
        return {
            products,
            changed: false
        };
    }

    const usedCodes = new Set();
    const assignedCodes = new Set();

    let changed = false;

    for (const product of products) {
        if (!product || typeof product !== 'object') {
            continue;
        }

        const code =
            getProductExistingCode(product);

        if (code && !usedCodes.has(code)) {
            usedCodes.add(code);
        }
    }

    for (const product of products) {
        if (!product || typeof product !== 'object') {
            continue;
        }

        let code =
            getProductExistingCode(product);

        if (!code || assignedCodes.has(code)) {
            code =
                generateUnique8DigitCode(
                    usedCodes
                );

            changed = true;
        }

        if (
            String(
                product.Код_товара || ''
            ).trim() !== code
        ) {
            changed = true;
        }

        if (
            String(
                product.productCode || ''
            ).trim() !== code
        ) {
            changed = true;
        }

        product.Код_товара = code;
        product.productCode = code;

        assignedCodes.add(code);
    }

    return {
        products,
        changed
    };
}

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

function getProducts() {
    const products =
        readJsonFile(
            DATA_FILE,
            []
        );

    if (!Array.isArray(products)) {
        return [];
    }

    const result =
        ensureProductCodes(
            products
        );

    let changed =
        result.changed;

    for (const product of result.products) {
        const manufacturer =
            getManufacturerFromProduct(
                product
            );

        const finalManufacturer =
            manufacturer ||
            'Не вказано';

        if (
            String(
                product.Производитель ||
                ''
            ).trim() !==
            finalManufacturer
        ) {
            product.Производитель =
                finalManufacturer;

            changed = true;
        }
    }

    if (changed) {
        writeJsonFile(
            DATA_FILE,
            result.products
        );
    }

    return result.products;
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

app.post(
    '/api/delete-products',
    (req, res) => {
        try {
            const codes =
                Array.isArray(
                    req.body &&
                    req.body.codes
                )
                    ? req.body.codes
                        .map(code =>
                            String(
                                code || ''
                            ).trim()
                        )
                        .filter(Boolean)
                    : [];

            const titles =
                Array.isArray(
                    req.body &&
                    req.body.titles
                )
                    ? req.body.titles
                        .map(title =>
                            String(
                                title || ''
                            ).trim()
                        )
                        .filter(Boolean)
                    : [];

            if (
                codes.length === 0 &&
                titles.length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    error:
                        'Не вибрано товари для видалення'
                });
            }

            const codeSet =
                new Set(codes);

            const titleSet =
                new Set(titles);

            const products =
                getProducts();

            const deleted = [];
            const remaining = [];

            for (const product of products) {
                const code =
                    getProductExistingCode(
                        product
                    );

                const title =
                    getProductTitleForMatch(
                        product
                    );

                if (
                    codeSet.has(code) ||
                    (
                        !code &&
                        titleSet.has(title)
                    )
                ) {
                    deleted.push(
                        product
                    );
                } else {
                    remaining.push(
                        product
                    );
                }
            }

            writeJsonFile(
                DATA_FILE,
                remaining
            );

            syncBrandsFromProducts(
                remaining
            );

            return res.json({
                success: true,
                deletedCount:
                deleted.length,
                products:
                remaining
            });

        } catch (error) {
            console.error(
                'Ошибка массового удаления товаров:',
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    'Помилка масового видалення товарів'
            });
        }
    }
);

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
                        updatedProduct.Код_товара ||
                        product.Код_товара ===
                        updatedProduct.productCode
                );

            if (index === -1) {
                return res.status(404).json({
                    success: false,
                    error:
                        'Товар не знайдено'
                });
            }

            const usedCodes =
                new Set(
                    products
                        .map(
                            getProductExistingCode
                        )
                        .filter(Boolean)
                );

            const permanentCode =
                getProductExistingCode(
                    products[index]
                ) ||
                generateUnique8DigitCode(
                    usedCodes
                );

            const oldManufacturer =
                getManufacturerFromProduct(
                    products[index]
                );

            const newManufacturer =
                getManufacturerFromProduct(
                    updatedProduct
                ) ||
                oldManufacturer ||
                'Не вказано';

            products[index] = {
                ...products[index],
                ...updatedProduct,
                Код_товара:
                permanentCode,
                productCode:
                permanentCode,
                Производитель:
                newManufacturer
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
                permanentCode,
                product:
                    products[index]
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

            const usedCodes =
                new Set();

            oldProducts.forEach(
                product => {
                    const code =
                        getProductExistingCode(
                            product
                        );

                    if (code) {
                        usedCodes.add(
                            code
                        );
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
                            row[
                                'Название_позиции'
                                ] ||
                            row[
                                'Название_позиции_укр'
                                ] ||
                            row[
                                'Назва'
                                ] ||
                            row[
                                'Title'
                                ] ||
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

                        let productCode =
                            existingProduct
                                ? getProductExistingCode(
                                    existingProduct
                                )
                                : '';

                        if (!productCode) {
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

                            Код_товара:
                            productCode,

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

            const ensured =
                ensureProductCodes(
                    products
                );

            const finalProducts =
                ensured.products;

            const manufacturersFromExcel =
                rows
                    .map(
                        row =>
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
                        `${item.price || 0} ₴`;

                    if (
                        item.Код_товара ||
                        item.productCode
                    ) {
                        message +=
                            ` [код: ${
                                item.Код_товара ||
                                item.productCode
                            }]`;
                    }

                    message += '\n';
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

const PORT =
    process.env.PORT || 3000;

app.listen(
    PORT,
    () => {

        console.log(
            `Сервер запущено: http://localhost:${PORT}`
        );

        console.log(
            `Товаров: ${getProducts().length}`
        );

        console.log(
            `Производителей: ${getBrands().length}`
        );
    }
);