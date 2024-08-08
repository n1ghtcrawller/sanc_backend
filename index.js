const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
// const paymentToken = '381764678:TEST:91939';
const token = '7105462091:AAG4blRZ7xvcRvAaanFIgMAdEwOI02KIX2M';
const webAppUrl = 'https://progressivesanc.netlify.app';

const bot = new TelegramBot(token, { polling: true });
const app = express();

app.use(express.json());
app.use(cors());
// const userData = {};
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
  const { chatId, queryId, products = [], totalPrice } = req.body;
  console.log('Chat ID:', chatId);
  console.log('query ID:', queryId);
  console.log('Products:', products);
  console.log('Total Price:', totalPrice);

  // Проверяем наличие chatId
  if (!chatId) {
    console.error('Chat ID is missing');
    return res.status(400).json({ error: 'Chat ID is required' });
  }

  try {
    // Формируем сообщение с товарами и их количеством
    const productList = products.map(item => `${item.title} (Количество: ${item.count})`).join('\n');

    // Отправляем инвойс
    await bot.sendInvoice(
        1468718377,
        'Оплата заказа',
        `Вы приобрели товары на сумму ${totalPrice}₽:\n${productList},`,
        '381764678:TEST:91939',
        'invoice',
        'RUB',
        [{ label: 'Оплата заказа', amount: totalPrice * 100 }]
  );

    return res.status(200).json({});
  } catch (e) {
    console.error('Error:', e); // Логируем ошибку
    return res.status(500).json({});
  }
});

const PORT = 8000;

app.listen(PORT, () => console.log('server started on PORT ' + PORT));