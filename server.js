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

// ============================================================
// TELEGRAM
// ============================================================

const TELEGRAM_BOT_TOKEN = '8732883413:AAG8a_PO13LBzStSJpyMqSDiJyz2rDOrsz4';
const TELEGRAM_CHAT_ID = '6432307028';

// ============================================================
// АДМИН
// ============================================================

const ADMIN_CREDENTIALS = {
    username: 'fsuvorov976@gmail.com',
    password: '0631023827Aa'
};

// ============================================================
// ГЕНЕРАЦИЯ УНИКАЛЬНОГО 8-ЗНАЧНОГО КОДА
// ============================================================

function generate8DigitCode(usedCodes = new Set()) {
    let code;

    do {
        code = Math.floor(
            10000000 + Math.random() * 90000000
        ).toString();
    } while (usedCodes.has(code));

    usedCodes.add(code);

    return code;
}

// ============================================================
// РАБОТА С PRODUCTS.JSON
// ============================================================

function readProducts() {

    if (!fs.existsSync(DATA_FILE)) {
        return [];
    }

    try {

        return JSON.parse(
            fs.readFileSync(DATA_FILE, 'utf8')
        );

    } catch (error) {

        console.error(
            'Ошибка чтения products.json:',
            error
        );

        return [];
    }
}


function writeProducts(products) {

    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(products, null, 2),
        'utf8'
    );
}


// ============================================================
// НОРМАЛИЗАЦИЯ ТОВАРА
// ============================================================

function normalizeProduct(product, index, usedCodes) {

    let code = String(
        product.productCode ||
        product.Код_товара ||
        ''
    ).trim();


    // Если кода нет или он неправильный —
    // создаём новый 8-значный.
    if (
        !/^\d{8}$/.test(code) ||
        usedCodes.has(code)
    ) {

        code = generate8DigitCode(usedCodes);

    } else {

        usedCodes.add(code);

    }


    const title =
        product.title ||
        product['Название_позиции'] ||
        product['Название_позиции_укр'] ||
        product['Назва'] ||
        product['Title'] ||
        'Без назви';


    // Производитель никогда не должен пропадать.
    const manufacturer = String(

        product.brand ||
        product.Производитель ||
        'Не вказано'

    ).trim() || 'Не вказано';


    const oldDeliveries =
        product.deliveries || {};


    return {

        ...product,

        id: product.id || index + 1,

        title: title,

        price: Number(product.price) || 0,

        image: product.image || '',


        // Постоянный код товара
        productCode: code,

        Код_товара: code,


        // Постоянный производитель
        Производитель: manufacturer,

        brand: manufacturer,


        Тип_товара:
            product.Тип_товара ||
            product.category ||
            product.Тип_запчасти ||
            'Не вказано',


        inStock:
            product.inStock !== undefined
                ? !!product.inStock
                : true,


        payments: {

            online:
                product.payments?.online !== false,

            cash:
                product.payments?.cash !== false,

            account:
                product.payments?.account !== false

        },


        deliveries: {

            // Курьер
            courier:
                oldDeliveries.courier !== undefined
                    ? !!oldDeliveries.courier
                    : oldDeliveries.np !== false,


            // Отделение
            branch:
                oldDeliveries.branch !== undefined
                    ? !!oldDeliveries.branch
                    : oldDeliveries.np !== false,


            // Почтомат
            postomat:
                oldDeliveries.postomat !== undefined
                    ? !!oldDeliveries.postomat
                    : oldDeliveries.np !== false,


            // Самовывоз
            pickup:
                oldDeliveries.pickup !== undefined
                    ? !!oldDeliveries.pickup
                    : true

        }

    };
}


// ============================================================
// ПРОВЕРКА ВСЕХ ТОВАРОВ
// ============================================================

function ensureProductData() {

    const products = readProducts();

    const usedCodes = new Set();


    const normalized = products.map(
        (product, index) =>
            normalizeProduct(
                product,
                index,
                usedCodes
            )
    );


    // Если что-то изменилось —
    // сохраняем обратно в products.json.
    if (
        JSON.stringify(products) !==
        JSON.stringify(normalized)
    ) {

        writeProducts(normalized);

    }


    return normalized;
}


