import { deviceKind } from "./wants-markdown";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const DESKTOP_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const DESKTOP_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

console.assert(deviceKind(IPHONE) === "mobile", "device: iPhone UA is mobile");
console.assert(deviceKind(ANDROID) === "mobile", "device: Android UA is mobile");
console.assert(deviceKind(DESKTOP_CHROME) === "desktop", "device: desktop Chrome UA is desktop");
console.assert(deviceKind(DESKTOP_SAFARI) === "desktop", "device: desktop Safari UA is desktop");
console.assert(deviceKind(null) === "desktop", "device: no UA defaults to desktop");
// Sec-CH-UA-Mobile wins even over a UA an override forged in the other direction.
console.assert(
  deviceKind(DESKTOP_CHROME, { get: (n) => (n === "sec-ch-ua-mobile" ? "?1" : null) }) === "mobile",
  "device: Sec-CH-UA-Mobile overrides a desktop-shaped UA",
);
console.assert(
  deviceKind(ANDROID, { get: (n) => (n === "sec-ch-ua-mobile" ? "?0" : null) }) === "desktop",
  "device: Sec-CH-UA-Mobile ?0 overrides a mobile-shaped UA",
);

// A sample from deviceatlas.com/blog/list-of-user-agent-strings, one real UA
// per device family, to check the regex against actual traffic shapes rather
// than hand-written strings.
const GALAXY_TAB_S8_ULTRA =
  "Mozilla/5.0 (Linux; Android 12; SM-X906C Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/80.0.3987.119 Mobile Safari/537.36";
const YOGA_TAB_11_NO_MOBILE_TOKEN = // Android tablet Chrome UAs sometimes drop "Mobile" entirely
  "Mozilla/5.0 (Linux; Android 11; Lenovo YT-J706X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36";
const IPAD_PRO_INAPP_WEBVIEW = // native-app WebView on iPad — reports honestly, unlike Safari's default
  "Mozilla/5.0 (iPad16,3; CPU OS 18_3_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Tropicana_NJ/5.7.1";
const WIN10_EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0";
const CHROME_OS = "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

console.assert(deviceKind(GALAXY_TAB_S8_ULTRA) === "mobile", "device: Android tablet is mobile");
console.assert(deviceKind(YOGA_TAB_11_NO_MOBILE_TOKEN) === "mobile", "device: Android tablet with no Mobile token is still mobile, on Android alone");
console.assert(deviceKind(IPAD_PRO_INAPP_WEBVIEW) === "mobile", "device: an iPad UA that carries a Mobile token is mobile");
console.assert(deviceKind(WIN10_EDGE) === "desktop", "device: Windows Edge is desktop");
console.assert(deviceKind(CHROME_OS) === "desktop", "device: ChromeOS is desktop");
console.assert(deviceKind(GOOGLEBOT) === "desktop", "device: a crawler UA carries no device signal, defaults desktop");
