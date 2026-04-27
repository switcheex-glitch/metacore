import { useEffect, useState } from "react";
import {
  Rocket,
  Layout,
  Palette,
  Plug,
  Sparkles,
  Mail,
  Copy,
  Check,
  Wallet,
  Plus,
  Loader2,
  AlertCircle,
  Wrench,
  TrendingUp,
  Send,
  X,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useT } from "@/hooks/use-t";
import { invoke } from "@/ipc/ipc_client";

type HubCategory = "wallet" | "templates" | "sections" | "ui" | "integrations" | "tools" | "earnings" | "custom";

export type HubItem = {
  id: string;
  name: string;
  hint: string;
  priceKopecks: number;
  tag?: string;
  prompt: string;
};

export const TEMPLATES: HubItem[] = [
  {
    id: "saas-starter",
    name: "SaaS Starter",
    hint: "Auth + подписки + дашборд + биллинг",
    priceKopecks: 99900,
    tag: "Популярный",
    prompt: `Сделай НОВЫЙ production-grade SaaS-стартер через <metacore-create-app name="SaaS Starter" description="SaaS platform" />. Стек: React 18 + TypeScript + Vite + Tailwind + shadcn/ui + react-router-dom v6 + @tanstack/react-query + Zustand + Supabase (auth, БД, edge functions) + Stripe (подписки).
Обязательно реализуй все страницы и фичи целиком, без заглушек:
1) Маркетинг: / (landing с hero/features/pricing/FAQ/CTA/footer), /privacy, /terms.
2) Auth: /login, /signup, /forgot, /reset — email/password + магические ссылки Supabase, OAuth Google. Защита маршрутов через <ProtectedRoute>.
3) Дашборд: /app (overview с KPI-карточками и графиком за 30 дней), /app/settings (profile: имя/аватар; account: смена email/password; billing: текущий план, Stripe Customer Portal, история инвойсов), /app/team (инвайты по email, роли owner/admin/member, удаление участников).
4) Биллинг: три плана (Free, Pro $19/мес, Team $49/мес) на /pricing и в /app/settings → billing. Stripe Checkout для оформления, Stripe webhook edge function для активации/отмены. Хранить subscription в таблице subscriptions.
5) БД Supabase: profiles (id, email, full_name, avatar_url), organizations (id, name, slug, owner_id), memberships (user_id, org_id, role), subscriptions (org_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end). RLS на каждую таблицу с политиками per-org.
6) Supabase edge functions: stripe-webhook (обработка checkout.session.completed, customer.subscription.updated/deleted), create-checkout-session (создаёт Stripe session для org), create-portal-session.
7) UI: тёмная тема по умолчанию + переключатель, sidebar с навигацией, топ-бар с user-меню и org-switcher, toast через sonner.
8) ENV-плейсхолдеры: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_TEAM.
9) README.md с пошаговой настройкой: создать Supabase проект, прогнать миграции из supabase/migrations/, задеплоить edge functions, завести Stripe продукты, прописать webhook URL, вставить ключи в .env.
Запусти превью и убедись что лендинг и /login рендерятся.`,
  },
  {
    id: "ecommerce",
    name: "E-commerce",
    hint: "Каталог, корзина, Stripe, заказы",
    priceKopecks: 149000,
    prompt: `Сделай НОВЫЙ E-commerce магазин через <metacore-create-app name="Shop" description="E-commerce store" />. Стек: React 18 + TS + Vite + Tailwind + shadcn/ui + react-router-dom + @tanstack/react-query + Zustand (корзина с persist в localStorage) + Supabase (товары, заказы) + Stripe Checkout.
Реализуй целиком:
1) Каталог /: grid карточек товара (фото, название, цена, кнопка «В корзину»), поиск, фильтр по категориям, сортировка (цена, новинки), пагинация.
2) Карточка товара /product/:slug: галерея 4 фото, описание, характеристики, выбор варианта (размер/цвет), счётчик количества, кнопка «В корзину», «Купить сейчас», блок «Похожие товары».
3) Корзина /cart: список позиций с превью, изменение количества, удаление, subtotal/shipping/total, промокод. Sidebar-версия корзины (Sheet) тоже работает.
4) Оформление /checkout: форма с доставкой (имя, телефон, адрес, комментарий), выбор способа доставки (курьер/самовывоз/почта), выбор оплаты (Stripe / наложенный). react-hook-form + zod.
5) Оплата через Stripe Checkout → edge function create-checkout-session → /checkout/success, /checkout/cancel.
6) Админка /admin (защищена ролью admin): список товаров с поиском, создание/редактирование товара (фото upload в Supabase Storage, цена, склад, категории, варианты), список заказов со статусами (new/paid/shipped/delivered/canceled), смена статуса.
7) БД: products (id, slug, name, description, price_cents, images[], category, stock), categories, orders (id, user_id, status, total_cents, items jsonb, shipping), order_items. RLS на всё.
8) Auth через Supabase: /login, /signup, личный кабинет /account с историей заказов.
9) UI: тёмная тема, responsive (mobile-first), скелетоны при загрузке, toast-уведомления.
10) README.md с настройкой Supabase, Stripe, seed-данные для 12 демо-товаров.
Запусти превью, убедись что каталог рендерится.`,
  },
  {
    id: "dashboard",
    name: "Admin Dashboard",
    hint: "Sidebar, таблицы, графики Recharts",
    priceKopecks: 79000,
    prompt: `Сделай НОВЫЙ Admin Dashboard через <metacore-create-app name="Admin Dashboard" description="Admin panel template" />. Стек: React 18 + TS + Vite + Tailwind + shadcn/ui + react-router-dom + @tanstack/react-query + @tanstack/react-table + recharts + date-fns.
Реализуй целиком:
1) Layout: sticky sidebar (collapsible, иконки при свёрнутом) с секциями Overview/Analytics/Users/Orders/Products/Settings, topbar с breadcrumbs, user-menu (avatar, dropdown), search.
2) /overview: 4 KPI-карточки (Revenue, Orders, Users, Conversion) с delta vs prev period и sparkline, большой график выручки за 30 дней (AreaChart), топ-5 товаров (BarChart), последние 10 заказов в таблице.
3) /analytics: переключатель периода (7/30/90 дней), графики Line/Area/Bar/Pie по выручке/заказам/источникам трафика, heatmap активности по часам.
4) /users: таблица пользователей с сортировкой, фильтрацией, поиском, пагинацией, bulk-действиями (удалить, заблокировать), экспорт в CSV. Клик по строке → /users/:id с профилем и историей.
5) /orders: таблица заказов, фильтры по статусу/датам, детальный просмотр заказа, смена статуса.
6) /products: CRUD товаров с upload фото, вариантами, складом.
7) /settings: профиль, безопасность (2FA), уведомления, API-токены, команда (роли).
8) Тёмная/светлая тема с toggle, сохранение в localStorage.
9) Mock-данные через MSW (Mock Service Worker) — 50 пользователей, 200 заказов, 30 товаров — чтобы всё сразу работало без бэкенда.
10) README.md с описанием структуры и как подменить MSW на реальный API.
Запусти превью, убедись что /overview рендерится со всеми KPI и графиками.`,
  },
  {
    id: "tg-bot",
    name: "Telegram Bot",
    hint: "Python + aiogram, webhook, команды",
    priceKopecks: 49000,
    prompt: `Сделай Telegram-бот на Python 3.11 + aiogram 3.x через <metacore-create-app name="TG Bot" description="Telegram bot" />. Структура:
bot/
  main.py, bot.py, dispatcher.py
  handlers/ (start.py, help.py, menu.py, profile.py, admin.py)
  keyboards/ (reply.py, inline.py)
  middlewares/ (logging.py, throttling.py, user_registration.py)
  states/ (registration.py, order.py) — FSM
  services/ (db.py, notifications.py)
  config.py, .env.example

Функционал:
1) /start — приветствие, регистрация пользователя в SQLite (users table), главное меню inline-кнопками.
2) /help — список команд.
3) /profile — карточка профиля с ФИО, телефоном, балансом. Кнопка «Изменить».
4) FSM регистрации: запрос имени → телефона → подтверждение.
5) /menu — inline-меню с кнопками «Каталог/Корзина/Заказы/Поддержка».
6) /admin (только для ADMIN_IDS из .env): рассылка по всем пользователям, статистика (кол-во юзеров, активных за 24ч), бан/разбан.
7) Throttling middleware — не больше 1 сообщения/сек на юзера.
8) Логирование всех обращений в лог-файл + в БД.
9) Запуск: polling (dev) и webhook (prod, FastAPI endpoint /webhook).
10) Dockerfile + docker-compose.yml с PostgreSQL.

БД (через SQLAlchemy 2.x async): users (id, tg_id, full_name, phone, balance, is_banned, created_at), messages (id, user_id, text, direction, created_at).

requirements.txt: aiogram==3.*, sqlalchemy[asyncio]==2.*, asyncpg, aiosqlite, fastapi, uvicorn, pydantic-settings, python-dotenv.

.env.example: BOT_TOKEN=, ADMIN_IDS=123,456, DB_URL=sqlite+aiosqlite:///bot.db, WEBHOOK_URL=, WEBHOOK_SECRET=.

README.md: получить токен у @BotFather, заполнить .env, python -m bot.main для polling, инструкция по деплою с webhook на Fly.io/Railway/VPS.

После создания файлов — run_shell: python -m venv venv, venv\\Scripts\\activate && pip install -r requirements.txt (если Python есть), иначе подскажи winget install Python.Python.3.12.`,
  },
  {
    id: "tg-mini",
    name: "Telegram Mini App",
    hint: "React + WebApp SDK, auth через initData",
    priceKopecks: 69000,
    prompt: `Сделай Telegram Mini App через <metacore-create-app name="TG Mini" description="Telegram Mini App" />. Стек: React 18 + TS + Vite + Tailwind + shadcn/ui + Zustand + @telegram-apps/sdk-react + react-router-dom.
Реализуй:
1) index.html подключает https://telegram.org/js/telegram-web-app.js до остальных скриптов.
2) src/telegram/init.ts — инициализация WebApp: expand(), enableClosingConfirmation(), setHeaderColor по theme, viewportStableHeight listener, BackButton и MainButton API как React-хуки.
3) src/auth/validate.ts — клиентская распарковка initDataUnsafe (user, start_param, auth_date). Серверная валидация HMAC в Supabase edge function validate-init-data (принимает initData raw, проверяет подпись BOT_TOKEN, выдаёт JWT).
4) Страницы:
   - / Home: аватар/имя из tg.user, приветствие, большие кнопки навигации.
   - /profile: полный профиль с данными из Telegram + кастомные поля (сохраняются в Supabase таблицу tg_users).
   - /catalog: список карточек, использует MainButton «Добавить в корзину».
   - /cart: корзина, MainButton «Оформить» → открывает invoice через sendInvoice API (бот должен быть настроен).
   - /settings: тема, язык, уведомления.
5) Нативные виджеты: tg.HapticFeedback на клики, tg.showPopup вместо window.alert, tg.showConfirm вместо confirm.
6) Авто-тема: цвета Tailwind берутся из tg.themeParams через CSS-переменные, обновляются в event theme_changed.
7) BackButton управляется роутером: на дочерних страницах show + onClick navigate(-1).
8) Supabase таблица tg_users (id, tg_id, first_name, last_name, username, photo_url, language_code, created_at) + edge function auth.
9) README.md: как зарегистрировать Mini App у @BotFather через /newapp, как задать BOT_TOKEN, как проверить HMAC подпись.
10) ENV: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, BOT_TOKEN (в secrets edge function).
Запусти превью. В локальной разработке, если WebApp SDK не находит tg-контекст, используй мок initData в dev-режиме.`,
  },
  {
    id: "discord-bot",
    name: "Discord Bot",
    hint: "discord.js, слеш-команды, деплой на Fly.io",
    priceKopecks: 49000,
    prompt: `Сделай Discord-бот на discord.js v14 + TypeScript через <metacore-create-app name="Discord Bot" description="Discord bot" />. Структура:
src/
  index.ts (entry), client.ts, deploy-commands.ts
  commands/ping.ts, help.ts, userinfo.ts, serverinfo.ts, avatar.ts, poll.ts, kick.ts, ban.ts, mute.ts, purge.ts, role.ts, welcome.ts
  events/ready.ts, interactionCreate.ts, guildMemberAdd.ts, messageCreate.ts
  utils/logger.ts, db.ts (SQLite через better-sqlite3)
  config.ts

Функционал:
1) 12 слеш-команд с правильной типизацией SlashCommandBuilder, автокомплит, пермишны.
2) /poll — опрос с кнопками и счётчиком голосов.
3) Модерация: /kick /ban /mute /purge — требуют прав ManageMessages/KickMembers и логируют в канал-лог.
4) /welcome — настройка канала приветствия, событие guildMemberAdd шлёт embed новому участнику.
5) Логирование: все команды + действия модерации в SQLite.
6) Graceful shutdown на SIGINT/SIGTERM.
7) npm run deploy — регистрация slash-команд через REST API.

package.json: discord.js@14, @types/node, typescript, tsx (для dev), better-sqlite3, dotenv.

.env.example: DISCORD_TOKEN=, CLIENT_ID=, GUILD_ID= (для dev — команды на одном сервере).

fly.toml для деплоя на Fly.io + Dockerfile.

README.md: создать приложение на https://discord.com/developers/applications, скопировать TOKEN и CLIENT_ID, пригласить бота через OAuth2 URL Generator с scopes bot+applications.commands, npm run deploy, npm start.

После файлов — run_shell: npm install && npm run build (если Node.js стоит, иначе winget install OpenJS.NodeJS).`,
  },
  {
    id: "chrome-ext",
    name: "Chrome Extension",
    hint: "MV3, popup, content script, storage",
    priceKopecks: 59000,
    prompt: `Сделай Chrome Extension Manifest V3 через <metacore-create-app name="Chrome Ext" description="Chrome extension" />. Стек: React 18 + TS + Vite (с @crxjs/vite-plugin) + Tailwind + shadcn/ui.
Структура:
src/
  popup/ (index.html, App.tsx, main.tsx) — popup UI
  options/ (index.html, Options.tsx) — страница настроек
  background/background.ts — service worker
  content/content.ts — content script
  lib/storage.ts (typed chrome.storage.sync wrapper), messaging.ts
manifest.json (MV3)

Функциональность:
1) Popup 360×480: показ текущего URL, заголовок вкладки, счётчик посещений (из storage), кнопка «Сохранить в избранное», список избранного с удалением.
2) Options: настройки (тема, hotkey, домены для автоактивации), сохраняются в chrome.storage.sync.
3) Content script: инжектится на всех страницах (matches ["<all_urls>"]), показывает плавающую кнопку в углу с shortcut-меню; отправляет в background данные о странице.
4) Background (service worker): chrome.action.onClicked, chrome.tabs.onUpdated, chrome.alarms для периодических задач, chrome.contextMenus для правого клика.
5) Горячая клавиша (commands в manifest): Ctrl+Shift+Y открывает popup.
6) i18n: _locales/en/messages.json, _locales/ru/messages.json.
7) Иконки 16/32/48/128 px генерируются в public/icons/ (валидные PNG-плейсхолдеры).

manifest.json: manifest_version 3, permissions ["storage","tabs","activeTab","contextMenus","alarms"], host_permissions ["<all_urls>"], action с default_popup, options_page, background.service_worker, content_scripts, commands, icons.

README.md: npm install, npm run build, chrome://extensions → Developer mode → Load unpacked → выбрать dist/.

После файлов — run_shell: npm install && npm run build.`,
  },
  {
    id: "electron",
    name: "Electron App",
    hint: "Готовый scaffold с auto-updater",
    priceKopecks: 89000,
    prompt: `Сделай Electron desktop app через <metacore-create-app name="Electron App" description="Electron desktop app" />. Стек: Electron 30 + electron-forge + Vite + React 18 + TS + Tailwind + shadcn/ui + update-electron-app (auto-updates через GitHub Releases).
Структура:
src/
  main.ts (Electron main, создание BrowserWindow, IPC handlers, auto-updater)
  preload.ts (contextBridge для безопасного IPC)
  renderer.tsx (React entry)
  App.tsx, components/*, pages/*
forge.config.ts — MakerSquirrel для Windows, MakerDMG для macOS, MakerDeb для Linux; FusesPlugin со строгим security; VitePlugin.

Функционал:
1) Безрамочное окно с кастомным title-bar (window controls: min/max/close через IPC).
2) System tray icon с меню (Show/Hide/Quit).
3) Global shortcut (Ctrl+Shift+Space) — показать окно.
4) IPC примеры: window:minimize/maximize/close, fs:openFile (диалог выбора файла), app:version, notify (native notification).
5) Настройки в app.getPath('userData')/settings.json: тема, запуск с системой (через auto-launch), горячая клавиша.
6) Auto-update через update-electron-app с fallback на GitHub Releases. Настройки «Проверить обновления».
7) Protect shortcuts: блок DevTools в production через webPreferences, secure CSP, webSecurity: true.
8) React UI: dashboard с системной инфой (platform/arch/version из IPC), страница настроек.
9) GitHub Actions workflow .github/workflows/release.yml: на тэг v* собирает win/mac/linux через electron-forge make и публикует GitHub Release.

package.json scripts: start (electron-forge start), package, make, publish.

README.md: npm install, npm start. Для релиза: git tag v1.0.0 && git push --tags.

После файлов — run_shell: npm install (Node.js требуется; если нет — winget install OpenJS.NodeJS).`,
  },
];

