const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const axios = require('axios');
const crypto = require('crypto');

// Инициализация бота и сервера
const token = '7105462091:AAG4blRZ7xvcRvAaanFIgMAdEwOI02KIX2M';
const webAppUrl = 'https://progressivesanc.netlify.app';
const bot = new TelegramBot(token, { polling: true });
const app = express();
app.use(express.json());
app.use(cors());

// Инициализация Firebase
const serviceAccount = require('../secrets/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Хранилище сессий (можно заменить на постоянное хранилище)
const sessions = {};

// Получение ссылки на оплату через Tinkoff
async function tinkoffGetLink(amount, chatId, orderNumber) {
  const TINKOFF_TERMINAL_KEY = 'YOUR_TERMINAL_KEY';
  const TINKOFF_TERMINAL_PASSWORD = 'YOUR_TERMINAL_PASSWORD';
  const TINKOFF_INIT_URL = "https://securepay.tinkoff.ru/v2/Init";

  const data = {
    Amount: amount * 100, // сумма в копейках
    Description: 'Оплата заказа через бота',
    OrderId: `${chatId}-n${orderNumber}`,
    TerminalKey: TINKOFF_TERMINAL_KEY,
    Password: TINKOFF_TERMINAL_PASSWORD,
  };

  // Генерация токена для Tinkoff
  const sortedData = Object.keys(data).sort().reduce((acc, key) => {
    acc[key] = data[key];
    return acc;
  }, {});
  const concatenatedString = Object.values(sortedData).join('');
  const hashedString = crypto.createHash('sha256').update(concatenatedString).digest('hex');
  sortedData.Token = hashedString;
  delete sortedData.Password;

  try {
    const response = await axios.post(TINKOFF_INIT_URL, sortedData, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.data.Success === true && response.data.PaymentURL) {
      return response.data.PaymentURL;
    } else {
      console.error('Ошибка получения ссылки на оплату');
      return false;
    }
  } catch (error) {
    console.error('Ошибка при запросе на оплату:', error);
    return false;
  }
}

// Проверка роли администратора
function isAdmin(chatId) {
  const session = sessions[chatId];
  return session && session.role === 'admin';
}

// Маршруты для обработки данных
app.get('/products', async (req, res) => {
  try {
    const productsRef = db.collection('products');
    const snapshot = await productsRef.get();
    if (snapshot.empty) return res.status(404).json({ message: 'Товары не найдены' });

    const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json(products);
  } catch (error) {
    console.error('Ошибка получения товаров:', error);
    return res.status(500).json({ message: 'Ошибка получения товаров' });
  }
});

app.post('/web-data', async (req, res) => {
  const { chatId, queryId, products = [], totalPrice, deliveryInfo } = req.body;

  if (!chatId) return res.status(400).json({ error: 'Chat ID обязателен' });

  const orderData = { ...req.body, createdAt: admin.firestore.Timestamp.now() };
  const paymentURL = await tinkoffGetLink(totalPrice, chatId, queryId);

  if (paymentURL) {
    await bot.sendMessage(chatId, `Ваш заказ оформлен. Оплатите по ссылке: ${paymentURL}`);
  } else {
    await bot.sendMessage(chatId, 'Ошибка при создании ссылки на оплату.');
  }

  try {
    await db.collection('orders').add(orderData);
    for (const product of products) {
      const productDocRef = db.collection('products').doc(product.id.toString());
      await db.runTransaction(async (transaction) => {
        const productDoc = await transaction.get(productDocRef);
        if (productDoc.exists && productDoc.data().count >= product.count) {
          transaction.update(productDocRef, { count: productDoc.data().count - product.count });
        } else {
          console.warn(`Недостаточно товара с ID ${product.id}`);
        }
      });
    }

    await bot.sendMessage(chatId, "Если возникли проблемы с оплатой, напишите нам!", {
      reply_markup: {
        inline_keyboard: [[{ text: 'Связаться', url: 'https://t.me/vlaaaadyanoy' }]],
      },
    });

    return res.status(200).json({});
  } catch (e) {
    console.error('Ошибка обработки заказа:', e);
    return res.status(500).json({ error: 'Ошибка обработки заказа' });
  }
});

// Основной обработчик сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '/start') {
    return bot.sendMessage(chatId, 'Добро пожаловать в KeyBasicsNeutral', {
      reply_markup: {
        inline_keyboard: [[{ text: 'Мои заказы', callback_data: 'my_orders' }]],
      },
    });
  }

  if (text.startsWith('/login')) {
    const [username, password] = text.split(' ').slice(1);

    if (!username || !password) return bot.sendMessage(chatId, 'Введите логин и пароль: /login <username> <password>');

    try {
      const userSnapshot = await db.collection('users').where('username', '==', username).get();
      if (userSnapshot.empty) return bot.sendMessage(chatId, 'Неверный логин или пароль');

      const user = userSnapshot.docs[0].data();
      if (user.password !== password) return bot.sendMessage(chatId, 'Неверный логин или пароль');

      sessions[chatId] = { username, role: user.role };
      return bot.sendMessage(chatId, `Добро пожаловать, ${username}. Вы администратор`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Заказы за сегодня', callback_data: 'view_orders_today' }],
            [{ text: 'Заказы за неделю', callback_data: 'view_orders_week' }],
            [{ text: 'Все заказы', callback_data: 'view_orders' }],
            [{ text: 'Товары', callback_data: 'view_products' }],
            [{ text: 'Удалить товар', callback_data: 'delete_product' }],
            [{ text: 'Добавить товар', callback_data: 'add_product' }],
          ],
        },
      });
    } catch (error) {
      console.error('Ошибка авторизации:', error);
      return bot.sendMessage(chatId, 'Ошибка авторизации');
    }
  }

  if (text === '/logout') {
    delete sessions[chatId];
    return bot.sendMessage(chatId, 'Вы вышли из системы');
  }
});

// Обработчик инлайн-кнопок
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const action = callbackQuery.data;

  if (action !== 'my_orders' && !isAdmin(chatId)) {
    return bot.sendMessage(chatId, 'У вас нет прав для выполнения этой команды.');
  }

  // Обработка действий администратора
  if (action === 'view_orders_today') {
    // Получение заказов за сегодня
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ordersSnapshot = await db.collection('orders').where('createdAt', '>=', admin.firestore.Timestamp.fromDate(today)).get();
    if (ordersSnapshot.empty) return bot.sendMessage(chatId, 'Заказы не найдены');

    let ordersList = 'Заказы за сегодня:\n\n';
    ordersSnapshot.forEach(doc => {
      const order = doc.data();
      ordersList += `ID заказа: ${doc.id}\nОбщая сумма: ${order.totalPrice}₽\n\n`;
    });
    return bot.sendMessage(chatId, ordersList);
  }

  if (action === 'view_products') {
    // Получение списка товаров
    const productsSnapshot = await db.collection('products').get();
    if (productsSnapshot.empty) return bot.sendMessage(chatId, 'Товары не найдены');

    let productsList = 'Товары:\n\n';
    productsSnapshot.forEach(doc => {
      const product = doc.data();
      productsList += `ID: ${doc.id}\nНазвание: ${product.title}\nЦена: ${product.price}₽\n\n`;
    });
    return bot.sendMessage(chatId, productsList);
  }
});

// Запуск сервера
const PORT = 8000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
