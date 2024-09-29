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

bot.on('message', async (msg) => {
  const chatID = msg.chat.id;
  const text = msg.text;
})

// Основной обработчик сообщений
// Основной обработчик сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '/start') {
    bot.sendMessage(chatId, 'Добро пожаловать в пространство KeyBasicsNeutral', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Мои заказы', callback_data: 'my_orders' }]
        ]
      }
    });
  }


  if (text.startsWith('/login')) {
    const match = text.match(/\/login (.+)/);
    if (!match) {
      return bot.sendMessage(chatId, 'Введите логин и пароль в формате: /login <username> <password>');
    }

    const [username, password] = match[1].split(' ');

    if (!username || !password) {
      return bot.sendMessage(chatId, 'Введите логин и пароль в формате: /login <username> <password>');
    }

    try {
      const usersRef = db.collection('users').where('username', '==', username);
      const snapshot = await usersRef.get();

      if (snapshot.empty) {
        return bot.sendMessage(chatId, 'Неправильный логин или пароль');
      }

      const userData = snapshot.docs[0].data();

      if (password !== userData.password) {
        return bot.sendMessage(chatId, 'Неправильный логин или пароль');
      }

      if (userData.role !== 'admin') {
        return bot.sendMessage(chatId, 'У вас нет прав администратора');
      }

      sessions[chatId] = { username, role: userData.role };

      // Добавляем инлайн-кнопки для администратора
      return bot.sendMessage(chatId, `Добро пожаловать, ${username}. Вы вошли как администратор.`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Просмотр заказов за сегодня', callback_data: 'view_orders_today' }],
            [{ text: 'Просмотр заказов за неделю', callback_data: 'view_orders_week' }],
            [{ text: 'Просмотр всех заказов', callback_data: 'view_orders' }],
            [{ text: 'Просмотр товаров', callback_data: 'view_products' }],
            [{ text: 'Удаление товара', callback_data: 'delete_product' }],
            [{ text: 'Добавление товара', callback_data: 'add_product' }]
          ]
        }
      });
    } catch (error) {
      console.error('Ошибка при логине:', error);
      return bot.sendMessage(chatId, 'Ошибка при авторизации');
    }
  }

  if (text === '/logout') {
    if (sessions[chatId]) {
      delete sessions[chatId];
      return bot.sendMessage(chatId, 'Вы успешно вышли из системы');
    }
    return bot.sendMessage(chatId, 'Вы не были авторизованы');
  }
});


// Проверка роли администратора
function isAdmin(chatId) {
  const session = sessions[chatId];
  return session && session.role === 'admin';
}

// Обработчик инлайн-кнопок
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const action = callbackQuery.data;

  // Проверка на администратора
  if (action !== 'my_orders' && !isAdmin(chatId)) {
    return bot.sendMessage(chatId, 'У вас нет прав для выполнения этой команды.');
  }

  if (action === 'view_orders_today') {
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0); // Начало дня

      const ordersRef = db.collection('orders')
          .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
          .orderBy('createdAt', 'asc');
      const snapshot = await ordersRef.get();

      if (snapshot.empty) {
        return bot.sendMessage(chatId, 'Заказы за сегодня не найдены.');
      }

      let orders = 'Заказы за сегодня:\n\n';
      snapshot.forEach(doc => {
        const order = doc.data();
        const productsList = order.products && Array.isArray(order.products) ?
            order.products.map(p => `Название: ${p.title}, Размер: ${p.size}, Количество: ${p.count}, Цена: ${p.price}₽`).join('\n') :
            'Нет товаров в заказе';

        const deliveryInfo = order.deliveryInfo || {};
        const deliveryDetails = `
        Имя: ${deliveryInfo.name || 'Не указано'}
        Город: ${deliveryInfo.city || 'Не указан'}
        Улица: ${deliveryInfo.street || 'Не указана'}
        Дом: ${deliveryInfo.house || 'Не указан'}
        Офис: ${deliveryInfo.office || 'Не указан'}
        Способ доставки: ${deliveryInfo.subject || 'Не указан'}
        Телефон: ${deliveryInfo.phone || 'Не указан'}
        Комментарий: ${deliveryInfo.comment || 'Отсутствует'}
      __________________________________________________________
      `;

        orders += `ID заказа: ${doc.id}\n`;
        orders += `Товары:\n${productsList}\n`;
        orders += `Общая цена: ${order.totalPrice}₽\n`;
        orders += `Дата: ${order.createdAt instanceof admin.firestore.Timestamp ? order.createdAt.toDate() : order.createdAt}\n`;
        orders += `Email: ${order.email || 'Не указан'}\n`;
        orders += `Информация о доставке:\n${deliveryDetails}\n\n`;
      });

      return bot.sendMessage(chatId, orders);
    } catch (error) {
      console.error('Ошибка при получении заказов за сегодня:', error);
      return bot.sendMessage(chatId, 'Ошибка при получении заказов за сегодня');
    }
  }

  if (action === 'my_orders') {
    try {
      const ordersRef = db.collection('orders').where('chatId', '==', chatId);
      const snapshot = await ordersRef.get();

      if (snapshot.empty) {
        return bot.sendMessage(chatId, 'У вас пока нет заказов.');
      }

      let orders = 'Ваши заказы:\n\n';
      snapshot.forEach(doc => {
        const order = doc.data();
        const productsList = order.products && Array.isArray(order.products)
            ? order.products.map(p => `Название: ${p.title}, Размер: ${p.size}, Количество: ${p.count}, Цена: ${p.price}₽`).join('\n')
            : 'Нет товаров в заказе';

        const deliveryInfo = order.deliveryInfo || {};
        const deliveryDetails = `
          Имя: ${deliveryInfo.name || 'Не указано'}
          Город: ${deliveryInfo.city || 'Не указан'}
          Улица: ${deliveryInfo.street || 'Не указана'}
          Дом: ${deliveryInfo.house || 'Не указан'}
          Телефон: ${deliveryInfo.phone || 'Не указан'}
          Комментарий: ${deliveryInfo.comment || 'Отсутствует'}
          __________________________________________________________`;

        // Преобразование даты в московское время
        const orderDate = order.createdAt instanceof admin.firestore.Timestamp
            ? order.createdAt.toDate().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
            : order.createdAt;

        orders += `ID заказа: ${doc.id}\n`;
        orders += `Товары:\n${productsList}\n`;
        orders += `Общая цена: ${order.totalPrice}₽\n`;
        orders += `Дата: ${orderDate}\n`;
        orders += `Информация о доставке:\n${deliveryDetails}\n\n`;
      });

      return bot.sendMessage(chatId, orders);
    } catch (error) {
      console.error('Ошибка при получении заказов пользователя:', error);
      return bot.sendMessage(chatId, 'Ошибка при получении ваших заказов.');
    }
  }