export const SECTIONS: HubItem[] = [
  {
    id: "hero-bold",
    name: "Hero Bold",
    hint: "Крупный заголовок + видео-фон",
    priceKopecks: 19000,
    prompt: `Добавь в текущий React+Tailwind проект секцию Hero Bold в src/components/sections/HeroBold.tsx и подключи её в src/pages/Index.tsx первой секцией.
Дизайн:
- Full-bleed секция min-h-screen, фоновое <video> autoplay muted loop playsinline с плейсхолдером https://cdn.coverr.co/videos/coverr-keyboard-typing-4280/1080p.mp4 и затемняющим overlay (bg-black/60).
- Центрированный контент: eyebrow бейдж (pill, backdrop-blur, border-white/20), H1 text-6xl md:text-7xl font-semibold tracking-tight text-white с градиент-акцентом на одно слово (bg-gradient-to-r from-primary to-fuchsia-400 bg-clip-text text-transparent), подзаголовок text-lg text-white/70 max-w-2xl, две CTA-кнопки (primary filled + outline ghost), маркер доверия (5 звёзд + текст "12 400+ athletes").
- Анимации: появление через framer-motion (если не установлен — поставь <metacore-add-dependency packages="framer-motion" />), staggerChildren на дочерних элементах.
- Полностью responsive: на mobile — text-4xl, кнопки в колонку, видео остаётся фоном.
Никаких заглушек, весь компонент должен рендериться и анимироваться.`,
  },
  {
    id: "pricing-3col",
    name: "Pricing 3 колонки",
    hint: "Shadcn + подсветка популярного",
    priceKopecks: 19000,
    prompt: `Добавь секцию Pricing в src/components/sections/Pricing.tsx и подключи в src/pages/Index.tsx.
Три карточки (Starter $0, Pro $19/mo — выделен как popular, Business $49/mo):
- Header: название плана, цена крупно с /mo, описание в одну строку.
- Список фич: 6–8 пунктов с иконкой Check (lucide-react) для включённых и X mute для невключённых.
- CTA: "Start free" / "Start trial" / "Contact us".
- Popular-план: увеличен на 5%, border-primary, тень shadow-2xl shadow-primary/20, бейдж "Most popular" сверху.
- Toggle Monthly/Yearly сверху: при Yearly скидка 20% показывается через перечёркнутую цену.
- Responsive: на mobile — stack вертикально.
- Tailwind + shadcn/ui Card, Badge, Button. Данные планов вынеси в массив PLANS наверху файла.`,
  },
  {
    id: "testimonials-carousel",
    name: "Отзывы карусель",
    hint: "Embla, аватары, 2 варианта",
    priceKopecks: 19000,
    prompt: `Добавь секцию Testimonials в src/components/sections/Testimonials.tsx. Используй embla-carousel-react (поставь через <metacore-add-dependency packages="embla-carousel-react embla-carousel-autoplay" />).
Два варианта отображения — переключаются prop variant="carousel" | "grid":
- Carousel: бесконечная прокрутка (autoplay 4s, loop, stopOnInteraction), 3 слайда на десктопе, 1 на mobile. Стрелки prev/next, индикаторные точки.
- Grid: 3×2 карточек без анимации.
Карточка отзыва: квоты-иконка сверху, текст в 3–4 строках, снизу — аватар (Unsplash random portrait URL), имя, должность, компания, рейтинг 5 звёзд.
Массив TESTIMONIALS из 6 реалистичных записей на русском и английском.
Плавная анимация появления секции при скролле через IntersectionObserver.`,
  },
  {
    id: "features-bento",
    name: "Features Bento",
    hint: "Модный bento-grid макет",
    priceKopecks: 29000,
    tag: "Новое",
    prompt: `Добавь секцию Features Bento в src/components/sections/FeaturesBento.tsx.
Bento-grid 4×3 (desktop) из 6 карточек разного размера (col-span-2/row-span-2 для двух главных). Каждая карточка:
- Иконка из lucide-react (Zap, Shield, Layers, Sparkles, Activity, Rocket) 40×40 в цветном круге.
- Заголовок text-xl font-semibold.
- Описание 2–3 строки text-muted-foreground.
- Hover-эффект: scale-[1.02], glow через box-shadow primary.
- Две главные карточки — с декоративным gradient-background и illustration (псевдо-3D SVG сгенерируй inline).
Фичи: Lightning-fast, Secure by default, Beautiful components, Built for scale, Live analytics, Deploy in seconds.
Responsive: на mobile — single-column stack, большие карточки первыми.
Tailwind, без сторонних библиотек. Вертикально центрированные заголовок секции и подзаголовок сверху.`,
  },
  {
    id: "faq-accordion",
    name: "FAQ Аккордеон",
    hint: "Shadcn Accordion, 8 вопросов",
    priceKopecks: 15000,
    prompt: `Добавь секцию FAQ в src/components/sections/FAQ.tsx. Используй shadcn/ui Accordion (если нет — npx shadcn@latest add accordion или реализуй через <details>).
8 вопросов-ответов на русском по SaaS-тематике (оплата, возврат, команда, безопасность данных, интеграции, поддержка, отмена, бесплатный тариф). Каждый ответ — 2–3 предложения полным текстом, без «Lorem ipsum».
Layout: заголовок секции text-3xl, подзаголовок, поисковая строка фильтрации вопросов, ниже — аккордеон max-w-3xl mx-auto. Кнопка «Задать свой вопрос» снизу.
Анимация раскрытия плавная (data-state=open transitions), chevron поворачивается 180°.`,
  },
  {
    id: "footer-mega",
    name: "Mega Footer",
    hint: "4 колонки + соцсети + newsletter",
    priceKopecks: 19000,
    prompt: `Добавь Mega Footer в src/components/sections/Footer.tsx и подключи в App.tsx внизу layout.
Структура:
- Верхний блок newsletter: заголовок «Подпишитесь на рассылку», подзаголовок, inline-форма email + кнопка «Подписаться», валидация zod.
- Нижний блок 4 колонки:
  Product: Features, Pricing, Changelog, Roadmap, Docs.
  Company: About, Blog, Careers, Press, Contact.
  Resources: Help center, Community, API, Status, Security.
  Legal: Terms, Privacy, Cookies, DPA, GDPR.
- Самая левая колонка: логотип, слоган, соц-иконки (Twitter, GitHub, LinkedIn, YouTube, Discord из lucide-react).
- Низ: «© 2026 Company. All rights reserved.», language-switcher, theme-switcher.
Responsive: на mobile — колонки в аккордеон.
Чистый Tailwind, без лишних библиотек, только react-hook-form+zod для формы (поставь через <metacore-add-dependency packages="react-hook-form zod @hookform/resolvers" /> если нет).`,
  },
];

