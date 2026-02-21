require("dotenv").config();
const { chromium } = require("playwright");
const fs = require("fs");

const MAX_OFFERS_COUNT = 10;
const RENT_SERVER_URL = process.env.RENT_SERVER_URL || "http://localhost:3000";

/**
 * Fetches a rent by link from the rent server.
 * @param {string} link - The offer link to look up.
 * @returns {Promise<object|null>} The rent object if found, null if not found (404).
 * @throws {Error} On network error or non-2xx/404 response.
 */
const getRentByLink = async (link) => {
    const res = await fetch(`${RENT_SERVER_URL}/rents/by-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link }),
    });
    if (res.status === 404) {
        return null;
    }
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Rent server error ${res.status}: ${err}`);
    }
    return res.json();
};

/**
 * Inserts a rent into the rent server.
 * @param {object} data - Rent data.
 * @param {string} data.rent - Rent amount/text (required).
 * @param {string} data.link - Offer URL (required).
 * @param {string} data.title - Title (required).
 * @param {string} data.description - Description (required).
 * @param {string} [data.localization] - Localization.
 * @param {string} [data.fees] - Fees.
 * @param {boolean} [data.pets] - Pets allowed.
 * @param {boolean} [data.balcony_terrace_garden] - Balcony/terrace/garden.
 * @returns {Promise<{id: number, message: string}>} Created rent id and message.
 * @throws {Error} On validation (400) or server error.
 */
const insertRent = async (data) => {
    const res = await fetch(`${RENT_SERVER_URL}/rents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Rent server error ${res.status}: ${err}`);
    }
    return res.json();
};

/**
 * Sends rent listing to the rent server's OpenAI endpoint; returns formatted JSON.
 * @param {object} data - Rent data to process.
 * @param {string} data.rent - Rent amount/text (required).
 * @param {string} data.link - Offer URL (required).
 * @param {string} data.title - Title (required).
 * @param {string} data.description - Description (required).
 * @param {string} [data.localization] - Localization.
 * @returns {Promise<object>} JSON object with keys rent, link, title, localization, description.
 * @throws {Error} On validation (400), server or OpenAI error (5xx).
 */
const processRentWithOpenAI = async (data) => {
    const res = await fetch(`${RENT_SERVER_URL}/openai/rent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Rent server error ${res.status}: ${err}`);
    }
    return res.json();
};

const getLink = async (offer, page) => {
    const offerLink = offer.locator("a").first();
    const href = await offerLink.getAttribute("href");
    if (!href) return null;
    return href.startsWith("http") ? href : new URL(href, page.url()).href;
};

// On Raspberry Pi set CHROMIUM_PATH=/usr/bin/chromium-browser; on Mac leave unset to use Playwright's browser
const chromiumPath = process.env.CHROMIUM_PATH;
const launchOptions = {
    headless: true,
    args: ["--no-sandbox"],
};
if (chromiumPath && fs.existsSync(chromiumPath)) {
    launchOptions.executablePath = chromiumPath;
}

const isOfferAlreadyScraped = async (link) => {
    const rent = await getRentByLink(link);
    return rent !== null;
};

const getOfferDetailContentOtodom = async (browser, detailUrl) => {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'pl-PL',
        extraHTTPHeaders: {
            'Accept-Language': 'pl-PL,pl;q=0.9,en;q=0.8',
        },
    });
    const detailPage = await context.newPage();
    detailPage.setDefaultTimeout(200000);
    await detailPage.goto(detailUrl, { waitUntil: "networkidle" });

    const mainContent = await detailPage.locator('[data-sentry-element="MainContent"]');
    const title = mainContent.locator('[data-cy="adPageAdTitle"]');
    const price = mainContent.locator('[aria-label="Cena"]');
    const mapLink = mainContent.locator('[data-sentry-component="MapLink"]');

    const titleText = await title.innerText();
    const priceText = await price.innerText();
    const mapText = await mapLink.innerText();

    const adDetails = mainContent.locator('[data-sentry-component="AdDetailsBase"]');
    const adDescription = mainContent.locator('[data-sentry-component="AdDescriptionBase"]');

    // Get their content when needed:
    const detailsText = await adDetails.innerText();
    const descriptionText = await adDescription.innerText();


    await detailPage.close();

    return {
        title: titleText,
        price: priceText,
        location: mapText,
        details: `${detailsText} \n\n\n ${descriptionText}`,
    };
};

const getOfferDetailContentOLX = async (browser, detailUrl) => {
    const detailPage = await browser.newPage();
    detailPage.setDefaultTimeout(200000);
    await detailPage.goto(detailUrl, { waitUntil: "domcontentloaded" });

    const header = await detailPage.getByTestId('ad-action-box');
    // const headerText = await header.innerText();

    const title = await header.locator('h4').first();
    const titleText = await title.innerText();

    const price = await header.locator('h3').first();
    const priceText = await price.innerText();

    const main = await detailPage.getByTestId('main');
    const mainText = await main.innerText();

    await detailPage.close();
    return { title: titleText, price: priceText, location: null, details: mainText };
};

(async () => {
    const browser = await chromium.launch(launchOptions);
    const page = await browser.newPage();
    page.setDefaultTimeout(300000);

    await page.goto(
        "https://www.olx.pl/nieruchomosci/mieszkania/wynajem/krakow/?search%5Border%5D=created_at:desc&search%5Bfilter_float_price:from%5D=2000&search%5Bfilter_float_price:to%5D=4000&search%5Bfilter_enum_rooms%5D%5B0%5D=three&search%5Bfilter_enum_rooms%5D%5B1%5D=four"
    );

    await page.getByRole('button', { name: 'Akceptuję' }).click();

    const container = await page.getByTestId('listing-grid');
    const offers = await container.getByTestId('l-card').all();

    for (let i = 0; i < MAX_OFFERS_COUNT; i++) {
        const offer = offers[i];

        const link = await getLink(offer, page);
        if (!link) {
            console.log(i, ' - ', 'No link found');
            continue;
        };

        console.log(i, ' - ', link);

        const isScraped = await isOfferAlreadyScraped(link);
        if (isScraped) {
            console.log(i, ' - ', 'Offer already scraped');
            continue;
        };

        const detailContent = link.includes('otodom') ? await getOfferDetailContentOtodom(browser, link) : await getOfferDetailContentOLX(browser, link);
        console.log(i, ' - ', detailContent.title);

        const openAiData = await processRentWithOpenAI({
            rent: detailContent.price,
            link: link,
            title: detailContent.title,
            description: detailContent.details,
            localization: detailContent.location,
        });

        console.log(openAiData);

        await insertRent({
            ...openAiData,
        });

        console.log(i, ' - ', 'Offer inserted');
    }

    await browser.close();
})();