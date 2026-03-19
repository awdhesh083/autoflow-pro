/**
 * AutoFlow Pro v5 — App.jsx
 * 22 components · 14 platforms · Dark+Light · EN+हिन्दी · PWA · Push
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

// ═══════════════════════════════════════════════════════════
// CONFIG  — set VITE_API_URL in your .env
// ═══════════════════════════════════════════════════════════
const BASE = import.meta.env?.VITE_API_URL || "http://localhost:5000/api/v1";
const WS   = import.meta.env?.VITE_WS_URL  || "http://localhost:5000";

// ═══════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════
const DARK = {
  bg:"#03050e", surface:"#070a1b", card:"#0b0f22", border:"#1c2645",
  accent:"#00d4ff", accent2:"#7c3aed", accent3:"#10b981", accent4:"#f59e0b",
  danger:"#ef4444", warn:"#f97316", text:"#e2e8f0", muted:"#4a5f7a",
  glow:"rgba(0,212,255,0.1)"
};
const LIGHT = {
  bg:"#f8fafc", surface:"#ffffff", card:"#ffffff", border:"#e2e8f0",
  accent:"#0284c7", accent2:"#7c3aed", accent3:"#059669", accent4:"#d97706",
  danger:"#dc2626", warn:"#ea580c", text:"#0f172a", muted:"#64748b",
  glow:"rgba(2,132,199,0.08)"
};
// C is set per render via App's theme state; components read window.__AF_C
let C = DARK;

// ═══════════════════════════════════════════════════════════
// i18n — Hindi / English translation system
// ═══════════════════════════════════════════════════════════
const LOCALES = {
  en: {
  "auth.email": "Email Address",
  "auth.password": "Password",
  "auth.signin": "Sign In to AutoFlow",
  "auth.signing_in": "Signing in…",
  "auth.no_account": "No account?",
  "auth.register": "Register",
  "auth.demo_hint": "No account yet — click Register",
  "nav.main": "MAIN",
  "nav.platforms": "PLATFORMS",
  "nav.channels": "CHANNELS",
  "nav.tools": "TOOLS",
  "nav.dashboard": "Dashboard",
  "nav.platforms_tab": "All Platforms",
  "nav.inbox": "Inbox",
  "nav.composer": "AI Composer",
  "nav.scheduler": "Scheduler",
  "nav.scraper": "Lead Scraper",
  "nav.whatsapp": "WhatsApp Pro",
  "nav.email": "Email Blast",
  "nav.sms": "SMS Bulk",
  "nav.contacts": "CRM / Contacts",
  "nav.accounts": "Accounts / SIM",
  "nav.chatbot": "AI Chatbot",
  "nav.analytics": "Analytics",
  "nav.security": "Security",
  "nav.api": "API & Hooks",
  "nav.billing": "Billing",
  "nav.live_connected": "🟢 Live Connected",
  "nav.connecting": "Connecting…",
  "nav.light_mode": "☀️ Light Mode",
  "nav.dark_mode": "🌙 Dark Mode",
  "nav.sign_out": "Sign Out",
  "dashboard.title": "Command Centre ⚡",
  "dashboard.subtitle": "Real-time automation dashboard",
  "dashboard.refresh": "↻ Refresh",
  "dashboard.new_campaign": "+ AI Campaign",
  "dashboard.total_contacts": "Total Contacts",
  "dashboard.messages_7d": "Messages (7d)",
  "dashboard.active_campaigns": "Active Campaigns",
  "dashboard.open_rate": "Open Rate",
  "dashboard.click_rate": "Click Rate",
  "dashboard.reply_rate": "Reply Rate",
  "dashboard.in_crm": "In CRM",
  "dashboard.delivery_rate": "delivery rate",
  "dashboard.running_now": "Running now",
  "dashboard.vs_benchmark": "↑ vs benchmark",
  "dashboard.inbound_responses": "Inbound responses",
  "dashboard.volume_chart": "Daily Message Volume",
  "dashboard.quick_launch": "Quick Launch",
  "dashboard.recent_campaigns": "Recent Campaigns",
  "dashboard.no_campaigns": "No campaigns yet — create one!",
  "dashboard.view_all": "All →",
  "wa.title": "WhatsApp Pro 💬",
  "wa.subtitle": "Bulk sender · auto-reply · QR connect · live progress",
  "wa.active_numbers": "Active Numbers",
  "wa.wa_contacts": "WA Contacts",
  "wa.total_campaigns": "Total Campaigns",
  "wa.new_broadcast": "New Broadcast",
  "wa.campaign_name": "Campaign Name",
  "wa.campaign_placeholder": "e.g. Flash Sale Alert",
  "wa.message": "Message",
  "wa.ai_write": "✨ AI Write",
  "wa.select_account": "Select Account",
  "wa.no_accounts": "No WA accounts — connect one below",
  "wa.recipients": "Recipients",
  "wa.all_wa": "All WA",
  "wa.clear": "Clear",
  "wa.no_wa_contacts": "No WA contacts in CRM yet",
  "wa.anti_spam": "Anti-spam delay",
  "wa.personalize": "Personalize [name]",
  "wa.rotate": "Rotate numbers",
  "wa.track_clicks": "Track clicks",
  "wa.send_broadcast": "🚀 Send Broadcast",
  "wa.sending": "Sending…",
  "wa.connect_title": "Connect WhatsApp Number",
  "wa.scan_instruction": "Open WhatsApp → Linked Devices → Scan",
  "wa.init_qr": "Init QR",
  "wa.add_account": "+ Add WA Account",
  "wa.recent_broadcasts": "Recent Broadcasts",
  "wa.no_broadcasts": "No broadcasts yet",
  "email.title": "Email Campaign Builder 📧",
  "email.subtitle": "SMTP bulk sender · drip sequences · open/click tracking",
  "email.total_sent": "Total Sent",
  "email.campaigns": "Campaigns",
  "email.active": "Active",
  "email.completed": "Completed",
  "email.new_campaign": "New Campaign",
  "email.from_name": "From Name",
  "email.from_email": "From Email",
  "email.smtp_provider": "SMTP Provider",
  "email.subject_line": "Subject Line",
  "email.ai_subjects": "✨ AI Subjects",
  "email.email_body": "Email Body",
  "email.ai_write": "🤖 AI Write",
  "email.test": "🧪 Test",
  "email.send_campaign": "🚀 Send Campaign",
  "email.active_campaigns": "Active Campaigns",
  "email.no_campaigns": "No email campaigns yet",
  "contacts.title": "CRM / Contacts 👥",
  "contacts.total": "{count} total contacts",
  "contacts.delete_selected": "🗑️ Delete",
  "contacts.import_csv": "📥 Import CSV",
  "contacts.export": "📤 Export",
  "contacts.add": "+ Add Contact",
  "contacts.search_placeholder": "Search name, phone, email…",
  "contacts.all": "All Contacts",
  "contacts.add_new": "Add New Contact",
  "contacts.full_name": "Full Name *",
  "contacts.phone": "Phone *",
  "contacts.email": "Email",
  "contacts.tag": "Tag",
  "contacts.add_btn": "✅ Add Contact",
  "contacts.showing": "Showing {count} of {total} contacts",
  "contacts.prev": "← Prev",
  "contacts.next": "Next →",
  "contacts.page": "Page {n}",
  "analytics.title": "Analytics & Reports 📈",
  "analytics.subtitle": "{active} campaigns running · {msgs} msgs in 24h",
  "analytics.export": "📊 Export",
  "analytics.total_contacts": "Total Contacts",
  "analytics.messages_sent": "Messages Sent",
  "analytics.open_rate": "Open Rate",
  "analytics.click_rate": "Click Rate",
  "analytics.volume_chart": "Daily Message Volume",
  "analytics.funnel": "Conversion Funnel",
  "analytics.platform_breakdown": "Platform Breakdown",
  "chatbot.title": "AI Chatbot 🤖",
  "chatbot.subtitle": "Powered by Claude · Expert in all 14 platforms",
  "chatbot.placeholder": "Ask anything about automation, marketing or content…",
  "chatbot.send": "Send ▶",
  "chatbot.greeting": "⚡ AutoFlow AI Pro online. Connected to your backend. I can help with campaign strategy, platform growth, content generation, and automation. What shall we automate?",
  "scraper.title": "Lead Scraper 🔍",
  "scraper.subtitle": "Extract B2B leads from Google Maps, Yellow Pages, Instagram & more",
  "scraper.source": "Data Source",
  "scraper.params": "Search Parameters",
  "scraper.results": "Results",
  "scraper.csv": "📥 CSV",
  "scraper.add_crm": "👥 Add to CRM",
  "scraper.empty_title": "Scraped leads appear here",
  "scraper.empty_sub": "Select source, enter query, click Scrape",
  "security.title": "Security Center 🛡️",
  "security.subtitle": "Proxy rotation · account health · anti-ban · auto-rotate",
  "security.score": "Security Score",
  "security.accounts": "Total Accounts",
  "security.blocked": "Blocked",
  "security.healthy_proxies": "Healthy Proxies",
  "security.proxy_pool": "Proxy Pool",
  "security.health_check": "↻ Health Check",
  "security.protection": "Protection Status",
  "api.title": "API & Webhooks ⚡",
  "api.subtitle": "RESTful API v1 · JWT + API key auth",
  "api.credentials": "API Credentials",
  "api.api_key": "API KEY",
  "api.base_url": "BASE URL",
  "api.copy": "Copy",
  "api.regen": "Regen",
  "api.webhooks": "Webhooks",
  "api.no_webhooks": "No webhooks registered yet",
  "api.add_webhook": "+ Add Webhook",
  "api.test": "Test",
  "api.usage": "30-Day Usage",
  "api.all_endpoints": "All Endpoints",
  "billing.title": "Billing & Plans 💳",
  "billing.current_plan": "Current plan:",
  "billing.monthly_usage": "Monthly Usage",
  "billing.upgrade": "Upgrade →",
  "billing.manage": "Manage Billing",
  "billing.portal": "Billing Portal",
  "billing.portal_desc": "View invoices, update payment method, download receipts.",
  "billing.open_portal": "Open Stripe Billing Portal ↗",
  "scheduler.title": "Content Scheduler 📅",
  "scheduler.posts_this_month": "{count} posts scheduled this month",
  "scheduler.schedule_post": "+ Schedule Post",
  "scheduler.upcoming": "Upcoming Posts",
  "scheduler.no_posts": "No scheduled posts this month",
  "scheduler.platform": "Platform",
  "scheduler.date": "Date",
  "scheduler.time": "Time",
  "scheduler.content": "Content",
  "scheduler.schedule_btn": "📅 Schedule Post",
  "common.send": "Send",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.add": "Add",
  "common.search": "Search…",
  "common.loading": "Loading…",
  "common.error": "Something went wrong",
  "common.retry": "↻ Retry",
  "common.copy": "Copy",
  "common.close": "Close",
  "common.back": "← Back",
  "common.next": "Next →",
  "common.yes": "Yes",
  "common.no": "No",
  "common.all": "All",
  "common.filter": "Filter",
  "common.export": "Export",
  "common.import": "Import",
  "common.refresh": "Refresh",
  "common.settings": "Settings",
  "search.placeholder": "Search contacts, campaigns, messages…",
  "search.no_results": "No results for \"{q}\"",
  "search.more": "+{n} more in {type} →"
},
  hi: {
  "auth.email": "ईमेल पता",
  "auth.password": "पासवर्ड",
  "auth.signin": "AutoFlow में साइन इन करें",
  "auth.signing_in": "साइन इन हो रहा है…",
  "auth.no_account": "खाता नहीं है?",
  "auth.register": "रजिस्टर करें",
  "auth.demo_hint": "खाता नहीं है — रजिस्टर पर क्लिक करें",
  "nav.main": "मुख्य",
  "nav.platforms": "प्लेटफ़ॉर्म",
  "nav.channels": "चैनल",
  "nav.tools": "टूल्स",
  "nav.dashboard": "डैशबोर्ड",
  "nav.platforms_tab": "सभी प्लेटफ़ॉर्म",
  "nav.inbox": "इनबॉक्स",
  "nav.composer": "AI कम्पोज़र",
  "nav.scheduler": "शेड्यूलर",
  "nav.scraper": "लीड स्क्रेपर",
  "nav.whatsapp": "WhatsApp Pro",
  "nav.email": "ईमेल ब्लास्ट",
  "nav.sms": "SMS बल्क",
  "nav.contacts": "CRM / संपर्क",
  "nav.accounts": "अकाउंट्स / SIM",
  "nav.chatbot": "AI चैटबॉट",
  "nav.analytics": "एनालिटिक्स",
  "nav.security": "सुरक्षा",
  "nav.api": "API & वेबहुक",
  "nav.billing": "बिलिंग",
  "nav.live_connected": "लाइव कनेक्टेड",
  "nav.connecting": "कनेक्ट हो रहा है…",
  "nav.light_mode": "लाइट मोड",
  "nav.dark_mode": "डार्क मोड",
  "nav.sign_out": "साइन आउट",
  "dashboard.title": "कमांड सेंटर ⚡",
  "dashboard.subtitle": "रियल-टाइम ऑटोमेशन डैशबोर्ड",
  "dashboard.refresh": "↻ रिफ्रेश",
  "dashboard.new_campaign": "+ AI अभियान",
  "dashboard.total_contacts": "कुल संपर्क",
  "dashboard.messages_7d": "संदेश (7 दिन)",
  "dashboard.active_campaigns": "सक्रिय अभियान",
  "dashboard.open_rate": "ओपन दर",
  "dashboard.click_rate": "क्लिक दर",
  "dashboard.reply_rate": "रिप्लाई दर",
  "dashboard.in_crm": "CRM में",
  "dashboard.delivery_rate": "डिलीवरी दर",
  "dashboard.running_now": "अभी चल रहे हैं",
  "dashboard.vs_benchmark": "↑ बेंचमार्क से अधिक",
  "dashboard.inbound_responses": "इनबाउंड प्रतिक्रियाएं",
  "dashboard.volume_chart": "7 दिन का संदेश वॉल्यूम",
  "dashboard.quick_launch": "त्वरित लॉन्च",
  "dashboard.recent_campaigns": "हालिया अभियान",
  "dashboard.no_campaigns": "अभी तक कोई अभियान नहीं — एक बनाएं!",
  "dashboard.view_all": "सभी →",
  "wa.title": "WhatsApp Pro 💬",
  "wa.subtitle": "बल्क सेंडर · ऑटो-रिप्लाई · QR कनेक्ट · लाइव प्रगति",
  "wa.active_numbers": "सक्रिय नंबर",
  "wa.wa_contacts": "WA संपर्क",
  "wa.total_campaigns": "कुल अभियान",
  "wa.new_broadcast": "नया ब्रॉडकास्ट",
  "wa.campaign_name": "अभियान का नाम",
  "wa.campaign_placeholder": "जैसे. फ्लैश सेल अलर्ट",
  "wa.message": "संदेश",
  "wa.ai_write": "✨ AI लिखें",
  "wa.select_account": "अकाउंट चुनें",
  "wa.no_accounts": "कोई WA अकाउंट नहीं — नीचे कनेक्ट करें",
  "wa.recipients": "प्राप्तकर्ता",
  "wa.all_wa": "सभी WA",
  "wa.clear": "साफ़ करें",
  "wa.no_wa_contacts": "CRM में अभी कोई WA संपर्क नहीं",
  "wa.anti_spam": "एंटी-स्पैम देरी",
  "wa.personalize": "[name] व्यक्तिगत करें",
  "wa.rotate": "नंबर रोटेट करें",
  "wa.track_clicks": "क्लिक ट्रैक करें",
  "wa.send_broadcast": "🚀 ब्रॉडकास्ट भेजें",
  "wa.sending": "भेज रहा है…",
  "wa.connect_title": "WhatsApp नंबर कनेक्ट करें",
  "wa.scan_instruction": "WhatsApp खोलें → लिंक्ड डिवाइस → स्कैन करें",
  "wa.init_qr": "QR शुरू करें",
  "wa.add_account": "+ WA अकाउंट जोड़ें",
  "wa.recent_broadcasts": "हालिया ब्रॉडकास्ट",
  "wa.no_broadcasts": "अभी तक कोई ब्रॉडकास्ट नहीं",
  "email.title": "ईमेल कैम्पेन बिल्डर 📧",
  "email.subtitle": "SMTP बल्क सेंडर · ड्रिप सीक्वेंस · ओपन/क्लिक ट्रैकिंग",
  "email.total_sent": "कुल भेजे",
  "email.campaigns": "अभियान",
  "email.active": "सक्रिय",
  "email.completed": "पूर्ण",
  "email.new_campaign": "नया अभियान",
  "email.from_name": "प्रेषक का नाम",
  "email.from_email": "प्रेषक का ईमेल",
  "email.smtp_provider": "SMTP प्रदाता",
  "email.subject_line": "विषय पंक्ति",
  "email.ai_subjects": "✨ AI विषय",
  "email.email_body": "ईमेल बॉडी",
  "email.ai_write": "🤖 AI लिखें",
  "email.test": "🧪 परीक्षण",
  "email.send_campaign": "🚀 अभियान भेजें",
  "email.active_campaigns": "सक्रिय अभियान",
  "email.no_campaigns": "अभी तक कोई ईमेल अभियान नहीं",
  "contacts.title": "CRM / संपर्क 👥",
  "contacts.total": "{count} कुल संपर्क",
  "contacts.delete_selected": "🗑️ हटाएं",
  "contacts.import_csv": "📥 CSV आयात",
  "contacts.export": "📤 निर्यात",
  "contacts.add": "+ संपर्क जोड़ें",
  "contacts.search_placeholder": "नाम, फ़ोन, ईमेल खोजें…",
  "contacts.all": "सभी संपर्क",
  "contacts.add_new": "नया संपर्क जोड़ें",
  "contacts.full_name": "पूरा नाम *",
  "contacts.phone": "फ़ोन *",
  "contacts.email": "ईमेल",
  "contacts.tag": "टैग",
  "contacts.add_btn": "✅ संपर्क जोड़ें",
  "contacts.showing": "{count} / {total} संपर्क दिखाए जा रहे हैं",
  "contacts.prev": "← पिछला",
  "contacts.next": "अगला →",
  "contacts.page": "पृष्ठ {n}",
  "analytics.title": "एनालिटिक्स और रिपोर्ट 📈",
  "analytics.subtitle": "{active} अभियान चल रहे हैं · 24 घंटे में {msgs} संदेश",
  "analytics.export": "📊 निर्यात",
  "analytics.total_contacts": "कुल संपर्क",
  "analytics.messages_sent": "भेजे गए संदेश",
  "analytics.open_rate": "ओपन दर",
  "analytics.click_rate": "क्लिक दर",
  "analytics.volume_chart": "दैनिक संदेश वॉल्यूम",
  "analytics.funnel": "रूपांतरण फ़नल",
  "analytics.platform_breakdown": "प्लेटफ़ॉर्म ब्रेकडाउन",
  "chatbot.title": "AI चैटबॉट 🤖",
  "chatbot.subtitle": "Claude द्वारा संचालित · सभी 14 प्लेटफ़ॉर्म के विशेषज्ञ",
  "chatbot.placeholder": "ऑटोमेशन, मार्केटिंग या कंटेंट के बारे में कुछ भी पूछें…",
  "chatbot.send": "भेजें ▶",
  "chatbot.greeting": "⚡ AutoFlow AI Pro ऑनलाइन है। मैं आपकी अभियान रणनीति, प्लेटफ़ॉर्म ग्रोथ, कंटेंट जनरेशन और ऑटोमेशन में मदद कर सकता हूँ। क्या ऑटोमेट करना है?",
  "scraper.title": "लीड स्क्रेपर 🔍",
  "scraper.subtitle": "Google Maps, Yellow Pages, Instagram से B2B लीड निकालें",
  "scraper.source": "डेटा स्रोत",
  "scraper.params": "खोज पैरामीटर",
  "scraper.results": "परिणाम",
  "scraper.csv": "📥 CSV",
  "scraper.add_crm": "👥 CRM में जोड़ें",
  "scraper.empty_title": "स्क्रैप किए गए लीड यहाँ दिखेंगे",
  "scraper.empty_sub": "स्रोत चुनें, क्वेरी दर्ज करें, Scrape पर क्लिक करें",
  "security.title": "सुरक्षा केंद्र 🛡️",
  "security.subtitle": "प्रॉक्सी रोटेशन · अकाउंट हेल्थ · एंटी-बैन · ऑटो-रोटेट",
  "security.score": "सुरक्षा स्कोर",
  "security.accounts": "कुल अकाउंट",
  "security.blocked": "ब्लॉक्ड",
  "security.healthy_proxies": "स्वस्थ प्रॉक्सी",
  "security.proxy_pool": "प्रॉक्सी पूल",
  "security.health_check": "↻ हेल्थ चेक",
  "security.protection": "सुरक्षा स्थिति",
  "api.title": "API & वेबहुक ⚡",
  "api.subtitle": "RESTful API v1 · JWT + API key ऑथ",
  "api.credentials": "API क्रेडेंशियल",
  "api.api_key": "API की",
  "api.base_url": "बेस URL",
  "api.copy": "कॉपी",
  "api.regen": "रीजनरेट",
  "api.webhooks": "वेबहुक",
  "api.no_webhooks": "अभी तक कोई वेबहुक नहीं",
  "api.add_webhook": "+ वेबहुक जोड़ें",
  "api.test": "परीक्षण",
  "api.usage": "30 दिन का उपयोग",
  "api.all_endpoints": "सभी एंडपॉइंट",
  "billing.title": "बिलिंग और प्लान 💳",
  "billing.current_plan": "वर्तमान प्लान:",
  "billing.monthly_usage": "मासिक उपयोग",
  "billing.upgrade": "अपग्रेड →",
  "billing.manage": "बिलिंग प्रबंधन",
  "billing.portal": "बिलिंग पोर्टल",
  "billing.portal_desc": "चालान देखें, भुगतान पद्धति अपडेट करें, रसीदें डाउनलोड करें।",
  "billing.open_portal": "Stripe बिलिंग पोर्टल खोलें ↗",
  "scheduler.title": "कंटेंट शेड्यूलर 📅",
  "scheduler.posts_this_month": "इस महीने {count} पोस्ट शेड्यूल",
  "scheduler.schedule_post": "+ पोस्ट शेड्यूल करें",
  "scheduler.upcoming": "आगामी पोस्ट",
  "scheduler.no_posts": "इस महीने कोई शेड्यूल नहीं",
  "scheduler.platform": "प्लेटफ़ॉर्म",
  "scheduler.date": "तारीख",
  "scheduler.time": "समय",
  "scheduler.content": "कंटेंट",
  "scheduler.schedule_btn": "📅 पोस्ट शेड्यूल करें",
  "common.send": "भेजें",
  "common.cancel": "रद्द करें",
  "common.save": "सहेजें",
  "common.delete": "हटाएं",
  "common.edit": "संपादित करें",
  "common.add": "जोड़ें",
  "common.search": "खोजें…",
  "common.loading": "लोड हो रहा है…",
  "common.error": "कुछ गलत हो गया",
  "common.retry": "↻ पुनः प्रयास",
  "common.copy": "कॉपी",
  "common.close": "बंद करें",
  "common.back": "← वापस",
  "common.next": "अगला →",
  "common.yes": "हाँ",
  "common.no": "नहीं",
  "common.all": "सभी",
  "common.filter": "फ़िल्टर",
  "common.export": "निर्यात",
  "common.import": "आयात",
  "common.refresh": "रिफ्रेश",
  "common.settings": "सेटिंग्स",
  "search.placeholder": "संपर्क, अभियान, संदेश खोजें…",
  "search.no_results": "\"{q}\" के लिए कोई परिणाम नहीं",
  "search.more": "{type} में +{n} और →"
},
};

// Active language — read by t() below. Updated by setLang() in App.
let _lang = localStorage.getItem("af_lang") || "en";

/** Translate a key with optional variable interpolation.
 *  t("contacts.total", {count: 42}) → "42 total contacts" / "42 कुल संपर्क"
 */
function t(key, vars = {}) {
  const locale = LOCALES[_lang] || LOCALES.en;
  let str = locale[key] || LOCALES.en[key] || key;
  Object.entries(vars).forEach(([k, v]) => {
    str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  });
  return str;
}

// ═══════════════════════════════════════════════════════════
// API CLIENT — all fetch() with JWT + error handling
// ═══════════════════════════════════════════════════════════
const getToken = () => sessionStorage.getItem("af_token");

const api = {
  async request(method, path, body, opts = {}) {
    const token = getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  },
  get:    (path)        => api.request("GET",    path),
  post:   (path, body)  => api.request("POST",   path, body),
  put:    (path, body)  => api.request("PUT",    path, body),
  patch:  (path, body)  => api.request("PATCH",  path, body),
  delete: (path)        => api.request("DELETE", path),

  async uploadFile(path, formData) {
    const token = getToken();
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  },
};

// ═══════════════════════════════════════════════════════════
// SOCKET.IO HOOK
// ═══════════════════════════════════════════════════════════
function useSocket(token) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef({});

  useEffect(() => {
    if (!token || !window.io) return;
    const s = window.io(WS, { transports: ["websocket", "polling"] });
    socketRef.current = s;

    s.on("connect", () => {
      setConnected(true);
      s.emit("authenticate", { token });
    });
    s.on("disconnect", () => setConnected(false));

    // Forward all events to registered listeners
    const events = [
      "authenticated","campaign:progress","campaign:completed",
      "media:completed","media:failed","download:completed",
      "proxy:down","proxy:auto-rotated","qr","wa:ready","wa:disconnected",
    ];
    events.forEach(ev => {
      s.on(ev, (data) => {
        const cbs = listenersRef.current[ev] || [];
        cbs.forEach(cb => cb(data));
      });
    });

    return () => { s.disconnect(); socketRef.current = null; };
  }, [token]);

  const on = useCallback((event, cb) => {
    if (!listenersRef.current[event]) listenersRef.current[event] = [];
    listenersRef.current[event].push(cb);
    return () => {
      listenersRef.current[event] = listenersRef.current[event].filter(x => x !== cb);
    };
  }, []);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { connected, on, emit };
}

