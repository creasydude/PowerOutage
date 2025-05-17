import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import moment from 'jalali-moment';
import { CronJob } from 'cron';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Setup directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbDir = path.join(__dirname, '..', 'db');

// Create db directory if it doesn't exist
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Load environment variables
dotenv.config();

// Initialize database
const db = new Database(path.join(dbDir, 'bot.db'));

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    chat_id INTEGER PRIMARY KEY,
    bill_id TEXT,
    auth_token TEXT,
    schedule_time TEXT DEFAULT '08:00',
    is_active INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

// Initialize bot
const token = process.env.TELEGRAM_BOT_TOKEN || '';
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is required. Please set it in .env file');
  process.exit(1);
}

// Configure bot options with optional proxy support
const botOptions = { polling: true };

// Add SOCKS5 proxy configuration if provided (only for Telegram API)
if (process.env.SOCKS5_PROXY) {
  botOptions.request = {
    proxy: process.env.SOCKS5_PROXY
  };
  console.log(`Using SOCKS5 proxy for Telegram API: ${process.env.SOCKS5_PROXY}`);
}

const bot = new TelegramBot(token, botOptions);

// Default schedule time (Tehran time, 24h format)
const DEFAULT_SCHEDULE_TIME = '08:00';

// User session state
const userState = {};

// Helper function to get Persian date
function getPersianDate() {
  return moment().locale('fa').format('YYYY/MM/DD');
}

// Helper function to get next Persian date (tomorrow)
function getPersianNextDate() {
  return moment().add(1, 'day').locale('fa').format('YYYY/MM/DD');
}

// Helper function to check if time format is valid (24h format)
function isValidTimeFormat(time) {
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return regex.test(time);
}

// Helper function to get user data
function getUserData(chatId) {
  const stmt = db.prepare('SELECT * FROM users WHERE chat_id = ?');
  return stmt.get(chatId);
}