export const UI_KITS: HubItem[] = [
  {
    id: "glass",
    name: "Glassmorphism Kit",
    hint: "30+ компонентов, стекло + blur",
    priceKopecks: 129000,
    prompt: `Внеси в текущий проект UI-кит Glassmorphism.
1) src/index.css: переопредели CSS-переменные темы — прозрачные цвета с alpha (0.6–0.8), добавь переменные для glass-surface: --glass-bg, --glass-border, --glass-shadow, --glass-blur.
2) tailwind.config.ts: расширь backdropBlur (glass-sm: 12px, glass: 20px, glass-lg: 32px), colors.glass через CSS-vars, boxShadow.glass (0 8px 32px rgba(0,0,0,0.18)).
3) body: добавь фон-градиент (например, radial-gradient с двумя цветовыми пятнами) — ч чтобы blur был виден.
4) Обнови все компоненты src/components/ui/: button, card, dialog, dropdown-menu, input, select, sheet, tabs, tooltip. Каждый — bg-white/10 backdrop-blur-glass border border-white/20 shadow-glass rounded-2xl.
5) Добавь новые: src/components/ui/glass-card.tsx, glass-nav.tsx с hover-эффектом shine (conic-gradient crossover).
6) src/pages/Index.tsx: демо с 6 карточками разных вариантов (header, nav, stats, form, modal-trigger, image-card).
7) README-фрагмент в src/components/ui/README.md с примерами использования.
Не сломай существующий код — изменения в ui/ обратно совместимы через className overrides.`,
  },
  {
    id: "brutalism",
    name: "Brutalism Kit",
    hint: "Жирные тени, толстые рамки, контрасты",
    priceKopecks: 129000,
    prompt: `Внеси UI-кит Brutalism.
1) src/index.css: яркие контрастные цвета — --primary: 60 100% 50% (желтый), --secondary: 0 100% 55% (красный), --accent: 240 100% 50% (синий), --background: 48 100% 96%, --foreground: 0 0% 0%. Шрифт: Space Grotesk / Archivo (подключи через @fontsource-variable/space-grotesk + @fontsource-variable/archivo, добавь через <metacore-add-dependency />).
2) tailwind.config.ts: borderWidth.3 (3px), .5 (5px); boxShadow.brut (6px 6px 0 0 #000), .brut-lg (10px 10px 0 0 #000); rounded none / xl только.
3) Компоненты src/components/ui/*: прямоугольные (rounded-none), border-3 border-black, shadow-brut, на hover translate-x-[2px] translate-y-[2px] shadow-none. Buttons большие, bold uppercase tracking-wide.
4) Новые компоненты: marquee.tsx (бегущая строка), sticker.tsx (rotate-[-3deg], шрифт капс, цветной фон).
5) Typography: h1 text-7xl font-black uppercase, h2 text-5xl, все с text-stroke через -webkit-text-stroke или градиент.
6) Demo в src/pages/Index.tsx: hero с огромным заголовком, сетка карточек, marquee-лента.
Никаких полумер — брутально во всём.`,
  },
  {
    id: "retro-8bit",
    name: "Retro 8-bit Kit",
    hint: "Пиксельный стиль, пресс-старт шрифты",
    priceKopecks: 99000,
    prompt: `Внеси UI-кит Retro 8-bit.
1) Шрифты: Press Start 2P (@fontsource/press-start-2p) для заголовков/акцентов, VT323 (@fontsource/vt323) для текста. Поставь через <metacore-add-dependency />.
2) Цветовая палитра NES: --primary: 120 100% 45% (зелёный), --accent: 300 100% 60% (розовый), --background: 230 50% 8% (тёмно-синий), --foreground: 60 100% 90% (жёлто-белый).
3) Все углы: rounded-none. Границы: чёткие 2–4px. Тени: 4px 4px 0 0 currentColor (step-shadow).
4) src/components/ui/*: button с pixel-perfect outline, pressed state сдвигает тень; card с "сканлайном" через background-image linear-gradient; input — мигающий курсор через CSS-анимацию.
5) Новые компоненты: pixel-heart.tsx (иконка сердечка 8×8 через CSS grid), pixel-border.tsx (обёртка с 9-slice pixel рамкой через CSS).
6) Screen-эффект: CRT-scanlines overlay на body (position fixed, pointer-events none, repeating-linear-gradient).
7) Demo в src/pages/Index.tsx: заставка «Press Start», меню с выбором опций, HUD с health-bar.
Воспроизведи атмосферу NES/Game Boy полностью.`,
  },
  {
    id: "soft-pastel",
    name: "Soft Pastel Kit",
    hint: "Мягкие тона, скруглённости, анимации",
    priceKopecks: 99000,
    prompt: `Внеси UI-кит Soft Pastel.
1) Шрифт: Plus Jakarta Sans (@fontsource-variable/plus-jakarta-sans).
2) Палитра пастелей: --background: 330 100% 98%, --primary: 260 60% 75% (лавандовый), --secondary: 180 60% 80% (мятный), --accent: 25 90% 85% (персик), --card: 0 0% 100%, --foreground: 240 30% 20%.
3) tailwind.config.ts: все rounded-3xl/4xl (добавь 2rem/2.5rem), boxShadow.soft (0 10px 40px -10px rgba(100,60,200,0.15)).
4) Компоненты src/components/ui/*: более крупные padding, нежные hover-тени, плавные transitions 300ms cubic-bezier.
5) Микроанимации: использовать framer-motion (поставь если нет), subtle floating у декоративных элементов, spring-анимация у Button при клике.
6) Декорации: blobs через SVG в углах секций (размытые пастельные капли).
7) Новые компоненты: feature-card.tsx с иллюстрацией слева, stat-card.tsx с big-number и sparkline, testimonial-bubble.tsx в виде речевого облачка.
8) Demo: нежная landing с hero (blob-декором), фичами 3×2, CTA-секцией с градиент-фоном.
Атмосфера: уютно, дружелюбно, для детского образования / wellness-приложения.`,
  },
];

