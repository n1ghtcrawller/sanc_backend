const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const token = "7105462091:AAG4blRZ7xvcRvAaanFIgMAdEwOI02KIX2M";

const webAppUrl = 'https://progressivesanc.netlify.app'

const bot = new TelegramBot(token, {polling: true});
const app = express();
app.use(express.json());
app.use(cors());
const fs = require("fs")

bot.on('message', async(msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

    if(text === '/start') {
      await bot.sendMessage(chatId, 'Внизу появится форма, заполни её', {
        reply_markup: {
          keyboard: [
            [{text: 'Заполнить форму', web_app: {url: webAppUrl + '/form'}}]
          ]
        }
     })
    
  // send a message to the chat acknowledging receipt of their message


    await bot.sendMessage(chatId, "Посетить", {
      reply_markup: {
        inline_keyboard: [
          [{text: "Сделать заказ", web_app: {url: webAppUrl}}]
        ]
      }
    })
  }
  if (msg?.web_app_data?.data) {
    try {
        const data = JSON.parse(msg?.web_app_data?.data)
        console.log(data)
        await bot.sendMessage(chatId, "Вы заполнили анкету");
        await bot.sendMessage(chatId, "Ваш адрес: " + data?.country + ", " + data?.city + ", " + data?.street + ", " + data?.house + ", " + data?.flat + "\n" + "Мобильный телефон: " + data?.phone);
        setTimeout( async() => {
          await bot.sendMessage(chatId, "Всю информацию вы получите в этом чате");
      }, 2)
      }
    catch (e) {
      console.log(e);
    }
  }
});
app.post('/web-data', async (req, res) => {
  const {queryId, products, totalPrice} = req.body;
  try {
    await bot.answerWebAppQuery(queryId, {
      type: 'article',
      id: queryId,
      title: "Успешная покупка",
      input_message_content: {message_text: 'Позддравляем с успешной покупкой, вы приобрели товары ' + products + ' на сумму ' + totalPrice}
    });
    return res.res.status(200).json({})
  } catch (e) {
    await bot.answerWebAppQuery(queryId, {
      type: 'article',
      id: queryId,
      title: "Неуспешная транзакция"
    });
    return res.res.status(500).json({})
  }
})


const PORT = 8000;
app.listen(PORT, () => console.log('server started on port' + " " + PORT));