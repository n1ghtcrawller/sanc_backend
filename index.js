const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Ваш токен бота и URL веб-приложения
const token = '7105462091:AAG4blRZ7xvcRvAaanFIgMAdEwOI02KIX2M';
const webAppUrl = 'https://progressivesanc.netlify.app';

// Инициализация бота и сервера
const bot = new TelegramBot(token, { polling: true });
const app = express();
app.use(express.json());
app.use(cors());

// Инициализация Firebase
const serviceAccount = require('../secrets/serviceAccountKey.json'); // Путь к вашему JSON-файлу с ключом

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Хранение сессий (можно использовать в памяти для простоты)
const sessions = {};

// Основной обработчик сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text.startsWith('/login')) {
    const match = text.match(/\/login (.+)/);
    if (!match) {
      return bot.sendMessage(chatId, 'Введите логин и пароль в формате: /login <username> <password>');
    }

    const [username, password] = match[1].split(' '); // Разделяем введенные логин и пароль

    // Проверяем, введены ли логин и пароль
    if (!username || !password) {
      return bot.sendMessage(chatId, 'Введите логин и пароль в формате: /login <username> <password>');
    }

    try {
      // Получаем пользователя из коллекции `users` по логину
      const usersRef = db.collection('users').where('username', '==', username);
      const snapshot = await usersRef.get();

      // Если пользователь не найден
      if (snapshot.empty) {
        return bot.sendMessage(chatId, 'Неправильный логин или пароль');
      }

      const userData = snapshot.docs[0].data(); // Данные пользователя

      // Сравниваем пароль
      if (password !== userData.password) {
        return bot.sendMessage(chatId, 'Неправильный логин или пароль');
      }

      // Проверяем, является ли пользователь администратором
      if (userData.role !== 'admin') {
        return bot.sendMessage(chatId, 'У вас нет прав администратора');
      }

      // Сохраняем сессию
      sessions[chatId] = { username, role: userData.role };

      // Отправляем сообщение о успешном входе
      return bot.sendMessage(chatId, `Добро пожаловать, ${username}. Вы вошли как администратор.`);
    } catch (error) {
      console.error('Ошибка при логине:', error);
      return bot.sendMessage(chatId, 'Ошибка при авторизации');
    }
  }

  if (text === '/logout') {
    if (sessions[chatId]) {
      delete sessions[chatId]; // Удаляем сессию пользователя
      return bot.sendMessage(chatId, 'Вы успешно вышли из системы');
    }
    return bot.sendMessage(chatId, 'Вы не были авторизованы');
  }

  if (text === '/start') {
    await bot.sendMessage(chatId, 'Заходи в наш интернет магазин по кнопке ниже', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Сделать заказ', web_app: { url: webAppUrl } }]
        ]
      }
    });
  }

  // Пример использования функции isAdmin для доступа к командам администратора
  if (text.startsWith('/addproduct')) {
    const match = text.match(/\/addproduct (.+)/);
    if (!match) {
      return bot.sendMessage(chatId, 'Введите данные о товаре в формате: /addproduct <название, цена, описание>');
    }

    // Проверка авторизации администратора
    if (!isAdmin(chatId)) {
      return bot.sendMessage(chatId, 'У вас нет прав для добавления товаров');
    }

    const productDetails = match[1]; // Получаем данные о товаре
    const [title, price, description] = productDetails.split(',');

    try {
      // Добавление товара в коллекцию products
      await db.collection('products').add({
        title,
        price: parseFloat(price),
        description,
        createdAt: admin.firestore.Timestamp.now()
      });
      return bot.sendMessage(chatId, 'Товар успешно добавлен');
    } catch (error) {
      console.error('Ошибка при добавлении товара:', error);
      return bot.sendMessage(chatId, 'Ошибка при добавлении товара');
    }
  }
});

// Middleware для проверки роли администратора
function isAdmin(chatId) {
  const session = sessions[chatId];
  return session && session.role === 'admin';
}

// Маршрут для получения коллекции products
app.get('/products', async (req, res) => {
  try {
    // Получаем коллекцию products из Firestore
    const productsRef = db.collection('products');
    const snapshot = await productsRef.get();

    // Проверяем, есть ли данные в коллекции
    if (snapshot.empty) {
      console.log('No matching documents.');
      return res.status(404).json({ message: 'No products found' });
    }

    // Преобразуем каждый документ в объект и собираем их в массив
    const products = [];
    snapshot.forEach(doc => {
      products.push({ id: doc.id, ...doc.data() });
    });

    // Отправляем массив с продуктами как ответ на запрос
    return res.status(200).json(products);
  } catch (error) {
    console.error('Error getting products:', error);
    return res.status(500).json({ message: 'Error retrieving products' });
  }
});

// Маршрут для обработки данных заказа
app.post('/web-data', async (req, res) => {
  const { chatId, queryId, products = [], totalPrice, deliveryInfo } = req.body;
  console.log('Received data:', req.body);
  console.log('query ID:', queryId);

  // Проверяем наличие chatId
  if (!chatId) {
    console.error('Chat ID is missing');
    return res.status(400).json({ error: 'Chat ID is required' });
  }
  const orderData = {
    ...req.body, // Все данные из req.body
    createdAt: admin.firestore.Timestamp.now() // Текущая дата и время
  };
  await db.collection('orders').add(orderData);
  console.log('Order Added to Firebase');

  try {
    // Формируем сообщение с товарами и их количеством
    const productList = products.map(item => `${item.title}, размер: ${item.size}, (Количество: ${item.count})`).join('\n');

    // Формируем сообщение с информацией о доставке
    const deliveryMessage = `
      Информация о заказе:
      Город: ${deliveryInfo.city}
      Улица: ${deliveryInfo.street}
      Дом: ${deliveryInfo.house}
      Телефон: ${deliveryInfo.phone}
      Способ доставки: ${deliveryInfo.subject}`;

    // Отправляем инвойс
    await bot.sendInvoice(
        chatId,
        'Оплата заказа',
        `Вы выбрали товаров на сумму ${totalPrice}₽:\n${productList}`,
        'invoice',
        '381764678:TEST:91939',
        'RUB',
        [{ label: 'Оплата заказа', amount: totalPrice * 100 }]
    );

    await bot.sendMessage(chatId, "Возникли проблемы с оплатой? Напишите нам!", {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Напишите нам', url: 'https://t.me/@vlaaaadyanoy' }]
        ]
      }
    });

    return res.status(200).json({});
  } catch (e) {
    console.error('Error:', e); // Логируем ошибку
    return res.status(500).json({});
  }
});

const PORT = 8000;

app.listen(PORT, () => console.log('server started on PORT ' + PORT));