export const TOOLS: HubItem[] = [
  {
    id: "pwa-wrap",
    name: "PWA-обёртка",
    hint: "Превратить сайт в устанавливаемое приложение",
    priceKopecks: 0,
    prompt: `Преобразуй текущий React+Vite проект в PWA.
1) Установи vite-plugin-pwa: <metacore-add-dependency packages="vite-plugin-pwa workbox-window" />
2) vite.config.ts: добавь VitePWA({ registerType: 'autoUpdate', includeAssets: ['favicon.ico', 'apple-touch-icon.png'], manifest: { name: 'App', short_name: 'App', theme_color: '#0b0b0f', background_color: '#0b0b0f', display: 'standalone', start_url: '/', icons: [...192,512 от /icons/] }, workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'] } })
3) Создай public/icons/icon-192.png, icon-512.png, apple-touch-icon.png, maskable-icon-512.png (валидные placeholder PNG разных цветов).
4) index.html: добавь <link rel="manifest">, <meta name="theme-color">, apple-touch-icon.
5) src/pwa/register.tsx — useRegisterSW hook с баннером "Доступно обновление" + "Готово к офлайн".
6) Подключи в src/main.tsx и src/App.tsx.
7) README-секция: как проверить в Chrome DevTools → Application → Manifest.
Запусти превью и убедись что SW зарегистрирован.`,
  },
  {
    id: "dockerfile-gen",
    name: "Dockerfile + compose",
    hint: "Готовый продакшн-контейнер",
    priceKopecks: 0,
    prompt: `Собери продакшн Dockerfile + docker-compose.yml для текущего проекта.
1) Определи стек из package.json (Vite/Next/Express/NestJS/Python/Go — читай список зависимостей).
2) Dockerfile: multi-stage build. Stage builder — node:22-alpine, npm ci, npm run build. Stage runtime — nginx:alpine (для SPA) или node:22-alpine (для SSR/API). Минимальный размер.
3) .dockerignore: node_modules, dist, .git, .env*, *.log, .vscode.
4) docker-compose.yml: сервис app (порт 3000/8080), nginx.conf с fallback на index.html для SPA. Опционально — сервис postgres:16 если проект юзает Supabase/Postgres.
5) nginx.conf (для SPA): try_files $uri $uri/ /index.html; gzip on; cache static.
6) README-секция: docker compose build && docker compose up.
7) .env.example с нужными переменными.
Не запускай docker (у пользователя может не быть), но убедись что файлы валидны синтаксически.`,
  },
];