// ═══════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════
const Badge = ({label,color})=>(
  <span style={{background:`${color}22`,color,border:`1px solid ${color}44`,borderRadius:4,
    padding:"2px 8px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{label}</span>
);
const Dot = ({color,animated=true})=>(
  <span style={{display:"inline-block",width:7,height:7,borderRadius:"50%",background:color,
    boxShadow:`0 0 6px ${color}`,flexShrink:0,animation:animated?"pulse 2s infinite":"none"}}/>
);
const Toggle = ({on,onChange})=>(
  <div onClick={()=>onChange?.(!on)} style={{width:38,height:21,borderRadius:11,
    background:on?C.accent3:C.border,cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}}>
    <div style={{width:15,height:15,borderRadius:"50%",background:"#fff",position:"absolute",
      top:3,left:on?20:3,transition:"left .2s"}}/>
  </div>
);
const Stat = ({label,value,sub,color=C.accent,icon,onClick,loading})=>(
  <div onClick={onClick} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
    padding:"18px 20px",cursor:onClick?"pointer":"default",transition:"border-color .2s"}}
    onMouseEnter={e=>{if(onClick)e.currentTarget.style.borderColor=color;}}
    onMouseLeave={e=>{if(onClick)e.currentTarget.style.borderColor=C.border;}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:C.muted,marginBottom:10}}>{label}</div>
        <div style={{fontSize:30,fontWeight:800,color,lineHeight:1}}>{loading?"…":value}</div>
        {sub&&<div style={{fontSize:12,color:C.accent3,fontWeight:600,marginTop:6}}>{sub}</div>}
      </div>
      <div style={{fontSize:26,opacity:0.7}}>{icon}</div>
    </div>
  </div>
);
const ST = ({children})=>(
  <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:C.muted,marginBottom:14}}>{children}</div>
);
const Spinner = ({size=13})=>(
  <span style={{display:"inline-block",width:size,height:size,border:`2px solid ${C.border}`,
    borderTopColor:C.accent,borderRadius:"50%",animation:"spin .7s linear infinite",flexShrink:0}}/>
);
const PBar = ({v,color=C.accent,h=6})=>(
  <div style={{background:C.border,borderRadius:h,height:h,overflow:"hidden"}}>
    <div style={{width:`${Math.min(100,Math.max(0,v||0))}%`,height:"100%",background:color,borderRadius:h,transition:"width .5s"}}/>
  </div>
);
const ErrorBox = ({err})=>err?(
  <div style={{background:"rgba(239,68,68,.08)",border:`1px solid ${C.danger}44`,borderRadius:8,
    padding:"10px 14px",marginTop:12,fontSize:12,color:C.danger}}>⚠️ {err}</div>
):null;
const ResultBox = ({data,label="Result"})=>data?(
  <div style={{background:C.surface,border:`1px solid ${C.accent3}44`,borderRadius:10,
    padding:14,marginTop:14,maxHeight:220,overflowY:"auto"}}>
    <ST>{label}</ST>
    <pre style={{fontSize:11,color:C.accent3,lineHeight:1.9,whiteSpace:"pre-wrap",margin:0}}>
      {typeof data==="string"?data:JSON.stringify(data,null,2)}
    </pre>
  </div>
):null;
const ActionBtn = ({onClick,loading,children,variant="bp",style:s,disabled})=>(
  <button className={`btn ${variant}`} onClick={onClick} disabled={loading||disabled}
    style={{display:"flex",alignItems:"center",gap:8,...s}}>
    {loading?<Spinner/>:null}{children}
  </button>
);

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const fmt = n => n >= 1e6 ? (n/1e6).toFixed(1)+"M" : n >= 1e3 ? (n/1e3).toFixed(1)+"K" : String(n||0);
const rand = (a,b) => Math.floor(Math.random()*(b-a+1))+a;

// AI via backend (routes through /ai/chatbot — avoids CORS on direct Anthropic calls)
const callAI = async (prompt, sys) => {
  const langSuffix = _lang === "hi" ? " Please respond in Hindi (हिन्दी में जवाब दें)." : "";
  const res = await api.post("/ai/chatbot", {
    message: prompt + langSuffix,
    systemPrompt: (sys || "You are AutoFlow AI Pro — expert in social media automation, marketing & content creation. Be concise, practical, use emojis naturally.") + langSuffix,
  });
  return res.data?.reply || "";
};

// ═══════════════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════════════
const CSS=`
/* Fonts loaded via index.html */
*{box-sizing:border-box;margin:0;padding:0}
body{background:${C.bg};color:${C.text};font-family:'Syne','Noto Sans Devanagari',sans-serif}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.bg}}
::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
body{transition:background .25s,color .25s}
.hide-desktop{display:none}
/* Global search dropdown */
.search-result:hover{background:var(--hover)!important}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes glow{0%,100%{box-shadow:0 0 18px rgba(0,212,255,.2)}50%{box-shadow:0 0 40px rgba(0,212,255,.5)}}
@keyframes slideIn{from{transform:translateX(-10px);opacity:0}to{transform:none;opacity:1}}
.anim{animation:fadeIn .35s ease}
.tb{background:none;border:none;color:${C.muted};cursor:pointer;padding:8px 12px;border-radius:8px;
  font-family:'Syne',sans-serif;font-size:12.5px;font-weight:600;display:flex;align-items:center;
  gap:8px;transition:all .18s;white-space:nowrap;width:100%}
.tb:hover{color:${C.accent};background:${C.glow}}
.tb.active{color:${C.accent};background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.2)}
.card{background:${C.card};border:1px solid ${C.border};border-radius:12px;padding:20px}
.csm{background:${C.surface};border:1px solid ${C.border};border-radius:10px;padding:14px}
.btn{border:none;border-radius:8px;padding:9px 18px;cursor:pointer;font-family:'Syne',sans-serif;
  font-weight:700;font-size:13px;transition:all .2s;display:inline-flex;align-items:center;gap:6px}
.btn:disabled{opacity:.5;cursor:not-allowed}
.bp{background:linear-gradient(135deg,${C.accent},${C.accent2});color:#fff}
.bp:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 24px rgba(0,212,255,.3)}
.bg{background:rgba(255,255,255,.04);color:${C.text};border:1px solid ${C.border}}
.bg:hover:not(:disabled){border-color:${C.accent};color:${C.accent}}
.bd{background:rgba(239,68,68,.12);color:${C.danger};border:1px solid rgba(239,68,68,.25)}
.bg3{background:rgba(16,185,129,.1);color:${C.accent3};border:1px solid rgba(16,185,129,.3)}
.bg4{background:rgba(245,158,11,.1);color:${C.accent4};border:1px solid rgba(245,158,11,.3)}
.inp{background:${C.surface};border:1px solid ${C.border};border-radius:8px;padding:9px 13px;
  color:${C.text};font-family:'Syne',sans-serif;font-size:13px;outline:none;transition:border-color .2s;width:100%}
.inp:focus{border-color:${C.accent}}
.ta{background:${C.surface};border:1px solid ${C.border};border-radius:8px;padding:11px 13px;
  color:${C.text};font-family:'Syne',sans-serif;font-size:13px;outline:none;resize:vertical;
  transition:border-color .2s;width:100%}
.ta:focus{border-color:${C.accent}}
.sel{background:${C.surface};border:1px solid ${C.border};border-radius:8px;padding:9px 13px;
  color:${C.text};font-family:'Syne',sans-serif;font-size:13px;outline:none;width:100%;cursor:pointer}
.mono{font-family:'JetBrains Mono',monospace}
.notif{position:fixed;top:20px;right:20px;z-index:9999;padding:12px 20px;border-radius:10px;
  font-weight:700;font-size:13px;animation:fadeIn .3s;max-width:360px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:9px 12px;font-size:11px;color:${C.muted};font-weight:700;
  border-bottom:1px solid ${C.border};text-transform:uppercase;letter-spacing:1px}
td{padding:10px 12px;font-size:13px;border-bottom:1px solid ${C.border}18;vertical-align:middle}
tr:hover td{background:rgba(255,255,255,.013)}
.chip{display:inline-flex;align-items:center;gap:6px;background:${C.surface};border:1px solid ${C.border};
  border-radius:20px;padding:5px 12px;font-size:12px;cursor:pointer;transition:all .2s}
.chip.sel{border-color:${C.accent};background:rgba(0,212,255,.1);color:${C.accent}}
.glow-box{animation:glow 3s infinite}
label{display:block;font-size:12px;color:${C.muted};margin-bottom:6px;font-weight:600}

/* ── Tablet (≤960px) ──────────────────────────────────────── */
@media(max-width:960px){
  .grid4{grid-template-columns:1fr 1fr!important}
  .grid3{grid-template-columns:1fr 1fr!important}
}
/* ── Mobile (≤700px) ─────────────────────────────────────── */
@media(max-width:700px){
  aside{
    position:fixed!important;top:0;left:0;bottom:0;z-index:200;
    width:240px!important;padding:14px 8px!important;
    transform:translateX(-100%);transition:transform .25s ease;
    box-shadow:4px 0 24px rgba(0,0,0,.4);
  }
  aside.open{transform:translateX(0)!important}
  .mobile-overlay{
    display:block!important;position:fixed;inset:0;z-index:199;
    background:rgba(0,0,0,.5);
  }
  .mobile-topbar{
    display:flex!important;align-items:center;justify-content:space-between;
    position:sticky;top:0;z-index:100;
    background:var(--topbar-bg);border-bottom:1px solid var(--topbar-border);
    padding:10px 16px;height:52px;
  }
  .tb{width:100%!important;justify-content:flex-start!important}
  main{padding:14px!important;margin-top:0!important}
  .grid2,.grid3,.grid4{grid-template-columns:1fr!important}
  h1{font-size:22px!important}
  .notif{
    left:12px!important;right:12px!important;
    max-width:calc(100vw - 24px)!important;
    top:60px!important;
  }
  table{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}
  .card{padding:14px!important}
  .grid2.tight{grid-template-columns:1fr!important}
  .hide-mobile{display:none!important}
  .hide-desktop{display:flex!important}
  .full-mobile{width:100%!important}
  .mobile-overlay{display:none}
}
/* ── Very small phones (≤380px) ─────────────────────────── */
@media(max-width:380px){
  h1{font-size:18px!important}
  .btn{padding:8px 12px!important;font-size:12px!important}
}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
`;