// Helper function to save user data
function saveUserData(chatId, data) {
  const user = getUserData(chatId);
  
  if (user) {
    const stmt = db.prepare(`
      UPDATE users SET 
        bill_id = COALESCE(?, bill_id),
        auth_token = COALESCE(?, auth_token),
        schedule_time = COALESCE(?, schedule_time),
        is_active = COALESCE(?, is_active)
      WHERE chat_id = ?
    `);
    
    stmt.run(
      data.bill_id || null,
      data.auth_token || null,
      data.schedule_time || null,
      data.is_active !== undefined ? data.is_active : null,
      chatId
    );
  } else {
    const stmt = db.prepare(`
      INSERT INTO users (chat_id, bill_id, auth_token, schedule_time, is_active)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      chatId,
      data.bill_id || null,
      data.auth_token || null,
      data.schedule_time || DEFAULT_SCHEDULE_TIME,
      data.is_active !== undefined ? data.is_active : 0
    );
  }
  
  return getUserData(chatId);
}

// Helper function to fetch data from API
async function fetchApiData(billId, authToken) {
  try {
    const persianDate = getPersianDate();
    const persianNextDate = getPersianNextDate();
    // Use API endpoint from environment variables
    const apiEndpoint = process.env.API_ENDPOINT || 'https://uiapi2.saapa.ir/api/ebills/PlannedBlackoutsReport';
    const response = await axios.get(apiEndpoint, {
      params: {
        bill_id: billId,
        from_date: persianDate,
        to_date: persianNextDate
      },
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('API Error:', error.message);
    return { error: 'Failed to fetch data from API' };
  }
}

// Helper function to format API response for user
function formatApiResponse(data) {
  if (data.error) {
    return `Error: ${data.error}`;
  }
  
  // Get language preference from environment variables
  const language = process.env.LANGUAGE || 'en';
  
  // Check if there's any outage data
  if (!data.data || data.data.length === 0) {
    return language === 'fa' 
      ? `📊 گزارش قطعی برق\n📅 تاریخ: ${getPersianDate()}\n\nهیچ قطعی برقی یافت نشد.`
      : `📊 Power Outage Report\n📅 Date: ${getPersianDate()}\n\nNo power outages found.`;
  }
  
  // Get the first outage (assuming we're displaying one at a time)
  const outage = data.data[0];
  
  // Format based on language preference
  if (language === 'fa') {
    return `
📊 گزارش قطعی برق
📅 تاریخ: ${getPersianDate()}
⏰ زمان شروع قطعی: ${outage.outage_start_time}
⏰ زمان پایان قطعی: ${outage.outage_stop_time}
📍 آدرس: ${outage.address}
🔌 دلیل: ${outage.reason_outage}
  `;
  } else {
    return `
📊 Power Outage Report
📅 Date: ${getPersianDate()}
⏰ Outage Start Time: ${outage.outage_start_time}
⏰ Outage Stop Time: ${outage.outage_stop_time}
📍 Address: ${outage.address}
🔌 Reason: ${outage.reason_outage}
  `;
  }
}

// Helper function to schedule API check
function scheduleApiCheck(chatId) {
  const user = getUserData(chatId);
  
  if (!user || !user.is_active || !user.bill_id || !user.auth_token) {
    return false;
  }
  
  // Parse hours and minutes from schedule_time
  const [hours, minutes] = user.schedule_time.split(':').map(Number);
  
  // Create cron expression for Tehran timezone
  // Format: minute hour * * * (runs daily at specified hour:minute)
  const cronExpression = `${minutes} ${hours} * * *`;
  
  // Cancel existing job if any
  if (userState[chatId]?.job) {
    userState[chatId].job.stop();
  }
  
  // Create new job
  const job = new CronJob(
    cronExpression,
    async function() {
      const data = await fetchApiData(user.bill_id, user.auth_token);
      const message = formatApiResponse(data);
      bot.sendMessage(chatId, message);
    },
    null,
    true,
    'Asia/Tehran'
  );
  
  // Store job reference
  if (!userState[chatId]) userState[chatId] = {};
  userState[chatId].job = job;
  
  return true;
}

// Helper function to get text in the selected language
function getText(enText, faText) {
  const language = process.env.LANGUAGE || 'en';
  return language === 'fa' ? faText : enText;
}

// Main menu keyboard
function getMainMenuKeyboard(user) {
  const language = process.env.LANGUAGE || 'en';
  const keyboard = [
    [{ text: getText('🔑 Set Bill ID', '🔑 تنظیم شناسه قبض') }, { text: getText('🔐 Set Authorization Token', '🔐 تنظیم توکن احراز هویت') }],
    [{ text: getText('⏰ Set Schedule Time', '⏰ تنظیم زمان برنامه') }]
  ];
  
  // Add start/stop button based on current state
  if (user && user.is_active) {
    keyboard.push([{ text: getText('🛑 Stop Bot', '🛑 توقف ربات') }]);
  } else {
    keyboard.push([{ text: getText('▶️ Start Bot', '▶️ شروع ربات') }]);
  }
  
  keyboard.push([{ text: getText('📋 Show Settings', '📋 نمایش تنظیمات') }]);
  
  return {
    reply_markup: {
      keyboard,
      resize_keyboard: true
    }
  };
}

// Cancel button keyboard
const cancelKeyboard = {
  reply_markup: {
    keyboard: [[{ text: getText('❌ Cancel', '❌ لغو') }]],
    resize_keyboard: true
  }
};

// Start command handler
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  // Initialize or get user
  let user = getUserData(chatId);
  if (!user) {
    user = saveUserData(chatId, {});
  }
  
  const welcomeMessage = getText(
    `
👋 Welcome to Power Outage Bot! (By CreasY)

This bot will check for power outage information daily at your scheduled time.

Before starting, please set:
1. Your Bill ID
2. Your Authorization Token (You Can Get It From Bargheman.com Website)
3. Optional: Schedule time (default: ${DEFAULT_SCHEDULE_TIME}, Tehran time)

Use the buttons below to configure the bot.
  `,
    `
👋 به ربات قطعی برق خوش آمدید! (By CreasY)

این ربات اطلاعات قطعی برق را به صورت روزانه در زمان تعیین شده بررسی می‌کند.

قبل از شروع، لطفا موارد زیر را تنظیم کنید:
1. شناسه قبض خود
2. توکن احراز هویت خود (می‌توانید آن را از وب‌سایت Bargheman.com دریافت کنید)
3. اختیاری: زمان برنامه (پیش‌فرض: ${DEFAULT_SCHEDULE_TIME}، به وقت تهران)

از دکمه‌های زیر برای پیکربندی ربات استفاده کنید.
  `
  );
  
  bot.sendMessage(chatId, welcomeMessage, getMainMenuKeyboard(user));
});

// Set Bill ID handler
bot.onText(new RegExp(getText('🔑 Set Bill ID', '🔑 تنظیم شناسه قبض')), (msg) => {
  const chatId = msg.chat.id;
  userState[chatId] = { ...userState[chatId], waitingFor: 'bill_id' };
  
  bot.sendMessage(
    chatId,
    getText('Please enter your Bill ID:', 'لطفا شناسه قبض خود را وارد کنید:'),
    cancelKeyboard
  );
});

// Set Authorization Token handler
bot.onText(new RegExp(getText('🔐 Set Authorization Token', '🔐 تنظیم توکن احراز هویت')), (msg) => {
  const chatId = msg.chat.id;
  userState[chatId] = { ...userState[chatId], waitingFor: 'auth_token' };
  
  bot.sendMessage(
    chatId,
    getText('Please enter your Authorization Token:', 'لطفا توکن احراز هویت خود را وارد کنید:'),
    cancelKeyboard
  );
});

// Set Schedule Time handler
bot.onText(new RegExp(getText('⏰ Set Schedule Time', '⏰ تنظیم زمان برنامه')), (msg) => {
  const chatId = msg.chat.id;
  userState[chatId] = { ...userState[chatId], waitingFor: 'schedule_time' };
  
  bot.sendMessage(
    chatId,
    getText(
      `Please enter the time for daily checks (24h format, e.g. 08:00):\nCurrent time zone: Tehran`,
      `لطفا زمان بررسی روزانه را وارد کنید (فرمت 24 ساعته، مثال 08:00):\nمنطقه زمانی فعلی: تهران`
    ),
    cancelKeyboard
  );
});

// Start Bot handler
bot.onText(new RegExp(getText('▶️ Start Bot', '▶️ شروع ربات')), async (msg) => {
  const chatId = msg.chat.id;
  const user = getUserData(chatId);
  
  if (!user || !user.bill_id || !user.auth_token) {
    return bot.sendMessage(
      chatId,
      getText(
        '⚠️ Please set your Bill ID and Authorization Token first.',
        '⚠️ لطفا ابتدا شناسه قبض و توکن احراز هویت خود را تنظیم کنید.'
      ),
      getMainMenuKeyboard(user)
    );
  }
  
  // Update user as active
  saveUserData(chatId, { is_active: 1 });
  
  // Schedule daily checks
  scheduleApiCheck(chatId);
  
  // Perform initial check
  bot.sendMessage(chatId, getText('🔄 Fetching data from API...', '🔄 در حال دریافت اطلاعات از API...'));
  
  try {
    const data = await fetchApiData(user.bill_id, user.auth_token);
    const message = formatApiResponse(data);
    bot.sendMessage(chatId, message);
  } catch (error) {
    bot.sendMessage(chatId, `Error: ${error.message}`);
  }
  
  bot.sendMessage(
    chatId,
    getText(
      `✅ Bot started! You will receive daily updates at ${user.schedule_time} (Tehran time).`,
      `✅ ربات شروع شد! شما به‌روزرسانی‌های روزانه را در ساعت ${user.schedule_time} (به وقت تهران) دریافت خواهید کرد.`
    ),
    getMainMenuKeyboard(getUserData(chatId))
  );
});

// Stop Bot handler
bot.onText(new RegExp(getText('🛑 Stop Bot', '🛑 توقف ربات')), (msg) => {
  const chatId = msg.chat.id;
  
  // Update user as inactive
  saveUserData(chatId, { is_active: 0 });
  
  // Stop scheduled job
  if (userState[chatId]?.job) {
    userState[chatId].job.stop();
    delete userState[chatId].job;
  }
  
  bot.sendMessage(
    chatId,
    getText(
      '⏹️ Bot stopped. You will no longer receive scheduled updates.',
      '⏹️ ربات متوقف شد. شما دیگر به‌روزرسانی‌های برنامه‌ریزی شده را دریافت نخواهید کرد.'
    ),
    getMainMenuKeyboard(getUserData(chatId))
  );
});

// Show Settings handler
bot.onText(new RegExp(getText('📋 Show Settings', '📋 نمایش تنظیمات')), (msg) => {
  const chatId = msg.chat.id;
  const user = getUserData(chatId);
  
  if (!user) {
    return bot.sendMessage(
      chatId,
      getText(
        '⚠️ No settings found. Please configure the bot first.',
        '⚠️ تنظیماتی یافت نشد. لطفا ابتدا ربات را پیکربندی کنید.'
      ),
      getMainMenuKeyboard(null)
    );
  }
  
  const notSet = getText('Not set', 'تنظیم نشده');
  const active = getText('Active ✅', 'فعال ✅');
  const inactive = getText('Inactive ❌', 'غیرفعال ❌');
  
  const settings = getText(
    `
📋 Current Settings:

🔑 Bill ID: ${user.bill_id || notSet}
🔐 Authorization Token: ${user.auth_token ? '******' : notSet}
⏰ Schedule Time: ${user.schedule_time} (Tehran time)
🤖 Bot Status: ${user.is_active ? active : inactive}
  `,
    `
📋 تنظیمات فعلی:

🔑 شناسه قبض: ${user.bill_id || notSet}
🔐 توکن احراز هویت: ${user.auth_token ? '******' : notSet}
⏰ زمان برنامه: ${user.schedule_time} (به وقت تهران)
🤖 وضعیت ربات: ${user.is_active ? active : inactive}
  `
  );
  
  bot.sendMessage(chatId, settings, getMainMenuKeyboard(user));
});

// Cancel handler
bot.onText(new RegExp(getText('❌ Cancel', '❌ لغو')), (msg) => {
  const chatId = msg.chat.id;
  
  if (userState[chatId]) {
    delete userState[chatId].waitingFor;
  }
  
  bot.sendMessage(
    chatId,
    getText('❌ Operation cancelled.', '❌ عملیات لغو شد.'),
    getMainMenuKeyboard(getUserData(chatId))
  );
});

// Handle text messages (for collecting user input)
bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/') || 
      msg.text.includes('Set') || msg.text.includes('تنظیم') || 
      msg.text.includes('Start') || msg.text.includes('شروع') || 
      msg.text.includes('Stop') || msg.text.includes('توقف') || 
      msg.text.includes('Show') || msg.text.includes('نمایش') || 
      msg.text.includes('Cancel') || msg.text.includes('لغو')) {
    return; // Skip command messages and button clicks
  }
  
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  
  if (!userState[chatId] || !userState[chatId].waitingFor) {
    return; // Not waiting for any input
  }
  
  const waitingFor = userState[chatId].waitingFor;
  delete userState[chatId].waitingFor;
  
  switch (waitingFor) {
    case 'bill_id':
      saveUserData(chatId, { bill_id: text });
      bot.sendMessage(
        chatId,
        getText(`✅ Bill ID saved: ${text}`, `✅ شناسه قبض ذخیره شد: ${text}`),
        getMainMenuKeyboard(getUserData(chatId))
      );
      break;
      
    case 'auth_token':
      saveUserData(chatId, { auth_token: text });
      bot.sendMessage(
        chatId,
        getText('✅ Authorization Token saved.', '✅ توکن احراز هویت ذخیره شد.'),
        getMainMenuKeyboard(getUserData(chatId))
      );
      break;
      
    case 'schedule_time':
      if (!isValidTimeFormat(text)) {
        bot.sendMessage(
          chatId,
          getText(
            '⚠️ Invalid time format. Please use 24h format (e.g. 08:00).',
            '⚠️ فرمت زمان نامعتبر است. لطفا از فرمت 24 ساعته استفاده کنید (مثال 08:00).'
          ),
          cancelKeyboard
        );
        userState[chatId].waitingFor = 'schedule_time'; // Keep waiting for input
        return;
      }
      
      saveUserData(chatId, { schedule_time: text });
      
      // Update schedule if bot is active
      const user = getUserData(chatId);
      if (user.is_active) {
        scheduleApiCheck(chatId);
      }
      
      bot.sendMessage(
        chatId,
        getText(
          `✅ Schedule time saved: ${text} (Tehran time)`,
          `✅ زمان برنامه ذخیره شد: ${text} (به وقت تهران)`
        ),
        getMainMenuKeyboard(user)
      );
      break;
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Helper function to initialize jobs for all active users
function initializeActiveUserJobs() {
  try {
    // Query all active users from the database
    const stmt = db.prepare('SELECT chat_id FROM users WHERE is_active = 1');
    const activeUsers = stmt.all();
    
    console.log(`Found ${activeUsers.length} active users. Scheduling their jobs...`);
    
    // Schedule jobs for each active user
    activeUsers.forEach(user => {
      const chatId = user.chat_id;
      const scheduled = scheduleApiCheck(chatId);
      
      if (scheduled) {
        console.log(`Scheduled job for user ${chatId}`);
      } else {
        console.log(`Failed to schedule job for user ${chatId}`);
      }
    });
    
    console.log('All active user jobs initialized successfully.');
  } catch (error) {
    console.error('Error initializing active user jobs:', error);
  }
}

// Initialize jobs for active users when the bot starts
initializeActiveUserJobs();

console.log('Bot started...');