// ============================================================
// АВТОРИЗАЦИЯ АДМИНА
// ============================================================

app.post('/api/login', (req, res) => {

    const {
        username,
        password
    } = req.body;


    if (
        username === ADMIN_CREDENTIALS.username &&
        password === ADMIN_CREDENTIALS.password
    ) {

        res.json({
            success: true
        });

    } else {

        res.json({
            success: false,
            error: 'Невірний логін або пароль'
        });

    }

});


// ============================================================
// ПОЛУЧИТЬ ТОВАРЫ
// ============================================================

app.get('/api/products', (req, res) => {

    res.json(
        ensureProductData()
    );

});


// ============================================================
// СОХРАНЕНИЕ НАСТРОЕК ТОВАРОВ
// ============================================================
//
// Сохраняет:
// - наличие
// - способы оплаты
// - способы доставки
//
// Всё хранится на сервере,
// поэтому localStorage больше не нужен
// для этих настроек.
// ============================================================

app.post('/api/products/config', (req, res) => {

    try {

        const products =
            ensureProductData();


        const updates =
            Array.isArray(req.body.updates)
                ? req.body.updates
                : [];


        const updateMap = new Map(

            updates.map(update => [

                String(
                    update.code || ''
                ).trim(),

                update

            ])

        );


        let changed = 0;


        products.forEach(product => {

            const code = String(

                product.productCode ||
                product.Код_товара ||
                ''

            );


            const update =
                updateMap.get(code);


            if (!update) {
                return;
            }


            // Наличие

            if (
                update.inStock !== undefined
            ) {

                product.inStock =
                    !!update.inStock;

            }


            // Оплата

            if (update.payments) {

                product.payments = {

                    online:
                        update.payments.online !== false,

                    cash:
                        update.payments.cash !== false,

                    account:
                        update.payments.account !== false

                };

            }


            // Доставка

            if (update.deliveries) {

                product.deliveries = {

                    courier:
                        update.deliveries.courier !== false,

                    branch:
                        update.deliveries.branch !== false,

                    postomat:
                        update.deliveries.postomat !== false,

                    pickup:
                        update.deliveries.pickup !== false

                };

            }


            changed++;

        });


        writeProducts(products);


        res.json({

            success: true,

            updated: changed

        });


    } catch (error) {

        console.error(error);


        res.status(500).json({

            success: false,

            error:
                'Не вдалося зберегти налаштування товарів'

        });

    }

});


// ============================================================
// МАССОВОЕ УДАЛЕНИЕ ТОВАРОВ
// ============================================================
//
// Принимает:
// {
//     "codes": [
//         "12345678",
//         "87654321"
//     ]
// }
//
// Удаляет сразу несколько выбранных товаров.
// ============================================================

app.post('/api/products/delete', (req, res) => {

    try {

        const codes =

            Array.isArray(req.body.codes)

                ? req.body.codes.map(
                    code =>
                        String(code).trim()
                )

                : [];


        if (!codes.length) {

            return res.status(400).json({

                success: false,

                error:
                    'Не вибрано товари'

            });

        }


        const codeSet =
            new Set(codes);


        const products =
            ensureProductData();


        const before =
            products.length;


        const remaining =
            products.filter(product => {

                const productCode = String(

                    product.productCode ||
                    product.Код_товара ||
                    ''

                );

                return !codeSet.has(
                    productCode
                );

            });


        writeProducts(
            remaining
        );


        res.json({

            success: true,

            deleted:
                before -
                remaining.length

        });


    } catch (error) {

        console.error(error);


        res.status(500).json({

            success: false,

            error:
                'Помилка масового видалення товарів'

        });

    }

});


// ============================================================
// ЗАГРУЗКА EXCEL
// ============================================================
//
// При загрузке Excel:
//
// 1. Старый товар сохраняет свой код.
// 2. Новый товар получает новый 8-значный код.
// 3. Производитель не стирается,
//    если в новом Excel его нет.
// 4. Настройки доставки сохраняются.
// 5. Настройки оплаты сохраняются.
// 6. Наличие сохраняется.
// ============================================================

