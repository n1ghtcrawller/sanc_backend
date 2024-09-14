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

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '/start') {
    await bot.sendMessage(chatId, 'Заходи в наш интернет магазин по кнопке ниже', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Сделать заказ', web_app: { url: webAppUrl } }]
        ]
      }
    });
  }
});

app.post('/web-data', async (req, res) => {
  const { chatId, queryId, products = [], totalPrice, deliveryInfo } = req.body;
  console.log('Received data:', req.body);
  console.log('query ID:', queryId);

  // Проверяем наличие chatId
  if (!chatId) {
    console.error('Chat ID is missing');
    return res.status(400).json({ error: 'Chat ID is required' });
  }

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

    // Сохраняем данные заказа в Firestore
    await db.collection('orders').add(req.body);
    await bot.sendMessage(chatId, 'Ваш заказ успешно оплачен! Спасибо за покупку.');
    console.log('Order Added to Firebase');

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