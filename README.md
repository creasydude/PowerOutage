# ربات تلگرام قطعی برق

یک ربات تلگرام که API قطعی برق را به صورت روزانه بررسی می‌کند و اطلاعیه‌ها را برای کاربران ارسال می‌کند. این ربات برای کار با منطقه زمانی تهران پیکربندی شده و از تقویم فارسی (شمسی) پشتیبانی می‌کند.

## ویژگی‌ها

- بررسی روزانه API در زمان‌های تعیین شده توسط کاربر (فرمت ۲۴ ساعته، منطقه زمانی تهران)
- یکپارچه‌سازی با تقویم فارسی (شمسی)
- رابط کاربری دکمه‌ای کاربرپسند برای پیکربندی
- ذخیره‌سازی امن اطلاعات کاربر با استفاده از SQLite
- زمان‌بندی قابل تنظیم با مقدار پیش‌فرض
- دریافت فوری داده‌ها هنگام راه‌اندازی ربات

## نیازمندی‌ها

- Node.js 14.x یا بالاتر
- توکن ربات تلگرام (دریافت شده از [@BotFather](https://t.me/BotFather))
- اطلاعات دسترسی API (شناسه قبض و توکن احراز هویت)

## نصب

1. این مخزن را کلون کنید
2. وابستگی‌ها را نصب کنید:

```bash
npm install
```

3. یک فایل `.env` بر اساس الگوی `.env.example` ایجاد کنید:

```bash
cp .env.example .env
```

4. فایل `.env` را ویرایش کرده و توکن ربات تلگرام خود را اضافه کنید:

```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

5. در صورت نیاز، آدرس API را در فایل `.env` به‌روزرسانی کنید.

## استفاده

راه‌اندازی ربات:

```bash
npm start
```

برای توسعه با راه‌اندازی مجدد خودکار:

```bash
npm run dev
```

## دستورات ربات

ربات از یک رابط مبتنی بر دکمه با گزینه‌های زیر استفاده می‌کند:

- **تنظیم شناسه قبض**: پیکربندی شناسه قبض شما
- **تنظیم توکن احراز هویت**: تنظیم توکن احراز هویت API شما
- **تنظیم زمان برنامه**: سفارشی‌سازی زمان دریافت به‌روزرسانی‌های روزانه (فرمت ۲۴ ساعته، زمان تهران)
- **شروع ربات**: آغاز بررسی‌های زمان‌بندی شده (نیازمند شناسه قبض و توکن احراز هویت)
- **توقف ربات**: مکث در بررسی‌های زمان‌بندی شده
- **نمایش تنظیمات**: نمایش پیکربندی فعلی

## پایگاه داده

داده‌های کاربر در یک پایگاه داده SQLite در دایرکتوری `db/` ذخیره می‌شود. پایگاه داده به طور خودکار در اولین اجرا ایجاد می‌شود.

## منطقه زمانی

ربات برای تمام عملیات زمان‌بندی به استفاده از منطقه زمانی تهران (Asia/Tehran) پیکربندی شده است.

## تقویم فارسی

ربات از کتابخانه `jalali-moment` برای قالب‌بندی تاریخ‌ها در سیستم تقویم فارسی (شمسی) استفاده می‌کند.

## یکپارچه‌سازی API

ربات برای کار با API قطعی برق طراحی شده است. شما نیاز خواهید داشت:

1. یک شناسه قبض برای شناسایی ارائه دهید
2. یک توکن احراز هویت برای دسترسی به API تأمین کنید
3. API با تاریخ فارسی فعلی فراخوانی می‌شود

## مجوز

MIT

---

# Power Outage Telegram Bot

A Telegram bot that checks a power outage API on a daily schedule and sends notifications to users. The bot is configured to work with Tehran time zone and includes Persian (Shamsi) calendar support.

## Features

- Daily scheduled API checks at user-defined times (24h format, Tehran timezone)
- Persian (Shamsi) calendar integration
- User-friendly button interface for configuration
- Secure storage of user credentials using SQLite
- Customizable schedule time with default fallback
- Immediate data fetch when bot is started

## Requirements

- Node.js 14.x or higher
- Telegram Bot Token (obtained from [@BotFather](https://t.me/BotFather))
- API access credentials (Bill ID and Authorization Token)

## Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file based on the `.env.example` template:

```bash
cp .env.example .env
```

4. Edit the `.env` file and add your Telegram Bot Token:

```
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

5. Update the API endpoint in the `.env` file if needed.

## Usage

Start the bot:

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

## Bot Commands

The bot uses a button-based interface with the following options:

- **Set Bill ID**: Configure your bill identifier
- **Set Authorization Token**: Set your API authorization token
- **Set Schedule Time**: Customize when you receive daily updates (24h format, Tehran time)
- **Start Bot**: Begin scheduled checks (requires Bill ID and Authorization Token)
- **Stop Bot**: Pause scheduled checks
- **Show Settings**: Display current configuration

## Database

User data is stored in an SQLite database located in the `db/` directory. The database is automatically created on first run.

## Time Zone

The bot is configured to use Tehran time zone (Asia/Tehran) for all scheduling operations.

## Persian Calendar

The bot uses the `jalali-moment` library to format dates in the Persian (Shamsi) calendar system.

## API Integration

The bot is designed to work with a power outage API. You'll need to:

1. Provide a Bill ID for identification
2. Supply an Authorization Token for API access
3. The API is called with the current Persian date

## License

MIT