app.post(
    '/api/upload',
    upload.single('excelFile'),
    (req, res) => {

        if (!req.file) {

            return res.status(400).json({

                error:
                    'Файл не завантажено'

            });

        }


        try {

            const oldProducts =
                ensureProductData();


            // Старые товары по коду

            const oldByCode =
                new Map(

                    oldProducts.map(p => [

                        String(
                            p.productCode ||
                            p.Код_товара ||
                            ''
                        ),

                        p

                    ])

                );


            // Старые товары по названию

            const oldByTitle =
                new Map(

                    oldProducts.map(p => [

                        String(
                            p.title || ''
                        )
                            .trim()
                            .toLowerCase(),

                        p

                    ])

                );


            const workbook =
                xlsx.readFile(
                    req.file.path
                );


            const worksheet =
                workbook.Sheets[
                    workbook.SheetNames[0]
                    ];


            const jsonRows =
                xlsx.utils.sheet_to_json(
                    worksheet
                );


            const usedCodes =
                new Set();


            const products =
                jsonRows.map(
                    (row, index) => {


                        // -----------------------------
                        // Название
                        // -----------------------------

                        const title =

                            row['Название_позиции'] ||

                            row['Название_позиции_укр'] ||

                            row['Назва'] ||

                            row['Title'] ||

                            'Без назви';


                        // -----------------------------
                        // Цена
                        // -----------------------------

                        const price =

                            parseFloat(

                                row['Цена'] ||

                                row['Цена_от'] ||

                                row['Ціна'] ||

                                row['Price'] ||

                                0

                            ) || 0;


                        // -----------------------------
                        // Фото
                        // -----------------------------

                        const imgUrl =

                            row['Ссылка_изображения'] ||

                            row['Изображение'] ||

                            row['Фото'] ||

                            row['Image'] ||

                            '';


                        const firstImg =

                            imgUrl

                                ? String(
                                    imgUrl
                                )
                                    .split(',')[0]
                                    .trim()

                                : '';


                        // -----------------------------
                        // Код из Excel
                        // -----------------------------

                        const excelCode = String(

                            row['Код_товара'] ||

                            row['Идентификатор_товара'] ||

                            ''

                        ).trim();


                        // -----------------------------
                        // Ищем старый товар
                        // -----------------------------

                        const oldProduct =

                            (
                                excelCode &&
                                oldByCode.get(
                                    excelCode
                                )
                            ) ||

                            oldByTitle.get(

                                String(title)
                                    .trim()
                                    .toLowerCase()

                            );


                        // -----------------------------
                        // Код товара
                        // -----------------------------

                        let productCode =

                            oldProduct?.productCode ||

                            oldProduct?.Код_товара ||

                            '';


                        // Если старого кода нет —
                        // генерируем новый.

                        if (

                            !/^\d{8}$/.test(
                                productCode
                            ) ||

                            usedCodes.has(
                                productCode
                            )

                        ) {

                            productCode =
                                generate8DigitCode(
                                    usedCodes
                                );

                        } else {

                            usedCodes.add(
                                productCode
                            );

                        }


                        // -----------------------------
                        // Тип товара
                        // -----------------------------

                        const productType =

                            row['Тип_товара'] ||

                            row['Название_группы'] ||

                            oldProduct?.Тип_товара ||

                            oldProduct?.category ||

                            'Не вказано';


                        // -----------------------------
                        // ПРОИЗВОДИТЕЛЬ
                        // -----------------------------
                        //
                        // Очень важно:
                        //
                        // если производитель есть в Excel —
                        // берём его.
                        //
                        // если в Excel производителя нет —
                        // сохраняем старого.
                        //
                        // поэтому он больше не исчезает.
                        // -----------------------------

                        const manufacturer = String(

                            row['Производитель'] ||

                            oldProduct?.Производитель ||

                            oldProduct?.brand ||

                            'Не вказано'

                        ).trim() || 'Не вказано';


                        // -----------------------------
                        // Возвращаем товар
                        // -----------------------------

                        return {

                            ...row,

                            id:
                                oldProduct?.id ||
                                index + 1,


                            title:
                            title,


                            price:
                            price,


                            image:
                            firstImg,


                            productCode:
                            productCode,


                            Код_товара:
                            productCode,


                            Тип_товара:
                            productType,


                            Производитель:
                            manufacturer,


                            brand:
                            manufacturer,


                            // Сохраняем наличие

                            inStock:

                                oldProduct?.inStock !== undefined

                                    ? oldProduct.inStock

                                    : true,


                            // Сохраняем оплату

                            payments:

                                oldProduct?.payments ||

                                {

                                    online: true,

                                    cash: true,

                                    account: true

                                },


                            // Сохраняем доставку

                            deliveries:

                                oldProduct?.deliveries ||

                                {

                                    courier: true,

                                    branch: true,

                                    postomat: true,

                                    pickup: true

                                }

                        };

                    }
                );


            // Записываем товары

            writeProducts(
                products
            );


            // Удаляем загруженный временный Excel

            fs.unlinkSync(
                req.file.path
            );


            res.json({

                success: true,

                count:
                products.length

            });


        } catch (error) {

            console.error(error);


            try {

                fs.unlinkSync(
                    req.file.path
                );

            } catch (_) {}


            res.status(500).json({

                error:
                    'Помилка при обробці Excel файлу'

            });

        }

    }
);


