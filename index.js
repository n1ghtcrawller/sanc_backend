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
  // databaseURL: 'keybasicsneutral-base.firebaseapp.com'
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

  if (msg?.web_app_data?.data) {
    try {
      const data = JSON.parse(msg?.web_app_data?.data);
      console.log(data);
      await bot.sendMessage(chatId, 'Спасибо за обратную связь!');
      await bot.sendMessage(chatId, 'Ваша страна: ' + data?.country);
      await bot.sendMessage(chatId, 'Ваша улица: ' + data?.street);

      setTimeout(async () => {
        await bot.sendMessage(chatId, 'Всю информацию вы получите в этом чате');
      }, 3000);
    } catch (e) {
      console.log(e);
    }
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
    const deliveryMessage =`
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
      '401643678:TEST:191c8bc9-09f8-4f54-8d59-5d30b5779dc4',
      'RUB',
      [{ label: 'Оплата заказа', amount: totalPrice * 100 }]
    );

    // Отправляем информацию о доставке
    await bot.sendMessage(chatId, deliveryMessage);
    try {
      await db.collection('orders').add(orderData);
      await bot.sendMessage(chatId, 'Ваш заказ успешно оплачен! Спасибо за покупку.');
    } catch (error) {
      console.error('Ошибка при сохранении заказа:', error);
      await bot.sendMessage(chatId, 'Произошла ошибка при обработке вашего заказа. Пожалуйста, попробуйте еще раз.');
    }

    return res.status(200).json({});
  } catch (e) {
    console.error('Error:', e); // Логируем ошибку
    return res.status(500).json({});
  }
});

// Обработка успешного платежа
bot.on('successful_payment', async (msg) => {
  const chatId = msg.chat.id;
  const paymentInfo = msg.successful_payment;

  // Сохранение данных о заказе в Firestore
  const orderData = {
    chatId,
    totalAmount: paymentInfo.total_amount,
    currency: paymentInfo.currency,
    invoicePayload: paymentInfo.invoice_payload,
    orderDate: new Date(),
    products: paymentInfo.provided_product_info || [] // Добавьте информацию о товарах, если доступна
  };

  try {
    await db.collection('orders').add(orderData);
    await bot.sendMessage(chatId, 'Ваш заказ успешно оплачен! Спасибо за покупку.');
  } catch (error) {
    console.error('Ошибка при сохранении заказа:', error);
    await bot.sendMessage(chatId, 'Произошла ошибка при обработке вашего заказа. Пожалуйста, попробуйте еще раз.');
  }
});

const PORT = 8000;

app.listen(PORT, () => console.log('server started on PORT ' + PORT));