export const INTEGRATIONS: HubItem[] = [
  {
    id: "sentry",
    name: "Sentry",
    hint: "Error tracking — настройка в 1 клик",
    priceKopecks: 39000,
    prompt: `Интегрируй Sentry в текущий React+Vite проект.
1) <metacore-add-dependency packages="@sentry/react @sentry/vite-plugin" />.
2) src/integrations/sentry/init.ts: Sentry.init с dsn из VITE_SENTRY_DSN, integrations: browserTracingIntegration, replayIntegration (10% sample, 100% errors), tracesSampleRate 0.2, environment из MODE.
3) src/main.tsx: импорт init до ReactDOM.createRoot.
4) Глобальный ErrorBoundary: src/components/SentryErrorBoundary.tsx оборачивает <App/> и показывает fallback с кнопкой «Отправить отзыв» (Sentry.showReportDialog).
5) vite.config.ts: добавь sentryVitePlugin в plugins с SENTRY_AUTH_TOKEN (в build-time, не в runtime), загрузка source maps.
6) .env.example: VITE_SENTRY_DSN=, SENTRY_AUTH_TOKEN=, SENTRY_ORG=, SENTRY_PROJECT=.
7) README.md src/integrations/sentry/README.md: шаги — sentry.io, создать проект React, скопировать DSN и auth token (Settings → Auth tokens), вставить в .env, npm run build.
Проверь TS-типы.`,
  },
  {
    id: "posthog",
    name: "PostHog",
    hint: "Аналитика + A/B эксперименты",
    priceKopecks: 39000,
    prompt: `Интегрируй PostHog.
1) <metacore-add-dependency packages="posthog-js" />.
2) src/integrations/posthog/provider.tsx: PostHogProvider, init с VITE_POSTHOG_KEY и apiHost VITE_POSTHOG_HOST (дефолт https://eu.i.posthog.com), capture_pageview: true, persistence: 'localStorage+cookie'.
3) Оберни <App/> в src/main.tsx в PostHogProvider.
4) Хук useAnalytics(): методы track(event, props), identify(userId, traits), group(type, id), reset() — all wraps posthog.capture/identify.
5) Трекинг автоматический: pageview на useLocation change (для react-router).
6) Feature flags: хук useFeatureFlag('flag_name') → boolean/variant через posthog.getFeatureFlag; компонент-обёртка <ExperimentVariant flag="x" variants={{a: ..., b: ...}} />.
7) .env.example: VITE_POSTHOG_KEY=, VITE_POSTHOG_HOST=.
8) README с регистрацией в PostHog, где взять ключи, как создать feature flag.`,
  },
  {
    id: "amplitude",
    name: "Amplitude",
    hint: "Продуктовая аналитика + события",
    priceKopecks: 39000,
    prompt: `Интегрируй Amplitude Analytics.
1) <metacore-add-dependency packages="@amplitude/analytics-browser @amplitude/plugin-session-replay-browser" />.
2) src/integrations/amplitude/init.ts: init(API_KEY, userId?, { defaultTracking: { sessions: true, pageViews: true, formInteractions: true, fileDownloads: false } }); add sessionReplayPlugin с sampleRate 0.1.
3) src/main.tsx: импорт init до рендера.
4) Хук useAmplitude(): track(event, properties), identify({userId, userProperties}), revenue({productId, price, quantity}), setGroup(type, id).
5) Утилита trackPage(name, props) — вызывать в useEffect на страницах.
6) Типизация: EventName union + EventProperties интерфейсы для type-safety.
7) .env.example: VITE_AMPLITUDE_API_KEY=.
8) README: amplitude.com → создать project → скопировать API key → .env.`,
  },
  {
    id: "yookassa",
    name: "YooKassa",
    hint: "Приём оплат картами в РФ",
    priceKopecks: 59000,
    prompt: `Интегрируй YooKassa для приёма платежей в РФ.
1) Клиент: src/integrations/yookassa/client.tsx — обёртка с методом createPayment(amount, description, returnUrl). Бэкенд-вызов, т.к. shopId+secretKey не должны жить на клиенте.
2) Серверная часть:
   - Если в проекте есть Supabase edge functions: supabase/functions/yookassa-create/index.ts — принимает POST {amount, description, returnUrl}, делает basic-auth запрос к https://api.yookassa.ru/v3/payments с idempotency-key (crypto.randomUUID()), возвращает confirmation.confirmation_url и payment.id.
   - yookassa-webhook/index.ts — обработка notification (типы payment.succeeded, payment.canceled, refund.succeeded), валидация по IP белого списка, запись статуса в таблицу payments.
   - Иначе — пример серверного кода для Node + Express в server/yookassa.ts.
3) Компонент <PayButton amount=... description=... /> — редиректит на confirmation_url после createPayment.
4) /checkout/success и /checkout/fail страницы.
5) Таблица payments (id uuid, external_id, user_id, amount_kopecks, status, metadata, created_at) + миграция supabase/migrations/yyyy_payments.sql с RLS.
6) .env.example: YOOKASSA_SHOP_ID=, YOOKASSA_SECRET_KEY=, YOOKASSA_WEBHOOK_IP_WHITELIST=185.71.76.0/27,185.71.77.0/27,...
7) README: yookassa.ru → Настройки → API ключи → тестовый shopId/secret, prod после KYC.`,
  },
  {
    id: "platega",
    name: "Platega",
    hint: "Оплата через СБП, QR-коды",
    priceKopecks: 49000,
    prompt: `Интегрируй Platega (СБП и карты в РФ) в текущий проект.
1) Серверная часть (Supabase edge functions предпочтительно):
   - supabase/functions/platega-create/index.ts: POST {amountKopecks, description, returnUrl, metadata} → запрос на Platega API создать invoice, вернуть payUrl и contractId.
   - supabase/functions/platega-postback/index.ts: принимает postback (проверка подписи по SECRET), парсит статус, флипает транзакцию в БД (status=completed для paid).
2) Клиент: src/integrations/platega/client.ts — createPayment(amountKopecks, description) → { payUrl, contractId }. Компонент <PayWithSbp amount=... />.
3) Страницы /pay/success и /pay/cancel.
4) Таблица payments (или использовать wallet_transactions если есть wallet-модуль).
5) .env.example: PLATEGA_API_KEY=, PLATEGA_MERCHANT_ID=, PLATEGA_WEBHOOK_SECRET=, PLATEGA_BASE_URL=https://api.platega.io.
6) README: шаги регистрации в Platega, где взять API key + merchant id, задать postback URL в кабинете на https://<supabase-ref>.supabase.co/functions/v1/platega-postback.
ВАЖНО: endpoints API и формат запросов Platega уточнить по их доке; если не уверен — оставь TODO-комменты с placeholder signatures и чёткий тест-каркас. Никаких ошибок не замалчивай.`,
  },
  {
    id: "openai",
    name: "OpenAI / ChatGPT",
    hint: "Готовый SDK-обёртка + streaming",
    priceKopecks: 29000,
    prompt: `Интегрируй OpenAI (ChatGPT) через серверный прокси, ключ никогда не на клиенте.
1) <metacore-add-dependency packages="openai ai" /> (ai = Vercel AI SDK).
2) Серверный endpoint (Supabase edge function или Next API / Express):
   - /api/chat: принимает messages, streamResponse через streamText из ai SDK с openai provider, модель gpt-4o-mini по умолчанию, tools-support, хэдеры SSE.
3) Клиент: хук useChat из @ai-sdk/react, компонент <ChatBox /> с TextArea, стриминг-отрисовка, индикатор typing, кнопка Stop.
4) Rate-limit на серверной стороне (10 rpm / user через простой счётчик в памяти или Upstash Redis).
5) Обёртка типов OpenAIMessage, OpenAIResponse в src/integrations/openai/types.ts.
6) .env.example: OPENAI_API_KEY= (только в серверных секретах).
7) README: platform.openai.com → API keys → создать ключ → вставить в секреты. Предупреждение: не использовать VITE_ префикс — ключ утечёт в бандл.`,
  },
  {
    id: "resend",
    name: "Resend",
    hint: "Транзакционная почта + шаблоны",
    priceKopecks: 29000,
    prompt: `Интегрируй Resend для транзакционных писем.
1) <metacore-add-dependency packages="resend react-email @react-email/components" />.
2) src/emails/WelcomeEmail.tsx, ResetPasswordEmail.tsx, ReceiptEmail.tsx — React Email шаблоны (Html, Head, Body, Container, Heading, Text, Button, Link, Hr, Img).
3) Серверная функция send-email (Supabase edge function или Node): принимает { to, template, props } → new Resend(RESEND_API_KEY).emails.send({ from, to, subject, react: Template(props) }).
4) Утилита sendWelcome(user), sendReset(user, token), sendReceipt(user, order) на клиенте вызывает serverless endpoint.
5) Preview: скрипт npm run email:dev открывает react-email dev server на :3000 для превью шаблонов.
6) .env.example: RESEND_API_KEY=, EMAIL_FROM="Acme <noreply@yourdomain.com>".
7) README: resend.com → добавить домен + DNS (SPF/DKIM) → создать API key → вставить в секреты.`,
  },
  {
    id: "uploadthing",
    name: "UploadThing",
    hint: "Загрузка файлов + превью",
    priceKopecks: 29000,
    prompt: `Интегрируй UploadThing для загрузки файлов (картинки, видео, PDF).
1) <metacore-add-dependency packages="uploadthing @uploadthing/react" />.
2) Серверный роутер src/integrations/uploadthing/core.ts: createUploadthing() с роутерами imageUploader (maxFileSize 4MB, maxFileCount 4), videoUploader (32MB, 1), docUploader (8MB, 2). middleware(auth) возвращает userId.
3) API endpoint (Supabase edge function или /api/uploadthing): handler от UploadThing с нужным роутером.
4) Клиент: <UploadButton endpoint="imageUploader" onClientUploadComplete={urls => ...} />, <UploadDropzone ...> с drag-n-drop, прогресс-баром, превью.
5) Интеграция с формой: hook useFormUpload — загрузка → возврат url → сохранение в форме.
6) .env.example: UPLOADTHING_TOKEN=.
7) README: uploadthing.com → dashboard → new app → copy token → .env.
8) Обновлённые TS-типы FileRouter в src/integrations/uploadthing/types.ts.`,
  },
];