// ============================================================
// ОФОРМЛЕНИЕ ЗАКАЗА
// ============================================================

app.post('/api/order', async (req, res) => {

    const {

        lastName,

        firstName,

        phone,

        cart,

        total,

        delivery,

        deliveryDetails,

        deliveryFee,

        payment

    } = req.body;


    let message =
        `🛒 <b>Нове замовлення!</b>\n\n`;


    message +=
        `👤 <b>Клієнт:</b> ${lastName} ${firstName}\n`;


    message +=
        `📞 <b>Телефон:</b> ${phone}\n`;


    message +=
        `🚚 <b>Доставка:</b> ${delivery}\n`;


    message +=
        `📍 <b>Відділення/Адреса:</b> ${
            deliveryDetails ||
            'Не вказано'
        }\n`;


    message +=
        `💳 <b>Оплата:</b> ${payment}\n`;


    message +=
        `🚛 <b>Вартість доставки:</b> ${
            deliveryFee || 0
        } ₴\n\n`;


    message +=
        `📦 <b>Товари:</b>\n`;


    // -----------------------------
    // Товары
    // -----------------------------

    if (
        cart &&
        Array.isArray(cart)
    ) {

        cart.forEach(
            (item, index) => {

                message +=

                    `${index + 1}. ` +

                    `${item.title} ` +

                    `[код: ${
                        item.productCode ||
                        item.Код_товара ||
                        '—'
                    }] ` +

                    `— ${item.price} ₴ ` +

                    `× ${
                        item.quantity || 1
                    }\n`;

            }
        );

    }


    message +=
        `\n💰 <b>Разом до сплати:</b> ${total} ₴`;


    // ========================================================
    // ОТПРАВКА В TELEGRAM
    // ========================================================

    try {

        const fetch =
            (await import(
                'node-fetch'
                )).default;


        const telegramResponse =
            await fetch(

                `https://api.telegram.org/bot${
                    TELEGRAM_BOT_TOKEN
                }/sendMessage`,

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

            res.json({

                success: true

            });

        } else {

            console.error(
                'Telegram API error:',
                result
            );


            res.json({

                success: false,

                error:
                result.description

            });

        }


    } catch (error) {

        console.error(
            'Помилка відправки в Telegram:',
            error
        );


        res.status(500).json({

            success: false,

            error:
            error.message

        });

    }

});


// ============================================================
// ЗАПУСК СЕРВЕРА
// ============================================================

const PORT =
    process.env.PORT || 3000;


app.listen(
    PORT,
    () => {

        console.log(
            `Сервер запущено! Відкрийте: http://localhost:${PORT}`
        );

    }
);