if (action === 'view_orders_week') {
    try {
      const today = new Date();
      const weekAgo = new Date();
      weekAgo.setDate(today.getDate() - 7); // Неделя назад

      const ordersRef = db.collection('orders')
          .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(weekAgo))
          .orderBy('createdAt', 'asc');
      const snapshot = await ordersRef.get();

      if (snapshot.empty) {
        return bot.sendMessage(chatId, 'Заказы за последнюю неделю не найдены.');
      }

      let orders = 'Заказы за последнюю неделю:\n\n';
      snapshot.forEach(doc => {
        const order = doc.data();
        const productsList = order.products && Array.isArray(order.products) ?
            order.products.map(p => `Название: ${p.title}, Размер: ${p.size}, Количество: ${p.count}, Цена: ${p.price}₽`).join('\n') :
            'Нет товаров в заказе';

        const deliveryInfo = order.deliveryInfo || {};
        const deliveryDetails = `
        Имя: ${deliveryInfo.name || 'Не указано'}
        Город: ${deliveryInfo.city || 'Не указан'}
        Улица: ${deliveryInfo.street || 'Не указана'}
        Дом: ${deliveryInfo.house || 'Не указан'}
        Офис: ${deliveryInfo.office || 'Не указан'}
        Способ доставки: ${deliveryInfo.subject || 'Не указан'}
        Телефон: ${deliveryInfo.phone || 'Не указан'}
        Комментарий: ${deliveryInfo.comment || 'Отсутствует'}
      __________________________________________________________
      `;

        orders += `ID заказа: ${doc.id}\n`;
        orders += `Товары:\n${productsList}\n`;
        orders += `Общая цена: ${order.totalPrice}₽\n`;
        orders += `Дата: ${order.createdAt instanceof admin.firestore.Timestamp ? order.createdAt.toDate() : order.createdAt}\n`;
        orders += `Email: ${order.email || 'Не указан'}\n`;
        orders += `Информация о доставке:\n${deliveryDetails}\n\n`;
      });

      return bot.sendMessage(chatId, orders);
    } catch (error) {
      console.error('Ошибка при получении заказов за последнюю неделю:', error);
      return bot.sendMessage(chatId, 'Ошибка при получении заказов за последнюю неделю');
    }
  }

  if (action === 'view_products') {
    try {
      const productsRef = db.collection('products');
      const snapshot = await productsRef.get();

      if (snapshot.empty) {
        return bot.sendMessage(chatId, 'Товары не найдены.');
      }

      let products = 'Товары:\n\n';
      snapshot.forEach(doc => {
        const product = doc.data();
        products += `ID: ${doc.id}\nНазвание: ${product.title}\nЦена: ${product.price}₽\nОписание: ${product.description}\n\n`;
      });

      return bot.sendMessage(chatId, products);
    } catch (error) {
      console.error('Ошибка при получении товаров:', error);
      return bot.sendMessage(chatId, 'Ошибка при получении товаров');
    }
  }

  if (action === 'delete_product') {
    await bot.sendMessage(chatId, 'Введите ID товара для удаления:');
    bot.on('message', async (msg) => {
      const productId = msg.text.trim();

      try {
        const productDoc = await db.collection('products').doc(productId).get();

        if (!productDoc.exists) {
          return bot.sendMessage(chatId, `Товар с ID ${productId} не найден.`);
        }

        await db.collection('products').doc(productId).delete();
        return bot.sendMessage(chatId, `Товар с ID ${productId} успешно удален.`);
      } catch (error) {
        console.error('Ошибка при удалении товара:', error);
        return bot.sendMessage(chatId, 'Ошибка при удалении товара');
      }
    });
  }


  if (action === 'add_product') {
    await bot.sendMessage(chatId, 'Введите данные о товаре в формате: Название, цена, описание, категория, ссылка на обложку, 5 ссылок на фотографии');
    bot.on('message', async (msg) => {
      const productDetails = msg.text.split(',');
      const [title, price, description, category, coverUrl, ...photoUrls] = productDetails;

      try {
        await db.collection('products').add({
          title: title.trim(),
          price: parseFloat(price.trim()),
          description: description.trim(),
          category: category.trim(),
          coverUrl: coverUrl.trim(),
          photoUrls: photoUrls.map(url => url.trim()),
          createdAt: admin.firestore.Timestamp.now()
        });
        return bot.sendMessage(chatId, 'Товар успешно добавлен');
      } catch (error) {
        console.error('Ошибка при добавлении товара:', error);
        return bot.sendMessage(chatId, 'Ошибка при добавлении товара');
      }
    });
  }
});




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