const TABS: Array<{ id: HubCategory; label: string; icon: typeof Rocket }> = [
  { id: "wallet", label: "Кошелёк", icon: Wallet },
  { id: "templates", label: "Шаблоны", icon: Rocket },
  { id: "sections", label: "Секции", icon: Layout },
  { id: "ui", label: "UI Киты", icon: Palette },
  { id: "integrations", label: "Интеграции", icon: Plug },
  { id: "tools", label: "Инструменты", icon: Wrench },
  { id: "earnings", label: "Мои доходы", icon: TrendingUp },
  { id: "custom", label: "Заказ у команды", icon: Sparkles },
];

function formatRub(kopecks: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(kopecks / 100);
}

type WalletData = { balanceKopecks: number; currency: string };
type Tx = {
  id: string;
  kind: string;
  amountKopecks: number;
  status: string;
  provider: string | null;
  createdAt: string;
  completedAt: string | null;
};

function useWallet() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const w = await invoke<WalletData>("wallet:get").catch(() => ({
        balanceKopecks: 0,
        currency: "RUB",
      }));
      const t = await invoke<Tx[]>("wallet:transactions", { limit: 30 }).catch(() => [] as Tx[]);
      setWallet(w);
      setTxs(t);
    } catch {
      setWallet({ balanceKopecks: 0, currency: "RUB" });
      setTxs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return { wallet, txs, loading, refresh };
}

