const TelegramBot = require('node-telegram-bot-api');

const token = "7105462091:AAG4blRZ7xvcRvAaanFIgMAdEwOI02KIX2M";

const webAppUrl = 'https://progressivesanc.netlify.app'

const bot = new TelegramBot(token, {polling: true});


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