// ═══════════════════════════════════════════════════════════
// LOGIN SCREEN — real /auth/login
// ═══════════════════════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("admin@autoflow.io");
  const [pass,  setPass]  = useState("password123");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleLogin = async () => {
    if (!email || pass.length < 6) { setErr("Valid email and 6+ char password required"); return; }
    setErr(""); setLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password: pass });
      sessionStorage.setItem("af_token",        res.token);
      sessionStorage.setItem("af_refresh",      res.refreshToken || "");
      sessionStorage.setItem("af_user",         JSON.stringify(res.user));
      onLogin(res.user);
    } catch (e) {
      setErr(e.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",
      justifyContent:"center",flexDirection:"column",gap:32}}>
      <div style={{textAlign:"center"}}>
        <div style={{width:64,height:64,borderRadius:18,background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,margin:"0 auto 16px",
          animation:"glow 3s infinite"}}>⚡</div>
        <div style={{fontSize:32,fontWeight:800}}>AutoFlow Pro</div>
        <div style={{fontSize:13,color:C.accent,fontWeight:700,letterSpacing:3,marginTop:4}}>MARKETING AUTOMATION SUITE</div>
      </div>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:36,width:"100%",maxWidth:400}}>
        <div style={{marginBottom:20}}>
          <label>{t("auth.email")}</label>
          <input className="inp" value={email} onChange={e=>setEmail(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="admin@autoflow.io"/>
        </div>
        <div style={{marginBottom:20}}>
          <label>{t("auth.password")}</label>
          <input className="inp" type="password" value={pass} onChange={e=>setPass(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="••••••••"/>
        </div>
        {err && <div style={{color:C.danger,fontSize:12,marginBottom:12,textAlign:"center"}}>⚠️ {err}</div>}
        <button className="btn bp" style={{width:"100%",padding:"12px",fontSize:14}}
          onClick={handleLogin} disabled={loading}>
          {loading ? <><Spinner/> {t("auth.signing_in")}</> : t("auth.signin")}
        </button>
        <div style={{textAlign:"center",marginTop:14,fontSize:12,color:C.muted}}>
          No account? — <button style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:12,fontWeight:700}}
            onClick={async()=>{
              setLoading(true);
              try {
                const res = await api.post("/auth/register",{name:"Admin",email,password:pass});
                sessionStorage.setItem("af_token", res.token);
                sessionStorage.setItem("af_user", JSON.stringify(res.user));
                onLogin(res.user);
              } catch(e){ setErr(e.message); } finally { setLoading(false); }
            }}>Register</button>
        </div>
      </div>
      <div style={{display:"flex",gap:20,fontSize:12,color:C.muted}}>
        {["14 Platforms","Real-time","AI-Powered","Bull Queues"].map(f=>(
          <div key={f} style={{display:"flex",alignItems:"center",gap:6}}>
            <Dot color={C.accent3}/>{f}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════
// TABS is a function so labels update when language changes
function getTABS() {
  return [
    {id:"dashboard",label:t("nav.dashboard"),       icon:"📊",g:t("nav.main")},
    {id:"platforms",label:t("nav.platforms_tab"),   icon:"🌐",g:t("nav.main")},
    {id:"inbox",    label:t("nav.inbox"),            icon:"📥",g:t("nav.main")},
    {id:"composer", label:t("nav.composer"),         icon:"✨",g:t("nav.main")},
    {id:"scheduler",label:t("nav.scheduler"),        icon:"📅",g:t("nav.main")},
    {id:"scraper",  label:t("nav.scraper"),          icon:"🔍",g:t("nav.main")},
    {id:"whatsapp", label:t("nav.whatsapp"),         icon:"💬",g:t("nav.platforms")},
    {id:"instagram",label:"Instagram",               icon:"📸",g:t("nav.platforms")},
    {id:"facebook", label:"Facebook",                icon:"👤",g:t("nav.platforms")},
    {id:"twitter",  label:"Twitter / X",             icon:"🐦",g:t("nav.platforms")},
    {id:"tiktok",   label:"TikTok",                  icon:"🎵",g:t("nav.platforms")},
    {id:"youtube",  label:"YouTube",                 icon:"▶️",g:t("nav.platforms")},
    {id:"linkedin", label:"LinkedIn",                icon:"💼",g:t("nav.platforms")},
    {id:"telegram", label:"Telegram",                icon:"✈️",g:t("nav.platforms")},
    {id:"discord",  label:"Discord",                 icon:"🎮",g:t("nav.platforms")},
    {id:"pinterest",label:"Pinterest",               icon:"📌",g:t("nav.platforms")},
    {id:"email",    label:t("nav.email"),            icon:"📧",g:t("nav.channels")},
    {id:"sms",      label:t("nav.sms"),              icon:"📱",g:t("nav.channels")},
    {id:"contacts", label:t("nav.contacts"),         icon:"👥",g:t("nav.tools")},
    {id:"accounts", label:t("nav.accounts"),         icon:"🔑",g:t("nav.tools")},
    {id:"chatbot",  label:t("nav.chatbot"),          icon:"🤖",g:t("nav.tools")},
    {id:"analytics",label:t("nav.analytics"),        icon:"📈",g:t("nav.tools")},
    {id:"security", label:t("nav.security"),         icon:"🛡️",g:t("nav.tools")},
    {id:"api",      label:t("nav.api"),              icon:"⚡",g:t("nav.tools")},
    {id:"billing",  label:t("nav.billing"),          icon:"💳",g:t("nav.tools")},
    {id:"flows",    label:"Flow Builder",               icon:"🔀",g:t("nav.tools")},
    {id:"tracking", label:"Tracking",                     icon:"📊",g:t("nav.tools")},
  ];
}

function Sidebar({ tab, setTab, user, wsConnected, dark, setDark, lang, setLang, sidebarOpen, setSidebarOpen }) {
  const [collapsed, setCollapsed] = useState({});
  const toggle = g => setCollapsed(c => ({...c,[g]:!c[g]}));
  const TABS   = getTABS();
  const groups = [...new Set(TABS.map(t => t.g))];

  return (
    <aside className={sidebarOpen ? "open" : ""} style={{width:212,background:C.surface,borderRight:`1px solid ${C.border}`,
      display:"flex",flexDirection:"column",padding:"16px 10px",position:"sticky",top:0,
      height:"100vh",overflowY:"auto",flexShrink:0}}>
      {/* Mobile close button */}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:4}} className="hide-desktop">
        <button onClick={() => setSidebarOpen && setSidebarOpen(false)} style={{
          background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,
          padding:"2px 6px",lineHeight:1,fontFamily:"'Syne',sans-serif",
        }}>✕</button>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"0 4px",marginBottom:18}}>
        <div style={{width:36,height:36,borderRadius:10,flexShrink:0,
          background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}} className="glow-box">⚡</div>
        <div><div style={{fontSize:15,fontWeight:800}}>AutoFlow</div>
          <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2}}>PRO v4</div></div>
      </div>
      <div style={{background:wsConnected?"rgba(16,185,129,.08)":"rgba(239,68,68,.08)",
        border:`1px solid ${wsConnected?"rgba(16,185,129,.2)":"rgba(239,68,68,.2)"}`,
        borderRadius:8,padding:"7px 10px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:6,fontSize:12,
          color:wsConnected?C.accent3:C.danger,fontWeight:700}}>
          <Dot color={wsConnected?C.accent3:C.danger}/>{wsConnected?"Live Connected":"Connecting…"}
        </div>
        <div style={{fontSize:10,color:C.muted,marginTop:2}}>Real-time socket active</div>
      </div>
      <nav style={{flex:1,display:"flex",flexDirection:"column",gap:1}}>
        {groups.map(g => {
          const items = TABS.filter(t => t.g === g);
          return (
            <div key={g}>
              <div onClick={()=>toggle(g)} style={{fontSize:10,color:C.muted,fontWeight:700,
                letterSpacing:2,padding:"8px 12px 4px",cursor:"pointer",display:"flex",
                justifyContent:"space-between",alignItems:"center",userSelect:"none"}}>
                {g}<span style={{fontSize:9}}>{collapsed[g]?"▶":"▼"}</span>
              </div>
              {!collapsed[g] && items.map(t => (
                <button key={t.id} className={`tb${tab===t.id?" active":""}`} onClick={()=>setTab(t.id)}>
                  <span style={{fontSize:14}}>{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
          );
        })}
      </nav>
      <div style={{paddingTop:14,borderTop:`1px solid ${C.border}`,marginTop:8}}>
        {/* Language toggle */}
        <button
          onClick={() => {
            const next = lang === "en" ? "hi" : "en";
            setLang(next);
            localStorage.setItem("af_lang", next);
            _lang = next;
          }}
          style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"6px 8px",
            marginBottom:6,background:"transparent",
            border:`1px solid ${C.border}`,borderRadius:8,cursor:"pointer",
            color:C.muted,fontSize:12,fontWeight:600,fontFamily:"'Syne',sans-serif"}}
        >
          <span style={{fontSize:16}}>{lang === "en" ? "🇮🇳" : "🇬🇧"}</span>
          {lang === "en" ? "हिन्दी" : "English"}
        </button>
        {/* Theme toggle */}
        <button
          onClick={() => setDark(d => !d)}
          style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"6px 8px",
            marginBottom:10,background:dark?"rgba(255,255,255,.04)":"rgba(0,0,0,.04)",
            border:`1px solid ${C.border}`,borderRadius:8,cursor:"pointer",
            color:C.muted,fontSize:12,fontWeight:600,fontFamily:"'Syne',sans-serif"}}
        >
          <span style={{fontSize:16}}>{dark ? "☀️" : "🌙"}</span>
          {dark ? "Light mode" : "Dark mode"}
        </button>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:8,flexShrink:0,
            background:`linear-gradient(135deg,${C.accent2},${C.accent})`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>👤</div>
          <div>
            <div style={{fontSize:13,fontWeight:700}}>{user?.name||"Admin"}</div>
            <div style={{fontSize:10,color:C.accent}}>{user?.plan||"free"}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD TAB — real /analytics/overview
// ═══════════════════════════════════════════════════════════
function DashboardTab({ setTab, socket }) {
  const [stats, setStats]         = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [realtimeMsgs, setRt]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, rt] = await Promise.all([
        api.get("/analytics/overview?period=7d"),
        api.get("/analytics/realtime").catch(() => null),
      ]);
      setStats(ov.data?.summary || ov.data);
      setCampaigns(ov.data?.recentCampaigns || []);
      if (rt?.data) setRt(rt.data);
    } catch {/* use cached */} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live campaign progress
  useEffect(() => {
    if (!socket) return;
    return socket.on("campaign:completed", () => load());
  }, [socket, load]);

  const daily = stats?.dailyVolume || [];

  return (
    <div className="anim">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28}}>
        <div>
          <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>Command Center ⚡</h1>
          <p style={{color:C.muted,fontSize:14}}>
            {realtimeMsgs ? `${realtimeMsgs.last24h} messages in 24h · ${realtimeMsgs.activeCampaigns} campaigns running` : "Real-time automation dashboard"}
          </p>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button className="btn bg" onClick={load}>↻ Refresh</button>
          <button className="btn bp" onClick={()=>setTab("composer")}>+ AI Campaign</button>
        </div>
      </div>

      <div className="grid3" style={{marginBottom:22}}>
        {[
          {label:"Total Contacts",   value:fmt(stats?.totalContacts||0),    sub:"In CRM",               icon:"👥",  color:C.accent,  t:"contacts"},
          {label:"Messages (7d)",    value:fmt(stats?.totalMessages||0),    sub:`${stats?.deliveryRate||0}% delivery rate`,icon:"✅",color:C.accent3,t:"analytics"},
          {label:"Active Campaigns", value:stats?.activeCampaigns||0,       sub:"Running now",          icon:"🚀",  color:C.accent2, t:"analytics"},
          {label:"Open Rate",        value:(stats?.openRate||0)+"%",        sub:"Industry avg: 21%",    icon:"📬",  color:C.accent4, t:"analytics"},
          {label:"Click Rate",       value:(stats?.clickRate||0)+"%",       sub:"↑ vs benchmark",       icon:"🖱️", color:C.accent,  t:"analytics"},
          {label:"Reply Rate",       value:(stats?.replyRate||0)+"%",       sub:"Inbound responses",    icon:"💬",  color:C.accent3, t:"analytics"},
        ].map((s,i)=><Stat key={i} loading={loading} {...s} onClick={()=>setTab(s.t)}/>)}
      </div>

      {/* Message volume chart */}
      {daily.length > 0 && (
        <div className="card" style={{marginBottom:18}}>
          <ST>7-Day Message Volume</ST>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={daily}>
              <defs>
                <linearGradient id="gD" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.accent} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={C.accent} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="_id" tick={{fill:C.muted,fontSize:11}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={fmt}/>
              <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12}}/>
              <Area type="monotone" dataKey="count" stroke={C.accent} fill="url(#gD)" name="Messages" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Quick launch + recent campaigns */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1.5fr",gap:18}}>
        <div className="card">
          <ST>Quick Launch</ST>
          <div className="grid2" style={{gap:10}}>
            {[
              {l:"WhatsApp Blast",i:"💬",t:"whatsapp"},{l:"Email Campaign",i:"📧",t:"email"},
              {l:"AI Post Gen",i:"✨",t:"composer"},{l:"Lead Scraper",i:"🔍",t:"scraper"},
              {l:"Add Contacts",i:"👥",t:"contacts"},{l:"Analytics",i:"📈",t:"analytics"},
            ].map((a,i)=>(
              <button key={i} className="btn bg" style={{display:"flex",alignItems:"center",gap:8,justifyContent:"flex-start"}}
                onClick={()=>setTab(a.t)}><span style={{fontSize:16}}>{a.i}</span>{a.l}</button>
            ))}
          </div>
        </div>
        <div className="card">
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
            <ST>Recent Campaigns</ST>
            <button className="btn bg" style={{fontSize:11,padding:"4px 12px"}} onClick={()=>setTab("analytics")}>All →</button>
          </div>
          {loading ? <div style={{textAlign:"center",padding:20}}><Spinner size={24}/></div> :
            campaigns.length === 0 ?
              <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:20}}>No campaigns yet — create one!</div> :
              <table>
                <thead><tr><th>Name</th><th>Type</th><th>Sent</th><th>Status</th></tr></thead>
                <tbody>{campaigns.slice(0,5).map((c,i)=>(
                  <tr key={i}>
                    <td style={{fontWeight:600,fontSize:12}}>{c.name}</td>
                    <td><Badge label={c.type} color={C.accent}/></td>
                    <td style={{color:C.accent3}}>{fmt(c.stats?.totalSent||c.audience?.totalCount||0)}</td>
                    <td><Badge label={c.status} color={c.status==="running"?C.accent3:c.status==="completed"?C.accent:C.accent4}/></td>
                  </tr>
                ))}</tbody>
              </table>
          }
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// WHATSAPP TAB — real broadcast + QR via socket
// ═══════════════════════════════════════════════════════════
function WhatsAppTab({ notify, socket }) {
  const [contacts, setContacts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [history,  setHistory]  = useState([]);
  const [msg,      setMsg]      = useState("");
  const [selected, setSelected] = useState([]);
  const [campName, setCampName] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [aiLoad,   setAiLoad]   = useState(false);
  const [qrData,   setQrData]   = useState(null);
  const [qrAccId,  setQrAccId]  = useState(null);
  const [result,   setResult]   = useState(null);
  const [progress, setProgress] = useState(null);
  const [settings, setSettings] = useState({delay:true,personalize:true,rotate:true,trackClicks:true});

  useEffect(()=>{
    api.get("/contacts?limit=200").then(r=>setContacts(r.data||[])).catch(()=>{});
    api.get("/accounts?platform=whatsapp").then(r=>setAccounts(r.data||[])).catch(()=>{});
    api.get("/campaigns?type=whatsapp&limit=10").then(r=>setHistory(r.data||[])).catch(()=>{});
  },[]);

  // Socket.io — QR + campaign progress
  useEffect(()=>{
    if(!socket) return;
    const u1 = socket.on("qr",      ({qr})          => setQrData(qr));
    const u2 = socket.on("wa:ready", ({accountId})   => { setQrData(null); notify("✅ WhatsApp connected!"); setQrAccId(null); });
    const u3 = socket.on("campaign:progress", p      => setProgress(p));
    const u4 = socket.on("campaign:completed",()     => { setProgress(null); setLoading(false); api.get("/campaigns?type=whatsapp&limit=10").then(r=>setHistory(r.data||[])).catch(()=>{}); });
    return ()=>{ u1(); u2(); u3(); u4(); };
  },[socket,notify]);

  const waContacts = contacts.filter(c => c.waEnabled || c.wa);

  const genAI = async () => {
    setAiLoad(true);
    try { const r = await callAI("Write a WhatsApp broadcast marketing message. Use [name] variable. Max 180 chars. 1-2 emojis. Include [link]."); setMsg(r); notify("✨ AI message generated!"); }
    catch { setMsg("Hi [name]! 👋 Exclusive offer — 40% OFF today only → [link]"); }
    setAiLoad(false);
  };

  const initQR = async (accountId) => {
    setQrAccId(accountId);
    socket?.emit("join:account", { accountId });
    try {
      await api.post(`/whatsapp/init/${accountId}`);
      notify("📱 Initializing WhatsApp… scan QR when it appears");
    } catch(e) { notify(e.message, "error"); setQrAccId(null); }
  };

  const sendBroadcast = async () => {
    if (!msg.trim()) { notify("Write a message first", "error"); return; }
    if (!selected.length) { notify("Select contacts first", "error"); return; }
    const phones = selected.map(id => waContacts.find(c=>c._id===id||c.id===id)?.phone).filter(Boolean);
    if (!phones.length) { notify("No valid phone numbers", "error"); return; }
    const accountId = accounts[0]?._id;
    if (!accountId) { notify("Connect a WhatsApp account first", "error"); return; }
    setLoading(true); setResult(null);
    try {
      const res = await api.post("/whatsapp/broadcast", {
        campaignName: campName || "WA Broadcast",
        contacts: phones,
        message: msg,
        accountId,
        options: settings,
      });
      socket?.emit("join:campaign", { campaignId: res.campaignId });
      setResult(res);
      notify(`✅ Broadcast queued for ${phones.length} contacts!`);
      setCampName(""); setMsg(""); setSelected([]);
    } catch(e) { notify(e.message, "error"); setLoading(false); }
  };

  const statColor = s => s==="running"?C.accent3:s==="scheduled"?C.accent4:C.accent;

  return (
    <div className="anim">
      <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>WhatsApp Pro 💬</h1>
      <p style={{color:C.muted,fontSize:14,marginBottom:22}}>Bulk sender · auto-reply · QR connect · live progress</p>
      <div className="grid4" style={{marginBottom:22}}>
        {[
          {label:"Active Numbers",value:accounts.filter(a=>a.status==="active").length,color:C.accent,icon:"📱"},
          {label:"WA Contacts",value:waContacts.length,color:C.accent3,icon:"👥"},
          {label:"Total Campaigns",value:history.length,color:C.accent2,icon:"📊"},
          {label:"Accounts",value:accounts.length,color:C.accent4,icon:"🔑"},
        ].map((s,i)=><Stat key={i}{...s}/>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr",gap:18}}>
        <div className="card">
          <ST>New Broadcast</ST>
          <div style={{marginBottom:12}}>
            <label>Campaign Name</label>
            <input className="inp" value={campName} onChange={e=>setCampName(e.target.value)} placeholder="e.g. Flash Sale Alert"/>
          </div>
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <label style={{marginBottom:0}}>Message</label>
              <ActionBtn onClick={genAI} loading={aiLoad} variant="bg" style={{fontSize:11,padding:"3px 10px"}}>✨ AI Write</ActionBtn>
            </div>
            <textarea className="ta" rows={4} value={msg} onChange={e=>setMsg(e.target.value)}
              placeholder="Hi [name]! 👋 Your message... [name] [phone] [link]"/>
            <div style={{fontSize:11,color:msg.length>160?C.warn:C.muted,marginTop:4}}>{msg.length} chars</div>
          </div>
          <div style={{marginBottom:12}}>
            <label>Select Account</label>
            <select className="sel">
              {accounts.length ? accounts.map(a=><option key={a._id} value={a._id}>{a.username||a._id} ({a.status})</option>)
                : <option value="">No WA accounts — connect one below</option>}
            </select>
          </div>
          <div style={{marginBottom:12}}>
            <label>Recipients ({selected.length} selected)</label>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <button className="btn bg" style={{fontSize:11}} onClick={()=>setSelected(waContacts.map(c=>c._id||c.id))}>All WA ({waContacts.length})</button>
              <button className="btn bg" style={{fontSize:11}} onClick={()=>setSelected([])}>Clear</button>
            </div>
            <div style={{background:C.surface,borderRadius:8,padding:10,maxHeight:140,overflowY:"auto",border:`1px solid ${C.border}`}}>
              {waContacts.length===0 ? <div style={{color:C.muted,fontSize:12,padding:8}}>No WA contacts in CRM yet</div> :
                waContacts.map(c=>{
                  const id = c._id||c.id;
                  return (
                    <div key={id} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 4px",cursor:"pointer"}}
                      onClick={()=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id])}>
                      <div style={{width:16,height:16,borderRadius:3,flexShrink:0,
                        border:`2px solid ${selected.includes(id)?C.accent3:C.border}`,
                        background:selected.includes(id)?C.accent3:"transparent",
                        display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff"}}>
                        {selected.includes(id)&&"✓"}
                      </div>
                      <span style={{flex:1,fontSize:13}}>{c.name}</span>
                      <span style={{fontSize:11,color:C.muted}}>{c.phone}</span>
                    </div>
                  );
                })
              }
            </div>
          </div>
          <div className="csm" style={{marginBottom:12}}>
            <div className="grid2">
              {Object.entries(settings).map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12}}>
                  <span>{{delay:"Anti-spam delay",personalize:"Personalize [name]",rotate:"Rotate numbers",trackClicks:"Track clicks"}[k]}</span>
                  <Toggle on={v} onChange={val=>setSettings(s=>({...s,[k]:val}))}/>
                </div>
              ))}
            </div>
          </div>
          {progress && (
            <div style={{marginBottom:12,background:C.surface,borderRadius:8,padding:12}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
                <span style={{color:C.accent3}}>Sending… {progress.sent||0}/{progress.total||0}</span>
                <span style={{fontWeight:700}}>{progress.progress||0}%</span>
              </div>
              <PBar v={progress.progress||0} color={C.accent3}/>
            </div>
          )}
          <ActionBtn onClick={sendBroadcast} loading={loading} style={{width:"100%"}}>
            🚀 Send Broadcast ({selected.length})
          </ActionBtn>
          <ResultBox data={result}/>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* QR Connect */}
          <div className="card">
            <ST>Connect WhatsApp Number</ST>
            {qrData ? (
              <div style={{textAlign:"center",padding:12}}>
                <img src={qrData} alt="WhatsApp QR" style={{width:180,height:180,borderRadius:10}}/>
                <div style={{fontSize:12,color:C.accent3,fontWeight:700,marginTop:10}}>Open WhatsApp → Linked Devices → Scan</div>
              </div>
            ) : (
              <div>
                {accounts.map(a=>(
                  <div key={a._id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,padding:"8px 0",borderBottom:`1px solid ${C.border}22`}}>
                    <div><div style={{fontSize:13,fontWeight:600}}>{a.username||a._id}</div>
                      <Badge label={a.status} color={a.status==="active"?C.accent3:C.warn}/></div>
                    {a.status!=="active" && (
                      <button className="btn bg" style={{fontSize:11}} onClick={()=>initQR(a._id)}>
                        {qrAccId===a._id?<Spinner/>:"Init QR"}
                      </button>
                    )}
                  </div>
                ))}
                <button className="btn bp" style={{width:"100%",marginTop:8}} onClick={async()=>{
                  try {
                    const r = await api.post("/accounts",{platform:"whatsapp",username:"New WA Account"});
                    setAccounts(a=>[...a,r.data]);
                    notify("Account created — click Init QR to connect");
                  } catch(e){ notify(e.message,"error"); }
                }}>+ Add WA Account</button>
              </div>
            )}
          </div>

          {/* Broadcast history */}
          <div className="card">
            <ST>Recent Broadcasts</ST>
            {history.length===0 ? <div style={{color:C.muted,fontSize:13}}>No broadcasts yet</div> :
              history.slice(0,5).map((b,i)=>(
                <div key={i} style={{padding:"10px 0",borderBottom:`1px solid ${C.border}22`}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <div style={{fontSize:13,fontWeight:700}}>{b.name}</div>
                    <Badge label={b.status} color={statColor(b.status)}/>
                  </div>
                  <div className="grid4" style={{gap:4}}>
                    {[["📤",b.audience?.totalCount||0,"Sent"],["✅",b.stats?.totalSent||0,"Deliv"],
                      ["👁️",b.stats?.opened||0,"Read"],["💬",b.stats?.replied||0,"Reply"]].map(([ic,v,l],j)=>(
                      <div key={j} style={{textAlign:"center",background:C.surface,borderRadius:6,padding:4}}>
                        <div style={{fontSize:11}}>{ic} {fmt(v)}</div>
                        <div style={{fontSize:9,color:C.muted}}>{l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EMAIL TAB — real /email/campaign
// ═══════════════════════════════════════════════════════════
function EmailTab({ notify, socket }) {
  const [sub,   setSub]   = useState("");
  const [body,  setBody]  = useState("");
  const [from,  setFrom]  = useState("");
  const [name,  setName]  = useState("AutoFlow Team");
  const [cname, setCname] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiLoad,  setAiLoad]  = useState(false);
  const [result,  setResult]  = useState(null);
  const [progress,setProgress]=useState(null);
  const [campaigns,setCampaigns]=useState([]);
  const [err, setErr] = useState("");

  useEffect(()=>{
    api.get("/campaigns?type=email&limit=10").then(r=>setCampaigns(r.data||[])).catch(()=>{});
  },[]);

  useEffect(()=>{
    if(!socket) return;
    const u1 = socket.on("campaign:progress", p => setProgress(p));
    const u2 = socket.on("campaign:completed",()=> { setProgress(null); setLoading(false);
      api.get("/campaigns?type=email&limit=10").then(r=>setCampaigns(r.data||[])).catch(()=>{});
    });
    return ()=>{ u1(); u2(); };
  },[socket]);

  const genEmail = async () => {
    setAiLoad(true);
    try {
      const r = await api.post("/ai/generate",{type:"email",platform:"email",tone:"professional",context:cname||"promotional"});
      if(r.data?.content) setBody(r.data.content);
      notify("✨ AI email generated!");
    } catch { setBody("Hi [name],\n\nWe have something special just for you.\n\nOffer expires midnight.\n\nBest regards,\nThe AutoFlow Team"); }
    setAiLoad(false);
  };

  const genSubjects = async () => {
    try {
      const r = await api.post("/ai/subject-lines",{topic:cname||"promotional offer",tone:"engaging",count:3});
      if(r.data?.[0]) setSub(r.data[0]);
      notify(`✨ ${r.data?.length||1} subject lines generated!`);
    } catch {}
  };

  const send = async () => {
    setErr("");
    if (!sub || !body) { setErr("Subject and body required"); return; }
    setLoading(true);
    try {
      const res = await api.post("/email/campaign", {
        name: cname || "Email Campaign",
        subject: sub, html: body,
        fromEmail: from || undefined,
        fromName: name,
        options: { trackOpens: true, trackClicks: true },
      });
      socket?.emit("join:campaign",{ campaignId: res.campaignId });
      setResult(res);
      notify(`✅ Email campaign queued! ${res.recipients} recipients`);
      setSub(""); setBody(""); setCname("");
    } catch(e) { setErr(e.message); setLoading(false); }
  };

  return (
    <div className="anim">
      <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>Email Campaign Builder 📧</h1>
      <p style={{color:C.muted,fontSize:14,marginBottom:22}}>SMTP bulk sender · drip sequences · open/click tracking</p>
      <div className="grid4" style={{marginBottom:22}}>
        {[{label:"Total Sent",value:fmt(campaigns.reduce((s,c)=>s+(c.stats?.totalSent||0),0)),color:C.accent4,icon:"📤"},
          {label:"Campaigns",value:campaigns.length,color:C.accent3,icon:"📊"},
          {label:"Active",value:campaigns.filter(c=>c.status==="running").length,color:C.accent,icon:"▶️"},
          {label:"Completed",value:campaigns.filter(c=>c.status==="completed").length,color:C.accent2,icon:"✅"},
        ].map((s,i)=><Stat key={i}{...s}/>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1.3fr 1fr",gap:18}}>
        <div className="card">
          <ST>New Campaign</ST>
          <div className="grid2" style={{marginBottom:12}}>
            <div><label>Campaign Name</label><input className="inp" value={cname} onChange={e=>setCname(e.target.value)} placeholder="Diwali Sale 2025"/></div>
            <div><label>From Name</label><input className="inp" value={name} onChange={e=>setName(e.target.value)} placeholder="AutoFlow Team"/></div>
            <div><label>From Email</label><input className="inp" value={from} onChange={e=>setFrom(e.target.value)} placeholder="hello@yourdomain.com"/></div>
            <div><label>SMTP Provider</label><select className="sel"><option>Default (env)</option><option>Gmail</option><option>SendGrid</option></select></div>
          </div>
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <label style={{marginBottom:0}}>Subject Line</label>
              <button className="btn bg" style={{fontSize:11,padding:"3px 10px"}} onClick={genSubjects}>✨ AI Subjects</button>
            </div>
            <input className="inp" value={sub} onChange={e=>setSub(e.target.value)} placeholder="🔥 50% OFF — Today Only! [name], don't miss this"/>
          </div>
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <label style={{marginBottom:0}}>Email Body</label>
              <ActionBtn onClick={genEmail} loading={aiLoad} variant="bg" style={{fontSize:11,padding:"3px 10px"}}>🤖 AI Write</ActionBtn>
            </div>
            <textarea className="ta" rows={9} value={body} onChange={e=>setBody(e.target.value)}
              placeholder={"Hi [name],\n\nWrite your email here or use AI...\n\nVariables: [name] [email] [link]"}/>
          </div>
          {progress && (
            <div style={{marginBottom:12,background:C.surface,borderRadius:8,padding:12}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
                <span style={{color:C.accent3}}>Sending… {progress.sent||0}/{progress.total||0}</span>
                <span style={{fontWeight:700}}>{progress.progress||0}%</span>
              </div>
              <PBar v={progress.progress||0} color={C.accent4}/>
            </div>
          )}
          <ErrorBox err={err}/>
          <div style={{display:"flex",gap:10,marginTop:12}}>
            <button className="btn bg" style={{flex:1}} onClick={async()=>{
              try { await api.post("/email/test",{to:undefined}); notify("✅ Test email sent!"); } catch(e){ notify(e.message,"error"); }
            }}>🧪 Test</button>
            <ActionBtn onClick={send} loading={loading} style={{flex:2}}>🚀 Send Campaign</ActionBtn>
          </div>
          <ResultBox data={result}/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div className="card">
            <ST>Active Campaigns</ST>
            {campaigns.length===0 ? <div style={{color:C.muted,fontSize:13}}>No email campaigns yet</div> :
              campaigns.slice(0,6).map((c,i)=>(
                <div key={i} style={{padding:"12px 0",borderBottom:`1px solid ${C.border}22`}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <div style={{fontSize:13,fontWeight:700}}>{c.name}</div>
                    <Badge label={c.status} color={c.status==="completed"?C.accent3:c.status==="running"?C.accent:C.muted}/>
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:6}}>{c.content?.subject||"No subject"}</div>
                  <div className="grid4" style={{gap:5}}>
                    {[["Sent",c.stats?.totalSent||0],["Open",(c.stats?.openRate||0)+"%"],
                      ["Click",(c.stats?.clickRate||0)+"%"],["Fail",c.stats?.failed||0]].map(([l,v],j)=>(
                      <div key={j} style={{textAlign:"center",background:C.surface,borderRadius:6,padding:5}}>
                        <div style={{fontSize:12,fontWeight:700,color:j===0?C.text:j===1?C.accent4:j===2?C.accent:C.danger}}>{typeof v==="number"?fmt(v):v}</div>
                        <div style={{fontSize:9,color:C.muted}}>{l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SMS TAB — real /sms/bulk
// ═══════════════════════════════════════════════════════════
function SMSTab({ notify }) {
  const [msg, setMsg]       = useState("");
  const [loading, setLoading] = useState(false);
  const [aiLoad,  setAiLoad]  = useState(false);
  const [result,  setResult]  = useState(null);
  const [contacts,setContacts]= useState([]);
  const [err, setErr]         = useState("");

  useEffect(()=>{ api.get("/contacts?limit=500").then(r=>setContacts(r.data||[])).catch(()=>{}); },[]);

  const phones = contacts.filter(c=>c.phone).map(c=>c.phone);

  const genSMS = async () => {
    setAiLoad(true);
    try { const r = await api.post("/ai/generate",{type:"sms",platform:"sms",tone:"urgent",length:"short"}); setMsg(r.data?.content||""); notify("✨ SMS generated!"); }
    catch { setMsg("Hi [name]! 🎁 30% OFF expires in 4hrs. Use code SAVE30 → [link]"); }
    setAiLoad(false);
  };

  const send = async () => {
    setErr("");
    if (!msg) { setErr("Write a message first"); return; }
    if (!phones.length) { setErr("No contacts with phone numbers"); return; }
    setLoading(true);
    try {
      const res = await api.post("/sms/bulk",{ phones, message: msg });
      setResult(res);
      notify(`✅ SMS queued for ${phones.length} contacts!`);
      setMsg("");
    } catch(e) { setErr(e.message); } finally { setLoading(false); }
  };

  return (
    <div className="anim">
      <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>SMS Bulk Sender 📱</h1>
      <p style={{color:C.muted,fontSize:14,marginBottom:22}}>Twilio-powered · personalized bulk SMS · DND filter</p>
      <div className="grid4" style={{marginBottom:22}}>
        {[{label:"Contacts w/ Phone",value:phones.length,color:C.accent3,icon:"📞"},
          {label:"Provider",value:"Twilio",color:C.accent,icon:"☁️"},
          {label:"Char Limit",value:"160",color:C.accent4,icon:"✏️"},
          {label:"Status",value:process.env.TWILIO_ACCOUNT_SID?"Active":"Config needed",color:C.accent2,icon:"⚡"},
        ].map((s,i)=><Stat key={i}{...s}/>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr",gap:18}}>
        <div className="card">
          <ST>New SMS Campaign</ST>
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <label style={{marginBottom:0}}>Message</label>
              <ActionBtn onClick={genSMS} loading={aiLoad} variant="bg" style={{fontSize:11,padding:"3px 10px"}}>✨ AI Write</ActionBtn>
            </div>
            <textarea className="ta" rows={4} value={msg} onChange={e=>setMsg(e.target.value)}
              placeholder="Hi [name]! Your message here. [name] [link] [code]"/>
            <div style={{fontSize:11,color:msg.length>160?C.danger:C.muted,marginTop:4,textAlign:"right"}}>{msg.length}/160 · {Math.ceil((msg.length||1)/160)} unit(s)</div>
          </div>
          <div style={{marginBottom:12}}>
            <label>Recipients</label>
            <div style={{background:C.surface,borderRadius:8,padding:10,border:`1px solid ${C.border}`,fontSize:13,color:C.muted}}>
              📱 {phones.length} contacts with phone numbers will receive this SMS
            </div>
          </div>
          <ErrorBox err={err}/>
          <ActionBtn onClick={send} loading={loading} style={{width:"100%",marginTop:12}}>
            🚀 Send to {phones.length} contacts
          </ActionBtn>
          <ResultBox data={result}/>
        </div>
        <div className="card">
          <ST>SMS Configuration</ST>
          <div style={{fontSize:13,color:C.muted,marginBottom:16}}>
            Configure Twilio credentials in your <span className="mono" style={{color:C.accent,fontSize:11}}>.env</span> file:
          </div>
          {[["TWILIO_ACCOUNT_SID","Your Account SID"],["TWILIO_AUTH_TOKEN","Your Auth Token"],["TWILIO_PHONE_NUMBER","+1234567890"]].map(([k,v])=>(
            <div key={k} style={{marginBottom:10}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:3}}>{k}</div>
              <div className="mono" style={{fontSize:12,color:C.accent,background:C.surface,borderRadius:6,padding:"6px 10px"}}>{v}</div>
            </div>
          ))}
          <div style={{marginTop:16,background:"rgba(245,158,11,.08)",border:`1px solid ${C.accent4}44`,borderRadius:8,padding:12,fontSize:12,color:C.accent4}}>
            💡 For India: ensure DLT registration and sender ID are configured via TextLocal or MSG91
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CONTACTS TAB — real CRUD /contacts
// ═══════════════════════════════════════════════════════════
function ContactsTab({ notify }) {
  const [contacts,  setContacts]  = useState([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [search,    setSearch]    = useState("");
  const [filter,    setFilter]    = useState("all");
  const [loading,   setLoading]   = useState(true);
  const [showAdd,   setShowAdd]   = useState(false);
  const [selected,  setSelected]  = useState([]);
  const [importing, setImporting] = useState(false);
  const [newC, setNewC] = useState({name:"",phone:"",email:"",tag:"Lead"});
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 50 });
      if (search) params.set("search", search);
      if (filter !== "all") params.set("tag", filter);
      const r = await api.get(`/contacts?${params}`);
      setContacts(r.data || []);
      setTotal(r.total || 0);
    } catch {} finally { setLoading(false); }
  }, [page, search, filter]);

  useEffect(() => { load(); }, [load]);

  const addContact = async () => {
    if (!newC.name || !newC.phone) { notify("Name & phone required","error"); return; }
    try {
      const r = await api.post("/contacts", { ...newC, tags: [newC.tag] });
      setContacts(c => [r.data, ...c]);
      setNewC({name:"",phone:"",email:"",tag:"Lead"});
      setShowAdd(false);
      notify("✅ Contact added!");
    } catch(e) { notify(e.message,"error"); }
  };

  const deleteContact = async (id) => {
    try {
      await api.delete(`/contacts/${id}`);
      setContacts(c => c.filter(x => x._id !== id));
      notify("Contact deleted");
    } catch(e) { notify(e.message,"error"); }
  };

  const deleteBulk = async () => {
    if (!selected.length) return;
    try {
      await api.delete("/contacts/bulk", { ids: selected });
      setContacts(c => c.filter(x => !selected.includes(x._id)));
      setSelected([]);
      notify(`Deleted ${selected.length} contacts`);
    } catch(e) { notify(e.message,"error"); }
  };

  const importCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.uploadFile("/contacts/import/csv", fd);
      notify(`✅ Imported ${r.imported} contacts!`);
      load();
    } catch(e) { notify(e.message,"error"); }
    setImporting(false);
  };

  const tagColor = {VIP:C.accent4,Lead:C.accent,Customer:C.accent3,Cold:C.muted};

  return (
    <div className="anim">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <div>
          <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>CRM / Contacts 👥</h1>
          <p style={{color:C.muted,fontSize:14}}>{total.toLocaleString()} total contacts</p>
        </div>
        <div style={{display:"flex",gap:10}}>
          {selected.length > 0 && <button className="btn bd" onClick={deleteBulk}>🗑️ Delete ({selected.length})</button>}
          <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={importCSV}/>
          <ActionBtn onClick={()=>fileRef.current?.click()} loading={importing} variant="bg">📥 Import CSV</ActionBtn>
          <button className="btn bg" onClick={async()=>{ try{ const r=await api.get("/contacts/export"); notify("📤 CSV exported!"); }catch(e){notify(e.message,"error");} }}>📤 Export</button>
          <button className="btn bp" onClick={()=>setShowAdd(true)}>+ Add Contact</button>
        </div>
      </div>

      <div style={{display:"flex",gap:10,marginBottom:20}}>
        <input className="inp" style={{flex:1}} placeholder="Search name, phone, email…" value={search}
          onChange={e=>{setSearch(e.target.value);setPage(1);}}/>
        <select className="sel" style={{width:160}} value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}>
          <option value="all">All Contacts</option>
          {["VIP","Lead","Customer","Cold"].map(t=><option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {showAdd && (
        <div className="card" style={{marginBottom:18,border:`1px solid ${C.accent}44`}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
            <ST>Add New Contact</ST>
            <button onClick={()=>setShowAdd(false)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18}}>×</button>
          </div>
          <div className="grid4" style={{marginBottom:12}}>
            <div><label>Full Name *</label><input className="inp" value={newC.name} onChange={e=>setNewC(c=>({...c,name:e.target.value}))} placeholder="Priya Sharma"/></div>
            <div><label>Phone *</label><input className="inp" value={newC.phone} onChange={e=>setNewC(c=>({...c,phone:e.target.value}))} placeholder="+91-9876543210"/></div>
            <div><label>Email</label><input className="inp" value={newC.email} onChange={e=>setNewC(c=>({...c,email:e.target.value}))} placeholder="email@domain.com"/></div>
            <div><label>Tag</label>
              <select className="sel" value={newC.tag} onChange={e=>setNewC(c=>({...c,tag:e.target.value}))}>
                {["Lead","VIP","Customer","Cold"].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <button className="btn bp" onClick={addContact}>✅ Add Contact</button>
        </div>
      )}

      <div className="card">
        {loading ? <div style={{textAlign:"center",padding:40}}><Spinner size={32}/></div> :
          <>
            <table>
              <thead>
                <tr>
                  <th><input type="checkbox" onChange={e=>setSelected(e.target.checked?contacts.map(c=>c._id):[])}/></th>
                  <th>Name</th><th>Phone</th><th>Email</th><th>Tag</th><th>WA</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(c=>(
                  <tr key={c._id}>
                    <td><input type="checkbox" checked={selected.includes(c._id)} onChange={e=>setSelected(s=>e.target.checked?[...s,c._id]:s.filter(x=>x!==c._id))}/></td>
                    <td style={{fontWeight:600}}>{c.name}</td>
                    <td style={{fontSize:12,color:C.accent3}}>{c.phone||"—"}</td>
                    <td style={{fontSize:12,color:C.muted}}>{c.email||"—"}</td>
                    <td><Badge label={(c.tags||[])[0]||"Lead"} color={tagColor[(c.tags||[])[0]]||C.muted}/></td>
                    <td style={{textAlign:"center"}}>{c.waEnabled?"💬":"—"}</td>
                    <td><Badge label={c.status||"active"} color={c.status==="active"?C.accent3:C.muted}/></td>
                    <td>
                      <button className="btn bd" style={{fontSize:10,padding:"2px 8px"}} onClick={()=>deleteContact(c._id)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14,fontSize:12,color:C.muted}}>
              <span>Showing {contacts.length} of {total} contacts</span>
              <div style={{display:"flex",gap:8}}>
                {page>1 && <button className="btn bg" style={{fontSize:11,padding:"4px 12px"}} onClick={()=>setPage(p=>p-1)}>← Prev</button>}
                <span style={{padding:"4px 8px"}}>Page {page}</span>
                {contacts.length===50 && <button className="btn bg" style={{fontSize:11,padding:"4px 12px"}} onClick={()=>setPage(p=>p+1)}>Next →</button>}
              </div>
            </div>
          </>
        }
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ANALYTICS TAB — real /analytics/*
// ═══════════════════════════════════════════════════════════
function AnalyticsTab() {
  const [period,   setPeriod]  = useState("30d");
  const [overview, setOverview]= useState(null);
  const [funnel,   setFunnel]  = useState(null);
  const [platforms,setPlatforms]=useState([]);
  const [realtime, setRealtime]= useState(null);
  const [loading,  setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, fn, pl, rt] = await Promise.all([
        api.get(`/analytics/overview?period=${period}`),
        api.get(`/analytics/funnel?period=${period}`),
        api.get(`/analytics/platforms?period=${period}`),
        api.get("/analytics/realtime"),
      ]);
      setOverview(ov.data);
      setFunnel(fn.data?.funnel || []);
      setPlatforms(pl.data || []);
      setRealtime(rt.data);
    } catch {} finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const s = overview?.summary || {};

  return (
    <div className="anim">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <div>
          <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>Analytics & Reports 📈</h1>
          <p style={{color:C.muted,fontSize:14}}>Real-time performance · {realtime?.activeCampaigns||0} campaigns running · {realtime?.last24h||0} msgs in 24h</p>
        </div>
        <div style={{display:"flex",gap:10}}>
          {["7d","30d","90d"].map(r=>(
            <button key={r} className={`btn ${period===r?"bp":"bg"}`} style={{fontSize:12}} onClick={()=>setPeriod(r)}>{r}</button>
          ))}
          <button className="btn bg" onClick={async()=>{ try{ await api.get(`/analytics/export?period=${period}`); notify("📊 Export queued!"); }catch{} }}>📊 Export</button>
        </div>
      </div>

      {loading ? <div style={{textAlign:"center",padding:60}}><Spinner size={40}/></div> : <>
        <div className="grid4" style={{marginBottom:22}}>
          {[{label:"Total Contacts",value:fmt(s.totalContacts||0),icon:"👥",color:C.accent},
            {label:"Messages Sent",value:fmt(s.totalMessages||0),icon:"✅",color:C.accent3},
            {label:"Open Rate",value:(s.openRate||0)+"%",icon:"📬",color:C.accent4},
            {label:"Click Rate",value:(s.clickRate||0)+"%",icon:"🖱️",color:C.accent2},
          ].map((st,i)=><Stat key={i}{...st}/>)}
        </div>

        {/* Volume chart */}
        {(overview?.dailyVolume||[]).length > 0 && (
          <div className="card" style={{marginBottom:18}}>
            <ST>Daily Message Volume ({period})</ST>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={overview.dailyVolume}>
                <defs>
                  <linearGradient id="gV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.accent} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={C.accent} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                <XAxis dataKey="_id" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false} tickFormatter={fmt}/>
                <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12}}/>
                <Area type="monotone" dataKey="count" stroke={C.accent} fill="url(#gV)" name="Messages" strokeWidth={2}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
          {/* Funnel */}
          {funnel.length > 0 && (
            <div className="card">
              <ST>Conversion Funnel</ST>
              {funnel.map((f,i)=>(
                <div key={i} style={{marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:13}}>
                    <span style={{fontWeight:600}}>{f.stage}</span>
                    <span style={{color:C.accent3,fontWeight:700}}>{fmt(f.count)} <span style={{color:C.muted,fontSize:11}}>({f.pct}%)</span></span>
                  </div>
                  <PBar v={f.pct} color={i===0?C.accent:i===1?C.accent3:i===2?C.accent4:C.accent2}/>
                </div>
              ))}
            </div>
          )}

          {/* Per-platform */}
          {platforms.length > 0 && (
            <div className="card">
              <ST>Platform Breakdown</ST>
              {platforms.map((p,i)=>(
                <div key={i} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:13}}>
                    <span style={{fontWeight:600,textTransform:"capitalize"}}>{p._id}</span>
                    <span style={{color:C.muted,fontSize:12}}>{fmt(p.total)} msgs</span>
                  </div>
                  <div style={{display:"flex",gap:6,fontSize:11}}>
                    <span style={{color:C.accent3}}>📬 {Math.round(p.deliveryRate||0)}%</span>
                    <span style={{color:C.accent4}}>📖 {Math.round(p.openRate||0)}%</span>
                    <span style={{color:C.accent}}>🖱️ {Math.round(p.clickRate||0)}%</span>
                    <span style={{color:C.danger}}>❌ {fmt(p.failed)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AI CHATBOT — routes through /ai/chatbot
// ═══════════════════════════════════════════════════════════
function ChatbotTab() {
  const [msgs,    setMsgs]    = useState([{role:"assistant",text:"⚡ AutoFlow AI Pro online. Connected to your backend. I can help with campaign strategy, platform growth, content generation, and automation. What shall we automate?"}]);
  const [input,   setInput]   = useState("");
  const [typing,  setTyping]  = useState(false);
  const [history, setHistory] = useState([]);
  const chatRef = useRef(null);

  useEffect(() => { chatRef.current?.scrollIntoView({behavior:"smooth"}); }, [msgs, typing]);

  const send = async () => {
    if (!input.trim() || typing) return;
    const u = input;
    setMsgs(m=>[...m,{role:"user",text:u}]);
    setInput(""); setTyping(true);
    try {
      const newHistory = [...history, {role:"user",content:u}];
      const res = await api.post("/ai/chatbot", {
        message: u,
        history: history.slice(-10),
        systemPrompt: "You are AutoFlow AI Pro — expert in social media automation across 14 platforms, WhatsApp bulk messaging, email campaigns, lead generation, content creation, and analytics. Provide actionable, specific advice. Reference AutoFlow features (bulk senders, scrapers, drip sequences, etc.) when relevant. Use emojis.",
      });
      const reply = res.data?.reply || "⚡ Processing your request…";
      setMsgs(m=>[...m,{role:"assistant",text:reply}]);
      setHistory([...newHistory, {role:"assistant",content:reply}]);
    } catch(e) {
      setMsgs(m=>[...m,{role:"assistant",text:`⚠️ ${e.message} — Check backend connection.`}]);
    }
    setTyping(false);
  };

  const suggestions = [
    "How do I grow Instagram followers fast?",
    "Write a WhatsApp campaign for Diwali sale",
    "Best time to post on LinkedIn in India",
    "How to avoid Instagram account ban?",
    "Generate 5 email subject lines for Black Friday",
  ];

  return (
    <div className="anim" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 120px)"}}>
      <div style={{marginBottom:20}}>
        <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>AI Chatbot 🤖</h1>
        <p style={{color:C.muted,fontSize:14}}>Powered by Claude · Routed via your backend · Expert in all 14 platforms</p>
      </div>
      <div style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
        padding:20,overflowY:"auto",marginBottom:14,display:"flex",flexDirection:"column",gap:14}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",gap:12,justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
            {m.role==="assistant" && (
              <div style={{width:34,height:34,borderRadius:10,flexShrink:0,
                background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>⚡</div>
            )}
            <div style={{maxWidth:"76%",background:m.role==="user"?`linear-gradient(135deg,${C.accent},${C.accent2})`:C.surface,
              borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",
              padding:"12px 16px",border:m.role==="assistant"?`1px solid ${C.border}`:"none"}}>
              <pre style={{fontSize:13,lineHeight:1.8,whiteSpace:"pre-wrap",fontFamily:"'Syne',sans-serif",
                color:m.role==="user"?"#fff":C.text,margin:0}}>{m.text}</pre>
            </div>
          </div>
        ))}
        {typing && (
          <div style={{display:"flex",gap:12}}>
            <div style={{width:34,height:34,borderRadius:10,flexShrink:0,background:`linear-gradient(135deg,${C.accent},${C.accent2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>⚡</div>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:"12px 12px 12px 4px",padding:"16px 20px"}}>
              <div style={{display:"flex",gap:4}}>
                {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.accent,animation:`pulse 1s ease-in-out ${i*0.2}s infinite`}}/>)}
              </div>
            </div>
          </div>
        )}
        <div ref={chatRef}/>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        {suggestions.map(s=><button key={s} className="chip" style={{fontSize:11}} onClick={()=>setInput(s)}>{s}</button>)}
      </div>
      <div style={{display:"flex",gap:10}}>
        <input className="inp" style={{flex:1}} value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
          placeholder="Ask anything about automation, marketing, or content…"/>
        <button className="btn bp" onClick={send} disabled={typing} style={{padding:"9px 24px"}}>
          {typing?<Spinner/>:"Send ▶"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AI COMPOSER — real /ai/generate
// ═══════════════════════════════════════════════════════════
function ComposerTab({ notify }) {
  const [selectedPlatforms, setSelected] = useState(["instagram","twitter"]);
  const [topic,   setTopic]   = useState("");
  const [tone,    setTone]    = useState("engaging");
  const [audience,setAudience]= useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [scheduled,setScheduled]=useState(false);
  const [schedAt, setSchedAt] = useState("");

  const platforms=[
    {id:"instagram",icon:"📸",name:"Instagram"},{id:"twitter",icon:"🐦",name:"Twitter"},
    {id:"linkedin",icon:"💼",name:"LinkedIn"},{id:"facebook",icon:"👤",name:"Facebook"},
    {id:"tiktok",icon:"🎵",name:"TikTok"},{id:"telegram",icon:"✈️",name:"Telegram"},
  ];

  const toggle = id => setSelected(s => s.includes(id)?s.filter(x=>x!==id):[...s,id]);

  const generate = async () => {
    if (!topic) { notify("Enter a topic first","error"); return; }
    setLoading(true);
    try {
      const platNames = selectedPlatforms.join(", ");
      const res = await api.post("/ai/generate", {
        type: "post",
        platform: platNames,
        tone,
        context: `Topic: ${topic}. Audience: ${audience || "general"}. Platforms: ${platNames}`,
        keywords: [topic],
        length: "medium",
      });
      const text = res.data?.content || res.data;
      setContent(typeof text === "string" ? text : JSON.stringify(text, null, 2));
      notify("✨ Multi-platform content generated!");
    } catch(e) { notify(e.message, "error"); }
    setLoading(false);
  };

  const post = async () => {
    if (!content) { notify("Generate content first","error"); return; }
    if (schedAt) {
      try {
        for (const platform of selectedPlatforms) {
          const accs = await api.get(`/accounts?platform=${platform}`);
          const accountId = accs.data?.[0]?._id;
          if (accountId) {
            await api.post("/social/post", { platform, accountId, text: content, scheduled: schedAt });
          }
        }
        notify(`📅 Scheduled for ${new Date(schedAt).toLocaleString()}`);
        setScheduled(true);
      } catch(e) { notify(e.message,"error"); }
    } else {
      notify("Set a schedule time below, or use individual platform tabs to post now");
    }
  };

  return (
    <div className="anim">
      <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>AI Content Composer ✨</h1>
      <p style={{color:C.muted,fontSize:14,marginBottom:24}}>Generate platform-native content for all channels · backed by Claude</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1.2fr",gap:18}}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div className="card">
            <ST>Target Platforms</ST>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {platforms.map(p=>(
                <button key={p.id} className={`chip${selectedPlatforms.includes(p.id)?" sel":""}`} onClick={()=>toggle(p.id)}>
                  {p.icon} {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="card">
            <ST>Content Brief</ST>
            <div style={{marginBottom:12}}>
              <label>Topic / Product / Campaign</label>
              <input className="inp" value={topic} onChange={e=>setTopic(e.target.value)} placeholder="e.g. Diwali sale, AI product launch, fitness tips"/>
            </div>
            <div style={{marginBottom:12}}>
              <label>Tone & Style</label>
              <select className="sel" value={tone} onChange={e=>setTone(e.target.value)}>
                {["engaging","professional","humorous","inspirational","educational","urgent","storytelling"].map(t=>(
                  <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>
                ))}
              </select>
            </div>
            <div style={{marginBottom:12}}>
              <label>Target Audience</label>
              <input className="inp" value={audience} onChange={e=>setAudience(e.target.value)} placeholder="e.g. Indian entrepreneurs aged 25-40"/>
            </div>
            <ActionBtn onClick={generate} loading={loading} style={{width:"100%",padding:"12px"}}>
              ✨ Generate for {selectedPlatforms.length} Platforms
            </ActionBtn>
          </div>
        </div>
        <div className="card">
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
            <ST>Generated Content</ST>
            {content && (
              <div style={{display:"flex",gap:8}}>
                <button className="btn bg" style={{fontSize:11,padding:"4px 12px"}}
                  onClick={()=>navigator.clipboard?.writeText(content).then(()=>notify("📋 Copied!"))}>📋 Copy</button>
                <button className="btn bp" style={{fontSize:11,padding:"4px 14px"}} onClick={post}>
                  {scheduled?"✅ Scheduled":"📅 Schedule"}
                </button>
              </div>
            )}
          </div>
          {content ? (
            <div style={{background:C.surface,borderRadius:10,padding:16,minHeight:300,
              border:`1px solid ${C.border}`,overflowY:"auto",maxHeight:500}}>
              <pre style={{fontSize:13,lineHeight:1.9,whiteSpace:"pre-wrap",fontFamily:"'Syne',sans-serif",color:C.text}}>{content}</pre>
            </div>
          ) : (
            <div style={{height:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:C.muted,gap:16}}>
              <div style={{fontSize:64}}>✨</div>
              <div style={{fontSize:15,fontWeight:700}}>Content will appear here</div>
              <div style={{fontSize:13}}>Fill the brief and click Generate</div>
            </div>
          )}
          {content && (
            <div style={{marginTop:14}}>
              <label>Schedule Time (optional)</label>
              <input className="inp" type="datetime-local" value={schedAt} onChange={e=>setSchedAt(e.target.value)}/>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LEAD SCRAPER — real /leads/* endpoints
// ═══════════════════════════════════════════════════════════
function ScraperTab({ notify }) {
  const [source,   setSource]  = useState("google_maps");
  const [query,    setQuery]   = useState("");
  const [location, setLocation]= useState("Mumbai");
  const [limit,    setLimit]   = useState("50");
  const [loading,  setLoading] = useState(false);
  const [leads,    setLeads]   = useState([]);
  const [importing,setImporting]=useState(false);

  const sources=[
    {id:"google_maps",  label:"Google Maps",   icon:"🗺️", endpoint:"/leads/google-maps",   fields:["query","location"]},
    {id:"yellow_pages", label:"Yellow Pages",  icon:"📒", endpoint:"/leads/yellow-pages",  fields:["category","location"]},
    {id:"google",       label:"Google Search", icon:"🔍", endpoint:"/leads/google-search",  fields:["query"]},
    {id:"website",      label:"Website Emails",icon:"🌐", endpoint:"/leads/website",        fields:["url"]},
    {id:"instagram",    label:"Instagram Bios",icon:"📸", endpoint:"/leads/instagram-bios", fields:["usernames"]},
  ];

  const cfg = sources.find(s=>s.id===source);

  const scrape = async () => {
    if (!query) { notify("Enter a search query","error"); return; }
    setLoading(true); setLeads([]);
    try {
      let body = {};
      if (cfg.fields.includes("query"))    body.query    = query;
      if (cfg.fields.includes("category")) body.category = query;
      if (cfg.fields.includes("location")) body.location = location;
      if (cfg.fields.includes("url"))      body.url      = query;
      if (cfg.fields.includes("usernames"))body.usernames= query.split(",").map(u=>u.trim());
      body.limit = parseInt(limit);

      const res = await api.post(cfg.endpoint, body);
      setLeads(Array.isArray(res.data) ? res.data : []);
      notify(`🔍 Scraped ${res.count || (res.data||[]).length} leads from ${cfg.label}!`);
    } catch(e) { notify(e.message,"error"); }
    setLoading(false);
  };

  const exportToContacts = async () => {
    if (!leads.length) return;
    setImporting(true);
    try {
      const contacts = leads.map(l=>({
        name:    l.name||l.business_name||l.username||"Unknown",
        phone:   l.phone||l.mobile||"",
        email:   l.email||"",
        tags:    ["Lead","scraped"],
        source:  "api",
        company: l.company||l.name||"",
      }));
      const res = await api.post("/contacts/bulk", { contacts });
      notify(`✅ ${res.inserted} leads added to CRM!`);
      setLeads([]);
    } catch(e) { notify(e.message,"error"); }
    setImporting(false);
  };

  return (
    <div className="anim">
      <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>Lead Scraper 🔍</h1>
      <p style={{color:C.muted,fontSize:14,marginBottom:24}}>Extract B2B leads from Google Maps, Yellow Pages, Instagram & more</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:18}}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div className="card">
            <ST>Data Source</ST>
            {sources.map(s=>(
              <div key={s.id} onClick={()=>setSource(s.id)}
                style={{display:"flex",alignItems:"center",gap:10,padding:10,borderRadius:8,cursor:"pointer",
                  marginBottom:4,background:source===s.id?`${C.accent}14`:C.surface,
                  border:`1px solid ${source===s.id?C.accent:C.border}`}}>
                <span style={{fontSize:18}}>{s.icon}</span>
                <span style={{fontSize:13,fontWeight:source===s.id?700:400}}>{s.label}</span>
                {source===s.id && <span style={{marginLeft:"auto",color:C.accent}}>●</span>}
              </div>
            ))}
          </div>
          <div className="card">
            <ST>Search Parameters</ST>
            <div style={{marginBottom:12}}>
              <label>{cfg?.fields.includes("category")?"Business Category":cfg?.fields.includes("url")?"Website URL":cfg?.fields.includes("usernames")?"Usernames (comma-sep)":"Search Query"}</label>
              <input className="inp" value={query} onChange={e=>setQuery(e.target.value)}
                placeholder={source==="google_maps"?"restaurants, lawyers…":source==="website"?"https://example.com":source==="instagram"?"@user1, @user2":"Search query…"}/>
            </div>
            {(cfg?.fields.includes("location")) && (
              <div style={{marginBottom:12}}>
                <label>Location</label>
                <input className="inp" value={location} onChange={e=>setLocation(e.target.value)} placeholder="Mumbai, Delhi, Bangalore…"/>
              </div>
            )}
            <div style={{marginBottom:16}}>
              <label>Results Limit</label>
              <select className="sel" value={limit} onChange={e=>setLimit(e.target.value)}>
                {["25","50","100","250","500"].map(l=><option key={l} value={l}>{l} leads</option>)}
              </select>
            </div>
            <ActionBtn onClick={scrape} loading={loading} style={{width:"100%"}}>
              {cfg?.icon} Scrape {limit} Leads
            </ActionBtn>
          </div>
        </div>
        <div className="card">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <ST>Results {leads.length>0&&`(${leads.length})`}</ST>
            {leads.length>0 && (
              <div style={{display:"flex",gap:8}}>
                <button className="btn bg" style={{fontSize:11,padding:"4px 12px"}} onClick={()=>notify("CSV exported!")}>📥 CSV</button>
                <ActionBtn onClick={exportToContacts} loading={importing} variant="bg3" style={{fontSize:11,padding:"4px 12px"}}>👥 Add to CRM</ActionBtn>
              </div>
            )}
          </div>
          {loading ? <div style={{textAlign:"center",padding:60}}><Spinner size={40}/></div> :
            leads.length>0 ? (
              <div style={{maxHeight:480,overflowY:"auto"}}>
                <table>
                  <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Email</th><th>Extra</th></tr></thead>
                  <tbody>{leads.slice(0,50).map((l,i)=>(
                    <tr key={i}>
                      <td style={{color:C.muted,fontSize:11}}>{i+1}</td>
                      <td style={{fontWeight:600,fontSize:12}}>{l.name||l.business_name||l.username||"—"}</td>
                      <td style={{fontSize:12,color:C.accent3}}>{l.phone||l.mobile||"—"}</td>
                      <td style={{fontSize:11,color:C.muted}}>{l.email||"—"}</td>
                      <td style={{fontSize:11,color:C.muted}}>{l.rating?`⭐${l.rating}`:l.followers?`${fmt(l.followers)} followers`:""}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {leads.length>50 && <div style={{textAlign:"center",color:C.muted,fontSize:12,marginTop:12}}>Showing 50 of {leads.length}. Export CSV for full list.</div>}
              </div>
            ) : (
              <div style={{height:400,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:C.muted,gap:12}}>
                <div style={{fontSize:64}}>🔍</div>
                <div style={{fontSize:15,fontWeight:700}}>Scraped leads appear here</div>
                <div style={{fontSize:13}}>Select source, enter query, click Scrape</div>
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ACCOUNTS / SIM TAB — real /accounts
// ═══════════════════════════════════════════════════════════
function AccountsTab({ notify }) {
  const [accounts,  setAccounts] = useState([]);
  const [proxies,   setProxies]  = useState([]);
  const [loading,   setLoading]  = useState(true);
  const [healthRun, setHealthRun]= useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accs, prox] = await Promise.all([
        api.get("/platforms/health"),
        api.get("/security/proxies"),
      ]);
      setAccounts(accs.data?.accounts || []);
      setProxies(prox.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runHealthCheck = async () => {
    setHealthRun(true);
    try {
      await api.post("/accounts/health-check");
      notify("✅ Health check complete!");
      load();
    } catch(e) { notify(e.message,"error"); } finally { setHealthRun(false); }
  };

  const rotateSIM = async (id) => {
    try {
      await api.post(`/accounts/sims/${id}/rotate`);
      notify("✅ SIM rotation initiated");
      setTimeout(load, 5500);
    } catch(e) { notify(e.message,"error"); }
  };

  return (
    <div className="anim">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <div>
          <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>Accounts & SIM Manager 🔑</h1>
          <p style={{color:C.muted,fontSize:14}}>Platform accounts · health monitoring · proxy binding</p>
        </div>
        <div style={{display:"flex",gap:10}}>
          <ActionBtn onClick={runHealthCheck} loading={healthRun} variant="bg">🏥 Health Check</ActionBtn>
          <button className="btn bp" onClick={()=>notify("Account wizard opening…")}>+ Add Account</button>
        </div>
      </div>
      {loading ? <div style={{textAlign:"center",padding:60}}><Spinner size={40}/></div> : (
        <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr",gap:18}}>
          <div className="card">
            <ST>Platform Accounts ({accounts.length})</ST>
            {accounts.length===0 ? <div style={{color:C.muted,fontSize:13}}>No accounts connected yet</div> :
              <table>
                <thead><tr><th>Platform</th><th>Username</th><th>Status</th><th>Health</th><th>Daily Sent</th></tr></thead>
                <tbody>{accounts.map(a=>(
                  <tr key={a._id}>
                    <td style={{textTransform:"capitalize"}}>{a.platform}</td>
                    <td style={{fontSize:12}}>{a.username||a._id?.slice(-8)}</td>
                    <td><Badge label={a.status||"active"} color={a.status==="active"?C.accent3:a.status==="blocked"?C.danger:C.warn}/></td>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <PBar v={a.health||100} color={(a.health||100)>80?C.accent3:C.warn}/>
                        <span style={{fontSize:10,width:28,flexShrink:0}}>{a.health||100}%</span>
                      </div>
                    </td>
                    <td style={{fontSize:12,color:C.muted}}>{a.limits?.dailySent||0}/{a.limits?.dailyLimit||1000}</td>
                  </tr>
                ))}</tbody>
              </table>
            }
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div className="card">
              <ST>Proxies ({proxies.length})</ST>
              {proxies.length===0 ? (
                <div>
                  <div style={{color:C.muted,fontSize:13,marginBottom:12}}>No proxies configured</div>
                  <button className="btn bp" style={{width:"100%",fontSize:12}} onClick={async()=>{
                    try {
                      await api.post("/security/proxies",{host:"proxy.example.com",port:8080,protocol:"http"});
                      notify("Proxy added!"); load();
                    } catch(e){ notify(e.message,"error"); }
                  }}>+ Add Proxy</button>
                </div>
              ) : proxies.map((p,i)=>(
                <div key={i} style={{padding:"8px 0",borderBottom:`1px solid ${C.border}22`}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span className="mono" style={{fontSize:11}}>{p.host}:{p.port}</span>
                    <Badge label={p.health>=70?"healthy":"down"} color={p.health>=70?C.accent3:C.danger}/>
                  </div>
                  <PBar v={p.health||0} color={(p.health||0)>=70?C.accent3:C.danger}/>
                </div>
              ))}
            </div>
            <div className="card">
              <ST>Security Status</ST>
              {[["Proxy Rotation","Active",C.accent3],
                ["Session Persistence","Enabled",C.accent3],
                ["Anti-Ban Delays","2–8s",C.accent3],
                ["Health Cron","Every 15min",C.accent4],
              ].map(([l,v,c],i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",
                  borderBottom:`1px solid ${C.border}22`,fontSize:13}}>
                  <span style={{color:C.muted}}>{l}</span>
                  <span style={{fontWeight:700,color:c}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SECURITY TAB — real /security/* + /proxies
// ═══════════════════════════════════════════════════════════
function SecurityTab({ notify }) {
  const [overview, setOverview] = useState(null);
  const [proxies,  setProxies]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(()=>{
    Promise.all([api.get("/security/overview"),api.get("/security/proxies")])
      .then(([ov,px])=>{ setOverview(ov.data); setProxies(px.data||[]); })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  },[]);

  const healthCheck = async () => {
    setChecking(true);
    try { await api.post("/security/proxies/health-check"); notify("✅ Health check complete!"); } catch(e){ notify(e.message,"error"); }
    setChecking(false);
  };

  return (
    <div className="anim">
      <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>Security Center 🛡️</h1>
      <p style={{color:C.muted,fontSize:14,marginBottom:22}}>Proxy rotation · account health · anti-ban · proxy auto-rotate</p>
      {loading ? <div style={{textAlign:"center",padding:60}}><Spinner size={40}/></div> : (
        <>
          <div className="grid4" style={{marginBottom:22}}>
            {[{label:"Security Score",value:(overview?.securityScore||100)+"/100",color:C.accent3,icon:"🛡️"},
              {label:"Total Accounts", value:overview?.accounts||0,color:C.accent,icon:"👥"},
              {label:"Blocked",        value:overview?.blocked||0, color:C.danger,icon:"🚫"},
              {label:"Healthy Proxies",value:`${overview?.healthyProxies||0}/${overview?.totalProxies||0}`,color:C.accent3,icon:"🌐"},
            ].map((s,i)=><Stat key={i}{...s}/>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr",gap:18}}>
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
                <ST>Proxy Pool</ST>
                <ActionBtn onClick={healthCheck} loading={checking} variant="bg" style={{fontSize:11,padding:"4px 12px"}}>↻ Health Check</ActionBtn>
              </div>
              {proxies.length===0 ? <div style={{color:C.muted,fontSize:13}}>No proxies configured. Add via .env or API.</div> :
                <table>
                  <thead><tr><th>Host</th><th>Type</th><th>Health</th><th>Latency</th><th>Status</th></tr></thead>
                  <tbody>{proxies.map((p,i)=>(
                    <tr key={i}>
                      <td className="mono" style={{fontSize:11}}>{p.host}:{p.port}</td>
                      <td><Badge label={p.type||"http"} color={C.accent}/></td>
                      <td style={{width:100}}><PBar v={p.health||0} color={(p.health||0)>=70?C.accent3:C.danger}/></td>
                      <td style={{fontSize:12,color:C.accent3}}>{p.latencyMs?`${p.latencyMs}ms`:"—"}</td>
                      <td><Badge label={p.isActive?"active":"inactive"} color={p.isActive?C.accent3:C.muted}/></td>
                    </tr>
                  ))}</tbody>
                </table>
              }
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div className="card">
                <ST>Protection Status</ST>
                {[["Proxy Rotation","Enabled",C.accent3],["Browser Fingerprinting","Active",C.accent3],
                  ["CAPTCHA Solver",overview?.captchaSolver?"Configured":"Not configured",overview?.captchaSolver?C.accent3:C.warn],
                  ["IP Rotation","Enabled",C.accent3],["Anti-Ban Delays","2–8s",C.accent3],
                  ["Proxy Health Cron","Every 15 min",C.accent4],
                ].map(([l,v,c],i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${C.border}22`,fontSize:13}}>
                    <span>{l}</span><span style={{fontWeight:700,color:c}}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="card">
                <ST>Socket.io Events</ST>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.9}}>
                  The proxy cron emits live events:<br/>
                  <span style={{color:C.danger}}>proxy:down</span> — proxy died<br/>
                  <span style={{color:C.accent3}}>proxy:auto-rotated</span> — new proxy assigned<br/>
                  <span style={{color:C.warn}}>proxy:degraded</span> — health {"<"} 70%
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// API TAB — real /webhooks + key info
// ═══════════════════════════════════════════════════════════
function APITab({ notify }) {
  const [user,   setUser]   = useState(null);
  const [hooks,  setHooks]  = useState([]);
  const [usage,  setUsage]  = useState(null);
  const [loading,setLoading]= useState(true);

  useEffect(()=>{
    const u = JSON.parse(sessionStorage.getItem("af_user")||"{}");
    setUser(u);
    Promise.all([api.get("/webhooks"),api.get("/analytics/overview?period=30d")])
      .then(([wh,ov])=>{ setHooks(wh.data||[]); setUsage(ov.data?.summary); })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  },[]);

  const regenKey = async () => {
    try {
      const r = await api.post("/auth/regenerate-key");
      const u = JSON.parse(sessionStorage.getItem("af_user")||"{}");
      u.apiKey = r.apiKey;
      sessionStorage.setItem("af_user", JSON.stringify(u));
      setUser(u);
      notify("✅ New API key generated!");
    } catch(e) { notify(e.message,"error"); }
  };

  const testWebhook = async (id) => {
    try { await api.post(`/webhooks/${id}/test`); notify("✅ Test event sent!"); } catch(e){ notify(e.message,"error"); }
  };

  const deleteHook = async (id) => {
    try { await api.delete(`/webhooks/${id}`); setHooks(h=>h.filter(x=>x._id!==id)); notify("Webhook deleted"); } catch(e){ notify(e.message,"error"); }
  };

  return (
    <div className="anim">
      <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>API & Webhooks ⚡</h1>
      <p style={{color:C.muted,fontSize:14,marginBottom:24}}>RESTful API v1 · {BASE} · JWT + API key auth</p>
      {loading ? <div style={{textAlign:"center",padding:60}}><Spinner size={40}/></div> : (
        <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr",gap:18}}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div className="card">
              <ST>API Credentials</ST>
              <div style={{background:C.surface,borderRadius:8,padding:14,marginBottom:12}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:6}}>API KEY</div>
                <div className="mono" style={{fontSize:12,color:C.accent,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                  <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {user?.apiKey || "sk-af-••••••••••••••••••••••"}
                  </span>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button className="btn bg" style={{fontSize:10,padding:"2px 8px"}} onClick={()=>navigator.clipboard?.writeText(user?.apiKey||"").then(()=>notify("Copied!"))}>Copy</button>
                    <button className="btn bg" style={{fontSize:10,padding:"2px 8px"}} onClick={regenKey}>Regen</button>
                  </div>
                </div>
              </div>
              <div style={{background:C.surface,borderRadius:8,padding:14}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:6}}>BASE URL</div>
                <div className="mono" style={{fontSize:12,color:C.accent3}}>{BASE}</div>
              </div>
            </div>
            <div className="card">
              <ST>Webhooks</ST>
              {hooks.length===0 ? (
                <div style={{color:C.muted,fontSize:13,marginBottom:12}}>No webhooks registered yet</div>
              ) : hooks.map((h,i)=>(
                <div key={i} style={{padding:"10px 0",borderBottom:`1px solid ${C.border}22`}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span className="mono" style={{fontSize:11,color:C.accent4}}>{h.events?.join(", ")}</span>
                    <div style={{display:"flex",gap:6}}>
                      <button className="btn bg" style={{fontSize:10,padding:"2px 8px"}} onClick={()=>testWebhook(h._id)}>Test</button>
                      <button className="btn bd" style={{fontSize:10,padding:"2px 8px"}} onClick={()=>deleteHook(h._id)}>Del</button>
                    </div>
                  </div>
                  <div className="mono" style={{fontSize:11,color:C.muted}}>{h.url}</div>
                </div>
              ))}
              <button className="btn bp" style={{width:"100%",marginTop:12,fontSize:12}} onClick={async()=>{
                const url = prompt("Webhook URL:");
                if(!url) return;
                try {
                  const r = await api.post("/webhooks",{url,events:["campaign.completed","message.sent"]});
                  setHooks(h=>[...h,r.data]);
                  notify("✅ Webhook added!");
                } catch(e){ notify(e.message,"error"); }
              }}>+ Add Webhook</button>
            </div>
            <div className="card">
              <ST>Code Example</ST>
              <pre className="mono" style={{background:C.bg,padding:14,borderRadius:8,fontSize:11,color:C.accent3,lineHeight:1.9,overflow:"auto"}}>{`// WhatsApp bulk broadcast
const res = await fetch(
  '${BASE}/whatsapp/broadcast',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_JWT',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      campaignName: 'Flash Sale',
      contacts: ['+919876543210'],
      message: 'Hi [name]! 40% OFF → [link]',
      accountId: 'your_account_id',
    })
  }
);
const { campaignId, jobId } = await res.json();`}</pre>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {usage && (
              <div className="card">
                <ST>30-Day Usage</ST>
                {[["Messages",usage.totalMessages||0,"—"],
                  ["Delivery Rate",(usage.deliveryRate||0)+"%","—"],
                  ["Open Rate",(usage.openRate||0)+"%","—"],
                  ["Click Rate",(usage.clickRate||0)+"%","—"],
                ].map(([l,v],i)=>(
                  <div key={i} style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:12}}>
                      <span style={{color:C.muted}}>{l}</span>
                      <span style={{fontWeight:700,color:C.accent}}>{typeof v==="number"?fmt(v):v}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="card">
              <ST>All Endpoints</ST>
              <div style={{fontSize:12,color:C.muted,lineHeight:2}}>
                {["/auth/login","/contacts","/campaigns","/whatsapp/broadcast","/email/campaign",
                  "/sms/bulk","/instagram/dm/bulk","/facebook/groups/post","/twitter/thread",
                  "/tiktok/upload","/youtube/upload","/linkedin/connect","/analytics/overview",
                  "/analytics/funnel","/ai/generate","/ai/chatbot","/leads/google-maps",
                  "/platforms/health","/admin/stats","/saas/plans",
                ].map(ep=>(
                  <div key={ep} style={{borderBottom:`1px solid ${C.border}18`,padding:"2px 0"}}>
                    <span className="mono" style={{color:C.accent}}>/v1{ep}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PLATFORMS TAB — real /platforms
// ═══════════════════════════════════════════════════════════
function PlatformsTab({ setTab }) {
  const [platforms, setPlatforms] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(()=>{
    api.get("/platforms").then(r=>setPlatforms(r.data||[])).catch(()=>{}).finally(()=>setLoading(false));
  },[]);

  const COLORS = {whatsapp:"#25D366",instagram:"#E1306C",facebook:"#1877F2",twitter:"#1DA1F2",
    tiktok:"#FF0050",youtube:"#FF0000",linkedin:"#0A66C2",telegram:"#2AABEE",
    discord:"#5865F2",pinterest:"#E60023",email:"#F59E0B",sms:"#10B981"};
  const ICONS  = {whatsapp:"💬",instagram:"📸",facebook:"👤",twitter:"🐦",tiktok:"🎵",
    youtube:"▶️",linkedin:"💼",telegram:"✈️",discord:"🎮",pinterest:"📌",email:"📧",sms:"📱"};

  return (
    <div className="anim">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <div><h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>Connected Platforms 🌐</h1>
          <p style={{color:C.muted,fontSize:14}}>All channels with live health status</p></div>
        <button className="btn bg" onClick={()=>{setLoading(true);api.get("/platforms").then(r=>setPlatforms(r.data||[])).catch(()=>{}).finally(()=>setLoading(false));}}>↻ Refresh</button>
      </div>
      {loading ? <div style={{textAlign:"center",padding:60}}><Spinner size={40}/></div> : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
          {platforms.map((p,i)=>{
            const color = COLORS[p.platform]||C.accent;
            const icon  = ICONS[p.platform]||"🌐";
            const health= p.accounts.reduce((s,a)=>s+(a.health||100),0)/(p.accounts.length||1);
            return (
              <div key={i} className="card" style={{cursor:"pointer",transition:"border-color .2s"}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=color}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}
                onClick={()=>setTab(p.platform)}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                  <div style={{width:46,height:46,borderRadius:12,background:`${color}22`,
                    border:`1px solid ${color}44`,display:"flex",alignItems:"center",
                    justifyContent:"center",fontSize:22}}>{icon}</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:15,textTransform:"capitalize"}}>{p.platform}</div>
                    <div style={{fontSize:11,color:C.muted}}>{p.accounts.length} account{p.accounts.length!==1?"s":""}</div>
                  </div>
                  <div style={{marginLeft:"auto"}}><Dot color={health>70?C.accent3:C.warn}/></div>
                </div>
                <div className="grid2" style={{marginBottom:12}}>
                  {[["Messages",fmt(p.totalMessages||0)],["Health",Math.round(health)+"%"]].map(([l,v],j)=>(
                    <div key={j} style={{background:C.surface,borderRadius:8,padding:8,textAlign:"center"}}>
                      <div style={{fontSize:18,fontWeight:800,color}}>{v}</div>
                      <div style={{fontSize:10,color:C.muted}}>{l}</div>
                    </div>
                  ))}
                </div>
                <PBar v={health} color={health>70?C.accent3:C.warn}/>
              </div>
            );
          })}
          {platforms.length===0 && (
            <div className="card" style={{gridColumn:"1/-1",textAlign:"center",padding:60,color:C.muted}}>
              <div style={{fontSize:48,marginBottom:16}}>🌐</div>
              <div style={{fontSize:16,fontWeight:700}}>No accounts connected yet</div>
              <div style={{fontSize:13,marginTop:8}}>Add platform accounts via the individual platform tabs</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SCHEDULER TAB — real /scheduler/calendar + /posts
// ═══════════════════════════════════════════════════════════
function SchedulerTab({ notify }) {
  const today = new Date();
  const [month,  setMonth]  = useState(today.getMonth());
  const [year,   setYear]   = useState(today.getFullYear());
  const [posts,  setPosts]  = useState([]);
  const [loading,setLoading]= useState(true);
  const [showAdd,setShowAdd]= useState(false);
  const [newPost,setNewPost] = useState({date:"",time:"09:00",platform:"instagram",content:""});
  const [aiLoad, setAiLoad] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/scheduler/calendar?month=${month+1}&year=${year}`);
      setPosts(r.data || []);
    } catch {} finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const daysInMonth = new Date(year, month+1, 0).getDate();
  const firstDay    = new Date(year, month, 1).getDay();
  const months      = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const icons       = {instagram:"📸",twitter:"🐦",facebook:"👤",linkedin:"💼",telegram:"✈️",discord:"🎮",tiktok:"🎵",whatsapp:"💬"};

  const getDay = d => {
    const ds = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    return posts.filter(p => p.schedule?.sendAt?.startsWith(ds));
  };

  const addPost = async () => {
    if (!newPost.date || !newPost.content) { notify("Fill all fields","error"); return; }
    try {
      const accs = await api.get(`/accounts?platform=${newPost.platform}`);
      const accountId = accs.data?.[0]?._id;
      if (!accountId) { notify(`No ${newPost.platform} account — add one first`,"error"); return; }
      const sendAt = new Date(`${newPost.date}T${newPost.time}:00`).toISOString();
      await api.post("/social/post",{ platform:newPost.platform, accountId, text:newPost.content, scheduled:sendAt });
      notify("✅ Post scheduled!");
      setShowAdd(false); setNewPost({date:"",time:"09:00",platform:"instagram",content:""});
      load();
    } catch(e) { notify(e.message,"error"); }
  };

  const genContent = async () => {
    setAiLoad(true);
    try { const r = await callAI(`Write a short ${newPost.platform} post. Engaging, with hashtags.`); setNewPost(p=>({...p,content:r})); notify("✨ Content generated!"); }
    catch { setNewPost(p=>({...p,content:"🚀 Exciting news coming your way! Stay tuned. #ComingSoon"})); }
    setAiLoad(false);
  };

  return (
    <div className="anim">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <div><h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>Content Scheduler 📅</h1>
          <p style={{color:C.muted,fontSize:14}}>{posts.length} posts scheduled this month</p></div>
        <div style={{display:"flex",gap:10}}>
          <button className="btn bg" onClick={()=>setMonth(m=>m===0?11:m-1)}>◀</button>
          <div style={{padding:"9px 18px",background:C.card,border:`1px solid ${C.border}`,borderRadius:8,fontWeight:700}}>{months[month]} {year}</div>
          <button className="btn bg" onClick={()=>setMonth(m=>m===11?0:m+1)}>▶</button>
          <button className="btn bp" onClick={()=>setShowAdd(true)}>+ Schedule Post</button>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:18}}>
        <div className="card">
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:8}}>
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>(
              <div key={d} style={{textAlign:"center",fontSize:11,color:C.muted,fontWeight:700,padding:"6px 0"}}>{d}</div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
            {Array.from({length:firstDay},(_,i)=><div key={`e${i}`}/>)}
            {Array.from({length:daysInMonth},(_,i)=>{
              const d = i+1;
              const dayPosts = getDay(d);
              const isToday  = d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
              return (
                <div key={d} style={{minHeight:72,border:`1px solid ${isToday?C.accent:C.border}`,
                  borderRadius:8,padding:6,background:isToday?`${C.accent}08`:C.surface,cursor:"pointer",
                  transition:"border-color .2s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=isToday?C.accent:C.border}
                  onClick={()=>{ setNewPost(p=>({...p,date:`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`})); setShowAdd(true); }}>
                  <div style={{fontSize:12,fontWeight:700,color:isToday?C.accent:C.text,marginBottom:4}}>{d}</div>
                  {dayPosts.slice(0,3).map((p,j)=>(
                    <div key={j} style={{fontSize:10,background:`${C.accent}18`,borderRadius:3,padding:"2px 4px",marginBottom:2,color:C.accent,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {icons[p.type]||"📝"} {p.schedule?.sendAt?.slice(11,16)}
                    </div>
                  ))}
                  {dayPosts.length>3 && <div style={{fontSize:9,color:C.muted}}>+{dayPosts.length-3}</div>}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {showAdd && (
            <div className="card" style={{border:`1px solid ${C.accent}44`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
                <ST>Schedule New Post</ST>
                <button onClick={()=>setShowAdd(false)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18}}>×</button>
              </div>
              <div style={{marginBottom:10}}>
                <label>Platform</label>
                <select className="sel" value={newPost.platform} onChange={e=>setNewPost(p=>({...p,platform:e.target.value}))}>
                  {Object.entries(icons).map(([k,v])=><option key={k} value={k}>{v} {k.charAt(0).toUpperCase()+k.slice(1)}</option>)}
                </select>
              </div>
              <div className="grid2" style={{marginBottom:10}}>
                <div><label>Date</label><input className="inp" type="date" value={newPost.date} onChange={e=>setNewPost(p=>({...p,date:e.target.value}))}/></div>
                <div><label>Time</label><input className="inp" type="time" value={newPost.time} onChange={e=>setNewPost(p=>({...p,time:e.target.value}))}/></div>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <label style={{marginBottom:0}}>Content</label>
                  <ActionBtn onClick={genContent} loading={aiLoad} variant="bg" style={{fontSize:10,padding:"2px 8px"}}>✨ AI</ActionBtn>
                </div>
                <textarea className="ta" rows={4} value={newPost.content} onChange={e=>setNewPost(p=>({...p,content:e.target.value}))} placeholder="Post content…"/>
              </div>
              <button className="btn bp" style={{width:"100%"}} onClick={addPost}>📅 Schedule Post</button>
            </div>
          )}
          <div className="card">
            <ST>Upcoming Posts ({posts.length})</ST>
            {loading ? <div style={{textAlign:"center",padding:20}}><Spinner/></div> :
              posts.length===0 ? <div style={{color:C.muted,fontSize:13}}>No scheduled posts this month</div> :
              <div style={{maxHeight:400,overflowY:"auto"}}>
                {posts.sort((a,b)=>a.schedule?.sendAt?.localeCompare(b.schedule?.sendAt)).map((p,i)=>(
                  <div key={i} style={{padding:"10px 0",borderBottom:`1px solid ${C.border}22`}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:13,fontWeight:700}}>{icons[p.type]||"📝"} {p.type}</span>
                      <Badge label={p.status} color={p.status==="scheduled"?C.accent4:p.status==="published"?C.accent3:C.muted}/>
                    </div>
                    <div style={{fontSize:11,color:C.muted,marginBottom:4}}>📅 {p.schedule?.sendAt?.replace("T"," ").slice(0,16)}</div>
                    <div style={{fontSize:12,lineHeight:1.4}}>{(p.content?.body||p.content?.caption||"").slice(0,80)}…</div>
                  </div>
                ))}
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// UNIFIED INBOX — inbound messages center
// ═══════════════════════════════════════════════════════════
function InboxTab({ notify }) {
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("all");
  const [reply, setReply]       = useState("");
  const [sending, setSending]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ direction: "inbound", limit: 100 });
      if (filter !== "all") params.set("platform", filter);
      const r = await api.get(`/contacts?${params}`);
      // Build conversation threads from message logs
      const res = await api.get(`/analytics/overview?period=7d`);
      // Fallback: show recent inbound from message logs endpoint
      const logs = await api.get(`/campaigns?limit=20`).catch(() => ({ data: [] }));
      setMessages([]); // Will be populated from real inbound logs
    } catch {}
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const PLATFORMS = ["all","whatsapp","email","sms","telegram","instagram","facebook"];
  const PLAT_ICONS = {whatsapp:"💬",email:"📧",sms:"📱",telegram:"✈️",instagram:"📸",facebook:"👤"};

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    setSending(true);
    try {
      const endpointMap = { whatsapp:"/whatsapp/send", email:"/email/send", sms:"/sms/send", telegram:"/telegram/send" };
      const endpoint = endpointMap[selected.platform] || "/whatsapp/send";
      await api.post(endpoint, { to: selected.from, message: reply, accountId: selected.accountId });
      notify("✅ Reply sent!");
      setReply("");
    } catch(e) { notify(e.message, "error"); }
    setSending(false);
  };

  return (
    <div className="anim">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22}}>
        <div>
          <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>Unified Inbox 📥</h1>
          <p style={{color:C.muted,fontSize:14}}>All inbound messages across every platform in one place</p>
        </div>
        <button className="btn bg" onClick={load}>↻ Refresh</button>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        {PLATFORMS.map(p => (
          <button key={p} className={`chip${filter===p?" sel":""}`} onClick={() => setFilter(p)}>
            {p !== "all" ? PLAT_ICONS[p] : "🌐"} {p.charAt(0).toUpperCase()+p.slice(1)}
          </button>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1.6fr",gap:14,minHeight:520}}>
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          {loading ? (
            <div style={{textAlign:"center",padding:60}}><Spinner size={32}/></div>
          ) : messages.length === 0 ? (
            <div style={{textAlign:"center",padding:60,color:C.muted}}>
              <div style={{fontSize:48,marginBottom:12}}>📥</div>
              <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>No inbound messages yet</div>
              <div style={{fontSize:13}}>Replies from WhatsApp, email, SMS and social platforms will appear here</div>
              <div style={{marginTop:20,fontSize:12,color:C.accent4}}>
                💡 Configure webhooks and auto-reply in the platform tabs to receive messages
              </div>
            </div>
          ) : (
            messages.map((m,i) => (
              <div key={i} onClick={() => setSelected(m)}
                style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}22`,cursor:"pointer",
                  background:selected?._id===m._id?`${C.accent}08`:C.card,transition:"background .15s"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontWeight:700,fontSize:13}}>{m.from || m.name || "Unknown"}</span>
                  <span style={{fontSize:10,color:C.muted}}>{new Date(m.createdAt).toLocaleDateString()}</span>
                </div>
                <div style={{fontSize:12,color:C.muted,display:"flex",gap:8,alignItems:"center"}}>
                  <span>{PLAT_ICONS[m.platform]||"📨"}</span>
                  <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.body?.slice(0,60)||"No content"}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          {selected ? (
            <>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,paddingBottom:14,borderBottom:`1px solid ${C.border}`}}>
                <div style={{width:42,height:42,borderRadius:10,background:`${C.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>
                  {PLAT_ICONS[selected.platform]||"📨"}
                </div>
                <div>
                  <div style={{fontWeight:700}}>{selected.from || "Unknown"}</div>
                  <div style={{fontSize:12,color:C.muted}}>{selected.platform} · {new Date(selected.createdAt).toLocaleString()}</div>
                </div>
                <Badge label={selected.platform} color={C.accent} />
              </div>
              <div style={{background:C.surface,borderRadius:10,padding:14,marginBottom:14,minHeight:120}}>
                <div style={{fontSize:13,lineHeight:1.8,color:C.text}}>{selected.body || "No content"}</div>
              </div>
              <div>
                <label>Reply</label>
                <textarea className="ta" rows={4} value={reply} onChange={e=>setReply(e.target.value)}
                  placeholder={`Reply via ${selected.platform}…`}/>
                <div style={{display:"flex",gap:10,marginTop:10}}>
                  <ActionBtn onClick={sendReply} loading={sending} style={{flex:1}}>Send Reply ▶</ActionBtn>
                  <button className="btn bg" onClick={() => { setSelected(null); setReply(""); }}>✕ Close</button>
                </div>
              </div>
            </>
          ) : (
            <div style={{height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:C.muted,gap:10}}>
              <div style={{fontSize:48}}>💬</div>
              <div style={{fontSize:15,fontWeight:700}}>Select a message</div>
              <div style={{fontSize:13}}>to view and reply</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARED PLATFORM TAB — reusable pattern for all 9 platforms
// ═══════════════════════════════════════════════════════════
function PlatformTab({ platform, config, notify }) {
  const [activeAction, setActiveAction] = useState(config.actions[0].id);
  const [accounts, setAccounts]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [result, setResult]             = useState(null);
  const [err, setErr]                   = useState("");
  const [fields, setFields]             = useState({});
  const [aiLoad, setAiLoad]             = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api.get(`/accounts?platform=${platform}`).then(r => setAccounts(r.data||[])).catch(() => {});
    setResult(null); setErr("");
    const action = config.actions.find(a => a.id === activeAction);
    setFields(action?.defaults || {});
  }, [platform, activeAction]);

  const currentAction = config.actions.find(a => a.id === activeAction);
  const accountId = accounts[0]?._id;

  const execute = async () => {
    if (!accountId && currentAction?.needsAccount !== false) {
      notify(`Connect a ${platform} account first`, "error"); return;
    }
    setErr(""); setLoading(true); setResult(null);
    try {
      const payload = { accountId, ...fields };
      // Handle array fields (comma-separated strings → arrays)
      currentAction?.arrayFields?.forEach(f => {
        if (typeof payload[f] === "string")
          payload[f] = payload[f].split(",").map(x => x.trim()).filter(Boolean);
      });
      const r = await api.post(`/${platform}/${currentAction.endpoint}`, payload);
      setResult(r.data || r);
      notify(`✅ ${currentAction.label} complete!`);
    } catch(e) { setErr(e.message); }
    setLoading(false);
  };

  const genAI = async () => {
    if (!currentAction?.aiField) return;
    setAiLoad(true);
    try {
      const r = await callAI(`Write a ${platform} ${currentAction.label} message. Engaging, with emojis. Use [name] for personalization. Max 200 chars.`);
      setFields(f => ({ ...f, [currentAction.aiField]: r }));
      notify("✨ AI content generated!");
    } catch { notify("AI generation failed", "error"); }
    setAiLoad(false);
  };

  return (
    <div className="anim">
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
        <div style={{width:52,height:52,borderRadius:14,background:`${config.color}22`,border:`1px solid ${config.color}44`,
          display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>{config.icon}</div>
        <div>
          <h1 style={{fontSize:26,fontWeight:800,marginBottom:2}}>{config.name} Automation</h1>
          <p style={{color:C.muted,fontSize:13}}>{config.description}</p>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:10,alignItems:"center"}}>
          <Badge label={`${accounts.length} account${accounts.length!==1?"s":""}`} color={accounts.length?C.accent3:C.warn}/>
          {accounts.length===0 && (
            <button className="btn bp" style={{fontSize:12}} onClick={async()=>{
              try { const r = await api.post("/accounts",{platform,username:`${platform} Account`}); setAccounts([r.data]); notify("Account added!"); } catch(e){ notify(e.message,"error"); }
            }}>+ Add Account</button>
          )}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"220px 1fr",gap:14}}>
        {/* Action sidebar */}
        <div className="card" style={{padding:"10px 8px"}}>
          <ST>Actions</ST>
          {config.actions.map(a => (
            <button key={a.id} onClick={() => setActiveAction(a.id)}
              className="tb" style={{marginBottom:4,background:activeAction===a.id?`${C.accent}12`:undefined,
                color:activeAction===a.id?C.accent:undefined,border:activeAction===a.id?`1px solid ${C.accent}33`:"none"}}>
              <span style={{fontSize:16}}>{a.icon}</span>
              <div style={{textAlign:"left"}}>
                <div style={{fontSize:13,fontWeight:activeAction===a.id?700:400}}>{a.label}</div>
                {a.badge && <Badge label={a.badge} color={a.badgeColor||C.accent2}/>}
              </div>
            </button>
          ))}
        </div>

        {/* Action form */}
        <div className="card">
          {currentAction && (
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                <div>
                  <div style={{fontSize:16,fontWeight:700}}>{currentAction.icon} {currentAction.label}</div>
                  <div style={{fontSize:12,color:C.muted,marginTop:2}}>{currentAction.desc}</div>
                </div>
                {currentAction.aiField && (
                  <ActionBtn onClick={genAI} loading={aiLoad} variant="bg" style={{fontSize:11,padding:"5px 12px"}}>✨ AI Write</ActionBtn>
                )}
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
                {(currentAction.fields||[]).map(f => (
                  <div key={f.key} style={{gridColumn:f.wide?"1/-1":undefined}}>
                    <label>{f.label}</label>
                    {f.type==="textarea" ? (
                      <textarea className="ta" rows={f.rows||4} value={fields[f.key]||""} onChange={e=>setFields(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder||""}/>
                    ) : f.type==="file" ? (
                      <div>
                        <input ref={fileRef} type="file" accept={f.accept||"*"} style={{display:"none"}} onChange={e=>{
                          const file = e.target.files?.[0];
                          if(file) setFields(p=>({...p,[f.key]:file,[f.key+"_name"]:file.name}));
                        }}/>
                        <button className="btn bg" style={{width:"100%",fontSize:12}} onClick={()=>fileRef.current?.click()}>
                          {fields[f.key+"_name"] ? `📎 ${fields[f.key+"_name"]}` : `📁 Choose ${f.label}`}
                        </button>
                      </div>
                    ) : f.type==="select" ? (
                      <select className="sel" value={fields[f.key]||f.default||""} onChange={e=>setFields(p=>({...p,[f.key]:e.target.value}))}>
                        {f.options.map(o => <option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
                      </select>
                    ) : f.type==="number" ? (
                      <input className="inp" type="number" min={f.min||0} max={f.max} value={fields[f.key]||f.default||""} onChange={e=>setFields(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder||""}/>
                    ) : (
                      <input className="inp" type="text" value={fields[f.key]||""} onChange={e=>setFields(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder||""}/>
                    )}
                    {f.hint && <div style={{fontSize:11,color:C.muted,marginTop:3}}>{f.hint}</div>}
                  </div>
                ))}
              </div>

              {currentAction.info && (
                <div style={{background:`${C.accent4}10`,border:`1px solid ${C.accent4}33`,borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:12,color:C.accent4}}>
                  💡 {currentAction.info}
                </div>
              )}

              <ErrorBox err={err}/>

              <div style={{display:"flex",gap:10,marginTop:12}}>
                <ActionBtn onClick={execute} loading={loading} style={{flex:1,padding:"11px"}}>
                  {currentAction.icon} {currentAction.label}
                </ActionBtn>
                {result && (
                  <button className="btn bg" onClick={()=>setResult(null)}>Clear</button>
                )}
              </div>
              <ResultBox data={result} label="Response"/>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PLATFORM CONFIGS — define each platform's actions + fields
// ═══════════════════════════════════════════════════════════
const PLATFORM_CONFIGS = {
  instagram: {
    name:"Instagram", icon:"📸", color:"#E1306C",
    description:"DM automation · follow/unfollow · story viewer · post & reel upload · scraper",
    actions:[
      { id:"dm-bulk", icon:"💌", label:"Bulk DM", badge:"Bulk", badgeColor:"#E1306C",
        endpoint:"dm/bulk", aiField:"message",
        desc:"Send personalized DMs to multiple users",
        arrayFields:["targets"],
        fields:[
          {key:"targets",  label:"Target Usernames (comma-sep)", placeholder:"@user1, @user2, @user3", hint:"Separate with commas"},
          {key:"message",  label:"Message", type:"textarea", rows:4, placeholder:"Hi [name]! 👋 Loved your content…", wide:true},
        ],
        info:"Sends with 3–8s human-like delay between each DM to avoid detection.",
        defaults:{}
      },
      { id:"follow", icon:"➕", label:"Auto Follow",
        endpoint:"follow",
        arrayFields:["usernames"],
        fields:[
          {key:"usernames", label:"Usernames to Follow (comma-sep)", placeholder:"@user1, @user2"},
          {key:"delay",     label:"Delay Between Actions (ms)", type:"number", placeholder:"3000", default:"3000"},
        ],
        defaults:{}
      },
      { id:"unfollow", icon:"➖", label:"Auto Unfollow",
        endpoint:"unfollow",
        desc:"Unfollow non-followers based on criteria",
        fields:[
          {key:"limit",      label:"Max Unfollows", type:"number", placeholder:"100", default:"100"},
          {key:"olderThanDays", label:"Followed > N days ago", type:"number", placeholder:"30"},
        ],
        defaults:{}
      },
      { id:"like", icon:"❤️", label:"Auto Like",
        endpoint:"like/hashtag",
        fields:[
          {key:"hashtag", label:"Hashtag", placeholder:"#marketing #india"},
          {key:"limit",   label:"Posts to Like", type:"number", placeholder:"50", default:"50"},
        ],
        defaults:{}
      },
      { id:"comment", icon:"💬", label:"Auto Comment",
        endpoint:"comment", aiField:"comments",
        arrayFields:["mediaIds","comments"],
        fields:[
          {key:"mediaIds", label:"Media IDs (comma-sep)", placeholder:"ABC123, DEF456"},
          {key:"comments", label:"Comments (comma-sep, picked randomly)", type:"textarea", placeholder:"Great post! 🔥, Love this content 💯", wide:true, aiField:true},
        ],
        defaults:{}
      },
      { id:"story-view", icon:"👁️", label:"Auto View Stories",
        endpoint:"story/view",
        arrayFields:["userIds"],
        fields:[
          {key:"userIds", label:"User IDs to Watch (comma-sep)", placeholder:"12345, 67890"},
        ],
        defaults:{}
      },
      { id:"scrape", icon:"🔍", label:"Scrape by Hashtag",
        endpoint:"scrape/hashtag", needsAccount:false,
        fields:[
          {key:"hashtag", label:"Hashtag", placeholder:"digitalmarketing"},
          {key:"limit",   label:"Max Results", type:"number", placeholder:"100", default:"100"},
        ],
        defaults:{}
      },
      { id:"post", icon:"🖼️", label:"Upload Post",
        endpoint:"post",
        fields:[
          {key:"image",   label:"Image File", type:"file", accept:"image/*"},
          {key:"caption", label:"Caption", type:"textarea", placeholder:"Your caption… #hashtags", wide:true},
        ],
        info:"Supported: JPEG, PNG. Max 8MB.",
        defaults:{}
      },
      { id:"reel", icon:"🎬", label:"Upload Reel",
        endpoint:"reel",
        fields:[
          {key:"video",   label:"Video File", type:"file", accept:"video/*"},
          {key:"caption", label:"Caption + Hashtags", type:"textarea", placeholder:"Caption #reels #viral", wide:true},
        ],
        info:"Max 90 seconds. Recommended: 1080×1920 (9:16).",
        defaults:{}
      },
    ]
  },

  facebook: {
    name:"Facebook", icon:"👤", color:"#1877F2",
    description:"Group posting · marketplace · friend requests · event invites",
    actions:[
      { id:"groups-post", icon:"📢", label:"Post to Groups", badge:"Bulk",
        endpoint:"groups/post", aiField:"message",
        arrayFields:["groupUrls"],
        desc:"Post the same message to multiple Facebook groups",
        fields:[
          {key:"groupUrls", label:"Group URLs (one per line)", type:"textarea", rows:4, placeholder:"https://facebook.com/groups/abc\nhttps://facebook.com/groups/xyz"},
          {key:"message",   label:"Post Content", type:"textarea", aiField:true, placeholder:"Your post here… 🚀", wide:true},
          {key:"imageUrl",  label:"Image URL (optional)", placeholder:"https://…/image.jpg"},
        ],
        info:"Groups are posted with 10–30s delay. Ensure you're a member of each group.",
        defaults:{}
      },
      { id:"scrape-members", icon:"👥", label:"Scrape Group Members",
        endpoint:"groups/members",
        fields:[
          {key:"groupUrl", label:"Group URL", placeholder:"https://facebook.com/groups/…"},
          {key:"limit",    label:"Max Members", type:"number", placeholder:"200", default:"100"},
        ],
        defaults:{}
      },
      { id:"marketplace", icon:"🛒", label:"Post to Marketplace",
        endpoint:"marketplace/post",
        desc:"List items on Facebook Marketplace",
        fields:[
          {key:"title",       label:"Listing Title", placeholder:"Used iPhone 14 Pro"},
          {key:"price",       label:"Price (₹)", type:"number", placeholder:"45000"},
          {key:"description", label:"Description", type:"textarea", wide:true, placeholder:"Excellent condition, barely used…"},
          {key:"category",    label:"Category", type:"select", options:["Electronics","Vehicles","Home & Garden","Clothing","Furniture","Other"]},
          {key:"location",    label:"Location", placeholder:"Mumbai, Maharashtra"},
        ],
        defaults:{}
      },
      { id:"friends", icon:"🤝", label:"Send Friend Requests",
        endpoint:"friends/add",
        arrayFields:["profileUrls"],
        fields:[
          {key:"profileUrls", label:"Profile URLs (comma-sep)", type:"textarea", placeholder:"https://facebook.com/…"},
          {key:"limit",       label:"Max Requests", type:"number", placeholder:"20", default:"20"},
        ],
        info:"Facebook limits: ~20 friend requests per day. Exceeding this risks account restrictions.",
        defaults:{}
      },
      { id:"events", icon:"📅", label:"Invite to Event",
        endpoint:"events/invite",
        fields:[
          {key:"eventUrl",    label:"Event URL", placeholder:"https://facebook.com/events/…"},
          {key:"limit",       label:"Max Invites", type:"number", placeholder:"50"},
        ],
        defaults:{}
      },
    ]
  },

  twitter: {
    name:"Twitter / X", icon:"🐦", color:"#1DA1F2",
    description:"Tweet · threads · follow/unfollow bots · trends · competitor tracking",
    actions:[
      { id:"tweet", icon:"📝", label:"Send Tweet", aiField:"text",
        endpoint:"tweet",
        desc:"Post a single tweet (max 280 chars)",
        fields:[
          {key:"text", label:"Tweet", type:"textarea", rows:3, wide:true, aiField:true, placeholder:"Your tweet… #hashtag", hint:"Max 280 characters"},
        ],
        defaults:{}
      },
      { id:"thread", icon:"🧵", label:"Post Thread", badge:"AI",
        endpoint:"thread", aiField:"tweets",
        desc:"Multi-tweet thread (auto-splits by •••)",
        fields:[
          {key:"tweets", label:"Thread Content (separate tweets with •••)", type:"textarea", rows:8, wide:true,
           placeholder:"First tweet text here\n•••\nSecond tweet in the thread\n•••\nFinal tweet with CTA"},
        ],
        info:"Split tweets with ••• on a new line. Each section becomes one tweet.",
        defaults:{}
      },
      { id:"follow-kw", icon:"➕", label:"Follow by Keyword",
        endpoint:"follow/keyword",
        desc:"Follow users who recently tweeted a keyword",
        fields:[
          {key:"keyword", label:"Keyword or Hashtag", placeholder:"#startups india"},
          {key:"limit",   label:"Max Follows", type:"number", placeholder:"50", default:"50"},
          {key:"minFollowers", label:"Min Followers Filter", type:"number", placeholder:"100"},
        ],
        defaults:{}
      },
      { id:"unfollow", icon:"➖", label:"Unfollow Inactive",
        endpoint:"unfollow/inactive",
        fields:[
          {key:"daysSinceActive", label:"Inactive for (days)", type:"number", placeholder:"90", default:"90"},
          {key:"limit",          label:"Max Unfollows", type:"number", placeholder:"100", default:"100"},
          {key:"skipVerified",   label:"Skip Verified", type:"select", options:["true","false"], default:"true"},
        ],
        defaults:{}
      },
      { id:"mention-bot", icon:"🤖", label:"Mention Reply Bot",
        endpoint:"bot/mentions",
        desc:"Auto-reply to mentions matching keywords",
        badge:"Bot",
        fields:[
          {key:"replies", label:"Reply Messages (comma-sep, picked randomly)", type:"textarea",
           placeholder:"Thanks for the mention! 🙏, Appreciate it! 💯"},
          {key:"intervalMin", label:"Check Every (mins)", type:"number", placeholder:"5", default:"5"},
        ],
        info:"Bot runs until server restart. Replies with a random message from your list.",
        defaults:{}
      },
      { id:"scrape", icon:"🔍", label:"Scrape Tweets",
        endpoint:"scrape/tweets", needsAccount:false,
        fields:[
          {key:"query",     label:"Search Query", placeholder:"#AI india since:2024-01-01"},
          {key:"limit",     label:"Max Tweets", type:"number", placeholder:"100", default:"100"},
          {key:"sinceDays", label:"From Last N Days", type:"number", placeholder:"7"},
        ],
        defaults:{}
      },
      { id:"trends", icon:"📈", label:"Get Trending Topics",
        endpoint:"trends", needsAccount:false,
        fields:[
          {key:"woeid", label:"Location WOEID", type:"number", placeholder:"1", hint:"1=Worldwide, 23424848=India", default:"1"},
        ],
        defaults:{}
      },
      { id:"competitors", icon:"🕵️", label:"Track Competitors",
        endpoint:"competitors/track",
        arrayFields:["usernames"],
        fields:[
          {key:"usernames", label:"@Usernames to Track (comma-sep)", placeholder:"@elonmusk, @sama"},
          {key:"limit",     label:"Tweets per Account", type:"number", placeholder:"20"},
        ],
        defaults:{}
      },
      { id:"poll", icon:"📊", label:"Create Poll",
        endpoint:"poll",
        desc:"Post a Twitter poll",
        fields:[
          {key:"question", label:"Poll Question", placeholder:"Which do you prefer?"},
          {key:"choices",  label:"Choices (comma-sep, max 4)", placeholder:"Option A, Option B, Option C"},
          {key:"durationMinutes", label:"Duration (minutes)", type:"number", placeholder:"1440", default:"1440"},
        ],
        defaults:{}
      },
    ]
  },

  tiktok: {
    name:"TikTok", icon:"🎵", color:"#FF0050",
    description:"Upload videos · auto-follow · bulk DM · scrape · download · trending hashtags",
    actions:[
      { id:"upload", icon:"⬆️", label:"Upload Video", badge:"Main",
        endpoint:"upload",
        fields:[
          {key:"video",    label:"Video File", type:"file", accept:"video/*"},
          {key:"caption",  label:"Caption + Hashtags", type:"textarea", wide:true, aiField:true, placeholder:"Caption here #fyp #viral"},
          {key:"hashtags", label:"Hashtags (comma-sep)", placeholder:"fyp, viral, trending"},
        ],
        info:"Recommended: 1080×1920, max 180s. Watermark-free videos perform better.",
        defaults:{}
      },
      { id:"follow", icon:"➕", label:"Auto Follow",
        endpoint:"follow",
        arrayFields:["usernames"],
        fields:[
          {key:"usernames", label:"Usernames (comma-sep)", placeholder:"@user1, @user2"},
          {key:"limit",     label:"Max Follows", type:"number", placeholder:"50"},
        ],
        defaults:{}
      },
      { id:"like-hashtag", icon:"❤️", label:"Auto Like by Hashtag",
        endpoint:"like/hashtag",
        fields:[
          {key:"hashtag", label:"Hashtag (no #)", placeholder:"marketing"},
          {key:"limit",   label:"Max Likes", type:"number", placeholder:"50", default:"50"},
          {key:"minViews",label:"Min Views Filter", type:"number", placeholder:"10000"},
        ],
        defaults:{}
      },
      { id:"comment", icon:"💬", label:"Auto Comment",
        endpoint:"comment",
        aiField:"comments",
        arrayFields:["videoUrls","comments"],
        fields:[
          {key:"videoUrls", label:"Video URLs (comma-sep)", type:"textarea", placeholder:"https://tiktok.com/@user/video/…"},
          {key:"comments",  label:"Comments (comma-sep, picked randomly)", type:"textarea", wide:true, aiField:true, placeholder:"🔥 Amazing, Love this! 💯"},
        ],
        defaults:{}
      },
      { id:"scrape", icon:"🔍", label:"Scrape by Hashtag",
        endpoint:"scrape/hashtag",
        fields:[
          {key:"hashtag", label:"Hashtag (no #)", placeholder:"entrepreneurship"},
          {key:"limit",   label:"Max Results", type:"number", placeholder:"100"},
        ],
        defaults:{}
      },
      { id:"download", icon:"⬇️", label:"Download Video",
        endpoint:"download", needsAccount:false,
        fields:[
          {key:"videoUrl", label:"TikTok Video URL", placeholder:"https://tiktok.com/@user/video/123…", wide:true},
        ],
        info:"Downloads without watermark when possible.",
        defaults:{}
      },
      { id:"trends", icon:"📈", label:"Trending Hashtags",
        endpoint:"trends", needsAccount:false,
        fields:[
          {key:"country", label:"Country Code", placeholder:"IN", default:"IN", type:"select",
           options:[{value:"IN",label:"India (IN)"},{value:"US",label:"USA (US)"},{value:"GB",label:"UK (GB)"},{value:"PK",label:"Pakistan (PK)"}]},
        ],
        defaults:{}
      },
      { id:"dm", icon:"✉️", label:"Bulk DM",
        endpoint:"dm/bulk", aiField:"message",
        arrayFields:["targets"],
        fields:[
          {key:"targets", label:"Usernames (comma-sep)", placeholder:"@user1, @user2"},
          {key:"message", label:"Message", type:"textarea", aiField:true, placeholder:"Hi [name]! 👋 Check this out…", wide:true},
        ],
        defaults:{}
      },
    ]
  },

  youtube: {
    name:"YouTube", icon:"▶️", color:"#FF0000",
    description:"Upload videos · auto-subscribe · like & comment · scrape channels · download",
    actions:[
      { id:"upload", icon:"⬆️", label:"Upload Video", badge:"Main",
        endpoint:"upload",
        fields:[
          {key:"video",       label:"Video File", type:"file", accept:"video/*"},
          {key:"title",       label:"Title", placeholder:"How to grow on social media in 2025", wide:true},
          {key:"description", label:"Description", type:"textarea", wide:true, aiField:true, placeholder:"Video description…"},
          {key:"tags",        label:"Tags (comma-sep)", placeholder:"marketing, growth, tips"},
          {key:"privacy",     label:"Privacy", type:"select", options:["public","unlisted","private"], default:"public"},
          {key:"category",    label:"Category", type:"select", options:["22","24","27","28"], hint:"22=People, 24=Entertainment, 27=Education, 28=Tech"},
        ],
        info:"Uploads via YouTube Data API v3 (requires Google OAuth account connected).",
        defaults:{}
      },
      { id:"subscribe", icon:"🔔", label:"Auto Subscribe",
        endpoint:"subscribe",
        arrayFields:["channelUrls"],
        fields:[
          {key:"channelUrls", label:"Channel URLs (comma-sep)", type:"textarea", placeholder:"https://youtube.com/c/channel1"},
          {key:"limit",       label:"Max Subscriptions", type:"number", placeholder:"50"},
        ],
        defaults:{}
      },
      { id:"like", icon:"👍", label:"Auto Like",
        endpoint:"like",
        arrayFields:["videoUrls"],
        fields:[
          {key:"videoUrls", label:"Video URLs (comma-sep)", type:"textarea", placeholder:"https://youtube.com/watch?v=…"},
        ],
        defaults:{}
      },
      { id:"comment", icon:"💬", label:"Auto Comment",
        endpoint:"comment", aiField:"comments",
        arrayFields:["videoUrls","comments"],
        fields:[
          {key:"videoUrls", label:"Video URLs (comma-sep)", type:"textarea", placeholder:"https://youtube.com/watch?v=…"},
          {key:"comments",  label:"Comments (comma-sep)", type:"textarea", wide:true, aiField:true, placeholder:"Great video! 🔥, Really helpful content 👍"},
        ],
        defaults:{}
      },
      { id:"download", icon:"⬇️", label:"Download Video",
        endpoint:"download", needsAccount:false,
        fields:[
          {key:"videoUrl", label:"YouTube URL", placeholder:"https://youtube.com/watch?v=…", wide:true},
          {key:"format",   label:"Format", type:"select", options:["mp4","mp3","webm"], default:"mp4"},
          {key:"quality",  label:"Quality", type:"select", options:["720p","1080p","480p","360p","best"], default:"720p"},
        ],
        defaults:{}
      },
      { id:"scrape", icon:"🔍", label:"Scrape Channel",
        endpoint:"scrape/channel", needsAccount:false,
        fields:[
          {key:"channelUrl", label:"Channel URL", placeholder:"https://youtube.com/c/…", wide:true},
          {key:"maxVideos",  label:"Max Videos", type:"number", placeholder:"50", default:"50"},
        ],
        defaults:{}
      },
      { id:"competitors", icon:"🕵️", label:"Monitor Competitors",
        endpoint:"competitors/monitor",
        arrayFields:["channelUrls"],
        fields:[
          {key:"channelUrls", label:"Competitor Channel URLs (comma-sep)", type:"textarea", placeholder:"https://youtube.com/c/competitor1"},
        ],
        defaults:{}
      },
    ]
  },

  linkedin: {
    name:"LinkedIn", icon:"💼", color:"#0A66C2",
    description:"Connection requests · DM · lead scraping · auto-like · post · endorse skills",
    actions:[
      { id:"connect", icon:"🤝", label:"Send Connection Requests", badge:"B2B",
        endpoint:"connect",
        aiField:"message",
        arrayFields:["profileUrls"],
        desc:"Personalized connection requests at scale",
        fields:[
          {key:"profileUrls", label:"Profile URLs (comma-sep)", type:"textarea", placeholder:"https://linkedin.com/in/user1\nhttps://linkedin.com/in/user2"},
          {key:"message",     label:"Connection Note (optional)", type:"textarea", aiField:true, wide:true, placeholder:"Hi [name], I noticed your work on…"},
        ],
        info:"LinkedIn limits: 100 connection requests/week. Use personalized notes for better acceptance rates.",
        defaults:{}
      },
      { id:"dm", icon:"✉️", label:"Bulk Message",
        endpoint:"dm", aiField:"message",
        arrayFields:["targets"],
        fields:[
          {key:"targets", label:"Profile URLs (comma-sep)", type:"textarea", placeholder:"https://linkedin.com/in/user1"},
          {key:"message", label:"Message", type:"textarea", aiField:true, wide:true, placeholder:"Hi [name], I came across your profile…"},
        ],
        defaults:{}
      },
      { id:"scrape-leads", icon:"🔍", label:"Scrape Leads",
        endpoint:"scrape/leads",
        desc:"Extract leads from LinkedIn search results",
        fields:[
          {key:"query",    label:"Search Query", placeholder:"Marketing Director Mumbai"},
          {key:"limit",    label:"Max Leads", type:"number", placeholder:"100", default:"100"},
          {key:"location", label:"Location", placeholder:"Mumbai"},
          {key:"industry", label:"Industry", placeholder:"Marketing"},
          {key:"title",    label:"Job Title", placeholder:"Director"},
        ],
        defaults:{}
      },
      { id:"like-feed", icon:"👍", label:"Auto Like Feed",
        endpoint:"like/feed",
        fields:[
          {key:"limit", label:"Max Posts to Like", type:"number", placeholder:"20", default:"20"},
        ],
        defaults:{}
      },
      { id:"like-keyword", icon:"🔑", label:"Like by Keyword",
        endpoint:"like/keyword",
        fields:[
          {key:"keyword", label:"Search Keyword", placeholder:"startup funding"},
          {key:"limit",   label:"Max Posts", type:"number", placeholder:"30"},
        ],
        defaults:{}
      },
      { id:"post", icon:"📝", label:"Create Post", aiField:"content",
        endpoint:"post",
        fields:[
          {key:"content", label:"Post Content", type:"textarea", rows:6, wide:true, aiField:true,
           placeholder:"Your professional post here…\n\n#hashtags at the bottom"},
          {key:"imageUrl", label:"Image URL (optional)", placeholder:"https://…/image.jpg"},
        ],
        defaults:{}
      },
      { id:"endorse", icon:"⭐", label:"Endorse Skills",
        endpoint:"skills/endorse",
        fields:[
          {key:"profileUrl", label:"Profile URL", placeholder:"https://linkedin.com/in/…", wide:true},
          {key:"maxSkills",  label:"Max Skills to Endorse", type:"number", placeholder:"5", default:"5"},
        ],
        defaults:{}
      },
      { id:"export", icon:"💾", label:"Export Connections",
        endpoint:"connections/export",
        fields:[
          {key:"limit", label:"Max Connections", type:"number", placeholder:"500", default:"500"},
        ],
        defaults:{}
      },
    ]
  },

  telegram: {
    name:"Telegram", icon:"✈️", color:"#2AABEE",
    description:"Scrape members · bulk DM · channel broadcast · polls · view boost · group join",
    actions:[
      { id:"scrape", icon:"🔍", label:"Scrape Group Members",
        endpoint:"scrape/members",
        desc:"Extract all members from a group/channel",
        fields:[
          {key:"groupUsername", label:"Group Username or Link", placeholder:"@groupname or t.me/…", wide:true},
          {key:"limit",        label:"Max Members", type:"number", placeholder:"1000", default:"500"},
          {key:"saveToList",   label:"Save to Contact List ID (optional)", placeholder:"list_id"},
        ],
        defaults:{}
      },
      { id:"dm-bulk", icon:"✉️", label:"Bulk DM Members", badge:"Bulk",
        endpoint:"dm/bulk", aiField:"message",
        desc:"Send personalized messages to scraped members",
        fields:[
          {key:"members", label:"Member IDs or Usernames (comma-sep)", type:"textarea", placeholder:"@user1, @user2, 123456789"},
          {key:"message", label:"Message", type:"textarea", aiField:true, wide:true, placeholder:"Hi [name]! 👋 Join our group at t.me/…"},
          {key:"delay",   label:"Delay Between Messages (ms)", type:"number", placeholder:"3000"},
        ],
        info:"Telegram rate limits: ~30 messages/min. Delays are mandatory to avoid account restrictions.",
        defaults:{}
      },
      { id:"channel-post", icon:"📢", label:"Post to Channel",
        endpoint:"channel/post", aiField:"text",
        fields:[
          {key:"channelId", label:"Channel ID or @username", placeholder:"@mychannel or -100123456"},
          {key:"text",      label:"Message Content", type:"textarea", aiField:true, wide:true, placeholder:"Channel post content… 📢"},
          {key:"parseMode", label:"Parse Mode", type:"select", options:["HTML","Markdown",""], default:"HTML"},
          {key:"pinMessage",label:"Pin Message?", type:"select", options:["false","true"], default:"false"},
        ],
        defaults:{}
      },
      { id:"broadcast", icon:"📡", label:"Broadcast to Channels",
        endpoint:"channel/broadcast",
        arrayFields:["channelIds"],
        fields:[
          {key:"channelIds", label:"Channel IDs (comma-sep)", placeholder:"@ch1, @ch2, -100123"},
          {key:"content",    label:"Message", type:"textarea", aiField:true, wide:true, placeholder:"Broadcast message…"},
        ],
        defaults:{}
      },
      { id:"poll", icon:"📊", label:"Create Poll",
        endpoint:"poll",
        fields:[
          {key:"chatId",   label:"Chat/Channel ID", placeholder:"@mychannel"},
          {key:"question", label:"Poll Question", placeholder:"What's your favourite platform?", wide:true},
          {key:"options",  label:"Options (comma-sep)", placeholder:"Instagram, TikTok, YouTube, LinkedIn"},
          {key:"isAnonymous", label:"Anonymous?", type:"select", options:["true","false"], default:"true"},
        ],
        defaults:{}
      },
      { id:"boost-views", icon:"👁️", label:"Boost Post Views",
        endpoint:"views/boost",
        arrayFields:["messageIds"],
        fields:[
          {key:"channelId",  label:"Channel ID", placeholder:"@mychannel"},
          {key:"messageIds", label:"Message IDs (comma-sep)", placeholder:"101, 102, 103"},
        ],
        defaults:{}
      },
      { id:"join-groups", icon:"🔗", label:"Join Groups",
        endpoint:"groups/join",
        arrayFields:["inviteLinks"],
        fields:[
          {key:"inviteLinks", label:"Invite Links (comma-sep)", type:"textarea", placeholder:"https://t.me/…, https://t.me/…"},
          {key:"delay",       label:"Delay Between Joins (ms)", type:"number", placeholder:"5000"},
        ],
        info:"Accounts can join ~20 groups per day without triggering restrictions.",
        defaults:{}
      },
    ]
  },

  discord: {
    name:"Discord", icon:"🎮", color:"#5865F2",
    description:"Bot init · channel messages · DM all members · scrape · webhooks · auto-reply",
    actions:[
      { id:"init", icon:"🤖", label:"Initialize Bot",
        endpoint:"init", needsAccount:false,
        fields:[
          {key:"accountId", label:"Account ID (from Accounts tab)", placeholder:"MongoDB account ID", wide:true},
          {key:"token",     label:"Bot Token", placeholder:"MTA…", wide:true},
          {key:"prefix",    label:"Command Prefix (optional)", placeholder:"!"},
        ],
        info:"Get your bot token from discord.com/developers. Invite the bot to your server first.",
        defaults:{}
      },
      { id:"message", icon:"💬", label:"Send Channel Message",
        endpoint:"message",
        fields:[
          {key:"channelId", label:"Channel ID", placeholder:"1234567890123", wide:true},
          {key:"message",   label:"Message Content", type:"textarea", aiField:true, wide:true, placeholder:"Your message here…"},
          {key:"embed",     label:"Embed JSON (optional)", type:"textarea", placeholder:'{"title":"Alert","color":16711680}'},
        ],
        defaults:{}
      },
      { id:"dm-all", icon:"✉️", label:"DM All Server Members", badge:"Bulk",
        endpoint:"dm/all",
        fields:[
          {key:"guildId", label:"Server ID", placeholder:"1234567890123"},
          {key:"message", label:"DM Message", type:"textarea", aiField:true, wide:true, placeholder:"Hi! 👋 Check out our new…"},
          {key:"limit",   label:"Max Members to DM", type:"number", placeholder:"100"},
        ],
        info:"Discord limits DMs from bots. Use a reasonable limit and delay to avoid rate bans.",
        defaults:{}
      },
      { id:"scrape", icon:"🔍", label:"Scrape Server Members",
        endpoint:"scrape/members",
        fields:[
          {key:"guildId", label:"Server ID", placeholder:"1234567890123"},
          {key:"limit",   label:"Max Members", type:"number", placeholder:"1000"},
        ],
        defaults:{}
      },
      { id:"webhook", icon:"🔗", label:"Send via Webhook",
        endpoint:"webhook/send", needsAccount:false,
        fields:[
          {key:"webhookUrl", label:"Discord Webhook URL", placeholder:"https://discord.com/api/webhooks/…", wide:true},
          {key:"message",    label:"Message", type:"textarea", aiField:true, wide:true, placeholder:"Webhook message…"},
          {key:"username",   label:"Custom Bot Name (optional)", placeholder:"AutoFlow Bot"},
        ],
        defaults:{}
      },
      { id:"broadcast", icon:"📡", label:"Broadcast to Webhooks",
        endpoint:"webhook/broadcast",
        arrayFields:["webhookUrls"],
        fields:[
          {key:"webhookUrls", label:"Webhook URLs (comma-sep)", type:"textarea", placeholder:"https://discord.com/api/webhooks/1, https://…/2"},
          {key:"message",     label:"Message", type:"textarea", aiField:true, wide:true, placeholder:"Broadcast announcement…"},
        ],
        defaults:{}
      },
      { id:"auto-reply", icon:"🔁", label:"Setup Auto-Reply Rules",
        endpoint:"auto-reply",
        fields:[
          {key:"guildId", label:"Server ID", placeholder:"1234567890123"},
          {key:"keyword", label:"Trigger Keyword", placeholder:"help"},
          {key:"reply",   label:"Auto Reply", type:"textarea", aiField:true, wide:true, placeholder:"For help, visit: https://…"},
        ],
        defaults:{}
      },
    ]
  },

  pinterest: {
    name:"Pinterest", icon:"📌", color:"#E60023",
    description:"Pin images · follow accounts · scrape content · board management",
    actions:[
      { id:"post", icon:"📌", label:"Create Pin",
        endpoint:"post",
        fields:[
          {key:"imageUrl",  label:"Image URL", placeholder:"https://…/image.jpg", wide:true},
          {key:"title",     label:"Pin Title", placeholder:"Amazing design inspiration"},
          {key:"description", label:"Description", type:"textarea", aiField:true, wide:true, placeholder:"Pin description and keywords…"},
          {key:"boardId",   label:"Board ID", placeholder:"your_board_id"},
          {key:"link",      label:"Destination URL (optional)", placeholder:"https://yoursite.com/…"},
        ],
        defaults:{}
      },
      { id:"follow", icon:"➕", label:"Follow Accounts",
        endpoint:"follow",
        arrayFields:["usernames"],
        fields:[
          {key:"usernames", label:"Usernames to Follow (comma-sep)", placeholder:"user1, user2"},
          {key:"limit",     label:"Max Follows", type:"number", placeholder:"50"},
        ],
        defaults:{}
      },
      { id:"scrape", icon:"🔍", label:"Scrape Pins",
        endpoint:"scrape", needsAccount:false,
        fields:[
          {key:"query",  label:"Search Query", placeholder:"interior design minimalist"},
          {key:"limit",  label:"Max Pins", type:"number", placeholder:"100"},
        ],
        defaults:{}
      },
    ]
  },
};


// ═══════════════════════════════════════════════════════════
// ERROR BOUNDARY — catches crashes per-tab, shows retry UI
// ═══════════════════════════════════════════════════════════
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(err, info) {
    console.error("[AutoFlow] Tab error:", err, info.componentStack?.split("\n")[1]);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding:60,textAlign:"center"}}>
          <div style={{fontSize:52,marginBottom:16}}>⚠️</div>
          <div style={{fontSize:20,fontWeight:700,color:"#ef4444",marginBottom:8}}>
            Something went wrong
          </div>
          <div style={{fontSize:13,color:"#4a5f7a",marginBottom:28,maxWidth:400,margin:"0 auto 28px"}}>
            {this.state.error?.message || "An unexpected error occurred in this tab."}
          </div>
          <button
            className="btn bp"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            ↻ Retry this tab
          </button>
          <div style={{marginTop:12,fontSize:12,color:"#4a5f7a"}}>
            Other tabs are unaffected.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ═══════════════════════════════════════════════════════════
// BILLING TAB — plan overview, usage bars, invoice list
// ═══════════════════════════════════════════════════════════
function BillingTab({ notify }) {
  const [plans,   setPlans]   = useState([]);
  const [tenant,  setTenant]  = useState(null);
  const [usage,   setUsage]   = useState(null);
  const [invoices,setInvoices]= useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/saas/plans"),
      api.get("/saas/tenant").catch(() => ({ data: null })),
      api.get("/saas/usage").catch(() => ({ data: null })),
    ]).then(([p, t, u]) => {
      setPlans(p.data || []);
      setTenant(t.data);
      setUsage(u.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const upgrade = async (planKey) => {
    try {
      const res = await api.post("/saas/plan/upgrade", {
        plan: planKey,
        successUrl: window.location.origin + "/?billing=success",
        cancelUrl:  window.location.origin,
      });
      if (res.data?.url) window.location.href = res.data.url;
    } catch(e) { notify(e.message, "error"); }
  };

  const PLAN_COLORS = { free:"#4a5f7a", starter:"#00d4ff", pro:"#7c3aed", enterprise:"#f59e0b" };
  const currentPlan = tenant?.plan || "free";

  return (
    <div className="anim">
      <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>Billing & Plans 💳</h1>
      <p style={{color:"#4a5f7a",fontSize:14,marginBottom:24}}>
        Current plan: <strong style={{color:PLAN_COLORS[currentPlan]||"#00d4ff",textTransform:"capitalize"}}>{currentPlan}</strong>
      </p>

      {loading ? <div style={{textAlign:"center",padding:60}}><Spinner size={32}/></div> : (
        <>
          {/* Usage bars */}
          {usage && (
            <div className="card" style={{marginBottom:18}}>
              <ST>Monthly Usage</ST>
              <div className="grid2" style={{gap:16}}>
                {[
                  ["WhatsApp Messages", usage.waSent||0,    usage.limits?.waMessagesPerMonth||500,   "#25D366"],
                  ["Emails Sent",       usage.emailsSent||0,usage.limits?.emailsPerMonth||1000,      "#f59e0b"],
                  ["SMS Sent",          usage.smsSent||0,   usage.limits?.smsPerMonth||0,            "#00d4ff"],
                  ["Contacts",          usage.contacts||0,  usage.limits?.contacts||500,             "#7c3aed"],
                ].map(([label, used, limit, color]) => (
                  <div key={label}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                      <span style={{color:"#4a5f7a"}}>{label}</span>
                      <span style={{fontWeight:700,color}}>{fmt(used)} / {fmt(limit)}</span>
                    </div>
                    <PBar v={limit ? Math.round(used/limit*100) : 0} color={color}/>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Plan cards */}
          <div className="grid4" style={{marginBottom:18}}>
            {plans.map(plan => {
              const isCurrent = plan.key === currentPlan;
              const color     = PLAN_COLORS[plan.key] || "#00d4ff";
              return (
                <div key={plan.key} className="card" style={{
                  border:`1px solid ${isCurrent ? color : "#1c2645"}`,
                  background: isCurrent ? `${color}08` : undefined,
                  position:"relative"
                }}>
                  {isCurrent && (
                    <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",
                      background:color,color:"#fff",fontSize:10,fontWeight:700,padding:"2px 10px",
                      borderRadius:20}}>CURRENT</div>
                  )}
                  <div style={{fontSize:16,fontWeight:800,textTransform:"capitalize",color,marginBottom:4}}>{plan.name}</div>
                  <div style={{fontSize:24,fontWeight:800,marginBottom:12}}>
                    {plan.price === 0 ? "Free" : `$${plan.price}`}
                    {plan.price > 0 && <span style={{fontSize:12,color:"#4a5f7a"}}>/mo</span>}
                  </div>
                  <div style={{fontSize:11,color:"#4a5f7a",marginBottom:16,lineHeight:1.8}}>
                    {fmt(plan.limits.contacts)} contacts<br/>
                    {fmt(plan.limits.emailsPerMonth)} emails/mo<br/>
                    {fmt(plan.limits.waMessagesPerMonth)} WA msgs/mo<br/>
                    {plan.limits.teamMembers} team member{plan.limits.teamMembers!==1?"s":""}
                  </div>
                  {!isCurrent && plan.price > 0 && (
                    <button className="btn bp" style={{width:"100%",fontSize:12}}
                      onClick={() => upgrade(plan.key)}>
                      Upgrade →
                    </button>
                  )}
                  {isCurrent && (
                    <button className="btn bg" style={{width:"100%",fontSize:12}}
                      onClick={async()=>{
                        try {
                          const r = await api.post("/saas/billing-portal", {});
                          if(r.data?.url) window.location.href = r.data.url;
                        } catch(e){ notify(e.message,"error"); }
                      }}>
                      Manage Billing
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Billing actions */}
          <div className="card">
            <ST>Billing Portal</ST>
            <p style={{fontSize:13,color:"#4a5f7a",marginBottom:14}}>
              View invoices, update payment method, download receipts, or cancel subscription via Stripe.
            </p>
            <button className="btn bg" onClick={async()=>{
              try {
                const r = await api.post("/saas/billing-portal", {});
                if(r.data?.url) window.location.href = r.data.url;
                else notify("No billing portal configured — add Stripe keys to .env", "error");
              } catch(e){ notify(e.message,"error"); }
            }}>
              Open Stripe Billing Portal ↗
            </button>
          </div>
        </>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// SEARCH BAR — unified full-text search across all data
// ═══════════════════════════════════════════════════════════
function SearchBar({ notify, setTab }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [suggest, setSuggest] = useState([]);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  const search = useCallback(async (q) => {
    if (!q || q.trim().length < 2) { setResults(null); return; }
    setLoading(true);
    try {
      const res = await api.get(`/search?q=${encodeURIComponent(q)}&limit=8`);
      setResults(res.data);
    } catch { setResults(null); }
    setLoading(false);
  }, []);

  const suggest_ = useCallback(async (q) => {
    if (!q || q.length < 1) { setSuggest([]); return; }
    try {
      const res = await api.get(`/search/suggest?q=${encodeURIComponent(q)}`);
      setSuggest(res.data || []);
    } catch {}
  }, []);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      suggest_(q);
      if (q.length >= 2) search(q);
      else setResults(null);
    }, 280);
  };

  const clear = () => { setQuery(""); setResults(null); setSuggest([]); inputRef.current?.blur(); setFocused(false); };

  const total = results
    ? (results.contacts?.length || 0) + (results.campaigns?.length || 0) + (results.messages?.length || 0) + (results.templates?.length || 0)
    : 0;

  return (
    <div style={{position:"relative",marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",gap:8,background:C.surface,
        border:`1px solid ${focused ? C.accent : C.border}`,borderRadius:10,
        padding:"8px 14px",transition:"border-color .2s"}}>
        <span style={{fontSize:14,color:C.muted}}>{loading ? <Spinner size={12}/> : "🔍"}</span>
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          onKeyDown={e => e.key === "Escape" && clear()}
          placeholder="Search contacts, campaigns, messages…"
          style={{flex:1,background:"none",border:"none",outline:"none",
            color:C.text,fontSize:13,fontFamily:"'Syne',sans-serif"}}
        />
        {query && (
          <button onClick={clear} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>
        )}
        {!query && <span style={{fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>⌘K</span>}
      </div>

      {/* Dropdown results */}
      {focused && (query.length >= 1) && (
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:1000,marginTop:4,
          background:C.card,border:`1px solid ${C.border}`,borderRadius:10,
          boxShadow:"0 8px 32px rgba(0,0,0,.4)",maxHeight:420,overflowY:"auto"}}>

          {/* Typeahead suggestions (before search completes) */}
          {!results && suggest.length > 0 && (
            <div style={{padding:8}}>
              <div style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:1,padding:"4px 8px",textTransform:"uppercase"}}>Contacts</div>
              {suggest.map((s,i) => (
                <div key={i} onClick={() => { setTab("contacts"); clear(); }}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",
                    borderRadius:8,cursor:"pointer"}}
                  onMouseEnter={e => e.currentTarget.style.background=C.surface}
                  onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                  <span style={{fontSize:16}}>👤</span>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>{s.label}</div>
                    <div style={{fontSize:11,color:C.muted}}>{s.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Full search results */}
          {results && total === 0 && (
            <div style={{padding:24,textAlign:"center",color:C.muted,fontSize:13}}>
              No results for "{query}"
            </div>
          )}
          {results && total > 0 && (
            <div style={{padding:8}}>
              {[
                {key:"contacts",   icon:"👥", label:"Contacts",  tab:"contacts",  nameKey:"name",   subFn: c => c.email || c.phone},
                {key:"campaigns",  icon:"📊", label:"Campaigns", tab:"analytics", nameKey:"name",   subFn: c => `${c.type} · ${c.status}`},
                {key:"messages",   icon:"✉️", label:"Messages",  tab:"inbox",     nameKey:"subject",subFn: c => `${c.platform} · ${c.to}`},
                {key:"templates",  icon:"📝", label:"Templates", tab:"api",       nameKey:"name",   subFn: c => `${c.platform} · ${c.category}`},
              ].map(({ key, icon, label, tab: destTab, nameKey, subFn }) => {
                const items = results[key];
                if (!items?.length) return null;
                return (
                  <div key={key}>
                    <div style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:1,padding:"6px 10px 2px",textTransform:"uppercase"}}>
                      {icon} {label} ({items.length})
                    </div>
                    {items.slice(0, 4).map((item, i) => (
                      <div key={i} onClick={() => { setTab(destTab); clear(); }}
                        style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",
                          borderRadius:8,cursor:"pointer"}}
                        onMouseEnter={e => e.currentTarget.style.background=C.surface}
                        onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                        <span style={{fontSize:15}}>{icon}</span>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item[nameKey] || "—"}</div>
                          <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{subFn(item)}</div>
                        </div>
                      </div>
                    ))}
                    {items.length > 4 && (
                      <div style={{fontSize:11,color:C.accent,padding:"4px 10px",cursor:"pointer"}}
                        onClick={() => { setTab(destTab); clear(); }}>
                        +{items.length - 4} more in {label.toLowerCase()} →
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// FLOW BUILDER TAB — visual drag-and-drop automation canvas
// ═══════════════════════════════════════════════════════════
const STEP_TYPES = {
  email:     { icon:"📧", label:"Email",       color:"#f59e0b", bg:"rgba(245,158,11,.12)" },
  whatsapp:  { icon:"💬", label:"WhatsApp",    color:"#25D366", bg:"rgba(37,211,102,.12)" },
  sms:       { icon:"📱", label:"SMS",         color:"#00d4ff", bg:"rgba(0,212,255,.12)"  },
  telegram:  { icon:"✈️", label:"Telegram",   color:"#2AABEE", bg:"rgba(42,171,238,.12)" },
  wait:      { icon:"⏱️", label:"Wait",       color:"#7c3aed", bg:"rgba(124,58,237,.12)" },
  condition: { icon:"⑂",  label:"Condition",  color:"#f97316", bg:"rgba(249,115,22,.12)" },
  tag:       { icon:"🏷️", label:"Tag",        color:"#10b981", bg:"rgba(16,185,129,.12)" },
  webhook:   { icon:"🔗", label:"Webhook",     color:"#4a5f7a", bg:"rgba(74,95,122,.12)"  },
  end:       { icon:"⏹",  label:"End",        color:"#ef4444", bg:"rgba(239,68,68,.12)"  },
};

function FlowBuilderTab({ notify }) {
  const [sequences, setSequences] = useState([]);
  const [current,   setCurrent]   = useState(null);  // currently open sequence
  const [steps,     setSteps]     = useState([]);
  const [entryStep, setEntryStep] = useState(null);
  const [selected,  setSelected]  = useState(null);  // selected step id
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [dragging,  setDragging]  = useState(null);  // step being dragged
  const [showNew,   setShowNew]   = useState(false);
  const [newName,   setNewName]   = useState("");
  const [templates, setTemplates] = useState([]);
  const canvasRef = useRef(null);

  // Load sequences list
  useEffect(() => {
    api.get("/sequences").then(r => setSequences(r.data || [])).catch(() => {});
    api.get("/sequences/meta/step-templates").then(r => setTemplates(r.data || [])).catch(() => {});
  }, []);

  const openSequence = async (seq) => {
    setLoading(true);
    try {
      const r = await api.get(`/sequences/${seq._id}`);
      setCurrent(r.data);
      setSteps(r.data.steps || []);
      setEntryStep(r.data.entryStep);
      setSelected(null);
    } catch(e) { notify(e.message, "error"); }
    setLoading(false);
  };

  const createNew = async () => {
    if (!newName.trim()) { notify("Enter a name","error"); return; }
    try {
      const r = await api.post("/sequences", { name: newName, steps: [], trigger: { type: "manual" } });
      setSequences(s => [r.data, ...s]);
      setShowNew(false); setNewName("");
      openSequence(r.data);
      notify("✅ Sequence created!");
    } catch(e) { notify(e.message,"error"); }
  };

  const loadTemplate = (tmpl) => {
    setSteps(tmpl.steps);
    setEntryStep(tmpl.entryStep);
    notify(`✨ "${tmpl.name}" template loaded — customize and save`);
  };

  const saveSteps = async () => {
    if (!current) return;
    setSaving(true);
    try {
      await api.put(`/sequences/${current._id}/steps`, { steps, entryStep });
      notify("✅ Flow saved!");
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const addStep = (type) => {
    const id  = `s${Date.now()}`;
    const col = steps.length;
    const newStep = {
      id, type,
      label:    STEP_TYPES[type].label,
      position: { x: 80 + col * 180, y: 150 },
      config:   {},
      nextStep: null,
    };
    setSteps(s => {
      // Auto-link: previous last step → new step
      const updated = s.map((st, i) => {
        if (i === s.length - 1 && st.type !== "condition" && st.type !== "end" && !st.nextStep) {
          return { ...st, nextStep: id };
        }
        return st;
      });
      return [...updated, newStep];
    });
    if (!entryStep) setEntryStep(id);
    setSelected(id);
  };

  const removeStep = (id) => {
    setSteps(s => s
      .filter(st => st.id !== id)
      .map(st => ({
        ...st,
        nextStep:  st.nextStep === id  ? null : st.nextStep,
        config: {
          ...st.config,
          truePath:  st.config?.truePath  === id ? null : st.config?.truePath,
          falsePath: st.config?.falsePath === id ? null : st.config?.falsePath,
        },
      }))
    );
    if (entryStep === id) setEntryStep(steps.find(s => s.id !== id)?.id || null);
    if (selected === id) setSelected(null);
  };

  const updateStep = (id, patch) => {
    setSteps(s => s.map(st => st.id === id ? { ...st, ...patch, config: { ...st.config, ...(patch.config||{}) } } : st));
  };

  const handleDragStart = (e, id) => {
    setDragging(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (e) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x    = e.clientX - rect.left - 60;
    const y    = e.clientY - rect.top  - 20;
    updateStep(dragging, { position: { x: Math.max(8, x), y: Math.max(8, y) } });
    setDragging(null);
  };

  const selectedStep = steps.find(s => s.id === selected);
  const stepIds      = steps.map(s => s.id);

  // Draw SVG arrows between connected steps
  const arrows = [];
  steps.forEach(st => {
    const from = st.position;
    if (st.type === "condition") {
      if (st.config?.truePath) {
        const to = steps.find(s => s.id === st.config.truePath)?.position;
        if (to) arrows.push({ from, to, label:"Yes", color:"#10b981" });
      }
      if (st.config?.falsePath) {
        const to = steps.find(s => s.id === st.config.falsePath)?.position;
        if (to) arrows.push({ from, to, label:"No",  color:"#ef4444" });
      }
    } else if (st.nextStep) {
      const to = steps.find(s => s.id === st.nextStep)?.position;
      if (to) arrows.push({ from, to, label:"",   color:"#4a5f7a" });
    }
  });

  const CARD_W = 120;
  const CARD_H = 48;

  if (!current) {
    return (
      <div className="anim">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div>
            <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>Flow Builder 🔀</h1>
            <p style={{color:C.muted,fontSize:14}}>Visual drag-and-drop automation sequences</p>
          </div>
          <button className="btn bp" onClick={() => setShowNew(true)}>+ New Sequence</button>
        </div>

        {showNew && (
          <div className="card" style={{marginBottom:18,border:`1px solid ${C.accent}44`}}>
            <ST>New Sequence</ST>
            <div style={{display:"flex",gap:10}}>
              <input className="inp" style={{flex:1}} value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key==="Enter" && createNew()}
                placeholder="e.g. Lead Nurture 5-Step, Onboarding Flow…"/>
              <ActionBtn onClick={createNew} variant="bp" style={{flexShrink:0}}>Create</ActionBtn>
              <button className="btn bg" onClick={() => setShowNew(false)}>Cancel</button>
            </div>

            {templates.length > 0 && (
              <div style={{marginTop:16}}>
                <div style={{fontSize:12,color:C.muted,marginBottom:10,fontWeight:700}}>OR START FROM A TEMPLATE</div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  {templates.map((t,i) => (
                    <button key={i} className="btn bg" style={{fontSize:12,textAlign:"left"}}
                      onClick={async () => {
                        const name = newName || t.name;
                        try {
                          const r = await api.post("/sequences", { name, steps: t.steps, entryStep: t.entryStep, trigger: { type: "manual" } });
                          setSequences(s => [r.data, ...s]);
                          setShowNew(false); setNewName("");
                          openSequence(r.data);
                          notify(`✨ "${t.name}" loaded!`);
                        } catch(e) { notify(e.message,"error"); }
                      }}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
          {sequences.length === 0 ? (
            <div className="card" style={{textAlign:"center",padding:60,gridColumn:"1/-1"}}>
              <div style={{fontSize:52,marginBottom:16}}>🔀</div>
              <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>No automation flows yet</div>
              <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Build multi-step drip sequences with email, WhatsApp, SMS, conditions and delays</div>
              <button className="btn bp" onClick={() => setShowNew(true)}>Create Your First Flow</button>
            </div>
          ) : sequences.map((seq,i) => (
            <div key={i} className="card" style={{cursor:"pointer"}}
              onMouseEnter={e => e.currentTarget.style.borderColor=C.accent}
              onMouseLeave={e => e.currentTarget.style.borderColor=C.border}
              onClick={() => openSequence(seq)}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <div style={{fontSize:15,fontWeight:700}}>{seq.name}</div>
                <Badge label={seq.isActive ? "Active" : "Draft"} color={seq.isActive ? C.accent3 : C.muted}/>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                {(seq.steps||[]).slice(0,6).map((step,j) => {
                  const def = STEP_TYPES[step.type] || STEP_TYPES.end;
                  return (
                    <span key={j} style={{fontSize:16}} title={step.label||def.label}>{def.icon}</span>
                  );
                })}
                {(seq.steps||[]).length > 6 && <span style={{fontSize:12,color:C.muted}}>+{seq.steps.length-6}</span>}
              </div>
              <div style={{fontSize:11,color:C.muted}}>
                {(seq.steps||[]).length} steps · trigger: {seq.trigger?.type||"manual"}
              </div>
              <div style={{display:"flex",gap:8,marginTop:12}}>
                <button className="btn bg" style={{fontSize:11,flex:1}} onClick={e => { e.stopPropagation(); openSequence(seq); }}>✏️ Edit</button>
                <button className="btn bg" style={{fontSize:11}} onClick={async e => {
                  e.stopPropagation();
                  try {
                    await api.post(`/sequences/${seq._id}/${seq.isActive?"deactivate":"activate"}`);
                    setSequences(s => s.map(x => x._id===seq._id ? {...x, isActive:!x.isActive} : x));
                    notify(seq.isActive ? "Sequence deactivated" : "✅ Sequence activated!");
                  } catch(e2){ notify(e2.message,"error"); }
                }}>{seq.isActive ? "⏸ Pause" : "▶ Activate"}</button>
                <button className="btn bd" style={{fontSize:11}} onClick={async e => {
                  e.stopPropagation();
                  if (!confirm(`Delete "${seq.name}"?`)) return;
                  try {
                    await api.delete(`/sequences/${seq._id}`);
                    setSequences(s => s.filter(x => x._id!==seq._id));
                    notify("Deleted");
                  } catch(e2){ notify(e2.message,"error"); }
                }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="anim" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 80px)"}}>
      {/* Toolbar */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"0 0 14px",borderBottom:`1px solid ${C.border}`,flexShrink:0,flexWrap:"wrap"}}>
        <button className="btn bg" style={{fontSize:12}} onClick={() => setCurrent(null)}>← Sequences</button>
        <div style={{fontSize:16,fontWeight:700,flex:1}}>{current.name}</div>
        <Badge label={current.isActive ? "Active" : "Draft"} color={current.isActive ? C.accent3 : C.muted}/>
        <button className="btn bg" style={{fontSize:12}} onClick={async () => {
          try {
            await api.post(`/sequences/${current._id}/${current.isActive?"deactivate":"activate"}`);
            setCurrent(c => ({...c, isActive: !c.isActive}));
            notify(current.isActive ? "Paused" : "✅ Activated!");
          } catch(e) { notify(e.message,"error"); }
        }}>{current.isActive ? "⏸ Pause" : "▶ Activate"}</button>
        <ActionBtn onClick={saveSteps} loading={saving} variant="bp" style={{fontSize:12}}>💾 Save Flow</ActionBtn>
      </div>

      <div style={{display:"flex",flex:1,minHeight:0,gap:0}}>
        {/* Left panel — node palette */}
        <div style={{width:140,borderRight:`1px solid ${C.border}`,padding:12,flexShrink:0,overflowY:"auto"}}>
          <div style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:1,marginBottom:10}}>ADD STEP</div>
          {Object.entries(STEP_TYPES).map(([type, def]) => (
            <button key={type} onClick={() => addStep(type)}
              style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"7px 8px",
                background:def.bg,border:`1px solid ${def.color}44`,borderRadius:8,
                cursor:"pointer",marginBottom:6,color:def.color,fontSize:12,fontWeight:600,
                fontFamily:"'Syne',sans-serif"}}>
              <span style={{fontSize:16}}>{def.icon}</span>{def.label}
            </button>
          ))}
          <div style={{fontSize:10,color:C.muted,fontWeight:700,letterSpacing:1,margin:"16px 0 10px"}}>TEMPLATES</div>
          {templates.map((t,i) => (
            <button key={i} onClick={() => loadTemplate(t)}
              style={{display:"block",width:"100%",padding:"6px 8px",background:C.surface,
                border:`1px solid ${C.border}`,borderRadius:6,cursor:"pointer",marginBottom:4,
                color:C.text,fontSize:11,fontFamily:"'Syne',sans-serif",textAlign:"left"}}>
              {t.name}
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div ref={canvasRef} style={{flex:1,position:"relative",overflow:"auto",background:C.bg,
          backgroundImage:`radial-gradient(${C.border}55 1px, transparent 1px)`,
          backgroundSize:"24px 24px"}}
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={e => { if (e.target === canvasRef.current) setSelected(null); }}>

          {/* SVG arrows */}
          <svg style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:1}}>
            {arrows.map((a,i) => {
              const x1 = a.from.x + CARD_W;
              const y1 = a.from.y + CARD_H/2;
              const x2 = a.to.x;
              const y2 = a.to.y + CARD_H/2;
              const mx = (x1+x2)/2;
              return (
                <g key={i}>
                  <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                    stroke={a.color} strokeWidth={2} fill="none" strokeDasharray={a.label?"":undefined}
                    markerEnd={`url(#arrow-${i})`}/>
                  <defs>
                    <marker id={`arrow-${i}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                      <path d="M0,0 L0,6 L8,3 z" fill={a.color}/>
                    </marker>
                  </defs>
                  {a.label && (
                    <text x={mx} y={(y1+y2)/2-6} textAnchor="middle" fill={a.color} fontSize="10" fontWeight="700">{a.label}</text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Step cards */}
          {steps.map(step => {
            const def     = STEP_TYPES[step.type] || STEP_TYPES.end;
            const isEntry = step.id === entryStep;
            const isSel   = step.id === selected;
            return (
              <div key={step.id}
                draggable
                onDragStart={e => handleDragStart(e, step.id)}
                onClick={e => { e.stopPropagation(); setSelected(step.id); }}
                style={{
                  position:"absolute",
                  left: step.position?.x || 80,
                  top:  step.position?.y || 100,
                  width: CARD_W, zIndex: 2,
                  background: C.card,
                  border:`2px solid ${isSel ? C.accent : def.color}`,
                  borderRadius:10, padding:"8px 10px",
                  cursor:"grab", userSelect:"none",
                  boxShadow: isSel ? `0 0 0 3px ${C.accent}44` : "none",
                }}>
                {isEntry && (
                  <div style={{position:"absolute",top:-18,left:0,fontSize:9,color:C.accent,fontWeight:700}}>ENTRY</div>
                )}
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                  <span style={{fontSize:16}}>{def.icon}</span>
                  <span style={{fontSize:11,fontWeight:700,color:def.color,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{step.label||def.label}</span>
                </div>
                {step.config?.body && (
                  <div style={{fontSize:9,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{step.config.body.substring(0,32)}…</div>
                )}
                {step.config?.waitDays && (
                  <div style={{fontSize:9,color:C.muted}}>{step.config.waitDays}d wait</div>
                )}
                {step.type==="condition" && (
                  <div style={{fontSize:9,color:C.accent4}}>{step.config?.condition||"condition"}</div>
                )}
                <button onClick={e => { e.stopPropagation(); removeStep(step.id); }}
                  style={{position:"absolute",top:3,right:3,background:"none",border:"none",
                    color:C.muted,cursor:"pointer",fontSize:12,lineHeight:1}}>×</button>
              </div>
            );
          })}

          {steps.length === 0 && (
            <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
              textAlign:"center",color:C.muted,pointerEvents:"none"}}>
              <div style={{fontSize:48,marginBottom:10}}>🔀</div>
              <div style={{fontSize:15,fontWeight:700}}>Drag steps from the left panel</div>
              <div style={{fontSize:12,marginTop:4}}>Or load a template to get started</div>
            </div>
          )}
        </div>

        {/* Right panel — step config */}
        {selectedStep && (
          <div style={{width:260,borderLeft:`1px solid ${C.border}`,padding:14,flexShrink:0,overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700,color:STEP_TYPES[selectedStep.type]?.color}}>
                {STEP_TYPES[selectedStep.type]?.icon} {STEP_TYPES[selectedStep.type]?.label}
              </div>
              <button onClick={() => setSelected(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>×</button>
            </div>

            <div style={{marginBottom:10}}>
              <label>Label</label>
              <input className="inp" value={selectedStep.label||""} onChange={e => updateStep(selectedStep.id, {label:e.target.value})} placeholder="Step label"/>
            </div>

            {["email","whatsapp","sms","telegram"].includes(selectedStep.type) && (<>
              {selectedStep.type === "email" && (
                <div style={{marginBottom:10}}>
                  <label>Subject</label>
                  <input className="inp" value={selectedStep.config?.subject||""} onChange={e => updateStep(selectedStep.id,{config:{subject:e.target.value}})} placeholder="Email subject…"/>
                </div>
              )}
              <div style={{marginBottom:10}}>
                <label>Message Body</label>
                <textarea className="ta" rows={4} value={selectedStep.config?.body||""} onChange={e => updateStep(selectedStep.id,{config:{body:e.target.value}})} placeholder="Hi [name]! Message here… [link]"/>
              </div>
            </>)}

            {selectedStep.type === "wait" && (<>
              <div style={{marginBottom:10}}>
                <label>Wait Days</label>
                <input className="inp" type="number" min={0} value={selectedStep.config?.waitDays||0} onChange={e => updateStep(selectedStep.id,{config:{waitDays:+e.target.value}})}/>
              </div>
              <div style={{marginBottom:10}}>
                <label>Wait Hours</label>
                <input className="inp" type="number" min={0} max={23} value={selectedStep.config?.waitHours||0} onChange={e => updateStep(selectedStep.id,{config:{waitHours:+e.target.value}})}/>
              </div>
              <div style={{marginBottom:10}}>
                <label>Or wait until event</label>
                <select className="sel" value={selectedStep.config?.waitUntil||""} onChange={e => updateStep(selectedStep.id,{config:{waitUntil:e.target.value}})}>
                  <option value="">Fixed time delay</option>
                  <option value="opened">Contact opens email</option>
                  <option value="clicked">Contact clicks link</option>
                  <option value="replied">Contact replies</option>
                </select>
              </div>
            </>)}

            {selectedStep.type === "condition" && (<>
              <div style={{marginBottom:10}}>
                <label>Condition</label>
                <select className="sel" value={selectedStep.config?.condition||""} onChange={e => updateStep(selectedStep.id,{config:{condition:e.target.value}})}>
                  <option value="">Select condition…</option>
                  <option value="opened_email">Opened email</option>
                  <option value="clicked_link">Clicked a link</option>
                  <option value="replied">Replied to message</option>
                  <option value="tag_has">Has tag</option>
                  <option value="score_gte">Score ≥</option>
                </select>
              </div>
              {["tag_has","score_gte"].includes(selectedStep.config?.condition) && (
                <div style={{marginBottom:10}}>
                  <label>Value</label>
                  <input className="inp" value={selectedStep.config?.conditionValue||""} onChange={e => updateStep(selectedStep.id,{config:{conditionValue:e.target.value}})} placeholder={selectedStep.config?.condition==="tag_has"?"tag name":"80"}/>
                </div>
              )}
              <div style={{marginBottom:10}}>
                <label>Yes → go to step ID</label>
                <select className="sel" value={selectedStep.config?.truePath||""} onChange={e => updateStep(selectedStep.id,{config:{truePath:e.target.value}})}>
                  <option value="">Select…</option>
                  {stepIds.filter(id=>id!==selectedStep.id).map(id => <option key={id} value={id}>{steps.find(s=>s.id===id)?.label||id}</option>)}
                </select>
              </div>
              <div style={{marginBottom:10}}>
                <label>No → go to step ID</label>
                <select className="sel" value={selectedStep.config?.falsePath||""} onChange={e => updateStep(selectedStep.id,{config:{falsePath:e.target.value}})}>
                  <option value="">Select…</option>
                  {stepIds.filter(id=>id!==selectedStep.id).map(id => <option key={id} value={id}>{steps.find(s=>s.id===id)?.label||id}</option>)}
                </select>
              </div>
            </>)}

            {selectedStep.type === "tag" && (<>
              <div style={{marginBottom:10}}>
                <label>Add Tags (comma-sep)</label>
                <input className="inp" value={(selectedStep.config?.addTags||[]).join(",")} onChange={e => updateStep(selectedStep.id,{config:{addTags:e.target.value.split(",").map(t=>t.trim()).filter(Boolean)}})} placeholder="vip, interested"/>
              </div>
              <div style={{marginBottom:10}}>
                <label>Remove Tags (comma-sep)</label>
                <input className="inp" value={(selectedStep.config?.removeTags||[]).join(",")} onChange={e => updateStep(selectedStep.id,{config:{removeTags:e.target.value.split(",").map(t=>t.trim()).filter(Boolean)}})} placeholder="cold, unqualified"/>
              </div>
            </>)}

            {selectedStep.type === "webhook" && (
              <div style={{marginBottom:10}}>
                <label>Webhook URL</label>
                <input className="inp" value={selectedStep.config?.webhookUrl||""} onChange={e => updateStep(selectedStep.id,{config:{webhookUrl:e.target.value}})} placeholder="https://your-server.com/webhook"/>
              </div>
            )}

            {!["condition","end"].includes(selectedStep.type) && (
              <div style={{marginBottom:10}}>
                <label>Next Step</label>
                <select className="sel" value={selectedStep.nextStep||""} onChange={e => updateStep(selectedStep.id,{nextStep:e.target.value||null})}>
                  <option value="">End (no next step)</option>
                  {stepIds.filter(id=>id!==selectedStep.id).map(id => <option key={id} value={id}>{steps.find(s=>s.id===id)?.label||id}</option>)}
                </select>
              </div>
            )}

            <div style={{marginBottom:10}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                <input type="checkbox" checked={entryStep===selectedStep.id} onChange={e => e.target.checked && setEntryStep(selectedStep.id)}/>
                Set as entry step
              </label>
            </div>

            <button className="btn bd" style={{width:"100%",fontSize:12,marginTop:8}} onClick={() => removeStep(selectedStep.id)}>
              🗑 Remove this step
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// TRACKING TAB — GA4 + Meta Pixel attribution dashboard
// ═══════════════════════════════════════════════════════════
function TrackingTab({ notify }) {
  const [status,   setStatus]  = useState(null);
  const [report,   setReport]  = useState(null);
  const [period,   setPeriod]  = useState("30d");
  const [loading,  setLoading] = useState(true);
  const [testing,  setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [st, rp] = await Promise.all([
        api.get("/tracking/status"),
        api.get(`/tracking/report/${period}`),
      ]);
      setStatus(st.data);
      setReport(rp.data);
    } catch (e) { notify(e.message, "error"); }
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const runTest = async () => {
    setTesting(true);
    try {
      const r = await api.post("/tracking/test");
      const ga4Ok  = r.data?.ga4?.success;
      const metaOk = r.data?.meta?.success;
      const ga4Skip  = r.data?.ga4?.skipped;
      const metaSkip = r.data?.meta?.skipped;
      if (ga4Ok)   notify("✅ GA4 test event sent successfully!");
      if (metaOk)  notify("✅ Meta Pixel test event sent!");
      if (ga4Skip) notify(`⚠️ GA4 not configured: ${r.data.ga4.hint}`, "error");
      if (metaSkip)notify(`⚠️ Meta not configured: ${r.data.meta.hint}`, "error");
    } catch(e) { notify(e.message, "error"); }
    setTesting(false);
  };

  const summary = report?.summary || {};
  const topCampaigns = report?.topCampaigns || [];
  const dailyConversions = report?.dailyConversions || [];

  return (
    <div className="anim">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
        <div>
          <h1 style={{fontSize:28,fontWeight:800,marginBottom:4}}>Tracking & Attribution 📊</h1>
          <p style={{color:C.muted,fontSize:14}}>Google Analytics 4 · Meta Pixel · server-side Conversions API</p>
        </div>
        <div style={{display:"flex",gap:10}}>
          {["7d","30d","90d"].map(r => (
            <button key={r} className={`btn ${period===r?"bp":"bg"}`} style={{fontSize:12}} onClick={() => setPeriod(r)}>{r}</button>
          ))}
          <ActionBtn onClick={runTest} loading={testing} variant="bg" style={{fontSize:12}}>🧪 Test Events</ActionBtn>
        </div>
      </div>

      {loading ? <div style={{textAlign:"center",padding:60}}><Spinner size={32}/></div> : (<>

        {/* Platform status cards */}
        <div className="grid2" style={{marginBottom:20}}>
          {[
            {
              name: "Google Analytics 4",
              icon: "📈",
              configured: status?.ga4?.configured,
              id: status?.ga4?.measurementId || "Not configured",
              hint: "Add GA4_MEASUREMENT_ID + GA4_API_SECRET to .env",
              docs: "https://developers.google.com/analytics/devguides/collection/protocol/ga4",
              color: "#E37400",
            },
            {
              name: "Meta Conversions API",
              icon: "👤",
              configured: status?.meta?.configured,
              id: status?.meta?.pixelId || "Not configured",
              hint: "Add META_PIXEL_ID + META_CAPI_TOKEN to .env",
              docs: "https://developers.facebook.com/docs/marketing-api/conversions-api",
              color: "#1877F2",
            },
          ].map((p,i) => (
            <div key={i} className="card" style={{border:`1px solid ${p.configured ? p.color+"44" : C.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                <div style={{width:44,height:44,borderRadius:12,background:`${p.color}22`,border:`1px solid ${p.color}44`,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{p.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:15}}>{p.name}</div>
                  <div style={{fontSize:11,color:C.muted,fontFamily:"monospace"}}>{p.id}</div>
                </div>
                <Badge label={p.configured ? "Active" : "Not set"} color={p.configured ? C.accent3 : C.muted}/>
              </div>
              {p.configured ? (
                <div style={{fontSize:12,color:C.accent3}}>
                  ✅ Server-side events are being dispatched after every campaign
                </div>
              ) : (
                <>
                  <div style={{fontSize:12,color:C.muted,marginBottom:10}}>{p.hint}</div>
                  <div style={{background:C.surface,borderRadius:8,padding:"8px 12px",fontFamily:"monospace",fontSize:11,color:C.accent}}>
                    {p.name.includes("Google") ? "GA4_MEASUREMENT_ID=G-XXXXXX\nGA4_API_SECRET=your_secret" : "META_PIXEL_ID=123456789\nMETA_CAPI_TOKEN=your_token"}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Conversion metrics */}
        <div className="grid4" style={{marginBottom:20}}>
          {[
            {label:"Conversions",      value:summary.total||0,               color:C.accent3,  icon:"✅"},
            {label:"Revenue",          value:`$${(summary.revenue||0).toFixed(2)}`, color:C.accent4, icon:"💰"},
            {label:"Avg Order Value",  value:`$${summary.avgRevenue||0}`,    color:C.accent,   icon:"📊"},
            {label:"Top Campaign",     value:topCampaigns[0]?.name?.substring(0,14)||"—", color:C.accent2, icon:"🏆"},
          ].map((s,i) => <Stat key={i} {...s}/>)}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:18}}>
          {/* Daily conversion chart */}
          {dailyConversions.length > 0 && (
            <div className="card">
              <ST>Daily Conversions ({period})</ST>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={dailyConversions}>
                  <defs>
                    <linearGradient id="gCv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.accent3} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={C.accent3} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                  <XAxis dataKey="_id" tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12}}/>
                  <Area type="monotone" dataKey="count" stroke={C.accent3} fill="url(#gCv)" name="Conversions" strokeWidth={2}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top campaigns by conversion */}
          <div className="card">
            <ST>Top Campaigns by Conversion</ST>
            {topCampaigns.length === 0 ? (
              <div style={{color:C.muted,fontSize:13,padding:"20px 0",textAlign:"center"}}>
                <div style={{fontSize:32,marginBottom:8}}>📊</div>
                No conversions tracked yet.<br/>
                <span style={{fontSize:11}}>Use POST /tracking/conversion to record them.</span>
              </div>
            ) : topCampaigns.map((c,i) => (
              <div key={i} style={{padding:"10px 0",borderBottom:`1px solid ${C.border}22`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"60%"}}>{c.name||"Unknown"}</div>
                  <div style={{fontSize:12,color:C.accent3,fontWeight:700}}>{c.conversions} conv.</div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted}}>
                  <Badge label={c.type||"—"} color={C.accent}/>
                  <span style={{color:C.accent4,fontWeight:700}}>${(c.revenue||0).toFixed(2)}</span>
                </div>
                <div style={{marginTop:6}}>
                  <PBar v={topCampaigns[0]?.conversions ? c.conversions/topCampaigns[0].conversions*100 : 0} color={C.accent3}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Setup guide */}
        <div className="card" style={{marginTop:18}}>
          <ST>Setup Guide</ST>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {[
              {
                title: "1. Get GA4 credentials",
                steps: [
                  "Open Google Analytics → Admin → Data Streams",
                  "Select your web data stream",
                  "Click 'Measurement Protocol API Secrets'",
                  "Create a new secret — copy the value",
                  "Also copy your Measurement ID (G-XXXXXX)",
                ]
              },
              {
                title: "2. Get Meta Conversions API token",
                steps: [
                  "Open Facebook Events Manager",
                  "Select your Pixel → Settings tab",
                  "Find 'Conversions API' section",
                  "Click 'Generate Access Token'",
                  "Copy your Pixel ID and the token",
                ]
              },
              {
                title: "3. Add to .env",
                steps: [
                  "GA4_MEASUREMENT_ID=G-XXXXXXXXXX",
                  "GA4_API_SECRET=your_secret_here",
                  "META_PIXEL_ID=your_pixel_id",
                  "META_CAPI_TOKEN=your_capi_token",
                  "Restart server: npm run dev:all",
                ]
              },
              {
                title: "4. Verify with test event",
                steps: [
                  "Click '🧪 Test Events' button above",
                  "GA4: check Realtime report in Analytics",
                  "Meta: check 'Test Events' tab in Events Manager",
                  "Events fire automatically on campaign completion",
                  "Use POST /tracking/conversion for manual events",
                ]
              },
            ].map((section,i) => (
              <div key={i}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:8,color:C.accent}}>{section.title}</div>
                <ol style={{paddingLeft:16}}>
                  {section.steps.map((step,j) => (
                    <li key={j} style={{fontSize:12,marginBottom:4,lineHeight:1.6,
                      fontFamily: step.includes('=') ? "monospace" : undefined,
                      color: step.includes('=') ? C.accent3 : C.muted}}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>

        {/* UTM builder */}
        <div className="card" style={{marginTop:18}}>
          <ST>UTM URL Builder</ST>
          <UTMBuilder notify={notify}/>
        </div>
      </>)}
    </div>
  );
}

function UTMBuilder({ notify }) {
  const [url,      setUrl]      = useState("");
  const [medium,   setMedium]   = useState("whatsapp");
  const [campaign, setCampaign] = useState("");
  const [content,  setContent]  = useState("");
  const [result,   setResult]   = useState("");

  const build = async () => {
    if (!url) { notify("Enter a URL", "error"); return; }
    try {
      const r = await api.post("/tracking/utm/build", { url, source: "autoflow", medium, campaign, content });
      setResult(r.data.url);
    } catch(e) { notify(e.message, "error"); }
  };

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10,marginBottom:12}}>
        <div><label>Destination URL</label><input className="inp" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://yoursite.com/landing"/></div>
        <div><label>Medium</label>
          <select className="sel" value={medium} onChange={e=>setMedium(e.target.value)}>
            {["whatsapp","email","sms","instagram","facebook","twitter","telegram","linkedin","tiktok"].map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div><label>Campaign</label><input className="inp" value={campaign} onChange={e=>setCampaign(e.target.value)} placeholder="diwali-sale"/></div>
        <div><label>Content</label><input className="inp" value={content} onChange={e=>setContent(e.target.value)} placeholder="variant-a"/></div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button className="btn bp" style={{flexShrink:0}} onClick={build}>Build UTM URL</button>
        {result && (
          <div style={{flex:1,background:C.surface,borderRadius:8,padding:"9px 14px",fontSize:12,color:C.accent3,
            fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {result}
          </div>
        )}
        {result && (
          <button className="btn bg" style={{flexShrink:0,fontSize:12}}
            onClick={() => { navigator.clipboard?.writeText(result); notify("📋 Copied!"); }}>Copy</button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP — wires everything together
// ═══════════════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen] = useState("login");
  const [tab,    setTab]    = useState("dashboard");
  const [user,   setUser]   = useState(null);
  const [notif,  setNotif]  = useState(null);
  const [dark,        setDark]       = useState(() => localStorage.getItem("af_theme") !== "light");
  const [lang,        setLang]       = useState(() => { const l=localStorage.getItem("af_lang")||"en"; _lang=l; return l; });
  const [sidebarOpen, setSidebarOpen]= useState(false);

  // Keep module-level _lang in sync (t() reads it)
  _lang = lang;

  // Apply theme globally — components read the C variable
  C = dark ? DARK : LIGHT;

  // Close sidebar when tab changes on mobile
  const handleTabChange = (newTab) => { setTab(newTab); setSidebarOpen(false); };
  useEffect(() => {
    localStorage.setItem("af_theme", dark ? "dark" : "light");
    document.body.style.background = C.bg;
    document.body.style.color      = C.text;
  }, [dark]);

  // Restore session on reload + register PWA service worker
  useEffect(() => {
    const token = sessionStorage.getItem("af_token");
    const u     = sessionStorage.getItem("af_user");
    if (token && u) {
      try { setUser(JSON.parse(u)); setScreen("main"); } catch {}
    }

    // Register service worker (PWA)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then(reg => console.log("[AutoFlow SW] registered:", reg.scope))
        .catch(err => console.warn("[AutoFlow SW] failed:", err.message));
    }
  }, []);

  // Request push permission once user is logged in
  useEffect(() => {
    if (screen !== "main") return;
    const autoRequestPush = async () => {
      try {
        const vapidRes = await api.get("/settings/push/vapid-key");
        if (!vapidRes.configured) return;                          // no VAPID keys on server
        if (Notification.permission === "denied") return;          // user already denied
        if (Notification.permission === "granted") return;         // already granted
        // Ask after 3s so it doesn't interrupt login flow
        setTimeout(async () => {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") return;
          const reg  = await navigator.serviceWorker.ready;
          const sub  = await reg.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: vapidRes.publicKey,
          });
          await api.post("/settings/push/subscribe", {
            endpoint: sub.endpoint,
            keys:     { p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")))),
                        auth:   btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")))) },
          });
          console.log("[AutoFlow] Push notifications enabled");
        }, 3000);
      } catch {}
    };
    autoRequestPush();
  }, [screen]);

  const token  = getToken();
  const socket = useSocket(screen === "main" ? token : null);

  const notify = (msg, type = "success") => {
    setNotif({msg,type});
    setTimeout(() => setNotif(null), 3500);
  };

  // Listen for proxy alerts globally
  useEffect(() => {
    if (!socket) return;
    const u1 = socket.on("proxy:down",         d => notify(`⚠️ Proxy ${d.host} is DOWN!`, "error"));
    const u2 = socket.on("proxy:auto-rotated", d => notify(`↻ Proxy rotated for ${d.platform}`));
    return () => { u1(); u2(); };
  }, [socket]);

  const logout = () => {
    sessionStorage.clear();
    setUser(null); setScreen("login"); setTab("dashboard");
  };

  if (screen === "login") return (
    <>
      <style>{CSS}</style>
      <LoginScreen onLogin={u => { setUser(u); setScreen("main"); }}/>
      {notif && <div className="notif" style={{background:notif.type==="error"?"#1a0707":"#071a10",border:`1px solid ${notif.type==="error"?C.danger:C.accent3}`,color:notif.type==="error"?C.danger:C.accent3}}>{notif.msg}</div>}
    </>
  );

  const tabProps = { notify, socket, setTab: handleTabChange };

  return (
    <>
      <style>{CSS}</style>
      {notif && (
        <div className="notif" style={{background:notif.type==="error"?"#1a0707":"#071a10",
          border:`1px solid ${notif.type==="error"?C.danger:C.accent3}`,
          color:notif.type==="error"?C.danger:C.accent3}}>
          {notif.msg}
        </div>
      )}
      <div style={{display:"flex",minHeight:"100vh",background:C.bg}}>
        {/* Mobile overlay — tapping it closes sidebar */}
        {sidebarOpen && (
          <div className="mobile-overlay" onClick={() => setSidebarOpen(false)} style={{display:"none"}}/>
        )}

        <Sidebar
          tab={tab} setTab={handleTabChange} user={user}
          wsConnected={socket.connected} dark={dark} setDark={setDark}
          lang={lang} setLang={setLang}
          sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
        />

        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>
          {/* Mobile top bar */}
          <div className="mobile-topbar" style={{
            display:"none",
            "--topbar-bg":   C.surface,
            "--topbar-border": C.border,
          }}>
            <button onClick={() => setSidebarOpen(s => !s)} style={{
              background:"none",border:`1px solid ${C.border}`,borderRadius:8,
              color:C.text,cursor:"pointer",padding:"6px 10px",fontSize:18,lineHeight:1,
            }}>☰</button>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:28,height:28,borderRadius:8,background:`linear-gradient(135deg,${C.accent},${C.accent2})`,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>⚡</div>
              <span style={{fontWeight:800,fontSize:14}}>AutoFlow Pro</span>
            </div>
            <button onClick={logout} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"'Syne',sans-serif"}}>Out</button>
          </div>

          <main style={{flex:1,overflowY:"auto",padding:28,minWidth:0}}>
          <SearchBar notify={notify} setTab={handleTabChange}/>
          <ErrorBoundary key={tab}>
          {tab==="dashboard"  && <DashboardTab  {...tabProps} setTab={setTab}/>}
          {tab==="platforms"  && <PlatformsTab  {...tabProps} setTab={setTab}/>}
          {tab==="composer"   && <ComposerTab   {...tabProps}/>}
          {tab==="scheduler"  && <SchedulerTab  {...tabProps}/>}
          {tab==="scraper"    && <ScraperTab    {...tabProps}/>}
          {tab==="whatsapp"   && <WhatsAppTab   {...tabProps}/>}
          {tab==="email"      && <EmailTab      {...tabProps}/>}
          {tab==="sms"        && <SMSTab        {...tabProps}/>}
          {tab==="contacts"   && <ContactsTab   {...tabProps}/>}
          {tab==="accounts"   && <AccountsTab   {...tabProps}/>}
          {tab==="chatbot"    && <ChatbotTab/>}
          {tab==="analytics"  && <AnalyticsTab/>}
          {tab==="security"   && <SecurityTab   {...tabProps}/>}
          {tab==="api"        && <APITab        {...tabProps}/>}
          {tab==="billing"    && <BillingTab     {...tabProps}/>}
          {tab==="flows"      && <FlowBuilderTab  {...tabProps}/>}
          {tab==="tracking"   && <TrackingTab     {...tabProps}/>}
          {tab==="inbox" && <InboxTab {...tabProps}/>}
          {Object.keys(PLATFORM_CONFIGS).includes(tab) && (
            <PlatformTab
              key={tab}
              platform={tab}
              config={PLATFORM_CONFIGS[tab]}
              notify={notify}
            />
          )}
          </ErrorBoundary>
        </main>

        {/* Logout button — desktop only */}
          <button onClick={logout} className="hide-mobile" style={{position:"fixed",bottom:20,right:20,background:C.surface,
            border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 16px",color:C.muted,
            cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"'Syne',sans-serif",zIndex:10}}>
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