function WalletPanel({ onTopupClick }: { onTopupClick: () => void }) {
  const { wallet, txs, loading, refresh } = useWallet();

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-transparent to-primary/5 p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" /> Баланс
            </div>
            <div className="mt-2 text-4xl font-semibold text-foreground">
              {loading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                formatRub(wallet?.balanceKopecks ?? 0)
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Пополняйте кошелёк через Platega и покупайте шаблоны, секции, интеграции в один клик.
            </p>
          </div>
          <button
            type="button"
            onClick={onTopupClick}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Пополнить
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3 text-sm">
          <span className="font-medium">История операций</span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Обновить
          </button>
        </div>
        {txs.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Пока операций нет.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {txs.map((t) => {
              const sign = t.kind === "purchase" || t.kind === "manual_debit" ? "-" : "+";
              const color = sign === "-" ? "text-red-300" : "text-emerald-300";
              const label =
                t.kind === "top_up"
                  ? "Пополнение"
                  : t.kind === "purchase"
                    ? "Покупка"
                    : t.kind === "refund"
                      ? "Возврат"
                      : t.kind;
              return (
                <li key={t.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(t.createdAt).toLocaleString("ru-RU")} · {t.status}
                      {t.provider ? ` · ${t.provider}` : ""}
                    </div>
                  </div>
                  <div className={`font-mono font-medium ${color}`}>
                    {sign}
                    {formatRub(t.amountKopecks)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function TopupModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState<number>(50000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const presets = [50000, 100000, 200000, 500000, 1000000];

  if (!open) return null;

  async function handleTopup() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await invoke<{ txId: string; amountKopecks: number; payUrl: string | null }>(
        "wallet:topup",
        { amountKopecks: amount },
      );
      if (res.payUrl) {
        window.open(res.payUrl, "_blank");
        setSuccess("Открыта страница оплаты. После оплаты баланс обновится автоматически.");
      } else {
        setSuccess(
          "Заявка создана (id: " +
            res.txId.slice(0, 8) +
            "). Интеграция с Platega пока не подключена — баланс обновится вручную после передачи API.",
        );
      }
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-popover p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Пополнить кошелёк</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Через Platega · СБП / карты / QR</p>

        <div className="mt-5 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(p)}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                amount === p
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              {formatRub(p)}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label className="text-xs text-muted-foreground">Своя сумма (₽)</label>
          <input
            type="number"
            min={100}
            max={1000000}
            value={Math.round(amount / 100)}
            onChange={(e) => setAmount(Math.max(10000, Math.round(Number(e.target.value) * 100)))}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-none" />
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            ✅ {success}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm transition hover:bg-muted"
          >
            Закрыть
          </button>
          <button
            type="button"
            onClick={handleTopup}
            disabled={busy || amount < 10000}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Оплатить {formatRub(amount)}
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemCard({
  item,
  onBuy,
  buying,
  owned,
}: {
  item: HubItem;
  onBuy: (it: HubItem) => void;
  buying: string | null;
  owned: boolean;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border p-5 transition ${
        owned
          ? "border-emerald-500/30 bg-emerald-500/[0.04]"
          : "border-border bg-card hover:border-primary/40 hover:bg-primary/[0.03]"
      }`}
    >
      <div className="flex items-start justify-between">
        <h3 className="font-medium text-foreground">{item.name}</h3>
        {owned ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            <Check className="h-2.5 w-2.5" />
            Куплено
          </span>
        ) : item.tag ? (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
            {item.tag}
          </span>
        ) : null}
      </div>
      <p className="mt-1 flex-1 text-sm text-muted-foreground">{item.hint}</p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">
          {formatRub(item.priceKopecks)}
        </span>
        {owned ? (
          <span className="text-xs text-emerald-300/80">
            Выбирайте в чате → HUB APP
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onBuy(item)}
            disabled={buying === item.id}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:opacity-50"
          >
            {buying === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Купить
          </button>
        )}
      </div>
    </div>
  );
}

function ItemGrid({
  items,
  onBuy,
  buying,
  owned,
}: {
  items: HubItem[];
  onBuy: (it: HubItem) => void;
  buying: string | null;
  owned: Set<string>;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((it) => (
        <ItemCard
          key={it.id}
          item={it}
          onBuy={onBuy}
          buying={buying}
          owned={owned.has(it.id)}
        />
      ))}
    </div>
  );
}

type Earning = {
  id: string;
  item_id: string;
  gross_kopecks: number;
  author_kopecks: number;
  status: string;
  created_at: string;
};

type Balance = {
  availableKopecks: number;
  totalEarnedKopecks: number;
  pendingKopecks: number;
  paidKopecks: number;
};

type PayoutRow = {
  id: string;
  amount_kopecks: number;
  method: string;
  details: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  processed_at: string | null;
};

const MIN_PAYOUT_KOPECKS = 50000;

function EarningsPanel() {
  const [rows, setRows] = useState<Earning[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [balance, setBalance] = useState<Balance>({
    availableKopecks: 0,
    totalEarnedKopecks: 0,
    pendingKopecks: 0,
    paidKopecks: 0,
  });
  const [loading, setLoading] = useState(true);
  const [payoutOpen, setPayoutOpen] = useState(false);

  async function reload() {
    const [earnings, payoutList, bal] = await Promise.all([
      invoke<Earning[]>("earnings:list").catch(() => [] as Earning[]),
      invoke<PayoutRow[]>("payout:list").catch(() => [] as PayoutRow[]),
      invoke<Balance>("payout:balance").catch(() => ({
        availableKopecks: 0,
        totalEarnedKopecks: 0,
        pendingKopecks: 0,
        paidKopecks: 0,
      })),
    ]);
    setRows(earnings);
    setPayouts(payoutList);
    setBalance(bal);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const canRequest = balance.availableKopecks >= MIN_PAYOUT_KOPECKS;

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <div className="text-xs uppercase tracking-wider text-emerald-300">Доступно к выводу</div>
          <div className="mt-2 text-3xl font-semibold">{formatRub(balance.availableKopecks)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Всего заработано</div>
          <div className="mt-2 text-2xl font-semibold">{formatRub(balance.totalEarnedKopecks)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">В обработке</div>
          <div className="mt-2 text-2xl font-semibold">{formatRub(balance.pendingKopecks)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Выплачено</div>
          <div className="mt-2 text-2xl font-semibold">{formatRub(balance.paidKopecks)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Запрос на вывод</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {canRequest
              ? `Доступно ${formatRub(balance.availableKopecks)}. Минимум для вывода — ${formatRub(MIN_PAYOUT_KOPECKS)}.`
              : `Минимум для вывода — ${formatRub(MIN_PAYOUT_KOPECKS)}. Сейчас доступно: ${formatRub(balance.availableKopecks)}.`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPayoutOpen(true)}
          disabled={!canRequest}
          className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          Запросить вывод
        </button>
      </div>

      {payouts.length > 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border/60 px-5 py-3 text-sm font-medium">Запросы на вывод</div>
          <ul className="divide-y divide-border/60">
            {payouts.map((p) => (
              <PayoutRowItem key={p.id} row={p} />
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border/60 px-5 py-3 text-sm font-medium">История продаж</div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Ещё никто не купил ваш товар. Опубликуйте шаблон в галерею и начните получать 70% с каждой продажи.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <div className="font-medium">{r.item_id}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("ru-RU")} · {r.status}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-medium text-emerald-300">
                    +{formatRub(r.author_kopecks)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    из {formatRub(r.gross_kopecks)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {payoutOpen ? (
        <PayoutModal
          available={balance.availableKopecks}
          onClose={() => setPayoutOpen(false)}
          onSubmitted={async () => {
            setPayoutOpen(false);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

function PayoutRowItem({ row }: { row: PayoutRow }) {
  const statusMap: Record<
    string,
    { label: string; cls: string; icon: React.ReactNode }
  > = {
    pending: {
      label: "Ожидает",
      cls: "border-amber-400/30 bg-amber-500/10 text-amber-300",
      icon: <Clock className="h-3 w-3" />,
    },
    approved: {
      label: "Одобрено",
      cls: "border-sky-400/30 bg-sky-500/10 text-sky-300",
      icon: <Clock className="h-3 w-3" />,
    },
    paid: {
      label: "Выплачено",
      cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    rejected: {
      label: "Отклонено",
      cls: "border-rose-400/30 bg-rose-500/10 text-rose-300",
      icon: <XCircle className="h-3 w-3" />,
    },
  };
  const s = statusMap[row.status] ?? {
    label: row.status,
    cls: "border-border bg-muted text-muted-foreground",
    icon: null,
  };
  const methodLabel: Record<string, string> = {
    usdt_trc20: "USDT · TRC20",
    usdt_erc20: "USDT · ERC20",
  };
  return (
    <li className="px-5 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono font-medium">{formatRub(row.amount_kopecks)}</div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {methodLabel[row.method] ?? row.method} · {row.details}
          </div>
        </div>
        <span
          className={`inline-flex flex-none items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${s.cls}`}
        >
          {s.icon}
          {s.label}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{new Date(row.created_at).toLocaleString("ru-RU")}</span>
        {row.admin_note ? <span className="italic">{row.admin_note}</span> : null}
      </div>
    </li>
  );
}

function PayoutModal({
  available,
  onClose,
  onSubmitted,
}: {
  available: number;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [amountRub, setAmountRub] = useState(
    Math.floor(available / 100).toString(),
  );
  const [method, setMethod] = useState<"usdt_trc20" | "usdt_erc20">("usdt_trc20");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountKopecks = Math.round((Number(amountRub) || 0) * 100);
  const valid =
    amountKopecks >= MIN_PAYOUT_KOPECKS &&
    amountKopecks <= available &&
    details.trim().length >= 4;

  const placeholder: Record<typeof method, string> = {
    usdt_trc20: "T... (TRC20-адрес, ~34 символа)",
    usdt_erc20: "0x... (ERC20-адрес, 42 символа)",
  };

  async function handleSubmit() {
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await invoke<{ ok: boolean; reason?: string }>(
        "payout:request",
        {
          amountKopecks,
          method,
          details: details.trim(),
        },
      );
      if (res.ok) {
        onSubmitted();
        return;
      }
      const messages: Record<string, string> = {
        no_license: "Сначала активируй ключ Metacore.",
        bad_key: "Ключ Metacore не найден на сервере.",
        amount_too_small: `Минимум для вывода — ${formatRub(MIN_PAYOUT_KOPECKS)}.`,
        bad_method: "Выбери способ выплаты.",
        bad_details: "Реквизиты должны быть от 4 до 200 символов.",
        insufficient_balance: "Недостаточно средств. Возможно, часть уже в pending-запросе.",
      };
      setError(messages[res.reason ?? ""] ?? `Ошибка: ${res.reason ?? "неизвестная"}`);
    } catch (e) {
      setError(`Ошибка: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl border border-white/15 bg-black/90 p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Запрос на вывод</h2>
            <p className="mt-0.5 text-xs text-white/55">
              Доступно: <b className="text-white">{formatRub(available)}</b>. Обработка — до 3 рабочих дней.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-white/60">Сумма (₽)</span>
            <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2">
              <input
                type="number"
                min={MIN_PAYOUT_KOPECKS / 100}
                max={Math.floor(available / 100)}
                step="1"
                value={amountRub}
                onChange={(e) => setAmountRub(e.target.value)}
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              />
              <button
                type="button"
                onClick={() => setAmountRub(Math.floor(available / 100).toString())}
                className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
              >
                Всё
              </button>
            </div>
          </label>

          <div>
            <span className="mb-1 block text-xs text-white/60">Сеть USDT</span>
            <div className="grid grid-cols-2 gap-2">
              {(["usdt_trc20", "usdt_erc20"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMethod(m);
                    setDetails("");
                  }}
                  className={`rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition ${
                    method === m
                      ? "border-white/30 bg-white/15 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="font-semibold">
                    {m === "usdt_trc20" ? "USDT · TRC20" : "USDT · ERC20"}
                  </div>
                  <div className="mt-0.5 text-[10px] text-white/45">
                    {m === "usdt_trc20" ? "Tron, низкая комиссия" : "Ethereum, выше комиссия"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs text-white/60">Реквизиты</span>
            <input
              type="text"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={placeholder[method]}
              maxLength={200}
              className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm font-mono text-white outline-none placeholder:text-white/30 focus:border-white/30"
            />
          </label>

          {error ? <div className="text-xs text-rose-300">{error}</div> : null}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!valid || submitting}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 py-2.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Отправить запрос
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomOrderCard() {
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", description: "" });
  const [sent, setSent] = useState(false);

  const email = "orders@metacore.ltd";

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contact.trim() || !form.description.trim()) return;
    const subject = encodeURIComponent(`Заказ Metacore: ${form.name || "без названия"}`);
    const body = encodeURIComponent(
      `Контакт: ${form.contact}\n\nОписание:\n${form.description}\n\n— отправлено из Metacore Hub`,
    );
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");
    setSent(true);
  }

  return (
    <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-transparent to-pink-500/5 p-8">
      <div className="flex items-start gap-3">
        <Sparkles className="h-6 w-6 flex-none text-purple-300" />
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-foreground">Заказ у команды Metacore</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Когда AI не справляется или нужен product-grade проект под ключ — опишите задачу, свяжемся, сумма по договорённости.
          </p>
        </div>
      </div>

      <ul className="mt-6 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-2">
        <li>🎯 Индивидуальный дизайн и логика</li>
        <li>🧪 Тесты и CI/CD на выбор</li>
        <li>🔐 Интеграции с платными API</li>
        <li>🚀 Деплой и поддержка 30 дней</li>
      </ul>

      <form onSubmit={submit} className="mt-6 grid gap-3">
        <input
          type="text"
          placeholder="Название проекта (необязательно)"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          type="text"
          placeholder="Ваш контакт: email или Telegram (@username)"
          value={form.contact}
          onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          required
        />
        <textarea
          placeholder="Коротко о задаче: что сделать, сроки, бюджет если есть"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={5}
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          required
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <Mail className="h-4 w-4" />
            Отправить заявку
          </button>

          <button
            type="button"
            onClick={copyEmail}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm transition hover:bg-muted"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            {email}
          </button>

          <span className="ml-auto text-xs text-muted-foreground">Стоимость — по договорённости</span>
        </div>

        {sent ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            ✅ Открыто почтовое окно. Мы ответим в течение 24 часов.
          </div>
        ) : null}
      </form>
    </div>
  );
}


export function HubPage() {
  const t = useT();
  const [tab, setTab] = useState<HubCategory>("wallet");
  const [topupOpen, setTopupOpen] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [owned, setOwned] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    invoke<Array<{ itemId: string }>>("hub:purchases")
      .then((list) => {
        if (cancelled) return;
        setOwned(new Set(list.map((p) => p.itemId)));
      })
      .catch(() => {
        // RPC may be missing — silently keep empty set
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  async function handleBuy(item: HubItem) {
    setBuying(item.id);
    if (item.priceKopecks === 0) {
      setOwned((s) => {
        const next = new Set(s);
        next.add(item.id);
        return next;
      });
      setToast({ kind: "ok", text: `Активировано бесплатно: ${item.name}` });
      setBuying(null);
      return;
    }
    try {
      const res = await invoke<{
        ok: boolean;
        reason: string;
        newBalanceKopecks: number;
      }>("wallet:charge", {
        amountKopecks: item.priceKopecks,
        itemId: item.id,
        itemName: item.name,
      });
      if (res.ok) {
        setToast({ kind: "ok", text: `Куплено: ${item.name}. Остаток: ${formatRub(res.newBalanceKopecks)}` });
        setOwned((s) => {
          const next = new Set(s);
          next.add(item.id);
          return next;
        });
        setRefreshKey((k) => k + 1);
      } else if (res.reason === "already_owned") {
        setToast({ kind: "ok", text: `Этот товар уже у вас: ${item.name}` });
        setOwned((s) => {
          const next = new Set(s);
          next.add(item.id);
          return next;
        });
      } else if (res.reason === "insufficient_funds") {
        setToast({ kind: "err", text: "Недостаточно средств. Пополните кошелёк." });
        setTab("wallet");
        setTopupOpen(true);
      } else {
        setToast({ kind: "err", text: `Не удалось купить: ${res.reason}` });
      }
    } catch (e) {
      setToast({ kind: "err", text: (e as Error).message });
    } finally {
      setBuying(null);
    }
  }


  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{t("hub.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("hub.subtitle")}</p>

      <div className="mt-6 flex flex-wrap gap-1.5 border-b border-border/60 pb-2">
        {TABS.map((tb) => {
          const Icon = tb.icon;
          const active = tab === tb.id;
          return (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition ${
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tb.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === "wallet" ? (
          <WalletPanel key={refreshKey} onTopupClick={() => setTopupOpen(true)} />
        ) : null}
        {tab === "templates" ? (
          <ItemGrid items={TEMPLATES} onBuy={handleBuy} buying={buying} owned={owned} />
        ) : null}
        {tab === "sections" ? (
          <ItemGrid items={SECTIONS} onBuy={handleBuy} buying={buying} owned={owned} />
        ) : null}
        {tab === "ui" ? (
          <ItemGrid items={UI_KITS} onBuy={handleBuy} buying={buying} owned={owned} />
        ) : null}
        {tab === "integrations" ? (
          <ItemGrid items={INTEGRATIONS} onBuy={handleBuy} buying={buying} owned={owned} />
        ) : null}
        {tab === "tools" ? (
          <ItemGrid items={TOOLS} onBuy={handleBuy} buying={buying} owned={owned} />
        ) : null}
        {tab === "earnings" ? <EarningsPanel /> : null}
        {tab === "custom" ? <CustomOrderCard /> : null}
      </div>

      <TopupModal
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        onDone={() => setRefreshKey((k) => k + 1)}
      />

      {toast ? (
        <div
          className={`fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur-xl ${
            toast.kind === "ok"
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
              : "border-red-500/40 bg-red-500/15 text-red-100"
          }`}
        >
          {toast.kind === "ok" ? "✅" : "⚠️"}
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
